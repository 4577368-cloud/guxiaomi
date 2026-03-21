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

# ==================== 角色提示词库（增强版） ====================
# 借鉴 TradingAgents：每位分析师只引用与本角色专业直接相关的数据，输出「本角色数据支撑」突出专业切入点，避免各板块重复堆砌相同数据。
ANALYST_PROMPTS = {
    "市场专家": {
        "角色名称": "市场专家",
        "角色定位": "行业周期与竞争格局分析师",
        "本角色专属数据": "所属板块、总市值、估值分位、九十日区间（趋势与周期位置）、风险信号中与行业/政策相关项。通用数据如最新价、市盈率仅可在结论中顺带 1 处，不作为你板块的数据支撑重点。",
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
• 必须包含「## 本角色数据支撑」小节：仅列 2～3 条由**所属板块、估值分位、总市值、九十日区间、行业/政策类风险**得出的结论，不得在此重复罗列人人皆可写的「最新价xx元」「市盈率xx倍」
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
        "本角色专属数据": "估值分位、九十日区间（空间与弹性）、波动率（成长股波动特征）、风险信号中与增长/新业务相关项。市盈率/市净率仅作为「估值与成长匹配」时引用 1 处，不作为本角色数据支撑的重复项。",
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
• 必须包含「## 本角色数据支撑」小节：仅列 2～3 条由**估值分位、九十日区间、波动率、增长/新业务相关风险**得出的结论（如估值与成长是否匹配、波动区间是否提供弹性），不得在此重复堆砌「最新价」「市盈率」等通用句
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
        "本角色专属数据": "风险信号（全文）、波动率、九十日最高/最低（安全边际与回撤空间）、估值分位、市净率（资产质量）。最新价/市盈率仅可在结论中顺带 1 处，不作为本角色数据支撑的重复项。",
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
• 必须包含「## 本角色数据支撑」小节：仅列 2～3 条由**风险信号、波动率、九十日高低、估值分位、市净率**得出的结论（如安全边际、下行空间、风险等级），不得在此重复堆砌「最新价」「市盈率」等通用句
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
        "本角色专属数据": "技术指标简述（均线、RSI、MACD、布林带、区间等）、所属板块（技术/研发行业时）、估值分位（技术型企业估值）。若提供技术指标，须从技术面解读其含义（如均线支撑/压力、RSI 超买超卖、区间突破），不得只复述数字。最新价/市盈率仅可在结论中顺带 1 处。",
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
• 必须包含「## 本角色数据支撑」小节：仅列 2～3 条由**技术指标（均线/RSI/MACD/布林/区间）或研发与产品数据**得出的结论（如技术面信号、支撑压力、超买超卖），不得在此重复堆砌「最新价」「市盈率」等通用句
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
        "本角色专属数据": "风险信号中与舆情/情绪相关项、所属板块（用于理解受众）。若无单独舆情数据，则从风险信号与估值分位中解读市场情绪（如估值分位反映的市场乐观/悲观）。不得重复堆砌最新价、市盈率等通用数据。",
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
• 必须包含「## 本角色数据支撑」小节：仅列 2～3 条由**舆情/情绪相关风险信号或估值分位所反映的市场情绪**得出的结论，不得在此重复堆砌「最新价」「市盈率」
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
        hi = round(price * 1.12, 6)
        lo = round(price * 0.88, 6)
        if hi <= lo:
            hi, lo = round(price * 1.02, 6), round(price * 0.98, 6)
        avg = (hi + lo + price) / 3.0
        vol_est = abs(hi - lo) / max(price, 1e-9) * 8.0
        return StockData(
            股票名称=nm,
            股票代码=(code or "").strip(),
            所属市场=market,
            最新价=round(price, 4) if market != "A 股" else round(price, 2),
            涨跌幅=change,
            总市值="暂无",
            市盈率=None,
            市净率=None,
            九十日均价=float(avg),
            九十日最高=float(hi),
            九十日最低=float(lo),
            波动率=float(min(vol_est, 80.0)),
            数据时间=_fmt_now_cn(),
            风险信号=[
                "ℹ️ 最新价与涨跌幅来自**本页浏览器**拉取的行情（与用户添加股票同源）；"
                "90 日区间等为基于现价的粗略占位，定量以券商软件为准；服务端仍会尝试合并多源以补简介与板块。",
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
        return """## 核心结论
积极关注:估值合理,增长逻辑清晰

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

# ==================== 多智能体分析师 ====================
class MultiAgentStockAnalyst:
    """多智能体股票分析师"""

    def __init__(self, use_real_llm: bool = True, debate_rounds: int = 1):
        self.use_real_llm = use_real_llm
        self.debate_rounds = debate_rounds
        self.llm = LLMClient(use_real=use_real_llm)
        self.data_service = StockDataService()
        self.analyst_configs = ANALYST_PROMPTS

    def analyze(self, stock_code: str, stock_name: str = None,
                market: str = "A 股", days: int = 90,
                selected_analysts: List[str] = None,
                reports_dir: Optional[Path] = None,
                client_quote: Optional[Dict[str, Any]] = None) -> FinalReport:
        """执行完整分析流程。reports_dir 若提供，会加载该股票最近 3 份报告并生成「对比与异动」板块。"""

        print("\n" + "═"*60)
        print("🚀 多智能体股票分析框架 - 启动")
        print("═"*60)

        # 步骤 1: 获取股票数据
        print(f"\n📊 步骤 1: 获取 {stock_code} 市场数据...")
        stock_data = self.data_service.get_stock_info(
            stock_code, market, days, client_quote=client_quote,
        )
        if stock_name:
            stock_data.股票名称 = stock_name
        self.data_service.post_enrich_stock_data(stock_data, stock_code, market, days)

        data_summary = f"{stock_data.股票名称}（{stock_code}）｜{_fmt_price(stock_data.最新价)}元｜{stock_data.涨跌幅}｜市盈率{_fmt_pe(stock_data.市盈率)}倍"
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
        data_context = f"""【股票信息】{stock_data.股票名称}（{stock_data.股票代码}）
{_date_constraint}
【最新价格】{_fmt_price(stock_data.最新价)}元（{stock_data.涨跌幅}）
【估值水平】市盈率{_fmt_pe(stock_data.市盈率)}倍｜市净率{_fmt_pb(stock_data.市净率)}倍｜{stock_data.估值分位}
【90 日价格区间】{_rng90}元（波动率{stock_data.波动率:.1f}%）。全文写区间时必须带分隔符，使用「{_rng90}」或「{_fmt_price(stock_data.九十日最低)} 至 {_fmt_price(stock_data.九十日最高)}」；禁止写成无分隔的两个数连在一起（错误示例：把 80 元与 100 元写成 80100）。
【总市值】{stock_data.总市值}
【风险信号】{', '.join(stock_data.风险信号)}
【数据时间】{stock_data.数据时间}"""
        if (stock_data.数据溯源 or "").strip():
            data_context += f"\n【数据溯源】{stock_data.数据溯源.strip()}"
        if stock_data.所属板块:
            data_context += f"\n【所属板块】{stock_data.所属板块}"
        if (stock_data.公司简介 or "").strip():
            data_context += f"\n【公司主营业务与简介】{stock_data.公司简介.strip()}"
        if stock_data.技术指标简述:
            data_context += f"\n【技术指标】{stock_data.技术指标简述}"
        if stock_data.近期市场与板块简述:
            data_context += f"\n【近期市场与板块】{stock_data.近期市场与板块简述}"

        # 本角色专属数据（突出专业切入点，避免各板块重复堆砌相同数据）
        role_data = config.get("本角色专属数据", "")
        role_data_block = ""
        if role_data:
            role_data_block = f"""
【本角色专属数据与输出要求】
你应重点引用并深度解读的数据：{role_data}
输出中**必须**包含「## 本角色数据支撑」小节：仅列 2～3 条由上述专属数据得出的结论或信号（每条为「数据 + 你的专业解读」）。禁止在该小节中堆砌人人皆可写的「最新价xx元」「市盈率xx倍」，以突出你的专业切入点、与其它分析师区分。"""

        # 构建分析提示词
        prompt = f"""{data_context}

【分析任务】基于以上数据，对该股票进行投资价值分析。
【时效性硬性约束】当前日期为 {_now.strftime('%Y年%m月%d日')}（{_now.year}年）。输入与输出均不得将 2023、2024 等旧年份作为「当前」或「近期」引用；禁止「2023年…」「2024年目标」等过时表述。若必须提历史，须明确写「历史数据（某年）」且不占主要篇幅。「今年」「当前」「近期」仅指 {_now.year} 年及最近 12 个月。违反则分析无效。
不要输出思考过程、<think> 或 think 标签，仅输出正式分析内容。
{role_data_block}

【输出结构】
## 核心结论
（1 句话明确观点:积极关注/谨慎观望/建议规避 + 核心理由）

## 数据解读
（仅从本角色视角解读与你**专属数据**相关的 1～2 点，勿泛泛复述全部数据）

## 本角色数据支撑
（必填。仅 2～3 条，每条为「数据 + 专业解读」，只引用与你角色直接相关的数据，不得重复堆砌最新价/市盈率等通用句）

## 角色视角分析
（从{config['角色定位']}角度,列出 3 条核心观点）

## 操作建议
• 仓位建议:...
• 关注价位:...
• 关键观察:...

## 置信程度
（高/中高/中/偏低,并简述理由）

【要求】全程简体中文，禁用英文，专业术语附解释。每条观点简洁不重复；数据支撑只突出本角色专业度，不与其它板块重复。输出中不要使用 ** 或 * 做加粗/强调，用自然段与标题层级（##）区分即可。"""

        # 调用 LLM
        analysis = self.llm.chat(config["系统提示词"], prompt)

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
            bull_prompt = f"""基于以下分析师观点,总结看涨理由:
{summary}

【股票数据】{stock_data.股票名称}｜{_fmt_price(stock_data.最新价)}元｜市盈率{_fmt_pe(stock_data.市盈率)}倍

{_date_note}

请从增长机会、市场趋势、竞争优势等角度给出看涨论证。
至少列出 3 个核心理由,每个需有数据支撑。"""

            bull_arg = self.llm.chat(DEBATE_PROMPTS["多头研究员"], bull_prompt)

            # 空头观点
            bear_prompt = f"""基于以下分析师观点,总结看跌理由:
{summary}

【股票数据】{stock_data.股票名称}｜{_fmt_price(stock_data.最新价)}元｜市盈率{_fmt_pe(stock_data.市盈率)}倍

{_date_note}

请从风险因素、竞争威胁、市场挑战等角度给出看跌论证。
至少列出 3 个核心理由,每个需有数据支撑。"""

            bear_arg = self.llm.chat(DEBATE_PROMPTS["空头研究员"], bear_prompt)

            # 裁判决定
            judge_prompt = f"""基于以下辩论:

【多头观点】
{bull_arg}

【空头观点】
{bear_arg}

{_date_note}

请作为裁判,给出最终判断（看涨/看跌/中立）并说明理由。
同时指出:1.双方共识点 2.核心分歧点 3.需要验证的关键变量"""

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

        # 确定最终建议
        if consensus_score > 0.3:
            final_rec = "✅ 建议积极关注:多头逻辑占优,核心依据见下方"
            rec_type = "积极"
        elif consensus_score < -0.3:
            final_rec = "⚠️ 建议保持谨慎:风险因素需重视,核心依据见下方"
            rec_type = "谨慎"
        else:
            final_rec = "⏳ 建议观望等待:多空力量均衡,关注关键变量"
            rec_type = "观望"

        # 整合核心逻辑链
        all_points = []
        for r in reports:
            for pt in r.核心要点:
                if pt and pt not in [p[0] for p in all_points]:
                    all_points.append((pt, r.置信程度))

        top_points = sorted(all_points, key=lambda x: x[1], reverse=True)[:5]

        # 生成融合摘要
        support_count = len([r for r in reports if r.投资建议 == rec_type])
        summary = f"""📊 融合分析摘要
• 分析师共识:{support_count}/{len(reports)} 位分析师支持"{rec_type}"
• 加权得分:{consensus_score:+.2f}（>+0.3 看好,<-0.3 谨慎）
• 核心逻辑链:
{chr(10).join(f'  {i+1}. {pt[0]}（置信度{pt[1]*100:.0f}%）' for i, pt in enumerate(top_points))}
• 关键数据:{_fmt_price(stock_data.最新价)}元｜市盈率{_fmt_pe(stock_data.市盈率)}倍｜波动率{stock_data.波动率:.1f}%"""

        # 操作建议
        position_suggestion = "15%-20%" if consensus_score > 0.3 else "5%-10%" if consensus_score > 0 else "暂不建仓"

        _low_ref = stock_data.九十日最低 or stock_data.最新价 or 0.0
        if _low_ref <= 0:
            _low_ref = stock_data.最新价 or 1.0
        return FinalReport(
            分析主题=f"{stock_data.股票名称}（{stock_data.股票代码}）投资价值分析",
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
                "关键观察": "季度业绩、行业政策、竞争格局变化"
            }
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
3. 全程简体中文，不输出思考过程，直接输出正文。"""
        try:
            out = self.llm.chat(
                "你是一位投资研究编辑，负责撰写报告中的「对比上次变化与异动信号」小节，语言简练、信息明确。",
                prompt,
                temperature=0.3
            )
            return (out or "").strip()
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

# ==================== 报告导出器 ====================
class ReportExporter:
    """中文报告导出器"""

    @staticmethod
    def to_markdown(report: FinalReport, output_path: str = None) -> str:
        """导出 Markdown 报告"""

        # 生成目录
        toc = "## 📑 报告目录\n\n"
        toc += "1. [📊 核心摘要](#摘要)\n"
        toc += "2. [📈 数据快照](#数据)\n"
        toc += "3. [👥 分析师观点](#分析师)\n"
        for i, r in enumerate(report.分析师报告,1):
            toc += f"   {i}. [{r.分析师姓名}](#{r.分析师姓名})\n"
        toc += "4. [💬 多空辩论](#辩论)\n"
        toc += "5. [🎯 操作建议](#建议)\n"
        toc += "6. [⚠️ 风险提示](#风险)\n"
        if getattr(report, "对比与异动", "").strip():
            toc += "7. [📌 对比上次变化与异动信号](#对比与异动)\n"

        md = f"""# 📋 {report.分析主题}

> **生成时间**:{report.生成时间}  
> **数据基准**:{report.数据基准}  
> **共识程度**:{report.共识程度*100:.0f}% | **加权得分**:{report.加权得分:+.2f}

---

{toc}

---

## 📊 核心摘要

{report.融合摘要}

> 💡 **{report.最终建议}**

---
"""
        if getattr(report, "对比与异动", "").strip():
            md += """
## 📌 对比上次变化与异动信号

""" + report.对比与异动.strip() + """

---
"""
        md += f"""
## 📈 数据快照

| 指标 | 数值 | 说明 |
|------|------|------|
| 最新价格 | {report.数据基准.split('｜')[0]} | 当前交易价 |
| 今日涨跌 | {report.数据基准.split('｜')[1] if '｜' in report.数据基准 else '暂无'} | 当日表现 |
| 市盈率 | {report.数据基准.split('｜')[2] if '｜' in report.数据基准 else '暂无'} | 估值水平 |
| 共识程度 | {report.共识程度*100:.0f}% | 分析师一致性 |
| 加权得分 | {report.加权得分:+.2f} | >+0.3 看好,<-0.3 谨慎 |

---

## 👥 分析师观点

"""

        # 分析师观点表格
        md += "| 分析师 | 角色定位 | 建议 | 置信度 | 权重 |\n"
        md += "|--------|----------|------|--------|------|\n"
        for r in report.分析师报告:
            emoji = "✅" if r.投资建议 == "积极" else "⏳" if r.投资建议 == "观望" else "⚠️"
            md += f"| {r.分析师姓名} | {r.角色定位} | {emoji} {r.投资建议} | {r.置信程度*100:.0f}% | {r.角色权重} |\n"

        md += "\n"

        # 分析师详细分析
        for r in report.分析师报告:
            md += f"""### 🧑‍💼 {r.分析师姓名}

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

        # 辩论部分
        md += f"""## 💬 多空辩论

"""
        for d in report.辩论轮次:
            md += f"""<details>
<summary>🔄 第 {d.轮次编号} 轮辩论</summary>

**🟢 多头观点**:
> {d.多头观点}

**🔴 空头观点**:
> {d.空头观点}

**⚖️ 裁判结论**:
> {d.裁判结论}

</details>

"""

        # 操作建议
        md += f"""## 🎯 操作建议

| 项目 | 建议 |
|------|------|
| 仓位建议 | {report.操作建议.get('仓位建议', '暂无')} |
| 关注价位 | {report.操作建议.get('关注价位', '暂无')} |
| 止损参考 | {report.操作建议.get('止损参考', '暂无')} |
| 关键观察 | {report.操作建议.get('关键观察', '暂无')} |

---

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
