#!/usr/bin/env python3

"""
多智能体股票分析师框架 - 完整增强版
功能:多角色分析 + 实时数据 + 辩论融合 + 全中文报告
"""
# 若存在 .env 则加载，便于配置 ALPHA_VANTAGE_API_KEY 等（需安装 python-dotenv）
try:
    import os as _os
    _env_path = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), ".env")
    if _os.path.isfile(_env_path):
        from dotenv import load_dotenv
        load_dotenv(_env_path)
except ImportError:
    pass

import json
import os
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field, fields
from datetime import datetime
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None  # type: ignore[misc, assignment]
import markdown

# ==================== 依赖检查 ====================
try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False
    print("⚠️ 未安装 openai 库,将使用模拟模式")

try:
    import akshare as ak
    import pandas as pd
    HAS_AKSHARE = True
except ImportError:
    HAS_AKSHARE = False
    print("⚠️ 未安装 akshare 库,将使用模拟数据")

try:
    import yfinance as yf
    HAS_YFINANCE = True
except ImportError:
    HAS_YFINANCE = False
    print("⚠️ 未安装 yfinance 库,港股/美股将使用模拟数据")

# ==================== 配置中心 ====================
CONFIG = {
    "LLM 配置": {
        "base_url": "http://vllm.tangbuy.cn:8080/v1",
        "api_key": "123456",
        "model": "MiniMax-M2.1-AWQ",
        "temperature": 0.7,
        "max_tokens": 4096
    },
    "输出配置": {
        "语言": "简体中文",
        "禁用英文": True,
        "生成目录": True,
        "图标风格": "emoji"
    },
    "分析配置": {
        "默认分析师": ["市场专家", "成长投资者", "风险分析师", "技术专家"],
        "辩论轮次": 1,
        "历史天数": 90,
        "启用数据增强": True
    },
    "权重配置": {
        "市场专家": 1.2,
        "成长投资者": 1.0,
        "风险分析师": 1.3,
        "技术专家": 1.1,
        "社交舆情": 0.8
    }
}

# 与 Vercel / .env 同源：VLLM_BASE_URL、VLLM_API_KEY、VLLM_MODEL_ID
_llm = CONFIG["LLM 配置"]
if os.environ.get("VLLM_BASE_URL"):
    _llm["base_url"] = os.environ["VLLM_BASE_URL"].strip().rstrip("/")
if os.environ.get("VLLM_API_KEY"):
    _llm["api_key"] = os.environ["VLLM_API_KEY"].strip()
_m_id = os.environ.get("VLLM_MODEL_ID") or os.environ.get("VLLM_MODEL")
if _m_id:
    _llm["model"] = _m_id.strip()

# ==================== 数据结构 ====================
def _fmt_price(p: float) -> str:
    """价格保留 2 位小数"""
    return f"{round(p, 2)}" if p is not None and p == p else "N/A"

def _fmt_pe(pe: Optional[float]) -> str:
    """市盈率保留 2 位小数；None/非正返回 N/A（美股部分标的 yfinance 无 trailingPE 时由调用方用 EPS 推算）"""
    return f"{round(pe, 2)}" if pe is not None and pe == pe and pe > 0 else "N/A"

def _fmt_pb(pb: Optional[float]) -> str:
    """市净率保留 2 位小数，None 返回 N/A"""
    return f"{round(pb, 2)}" if pb is not None and pb == pb and pb > 0 else "N/A"


def _fmt_range_cn(low: float, high: float) -> str:
    """90 日等价格区间：统一为「低～高」，避免模型写成 80100 这类连读"""
    return f"{_fmt_price(low)}～{_fmt_price(high)}"


def _strip_md_headings_with_keywords(
    text: str,
    keywords: Tuple[str, ...],
    *,
    max_passes: int = 8,
) -> str:
    """去掉文首连续的 #/##/### 标题行（标题文本含任一 keyword 时），避免与页面或模板标题重复。"""
    t = (text or "").strip()
    for _ in range(max_passes):
        m = re.match(r"^#{1,3}\s*([^\n]+)\n*", t)
        if not m:
            break
        title = m.group(1).strip()
        if any(kw in title for kw in keywords):
            t = t[m.end() :].lstrip()
            continue
        break
    return t


def _strip_core_conclusion_heading(text: str) -> str:
    """分析师正文：去掉开头的「核心结论」Markdown 标题（卡片顶栏已有角色与投资建议）。"""
    t = (text or "").strip()
    for _ in range(3):
        m = re.match(r"^#{1,3}\s*核心结论\s*[^\n]*\n+", t, re.IGNORECASE)
        if not m:
            break
        t = t[m.end() :].lstrip()
    return t


def _strip_role_data_support_section(text: str) -> str:
    """去掉「本角色数据支撑」整节（至「角色视角分析」之前）。

    与「数据解读」内容高度重复，影响通读；新提示词已禁止单独成节，此处兼容旧模型输出。
    """
    t = (text or "").strip()
    if "本角色数据支撑" not in t:
        return t
    pattern = r"(?m)^#{1,3}\s*本角色数据支撑[^\n]*\n+[\s\S]*?(?=^#{1,3}\s*角色视角分析)"
    out = re.sub(pattern, "", t, count=1, flags=re.MULTILINE)
    return re.sub(r"\n{3,}", "\n\n", out).strip()


def _now_cn() -> datetime:
    """报告、行情时间戳用北京时间，避免 Vercel 等 UTC 环境比国内慢约 8 小时。"""
    if ZoneInfo is not None:
        try:
            return datetime.now(ZoneInfo("Asia/Shanghai"))
        except Exception:
            pass
    return datetime.now()


def _fmt_now_cn() -> str:
    return _now_cn().strftime("%Y 年%m 月%d日 %H:%M")


@dataclass
class StockData:
    """股票数据结构"""
    股票名称:str = ""
    股票代码:str = ""
    所属市场:str = ""
    最新价:float = 0.0
    涨跌幅:str = ""
    总市值:str = ""
    市盈率:Optional[float] = None
    市净率:Optional[float] = None
    九十日均价:float = 0.0
    九十日最高:float = 0.0
    九十日最低:float = 0.0
    波动率:float = 0.0
    数据时间:str = ""
    风险信号:List[str] = field(default_factory=list)
    估值分位:str = ""
    所属板块:str = ""
    技术指标简述:str = ""
    近期市场与板块简述:str = ""
    # 供 LLM 理解业务：yfinance longBusinessSummary / AlphaVantage Description / akshare 主营等
    公司简介:str = ""
    # 多源合并记录，如「akshare → Baostock → 腾讯财经 → yfinance（合并：…）」
    数据溯源:str = ""
    # 表单补充栏粘贴的原文（截断存储；对外展示不强调来源）
    用户备注原文:str = ""
    # 经模型/规则从补充文本提取、未全部并入标准字段的要点（供分析师上下文）
    用户补充指标:str = ""

@dataclass
class AnalystReport:
    """分析师报告"""
    分析师姓名:str
    角色定位:str
    核心分析:str
    投资建议:str  # 积极/观望/谨慎
    置信程度:float  # 0-1
    核心要点:List[str] = field(default_factory=list)
    角色权重:float = 1.0
    数据引用:List[str] = field(default_factory=list)

@dataclass
class DebateRound:
    """辩论轮次"""
    轮次编号:int
    多头观点:str
    空头观点:str
    裁判结论:str
    共识点:List[str] = field(default_factory=list)
    分歧点:List[str] = field(default_factory=list)

@dataclass
class FinalReport:
    """最终报告"""
    分析主题:str
    股票代码:str
    生成时间:str
    数据基准:str
    分析师报告:List[AnalystReport]
    辩论轮次:List[DebateRound]
    融合摘要:str
    最终建议:str
    共识程度:float
    加权得分:float
    核心逻辑链:List[str] = field(default_factory=list)
    风险提示:List[str] = field(default_factory=list)
    操作建议:Dict[str, str] = field(default_factory=dict)
    对比与异动:str = ""  # 相对历史报告的变化与异动信号解读（有历史报告时填充）
    # 补充摘录合并后的盘口、流动性、每股指标等（写入报告「数据快照」扩展区）
    快照补充说明:str = ""
    # 系统计算的区间/波动率/分位/技术指标等 Markdown 表行（与数据基准三列解耦）
    数据快照系统指标表行:str = ""

# ==================== 角色提示词库（增强版） ====================
# 每位分析师只引用与本角色专业直接相关的系统数据；量化事实集中在「数据解读」中写清，不再单独设「本角色数据支撑」以免与摘要重复、篇幅臃肿。
ANALYST_PROMPTS = {
    "市场专家": {
        "角色名称": "市场专家",
        "角色定位": "行业周期与竞争格局分析师",
        "本角色专属数据": "所属板块、总市值、流通市值（若有）、估值分位、九十日区间（趋势与周期位置）、总股本/流通股本（若有，体量与筹码结构）、风险信号中与行业/政策相关项。通用数据如最新价、市盈率仅可在结论中顺带 1 处，不作为你板块的数据支撑重点。",
        "系统提示词": """你是一位资深市场分析师,拥有 15 年以上行业研究经验。

【专业能力】
• 擅长分析行业周期、竞争格局、市场集中度
• 精通波特五力模型、SWOT 分析框架
• 关注政策导向、产业链位置、护城河深度

【分析风格】
• 数据驱动,注重事实依据；只引用与行业/竞争/政策直接相关的数据做深度解读
• 关注中长期趋势,而非短期波动
• 强调竞争壁垒和可持续优势
• 用词专业客观,避免情绪化表达

【输出要求】
• 全程使用简体中文,专业术语需附简要解释
• 禁止出现英文词汇（股票代码除外）
• 按指定结构输出,逻辑清晰;禁止输出思考过程、<think> 或 think 等标签内容
• **禁止**再写「## 本角色数据支撑」小节（与「数据解读」重复）；系统量化事实须在「## 数据解读」内用 3～5 条写清（每条：数据点 + 一句专业解读），须覆盖估值分位、九十日区间或波动率等与板块/市值/政策风险的交叉视角，不得整篇只复述用户备注
• 不要笼统说「趋势混合」「多空交织」，需给出细粒度、可操作的洞察与建议
• 结合该股所属板块、近期大盘与个股走势分析

【分析框架】
1. 行业生命周期判断（导入/成长/成熟/衰退）
2. 竞争格局分析（集中度、主要玩家、进入壁垒）
3. 公司市场地位（份额、排名、变化趋势）
4. 政策环境影响（支持/中性/限制）
5. 中长期增长驱动力""",
        "关注指标": ["行业增速", "市场集中度", "政策导向", "竞争壁垒", "市场份额"],
        "权重系数": 1.2
    },
    "成长投资者": {
        "角色名称": "成长投资者",
        "角色定位": "高增长机会挖掘师",
        "本角色专属数据": "估值分位、九十日区间（空间与弹性）、波动率（成长股波动特征）、每股收益与股息率（若有，用于盈利质量与再投资/回报假设）、风险信号中与增长/新业务相关项。市盈率/市净率仅作为「估值与成长匹配」时引用 1 处，不作为本角色数据支撑的重复项。",
        "系统提示词": """你是一位专注于成长股投资的分析师,擅长发现高增长机会。

【专业能力】
• 擅长分析收入增长、利润增速、市场份额扩张
• 关注第二增长曲线、新业务拓展、国际化进程
• 精通成长股估值方法（PEG、PS 等）

【分析风格】
• 只引用与增长、弹性、估值匹配度直接相关的数据做深度解读
• 关注增长质量和可持续性
• 强调创新能力和扩张潜力
• 乐观但有数据支撑,避免盲目吹捧

【输出要求】
• 全程使用简体中文,专业术语需附简要解释
• 禁止出现英文词汇（股票代码除外）
• 按指定结构输出,逻辑清晰;禁止输出思考过程、<think> 或 think 等标签内容
• **禁止**再写「## 本角色数据支撑」；须在「## 数据解读」内用 3～5 条写清，显式引用系统块中的估值分位、九十日区间、波动率等，并与增长/新业务风险结合（估值与成长是否匹配、区间是否提供弹性等）
• 不要笼统说「趋势混合」，需给出细粒度、可操作的成长与估值洞察
• 区分短期催化和长期逻辑;结合板块与近期走势

【分析框架】
1. 历史增长轨迹（3-5 年营收/利润增速）
2. 增长驱动因素（量/价/新品/新市场）
3. 增长可持续性（市场空间、竞争格局）
4. 估值与成长匹配度（PEG 等指标）
5. 潜在催化剂（产品发布、产能释放等）""",
        "关注指标": ["营收增速", "利润增速", "市场空间", "新业务", "成长估值"],
        "权重系数": 1.0
    },
    "风险分析师": {
        "角色名称": "风险分析师",
        "角色定位": "风险识别与安全边际评估师",
        "本角色专属数据": "风险信号（全文）、波动率、九十日最高/最低（安全边际与回撤空间）、估值分位、市净率（资产质量）、换手率与成交量/成交额（若有，流动性冲击、异常放量缩量）、52周高低位置（若有，贴近边界的尾部风险）。最新价/市盈率仅可在结论中顺带 1 处，不作为本角色数据支撑的重复项。",
        "系统提示词": """你是一位保守型风险分析师,擅长识别潜在风险和陷阱。

【专业能力】
• 擅长识别下行风险、财务隐患、治理问题
• 关注现金流质量、负债结构、商誉风险
• 精通安全边际计算和情景分析

【分析风格】
• 只引用与风险、安全边际、波动、估值下行空间直接相关的数据做深度解读
• 关注最坏情况下的损失空间
• 强调风险收益比和下行保护
• 谨慎保守,善于质疑和验证

【输出要求】
• 全程使用简体中文,专业术语需附简要解释
• 禁止出现英文词汇（股票代码除外）
• 按指定结构输出,逻辑清晰;禁止输出思考过程、<think> 或 think 等标签内容
• **禁止**再写「## 本角色数据支撑」；须在「## 数据解读」内用 3～5 条写清，引用系统块的波动率、九十日区间上下沿、估值分位、市净率与风险信号（安全边际、下行空间等）
• 风险需量化（概率×影响）;不要笼统说「风险可控」，需给出细粒度、可验证的风险点与应对
• 结合板块与市场环境

【分析框架】
1. 财务风险（负债率、现金流、商誉）
2. 经营风险（客户集中、供应链、产能）
3. 估值风险（历史分位、同业对比）
4. 政策风险（监管变化、行业整顿）
5. 黑天鹅风险（极端情景推演）""",
        "关注指标": ["负债率", "现金流", "估值分位", "商誉占比", "下行空间"],
        "权重系数": 1.3
    },
    "技术专家": {
        "角色名称": "技术专家",
        "角色定位": "产品技术与研发能力评估师 + 技术面指标解读",
        "本角色专属数据": "技术指标简述（均线、RSI、MACD、布林带、区间等）、开盘/最高/最低/昨收及换手率、成交量、成交额（若有，**当日K线与量价关系**，须解读实体与影线、振幅、放量缩量含义）、52周高低（若有，当前价相对位置）、所属板块（技术/研发行业时）、估值分位（技术型企业估值）。若提供技术指标，须从技术面解读其含义，不得只复述数字。最新价/市盈率仅可在结论中顺带 1 处。",
        "系统提示词": """你是一位技术领域专家，兼具（1）产品技术与研发能力评估、（2）技术面指标解读（借鉴专业交易分析框架）。

【专业能力】
• 产品侧：技术壁垒、专利布局、研发效率、技术路线对比
• 技术面侧：当数据中有「技术指标」时，按下列口径解读，突出本角色专业度——
  - 均线（5日/20日/50日）：趋势方向、支撑/压力、金叉死叉含义
  - RSI：超买(>70)/超卖(<30)、背离、动量强度
  - MACD：金叉/死叉、柱状图收缩扩张、趋势确认
  - 布林带：收口/开口、上轨压力/下轨支撑、中轨回归
  - 近期区间：突破、震荡、波动率含义
• 避免泛泛而谈，每条解读需紧扣给出的指标数值

【分析风格】
• 只引用技术指标简述、所属板块、估值分位等与本角色直接相关的数据
• 专业、细节导向、实事求是

【输出要求】
• 全程使用简体中文,专业术语需附简要解释
• 禁止出现英文词汇（股票代码除外）
• 按指定结构输出,逻辑清晰;禁止输出思考过程、<think> 或 think 等标签内容
• **禁止**再写「## 本角色数据支撑」；须在「## 数据解读」内写 3～5 条，其中**至少两条**直接引用系统技术指标原文（均线、RSI、区间等）或 90 日区间/波动率；可结合用户摘录价量，但不得仅用备注代替系统指标
• 不要笼统说「趋势混合」，需给出细粒度、可操作的技术面或产品技术洞察

【分析框架】
1. 技术指标解读（若有均线/RSI/MACD/布林等：趋势、信号、支撑压力）
2. 核心技术壁垒（专利、工艺、know-how）
3. 研发投入与产品竞争力
4. 技术迭代风险与商业化能力""",
        "关注指标": ["研发费用率", "专利数量", "产品性能", "技术壁垒", "转化效率", "均线", "RSI", "MACD", "布林带"],
        "权重系数": 1.1
    },
    "社交舆情": {
        "角色名称": "社交舆情专家",
        "角色定位": "市场情绪与品牌口碑分析师",
        "本角色专属数据": "风险信号中与舆情/情绪相关项、所属板块（用于理解受众）。若有涨跌幅与成交额/换手率，可映射短期情绪热度与分歧。若无单独舆情数据，则从风险信号与估值分位中解读市场情绪（如估值分位反映的市场乐观/悲观）。不得重复堆砌最新价、市盈率等通用数据。",
        "系统提示词": """你是一位社交媒体和舆情分析专家,擅长分析公众情绪和口碑（借鉴新闻与舆情研究框架）。

【专业能力】
• 擅长分析用户口碑、社交媒体讨论、品牌认知
• 关注 influencer 观点、KOL 态度、散户情绪
• 精通情绪指标和舆情传播规律

【分析风格】
• 只引用与情绪、舆情、风险信号中口碑相关项直接相关的数据
• 关注舆情拐点和预期差
• 接地气、避免精英视角

【输出要求】
• 全程使用简体中文,专业术语需附简要解释
• 禁止出现英文词汇（股票代码除外）
• 按指定结构输出,逻辑清晰
• **禁止**再写「## 本角色数据支撑」；须在「## 数据解读」内用 3～5 条写清，结合系统块的估值分位、波动率或区间位置解读市场情绪，并引用舆情/情绪相关风险信号；不得脱离系统量化空谈情绪
• 情绪判断需有数据或逻辑支撑；不要笼统说「情绪混合」，需给出细粒度洞察

【分析框架】
1. 社交媒体热度与情绪倾向
2. 关键意见领袖态度
3. 用户口碑变化与舆情风险点""",
        "关注指标": ["搜索指数", "讨论热度", "情绪比例", "口碑评分", "舆情风险"],
        "权重系数": 0.8
    }
}

# ==================== 辩论提示词 ====================
DEBATE_PROMPTS = {
    "多头研究员": """你是一位**多头研究员**,任务是建立基于证据的看涨案例。

【分析风格】
• 强调增长潜力、竞争优势、市场机会
• 用数据和事实支撑乐观观点
• 关注积极信号和未来可能性
• 善于发现被低估的价值

【输出要求】
• 全程使用简体中文
• 至少列出 3 个核心看涨理由
• 每个理由需有数据或事实支撑
• 避免过度乐观,保持专业客观""",

    "空头研究员": """你是一位**空头研究员**,任务是强调风险因素、担忧点和潜在问题。

【分析风格】
• 关注下行风险、竞争威胁、市场挑战
• 用数据和事实支撑谨慎观点
• 强调不确定性和潜在损失
• 善于发现被忽视的风险

【输出要求】
• 全程使用简体中文
• 至少列出 3 个核心看跌理由
• 每个理由需有数据或事实支撑
• 避免过度悲观,保持专业客观""",

    "裁判": """你是一位**投资经理和裁判**,任务是评估本轮辩论并做出明确决策。

【职责】
• 客观评估多头和空头的论点质量
• 识别双方的关键论据和逻辑漏洞
• 基于事实和数据做出判断
• 指出共识点和核心分歧

【输出要求】
• 全程使用简体中文
• 明确判断:看涨/看跌/中立
• 说明判断理由（至少 2 点）
• 指出需要进一步验证的关键变量"""
}

# ==================== 股票数据服务 ====================
def _get_alpha_vantage_api_key() -> str:
    """优先从环境变量读取，避免密钥进仓库"""
    return (os.environ.get("ALPHA_VANTAGE_API_KEY") or os.environ.get("ALPHAVANTAGE_API_KEY") or "").strip()


def _normalize_cn_listed_code(code: str) -> str:
    """A 股代码规范为 6 位数字（与前端 stockAPI 一致）。"""
    s = (code or "").strip().upper()
    if "." in s:
        s = s.split(".", 1)[0]
    raw = re.sub(r"\D", "", s)
    if not raw:
        raise ValueError(f"无效 A 股代码: {code}")
    raw = raw.zfill(6)
    if len(raw) > 6:
        raw = raw[-6:]
    return raw


def _tencent_a_symbol(code: str) -> Tuple[str, str]:
    """腾讯行情用的前缀代码，如 sz300442；返回 (full_symbol, clean6)。"""
    cc = _normalize_cn_listed_code(code)
    prefix = "sh" if cc.startswith("6") else "sz"
    return f"{prefix}{cc}", cc


def _tencent_hk_full_symbol(code: str) -> str:
    """港股腾讯代码 hk00700（与前端 stockAPI 一致，5 位数字）。"""
    raw = re.sub(r"\D", "", (code or "").split(".")[0])
    if not raw:
        raise ValueError(f"无效港股代码: {code}")
    return "hk" + raw.zfill(5)[-5:] if len(raw) >= 3 else "hk" + raw.zfill(5)


def _cn_yfinance_symbol(code: str) -> str:
    """A 股 yfinance 标的：沪市 .SS、深市 .SZ。"""
    cc = _normalize_cn_listed_code(code)
    return f"{cc}.SS" if cc.startswith("6") else f"{cc}.SZ"


def _http_get_text(url: str, timeout: float = 15.0) -> str:
    """GET 文本；可选 GTIMG_HTTP_PROXY_TEMPLATE，形如 https://proxy/?url={url}（与前端 trickle 代理一致）。"""
    tpl = (os.environ.get("GTIMG_HTTP_PROXY_TEMPLATE") or "").strip()
    if tpl and "{url}" in tpl:
        url = tpl.format(url=urllib.parse.quote(url, safe=""))
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; StockAnalyzer/1.0)",
            "Accept": "*/*",
        },
        method="GET",
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        raw = resp.read()
    for enc in ("utf-8", "gbk", "gb18030"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _parse_tencent_gtimg_quote_line(text: str) -> Dict[str, Any]:
    """解析 qt.gtimg.cn 单行 v_xxx=\"...\"，字段逻辑与前端 stockAPI.parseTencentGtimgLine 对齐。"""
    m = re.search(r'v_[a-zA-Z0-9_]+="([^"]*)"', text)
    if not m or m.group(1) is None or m.group(1) == "":
        raise ValueError("无法解析腾讯行情响应")
    parts = m.group(1).split("~")
    if len(parts) < 7:
        raise ValueError("腾讯行情字段不足")
    name = str(parts[1]).strip() if len(parts) > 1 else ""
    price = float(parts[3] or 0)
    previous_close = float(parts[4] or 0)
    open_ = float(parts[5] or 0)
    volume_hands = float(parts[6] or 0)
    high = float(parts[33]) if len(parts) > 33 and parts[33] else 0.0
    low = float(parts[34]) if len(parts) > 34 and parts[34] else 0.0
    if high <= 0 or low <= 0:
        cand = [x for x in (price, open_, previous_close) if x > 0]
        mx = max(cand) if cand else price
        mn = min(cand) if cand else price
        if high <= 0:
            high = mx
        if low <= 0:
            low = mn if mn > 0 else price
    pct = 0.0
    if len(parts) > 32 and parts[32] != "":
        try:
            pct = float(str(parts[32]).replace("%", ""))
        except ValueError:
            pct = 0.0
    if pct == 0 and previous_close > 0 and price > 0 and price != previous_close:
        pct = (price - previous_close) / previous_close * 100.0
    if price <= 0 or price != price:
        raise ValueError("腾讯行情无有效价格")
    return {
        "name": name,
        "price": price,
        "previous_close": previous_close,
        "open": open_,
        "high": high,
        "low": low,
        "volume_hands": volume_hands,
        "change_pct": pct,
    }


class StockDataService:
    """股票数据获取服务。A/港股多源合并；港股优先腾讯与 yfinance，AV 作补强；美股仍为 AV（有 Key）+ yfinance。"""

    def __init__(self, source: str = "akshare"):
        self.source = source
        self._av_key = _get_alpha_vantage_api_key()

    @staticmethod
    def _stats_degenerate(sd: StockData) -> bool:
        """区间塌成一点、无波动等，多为历史 K 线过短或数据源异常。"""
        if sd.最新价 <= 0:
            return True
        hi, lo = float(sd.九十日最高 or 0), float(sd.九十日最低 or 0)
        if hi <= 0 or lo < 0:
            return True
        if abs(hi - lo) < 1e-5 * max(hi, 1.0):
            return True
        return False

    def _yf_history_robust(self, ticker, min_rows: int = 20):
        """yfinance 多档 period，避免新股/限频导致只有几天线。"""
        if not HAS_YFINANCE:
            return None
        for per in ("1y", "2y", "6mo", "3mo", "1mo"):
            try:
                h = ticker.history(period=per, interval="1d", auto_adjust=True, timeout=28)
                if h is not None and len(h) >= min_rows:
                    return h
            except Exception:
                continue
        try:
            return ticker.history(period="max", interval="1d", auto_adjust=True, timeout=32)
        except Exception:
            return None

    def _apply_yf_hist_to_sd(self, sd: StockData, hist, days: int) -> None:
        close = hist["Close"].dropna()
        if len(close) < 2:
            return
        n = min(int(days), len(close))
        seg = close.iloc[-n:]
        avg_90 = float(seg.mean())
        high_90 = float(seg.max())
        low_90 = float(seg.min())
        sd.九十日均价 = avg_90
        sd.九十日最高 = high_90
        sd.九十日最低 = low_90
        sd.波动率 = float(seg.std() / avg_90 * 100) if avg_90 > 0 else 0.0
        try:
            sd.技术指标简述 = self._yf_tech_summary(hist)
        except Exception:
            pass

    def post_enrich_stock_data(self, sd: StockData, code: str, market: str, days: int = 90) -> None:
        """分析前补强：多源已合并后，仅对缺简介/缺板块或退化 K 线再调 yfinance，避免重复请求。"""
        m = (market or "").strip()
        if m == "A 股":
            need_yf = (
                not (sd.公司简介 or "").strip()
                or not (sd.所属板块 or "").strip()
                or self._stats_degenerate(sd)
            )
            if need_yf:
                self._enrich_cn_with_yfinance(sd, days)
        elif m in ("港股", "美股") and HAS_YFINANCE:
            if not (sd.公司简介 or "").strip() or not (sd.所属板块 or "").strip():
                self._try_yf_blurb_only(sd, code, m)

    def _try_yf_blurb_only(self, sd: StockData, code: str, market: str) -> None:
        try:
            sym = (
                self._normalize_hk_symbol(code)
                if market == "港股"
                else self._normalize_us_symbol(code)
            )
            inf = yf.Ticker(sym).info or {}
            b = (inf.get("longBusinessSummary") or inf.get("description") or "").strip()
            if b and not (sd.公司简介 or "").strip():
                sd.公司简介 = b[:2200]
            sec = (inf.get("sector") or "").strip()
            ind = (inf.get("industry") or "").strip()
            combo = "/".join(x for x in (sec, ind) if x)
            if combo and not (sd.所属板块 or "").strip():
                sd.所属板块 = combo
        except Exception:
            pass

    def _enrich_cn_with_yfinance(self, sd: StockData, days: int) -> None:
        if not HAS_YFINANCE:
            return
        try:
            sym = _cn_yfinance_symbol(sd.股票代码 or "")
            t = yf.Ticker(sym)
            inf = t.info or {}
            b = (inf.get("longBusinessSummary") or inf.get("description") or "").strip()
            if b and not (sd.公司简介 or "").strip():
                sd.公司简介 = b[:2200]
            sec = (inf.get("sector") or "").strip()
            ind = (inf.get("industry") or "").strip()
            combo = "/".join(x for x in (sec, ind) if x)
            if combo and not (sd.所属板块 or "").strip():
                sd.所属板块 = combo
            if self._stats_degenerate(sd):
                h = self._yf_history_robust(t, min_rows=15)
                if h is not None and len(h) >= 10:
                    self._apply_yf_hist_to_sd(sd, h, days)
        except Exception as e:
            print(f"⚠️ A股 yfinance 补强: {e}")

    @staticmethod
    def _is_mock_sd(sd: StockData) -> bool:
        return (sd.股票名称 or "").startswith("【行情不可用")

    @staticmethod
    def _client_quote_valid(cq: Any) -> bool:
        """前端随分析请求附带的本机腾讯/美股行情；拒绝 mock 或异常数值。"""
        if not cq or not isinstance(cq, dict):
            return False
        if cq.get("is_mock") is True:
            return False
        try:
            p = float(cq.get("price"))
            return 0 < p < 1e12 and p == p
        except (TypeError, ValueError):
            return False

    def _stock_data_from_client_quote(
        self,
        code: str,
        market: str,
        cq: Dict[str, Any],
    ) -> StockData:
        """由浏览器拉取的即时价构造一层 StockData，插入多源合并链最前，主价优先于服务器失败场景。"""
        price = float(cq["price"])
        raw_cp = cq.get("change_percent")
        try:
            cpf = float(raw_cp) if raw_cp is not None else 0.0
        except (TypeError, ValueError):
            cpf = 0.0
        change = f"{cpf:+.2f}%"
        nm = (cq.get("name") or "").strip() or (code or "").strip() or "股票"
        # 浏览器层仅可信「现价/涨跌幅」。勿填伪造的 90 日区间：否则 _stats_degenerate 为假，
        # 合并时不会用腾讯/yfinance 的真实 K 线替换，用户会看到错误的 88%–112% 占位区间。
        return StockData(
            股票名称=nm,
            股票代码=(code or "").strip(),
            所属市场=market,
            最新价=round(price, 4) if market != "A 股" else round(price, 2),
            涨跌幅=change,
            总市值="暂无",
            市盈率=None,
            市净率=None,
            九十日均价=0.0,
            九十日最高=0.0,
            九十日最低=0.0,
            波动率=0.0,
            数据时间=_fmt_now_cn(),
            风险信号=[
                "ℹ️ 最新价与涨跌幅来自**本页浏览器**拉取的行情（与用户添加股票同源）；"
                "约 90 个交易日的高低价/均价由服务端 K 线源合并（非自然日）；若各源均失败则可能暂无区间。",
            ],
            估值分位="暂无数据",
            所属板块="",
            技术指标简述="（浏览器快照仅含现价；完整 K 线由服务端或其它数据源补强）",
            近期市场与板块简述="请结合当前年度及近期大盘与板块走势、该股近期走势综合分析。",
            公司简介="",
            数据溯源="浏览器行情（用户侧网络）",
        )

    @staticmethod
    def _copy_sd(sd: StockData) -> StockData:
        return StockData(**{f.name: getattr(sd, f.name) for f in fields(StockData)})

    @staticmethod
    def _append_risk_unique(sd: StockData, msg: str) -> None:
        if not msg or msg in (sd.风险信号 or []):
            return
        sd.风险信号 = list(sd.风险信号 or []) + [msg]

    def _pick_primary_layer(
        self, layers: List[tuple],
    ) -> tuple:
        """(name, sd)：在「非占位」层中按数据源顺序，优先第一条现价>0 的层。

        避免 akshare 等失败时吞异常返回「未知+0 元」仍排在腾讯/yfinance 之前占主源。
        """
        non_mock = [(n, s) for n, s in layers if not self._is_mock_sd(s)]
        if not non_mock:
            return layers[0]
        with_price = [(n, s) for n, s in non_mock if (s.最新价 or 0) > 0]
        if with_price:
            return with_price[0]
        return non_mock[0]

    def _merge_layers(
        self,
        layers: List[tuple],
        market: str,
        code: str,
        days: int,
    ) -> StockData:
        """按优先级合并：主源定现价/涨跌幅，其余补简介、板块、估值；K 线择优替换退化区间；多源交叉校验。"""
        if not layers:
            return self._mock_stock_data(code, market)
        p_name, primary = self._pick_primary_layer(layers)
        out = self._copy_sd(primary)
        chain = " → ".join(n for n, _ in layers)
        price_refs: List[tuple] = []
        if (primary.最新价 or 0) > 0:
            price_refs.append((p_name, float(primary.最新价)))

        def _pe_ok(x: Optional[float]) -> bool:
            return x is not None and x == x and x > 0

        def _pb_ok(x: Optional[float]) -> bool:
            return x is not None and x == x and x > 0

        bad_mcap = ("", "暂无", "N/A", "暂无（腾讯源）", "暂无（腾讯源无总市值）")

        for name, sd in layers:
            if name == p_name:
                continue
            if self._is_mock_sd(sd):
                continue
            if (sd.最新价 or 0) > 0:
                price_refs.append((name, float(sd.最新价)))

            if len((sd.公司简介 or "").strip()) > len((out.公司简介 or "").strip()):
                out.公司简介 = sd.公司简介
            if not (out.所属板块 or "").strip() and (sd.所属板块 or "").strip():
                out.所属板块 = sd.所属板块
            if (not out.总市值 or out.总市值 in bad_mcap) and sd.总市值 and sd.总市值 not in bad_mcap:
                out.总市值 = sd.总市值
            if not _pe_ok(out.市盈率) and _pe_ok(sd.市盈率):
                out.市盈率 = sd.市盈率
            if not _pb_ok(out.市净率) and _pb_ok(sd.市净率):
                out.市净率 = sd.市净率
            if (not (out.估值分位 or "").strip() or out.估值分位 == "暂无数据") and (sd.估值分位 or "").strip():
                out.估值分位 = sd.估值分位

            if self._stats_degenerate(out) and not self._stats_degenerate(sd):
                out.九十日均价 = sd.九十日均价
                out.九十日最高 = sd.九十日最高
                out.九十日最低 = sd.九十日最低
                out.波动率 = sd.波动率
                if sd.技术指标简述:
                    out.技术指标简述 = sd.技术指标简述
            elif not self._stats_degenerate(out) and not self._stats_degenerate(sd):
                hi_o, hi_s = float(out.九十日最高 or 0), float(sd.九十日最高 or 0)
                if hi_o > 0 and hi_s > 0 and abs(hi_o - hi_s) / hi_o > 0.08:
                    self._append_risk_unique(
                        out,
                        f"⚠️ 多源校验：{p_name} 与 {name} 的约{days}日价格高点偏离>8%，区间以主源为准，请注意数据源差异",
                    )

        if len(price_refs) >= 2:
            vals = [p for _, p in price_refs if p > 0]
            if len(vals) >= 2:
                mx, mn = max(vals), min(vals)
                if mn > 0 and (mx - mn) / mn > 0.03:
                    detail = "；".join(f"{n}:{p:.4g}" for n, p in price_refs if p > 0)
                    self._append_risk_unique(
                        out,
                        f"⚠️ 多源现价差异>3%（{detail}），请以致券商/交易所行情为准",
                    )

        out.数据溯源 = (
            f"{chain}｜主定价:{p_name}｜合并:缺项互补；"
            "K 线区间在主源退化时由次优源替换；现价/高点差异已写入风险信号"
        )
        out.所属市场 = market
        # 主源无现价但后续层有有效价时补齐（双保险）
        if (out.最新价 or 0) <= 0 and not self._is_mock_sd(out):
            for name, sd in layers:
                if name == p_name or self._is_mock_sd(sd):
                    continue
                if (sd.最新价 or 0) > 0:
                    out.最新价 = float(sd.最新价)
                    if (sd.涨跌幅 or "").strip():
                        out.涨跌幅 = sd.涨跌幅
                    if (sd.数据时间 or "").strip():
                        out.数据时间 = sd.数据时间
                    self._append_risk_unique(
                        out,
                        f"ℹ️ 主源「{p_name}」无有效现价，已采用「{name}」的现价/涨跌幅",
                    )
                    break
        return out

    def _collect_layers_a(self, code: str, days: int) -> List[tuple]:
        """A 股：腾讯财经 → yfinance → akshare → Baostock。

        与前端刷新同源优先，便于海外/Vercel；akshare/Baostock 补总市值、PE、简介等。
        akshare 超时仅跳过该层，不因单源拖死整次请求。
        """
        layers: List[tuple] = []
        try:
            layers.append(("腾讯财经", self._get_a_stock_data_tencent(code, days)))
        except Exception as e:
            print(f"⚠️ [多源] 腾讯财经 A股: {e}")
        if HAS_YFINANCE:
            try:
                cc = _normalize_cn_listed_code(code)
                sym = _cn_yfinance_symbol(code)
                layers.append(
                    ("yfinance", self._get_yf_stock_data(sym, "A 股", cc, days)),
                )
            except Exception as e:
                print(f"⚠️ [多源] yfinance A股: {e}")
        if HAS_AKSHARE:
            from concurrent.futures import ThreadPoolExecutor

            with ThreadPoolExecutor(max_workers=1) as ex:
                fut = ex.submit(self._get_a_stock_data, code, days)
                try:
                    layers.append(("akshare", fut.result(timeout=30)))
                except Exception as e:
                    if "TimeoutError" in type(e).__name__ or "timeout" in str(e).lower():
                        print(
                            "⚠️ [多源] akshare A股 超时(30秒)，已跳过（其它源已拉取则仍可用）",
                        )
                    else:
                        print(f"⚠️ [多源] akshare A股: {e}")
        try:
            layers.append(("Baostock", self._get_a_stock_data_baostock(code, days)))
        except Exception as e:
            print(f"⚠️ [多源] Baostock A股: {e}")
        return layers

    def _collect_layers_hk(self, code: str, days: int) -> List[tuple]:
        """港股：腾讯财经 → yfinance → Alpha Vantage（有 Key）。

        与 A 股一致优先易通达源；AV 的 Global Quote 常缺价或滞后，放最后作基本面补强，避免 0 元占位抢占主源。
        """
        layers: List[tuple] = []
        try:
            layers.append(("腾讯财经", self._get_hk_stock_data_tencent(code, days)))
        except Exception as e:
            print(f"⚠️ [多源] 腾讯财经 港股: {e}")
        if HAS_YFINANCE:
            try:
                yf_sym = self._normalize_hk_symbol(code)
                layers.append(
                    ("yfinance", self._get_yf_stock_data(yf_sym, "港股", code, days)),
                )
            except Exception as e:
                print(f"⚠️ [多源] yfinance 港股: {e}")
        if self._av_key:
            try:
                layers.append(
                    ("Alpha Vantage", self._get_av_stock_data(code, "港股", days)),
                )
            except Exception as e:
                print(f"⚠️ [多源] Alpha Vantage 港股: {e}")
        return layers

    def _collect_layers_us(self, code: str, days: int) -> List[tuple]:
        """美股：Alpha Vantage（有 Key）→ yfinance。"""
        layers: List[tuple] = []
        if self._av_key:
            try:
                layers.append(
                    ("Alpha Vantage", self._get_av_stock_data(code, "美股", days)),
                )
            except Exception as e:
                print(f"⚠️ [多源] Alpha Vantage 美股: {e}")
        if HAS_YFINANCE:
            try:
                sym = self._normalize_us_symbol(code)
                layers.append(
                    ("yfinance", self._get_yf_stock_data(sym, "美股", code, days)),
                )
            except Exception as e:
                print(f"⚠️ [多源] yfinance 美股: {e}")
        return layers

    def get_stock_info(
        self,
        code: str,
        market: str = "A 股",
        days: int = 90,
        client_quote: Optional[Dict[str, Any]] = None,
    ) -> StockData:
        """多源按优先级拉取并合并；若带 client_quote（浏览器腾讯价），插入链首，缓解服务端连不通行情源的问题。"""
        try:
            m = (market or "").strip()
            if m == "A 股":
                layers = self._collect_layers_a(code, days)
            elif m == "港股":
                layers = self._collect_layers_hk(code, days)
            elif m == "美股":
                layers = self._collect_layers_us(code, days)
            else:
                return self._mock_stock_data(code, m or market)
            if self._client_quote_valid(client_quote):
                layers.insert(
                    0,
                    (
                        "浏览器行情",
                        self._stock_data_from_client_quote(code, m, client_quote),
                    ),
                )
            if not layers:
                return self._mock_stock_data(code, market)
            merged = self._merge_layers(layers, m, code, days)
            if self._is_mock_sd(merged) and (merged.最新价 or 0) <= 0:
                return self._mock_stock_data(code, market)
            return merged
        except Exception as e:
            if "超时" in str(e) or "timeout" in str(e).lower():
                raise
            print(f"⚠️ 数据获取失败:{str(e)},使用模拟数据")
            return self._mock_stock_data(code, market)

    def _get_a_stock_data(self, code: str, days: int = 90) -> StockData:
        """获取 A 股数据"""
        import akshare as ak
        import pandas as pd

        # 清理代码格式（6 位）；东方财富「代码」列常为数字型，直接 == 字符串会匹配不到
        clean_code = _normalize_cn_listed_code(code)

        # 实时行情
        try:
            df_spot = ak.stock_zh_a_spot_em()
            code_col = (
                df_spot["代码"]
                .astype(str)
                .str.replace(r"\.0$", "", regex=True)
                .str.zfill(6)
            )
            stock_row = df_spot[code_col == clean_code]

            if stock_row.empty:
                raise ValueError(f"未找到股票 {code}")

            name = str(stock_row["名称"].values[0]).strip()
            if not name:
                raise ValueError("akshare 返回空股票名称")
            price = float(stock_row["最新价"].values[0])
            if price <= 0 or price != price:
                raise ValueError(f"akshare 最新价无效: {price}")
            change = f"{float(stock_row['涨跌幅'].values[0]):.2f}%"
            market_cap = f"{float(stock_row['总市值'].values[0])/1e8:.1f}亿"
            pe = float(stock_row["市盈率 - 动态"].values[0]) if stock_row["市盈率 - 动态"].values[0] else 0.0
            pb = float(stock_row["市净率"].values[0]) if stock_row["市净率"].values[0] else 0.0
        except Exception as e:
            raise RuntimeError(f"akshare A股实时行情不可用: {e}") from e

        # 历史数据（使用当前年度及近期，避免写死 2024）
        from datetime import timedelta
        start_date = (_now_cn() - timedelta(days=max(days, 365))).strftime("%Y%m%d")
        所属板块_a = ""
        技术指标简述_a = ""
        公司简介_a = ""
        try:
            hist = ak.stock_zh_a_hist(symbol=clean_code, period="daily", start_date=start_date)
            if len(hist) > 0:
                close_prices = hist['收盘'].values
                n = min(days, len(close_prices))
                avg_90 = float(close_prices[-n:].mean())
                high_90 = float(close_prices[-n:].max())
                low_90 = float(close_prices[-n:].min())
                volatility = float(close_prices[-n:].std() / avg_90 * 100) if avg_90 > 0 else 0.0
                if len(close_prices) >= 20:
                    sma5 = float(close_prices[-5:].mean())
                    sma20 = float(close_prices[-20:].mean())
                    技术指标简述_a = f"5日均线{round(sma5, 2)}；20日均线{round(sma20, 2)}；近{n}日区间{_fmt_range_cn(low_90, high_90)}元"
            else:
                avg_90 = price
                high_90 = price
                low_90 = price
                volatility = 0.0
        except Exception:
            avg_90 = price
            high_90 = price
            low_90 = price
            volatility = 0.0
        try:
            info_df = ak.stock_individual_info_em(symbol=clean_code)
            if info_df is not None and not info_df.empty:
                cols = list(info_df.columns)
                name_col = next((c for c in cols if 'item' in c.lower() or '名称' in c or 'key' in c.lower()), cols[0])
                val_col = next((c for c in cols if 'value' in c.lower() or '值' in c or 'value' in c), (cols[1] if len(cols) > 1 else cols[0]))
                blurbs: List[str] = []
                for _, row in info_df.iterrows():
                    if name_col in row and val_col in row and row[name_col]:
                        k = str(row[name_col])
                        v = str(row[val_col]).strip()
                        if not v:
                            continue
                        if '行业' in k or '板块' in k:
                            所属板块_a = v or 所属板块_a
                        if any(x in k for x in ('主营', '业务', '简介', '范围', '产品', '经营')):
                            blurbs.append(f"{k}: {v[:600]}")
                if blurbs:
                    公司简介_a = "\n".join(blurbs[:6])[:2200]
        except Exception:
            pass

        # 风险信号
        risk_flags = []
        if volatility > 25:
            risk_flags.append("⚠️ 近期波动较大（超过 25%）")
        if pe > 50:
            risk_flags.append("⚠️ 估值处于高位（市盈率>50）")
        if change.startswith('-') and float(change.replace('%', '')) < -5:
            risk_flags.append("⚠️ 短期跌幅较深（超过 5%）")
        if not risk_flags:
            risk_flags.append("✅ 暂无明显风险信号")

        # 估值分位
        if pe > 0:
            if pe < 15:
                pe_percentile = "低估区间（历史后 30%）"
            elif pe < 30:
                pe_percentile = "合理区间（历史 30%-70%）"
            else:
                pe_percentile = "高估区间（历史前 30%）"
        else:
            pe_percentile = "暂无数据"

        return StockData(
            股票名称=name,
            股票代码=code,
            所属市场="A 股",
            最新价=price,
            涨跌幅=change,
            总市值=market_cap,
            市盈率=pe,
            市净率=pb,
            九十日均价=avg_90,
            九十日最高=high_90,
            九十日最低=low_90,
            波动率=volatility,
            数据时间=_fmt_now_cn(),
            风险信号=risk_flags,
            估值分位=pe_percentile,
            所属板块=所属板块_a,
            技术指标简述=技术指标简述_a,
            近期市场与板块简述="请结合当前年度及近期大盘与板块走势、该股近期走势综合分析。",
            公司简介=公司简介_a,
        )

    def _normalize_a_symbol(self, code: str) -> str:
        """A 股代码标准化为 baostock 代码，如 600519.SH -> sh.600519, 000001 -> sz.000001"""
        code = code.strip().upper().replace(" ", "")
        if "." in code:
            base, suffix = code.split(".", 1)
            if suffix in ("SH", "SZ") and base.isdigit():
                return f"{suffix.lower()}.{base}"
        clean_code = code.split(".")[0]
        if clean_code.startswith("6"):
            return f"sh.{clean_code}"
        return f"sz.{clean_code}"

    def _get_a_stock_data_baostock(self, code: str, days: int = 90) -> StockData:
        """备用：使用 baostock 获取 A 股数据"""
        try:
            import baostock as bs
            import pandas as pd
            from datetime import timedelta
        except ImportError as e:
            raise RuntimeError("未安装 baostock 库") from e

        symbol = self._normalize_a_symbol(code)
        lg = bs.login()
        if lg.error_code != "0":
            bs.logout()
            raise RuntimeError(f"Baostock 登录失败：{lg.error_msg}")

        end_date = _now_cn().strftime("%Y-%m-%d")
        start_date = (_now_cn() - timedelta(days=max(days, 365))).strftime("%Y-%m-%d")
        rs = bs.query_history_k_data_plus(
            symbol,
            "date,code,open,high,low,close,volume",
            start_date=start_date,
            end_date=end_date,
            frequency="d",
            adjustflag="3"
        )
        if rs.error_code != "0":
            bs.logout()
            raise RuntimeError(f"Baostock 历史数据查询失败：{rs.error_msg}")

        records = []
        while rs.next():
            records.append(rs.get_row_data())
        bs.logout()

        if not records:
            raise ValueError("Baostock 未返回历史数据")

        df = pd.DataFrame(records, columns=["date", "code", "open", "high", "low", "close", "volume"])
        df[["open", "high", "low", "close", "volume"]] = df[["open", "high", "low", "close", "volume"]].astype(float)

        latest = df.iloc[-1]
        price = float(latest["close"])
        name = code
        change_pct = 0.0
        if len(df) >= 2:
            prev_close = float(df.iloc[-2]["close"])
            if prev_close != 0:
                change_pct = (price / prev_close - 1) * 100
        change = f"{change_pct:+.2f}%"

        n = min(days, len(df))
        closes = df["close"].iloc[-n:].values
        avg_90 = float(closes.mean())
        high_90 = float(closes.max())
        low_90 = float(closes.min())
        volatility = float(pd.Series(closes).std() / avg_90 * 100) if avg_90 > 0 else 0.0

        risk_flags = []
        if volatility > 25:
            risk_flags.append("⚠️ 近期波动较大（超过 25%）")
        if change_pct < -5:
            risk_flags.append("⚠️ 短期跌幅较深（超过 5%）")
        if not risk_flags:
            risk_flags.append("✅ 暂无明显风险信号")

        if len(closes) >= 20:
            sma5 = float(df["close"].iloc[-5:].mean())
            sma20 = float(df["close"].iloc[-20:].mean())
            技术指标简述_a = f"5日均线{round(sma5, 2)}；20日均线{round(sma20, 2)}；近{n}日区间{_fmt_range_cn(low_90, high_90)}元"
        else:
            技术指标简述_a = ""

        pe_percentile = "暂无数据"

        return StockData(
            股票名称=name,
            股票代码=code,
            所属市场="A 股",
            最新价=price,
            涨跌幅=change,
            总市值="暂无",
            市盈率=0.0,
            市净率=0.0,
            九十日均价=avg_90,
            九十日最高=high_90,
            九十日最低=low_90,
            波动率=volatility,
            数据时间=_fmt_now_cn(),
            风险信号=risk_flags,
            估值分位=pe_percentile,
            所属板块="",
            技术指标简述=技术指标简述_a,
            近期市场与板块简述="请结合当前年度及近期大盘与板块走势、该股近期走势综合分析。",
            公司简介="",
        )

    def _get_tencent_fqkline_closes(self, full_symbol: str, need_days: int) -> List[float]:
        """腾讯 ifzq 日 K 收盘价（时间正序）。拉足条数，避免 90 日区间退化成一点价。"""
        cnt = min(640, max(int(need_days) + 200, 320))
        url = (
            "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?"
            f"param={full_symbol},day,,,{cnt},qfq"
        )
        text = _http_get_text(url, timeout=22.0)
        data = json.loads(text)
        sym_data = (data.get("data") or {}).get(full_symbol) or {}
        day_rows = sym_data.get("qfqday") or sym_data.get("day") or []
        if not day_rows:
            raise ValueError("腾讯K线返回为空")
        rows = list(day_rows)
        rows.reverse()
        closes: List[float] = []
        for row in rows:
            if isinstance(row, (list, tuple)) and len(row) >= 3:
                closes.append(float(row[2]))
        if not closes:
            raise ValueError("腾讯K线无有效收盘价")
        return closes

    def _get_a_stock_data_tencent(self, code: str, days: int = 90) -> StockData:
        """A 股：腾讯 qt.gtimg + ifzq K 线（与前端刷新价格同源），用于 akshare/Baostock 不可用时的兜底。"""
        import pandas as pd

        full_symbol, cc = _tencent_a_symbol(code)
        quote_url = f"https://qt.gtimg.cn/q={full_symbol}"
        text = _http_get_text(quote_url, timeout=12.0)
        q = _parse_tencent_gtimg_quote_line(text)
        name = q["name"] or cc
        price = float(q["price"])
        change = f"{q['change_pct']:+.2f}%"

        closes = self._get_tencent_fqkline_closes(full_symbol, days)
        n = min(days, len(closes))
        seg = closes[-n:]
        avg_90 = float(sum(seg) / len(seg)) if seg else price
        high_90 = float(max(seg)) if seg else price
        low_90 = float(min(seg)) if seg else price
        volatility = (
            float(pd.Series(seg).std() / avg_90 * 100) if avg_90 > 0 and len(seg) > 1 else 0.0
        )

        risk_flags: List[str] = []
        if len(seg) < 15 or (high_90 > 0 and low_90 > 0 and abs(high_90 - low_90) < 1e-6 * max(high_90, 1)):
            risk_flags.append("⚠️ 历史 K 线样本不足或价格区间异常扁平，以下区间与波动率仅供参考，请以交易所行情为准")
        if volatility > 25:
            risk_flags.append("⚠️ 近期波动较大（超过 25%）")
        if q["change_pct"] < -5:
            risk_flags.append("⚠️ 短期跌幅较深（超过 5%）")
        if not risk_flags:
            risk_flags.append("✅ 暂无明显风险信号")

        if len(seg) >= 20:
            sma5 = float(pd.Series(closes[-5:]).mean())
            sma20 = float(pd.Series(closes[-20:]).mean())
            tech = (
                f"5日均线{round(sma5, 2)}；20日均线{round(sma20, 2)}；"
                f"近{n}日区间{_fmt_range_cn(low_90, high_90)}元"
            )
        else:
            tech = f"近{n}日区间{_fmt_range_cn(low_90, high_90)}元"

        return StockData(
            股票名称=name,
            股票代码=cc,
            所属市场="A 股",
            最新价=round(price, 2),
            涨跌幅=change,
            总市值="暂无（腾讯源无总市值）",
            市盈率=0.0,
            市净率=0.0,
            九十日均价=avg_90,
            九十日最高=high_90,
            九十日最低=low_90,
            波动率=volatility,
            数据时间=_fmt_now_cn(),
            风险信号=risk_flags,
            估值分位="暂无数据（腾讯源无市盈率）",
            所属板块="",
            技术指标简述=tech,
            近期市场与板块简述="请结合当前年度及近期大盘与板块走势、该股近期走势综合分析。",
            公司简介="",
        )

    def _get_hk_stock_data_tencent(self, code: str, days: int = 90) -> StockData:
        """港股：腾讯 qt.gtimg + ifzq K 线（与 A 股同源接口），作 yfinance 失败或区间异常时的兜底。"""
        import pandas as pd

        full = _tencent_hk_full_symbol(code)
        quote_url = f"https://qt.gtimg.cn/q={full}"
        text = _http_get_text(quote_url, timeout=12.0)
        q = _parse_tencent_gtimg_quote_line(text)
        name = q["name"] or code
        price = float(q["price"])
        change = f"{q['change_pct']:+.2f}%"

        closes = self._get_tencent_fqkline_closes(full, days)
        n = min(days, len(closes))
        seg = closes[-n:]
        avg_90 = float(sum(seg) / len(seg)) if seg else price
        high_90 = float(max(seg)) if seg else price
        low_90 = float(min(seg)) if seg else price
        volatility = (
            float(pd.Series(seg).std() / avg_90 * 100) if avg_90 > 0 and len(seg) > 1 else 0.0
        )
        risk_flags: List[str] = []
        if len(seg) < 15 or (high_90 > 0 and low_90 > 0 and abs(high_90 - low_90) < 1e-6 * max(high_90, 1)):
            risk_flags.append("⚠️ 港股腾讯 K 线样本不足或区间扁平，请以券商行情为准")
        if volatility > 25:
            risk_flags.append("⚠️ 近期波动较大（超过 25%）")
        if q["change_pct"] < -5:
            risk_flags.append("⚠️ 短期跌幅较深（超过 5%）")
        if not risk_flags:
            risk_flags.append("✅ 暂无明显风险信号")
        if len(seg) >= 20:
            sma5 = float(pd.Series(closes[-5:]).mean())
            sma20 = float(pd.Series(closes[-20:]).mean())
            tech = (
                f"5日均线{round(sma5, 2)}；20日均线{round(sma20, 2)}；"
                f"近{n}日区间{_fmt_range_cn(low_90, high_90)}港元"
            )
        else:
            tech = f"近{n}日区间{_fmt_range_cn(low_90, high_90)}港元"

        return StockData(
            股票名称=name,
            股票代码=code.strip().upper(),
            所属市场="港股",
            最新价=round(price, 3),
            涨跌幅=change,
            总市值="暂无（腾讯源）",
            市盈率=None,
            市净率=None,
            九十日均价=avg_90,
            九十日最高=high_90,
            九十日最低=low_90,
            波动率=volatility,
            数据时间=_fmt_now_cn(),
            风险信号=risk_flags,
            估值分位="暂无数据",
            所属板块="",
            技术指标简述=tech,
            近期市场与板块简述="请结合港股大盘与板块走势、该股近期走势综合分析。",
            公司简介="",
        )

    def _normalize_hk_symbol(self, code: str) -> str:
        """港股代码转为 yfinance 格式：5 位内数字左补零后去前导零再格式化为 4 位（如 01810→1810.HK，00700→0700.HK）"""
        code = code.strip().upper().replace(" ", "")
        if ".HK" in code:
            num_str = code.split(".")[0]
        elif code.isdigit():
            num_str = code
        else:
            return f"{code}.HK" if not code.endswith(".HK") else code
        num_str = num_str.lstrip("0") or "0"
        n = int(num_str, 10)
        # 港股常见 4 位代码；09618 等扩展码 int 后仍唯一对应 yfinance
        if n <= 99999:
            return f"{n:04d}.HK"
        return f"{n}.HK"

    def _normalize_us_symbol(self, code: str) -> str:
        """美股代码清理，保留主代码"""
        code = code.strip().upper()
        if "." in code:
            code = code.split(".")[0]
        return code

    def _get_yf_stock_data(self, yf_symbol: str, market: str, display_code: str, days: int) -> StockData:
        """通过 yfinance 获取港股/美股数据并转为 StockData"""
        if not HAS_YFINANCE:
            return self._mock_stock_data(display_code, market)
        try:
            ticker = yf.Ticker(yf_symbol)
            info = ticker.info or {}
            hist = self._yf_history_robust(ticker, min_rows=12)
            if hist is None or len(hist) == 0:
                raise ValueError("无历史数据")
            latest = hist.iloc[-1]
            price = float(latest["Close"])
            name = info.get("shortName") or info.get("longName") or display_code
            blurb = (info.get("longBusinessSummary") or info.get("description") or "").strip()
            公司简介 = (blurb[:2200] if blurb else "")

            # 涨跌幅：今日或最近一根 K 线
            if len(hist) >= 2:
                prev_close = float(hist.iloc[-2]["Close"])
                change_pct = (price / prev_close - 1) * 100
            else:
                change_pct = 0.0
            change = f"{change_pct:+.2f}%"

            # 市值
            mcap = info.get("marketCap")
            if mcap is not None and mcap > 0:
                if mcap >= 1e12:
                    market_cap = f"{mcap / 1e12:.2f} 万亿"
                elif mcap >= 1e8:
                    market_cap = f"{mcap / 1e8:.1f} 亿"
                else:
                    market_cap = f"{mcap / 1e4:.1f} 万"
            else:
                market_cap = "暂无"

            # 市盈率：trailingPE → forwardPE → 用现价/trailingEps 推算（AAPL 等常缺 trailingPE）
            pe_raw = info.get("trailingPE")
            if pe_raw is None or pe_raw == 0:
                pe_raw = info.get("forwardPE")
            try:
                pe = float(pe_raw) if pe_raw is not None else None
            except (TypeError, ValueError):
                pe = None
            if pe is not None and pe < 0:
                pe = None
            if (pe is None or pe <= 0) and price and price > 0:
                for eps_key in ("trailingEps", "epsTrailingTwelveMonths", "forwardEps"):
                    eps_v = info.get(eps_key)
                    if eps_v is not None:
                        try:
                            eps_f = float(eps_v)
                            if eps_f > 0:
                                pe = price / eps_f
                                break
                        except (TypeError, ValueError, ZeroDivisionError):
                            pass
            
            # 市净率
            pb_raw = info.get("priceToBook")
            try:
                pb = float(pb_raw) if pb_raw is not None else None
            except (TypeError, ValueError):
                pb = None

            closes = hist["Close"].values
            n = min(days, len(closes))
            avg_90 = float(closes[-n:].mean())
            high_90 = float(closes[-n:].max())
            low_90 = float(closes[-n:].min())
            volatility = float(closes[-n:].std() / avg_90 * 100) if avg_90 > 0 else 0.0

            risk_flags = []
            if len(hist) < 20 or (high_90 > 0 and abs(high_90 - low_90) < 1e-5 * max(high_90, 1.0)):
                risk_flags.append("⚠️ 历史日线样本较少或价格区间异常，区间与波动率仅供参考")
            if volatility > 25:
                risk_flags.append("⚠️ 近期波动较大（超过 25%）")
            if pe is not None and pe > 50:
                risk_flags.append("⚠️ 估值处于高位（市盈率>50）")
            elif pe is None and market == "美股":
                risk_flags.append("⚠️ 市盈率数据缺失（可能未盈利或数据源未提供）")
            if change_pct < -5:
                risk_flags.append("⚠️ 短期跌幅较深（超过 5%）")
            if not risk_flags:
                risk_flags.append("✅ 暂无明显风险信号")

            if pe is not None and pe > 0:
                if pe < 15:
                    pe_percentile = "低估区间（历史后 30%）"
                elif pe < 30:
                    pe_percentile = "合理区间（历史 30%-70%）"
                else:
                    pe_percentile = "高估区间（历史前 30%）"
            elif pe is None and info.get("forwardPE") is not None:
                try:
                    fp = float(info.get("forwardPE"))
                    pe_percentile = f"暂无历史PE，预期PE {fp:.1f} 倍" if fp > 0 else "暂无数据（公司尚未盈利）"
                except (TypeError, ValueError):
                    pe_percentile = "暂无数据（公司尚未盈利）"
            else:
                pe_percentile = "暂无数据（公司尚未盈利）"

            # 所属板块（yfinance）
            sector = info.get("sector") or info.get("industry") or ""
            if isinstance(sector, str) and sector:
                所属板块 = sector
            else:
                所属板块 = ""

            # 技术指标：均线、RSI、近期区间
            技术指标简述 = self._yf_tech_summary(hist)

            return StockData(
                股票名称=name,
                股票代码=display_code,
                所属市场=market,
                最新价=price,
                涨跌幅=change,
                总市值=market_cap,
                市盈率=pe,
                市净率=pb,
                九十日均价=avg_90,
                九十日最高=high_90,
                九十日最低=low_90,
                波动率=volatility,
                数据时间=_fmt_now_cn(),
                风险信号=risk_flags,
                估值分位=pe_percentile,
                所属板块=所属板块,
                技术指标简述=技术指标简述,
                近期市场与板块简述="请结合当前年度及近期大盘与板块走势、该股近期走势综合分析。",
                公司简介=公司简介,
            )
        except Exception as e:
            print(f"⚠️ yfinance 获取 {yf_symbol} 失败: {e},使用模拟数据")
            return self._mock_stock_data(display_code, market)

    def _yf_tech_summary(self, hist) -> str:
        """从 yfinance 历史数据计算技术指标简述"""
        try:
            import pandas as pd
            if hist is None or len(hist) < 20:
                return ""
            close = hist["Close"]
            sma5 = close.rolling(5).mean().iloc[-1]
            sma20 = close.rolling(20).mean().iloc[-1]
            delta = close.diff()
            gain = delta.where(delta > 0, 0.0).rolling(14).mean().iloc[-1]
            loss = (-delta.where(delta < 0, 0.0)).rolling(14).mean().iloc[-1]
            rsi = 100 - (100 / (1 + gain / loss)) if loss and loss != 0 else None
            parts = [f"5日均线{round(sma5, 2)}", f"20日均线{round(sma20, 2)}"]
            if rsi is not None and pd.notna(rsi):
                parts.append(f"RSI(14){round(rsi, 1)}")
            recent = close.iloc[-min(30, len(close)):]
            parts.append(
                f"近30日区间{_fmt_range_cn(float(recent.min()), float(recent.max()))}元"
            )
            return "；".join(parts)
        except Exception:
            return ""

    def _get_hk_stock_data(self, code: str, days: int = 90) -> StockData:
        """港股：优先 yfinance（含公司简介）；异常或占位时用腾讯 K 线兜底。"""
        yf_symbol = self._normalize_hk_symbol(code)
        sd = self._get_yf_stock_data(yf_symbol, "港股", code, days)
        need_tencent = (sd.股票名称 or "").startswith("【行情不可用") or self._stats_degenerate(sd)
        if need_tencent:
            try:
                tsd = self._get_hk_stock_data_tencent(code, days)
                if sd.公司简介:
                    tsd.公司简介 = sd.公司简介
                if sd.所属板块 and not tsd.所属板块:
                    tsd.所属板块 = sd.所属板块
                if (sd.股票名称 or "").startswith("【行情不可用"):
                    return tsd
                if not self._stats_degenerate(tsd):
                    return tsd
            except Exception as e:
                print(f"⚠️ 腾讯港股兜底失败: {e}")
        return sd

    def _get_us_stock_data(self, code: str, days: int = 90) -> StockData:
        """获取美股数据（yfinance 实时）"""
        yf_symbol = self._normalize_us_symbol(code)
        return self._get_yf_stock_data(yf_symbol, "美股", code, days)

    def _av_symbol(self, code: str, market: str) -> str:
        """Alpha Vantage 标的代码：美股原样，港股 XXXX.HK（4 位）"""
        code = code.strip().upper()
        if "." in code:
            code = code.split(".")[0]
        if market == "港股":
            code = code.lstrip("0") or "0"
            return f"{int(code):04d}.HK"
        return code

    def _get_av_stock_data(self, code: str, market: str, days: int = 90) -> StockData:
        """通过 Alpha Vantage 获取港股/美股数据（优先使用，信息更丰富）"""
        import urllib.request
        import urllib.parse
        import json
        import math
        symbol = self._av_symbol(code, market)
        base = "https://www.alphavantage.co/query"
        api_key = self._av_key

        # GLOBAL_QUOTE
        q = {"function": "GLOBAL_QUOTE", "symbol": symbol, "apikey": api_key}
        req = urllib.request.Request(base + "?" + urllib.parse.urlencode(q))
        with urllib.request.urlopen(req, timeout=15) as resp:
            quote_data = json.loads(resp.read().decode())
        gq = quote_data.get("Global Quote") or {}
        if not gq:
            raise ValueError("Alpha Vantage 未返回行情")
        price = float(gq.get("05. price") or 0)
        change_pct = (gq.get("10. change percent") or "0%").replace("%", "").strip()
        try:
            change_pct_f = float(change_pct)
        except ValueError:
            change_pct_f = 0.0
        change = f"{change_pct_f:+.2f}%"
        name = gq.get("01. symbol") or code

        # OVERVIEW（市值、PE、PB、板块）
        oq = {"function": "OVERVIEW", "symbol": symbol, "apikey": api_key}
        req2 = urllib.request.Request(base + "?" + urllib.parse.urlencode(oq))
        try:
            with urllib.request.urlopen(req2, timeout=15) as resp2:
                overview = json.loads(resp2.read().decode())
        except Exception:
            overview = {}
        mcap = overview.get("MarketCapitalization")
        if mcap and mcap != "None":
            try:
                m = float(mcap)
                if m >= 1e12:
                    market_cap = f"{m/1e12:.2f} 万亿"
                elif m >= 1e8:
                    market_cap = f"{m/1e8:.1f} 亿"
                else:
                    market_cap = f"{m/1e4:.1f} 万"
            except (TypeError, ValueError):
                market_cap = "暂无"
        else:
            market_cap = "暂无"
        pe = float(overview.get("PERatio") or 0) or 0.0
        pb = float(overview.get("PriceToBookRatio") or 0) or 0.0
        sector = (overview.get("Sector") or overview.get("Industry") or "").strip()
        if sector == "None":
            sector = ""
        desc_raw = (overview.get("Description") or "").strip()
        if desc_raw in ("", "None"):
            desc_raw = ""
        av_blurb = desc_raw[:2200] if desc_raw else ""

        # TIME_SERIES_DAILY：按日期从新到旧取足量交易日（勿依赖 dict 无序迭代）
        tsq = {"function": "TIME_SERIES_DAILY", "symbol": symbol, "apikey": api_key, "outputsize": "compact"}
        req3 = urllib.request.Request(base + "?" + urllib.parse.urlencode(tsq))
        try:
            with urllib.request.urlopen(req3, timeout=15) as resp3:
                ts = json.loads(resp3.read().decode())
        except Exception:
            ts = {}
        daily = ts.get("Time Series (Daily)") or {}
        dates_sorted = sorted(daily.keys(), reverse=True)
        closes = []
        for d in dates_sorted[: max(int(days), 100)]:
            v = daily.get(d) or {}
            try:
                closes.append(float(v.get("4. close")))
            except (TypeError, ValueError):
                pass
        if closes:
            take = min(int(days), len(closes))
            closes = closes[:take]
            avg_90 = sum(closes) / len(closes)
            high_90 = max(closes)
            low_90 = min(closes)
            volatility = (math.sqrt(sum((x - avg_90)**2 for x in closes) / len(closes)) / avg_90 * 100) if avg_90 else 0.0
        else:
            avg_90, high_90, low_90, volatility = price, price, price, 0.0

        # Global Quote 对港股等常返回 0 或缺字段，用最近一日收盘价兜底；仍无效则抛错以免多源合并占主源
        if closes and (price <= 0 or price != price):
            try:
                c0 = float(closes[0])
                if c0 > 0 and c0 == c0:
                    price = c0
            except (TypeError, ValueError):
                pass
        if price <= 0 or price != price:
            raise ValueError("Alpha Vantage 无有效现价（Quote 与日线均为空）")

        risk_flags = []
        if len(closes) < 15 or (high_90 > 0 and abs(high_90 - low_90) < 1e-5 * max(high_90, 1.0)):
            risk_flags.append("⚠️ Alpha Vantage 日线样本不足或区间异常（compact 约 100 个交易日），结论仅供参考")
        if volatility > 25:
            risk_flags.append("⚠️ 近期波动较大（超过 25%）")
        if pe > 50 and pe > 0:
            risk_flags.append("⚠️ 估值处于高位（市盈率>50）")
        if change_pct_f < -5:
            risk_flags.append("⚠️ 短期跌幅较深（超过 5%）")
        if not risk_flags:
            risk_flags.append("✅ 暂无明显风险信号")
        pe_percentile = "暂无数据"
        if pe > 0:
            pe_percentile = "低估区间（历史后 30%）" if pe < 15 else "合理区间（历史 30%-70%）" if pe < 30 else "高估区间（历史前 30%）"
        if len(closes) >= 20:
            sma5 = sum(closes[-5:]) / 5
            sma20 = sum(closes[-20:]) / 20
            技术指标简述 = f"5日均线{round(sma5, 2)}；20日均线{round(sma20, 2)}；近{len(closes)}日区间{_fmt_range_cn(low_90, high_90)}元"
        else:
            技术指标简述 = ""

        return StockData(
            股票名称=name,
            股票代码=code,
            所属市场=market,
            最新价=price,
            涨跌幅=change,
            总市值=market_cap,
            市盈率=pe,
            市净率=pb,
            九十日均价=avg_90,
            九十日最高=high_90,
            九十日最低=low_90,
            波动率=volatility,
            数据时间=_fmt_now_cn(),
            风险信号=risk_flags,
            估值分位=pe_percentile,
            所属板块=sector,
            技术指标简述=技术指标简述,
            近期市场与板块简述="请结合当前年度及近期大盘与板块走势、该股近期走势综合分析。",
            公司简介=av_blurb,
        )

    def _mock_stock_data(self, code: str, market: str) -> StockData:
        """仅在真实行情不可用时使用；名称必须与用户输入代码一致，禁止写死某只股票。"""
        c = (code or "").strip() or "未知代码"
        return StockData(
            股票名称=f"【行情不可用·占位】{c}",
            股票代码=c,
            所属市场=market,
            最新价=0.0,
            涨跌幅="N/A",
            总市值="N/A",
            市盈率=None,
            市净率=None,
            九十日均价=0.0,
            九十日最高=0.0,
            九十日最低=0.0,
            波动率=0.0,
            数据时间=_fmt_now_cn(),
            风险信号=[
                "⚠️ 未能获取真实行情（网络、yfinance 或 Alpha Vantage 等）；以下为占位，不可作为投资依据",
            ],
            估值分位="暂无数据",
            公司简介="（行情不可用，无法拉取公司主营业务描述）",
            数据溯源="无可用源（占位数据）",
        )

# ==================== LLM 客户端 ====================
class LLMClient:
    """LLM 客户端封装"""

    def __init__(self, use_real: bool = True):
        self.use_real = use_real and HAS_OPENAI
        if self.use_real:
            self.client = OpenAI(
                base_url=CONFIG["LLM 配置"]["base_url"],
                api_key=CONFIG["LLM 配置"]["api_key"],
                timeout=120.0
            )
            self.model = CONFIG["LLM 配置"]["model"]
        else:
            self.client = None
            self.model = "mock"

    def chat(self, system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
        """发送对话请求。单次请求限时 120 秒，超时或失败时抛出异常以便任务明确失败。"""
        if not self.use_real:
            return self._mock_response(system_prompt, user_prompt)

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=temperature,
                max_tokens=CONFIG["LLM 配置"]["max_tokens"]
            )
            raw = response.choices[0].message.content or ""
            return self._clean_llm_output(raw)
        except Exception as e:
            err_msg = str(e).strip()
            if "timeout" in err_msg.lower() or "timed out" in err_msg.lower() or "TimeoutError" in type(e).__name__:
                raise RuntimeError(
                    "LLM 请求超时(120秒)，请检查 vllm 服务地址是否可达（如 vllm.tangbuy.cn）或稍后重试"
                ) from e
            raise RuntimeError(f"LLM 调用失败: {err_msg}") from e

    def _clean_llm_output(self, text: str) -> str:
        """移除模型输出中的思考过程、<think> 标签等，避免出现在报告中"""
        if not text or not isinstance(text, str):
            return text
        # 移除 <think>...</think>
        text = re.sub(r'<think>[\s\S]*?</think>', '', text, flags=re.IGNORECASE | re.DOTALL)
        # 移除行首的 think： 或 思考： 等
        text = re.sub(r'^(think|思考)[：:]\s*', '', text, flags=re.IGNORECASE | re.MULTILINE)
        # 移除可能残留的裸 <think> 内容（无闭合标签时，删到下一个 ## 或结尾）
        lines = text.split('\n')
        out = []
        skip = False
        for line in lines:
            if re.match(r'^\s*<think>\s*$', line, re.IGNORECASE):
                skip = True
                continue
            if skip:
                if re.match(r'^\s*</think>\s*$', line, re.IGNORECASE):
                    skip = False
                continue
            if 'think：' in line or 'think:' in line:
                line = re.sub(r'.*?(think[：:]\s*)?', '', line, count=1, flags=re.IGNORECASE)
            out.append(line)
        return '\n'.join(out).strip()

    def _mock_response(self, system_prompt: str, user_prompt: str) -> str:
        """模拟响应"""
        return """积极关注：估值合理，增长逻辑清晰。

## 数据解读
• 当前价位处于 90 日中位数附近
• 市盈率处于合理区间
• 无明显风险信号

## 角色视角分析
1. 行业处于成长期,市场空间广阔
2. 公司竞争地位稳固,护城河深
3. 增长驱动力明确,可持续性强

## 操作建议
• 仓位:核心配置 15%-20%
• 价位:逢低分批布局
• 观察点:季度业绩、行业政策

## 置信程度
85%（数据完整,逻辑清晰）"""


def _parse_json_object_from_llm(text: str) -> Optional[Dict[str, Any]]:
    """从模型输出中解析 JSON 对象。"""
    if not text or not isinstance(text, str):
        return None
    t = text.strip()
    if "```" in t:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", t, re.IGNORECASE)
        if m:
            t = m.group(1).strip()
    try:
        obj = json.loads(t)
        return obj if isinstance(obj, dict) else None
    except (json.JSONDecodeError, TypeError):
        return None


def _safe_float_note(x: Any) -> Optional[float]:
    if x is None:
        return None
    if isinstance(x, (int, float)):
        if x == x and -1e15 < x < 1e15:
            return float(x)
        return None
    s = str(x).strip().replace(",", "")
    if not s or s.lower() in ("null", "none", "n/a", "—", "-"):
        return None
    s = re.sub(r"[^\d.\-+eE]", "", s)
    if not s:
        return None
    try:
        v = float(s)
        return v if v == v else None
    except ValueError:
        return None


def _is_plausible_stock_display_name(name: str, code: str = "") -> bool:
    """判断字符串是否像「公司名/证券简称」，过滤备注与 OCR 误提取的行情整段。"""
    if not name or not isinstance(name, str):
        return False
    n = name.strip()
    if len(n) < 2 or len(n) > 72:
        return False
    if re.fullmatch(r"\d+", n):
        return False
    junk_markers = (
        "已收盘",
        "盘后",
        "美东",
        "换手率",
        "成交量",
        "成交额",
        "振幅",
        "平均价",
        "涨跌额",
        "万手",
        "亿元",
        "总股本",
        "流通市",
        "收盘价",
        "开盘价",
    )
    if any(m in n for m in junk_markers):
        return False
    if "%" in n:
        return False
    if re.search(r"\d{1,2}[:：]\d{2}", n):
        return False
    if n.count("+") >= 2 and re.search(r"\+\d", n):
        return False
    digit_ratio = sum(1 for c in n if c.isdigit()) / max(len(n), 1)
    if len(n) >= 10 and digit_ratio > 0.28:
        return False
    if re.fullmatch(r"[\d\s.+%\-，,、]+", n):
        return False
    if len(re.findall(r"\d+\.\d+", n)) >= 3:
        return False
    return True


def _sanitize_stock_display_name_field(sd: StockData, code: str) -> None:
    """名称字段若已被污染则清空，标题与上下文改用代码兜底。"""
    n = (sd.股票名称 or "").strip()
    if not n or n.startswith("【行情不可用"):
        return
    c = (code or sd.股票代码 or "").strip()
    if not _is_plausible_stock_display_name(n, c):
        sd.股票名称 = ""


def _security_context_label(sd: StockData) -> str:
    """分析师 Prompt 用：规范「公司（代码）」或仅代码。"""
    n = (sd.股票名称 or "").strip()
    c = (sd.股票代码 or "").strip()
    if n.startswith("【行情不可用"):
        return f"{n}（{c}）" if c else n
    if _is_plausible_stock_display_name(n, c):
        return f"{n}（{c}）" if c else n
    return c or "未知证券"


def _system_quantitative_block(sd: StockData, *, for_debate: bool = False) -> str:
    """系统拉取的行情+估值分位+90 日统计+技术指标（与用户备注无关的量化基准）。"""
    _rng90 = _fmt_range_cn(sd.九十日最低, sd.九十日最高)
    tech = (sd.技术指标简述 or "").strip()
    if not tech:
        tech = (
            "（当前数据源未返回均线/RSI/MACD 等明细，请基于 90 日区间、波动率与估值分位讨论价格位置与风险）"
        )
    lines = [
        "【系统行情与技术指标（行情源自动计算，为量化事实基准；用户备注仅作交叉核对，不得用备注替代本块）】",
        f"【最新价格】{_fmt_price(sd.最新价)}元（{sd.涨跌幅}）",
        f"【估值】市盈率{_fmt_pe(sd.市盈率)}倍｜市净率{_fmt_pb(sd.市净率)}倍｜估值历史分位：{sd.估值分位}",
        f"【90 日与波动】区间 {_rng90} 元｜波动率 {sd.波动率:.1f}%｜九十日均价 {_fmt_price(sd.九十日均价)} 元",
        f"【技术指标原文】{tech}",
    ]
    if for_debate:
        risks = ", ".join((sd.风险信号 or [])[:6])
        if risks:
            lines.append(f"【风险要点摘录】{risks}")
    else:
        lines.extend(
            [
                f"【总市值】{sd.总市值}",
                f"【风险信号】{', '.join(sd.风险信号 or [])}",
                f"【数据时间】{sd.数据时间}",
            ]
        )
    return "\n".join(lines)


def _analysis_report_title(sd: StockData) -> str:
    """Markdown 一级标题：禁止把未校验的备注碎片写进标题。"""
    n = (sd.股票名称 or "").strip()
    c = (sd.股票代码 or "").strip()
    if n.startswith("【行情不可用") and c:
        return f"{n}（{c}）投资价值分析"
    if _is_plausible_stock_display_name(n, c) and c:
        return f"{n}（{c}）投资价值分析"
    if c:
        return f"{c} 投资价值分析"
    return "投资价值分析"


def try_parse_user_notes_regex(notes: str) -> Dict[str, Any]:
    """对规整「键：值」类中文粘贴做轻量提取（无 LLM 时兜底）。"""
    d: Dict[str, Any] = {}
    if not notes or not isinstance(notes, str):
        return d
    text = notes.replace("\r\n", "\n")

    def first_float(pat: str) -> Optional[float]:
        m = re.search(pat, text, re.MULTILINE)
        if not m:
            return None
        return _safe_float_note(m.group(1))

    def first_str(pat: str) -> Optional[str]:
        m = re.search(pat, text, re.MULTILINE)
        if not m:
            return None
        s = (m.group(1) or "").strip()
        return s if s else None

    lp = first_float(r"(?:收盘价|最新价)[：:\s]*([\d,.\s]+)\s*元?")
    if lp is None:
        lp = first_float(r"(?:现价|当前价)[：:\s]*([\d,.\s]+)")
    if lp is not None and lp > 0:
        d["last_price"] = lp

    ch = first_str(r"涨跌幅[：:\s]*([+-]?[\d.]+\s*%|[+-]?[\d.]+%?)")
    if not ch:
        ch = first_str(
            r"(?:涨跌额\s*/\s*涨跌幅|涨跌幅)[：:\s]*[^\n]*?([+-]?[\d.]+\s*%)",
        )
    if ch and "%" not in ch:
        fv = _safe_float_note(ch)
        if fv is not None:
            ch = f"{fv:+.2f}%"
    if ch:
        d["change_pct"] = ch

    mcap = first_str(r"总市值[：:\s]*([^\n]+)")
    if mcap:
        d["total_mcap_str"] = mcap[:120]

    pe = first_float(r"市盈率(?:（TTM）|\(TTM\)|\s*TTM)?[：:\s]*([\d,.\s]+)\s*倍?")
    if pe is None:
        pe = first_float(r"市盈率[：:\s]*([\d,.\s]+)\s*倍?")
    if pe is not None and pe > 0:
        d["pe_ttm"] = pe

    pb = first_float(r"市净率(?:（PB）|\(PB\))?[：:\s]*([\d,.\s]+)\s*倍?")
    if pb is None:
        pb = first_float(r"市净率[：:\s]*([\d,.\s]+)\s*倍?")
    if pb is not None and pb > 0:
        d["pb"] = pb

    op = first_float(r"开盘[：:\s/]*([\d,.\s]+)\s*元?")
    hi = first_float(r"最高[：:\s/]*([\d,.\s]+)\s*元?")
    lo = first_float(r"最低[：:\s/]*([\d,.\s]+)\s*元?")
    pc = first_float(r"昨收[：:\s]*([\d,.\s]+)\s*元?")
    for k, v in (("open", op), ("high", hi), ("low", lo), ("prev_close", pc)):
        if v is not None and v > 0:
            d[k] = v

    w52h = first_float(
        r"52\s*周\s*最高[：:\s/]*([\d,.\s]+)",
    ) or first_float(r"52周最高[：:\s/]*([\d,.\s]+)")
    w52l = first_float(
        r"52\s*周\s*最低[：:\s/]*([\d,.\s]+)",
    ) or first_float(r"52周最低[：:\s/]*([\d,.\s]+)")
    if w52h is not None and w52h > 0:
        d["week52_high"] = w52h
    if w52l is not None and w52l > 0:
        d["week52_low"] = w52l

    to = first_str(r"换手率[：:\s]*([^\n%]+%?)")
    if to:
        d["turnover_rate"] = to[:40]

    vol = first_str(r"成交量[：:\s]*([^\n]+)")
    if vol:
        d["volume_summary"] = vol[:80]
    amt = first_str(r"成交额[：:\s]*([^\n]+)")
    if amt:
        d["amount_summary"] = amt[:80]

    nm = first_str(r"股票名称[：:\s]*([^\n]+)")
    if nm:
        nt = nm.strip()[:80]
        if _is_plausible_stock_display_name(nt, ""):
            d["stock_name"] = nt

    return d


def _note_value_is_absent(s: str) -> bool:
    t = (s or "").strip()
    return not t or t in ("无", "暂无", "暂无数据", "不明确", "未知", "—", "-", "N/A", "n/a", "null")


def _clean_user_notes_structured_llm(
    llm: "LLMClient",
    notes: str,
    code: str,
    market: str,
) -> str:
    """用固定十段格式清洗备注（乱码/OCR/混杂行情），只输出有效事实，不编造。"""
    sys_p = (
        "你是证券行情与基本面数据整理助手，只做从用户粘贴中提取与归类，不做投资建议、不预测、不补全缺失数据。"
        "必须忽略乱码、无意义字符、明显 OCR 错字；无法从原文可靠读出的项写「无」。"
        "第8段市盈率：原文若有具体数值（含小数）必须输出该数字（可带「倍」）；"
        "仅当原文明确因亏损等原因无法计算市盈率、且该段无任何市盈率数字时，才可写「亏损」或「无」；禁止用「亏损」代替原文已有数字。"
        "输出**仅**下列 10 行（按序号），每行一条，不要 markdown 代码围栏、不要前后解释。"
    )
    user_p = f"""表单股票代码：{code}；市场：{market}。

用户粘贴（可能含乱码、识别错误、与股票无关内容）：
---
{notes[:10000]}
---

请整理为清晰、规范的股票信息，**只提取真实有效数据**；没有的写「无」；市盈率有数字必须写数字，仅确实无法计算且无数字时写「亏损」，**禁止编造**。

严格按下面格式输出（共 10 行，序号与标题必须保留）：
1. 股票名称及代码：
2. 当日收盘价、涨跌额、涨跌幅：
3. 开盘价、最高价、最低价：
4. 换手率、振幅、成交量、成交额：
5. 52周最高、52周最低：
6. 总市值、流通市值：
7. 总股本、流通股本：
8. 市盈率、市净率：
9. 每股收益、每股净资产：
10. 股息率："""
    raw = (llm.chat(sys_p, user_p, temperature=0.1) or "").strip()
    if "```" in raw:
        m = re.search(r"```(?:\w*)?\s*([\s\S]*?)```", raw)
        if m:
            raw = m.group(1).strip()
    return raw


def _split_numbered_note_sections(text: str) -> Dict[int, str]:
    """按行首「数字.」切分清洗稿各段。"""
    out: Dict[int, str] = {}
    text = (text or "").strip()
    if not text:
        return out
    pat = re.compile(r"(?m)^(\d+)\.\s")
    matches = list(pat.finditer(text))
    for i, m in enumerate(matches):
        num = int(m.group(1))
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        out[num] = text[start:end].strip()
    return out


def _section_inline_body(first_line: str, rest_lines: str) -> str:
    """取段内正文：优先取标题行冒号后，否则取后续行。"""
    first_line = (first_line or "").strip()
    rest_lines = (rest_lines or "").strip()
    for sep in ("：", ":"):
        if sep in first_line:
            right = first_line.split(sep, 1)[1].strip()
            if right:
                return (right + ("\n" + rest_lines if rest_lines else "")).strip()
            return rest_lines
    return (rest_lines or first_line).strip()


def _parse_structured_cleaned_notes_to_dict(cleaned: str) -> Dict[str, Any]:
    """将十段清洗稿解析为 merge_user_notes_dict 使用的英文键。"""
    d: Dict[str, Any] = {}
    sections = _split_numbered_note_sections(cleaned)
    if not sections:
        return d

    def body(n: int) -> str:
        block = sections.get(n) or ""
        if not block:
            return ""
        lines = block.split("\n", 1)
        first = lines[0]
        rest = lines[1] if len(lines) > 1 else ""
        return _section_inline_body(first, rest)

    # 1. 名称及代码
    b1 = body(1)
    if b1 and not _note_value_is_absent(b1):
        if "（" in b1 and "）" in b1:
            name_part = b1.split("（", 1)[0].strip()
            if _is_plausible_stock_display_name(name_part, ""):
                d["stock_name"] = name_part[:80]
        elif _is_plausible_stock_display_name(b1, ""):
            d["stock_name"] = b1[:80]

    # 2. 收盘、涨跌
    b2 = body(2)
    if b2 and not _note_value_is_absent(b2):
        lp = None
        for pat in (
            r"收盘价[：:\s]*([\d,.\s]+)\s*元?",
            r"当日收盘价[：:\s]*([\d,.\s]+)\s*元?",
            r"(?:^|[^\d])([\d,]+\.[\d]+)\s*元",
        ):
            m = re.search(pat, b2)
            if m:
                lp = _safe_float_note(m.group(1))
                if lp is not None and lp > 0:
                    d["last_price"] = lp
                    break
        ch = None
        m = re.search(
            r"涨跌幅[：:\s]*([+-]?[\d.]+\s*%|[+-]?[\d.]+%?)",
            b2,
        )
        if m:
            ch = m.group(1).strip()
        if not ch:
            m = re.search(r"([+-]?\d+\.?\d*)\s*%", b2)
            if m:
                ch = m.group(1).strip()
                if "%" not in ch:
                    fv = _safe_float_note(ch)
                    if fv is not None:
                        ch = f"{fv:+.2f}%"
        if ch and not _note_value_is_absent(ch):
            if "%" not in ch:
                fv = _safe_float_note(ch)
                if fv is not None:
                    ch = f"{fv:+.2f}%"
            d["change_pct"] = ch

    # 3. 开高低
    b3 = body(3)
    if b3 and not _note_value_is_absent(b3):
        for key, pat in (
            ("open", r"开盘价[：:\s/]*([\d,.\s]+)\s*元?"),
            ("high", r"最高价[：:\s/]*([\d,.\s]+)\s*元?"),
            ("low", r"最低价[：:\s/]*([\d,.\s]+)\s*元?"),
        ):
            m = re.search(pat, b3)
            if m:
                v = _safe_float_note(m.group(1))
                if v is not None and v > 0:
                    d[key] = v
        m = re.search(r"昨收[：:\s]*([\d,.\s]+)\s*元?", b3)
        if m:
            v = _safe_float_note(m.group(1))
            if v is not None and v > 0:
                d["prev_close"] = v

    # 4. 换手、振幅、量额
    b4 = body(4)
    if b4 and not _note_value_is_absent(b4):
        m = re.search(r"换手率[：:\s]*([^\n]+)", b4)
        if m:
            t = m.group(1).strip().split("；")[0].split(";")[0].strip()[:40]
            if not _note_value_is_absent(t):
                d["turnover_rate"] = t
        m = re.search(r"振幅[：:\s]*([^\n；;]+)", b4)
        if m:
            t = m.group(1).strip()[:40]
            if not _note_value_is_absent(t):
                d["amplitude_str"] = t
        m = re.search(r"成交量[：:\s]*([^\n]+)", b4)
        if m:
            t = m.group(1).strip()[:80]
            if not _note_value_is_absent(t):
                d["volume_summary"] = t
        m = re.search(r"成交额[：:\s]*([^\n]+)", b4)
        if m:
            t = m.group(1).strip()[:80]
            if not _note_value_is_absent(t):
                d["amount_summary"] = t

    # 5. 52 周
    b5 = body(5)
    if b5 and not _note_value_is_absent(b5):
        m = re.search(
            r"52\s*周\s*最高[：:\s/]*([\d,.\s]+)",
            b5,
        ) or re.search(r"52周最高[：:\s/]*([\d,.\s]+)", b5)
        if m:
            v = _safe_float_note(m.group(1))
            if v is not None and v > 0:
                d["week52_high"] = v
        m = re.search(
            r"52\s*周\s*最低[：:\s/]*([\d,.\s]+)",
            b5,
        ) or re.search(r"52周最低[：:\s/]*([\d,.\s]+)", b5)
        if m:
            v = _safe_float_note(m.group(1))
            if v is not None and v > 0:
                d["week52_low"] = v

    # 6. 市值
    b6 = body(6)
    if b6 and not _note_value_is_absent(b6):
        m = re.search(r"总市值[：:\s]*([^\n；;]+)", b6)
        if m:
            t = m.group(1).strip()[:120]
            if not _note_value_is_absent(t):
                d["total_mcap_str"] = t
        m = re.search(r"流通市值[：:\s]*([^\n；;]+)", b6)
        if m:
            t = m.group(1).strip()[:120]
            if not _note_value_is_absent(t):
                d["float_mcap"] = t

    # 7. 股本
    b7 = body(7)
    if b7 and not _note_value_is_absent(b7):
        m = re.search(r"总股本[：:\s]*([^\n；;]+)", b7)
        if m:
            t = m.group(1).strip()[:80]
            if not _note_value_is_absent(t):
                d["total_shares"] = t
        m = re.search(r"流通股本[：:\s]*([^\n；;]+)", b7)
        if m:
            t = m.group(1).strip()[:80]
            if not _note_value_is_absent(t):
                d["float_shares"] = t

    # 8. PE PB（数值优先：同段同时出现数字与「亏损」描述时，必须以数字为准）
    b8 = body(8)
    if b8 and not _note_value_is_absent(b8):
        pe_patterns = (
            r"市盈率(?:（TTM）|\(TTM\)|\s*TTM)?[：:\s]*([\d,.\s]+)\s*倍?",
            r"市盈率[：:\s]*([\d,.\s]+)\s*倍?",
            r"P/E(?:\s*TTM)?[：:\s]*([\d,.\s]+)",
            r"\bPE\s*(?:TTM)?[：:\s]*([\d,.\s]+)",
        )
        for pat in pe_patterns:
            m_pe = re.search(pat, b8, re.IGNORECASE)
            if not m_pe:
                continue
            raw_pe = (m_pe.group(1) or "").strip().replace(",", "")
            if not raw_pe:
                continue
            pe = _safe_float_note(raw_pe)
            if pe is not None and pe > 0:
                d["pe_ttm"] = pe
                break
        if "pe_ttm" not in d:
            # 仅当冒号/空格后明确写亏损，且未解析到有效市盈率数字
            if re.search(
                r"市盈率(?:（TTM）|\(TTM\)|\s*TTM)?\s*[：:]\s*亏损\b",
                b8,
            ) or re.search(
                r"市盈率(?:（TTM）|\(TTM\))?\s+亏损\b",
                b8,
            ):
                d["pe_ttm_str"] = "亏损"
        if "pe_ttm" in d:
            d.pop("pe_ttm_str", None)
        m = re.search(r"市净率(?:（PB）|\(PB\))?[：:\s]*([\d,.\s]+)\s*倍?", b8)
        if not m:
            m = re.search(r"市净率[：:\s]*([\d,.\s]+)\s*倍?", b8)
        if m:
            pb = _safe_float_note(m.group(1))
            if pb is not None and pb > 0:
                d["pb"] = pb

    # 9. EPS BPS
    b9 = body(9)
    if b9 and not _note_value_is_absent(b9):
        m = re.search(r"每股收益[：:\s]*([^\n；;]+)", b9)
        if m:
            t = m.group(1).strip()[:60]
            if not _note_value_is_absent(t):
                d["eps"] = t
        m = re.search(r"每股净资产[：:\s]*([^\n；;]+)", b9)
        if m:
            t = m.group(1).strip()[:60]
            if not _note_value_is_absent(t):
                d["bps"] = t

    # 10. 股息率
    b10 = body(10)
    if b10 and not _note_value_is_absent(b10):
        m = re.search(r"股息率[：:\s]*([^\n]+)", b10)
        if m:
            t = m.group(1).strip()[:40]
            if not _note_value_is_absent(t):
                d["dividend_yield"] = t

    return d


def merge_user_notes_dict_into_stock_data(
    sd: StockData,
    d: Dict[str, Any],
    *,
    append_supplement_bullets: bool = True,
) -> None:
    """将整理结果并入 StockData：补充摘录优先填补接口侧空缺或占位行情。"""
    if not d:
        return

    sn = d.get("stock_name")
    if isinstance(sn, str) and sn.strip():
        s = sn.strip()[:80]
        code_guess = (sd.股票代码 or "").strip()
        if _is_plausible_stock_display_name(s, code_guess):
            if not sd.股票名称 or (sd.股票名称 or "").startswith("【行情不可用"):
                sd.股票名称 = s

    lp = _safe_float_note(d.get("last_price"))
    if lp is not None and lp > 0 and (sd.最新价 or 0) <= 0:
        sd.最新价 = float(lp)

    ch = d.get("change_pct")
    if isinstance(ch, str) and ch.strip():
        s = ch.strip()
        if "%" not in s:
            fv = _safe_float_note(s)
            if fv is not None:
                s = f"{fv:+.2f}%"
        if not (sd.涨跌幅 or "").strip():
            sd.涨跌幅 = s

    tm = d.get("total_mcap_str")
    if isinstance(tm, str) and tm.strip():
        bad = ("", "暂无", "N/A", "暂无（腾讯源）", "暂无（腾讯源无总市值）")
        if (not sd.总市值) or sd.总市值 in bad:
            sd.总市值 = tm.strip()[:120]

    pe_num = _safe_float_note(d.get("pe_ttm"))
    has_pe_num = pe_num is not None and pe_num > 0
    pe_loss = (
        not has_pe_num
        and isinstance(d.get("pe_ttm_str"), str)
        and "亏损" in str(d.get("pe_ttm_str"))
    )
    if has_pe_num:
        if sd.市盈率 is None or (sd.市盈率 or 0) <= 0:
            sd.市盈率 = float(pe_num)

    pb = _safe_float_note(d.get("pb"))
    if pb is not None and pb > 0:
        if sd.市净率 is None or (sd.市净率 or 0) <= 0:
            sd.市净率 = float(pb)

    # 用 52 周或 OHLC 补强 90 日区间（仅当原区间退化或全为 0）
    hi_c = _safe_float_note(d.get("week52_high")) or _safe_float_note(d.get("high"))
    lo_c = _safe_float_note(d.get("week52_low")) or _safe_float_note(d.get("low"))
    if hi_c and lo_c and hi_c > 0 and lo_c > 0 and hi_c >= lo_c:
        if (
            sd.九十日最高 <= 0
            or sd.九十日最低 <= 0
            or abs(sd.九十日最高 - sd.九十日最低) < 1e-6 * max(sd.九十日最高, 1)
        ):
            sd.九十日最高 = float(hi_c)
            sd.九十日最低 = float(lo_c)
            _lp = _safe_float_note(d.get("last_price"))
            sd.九十日均价 = float(
                (hi_c + lo_c + max(sd.最新价 or 0, _lp or 0)) / 3.0,
            )

    if not append_supplement_bullets:
        return

    lines: List[str] = []
    for label, key in (
        ("开盘", "open"),
        ("最高", "high"),
        ("最低", "low"),
        ("昨收", "prev_close"),
        ("52周高", "week52_high"),
        ("52周低", "week52_low"),
        ("换手率", "turnover_rate"),
        ("振幅", "amplitude_str"),
        ("成交量", "volume_summary"),
        ("成交额", "amount_summary"),
        ("流通市值", "float_mcap"),
        ("总股本", "total_shares"),
        ("流通股本", "float_shares"),
        ("每股收益", "eps"),
        ("每股净资产", "bps"),
        ("股息率", "dividend_yield"),
    ):
        v = d.get(key)
        if v is None or v == "":
            continue
        if isinstance(v, (int, float)) and v == v:
            lines.append(f"- {label}：{v}")
        else:
            s = str(v).strip()
            if s and s.lower() != "null":
                lines.append(f"- {label}：{s[:200]}")
    if pe_loss:
        lines.append("- 市盈率：亏损（补充整理）")
    ex = d.get("extra")
    if isinstance(ex, str) and ex.strip():
        lines.append(f"- 其它：{ex.strip()[:800]}")
    if lines:
        block = "\n".join(lines)
        if (sd.用户补充指标 or "").strip():
            sd.用户补充指标 = (sd.用户补充指标.strip() + "\n" + block).strip()
        else:
            sd.用户补充指标 = block


def _supplement_context_hint(stock_data: StockData) -> str:
    """有补充摘录/结构化指标时，提示各分析师如何分流引用价量与每股数据。"""
    has = (stock_data.用户补充指标 or "").strip() or (
        stock_data.用户备注原文 or ""
    ).strip()
    if not has:
        return ""
    return (
        "【数据分流与引用要求】上文「系统行情与技术指标」中的 90 日区间、波动率、估值历史分位、均线/RSI 等为**优先引用**的量化基准；"
        "用户摘录中的开盘/最高/最低/昨收、换手率、成交量额、52 周高低、股本/股息/每股指标等由技术专家侧重价量、风险分析师侧重异常与边界、成长投资者侧重每股与估值匹配、市场专家侧重体量与结构。"
        "禁止仅用用户备注写完分析而完全不提系统技术指标与分位/区间。"
    )


def _debate_supplement_block(stock_data: StockData, max_chars: int = 900) -> str:
    s = (stock_data.用户补充指标 or "").strip()
    if not s:
        return ""
    if len(s) > max_chars:
        s = s[: max_chars - 1] + "…"
    return (
        "\n【用户补充摘录（次要；须与上文系统量化块对照，多头空头均应引用系统区间/波动率/分位或技术指标中的至少一项）】\n"
        f"{s}\n"
    )


# ==================== 多智能体分析师 ====================
class MultiAgentStockAnalyst:
    """多智能体股票分析师"""

    def __init__(self, use_real_llm: bool = True, debate_rounds: int = 1):
        self.use_real_llm = use_real_llm
        self.debate_rounds = debate_rounds
        self.llm = LLMClient(use_real=use_real_llm)
        self.data_service = StockDataService()
        self.analyst_configs = ANALYST_PROMPTS

    def _apply_user_data_notes(
        self,
        stock_data: StockData,
        notes: str,
        stock_code: str,
        market: str,
    ) -> None:
        """保存补充栏原文，经规则/LLM 提取后并入 StockData（补缺，不覆盖已有有效行情）。"""
        max_len = 12000
        raw = notes if len(notes) <= max_len else notes[:max_len]
        stock_data.用户备注原文 = raw

        reg = try_parse_user_notes_regex(raw)
        cleaned_text: Optional[str] = None
        if self.use_real_llm:
            try:
                cleaned_text = _clean_user_notes_structured_llm(
                    self.llm, raw, stock_code, market,
                )
            except Exception:
                cleaned_text = None

        merged: Dict[str, Any] = dict(reg)
        use_structured = bool(
            cleaned_text
            and len(_split_numbered_note_sections(cleaned_text)) >= 3,
        )
        if use_structured:
            parsed = _parse_structured_cleaned_notes_to_dict(cleaned_text or "")
            for k, v in parsed.items():
                if v is not None and v != "":
                    merged[k] = v
        _msn = merged.get("stock_name")
        if isinstance(_msn, str) and not _is_plausible_stock_display_name(
            _msn.strip(), stock_code,
        ):
            merged.pop("stock_name", None)

        merge_user_notes_dict_into_stock_data(
            stock_data,
            merged,
            append_supplement_bullets=not use_structured,
        )
        if use_structured and cleaned_text:
            stock_data.用户补充指标 = cleaned_text.strip()
        _sanitize_stock_display_name_field(stock_data, stock_code)

        hint = "部分指标来自补充摘录，请注意时效与口径，以官方披露为准。"
        rs = list(stock_data.风险信号 or [])
        if hint not in rs:
            rs.append(hint)
            stock_data.风险信号 = rs

        trace = "补充字段（规则/模型归并）"
        prev = (stock_data.数据溯源 or "").strip()
        stock_data.数据溯源 = f"{prev}；{trace}" if prev else trace

    def analyze(self, stock_code: str, stock_name: str = None,
                market: str = "A 股", days: int = 90,
                selected_analysts: List[str] = None,
                reports_dir: Optional[Path] = None,
                client_quote: Optional[Dict[str, Any]] = None,
                user_data_notes: Optional[str] = None) -> FinalReport:
        """执行完整分析流程。reports_dir 若提供，会加载该股票最近 3 份报告并生成「对比与异动」板块。"""

        print("\n" + "═"*60)
        print("🚀 多智能体股票分析框架 - 启动")
        print("═"*60)

        # 步骤 1: 获取股票数据
        print(f"\n📊 步骤 1: 获取 {stock_code} 市场数据...")
        stock_data = self.data_service.get_stock_info(
            stock_code, market, days, client_quote=client_quote,
        )
        if user_data_notes and user_data_notes.strip():
            self._apply_user_data_notes(
                stock_data,
                user_data_notes.strip(),
                stock_code,
                market,
            )
        elif stock_name and stock_name.strip():
            _sn = stock_name.strip()[:80]
            if _is_plausible_stock_display_name(_sn, stock_code):
                stock_data.股票名称 = _sn
        self.data_service.post_enrich_stock_data(stock_data, stock_code, market, days)
        _sanitize_stock_display_name_field(stock_data, stock_code)

        data_summary = f"{_security_context_label(stock_data)}｜{_fmt_price(stock_data.最新价)}元｜{stock_data.涨跌幅}｜市盈率{_fmt_pe(stock_data.市盈率)}倍"
        print(f"   ✅ {data_summary}")

        # 步骤 2: 多分析师分析（不再使用股票新闻参与分析）
        if selected_analysts is None:
            selected_analysts = list(CONFIG["分析配置"]["默认分析师"])

        print(f"\n📈 步骤 2: 多角色分析（{len(selected_analysts)} 位分析师）")
        analyst_reports = []
        for analyst_name in selected_analysts:
            if analyst_name in self.analyst_configs:
                report = self._run_single_analyst(analyst_name, stock_data)
                analyst_reports.append(report)
                print(f"   ✅ {analyst_name}: {report.投资建议}")

        # 步骤 3: 多空辩论
        print(f"\n💬 步骤 3: 多空辩论（{self.debate_rounds} 轮）")
        debate_rounds = self._run_debate(stock_data, analyst_reports)
        for d in debate_rounds:
            print(f"   ✅ 第{d.轮次编号}轮:{d.裁判结论[:20]}...")

        # 步骤 4: 融合生成最终报告
        print(f"\n📋 步骤 4: 生成融合报告...")
        final_report = self._generate_final_report(stock_data, analyst_reports, debate_rounds)

        # 步骤 4b: 若有历史报告，生成「对比上次变化与异动信号」
        if reports_dir is not None:
            historical_summaries = get_recent_report_summaries(Path(reports_dir), market, stock_code, n=3)
            if historical_summaries:
                print(f"   📌 参考最近 {len(historical_summaries)} 份历史报告，生成对比与异动...")
                final_report.对比与异动 = self._generate_changes_section(final_report, historical_summaries)

        print(f"\n{'='*60}")
        print(f"✅ 分析完成！共识程度:{final_report.共识程度*100:.0f}%")
        print(f"{'='*60}\n")

        return final_report

    def _run_single_analyst(self, analyst_name: str, stock_data: StockData) -> AnalystReport:
        """运行单个分析师。仅基于行情与基本面数据，不使用新闻。"""
        config = self.analyst_configs[analyst_name]

        # 构建数据上下文（价格与市盈率统一保留 2 位小数）
        _now = _now_cn()
        _year = _now.year
        _date_constraint = f"【当前日期】{_now.strftime('%Y年%m月%d日')}（{_year}年）。严禁在分析中将 2023、2024 等过往年份当作「当前」或「近期」；不得引用旧年份数据作为当前依据；若必须提历史须明确标注「历史（某年）」。"

        _rng90 = _fmt_range_cn(stock_data.九十日最低, stock_data.九十日最高)
        data_context = f"""【股票信息】{_security_context_label(stock_data)}
{_date_constraint}
{_system_quantitative_block(stock_data, for_debate=False)}
【区间书写规范】全文写 90 日区间须带分隔符，使用「{_rng90}」或「{_fmt_price(stock_data.九十日最低)} 至 {_fmt_price(stock_data.九十日最高)}」；禁止无分隔连写（错误示例：80 与 100 写成 80100）。"""
        if (stock_data.数据溯源 or "").strip():
            data_context += f"\n【数据溯源】{stock_data.数据溯源.strip()}"
        if stock_data.所属板块:
            data_context += f"\n【所属板块】{stock_data.所属板块}"
        if (stock_data.公司简介 or "").strip():
            data_context += f"\n【公司主营业务与简介】{stock_data.公司简介.strip()}"
        if stock_data.近期市场与板块简述:
            data_context += f"\n【近期市场与板块】{stock_data.近期市场与板块简述}"
        if (stock_data.用户补充指标 or "").strip() or (
            stock_data.用户备注原文 or ""
        ).strip():
            uro = (stock_data.用户备注原文 or "").strip()
            if uro:
                cap = 1800
                excerpt = uro if len(uro) <= cap else uro[:cap] + "…"
                data_context += f"\n【用户备注原文（摘录；口径可能与系统行情不一致，须与上文「系统行情与技术指标」对照）】\n{excerpt}"
            ubi = (stock_data.用户补充指标 or "").strip()
            if ubi:
                cap2 = 3500
                ubi_show = ubi if len(ubi) <= cap2 else ubi[:cap2] + "…"
                data_context += f"\n【用户结构化摘录（盘口/股本等补充；不可替代系统计算的区间、波动率、估值分位与技术指标原文）】\n{ubi_show}"
            _hint = _supplement_context_hint(stock_data)
            if _hint:
                data_context += f"\n{_hint}"

        # 本角色专属数据（突出专业切入点，避免各板块重复堆砌相同数据）
        role_data = config.get("本角色专属数据", "")
        role_data_block = ""
        if role_data:
            role_data_block = f"""
【本角色专属数据与输出要求】
你应重点引用并深度解读的数据：{role_data}
【硬性要求】正文中须至少明确引用一项上文「系统行情与技术指标」中的量化事实（例如：均线位置或金叉/死叉、RSI 区间、90 日区间上下沿与现价相对位置、波动率高低、估值历史分位等），不得整篇只围绕用户备注发挥。
**禁止**单独再写「## 本角色数据支撑」小节（与全局摘要、本节「数据解读」重复，显啰嗦）。上述专属数据与系统量化事实**只**写在「## 数据解读」的 3～5 条里（每条：数据点 + 一句解读）；可与其它角色引用同一事实但解读角度须不同，避免同句复读。"""

        # 构建分析提示词
        prompt = f"""{data_context}

【分析任务】基于以上数据，对该股票进行投资价值分析。
【时效性硬性约束】当前日期为 {_now.strftime('%Y年%m月%d日')}（{_now.year}年）。输入与输出均不得将 2023、2024 等旧年份作为「当前」或「近期」引用；禁止「2023年…」「2024年目标」等过时表述。若必须提历史，须明确写「历史数据（某年）」且不占主要篇幅。「今年」「当前」「近期」仅指 {_now.year} 年及最近 12 个月。违反则分析无效。
不要输出思考过程、<think> 或 think 标签，仅输出正式分析内容。
{role_data_block}

【输出结构】
【开篇】第一自然段用 1 句话明确观点（积极关注/谨慎观望/建议规避 + 核心理由）。**不要**使用「## 核心结论」或任何单独的核心结论标题——界面卡片顶栏已展示角色名与投资建议，重复标题会造成版式重复。

## 数据解读
（从本角色视角写 3～5 条，**仅此一处**承载「数据 + 解读」：必须覆盖上文「系统行情与技术指标」中与己相关的量化项——如技术专家写均线/RSI/区间位置；成长/市场写估值分位与波动弹性；风险写波动率与区间边界风险等；每条先点出系统块中的具体数字或原文再写一句专业判断。可辅以用户摘录作验证，但不得仅用备注代替系统块。**不要**再另设「本角色数据支撑」标题。）

## 角色视角分析
（从{config['角色定位']}角度，列 3 条核心观点；此处以逻辑与判断为主，避免再逐条复述已在「数据解读」出现过的同一串数字）

## 操作建议
• 仓位建议:...
• 关注价位:...
• 关键观察:...

## 置信程度
（高/中高/中/偏低,并简述理由）

【要求】全程简体中文，禁用英文，专业术语附解释。每条观点简洁；量化数据只在「数据解读」展开一次即可。输出中不要使用 ** 或 * 做加粗/强调，用自然段与标题层级（##）区分即可。"""

        # 调用 LLM
        analysis = self.llm.chat(config["系统提示词"], prompt)
        analysis = _strip_core_conclusion_heading(analysis or "")
        analysis = _strip_role_data_support_section(analysis)

        # 解析响应
        recommendation = self._extract_recommendation(analysis)
        confidence = self._extract_confidence(analysis)
        key_points = self._extract_key_points(analysis)
        data_refs = self._extract_data_refs(analysis, stock_data)

        return AnalystReport(
            分析师姓名=config["角色名称"],
            角色定位=config["角色定位"],
            核心分析=analysis,
            投资建议=recommendation,
            置信程度=confidence,
            核心要点=key_points,
            角色权重=config["权重系数"],
            数据引用=data_refs
        )

    def _run_debate(self, stock_data: StockData, reports: List[AnalystReport]) -> List[DebateRound]:
        """运行多空辩论"""
        debate_rounds = []

        # 汇总观点
        summary = "\n".join([f"• {r.分析师姓名}: {r.投资建议}（置信度{r.置信程度*100:.0f}%）" for r in reports])

        for round_num in range(1, self.debate_rounds + 1):
            print(f"   🔄 辩论第{round_num}轮...")

            _year = _now_cn().year
            _date_note = f"【时效】当前为 {_year} 年，勿将 2023、2024 等旧年份当作当前或近期引用。"

            # 多头观点
            _deb_ex = _debate_supplement_block(stock_data)
            _deb_quant = _system_quantitative_block(stock_data, for_debate=True)
            bull_prompt = f"""基于以下分析师观点,总结看涨理由:
{summary}

【股票信息】{_security_context_label(stock_data)}
{_deb_quant}
{_deb_ex}
{_date_note}

请从增长机会、市场趋势、竞争优势等角度给出看涨论证。
至少列出 3 个核心理由；每条须引用上文系统量化块中的具体数据（如区间位置、波动率、估值分位、均线或 RSI 等至少一类），不得只复述用户摘录。"""

            bull_arg = self.llm.chat(DEBATE_PROMPTS["多头研究员"], bull_prompt)

            # 空头观点
            bear_prompt = f"""基于以下分析师观点,总结看跌理由:
{summary}

【股票信息】{_security_context_label(stock_data)}
{_deb_quant}
{_deb_ex}
{_date_note}

请从风险因素、竞争威胁、市场挑战等角度给出看跌论证。
至少列出 3 个核心理由；每条须引用上文系统量化块中的具体数据（如区间位置、波动率、估值分位、均线或 RSI 等至少一类），不得只复述用户摘录。"""

            bear_arg = self.llm.chat(DEBATE_PROMPTS["空头研究员"], bear_prompt)

            # 裁判决定
            judge_prompt = f"""基于以下辩论:

【多头观点】
{bull_arg}

【空头观点】
{bear_arg}

【系统量化事实（裁判须对照，不可无视）】
{_deb_quant}
{_deb_ex}
{_date_note}

请作为裁判,给出最终判断（看涨/看跌/中立）并说明理由。
同时指出:1.双方共识点 2.核心分歧点 3.需要验证的关键变量
裁判结论中须点名现价相对 90 日区间、波动率或估值分位中的至少一项，以体现多空力量与价格位置的关系。"""

            judge_decision = self.llm.chat(DEBATE_PROMPTS["裁判"], judge_prompt)

            # 解析共识点和分歧点
            consensus_points = self._extract_section(judge_decision, "共识")
            divergence_points = self._extract_section(judge_decision, "分歧")

            debate_rounds.append(DebateRound(
                轮次编号=round_num,
                多头观点=bull_arg,
                空头观点=bear_arg,
                裁判结论=judge_decision,
                共识点=consensus_points,
                分歧点=divergence_points
            ))

        return debate_rounds

    def _generate_final_report(self, stock_data: StockData,
                                reports: List[AnalystReport],
                                debate_rounds: List[DebateRound]) -> FinalReport:
        """生成融合报告"""

        # 计算加权得分
        score_map = {"积极": 1, "观望": 0, "谨慎": -1}
        weighted_score = 0
        total_weight = 0

        for r in reports:
            weight = r.置信程度 * r.角色权重
            score = score_map.get(r.投资建议,0)
            weighted_score += score * weight
            total_weight += weight

        consensus_score = weighted_score / total_weight if total_weight > 0 else 0

        if consensus_score > 0.3:
            rec_type = "积极"
        elif consensus_score < -0.3:
            rec_type = "谨慎"
        else:
            rec_type = "观望"

        # 整合核心逻辑链（先于最终建议，用于写清「依据」与「关键变量」）
        all_points = []
        for r in reports:
            for pt in r.核心要点:
                if pt and pt not in [p[0] for p in all_points]:
                    all_points.append((pt, r.置信程度))

        top_points = sorted(all_points, key=lambda x: x[1], reverse=True)[:5]

        sup = (stock_data.用户补充指标 or "").strip()
        key_extra = ""
        if sup:
            bullets = [
                ln.strip()[2:].strip()
                for ln in sup.split("\n")
                if ln.strip().startswith("- ")
            ]
            if bullets:
                key_extra = "\n• 盘面与估值摘录：\n" + "\n".join(
                    f"  - {(b[:52] + '…') if len(b) > 52 else b}" for b in bullets[:6]
                )

        # 生成融合摘要（系统量化与备注并列，避免模型与用户只看摘录）
        support_count = len([r for r in reports if r.投资建议 == rec_type])
        _rng_snap = _fmt_range_cn(stock_data.九十日最低, stock_data.九十日最高)
        _tech_one = (stock_data.技术指标简述 or "").replace("\n", " ").strip()
        if len(_tech_one) > 160:
            _tech_one = _tech_one[:160] + "…"
        if not _tech_one:
            _tech_one = "暂无简述"
        summary = f"""📊 融合分析摘要
• 分析师共识:{support_count}/{len(reports)} 位分析师支持"{rec_type}"
• 加权得分:{consensus_score:+.2f}（>+0.3 看好,<-0.3 谨慎）
• 核心逻辑链:
{chr(10).join(f'  {i+1}. {pt[0]}（置信度{pt[1]*100:.0f}%）' for i, pt in enumerate(top_points))}
• 关键数据（系统行情）:{_fmt_price(stock_data.最新价)}元｜市盈率{_fmt_pe(stock_data.市盈率)}倍｜市净率{_fmt_pb(stock_data.市净率)}倍｜估值历史分位：{stock_data.估值分位}
• 区间与波动: 90 日 {_rng_snap} 元｜波动率 {stock_data.波动率:.1f}%｜技术摘录：{_tech_one}{key_extra}"""

        _tech_tbl = (stock_data.技术指标简述 or "暂无").replace("|", "｜")
        if len(_tech_tbl) > 220:
            _tech_tbl = _tech_tbl[:220] + "…"
        数据快照系统指标表行 = (
            f"| 估值历史分位 | {stock_data.估值分位} | 相对历史的 PE 位置 |\n"
            f"| 90 日价格区间 | {_rng_snap} 元 | 支撑/压力与趋势参考 |\n"
            f"| 波动率 | {stock_data.波动率:.1f}% | 波动环境 |\n"
            f"| 技术指标简述 | {_tech_tbl} | 均线/RSI/MACD 等综合 |"
        )

        # 操作建议
        position_suggestion = "15%-20%" if consensus_score > 0.3 else "5%-10%" if consensus_score > 0 else "暂不建仓"

        _low_ref = stock_data.九十日最低 or stock_data.最新价 or 0.0
        if _low_ref <= 0:
            _low_ref = stock_data.最新价 or 1.0

        observe_kw = [
            "季度业绩、行业政策、竞争格局变化",
            "90 日区间上下沿与波动率是否突破或假突破",
            "估值历史分位与技术指标（均线、RSI 等）是否同向",
        ]
        if sup:
            if any(k in sup for k in ("换手", "成交量", "成交额")):
                observe_kw.insert(0, "成交量与换手率是否持续异常")
            if "52" in sup and "周" in sup:
                observe_kw.append("52周相对位置与突破有效性")
            if "股息" in sup or "每股收益" in sup or "每股净资产" in sup:
                observe_kw.append("每股盈利与回报/资产质量变化")
        observe_str = "、".join(observe_kw[:5])

        final_rec = _build_final_recommendation_text(
            rec_type, top_points, debate_rounds, observe_str,
        )

        return FinalReport(
            分析主题=_analysis_report_title(stock_data),
            股票代码=stock_data.股票代码,
            生成时间=_fmt_now_cn(),
            数据基准=f"{_fmt_price(stock_data.最新价)}元｜{stock_data.涨跌幅}｜市盈率{_fmt_pe(stock_data.市盈率)}倍",
            分析师报告=reports,
            辩论轮次=debate_rounds,
            融合摘要=summary,
            最终建议=final_rec,
            共识程度=round(abs(consensus_score), 2),
            加权得分=round(consensus_score, 2),
            核心逻辑链=[pt[0] for pt in top_points],
            风险提示=stock_data.风险信号,
            操作建议={
                "仓位建议": position_suggestion,
                "关注价位": f"{_low_ref * 0.95:.2f}元以下分批布局",
                "止损参考": f"有效跌破{_low_ref * 0.9:.2f}元重新评估",
                "关键观察": observe_str,
            },
            快照补充说明=sup,
            数据快照系统指标表行=数据快照系统指标表行,
        )

    def _generate_changes_section(self, report: FinalReport, historical_summaries: List[str]) -> str:
        """根据当前报告与最近几份历史报告摘要，生成「对比上次变化与异动信号」解读。"""
        if not historical_summaries:
            return ""
        _year = _now_cn().year
        prompt = f"""【当前报告摘要】
• 生成时间：{report.生成时间}
• 数据基准：{report.数据基准}
• 最终建议：{report.最终建议}
• 融合摘要：{report.融合摘要}

【历史报告摘要（从新到旧）】
{chr(10).join(historical_summaries)}

【时效】当前为 {_year} 年，表述中勿将 2023、2024 等旧年份当作「当前」或「近期」引用。

请用 2～4 段话完成「对比上次变化与异动信号」板块，要求：
1. 与最近一次历史报告对比：数据（价格、估值）、结论、风险提示有何主要变化；
2. 指出值得关注的异动信号（如估值拐点、建议转向、新风险等）；
3. 全程简体中文，不输出思考过程，直接输出正文。
4. **禁止**输出「# / ## / ###」章节标题，**禁止**重复写「对比上次变化与异动信号」等标题（报告模板已带标题），请从第一段正文直接开始。"""
        try:
            out = self.llm.chat(
                "你是一位投资研究编辑，负责撰写报告中的「对比上次变化与异动信号」小节，语言简练、信息明确。",
                prompt,
                temperature=0.3
            )
            return _strip_md_headings_with_keywords(
                (out or "").strip(),
                ("对比上次", "对比与异动", "异动信号"),
            )
        except Exception:
            return ""

    # ==================== 辅助解析函数 ====================
    def _extract_recommendation(self, text: str) -> str:
        """提取投资建议"""
        if any(x in text for x in ["积极", "看好", "看涨", "推荐", "买入"]):
            return "积极"
        elif any(x in text for x in ["观望", "审慎", "谨慎", "中立", "持有"]):
            return "观望"
        elif any(x in text for x in ["规避", "不建议", "看跌", "卖出", "减持"]):
            return "谨慎"
        return "观望"

    def _extract_confidence(self, text: str) -> float:
        """提取置信程度"""
        if "高" in text and "中" not in text:
            return 0.9
        elif "中高" in text:
            return 0.75
        elif "中" in text:
            return 0.6
        elif "低" in text:
            return 0.4
        return 0.6

    def _extract_key_points(self, text: str) -> List[str]:
        """提取核心要点"""
        points = []
        for line in text.split('\n'):
            line = line.strip()
            if line.startswith(('1.', '2.', '3.', '•', '-', '•')):
                content = re.sub(r'^[1-3]\.|\s*[•\-]\s*', '', line).strip()
                if content and len(content) > 5:
                    points.append(content)
        return points[:5]

    def _extract_data_refs(self, text: str, stock_data: StockData) -> List[str]:
        """提取数据引用（使用与报告一致的 2 位小数格式）"""
        refs = []
        if _fmt_price(stock_data.最新价) in text or str(stock_data.最新价) in text:
            refs.append(f"最新价{_fmt_price(stock_data.最新价)}元")
        if _fmt_pe(stock_data.市盈率) in text or str(stock_data.市盈率) in text:
            refs.append(f"市盈率{_fmt_pe(stock_data.市盈率)}倍")
        return refs

    def _extract_section(self, text: str, keyword: str) -> List[str]:
        """提取指定章节内容"""
        sections = []
        lines = text.split('\n')
        in_section = False
        for line in lines:
            if keyword in line:
                in_section = True
                continue
            if in_section and line.strip() and not line.startswith('#'):
                sections.append(line.strip())
            if in_section and line.startswith('#') and keyword not in line:
                break
        return sections[:3]

# ==================== 报告命名与历史 ====================
def report_market_short(market: str) -> str:
    """市场简称，用于报告文件名"""
    return {"A 股": "A股", "港股": "港股", "美股": "美股"}.get(market, "A股")

def report_code_short(code: str, market: str) -> str:
    """股票代码精简，用于报告文件名与匹配历史（去点、港股去前导零）"""
    code = (code or "").strip().upper()
    if "." in code:
        code = code.split(".")[0]
    if market == "港股" and code.isdigit():
        code = str(int(code))
    return code or "unknown"

def report_base_name(market: str, stock_code: str, with_time: bool = True) -> str:
    """报告文件名前缀：市场_代码_时间（时间可选）"""
    m = report_market_short(market)
    c = report_code_short(stock_code, market)
    if with_time:
        return f"{m}_{c}_{_now_cn().strftime('%Y%m%d_%H%M%S')}"
    return f"{m}_{c}"

def get_recent_report_summaries(reports_dir: Path, market: str, stock_code: str, n: int = 3) -> List[str]:
    """获取同一市场+代码的最近 n 份报告的摘要（用于结合历史分析）。返回摘要文本列表，从新到旧。"""
    reports_dir = Path(reports_dir)
    if not reports_dir.exists():
        return []
    prefix = f"{report_market_short(market)}_{report_code_short(stock_code, market)}_"
    candidates = []
    for f in reports_dir.glob("*.md"):
        if f.name.startswith(prefix) and f.name.endswith(".md"):
            try:
                mtime = f.stat().st_mtime
                candidates.append((mtime, f))
            except OSError:
                pass
    candidates.sort(key=lambda x: x[0], reverse=True)
    summaries = []
    for _, path in candidates[:n]:
        try:
            text = path.read_text(encoding="utf-8")
            # 提取「核心摘要」或前 800 字作为摘要
            if "## 📊 核心摘要" in text or "## 核心摘要" in text:
                start = text.find("核心摘要")
                block = text[text.find("\n", start) + 1 : start + 1200] if start >= 0 else text[:800]
            else:
                block = text[:800]
            block = block.strip()
            if block:
                summaries.append(f"【{path.stem}】\n{block}")
        except Exception:
            continue
    return summaries


def _clean_snippet_for_rec(s: str, max_len: int = 96) -> str:
    """压缩为一句可读摘要，用于最终建议段落。"""
    if not s:
        return ""
    t = " ".join(str(s).replace("\r", " ").split())
    t = t.strip().strip("`*#•- ")
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + "…"


def _final_rec_one_reason(s: str, max_len: int = 58) -> str:
    """最终建议用的一句话理由：优先取「解读」后内容，弱化已在报告其它处出现的长数据枚举。"""
    if not s:
        return ""
    t = " ".join(str(s).replace("\r", " ").split()).strip()
    if "解读：" in t:
        t = t.split("解读：", 1)[-1].strip()
    elif "数据：" in t and "解读：" not in t:
        # 仅有「数据：…」时取第一句结论性尾巴，避免复述整段区间数字
        chunk = t.split("数据：", 1)[-1]
        if "。" in chunk:
            segs = [x.strip() for x in chunk.split("。") if x.strip()]
            t = segs[-1] if segs else chunk
        else:
            t = chunk
    t = t.strip().strip("`*#•- ")
    return _clean_snippet_for_rec(t, max_len)


def _first_debate_judge_snippet(debate_rounds: List[DebateRound], max_len: int = 128) -> str:
    """取最后一轮裁判结论中第一条有信息量的行。"""
    if not debate_rounds:
        return ""
    raw = (debate_rounds[-1].裁判结论 or "").strip()
    for line in raw.split("\n"):
        t = line.strip().lstrip("#*• `-").strip()
        if len(t) >= 18 and not t.startswith("---") and not t.startswith("```"):
            return _clean_snippet_for_rec(t, max_len)
    return _clean_snippet_for_rec(raw, max_len)


def _build_final_recommendation_text(
    rec_type: str,
    top_points: List[Tuple[str, float]],
    debate_rounds: List[DebateRound],
    observe_str: str,
) -> str:
    """一至两句收束：结论态度 + 一条最简理由（或裁判一句），不重复报告正文与数据表。"""
    judge = _first_debate_judge_snippet(debate_rounds, max_len=52)
    r0 = _final_rec_one_reason(top_points[0][0]) if top_points else ""
    r1 = _final_rec_one_reason(top_points[1][0]) if len(top_points) > 1 else ""

    def _two_lines(head: str, reason: str, alt: str) -> str:
        head = head.rstrip("。")
        reason = (reason or "").strip()
        alt = (alt or "").strip()
        if reason:
            return f"{head}。{reason}".rstrip("。") + "。"
        if alt:
            return f"{head}。{_clean_snippet_for_rec(alt, 56)}".rstrip("。") + "。"
        return f"{head}。"

    if rec_type == "积极":
        return _two_lines("加权后建议「积极关注」", r0 or r1, judge)

    if rec_type == "谨慎":
        return _two_lines("加权后建议「保持谨慎」", r0 or r1, judge)

    # 观望：两句内收束，观察项只保留前两项以免堆砌
    obs = (observe_str or "").strip()
    if obs and "、" in obs:
        obs_short = "、".join(obs.split("、")[:2]) + "等"
    elif obs:
        obs_short = _clean_snippet_for_rec(obs, 32)
    else:
        obs_short = ""
    extra = r0 or r1 or judge
    head_w = "加权后建议「观望等待」"
    if obs_short and extra:
        return f"{head_w}：{_clean_snippet_for_rec(extra, 52)}（可先跟{obs_short}）。"
    if extra:
        return _two_lines(head_w, extra, "")
    if obs_short:
        return f"{head_w}，可先跟{obs_short}。"
    return f"{head_w}。"


# ==================== 报告导出器 ====================
class ReportExporter:
    """中文报告导出器"""

    @staticmethod
    def to_markdown(report: FinalReport, output_path: str = None) -> str:
        """导出 Markdown 报告"""

        md = f"""# 📋 {report.分析主题}

> **生成时间**:{report.生成时间}  
> **数据基准**:{report.数据基准}  
> **共识程度**:{report.共识程度*100:.0f}% | **加权得分**:{report.加权得分:+.2f}

---

<span id="摘要"></span>

## 📊 核心摘要

{report.融合摘要}

> 💡 {report.最终建议}

---
"""
        if getattr(report, "对比与异动", "").strip():
            _diff_body = _strip_md_headings_with_keywords(
                report.对比与异动.strip(),
                ("对比上次", "对比与异动", "异动信号"),
            )
            md += (
                '<span id="对比与异动"></span>\n\n'
                "## 📌 对比上次变化与异动信号\n\n"
                + _diff_body
                + "\n\n---\n"
            )
        md += f"""
<span id="数据"></span>

## 📈 数据快照

| 指标 | 数值 | 说明 |
|------|------|------|
| 最新价格 | {report.数据基准.split('｜')[0]} | 当前交易价 |
| 今日涨跌 | {report.数据基准.split('｜')[1] if '｜' in report.数据基准 else '暂无'} | 当日表现 |
| 市盈率 | {report.数据基准.split('｜')[2] if '｜' in report.数据基准 else '暂无'} | 估值水平 |
| 共识程度 | {report.共识程度*100:.0f}% | 分析师一致性 |
| 加权得分 | {report.加权得分:+.2f} | >+0.3 看好,<-0.3 谨慎 |

"""
        _sys_rows = (getattr(report, "数据快照系统指标表行", None) or "").strip()
        if _sys_rows:
            md += _sys_rows + "\n\n"
        snap_extra = (getattr(report, "快照补充说明", None) or "").strip()
        if snap_extra:
            md += f"""
### 盘口、流动性与每股指标

下列多为**当日或近期快照**，与主行情合并；分析正文已按角色分工引用。

{snap_extra}

"""
        md += """---

<span id="分析师"></span>

## 👥 分析师观点

"""

        # 分析师观点表格
        md += "| 分析师 | 角色定位 | 建议 | 置信度 | 权重 |\n"
        md += "|--------|----------|------|--------|------|\n"
        for r in report.分析师报告:
            emoji = "✅" if r.投资建议 == "积极" else "⏳" if r.投资建议 == "观望" else "⚠️"
            md += f"| {r.分析师姓名} | {r.角色定位} | {emoji} {r.投资建议} | {r.置信程度*100:.0f}% | {r.角色权重} |\n"

        md += "\n"

        # 分析师详细分析（保留 id 便于页内锚点）
        for r in report.分析师报告:
            an = (r.分析师姓名 or "").strip().replace('"', "")
            md += f"""<span id="{an}"></span>

### 🧑‍💼 {r.分析师姓名}

**角色定位**:{r.角色定位}

| 项目 | 内容 |
|------|------|
| 投资建议 | {r.投资建议} |
| 置信程度 | {r.置信程度*100:.0f}% |
| 角色权重 | {r.角色权重} |

**核心分析**:
> {r.核心分析}

**关键要点**:
{chr(10).join(f'- {pt}' for pt in r.核心要点 if pt)}

---

"""

        # 辩论部分（纯 Markdown，避免前端简易渲染器把 <details> 当原文显示）
        md += """<span id="辩论"></span>

## 💬 多空辩论

"""
        for d in report.辩论轮次:
            md += f"""### 🔄 第 {d.轮次编号} 轮辩论

**🟢 多头观点**:
> {d.多头观点}

**🔴 空头观点**:
> {d.空头观点}

**⚖️ 裁判结论**:
> {d.裁判结论}

---

"""

        # 操作建议
        md += f"""<span id="建议"></span>

## 🎯 操作建议

| 项目 | 建议 |
|------|------|
| 仓位建议 | {report.操作建议.get('仓位建议', '暂无')} |
| 关注价位 | {report.操作建议.get('关注价位', '暂无')} |
| 止损参考 | {report.操作建议.get('止损参考', '暂无')} |
| 关键观察 | {report.操作建议.get('关键观察', '暂无')} |

---

<span id="风险"></span>

## ⚠️ 风险提示

{chr(10).join(f'{i+1}. {risk}' for i, risk in enumerate(report.风险提示))}

---

> 💡 **免责声明**:本报告由 AI 多智能体系统生成,仅供参考,不构成投资建议。投资有风险,决策需谨慎。
"""

        if output_path:
            Path(output_path).write_text(md, encoding='utf-8')
            print(f"✅ Markdown 报告已保存:{output_path}")

        return md

    @staticmethod
    def to_html(report: FinalReport, output_path: str = None) -> str:
        """导出 HTML 报告"""
        md_content = ReportExporter.to_markdown(report)

        html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{report.分析主题}</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{ 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
            max-width: 900px; margin: 0 auto; padding: 20px; 
            line-height: 1.8; color: #333; background: #fafafa;
        }}
        h1 {{ color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 15px; margin-bottom: 20px; }}
        h2 {{ color: #34495e; margin: 30px 0 15px; padding-left: 10px; border-left: 4px solid #3498db; }}
        h3 {{ color: #7f8c8d; margin: 20px 0 10px; }}
        blockquote {{ 
            background: #ecf0f1; padding: 15px 20px; 
            border-left: 4px solid #3498db; margin: 15px 0;
            border-radius: 0 8px 8px 0;
        }}
        table {{ 
            width: 100%; border-collapse: collapse; 
            margin: 15px 0; background: white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        th, td {{ 
            padding: 12px 15px; text-align: left; 
            border-bottom: 1px solid #ddd;
        }}
        th {{ background: #3498db; color: white; }}
        tr:hover {{ background: #f5f5f5; }}
        details {{ 
            background: white; margin: 15px 0; 
            border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        summary {{ 
            padding: 15px; cursor: pointer; font-weight: bold;
            background: #f8f9fa; border-radius: 8px;
        }}
        summary:hover {{ background: #e9ecef; }}
        details[open] summary {{ border-radius: 8px 8px 0 0; }}
        .content {{ padding: 15px; }}
        .recommendation {{ 
            background: #d5f5e3; padding: 20px; 
            border-radius: 8px; border-left: 4px solid #27ae60;
            margin: 20px 0;
        }}
        .risk {{ 
            background: #fdedec; padding: 15px; 
            border-radius: 8px; border-left: 4px solid #e74c3c;
        }}
        .bull {{ background: #e8f8f5; padding: 15px; border-left: 3px solid #27ae60; }}
        .bear {{ background: #fdedec; padding: 15px; border-left: 3px solid #e74c3c; }}
        .judge {{ background: #ebf5fb; padding: 15px; border-left: 3px solid #3498db; }}
        .toc {{ 
            background: #f8f9fa; padding: 20px; 
            border-radius: 8px; margin: 20px 0;
        }}
        .toc a {{ color: #3498db; text-decoration: none; }}
        .toc a:hover {{ text-decoration: underline; }}
        hr {{ border: none; border-top: 2px solid #bdc3c7; margin: 30px 0; }}
        .footer {{ 
            text-align: center; color: #7f8c8d; 
            font-size: 14px; margin-top: 40px; padding-top: 20px;
            border-top: 1px solid #ddd;
        }}
        @media (max-width: 600px) {{
            body {{ padding: 10px; }}
            table {{ font-size: 14px; }}
            th, td {{ padding: 8px 10px; }}
        }}
    </style>
</head>
<body>
{markdown.markdown(md_content)}
<div class="footer">
    <p>生成时间:{report.生成时间} | 多智能体分析系统</p>
</div>
</body>
</html>"""

        if output_path:
            Path(output_path).write_text(html, encoding='utf-8')
            print(f"✅ HTML 报告已保存:{output_path}")

        return html

# ==================== 命令行入口 ====================
def main():
    """主函数"""
    import argparse

    parser = argparse.ArgumentParser(
        description="📈 多智能体股票分析师 - 完整增强版",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python stock_analyst.py --stock 600519.SH --name 贵州茅台
  python stock_analyst.py --stock AAPL --market 美股 --name 苹果公司
  python stock_analyst.py --stock 00700.HK --market 港股 --name 腾讯控股
        """
    )

    parser.add_argument("--stock", "-s", type=str, required=True, help="股票代码（如:600519.SH）")
    parser.add_argument("--name", "-n", type=str, help="股票名称（如:贵州茅台）")
    parser.add_argument("--market", "-m", type=str, default="A 股", choices=["A 股", "港股", "美股"], help="市场类型")
    parser.add_argument("--days", "-d", type=int, default=90, help="历史数据天数")
    parser.add_argument("--analysts", "-a", type=str, nargs="+", help="选择分析师（默认 4 位）")
    parser.add_argument("--debate", type=int, default=1, help="辩论轮次")
    parser.add_argument("--output", "-o", type=str, default="./reports", help="输出目录")
    parser.add_argument("--mock", action="store_true", help="使用模拟数据（测试用）")

    args = parser.parse_args()

    # 创建输出目录
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 初始化分析器
    use_real = not args.mock and HAS_OPENAI
    analyst = MultiAgentStockAnalyst(use_real_llm=use_real, debate_rounds=args.debate)

    # 执行分析（传入 output 目录以便结合最近 3 份历史报告生成「对比与异动」）
    report = analyst.analyze(
        stock_code=args.stock,
        stock_name=args.name,
        market=args.market,
        days=args.days,
        selected_analysts=args.analysts,
        reports_dir=output_dir,
    )

    # 导出报告：命名 市场_股票代码_时间
    base_name = report_base_name(args.market, args.stock, with_time=True)
    md_path = output_dir / f"{base_name}.md"
    html_path = output_dir / f"{base_name}.html"

    ReportExporter.to_markdown(report, str(md_path))
    ReportExporter.to_html(report, str(html_path))

    # 打印摘要
    print("\n" + "═"*60)
    print("📋 报告摘要")
    print("═"*60)
    print(report.融合摘要)
    print(f"\n🎯 {report.最终建议}")
    print(f"\n💾 报告已保存:")
    print(f"   - Markdown: {md_path}")
    print(f"   - HTML: {html_path}")
    print("═"*60 + "\n")

if __name__ == "__main__":
    main()
