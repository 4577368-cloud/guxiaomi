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
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
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
    """市盈率保留 2 位小数，None 返回 N/A"""
    return f"{round(pe, 2)}" if pe is not None and pe == pe and pe > 0 else "N/A"

def _fmt_pb(pb: Optional[float]) -> str:
    """市净率保留 2 位小数，None 返回 N/A"""
    return f"{round(pb, 2)}" if pb is not None and pb == pb and pb > 0 else "N/A"

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

class StockDataService:
    """股票数据获取服务。港股/美股优先使用 Alpha Vantage（若配置密钥），失败则用 yfinance 兜底。"""

    def __init__(self, source: str = "akshare"):
        self.source = source
        self._av_key = _get_alpha_vantage_api_key()

    def get_stock_info(self, code: str, market: str = "A 股", days: int = 90) -> StockData:
        """获取股票完整信息。A 股数据拉取限时 30 秒，超时则抛出异常以便任务明确失败。"""
        try:
            if market == "A 股":
                from concurrent.futures import ThreadPoolExecutor
                if HAS_AKSHARE:
                    with ThreadPoolExecutor(max_workers=1) as ex:
                        fut = ex.submit(self._get_a_stock_data, code, days)
                        try:
                            return fut.result(timeout=30)
                        except Exception as e:
                            if "TimeoutError" in type(e).__name__ or "timeout" in str(e).lower():
                                raise RuntimeError("A股行情获取超时(30秒)，请检查网络或稍后重试") from e
                            print(f"⚠️ akshare A股数据失败({e})，尝试 Baostock 备选")
                            try:
                                return self._get_a_stock_data_baostock(code, days)
                            except Exception as e2:
                                print(f"⚠️ Baostock A股数据失败({e2})，使用模拟数据")
                                return self._mock_stock_data(code, market)
                else:
                    try:
                        return self._get_a_stock_data_baostock(code, days)
                    except Exception as e:
                        print(f"⚠️ Baostock A股数据失败({e})，使用模拟数据")
                        return self._mock_stock_data(code, market)
            elif market == "港股":
                if self._av_key:
                    try:
                        return self._get_av_stock_data(code, "港股", days)
                    except Exception as e:
                        print(f"⚠️ Alpha Vantage 港股数据失败({e})，改用 yfinance 兜底")
                return self._get_hk_stock_data(code, days)
            elif market == "美股":
                if self._av_key:
                    try:
                        return self._get_av_stock_data(code, "美股", days)
                    except Exception as e:
                        print(f"⚠️ Alpha Vantage 美股数据失败({e})，改用 yfinance 兜底")
                return self._get_us_stock_data(code, days)
            else:
                return self._mock_stock_data(code, market)
        except Exception as e:
            # 超时类错误不降级为模拟数据，直接抛出以便任务失败并提示用户
            if "超时" in str(e) or "timeout" in str(e).lower():
                raise
            print(f"⚠️ 数据获取失败:{str(e)},使用模拟数据")
            return self._mock_stock_data(code, market)

    def _get_a_stock_data(self, code: str, days: int = 90) -> StockData:
        """获取 A 股数据"""
        import akshare as ak
        import pandas as pd

        # 清理代码格式
        clean_code = code.split('.')[0] if '.' in code else code

        # 实时行情
        try:
            df_spot = ak.stock_zh_a_spot_em()
            stock_row = df_spot[df_spot['代码'] == clean_code]

            if stock_row.empty:
                raise ValueError(f"未找到股票 {code}")

            name = str(stock_row['名称'].values[0])
            price = float(stock_row['最新价'].values[0])
            change = f"{float(stock_row['涨跌幅'].values[0]):.2f}%"
            market_cap = f"{float(stock_row['总市值'].values[0])/1e8:.1f}亿"
            pe = float(stock_row['市盈率 - 动态'].values[0]) if stock_row['市盈率 - 动态'].values[0] else 0.0
            pb = float(stock_row['市净率'].values[0]) if stock_row['市净率'].values[0] else 0.0
        except:
            name = "未知"
            price = 0.0
            change = "暂无"
            market_cap = "暂无"
            pe = 0.0
            pb = 0.0

        # 历史数据（使用当前年度及近期，避免写死 2024）
        from datetime import timedelta
        start_date = (datetime.now() - timedelta(days=max(days, 365))).strftime("%Y%m%d")
        所属板块_a = ""
        技术指标简述_a = ""
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
                    技术指标简述_a = f"5日均线{round(sma5, 2)}；20日均线{round(sma20, 2)}；近{n}日区间{round(low_90, 2)}-{round(high_90, 2)}"
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
                for _, row in info_df.iterrows():
                    if name_col in row and val_col in row and row[name_col]:
                        if '行业' in str(row[name_col]) or '板块' in str(row[name_col]):
                            所属板块_a = str(row[val_col]).strip() or 所属板块_a
                            break
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
            数据时间=datetime.now().strftime("%Y 年%m 月%d日 %H:%M"),
            风险信号=risk_flags,
            估值分位=pe_percentile,
            所属板块=所属板块_a,
            技术指标简述=技术指标简述_a,
            近期市场与板块简述="请结合当前年度及近期大盘与板块走势、该股近期走势综合分析。"
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

        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=max(days, 365))).strftime("%Y-%m-%d")
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
            技术指标简述_a = f"5日均线{round(sma5, 2)}；20日均线{round(sma20, 2)}；近{n}日区间{round(low_90, 2)}-{round(high_90, 2)}"
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
            数据时间=datetime.now().strftime("%Y 年%m 月%d日 %H:%M"),
            风险信号=risk_flags,
            估值分位=pe_percentile,
            所属板块="",
            技术指标简述=技术指标简述_a,
            近期市场与板块简述="请结合当前年度及近期大盘与板块走势、该股近期走势综合分析。"
        )

    def _normalize_hk_symbol(self, code: str) -> str:
        """港股代码转为 yfinance 格式（4 位），如 03690.HK / 00700 -> 3690.HK / 0700.HK"""
        code = code.strip().upper().replace(" ", "")
        if ".HK" in code:
            num_str = code.split(".")[0]
        elif code.isdigit():
            num_str = code
        else:
            return f"{code}.HK" if not code.endswith(".HK") else code
        num_str = num_str.lstrip("0") or "0"
        return f"{int(num_str):04d}.HK"

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
            info = ticker.info
            hist = ticker.history(period=f"{max(days, 90)}d", timeout=15)
            if hist is None or len(hist) == 0:
                raise ValueError("无历史数据")
            latest = hist.iloc[-1]
            price = float(latest["Close"])
            name = info.get("shortName") or info.get("longName") or display_code

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

            # 市盈率：优先使用 trailingPE，若为 None（亏损或无盈利数据）则尝试 forwardPE
            pe_raw = info.get("trailingPE")
            if pe_raw is None or pe_raw == 0:
                # 尝试使用 forward PE
                pe_raw = info.get("forwardPE")
            try:
                pe = float(pe_raw) if pe_raw is not None else None
            except (TypeError, ValueError):
                pe = None
            
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
            if volatility > 25:
                risk_flags.append("⚠️ 近期波动较大（超过 25%）")
            if pe is not None and pe > 50:
                risk_flags.append("⚠️ 估值处于高位（市盈率>50）")
            elif pe is None:
                risk_flags.append("⚠️ 公司尚未盈利（市盈率无数据）")
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
                pe_percentile = f"暂无历史PE，预期PE {info.get('forwardPE'):.1f} 倍"
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
                数据时间=datetime.now().strftime("%Y 年%m 月%d日 %H:%M"),
                风险信号=risk_flags,
                估值分位=pe_percentile,
                所属板块=所属板块,
                技术指标简述=技术指标简述,
                近期市场与板块简述="请结合当前年度及近期大盘与板块走势、该股近期走势综合分析。"
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
            parts.append(f"近30日区间{round(recent.min(), 2)}-{round(recent.max(), 2)}")
            return "；".join(parts)
        except Exception:
            return ""

    def _get_hk_stock_data(self, code: str, days: int = 90) -> StockData:
        """获取港股数据（yfinance 实时）"""
        yf_symbol = self._normalize_hk_symbol(code)
        return self._get_yf_stock_data(yf_symbol, "港股", code, days)

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

        # TIME_SERIES_DAILY 用于 90 日区间与技术指标
        tsq = {"function": "TIME_SERIES_DAILY", "symbol": symbol, "apikey": api_key, "outputsize": "compact"}
        req3 = urllib.request.Request(base + "?" + urllib.parse.urlencode(tsq))
        try:
            with urllib.request.urlopen(req3, timeout=15) as resp3:
                ts = json.loads(resp3.read().decode())
        except Exception:
            ts = {}
        daily = ts.get("Time Series (Daily)") or {}
        closes = []
        for d, v in list(daily.items())[:max(days, 90)]:
            try:
                closes.append(float(v.get("4. close")))
            except (TypeError, ValueError):
                pass
        if closes:
            closes = closes[:min(days, len(closes))]
            avg_90 = sum(closes) / len(closes)
            high_90 = max(closes)
            low_90 = min(closes)
            volatility = (math.sqrt(sum((x - avg_90)**2 for x in closes) / len(closes)) / avg_90 * 100) if avg_90 else 0.0
        else:
            avg_90, high_90, low_90, volatility = price, price, price, 0.0

        risk_flags = []
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
            技术指标简述 = f"5日均线{round(sma5, 2)}；20日均线{round(sma20, 2)}；近{len(closes)}日区间{round(low_90, 2)}-{round(high_90, 2)}"
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
            数据时间=datetime.now().strftime("%Y 年%m 月%d日 %H:%M"),
            风险信号=risk_flags,
            估值分位=pe_percentile,
            所属板块=sector,
            技术指标简述=技术指标简述,
            近期市场与板块简述="请结合当前年度及近期大盘与板块走势、该股近期走势综合分析。"
        )

    def _mock_stock_data(self, code: str, market: str) -> StockData:
        """模拟数据（用于测试）"""
        return StockData(
            股票名称="03690",
            股票代码=code,
            所属市场=market,
            最新价=100.0,
            涨跌幅="+1.5%",
            总市值="1000 亿",
            市盈率=25.0,
            市净率=5.0,
            九十日均价=95.0,
            九十日最高=120.0,
            九十日最低=80.0,
            波动率=15.0,
            数据时间=datetime.now().strftime("%Y 年%m 月%d日 %H:%M"),
            风险信号=["✅ 模拟数据,仅供参考"],
            估值分位="合理区间"
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
                reports_dir: Optional[Path] = None) -> FinalReport:
        """执行完整分析流程。reports_dir 若提供，会加载该股票最近 3 份报告并生成「对比与异动」板块。"""

        print("\n" + "═"*60)
        print("🚀 多智能体股票分析框架 - 启动")
        print("═"*60)

        # 步骤 1: 获取股票数据
        print(f"\n📊 步骤 1: 获取 {stock_code} 市场数据...")
        stock_data = self.data_service.get_stock_info(stock_code, market, days)
        if stock_name:
            stock_data.股票名称 = stock_name

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
        _now = datetime.now()
        _year = _now.year
        _date_constraint = f"【当前日期】{_now.strftime('%Y年%m月%d日')}（{_year}年）。严禁在分析中将 2023、2024 等过往年份当作「当前」或「近期」；不得引用旧年份数据作为当前依据；若必须提历史须明确标注「历史（某年）」。"

        data_context = f"""【股票信息】{stock_data.股票名称}（{stock_data.股票代码}）
{_date_constraint}
【最新价格】{_fmt_price(stock_data.最新价)}元（{stock_data.涨跌幅}）
【估值水平】市盈率{_fmt_pe(stock_data.市盈率)}倍｜市净率{round(stock_data.市净率, 2)}倍｜{stock_data.估值分位}
【90 日区间】{_fmt_price(stock_data.九十日最低)} ~ {_fmt_price(stock_data.九十日最高)}元（波动率{stock_data.波动率:.1f}%）
【总市值】{stock_data.总市值}
【风险信号】{', '.join(stock_data.风险信号)}
【数据时间】{stock_data.数据时间}"""
        if stock_data.所属板块:
            data_context += f"\n【所属板块】{stock_data.所属板块}"
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
【时效性硬性约束】当前日期为 {datetime.now().strftime('%Y年%m月%d日')}（{datetime.now().year}年）。输入与输出均不得将 2023、2024 等旧年份作为「当前」或「近期」引用；禁止「2023年…」「2024年目标」等过时表述。若必须提历史，须明确写「历史数据（某年）」且不占主要篇幅。「今年」「当前」「近期」仅指 {datetime.now().year} 年及最近 12 个月。违反则分析无效。
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

            _year = datetime.now().year
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

        return FinalReport(
            分析主题=f"{stock_data.股票名称}（{stock_data.股票代码}）投资价值分析",
            股票代码=stock_data.股票代码,
            生成时间=datetime.now().strftime("%Y 年%m 月%d日 %H:%M"),
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
                "关注价位": f"{stock_data.九十日最低*0.95:.1f}元以下分批布局",
                "止损参考": f"有效跌破{stock_data.九十日最低*0.9:.1f}元重新评估",
                "关键观察": "季度业绩、行业政策、竞争格局变化"
            }
        )

    def _generate_changes_section(self, report: FinalReport, historical_summaries: List[str]) -> str:
        """根据当前报告与最近几份历史报告摘要，生成「对比上次变化与异动信号」解读。"""
        if not historical_summaries:
            return ""
        _year = datetime.now().year
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
        return f"{m}_{c}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
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
