#!/usr/bin/env python3
"""
股票分析 API：供股小蜜前端（analysis.html）调用。
提供多角色分析、报告生成、相关新闻（GNews + RSS）聚合。
分析为异步任务，可离开页面后返回查看；报告默认保存，支持历史列表。
"""
import json
import os
import re
import sys
import threading
import uuid
from pathlib import Path
from datetime import datetime, timedelta

try:
    from zoneinfo import ZoneInfo
    _TZ_SH = ZoneInfo("Asia/Shanghai")
except Exception:
    _TZ_SH = None


def _report_list_generated_at(data: dict, mtime: float) -> str:
    """列表展示时间：优先用报告 JSON 内「生成时间」（已与北京时间一致），否则用文件 mtime 转上海时区。"""
    g = (data or {}).get("生成时间")
    if isinstance(g, str) and g.strip():
        return g.strip()
    if _TZ_SH is not None:
        return datetime.fromtimestamp(mtime, tz=_TZ_SH).strftime("%Y-%m-%d %H:%M")
    return datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M")

_GUX_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(_GUX_ROOT))

# 本地从 .env 加载（与 demo_ulti_analyst 一致；需 pip install python-dotenv）
_env_file = _GUX_ROOT / ".env"
if _env_file.is_file():
    try:
        from dotenv import load_dotenv

        load_dotenv(_env_file)
    except ImportError:
        pass

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi.responses import JSONResponse, StreamingResponse
from typing import Optional, List, Dict, Any

import requests

import db

app = FastAPI(title="股票分析 API", version="1.0")

# 启动时初始化数据库（有 POSTGRES_URL 则建表；无则静默跳过）
@app.on_event("startup")
def _startup():
    db.init_db()

# 浏览器跨域：与 Vercel 等静态域配合时，可设 ALLOWED_ORIGINS=https://a.vercel.app,https://b.com
# allow_origins=["*"] 时 allow_credentials 须为 False（规范要求）
_cors = (os.environ.get("ALLOWED_ORIGINS") or "").strip()
if _cors and _cors != "*":
    _origin_list = [x.strip() for x in _cors.split(",") if x.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

def _is_vercel_runtime() -> bool:
    return bool(os.environ.get("VERCEL") or os.environ.get("VERCEL_ENV"))


# Serverless 上项目目录只读，报告/预测/任务状态须落在可写盘（多为 /tmp）
if _is_vercel_runtime():
    _RUNTIME_DATA = Path("/tmp/guxiaomi_data")
    _RUNTIME_DATA.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR = _RUNTIME_DATA / "reports"
    PREDICTIONS_DIR = _RUNTIME_DATA / "predictions"
else:
    REPORTS_DIR = Path(__file__).resolve().parent / "reports"
    PREDICTIONS_DIR = Path(__file__).resolve().parent / "predictions"
REPORTS_DIR.mkdir(exist_ok=True)
PREDICTIONS_DIR.mkdir(exist_ok=True)

# 分析任务状态目录（供多实例/重启后仍能按 job_id 查询；Vercel 上仅同执行环境 /tmp 可见，跨实例仍可能短暂 404）
if _is_vercel_runtime():
    JOBS_DIR = Path("/tmp/guxiaomi_jobs")
else:
    JOBS_DIR = _GUX_ROOT / "jobs"
JOBS_DIR.mkdir(parents=True, exist_ok=True)

# Intellectia 选股器快照（与 OpenClaw skill intellectia-stock-screener 同源接口）
INTELLECTIA_SCREENER_URL = "https://api.intellectia.ai/gateway/v1/stock/screener-list"
# 实测 size>20 时接口返回 404；产品侧每页最多 10 条并支持翻页
INTELLECTIA_SCREENER_MAX_SIZE = 10
INTELLECTIA_REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; StockAnalyzer/1.0; +https://github.com/)",
    "Accept": "application/json",
}

HISTORY_REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; GuxiaomiHistory/1.0)",
    "Accept": "application/json,text/csv,text/plain,*/*",
}


def _infer_stock_from_base_name(base_name: str) -> tuple:
    """从报告文件名推断股票代码与市场（与 demo_ulti_analyst.report_base_name 格式一致）。"""
    if not base_name:
        return "", ""
    m = re.match(r"^(A股|港股|美股)_([^_]+)_(\d{8})_(\d{6})$", base_name)
    if not m:
        return "", ""
    market_map = {"A股": "A 股", "港股": "港股", "美股": "美股"}
    return (m.group(2).strip().upper(), market_map.get(m.group(1), ""))


def _normalize_market_code(market: str) -> str:
    m = (market or "").strip().upper()
    if m in {"US", "美股", "USA", "U.S."}:
        return "US"
    if m in {"HK", "港股", "HKG"}:
        return "HK"
    if m in {"CN", "A股", "A 股", "沪深", "中国"}:
        return "CN"
    return m or "CN"


def _parse_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    s = str(value).strip().replace(",", "").replace("%", "")
    if not s or s in {"-", "--", "None", "nan"}:
        return None
    try:
        return float(s)
    except Exception:
        return None


def _history_row(date: str, close: Any, open_: Any = None, high: Any = None, low: Any = None, volume: Any = None) -> Optional[Dict[str, Any]]:
    price = _parse_float(close)
    if not date or price is None or price <= 0:
        return None
    return {
        "date": str(date)[:10],
        "open": _parse_float(open_),
        "high": _parse_float(high),
        "low": _parse_float(low),
        "close": price,
        "price": price,
        "volume": int(_parse_float(volume) or 0),
    }


def _alpha_vantage_key() -> str:
    return (
        os.environ.get("ALPHA_VANTAGE_API_KEY")
        or os.environ.get("ALPHAVANTAGE_API_KEY")
        or ""
    ).strip()


def _fetch_us_history_alpha_vantage(symbol: str, days: int) -> List[Dict[str, Any]]:
    key = _alpha_vantage_key()
    if not key:
        return []
    url = "https://www.alphavantage.co/query"
    params = {
        "function": "TIME_SERIES_DAILY_ADJUSTED",
        "symbol": symbol.strip().upper(),
        "outputsize": "compact",
        "apikey": key,
    }
    res = requests.get(url, params=params, headers=HISTORY_REQUEST_HEADERS, timeout=12)
    res.raise_for_status()
    data = res.json()
    series = data.get("Time Series (Daily)")
    if not isinstance(series, dict):
        reason = data.get("Note") or data.get("Information") or data.get("Error Message") or data
        raise RuntimeError(f"Alpha Vantage 未返回日线: {reason}")
    rows: List[Dict[str, Any]] = []
    for date in sorted(series.keys()):
        point = series.get(date) or {}
        row = _history_row(
            date,
            point.get("4. close"),
            point.get("1. open"),
            point.get("2. high"),
            point.get("3. low"),
            point.get("6. volume"),
        )
        if row:
            rows.append(row)
    return rows[-max(days, 1):]


def _fetch_us_history_yahoo(symbol: str, days: int) -> List[Dict[str, Any]]:
    ticker = re.sub(r"[^A-Za-z0-9.\-]", "", symbol or "").upper()
    if not ticker:
        return []
    range_value = "1mo" if days <= 30 else "3mo" if days <= 90 else "6mo"
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    params = {"range": range_value, "interval": "1d"}
    res = requests.get(url, params=params, headers=HISTORY_REQUEST_HEADERS, timeout=12)
    res.raise_for_status()
    data = res.json()
    result = (((data.get("chart") or {}).get("result") or []) or [None])[0]
    if not result:
        return []
    timestamps = result.get("timestamp") or []
    quote = ((((result.get("indicators") or {}).get("quote") or []) or [None])[0]) or {}
    opens = quote.get("open") or []
    highs = quote.get("high") or []
    lows = quote.get("low") or []
    closes = quote.get("close") or []
    volumes = quote.get("volume") or []
    rows: List[Dict[str, Any]] = []
    for idx, ts in enumerate(timestamps):
        close = closes[idx] if idx < len(closes) else None
        if close is None:
            continue
        date = datetime.utcfromtimestamp(int(ts)).strftime("%Y-%m-%d")
        row = _history_row(
            date,
            close,
            opens[idx] if idx < len(opens) else None,
            highs[idx] if idx < len(highs) else None,
            lows[idx] if idx < len(lows) else None,
            volumes[idx] if idx < len(volumes) else None,
        )
        if row:
            rows.append(row)
    return rows[-max(days, 1):]


def _market_label_for_service(market_code: str) -> str:
    m = _normalize_market_code(market_code)
    if m == "US":
        return "美股"
    if m == "HK":
        return "港股"
    return "A 股"


def _parse_change_percent(value: Any) -> float:
    if value is None:
        return 0.0
    s = str(value).strip().replace("%", "")
    try:
        return float(s)
    except Exception:
        return 0.0


def _quote_response_from_fields(
    symbol: str,
    market_code: str,
    *,
    price: float,
    open_: float = 0.0,
    high: float = 0.0,
    low: float = 0.0,
    volume: int = 0,
    previous_close: float = 0.0,
    change_percent: Optional[float] = None,
    name: str = "",
    source: str = "",
    is_mock: bool = False,
) -> Dict[str, Any]:
    m = _normalize_market_code(market_code)
    digits = 2 if m == "CN" else 3
    prev = float(previous_close or 0)
    px = float(price or 0)
    if px <= 0:
        raise ValueError("无效价格")
    chg = round(px - prev, digits) if prev > 0 else 0.0
    pct = change_percent
    if pct is None:
        pct = (chg / prev * 100.0) if prev > 0 else 0.0
    return {
        "price": round(px, digits),
        "open": round(float(open_ or 0), digits),
        "high": round(float(high or px), digits),
        "low": round(float(low or px), digits),
        "volume": int(volume or 0),
        "previousClose": round(prev, digits) if prev > 0 else round(px, digits),
        "change": round(chg, digits),
        "changePercent": round(float(pct), 2),
        "symbol": (symbol or "").strip().upper(),
        "market": m,
        "name": (name or "").strip(),
        "isMock": bool(is_mock),
        "source": source or "",
    }


def _fetch_us_quote_yahoo(symbol: str) -> Dict[str, Any]:
    ticker = re.sub(r"[^A-Za-z0-9.\-]", "", symbol or "").upper()
    if not ticker:
        raise ValueError("无效美股代码")
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    params = {"range": "1d", "interval": "1d"}
    res = requests.get(url, params=params, headers=HISTORY_REQUEST_HEADERS, timeout=12)
    res.raise_for_status()
    data = res.json()
    result = (((data.get("chart") or {}).get("result") or []) or [None])[0]
    if not result:
        raise RuntimeError("Yahoo 未返回行情")
    meta = result.get("meta") or {}
    price = _parse_float(meta.get("regularMarketPrice"))
    if price is None or price <= 0:
        price = _parse_float(meta.get("previousClose"))
    if price is None or price <= 0:
        raise RuntimeError("Yahoo 无有效现价")
    prev = _parse_float(meta.get("chartPreviousClose")) or _parse_float(meta.get("previousClose")) or price
    return _quote_response_from_fields(
        ticker,
        "US",
        price=price,
        open_=_parse_float(meta.get("regularMarketOpen")) or price,
        high=_parse_float(meta.get("regularMarketDayHigh")) or price,
        low=_parse_float(meta.get("regularMarketDayLow")) or price,
        volume=int(_parse_float(meta.get("regularMarketVolume")) or 0),
        previous_close=prev or price,
        name=str(meta.get("longName") or meta.get("shortName") or ticker),
        source="Yahoo Finance",
    )


def _fetch_us_quote_alpha_vantage(symbol: str) -> Dict[str, Any]:
    key = _alpha_vantage_key()
    if not key:
        raise RuntimeError("未配置 ALPHA_VANTAGE_API_KEY")
    ticker = re.sub(r"[^A-Za-z0-9.\-]", "", symbol or "").upper()
    url = "https://www.alphavantage.co/query"
    params = {"function": "GLOBAL_QUOTE", "symbol": ticker, "apikey": key}
    res = requests.get(url, params=params, headers=HISTORY_REQUEST_HEADERS, timeout=12)
    res.raise_for_status()
    data = res.json()
    if data.get("Note") or data.get("Information"):
        raise RuntimeError(str(data.get("Note") or data.get("Information")))
    if data.get("Error Message"):
        raise RuntimeError(str(data.get("Error Message")))
    quote = data.get("Global Quote") or {}
    if not quote:
        raise RuntimeError("Alpha Vantage 无 Global Quote")
    price = _parse_float(quote.get("05. price"))
    if price is None or price <= 0:
        raise RuntimeError("Alpha Vantage 价格无效")
    prev = _parse_float(quote.get("08. previous close")) or price
    chg = _parse_float(quote.get("09. change")) or 0.0
    pct_raw = quote.get("10. change percent")
    pct = _parse_float(str(pct_raw).replace("%", "")) if pct_raw is not None else None
    return _quote_response_from_fields(
        ticker,
        "US",
        price=price,
        open_=_parse_float(quote.get("02. open")) or price,
        high=_parse_float(quote.get("03. high")) or price,
        low=_parse_float(quote.get("04. low")) or price,
        volume=int(_parse_float(quote.get("06. volume")) or 0),
        previous_close=prev,
        change_percent=pct if pct is not None else (chg / prev * 100.0 if prev else 0.0),
        name=ticker,
        source="Alpha Vantage",
    )


def _fetch_tencent_spot_quote(symbol: str, market: str) -> Dict[str, Any]:
    from demo_ulti_analyst import _http_get_text, _parse_tencent_gtimg_quote_line

    formatted = _tencent_history_symbol(symbol, market)
    if not formatted:
        raise ValueError("无效代码")
    url = f"https://qt.gtimg.cn/q={formatted}"
    text = _http_get_text(url, timeout=12.0)
    q = _parse_tencent_gtimg_quote_line(text)
    m = _normalize_market_code(market)
    sym = re.sub(r"\D", "", symbol or "")
    if m == "HK":
        sym = sym.zfill(5)
    elif m == "CN":
        sym = sym.zfill(6)
    return _quote_response_from_fields(
        sym,
        m,
        price=float(q["price"]),
        open_=float(q.get("open") or 0),
        high=float(q.get("high") or 0),
        low=float(q.get("low") or 0),
        volume=int(float(q.get("volume_hands") or 0) * 100),
        previous_close=float(q.get("previous_close") or 0),
        change_percent=float(q.get("change_pct") or 0),
        name=str(q.get("name") or ""),
        source="Tencent",
    )


def _fetch_quote_via_stock_service(symbol: str, market_code: str) -> Dict[str, Any]:
    from demo_ulti_analyst import StockDataService

    m = _normalize_market_code(market_code)
    label = _market_label_for_service(m)
    sd = StockDataService().get_stock_info(symbol, label, days=10)
    if (sd.股票名称 or "").startswith("【行情不可用") or (sd.最新价 or 0) <= 0:
        raise RuntimeError("多源合并后仍无有效现价")
    pct = _parse_change_percent(sd.涨跌幅)
    return _quote_response_from_fields(
        symbol,
        m,
        price=float(sd.最新价),
        previous_close=float(sd.最新价) / (1 + pct / 100.0) if pct else float(sd.最新价),
        change_percent=pct,
        name=str(sd.股票名称 or ""),
        source=str(sd.数据溯源 or "多源合并"),
    )


def _tencent_history_symbol(symbol: str, market: str) -> str:
    code = re.sub(r"\D", "", symbol or "")
    if market == "HK":
        return f"hk{code.zfill(5)}"
    if market == "CN":
        c = code.zfill(6)
        return ("sh" if c.startswith("6") else "sz") + c
    return symbol.strip().lower()


def _fetch_tencent_history(symbol: str, market: str, days: int) -> List[Dict[str, Any]]:
    formatted = _tencent_history_symbol(symbol, market)
    if not formatted:
        return []
    url = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
    params = {"param": f"{formatted},day,,,{max(days, 30)},qfq"}
    res = requests.get(url, params=params, headers=HISTORY_REQUEST_HEADERS, timeout=12)
    res.raise_for_status()
    data = res.json()
    block = ((data.get("data") or {}).get(formatted) or {})
    day_data = block.get("qfqday") or block.get("day") or []
    rows: List[Dict[str, Any]] = []
    for item in day_data:
        if not isinstance(item, list) or len(item) < 6:
            continue
        row = _history_row(item[0], item[2], item[1], item[3], item[4], item[5])
        if row:
            rows.append(row)
    return rows[-max(days, 1):]


def _fetch_sohu_history(symbol: str, market: str, days: int) -> List[Dict[str, Any]]:
    code = re.sub(r"\D", "", symbol or "")
    if market == "HK":
        sohu_code = f"hk_{code.zfill(5)}"
    elif market == "CN":
        c = code.zfill(6)
        sohu_code = f"cn_{'sh' if c.startswith('6') else 'sz'}{c}"
    else:
        return []
    end = datetime.utcnow().date()
    start = end - timedelta(days=max(days * 3, 45))
    url = "https://q.stock.sohu.com/hisHq"
    params = {
        "code": sohu_code,
        "start": start.strftime("%Y%m%d"),
        "end": end.strftime("%Y%m%d"),
        "stat": "1",
        "order": "A",
        "count": str(max(days, 30) * 2),
    }
    res = requests.get(url, params=params, headers=HISTORY_REQUEST_HEADERS, timeout=12)
    res.raise_for_status()
    data = res.json()
    if not isinstance(data, list) or not data or not isinstance(data[0].get("hq"), list):
        return []
    rows: List[Dict[str, Any]] = []
    for item in data[0]["hq"]:
        if not isinstance(item, list) or len(item) < 6:
            continue
        row = _history_row(item[0], item[2], item[1], item[6] if len(item) > 6 else None, item[5] if len(item) > 5 else None, item[7] if len(item) > 7 else None)
        if row:
            rows.append(row)
    rows.sort(key=lambda x: x["date"])
    return rows[-max(days, 1):]

# 异步任务状态：job_id -> { status: pending|running|done|failed, result?: dict, error?: str }
_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()

_JOB_ID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _job_disk_path(job_id: str) -> Optional[Path]:
    if not _JOB_ID_RE.match(job_id or ""):
        return None
    return JOBS_DIR / f"{job_id}.json"


def _persist_job_disk(job_id: str, job: Dict[str, Any]) -> None:
    path = _job_disk_path(job_id)
    if path is None:
        return
    payload = {
        "status": job.get("status"),
        "result": job.get("result"),
        "error": job.get("error"),
        "created_at": job.get("created_at"),
    }
    tmp = path.with_suffix(".json.tmp")
    try:
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
    except OSError:
        pass


def _load_job_disk(job_id: str) -> Optional[Dict[str, Any]]:
    path = _job_disk_path(job_id)
    if path is None or not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and data.get("status"):
            return data
    except (OSError, json.JSONDecodeError, TypeError):
        pass
    return None


def _market_norm(m: str) -> str:
    if not m:
        return "A 股"
    m = m.strip().upper()
    if m in ("A股", "CN", "A 股"):
        return "A 股"
    if m in ("港股", "HK"):
        return "港股"
    if m in ("美股", "US"):
        return "美股"
    return "A 股"


class ClientQuotePayload(BaseModel):
    """分析页浏览器用 stockAPI 拉到的现价（与添加股票同源）；服务端连不通腾讯时作合并首层。"""

    price: float = Field(..., gt=0, lt=1e12)
    change_percent: Optional[float] = None
    name: Optional[str] = None
    is_mock: bool = False


class AnalyzeRequest(BaseModel):
    stock_code: str
    market: str = "A 股"
    stock_name: Optional[str] = None  # 兼容旧版；优先使用 user_data_notes
    user_data_notes: Optional[str] = None  # 补充栏：可粘贴行情/基本面摘录，服务端规则/LLM 并入 StockData
    days: int = 90
    use_mock: bool = False
    client_quote: Optional[ClientQuotePayload] = None
    model_key: Optional[str] = "model2"


class ChatTurn(BaseModel):
    """深度诊断多轮对话中的一条（仅 user / assistant）。"""

    role: str
    content: str


class ChatRequest(BaseModel):
    stock_code: str
    market: str = "A 股"
    message: str
    report_base_name: Optional[str] = None
    report_text: Optional[str] = None
    use_mock: bool = False
    model_key: Optional[str] = "model2"
    stream: bool = False
    # 当前问题之前的对话轮次（不含本条 message），用于多轮延展
    history: List[ChatTurn] = Field(default_factory=list)


class LlmChatRequest(BaseModel):
    """通用对话：与 /api/analyze/chat 共用三模型槽位（LLM_MODEL1/2/3_*）。"""

    system: str = ""
    user: str
    history: List[ChatTurn] = Field(default_factory=list)
    stream: bool = False
    use_mock: bool = False
    max_tokens: int = 8192
    temperature: float = 0.7
    model_key: Optional[str] = "model2"


class ScreenerFetchRequest(BaseModel):
    """Intellectia screener-list 参数，见 openclaw intellectia-stock-screener skill。"""
    period_type: int = 0  # 0=日 1=周 2=月
    trend_type: int = 0   # 0=看涨 1=看跌
    symbol_type: int = 0  # 0=股票 1=ETF 2=加密货币
    page: int = 1
    size: int = 10  # 每页最多 10（且不超过上游上限）


class DeleteReportRequest(BaseModel):
    """删除历史报告（POST 正文，避免 Vercel 等对 DELETE+query 返回 404）。"""
    name: str


class DeleteScreenerRequest(BaseModel):
    """删除预测快照（POST 正文）。"""
    name: str


class WatchlistItemPayload(BaseModel):
    """关注列表单项。"""
    symbol: str
    market: str
    name: Optional[str] = None
    currentPrice: Optional[float] = 0
    previousClose: Optional[float] = None
    change: Optional[float] = 0
    changePercent: Optional[float] = 0
    marketData: Optional[Dict[str, Any]] = Field(default_factory=dict)
    priceHistory: Optional[List[Any]] = Field(default_factory=list)
    keywords: Optional[List[str]] = Field(default_factory=list)
    addedAt: Optional[str] = None
    watchStartPrice: Optional[float] = 0
    notes: Optional[str] = ""
    alertEnabled: Optional[bool] = False
    alertThreshold: Optional[float] = 5


class WatchlistRemoveRequest(BaseModel):
    symbol: str
    market: str


class WatchlistReplaceRequest(BaseModel):
    items: List[WatchlistItemPayload] = Field(default_factory=list)


class PortfolioStockPayload(BaseModel):
    """持仓股票单项。"""
    symbol: str
    market: str
    brokerChannel: Optional[str] = ""
    currentPrice: Optional[float] = 0
    marketData: Optional[Dict[str, Any]] = Field(default_factory=dict)
    technicalIndicators: Optional[Dict[str, Any]] = Field(default_factory=dict)
    positions: Optional[List[Any]] = Field(default_factory=list)
    priceHistory: Optional[List[Any]] = Field(default_factory=list)
    keywords: Optional[List[str]] = Field(default_factory=list)


class PortfolioRemoveRequest(BaseModel):
    symbol: str
    market: str


class CapitalPoolPayload(BaseModel):
    usd: float = 0
    hkd: float = 0
    cny: float = 0


class SettingsPayload(BaseModel):
    selectedModel: Optional[str] = None
    settings: Optional[Dict[str, Any]] = Field(default_factory=dict)


class PriceSnapshotPayload(BaseModel):
    symbol: str
    market: str
    snapshot_date: Optional[str] = None
    date: Optional[str] = None
    price: float
    previous_close: Optional[float] = None
    previousClose: Optional[float] = None
    change_amount: Optional[float] = None
    change: Optional[float] = None
    change_percent: Optional[float] = None
    changePercent: Optional[float] = None
    shares: Optional[float] = None
    market_value: Optional[float] = None
    marketValue: Optional[float] = None
    daily_profit: Optional[float] = None
    dailyProfit: Optional[float] = None
    source: Optional[str] = None
    context: Optional[str] = "quote"
    quote: Optional[Dict[str, Any]] = None
    marketData: Optional[Dict[str, Any]] = None


class PriceSnapshotBatchRequest(BaseModel):
    items: List[PriceSnapshotPayload] = Field(default_factory=list)


_MODEL_KEYS = ("model1", "model2", "model3")
_MODEL_LABEL_DEFAULTS = {
    "model1": "MiniMax",
    "model2": "Gemma",
    "model3": "Deepseek",
}


def _default_model_key() -> str:
    key = (os.environ.get("LLM_DEFAULT_MODEL_KEY") or "model2").strip().lower()
    return key if key in _MODEL_KEYS else "model2"


def _normalize_model_key(model_key: Optional[str]) -> str:
    key = (model_key or _default_model_key()).strip().lower()
    return key if key in _MODEL_KEYS else _default_model_key()


def _model_env_prefix(model_key: str) -> str:
    return f"LLM_{model_key.upper()}"


def _llm_model_config(model_key: Optional[str] = None, *, require_config: bool = True) -> Dict[str, Any]:
    key = _normalize_model_key(model_key)
    prefix = _model_env_prefix(key)
    label = (os.environ.get(f"{prefix}_LABEL") or _MODEL_LABEL_DEFAULTS[key]).strip()
    cfg: Dict[str, Any] = {
        "key": key,
        "label": label,
        "base_url": (os.environ.get(f"{prefix}_BASE_URL") or "").strip().rstrip("/"),
        "api_key": (os.environ.get(f"{prefix}_API_KEY") or "").strip(),
        "model": (os.environ.get(f"{prefix}_MODEL_ID") or "").strip(),
    }
    raw_max = (os.environ.get(f"{prefix}_MAX_TOKENS") or "").strip()
    if raw_max:
        try:
            cfg["max_tokens"] = max(256, min(int(raw_max), 32768))
        except ValueError:
            pass
    missing = [name for name in ("base_url", "api_key", "model") if not cfg.get(name)]
    cfg["configured"] = not missing
    if require_config and missing:
        raise HTTPException(
            status_code=500,
            detail=(
                f"{label} 模型配置不完整：请在 .env 中配置 "
                f"{prefix}_BASE_URL / {prefix}_API_KEY / {prefix}_MODEL_ID"
            ),
        )
    return cfg


def _public_model_options() -> List[Dict[str, Any]]:
    default_key = _default_model_key()
    options: List[Dict[str, Any]] = []
    for key in _MODEL_KEYS:
        cfg = _llm_model_config(key, require_config=False)
        options.append({
            "key": key,
            "label": cfg["label"],
            "configured": bool(cfg["configured"]),
            "default": key == default_key,
        })
    return options


class AnalystItem(BaseModel):
    分析师姓名: str
    角色定位: str
    投资建议: str
    置信程度: float
    核心分析: str
    核心要点: List[str]


class DebateItem(BaseModel):
    轮次编号: int
    多头观点: str
    空头观点: str
    裁判结论: str


def _report_to_payload(report, md_content: str, html_content: str, base_name: str) -> dict:
    return {
        "ok": True,
        "base_name": base_name,
        "分析主题": report.分析主题,
        "数据基准": report.数据基准,
        "生成时间": report.生成时间,
        "融合摘要": report.融合摘要,
        "最终建议": report.最终建议,
        "共识程度": round(report.共识程度, 2) if isinstance(report.共识程度, (int, float)) else report.共识程度,
        "加权得分": round(report.加权得分, 2) if isinstance(report.加权得分, (int, float)) else report.加权得分,
        "风险提示": report.风险提示,
        "操作建议": report.操作建议,
        "对比与异动": getattr(report, "对比与异动", "") or "",
        "数据快照补充": getattr(report, "快照补充说明", "") or "",
        "数据快照系统指标": getattr(report, "数据快照系统指标表行", "") or "",
        "分析师报告": [
            {
                "分析师姓名": r.分析师姓名,
                "角色定位": r.角色定位,
                "投资建议": r.投资建议,
                "置信程度": r.置信程度,
                "核心分析": r.核心分析,
                "核心要点": r.核心要点 or [],
            }
            for r in report.分析师报告
        ],
        "辩论轮次": [
            {
                "轮次编号": d.轮次编号,
                "多头观点": d.多头观点,
                "空头观点": d.空头观点,
                "裁判结论": d.裁判结论,
            }
            for d in report.辩论轮次
        ],
        "markdown": md_content,
        "html": html_content,
    }


def _run_analyze_task(job_id: str, req: AnalyzeRequest):
    import traceback
    try:
        with _jobs_lock:
            _jobs[job_id]["status"] = "running"
            _persist_job_disk(job_id, _jobs[job_id])
        from demo_ulti_analyst import (
            MultiAgentStockAnalyst,
            ReportExporter,
            report_base_name,
        )
        market = _market_norm(req.market)
        llm_config = None if req.use_mock else _llm_model_config(req.model_key, require_config=True)
        analyst = MultiAgentStockAnalyst(use_real_llm=not req.use_mock, debate_rounds=1, llm_config=llm_config)
        cq_dict = None
        if req.client_quote and not req.client_quote.is_mock:
            cq_dict = req.client_quote.model_dump(exclude_none=False)
        udn = (req.user_data_notes or "").strip() or None
        price_notes = _build_price_history_notes(req.stock_code.strip(), market)
        if price_notes:
            udn = (udn + "\n\n" + price_notes).strip() if udn else price_notes
        sn = (req.stock_name or "").strip() or None
        report = analyst.analyze(
            stock_code=req.stock_code.strip(),
            stock_name=sn,
            market=market,
            days=req.days,
            selected_analysts=None,
            reports_dir=REPORTS_DIR,
            client_quote=cq_dict,
            user_data_notes=udn,
        )
        base_name = report_base_name(market, req.stock_code, with_time=True)
        md_path = REPORTS_DIR / f"{base_name}.md"
        html_path = REPORTS_DIR / f"{base_name}.html"
        json_path = REPORTS_DIR / f"{base_name}.json"
        ReportExporter.to_markdown(report, str(md_path))
        ReportExporter.to_html(report, str(html_path))
        md_content = md_path.read_text(encoding="utf-8")
        html_content = html_path.read_text(encoding="utf-8")
        payload = _report_to_payload(report, md_content, html_content, base_name)
        payload["stock_code"] = req.stock_code.strip()
        payload["market"] = market
        theme = (payload.get("分析主题") or "").strip()
        if "（" in theme:
            payload["stock_name"] = theme.split("（")[0].strip()
        elif req.stock_name:
            payload["stock_name"] = (req.stock_name or "").strip()
        else:
            payload["stock_name"] = ""
        json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        if db.is_db_enabled():
            try:
                db.report_save(base_name, payload, md_content, html_content)
            except Exception as db_err:
                print(f"[db] 报告保存失败（仍保留文件）: {db_err}")
        with _jobs_lock:
            _jobs[job_id]["status"] = "done"
            _jobs[job_id]["result"] = payload
            _persist_job_disk(job_id, _jobs[job_id])
    except Exception as e:
        err_msg = str(e).strip()
        if len(err_msg) > 500:
            err_msg = err_msg[:497] + "..."
        traceback.print_exc()
        with _jobs_lock:
            _jobs[job_id]["status"] = "failed"
            _jobs[job_id]["error"] = err_msg
            _persist_job_disk(job_id, _jobs[job_id])


@app.post("/api/analyze")
def api_analyze(req: AnalyzeRequest):
    """提交分析任务，立即返回 job_id；分析在后台执行，报告默认保存。轮询 GET /api/analyze/status/{job_id} 获取结果。

    Vercel Serverless：请求返回后实例可能被冻结/轮换，后台线程与 /tmp 任务在轮询时经常对不上 → 分析看似「卡住」或 status 404。
    因此在 Vercel 运行时改为**本请求内同步跑完**分析，并在响应里直接带上 result / error（前端可跳过轮询）。
    """
    job_id = str(uuid.uuid4())
    with _jobs_lock:
        _jobs[job_id] = {
            "status": "pending",
            "result": None,
            "error": None,
            "created_at": datetime.now().isoformat(),
        }
        _persist_job_disk(job_id, _jobs[job_id])

    if _is_vercel_runtime():
        _run_analyze_task(job_id, req)
        with _jobs_lock:
            job = dict(_jobs.get(job_id) or {})
        out: Dict[str, Any] = {"ok": True, "job_id": job_id, "sync": True}
        st = job.get("status")
        if st == "done" and job.get("result"):
            out["status"] = "done"
            out["result"] = job["result"]
        elif st == "failed":
            out["status"] = "failed"
            out["error"] = job.get("error") or "分析失败"
        else:
            out["status"] = st or "unknown"
            out["error"] = job.get("error")
        return out

    t = threading.Thread(target=_run_analyze_task, args=(job_id, req), daemon=True)
    t.start()
    return {"ok": True, "job_id": job_id}


@app.get("/api/analyze/status/{job_id}")
def api_analyze_status(job_id: str):
    """查询分析任务状态。status: pending|running|done|failed；完成时返回 result。"""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        job = _load_job_disk(job_id)
        if job:
            with _jobs_lock:
                _jobs[job_id] = job
    if not job:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")
    out = {"status": job["status"]}
    if job["status"] == "done" and job.get("result"):
        out["result"] = job["result"]
    if job["status"] == "failed" and job.get("error"):
        out["error"] = job["error"]
    return out


@app.get("/api/reports/list")
def api_reports_list():
    """历史报告列表，按生成时间倒序；数据库与本地文件合并，数据库优先。"""
    db_items = db.reports_list() if db.is_db_enabled() else []
    db_map = {it["base_name"]: it for it in db_items}

    items = []
    for f in REPORTS_DIR.glob("*.json"):
        try:
            mtime = f.stat().st_mtime
            base_name = f.stem
            if base_name in db_map:
                continue
            stock_code = ''
            market = ''
            data: Dict[str, Any] = {}
            try:
                data = json.loads(f.read_text(encoding='utf-8'))
                stock_code = (data.get('stock_code') or '').strip().upper() if data.get('stock_code') else ''
                market = (data.get('market') or '').strip()
            except Exception:
                pass
            if not stock_code or not market:
                inf_code, inf_mkt = _infer_stock_from_base_name(base_name)
                if not stock_code:
                    stock_code = inf_code
                if not market:
                    market = inf_mkt
            items.append({
                "base_name": base_name,
                "generated_at": _report_list_generated_at(data, mtime),
                "stock_code": stock_code,
                "market": market,
                "_mtime": mtime,
            })
        except OSError:
            continue

    combined = list(db_map.values()) + items
    combined.sort(key=lambda x: x.get("_mtime") or 0, reverse=True)
    for it in combined:
        it.pop("_mtime", None)
    return {"ok": True, "items": combined}


@app.get("/api/reports/get")
def api_reports_get(name: str):
    """根据 base_name 获取已保存的报告内容；数据库优先，本地文件兜底。"""
    if not name or ".." in name or "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="无效的报告名")
    if db.is_db_enabled():
        data = db.report_get(name)
        if data is not None:
            return data
    path = REPORTS_DIR / f"{name}.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="报告不存在")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _reports_delete_impl(name: str) -> dict:
    """删除指定 base_name 的报告（数据库 + 本地文件）；幂等。"""
    name = (name or "").strip()
    if not name or ".." in name or "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="无效的报告名")
    if Path(name).name != name:
        raise HTTPException(status_code=400, detail="无效的报告名")
    deleted_any = False
    if db.is_db_enabled():
        try:
            db.report_delete(name)
            deleted_any = True
        except Exception:
            pass
    for ext in (".json", ".md", ".html"):
        path = REPORTS_DIR / f"{name}{ext}"
        try:
            if path.is_file():
                path.unlink()
                deleted_any = True
        except OSError as e:
            raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True, "deleted": deleted_any}


@app.delete("/api/reports/delete")
def api_reports_delete(name: str):
    """删除报告（查询参数 name）。部分托管对 DELETE 支持差，优先用 POST。"""
    return _reports_delete_impl(name)


@app.post("/api/reports/delete")
def api_reports_delete_post(req: DeleteReportRequest):
    """删除报告（JSON body: {\"name\": \"...\"}）。Vercel 等推荐此方式；含中文 base_name 更稳。"""
    return _reports_delete_impl(req.name)


def _screener_period_label(pt: int) -> str:
    return {0: "日（明日）", 1: "周", 2: "月"}.get(pt, str(pt))


def _screener_trend_label(tt: int) -> str:
    return {0: "看涨", 1: "看跌"}.get(tt, str(tt))


def _screener_symbol_kind(st: int) -> str:
    return {0: "股票", 1: "ETF", 2: "加密货币"}.get(st, str(st))


def _safe_prediction_name(name: str) -> bool:
    if not name or ".." in name or "/" in name or "\\" in name:
        return False
    return Path(name).name == name


@app.post("/api/screener/fetch")
def api_screener_fetch(req: ScreenerFetchRequest):
    """拉取 Intellectia 选股列表并保存为本地快照（供「股票预测」历史查看）。"""
    pt, tt, st = req.period_type, req.trend_type, req.symbol_type
    if pt not in (0, 1, 2):
        raise HTTPException(status_code=400, detail="period_type 须为 0(日)/1(周)/2(月)")
    if tt not in (0, 1):
        raise HTTPException(status_code=400, detail="trend_type 须为 0(看涨)/1(看跌)")
    if st not in (0, 1, 2):
        raise HTTPException(status_code=400, detail="symbol_type 须为 0(股票)/1(ETF)/2(加密货币)")
    page = max(1, int(req.page))
    size = max(1, min(int(req.size), INTELLECTIA_SCREENER_MAX_SIZE))

    params = {
        "symbol_type": st,
        "period_type": pt,
        "trend_type": tt,
        "profit_asc": "false",
        "market_cap": 0,
        "price": 0,
        "page": page,
        "size": size,
    }
    try:
        r = requests.get(
            INTELLECTIA_SCREENER_URL,
            params=params,
            headers=INTELLECTIA_REQUEST_HEADERS,
            timeout=45,
        )
        r.raise_for_status()
        payload = r.json()
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Intellectia 请求失败: {e}")
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=502, detail="Intellectia 返回非 JSON")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="Intellectia 响应格式异常")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_name = f"scr_p{pt}_t{tt}_s{st}_p{page}_{ts}"
    inner = payload.get("data")
    if inner is not None and not isinstance(inner, dict):
        inner = {}

    saved_doc = {
        "ok": True,
        "base_name": base_name,
        "saved_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "period_type": pt,
        "trend_type": tt,
        "symbol_type": st,
        "page": page,
        "page_size": size,
        "period_label": _screener_period_label(pt),
        "trend_label": _screener_trend_label(tt),
        "symbol_kind": _screener_symbol_kind(st),
        "source": "Intellectia",
        "source_api": INTELLECTIA_SCREENER_URL,
        "intellectia_ret": payload.get("ret"),
        "intellectia_msg": payload.get("msg"),
        "data": inner,
        "raw": payload,
    }
    out_path = PREDICTIONS_DIR / f"{base_name}.json"
    out_path.write_text(json.dumps(saved_doc, ensure_ascii=False, indent=2), encoding="utf-8")
    if db.is_db_enabled():
        try:
            db.screener_save(saved_doc)
        except Exception as db_err:
            print(f"[db] 预测快照保存失败（仍保留文件）: {db_err}")

    lst = (inner or {}).get("list") or []
    return {
        "ok": True,
        "base_name": base_name,
        "page": page,
        "page_size": size,
        "ret": payload.get("ret"),
        "msg": payload.get("msg"),
        "total": (inner or {}).get("total"),
        "list_count": len(lst),
    }


@app.get("/api/screener/list")
def api_screener_list():
    """已保存的预测快照列表（按保存时间倒序）；数据库与本地文件合并，数据库优先。"""
    db_items = db.screener_list() if db.is_db_enabled() else []
    db_map = {it["base_name"]: it for it in db_items}

    items: List[Dict[str, Any]] = []
    for f in PREDICTIONS_DIR.glob("*.json"):
        try:
            mtime = f.stat().st_mtime
            d = json.loads(f.read_text(encoding="utf-8"))
            base_name = d.get("base_name") or f.stem
            if base_name in db_map:
                continue
            data_inner = d.get("data") if isinstance(d.get("data"), dict) else {}
            row_list = data_inner.get("list") or []
            items.append({
                "base_name": base_name,
                "saved_at": d.get("saved_at") or datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S"),
                "period_label": d.get("period_label"),
                "trend_label": d.get("trend_label"),
                "symbol_kind": d.get("symbol_kind"),
                "page": d.get("page"),
                "page_size": d.get("page_size"),
                "total": data_inner.get("total"),
                "list_count": len(row_list) if isinstance(row_list, list) else 0,
                "_sort": mtime,
            })
        except (OSError, json.JSONDecodeError, TypeError):
            continue

    combined = list(db_map.values()) + items
    # db.screener_list 已按 saved_at 倒序，这里简单合并再按 saved_at 字符串排序
    combined.sort(key=lambda x: x.get("saved_at") or "", reverse=True)
    for it in combined:
        it.pop("_sort", None)
    return {"ok": True, "items": combined}


@app.get("/api/screener/get")
def api_screener_get(name: str):
    """读取单条预测快照完整内容；数据库优先，本地文件兜底。"""
    if not _safe_prediction_name(name):
        raise HTTPException(status_code=400, detail="无效的快照名")
    if db.is_db_enabled():
        data = db.screener_get(name)
        if data is not None:
            return data
    path = PREDICTIONS_DIR / f"{name}.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="快照不存在")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _screener_delete_impl(name: str) -> dict:
    name = (name or "").strip()
    if not _safe_prediction_name(name):
        raise HTTPException(status_code=400, detail="无效的快照名")
    deleted = False
    if db.is_db_enabled():
        try:
            db.screener_delete(name)
            deleted = True
        except Exception:
            pass
    path = PREDICTIONS_DIR / f"{name}.json"
    try:
        if path.is_file():
            path.unlink()
            deleted = True
    except OSError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True, "deleted": deleted}


@app.delete("/api/screener/delete")
def api_screener_delete(name: str):
    """删除预测快照（查询参数）。"""
    return _screener_delete_impl(name)


@app.post("/api/screener/delete")
def api_screener_delete_post(req: DeleteScreenerRequest):
    """删除预测快照（JSON body: {\"name\": \"...\"}）。"""
    return _screener_delete_impl(req.name)


@app.get("/api/screener/symbols")
def api_screener_symbols(name: str, limit: int = 200):
    """获取某条预测快照里的股票明细；数据库优先，本地文件兜底解析。"""
    if not _safe_prediction_name(name):
        raise HTTPException(status_code=400, detail="无效的快照名")
    if db.is_db_enabled():
        items = db.screener_symbols_list(base_name=name, limit=limit)
        if items:
            return {"ok": True, "items": items}
    path = PREDICTIONS_DIR / f"{name}.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="快照不存在")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        inner = (data.get("data") or {}).get("list") or []
        return {"ok": True, "items": inner[:max(limit, 1)]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/screener/symbol-history")
def api_screener_symbol_history(symbol: str, market: Optional[str] = None, limit: int = 200):
    """获取某只股票的历史预测记录（跨快照聚合）。"""
    symbol = (symbol or "").strip().upper()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol 不能为空")
    if not db.is_db_enabled():
        return {"ok": True, "items": []}
    items = db.screener_symbols_list(symbol=symbol, market=market, limit=limit)
    return {"ok": True, "items": items}


# ---------------------------------------------------------------------------
# User data: watchlist, portfolio, capital pool, settings
# ---------------------------------------------------------------------------

@app.get("/api/watchlist/list")
def api_watchlist_list():
    """获取当前用户的关注列表。"""
    return {"ok": True, "items": db.watchlist_list()}


@app.post("/api/watchlist/add")
def api_watchlist_add(item: WatchlistItemPayload):
    """添加或更新关注列表中的某一项。"""
    db.watchlist_upsert("default", item.model_dump())
    return {"ok": True, "items": db.watchlist_list()}


@app.post("/api/watchlist/remove")
def api_watchlist_remove(req: WatchlistRemoveRequest):
    """从关注列表移除指定股票。"""
    db.watchlist_delete("default", req.symbol, req.market)
    return {"ok": True, "items": db.watchlist_list()}


@app.post("/api/watchlist/replace")
def api_watchlist_replace(req: WatchlistReplaceRequest):
    """全量替换关注列表（用于前端批量同步）。"""
    db.watchlist_replace("default", [it.model_dump() for it in req.items])
    return {"ok": True, "items": db.watchlist_list()}


@app.post("/api/watchlist/clear")
def api_watchlist_clear():
    """清空关注列表。"""
    db.watchlist_replace("default", [])
    return {"ok": True, "items": db.watchlist_list()}


@app.get("/api/portfolio/list")
def api_portfolio_list():
    """获取当前用户的持仓列表。"""
    return {"ok": True, "items": db.portfolio_list()}


@app.post("/api/portfolio/save")
def api_portfolio_save(stock: PortfolioStockPayload):
    """保存或更新持仓股票。"""
    db.portfolio_upsert("default", stock.model_dump())
    return {"ok": True, "items": db.portfolio_list()}


@app.post("/api/portfolio/save-all")
def api_portfolio_save_all(stocks: List[PortfolioStockPayload]):
    """批量保存持仓股票（全量同步：删除云端多余项后 upsert）。"""
    incoming_keys = {
        (s.market.upper().strip(), s.symbol.upper().strip())
        for s in stocks
    }
    for item in db.portfolio_list():
        key = (item["market"].upper().strip(), item["symbol"].upper().strip())
        if key not in incoming_keys:
            db.portfolio_delete("default", item["symbol"], item["market"])
    for stock in stocks:
        db.portfolio_upsert("default", stock.model_dump())
    return {"ok": True, "items": db.portfolio_list()}


@app.post("/api/portfolio/remove")
def api_portfolio_remove(req: PortfolioRemoveRequest):
    """移除持仓股票。"""
    db.portfolio_delete("default", req.symbol, req.market)
    return {"ok": True, "items": db.portfolio_list()}


@app.get("/api/capital-pool/get")
def api_capital_pool_get():
    """获取资金池。"""
    return {"ok": True, "pool": db.capital_pool_get()}


@app.post("/api/capital-pool/set")
def api_capital_pool_set(pool: CapitalPoolPayload):
    """设置资金池。"""
    db.capital_pool_set("default", pool.model_dump())
    return {"ok": True, "pool": db.capital_pool_get()}


@app.get("/api/settings/get")
def api_settings_get():
    """获取用户设置。"""
    return {"ok": True, "settings": db.settings_get()}


@app.post("/api/settings/set")
def api_settings_set(payload: SettingsPayload):
    """保存用户设置。"""
    data = payload.model_dump()
    if payload.selectedModel:
        data["selectedModel"] = payload.selectedModel
    db.settings_set("default", data)
    return {"ok": True, "settings": db.settings_get()}


def _persist_quote_snapshot(
    symbol: str,
    market: str,
    quote: Dict[str, Any],
    source: str = "",
    context: str = "quote",
    shares: Optional[float] = None,
    market_value: Optional[float] = None,
    daily_profit: Optional[float] = None,
) -> None:
    """每次成功拉取行情后写入日快照。"""
    if not db.is_db_enabled() or not quote:
        return
    try:
        db.price_snapshot_upsert(
            "default",
            {
                "symbol": symbol,
                "market": market,
                "snapshot_date": datetime.now().strftime("%Y-%m-%d"),
                "price": quote.get("price"),
                "previous_close": quote.get("previousClose"),
                "change_amount": quote.get("change"),
                "change_percent": quote.get("changePercent"),
                "shares": shares,
                "market_value": market_value,
                "daily_profit": daily_profit,
                "source": source or quote.get("source") or "",
                "context": context,
                "quote": quote,
            },
        )
    except Exception:
        pass


def _merge_history_rows(external: List[Dict[str, Any]], snapshots: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """合并外部日线与数据库快照，按日期去重（快照优先补 shares/marketValue）。"""
    by_date: Dict[str, Dict[str, Any]] = {}
    for row in external or []:
        if not isinstance(row, dict):
            continue
        d = (row.get("date") or row.get("Date") or "")[:10]
        if not d:
            continue
        by_date[d] = dict(row)
    for snap in snapshots or []:
        d = (snap.get("date") or "")[:10]
        if not d:
            continue
        existing = by_date.get(d) or {}
        price = snap.get("price") or existing.get("close") or existing.get("price")
        merged = {
            **existing,
            "date": d,
            "close": price,
            "price": price,
            "previousClose": snap.get("previousClose") or existing.get("previousClose"),
            "shares": snap.get("shares") if snap.get("shares") is not None else existing.get("shares"),
            "dailyProfit": snap.get("dailyProfit") if snap.get("dailyProfit") is not None else existing.get("dailyProfit"),
            "marketValue": snap.get("marketValue") if snap.get("marketValue") is not None else existing.get("marketValue"),
            "source": snap.get("source") or existing.get("source") or "db_snapshot",
        }
        by_date[d] = merged
    return [by_date[k] for k in sorted(by_date.keys())]


def _build_price_history_notes(symbol: str, market: str) -> str:
    """为分析任务拼接多周期价格快照摘要。"""
    if not db.is_db_enabled():
        return ""
    sym = (symbol or "").strip().upper()
    m = _normalize_market_code(market)
    parts: List[str] = []
    for days, label in ((7, "近7日"), (15, "近15日"), (30, "近30日")):
        rows = db.price_snapshot_list(sym, m, days=days)
        if not rows:
            continue
        lines = []
        for r in rows:
            line = f"{r.get('date')} 收盘{r.get('price')}"
            if r.get("shares") is not None:
                line += f" 持仓{r.get('shares')}"
            if r.get("marketValue") is not None:
                line += f" 市值{r.get('marketValue')}"
            if r.get("dailyProfit") is not None:
                line += f" 当日盈亏{r.get('dailyProfit')}"
            lines.append(line)
        parts.append(f"【{label}行情快照（数据库）】\n" + "\n".join(lines))
    return "\n\n".join(parts)


@app.post("/api/price-snapshots/record")
def api_price_snapshots_record(req: PriceSnapshotBatchRequest):
    """批量记录价格快照（前端刷新行情/更新持仓时调用）。"""
    if not db.is_db_enabled():
        return {"ok": False, "recorded": 0, "message": "数据库未启用"}
    items = [item.model_dump(exclude_none=True) for item in req.items]
    count = db.price_snapshot_record_batch("default", items)
    return {"ok": True, "recorded": count}


@app.get("/api/price-snapshots/history")
def api_price_snapshots_history(symbol: str, market: str = "US", days: int = 30):
    """查询某只股票在数据库中的日快照（7/15/30 天走势分析用）。"""
    sym = (symbol or "").strip().upper()
    if not sym:
        raise HTTPException(status_code=400, detail="symbol 不能为空")
    m = _normalize_market_code(market)
    n = max(1, min(int(days or 30), 365))
    if not db.is_db_enabled():
        return {"ok": True, "symbol": sym, "market": m, "days": n, "history": [], "source": "none"}
    history = db.price_snapshot_list(sym, m, days=n)
    return {
        "ok": True,
        "symbol": sym,
        "market": m,
        "days": n,
        "history": history,
        "source": "postgres",
    }


@app.get("/api/stock/quote")
def api_stock_quote(symbol: str, market: str = "US"):
    """实时行情：由后端拉取真实数据源，避免浏览器 CORS/代理导致落入模拟价。"""
    sym = (symbol or "").strip().upper()
    if not sym:
        raise HTTPException(status_code=400, detail="symbol 不能为空")
    m = _normalize_market_code(market)
    errors: List[str] = []

    if m == "US":
        fetchers = [
            ("Yahoo Finance", lambda: _fetch_us_quote_yahoo(sym)),
            ("Alpha Vantage", lambda: _fetch_us_quote_alpha_vantage(sym)),
        ]
    elif m in {"HK", "CN"}:
        fetchers = [
            ("Tencent", lambda: _fetch_tencent_spot_quote(sym, m)),
        ]
    else:
        raise HTTPException(status_code=400, detail=f"不支持的市场: {market}")

    for source, fetcher in fetchers:
        try:
            quote = fetcher()
            _persist_quote_snapshot(sym, m, quote, source=source, context="quote")
            return {
                "ok": True,
                "symbol": sym,
                "market": m,
                "source": source,
                "has_alpha_vantage_key": bool(_alpha_vantage_key()),
                "quote": quote,
            }
        except Exception as exc:
            errors.append(f"{source}: {exc}")

    try:
        quote = _fetch_quote_via_stock_service(sym, m)
        src = quote.get("source") or "多源合并"
        _persist_quote_snapshot(sym, m, quote, source=src, context="quote")
        return {
            "ok": True,
            "symbol": sym,
            "market": m,
            "source": quote.get("source") or "多源合并",
            "has_alpha_vantage_key": bool(_alpha_vantage_key()),
            "quote": quote,
        }
    except Exception as exc:
        errors.append(f"多源合并: {exc}")

    return JSONResponse(
        {
            "ok": False,
            "symbol": sym,
            "market": m,
            "source": "",
            "has_alpha_vantage_key": bool(_alpha_vantage_key()),
            "quote": None,
            "errors": errors[-6:],
        },
        status_code=200,
    )


@app.get("/api/stock/history")
def api_stock_history(symbol: str, market: str = "US", days: int = 30):
    """统一历史日线接口：价格趋势图使用，第三方密钥只在后端读取。

    US: Yahoo Finance -> Alpha Vantage fallback
    HK/CN: 腾讯历史日线 -> 搜狐 fallback
    """
    sym = (symbol or "").strip().upper()
    if not sym:
        raise HTTPException(status_code=400, detail="symbol 不能为空")
    m = _normalize_market_code(market)
    n = max(1, min(int(days or 30), 120))
    errors: List[str] = []

    if m == "US":
        sources = [
            ("Yahoo Finance", lambda: _fetch_us_history_yahoo(sym, n)),
            ("Alpha Vantage", lambda: _fetch_us_history_alpha_vantage(sym, n)),
        ]
    elif m in {"HK", "CN"}:
        sources = [
            ("Tencent", lambda: _fetch_tencent_history(sym, m, n)),
            ("Sohu", lambda: _fetch_sohu_history(sym, m, n)),
        ]
    else:
        raise HTTPException(status_code=400, detail=f"不支持的市场: {market}")

    for source, fetcher in sources:
        try:
            rows = fetcher()
            if rows:
                db_rows = db.price_snapshot_list(sym, m, days=n) if db.is_db_enabled() else []
                merged = _merge_history_rows(rows[-n:], db_rows)
                return {
                    "ok": True,
                    "symbol": sym,
                    "market": m,
                    "days": n,
                    "source": source + ("+db" if db_rows else ""),
                    "has_alpha_vantage_key": bool(_alpha_vantage_key()),
                    "history": merged[-n:],
                }
            errors.append(f"{source}: empty")
        except Exception as exc:
            errors.append(f"{source}: {exc}")

    if db.is_db_enabled():
        db_rows = db.price_snapshot_list(sym, m, days=n)
        if db_rows:
            return {
                "ok": True,
                "symbol": sym,
                "market": m,
                "days": n,
                "source": "postgres",
                "has_alpha_vantage_key": bool(_alpha_vantage_key()),
                "history": db_rows,
            }

    return JSONResponse(
        {
            "ok": False,
            "symbol": sym,
            "market": m,
            "days": n,
            "source": "",
            "has_alpha_vantage_key": bool(_alpha_vantage_key()),
            "history": [],
            "errors": errors[-4:],
        },
        status_code=200,
    )


@app.get("/api/news")
def api_news(code: str = "", market: str = "A 股", name: str = "", keywords: str = "", hours: int = 48):
    """拉取新闻（GNews + RSS）。keywords 为逗号分隔；仅关键词时可不传 code。"""
    try:
        from news_feeds import get_news_for_page, _gnews_api_key
        market = _market_norm(market) if market else ""
        extra = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else None
        raw = get_news_for_page(name or "", (code or "").strip(), market, extra_keywords=extra, max_age_hours=hours, max_items=200)
        items = [{
            "title": it.get("title") or "",
            "source": it.get("source") or "",
            "link": it.get("link") or "",
            "summary": it.get("summary") or "",
            "pub_date": it.get("pub_date") or "",
            "source_type": it.get("source_type") or "rss",
            "matched_keywords": it.get("matched_keywords") or [],
        } for it in raw]
        gnews_count = sum(1 for x in items if x.get("source_type") == "gnews")
        return {
            "ok": True,
            "items": items,
            "gnews_enabled": bool(_gnews_api_key()),
            "gnews_count": gnews_count,
            "rss_count": len(items) - gnews_count,
        }
    except Exception as e:
        return {"ok": False, "items": [], "gnews_enabled": False, "error": str(e)}


@app.get("/api/news/pinned")
def api_news_pinned(keywords: str = "", hours: int = 72):
    """推荐新闻专区：按锁定关键词拉取头条。"""
    try:
        from news_feeds import get_pinned_headlines, _gnews_api_key
        kw = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else []
        raw = get_pinned_headlines(kw, max_age_hours=hours, max_items=40)
        items = [{
            "title": it.get("title") or "",
            "source": it.get("source") or "",
            "link": it.get("link") or "",
            "summary": it.get("summary") or "",
            "pub_date": it.get("pub_date") or "",
            "source_type": it.get("source_type") or "rss",
            "matched_keywords": it.get("matched_keywords") or [],
        } for it in raw]
        gnews_count = sum(1 for x in items if x.get("source_type") == "gnews")
        return {
            "ok": True,
            "items": items,
            "gnews_enabled": bool(_gnews_api_key()),
            "gnews_count": gnews_count,
            "rss_count": len(items) - gnews_count,
        }
    except Exception as e:
        return {"ok": False, "items": [], "gnews_enabled": False, "error": str(e)}


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/news/check-feeds")
def api_news_check_feeds():
    """检查新闻页使用的 RSS 订阅源是否可用，返回每个源的 ok、items_count、error。"""
    try:
        from news_feeds import check_feeds, NEWSPAGE_RSS_URLS
        feeds = check_feeds(NEWSPAGE_RSS_URLS, timeout_per_url=12)
        ok_count = sum(1 for f in feeds if f.get("ok"))
        return {"ok": True, "feeds": feeds, "summary": {"total": len(feeds), "ok": ok_count}}
    except Exception as e:
        return {"ok": False, "feeds": [], "error": str(e)}


def _truncate_chat_report(text: str, max_chars: int = 28000) -> str:
    """控制单次对话附带的报告长度，避免撑爆上下文。"""
    t = (text or "").strip()
    if len(t) <= max_chars:
        return t
    return t[: max_chars - 20] + "\n…（报告摘录已截断）"


def _sanitize_chat_answer(text: str) -> str:
    """去掉模型常见的思考块、元叙述前缀，避免浪费展示位。"""
    if not text or not isinstance(text, str):
        return text or ""
    s = text.strip()
    # 与 demo_ulti_analyst._clean_llm_output 一致：<think>...</think>
    s = re.sub(r"<think>[\s\S]*?</think>", "", s, flags=re.IGNORECASE | re.DOTALL)
    s = re.sub(r"<thinking>[\s\S]*?</thinking>", "", s, flags=re.IGNORECASE | re.DOTALL)
    s = re.sub(r"^(think|思考)[：:]\s*", "", s, flags=re.IGNORECASE | re.MULTILINE)
    # 「用户询问…」「让我先分析」类元开头（单行或多行短前缀）
    meta_patterns = [
        r"^(?:用户(?:询问|问|提到|希望)[^。\n]{0,80}[。\n]\s*)+",
        r"^(?:根据(?:您的)?问题[^。\n]{0,60}[。\n]\s*)+",
        r"^(?:针对(?:您|你)的问题[^。\n]{0,100}[。\n]\s*)+",
        r"^(?:让我(?:先)?(?:分析|梳理|整理)[^。\n]{0,80}[。\n]\s*)+",
        r"^(?:我需要(?:先)?[^。\n]{0,100}[。\n]\s*)+",
        r"^(?:从报告中[^。\n]{0,80}可以看到[^。\n]{0,120}[。\n]\s*)+",
    ]
    for _ in range(3):
        orig = s
        for p in meta_patterns:
            s = re.sub(p, "", s, flags=re.MULTILINE)
        if s == orig:
            break
    return re.sub(r"\n{3,}", "\n\n", s).strip()


def _strip_trailing_investment_disclaimer(text: str) -> str:
    """去掉回复末尾常见的「投资参考/免责」套话（模型仍爱加时的兜底）。"""
    if not text or not isinstance(text, str):
        return text or ""
    s = text.rstrip()
    # 末尾独立短段：免责声明、投资有风险等
    tail_pat = (
        r"(?:\n{2,}|^)"
        r"(?:[*•\-\s]*"
        r"(?:"
        r"不构成任何投资建议|不构成投资建议|仅供参考|投资有风险|入市需谨慎|"
        r"本文(?:不)?构成|风险提示[:：]|【风险提示】|【免责声明】"
        r")[^\n]{0,200})"
        r"(?:\n|$)+$"
    )
    for _ in range(4):
        ns = re.sub(tail_pat, "", s, flags=re.IGNORECASE | re.MULTILINE)
        if ns == s:
            break
        s = ns.rstrip()
    # 常见「以上.*参考」收尾句
    s = re.sub(
        r"\n*以上(?:内容|分析|观点)?(?:仅供|仅作)[^。\n]{0,80}。[\s\n]*$",
        "",
        s,
        flags=re.IGNORECASE,
    )
    return s.rstrip()


def _vllm_env(model_key: Optional[str] = None) -> tuple:
    cfg = _llm_model_config(model_key, require_config=True)
    return cfg["base_url"], cfg["api_key"], cfg["model"], cfg["label"]


def _vllm_parse_message_content(data: dict) -> str:
    if not isinstance(data, dict):
        return ""
    answer = ""
    if data.get("choices"):
        choice = data["choices"][0]
        if isinstance(choice, dict):
            msg = choice.get("message")
            if isinstance(msg, dict) and msg.get("content"):
                answer = str(msg.get("content") or "")
            elif choice.get("text"):
                answer = str(choice.get("text") or "")
    elif data.get("response"):
        answer = str(data.get("response") or "")
    elif data.get("output"):
        answer = str(data.get("output") or "")
    return answer.strip()


def _vllm_chat_complete_json(
    messages: List[Dict[str, str]],
    *,
    max_tokens: int = 3072,
    temperature: float = 0.7,
    model_key: Optional[str] = None,
) -> dict:
    """调用 OpenAI 兼容 /chat/completions；失败时尝试备选 body（部分网关）。"""
    vllm_base, vllm_key, vllm_model, _ = _vllm_env(model_key)
    payload = {
        "model": vllm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }
    try:
        resp = requests.post(
            f"{vllm_base}/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {vllm_key}",
            },
            json=payload,
            timeout=300,
        )
        if resp.status_code == 200:
            return resp.json()
        fallback_payload = {
            "model_id": vllm_model,
            "input": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        resp2 = requests.post(
            vllm_base,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {vllm_key}",
            },
            json=fallback_payload,
            timeout=300,
        )
        if resp2.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=(
                    f"vllm 失败(主/备选): {resp.status_code}/{resp2.status_code}, "
                    f"主: {resp.text[:800]}, 备: {resp2.text[:800]}"
                ),
            )
        return resp2.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"vllm 请求失败: {e}")


def _llm_chat_build_messages(req: LlmChatRequest) -> List[Dict[str, str]]:
    messages: List[Dict[str, str]] = []
    s = (req.system or "").strip()
    if s:
        messages.append({"role": "system", "content": s[:64000]})
    for turn in (req.history or [])[-32:]:
        r = (turn.role or "").strip().lower()
        if r not in ("user", "assistant"):
            continue
        c = (turn.content or "").strip()
        if not c:
            continue
        messages.append({"role": r, "content": c[:48000]})
    u = (req.user or "").strip()
    if not u:
        raise HTTPException(status_code=400, detail="user 不能为空")
    messages.append({"role": "user", "content": u[:64000]})
    return messages


@app.get("/api/llm/meta")
def api_llm_meta():
    """返回可选模型槽位。只暴露展示名和配置状态，不暴露密钥、地址或真实模型 ID。"""
    default_key = _default_model_key()
    default_cfg = _llm_model_config(default_key, require_config=False)
    return {
        "ok": True,
        "default_model_key": default_key,
        "model_key": default_key,
        "model_label": default_cfg["label"],
        "models": _public_model_options(),
    }


@app.post("/api/llm/chat")
def api_llm_chat(req: LlmChatRequest):
    """通用 LLM：紫微排盘等与分析页共用 LLM_MODEL1/2/3_* 槽位。"""
    if not (req.user or "").strip():
        raise HTTPException(status_code=400, detail="user 不能为空")

    mt = int(req.max_tokens) if req.max_tokens else 8192
    mt = max(256, min(mt, 32768))
    temp = float(req.temperature) if req.temperature is not None else 0.7
    if temp < 0 or temp > 2:
        temp = 0.7

    if req.use_mock:
        if req.stream:

            def _mock_stream():
                yield (
                    'data: {"choices":[{"delta":{"content":"[模拟] 请在真实模式下使用。"}}]}\n\n'
                ).encode("utf-8")
                yield b"data: [DONE]\n\n"

            return StreamingResponse(_mock_stream(), media_type="text/event-stream")
        return JSONResponse({"ok": True, "content": "[模拟] 请在真实模式下使用。"})

    messages = _llm_chat_build_messages(req)

    if req.stream:
        vllm_base, vllm_key, vllm_model, _ = _vllm_env(req.model_key)
        payload = {
            "model": vllm_model,
            "messages": messages,
            "temperature": temp,
            "max_tokens": mt,
            "stream": True,
        }

        def _byte_iter():
            try:
                r = requests.post(
                    f"{vllm_base}/chat/completions",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {vllm_key}",
                    },
                    json=payload,
                    stream=True,
                    timeout=300,
                )
                if r.status_code != 200:
                    err = (r.text or str(r.status_code))[:2000]
                    yield (
                        "data: "
                        + json.dumps(
                            {
                                "choices": [
                                    {
                                        "delta": {
                                            "content": "[接口错误] " + err,
                                        },
                                        "finish_reason": "stop",
                                    }
                                ]
                            },
                            ensure_ascii=False,
                        )
                        + "\n\n"
                    ).encode("utf-8")
                    yield b"data: [DONE]\n\n"
                    return
                for line in r.iter_lines(decode_unicode=False):
                    if line:
                        yield line + b"\n"
            except Exception as e:
                yield (
                    "data: "
                    + json.dumps(
                        {
                            "choices": [
                                {"delta": {"content": "[请求异常] " + str(e)}}
                            ]
                        },
                        ensure_ascii=False,
                    )
                    + "\n\n"
                ).encode("utf-8")
                yield b"data: [DONE]\n\n"

        return StreamingResponse(_byte_iter(), media_type="text/event-stream")

    data = _vllm_chat_complete_json(messages, max_tokens=mt, temperature=temp, model_key=req.model_key)
    content = _vllm_parse_message_content(data)
    if not content:
        content = "[vllm 无回答，请检查模型或请求]"
    return JSONResponse({"ok": True, "content": content})


@app.post("/api/analyze/chat")
def api_analyze_chat(req: ChatRequest):
    """深度诊断对话：首轮附带报告摘录；自第二轮起省略报告正文仅保留短说明以省 token，依赖对话历史衔接。"""
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="message 不能为空")

    report_text = ''
    if req.report_text:
        report_text = req.report_text
    elif req.report_base_name:
        report_json = None
        if db.is_db_enabled():
            report_json = db.report_get(req.report_base_name)
        if report_json is None:
            report_path = REPORTS_DIR / f"{req.report_base_name}.json"
            if report_path.is_file():
                try:
                    report_json = json.loads(report_path.read_text(encoding='utf-8'))
                except Exception as e:
                    raise HTTPException(status_code=500, detail='读取报告失败: ' + str(e))
        if report_json:
            parts = []
            if report_json.get('markdown'):
                parts.append(report_json.get('markdown'))
            if report_json.get('分析主题'):
                parts.append('分析主题：' + str(report_json.get('分析主题')))
            if report_json.get('融合摘要'):
                parts.append('融合摘要：' + str(report_json.get('融合摘要')))
            report_text = '\n\n'.join(parts)

    if not report_text:
        report_text = '（当前未附带完整报告正文，仅代码与市场信息可用。）'

    report_excerpt = _truncate_chat_report(report_text)

    # 多轮历史：须先于 system 构建，以便第二轮起省略报告正文省 token
    hist: List[Dict[str, str]] = []
    for turn in (req.history or [])[-24:]:
        r = (turn.role or "").strip().lower()
        if r not in ("user", "assistant"):
            continue
        c = (turn.content or "").strip()
        if not c:
            continue
        hist.append({"role": r, "content": c[:12000]})

    follow_up = len(hist) > 0
    if follow_up:
        report_block = (
            "（本标的分析报告全文**仅在首轮对话**中作为上下文附带；**本轮已省略正文**以节省 token。"
            "请根据下方对话历史与用户**当前这一句**作答；若用户追问报告原文而历史里没有对应片段，可请其粘贴一两句关键原文，或关闭深度诊断后重新打开以触发新的首轮上下文。）"
        )
        bg_heading = "【背景说明·无报告正文】"
        bg_note = (
            "下列**不含**分析报告全文；默认不要假设你仍能看到报告细节。"
        )
    else:
        report_block = report_excerpt
        bg_heading = "【背景摘录·勿默认使用】"
        bg_note = (
            "下列内容来自用户本页分析报告，仅作静默参考。**默认不要引用、不要复述、不要说「根据报告」「结合你刚才的报告」**；"
            "用户**明确问到**报告里某段、某位分析师、报告结论时，再简短结合即可，否则就当普通问答，与背景无关。"
        )

    if req.use_mock:
        if req.stream:
            def _mock_stream():
                yield (
                    'data: {"choices":[{"delta":{"content":"[模拟] 深度诊断：请在真实模式下使用。"}}]}\n\n'
                ).encode("utf-8")
                yield b"data: [DONE]\n\n"

            return StreamingResponse(_mock_stream(), media_type="text/event-stream")
        return JSONResponse({"ok": True, "answer": "[模拟] 深度诊断：请在真实模式下使用。"})

    system_prompt = f"""你在和用户聊「{req.stock_code}」（{req.market}）。**本条消息只解决用户当前这一句问题**：答到点上即可，口语自然，不要复述上一轮已经说过的总结，不要每轮用相同开头/结尾模板。

{bg_heading}
{bg_note}

{report_block}

【硬性禁止】输出思考标签；以「用户问的是…」「针对您的问题」等元叙述起头；以「报告局限性」「小结：」等每轮套话收尾；**每轮追加**「不构成投资建议」「仅供参考」「投资有风险」「风险提示」等免责或投资参考套话（用户未索要时不要写）。
【语言】简体中文为主。"""

    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
    messages.extend(hist)
    messages.append({"role": "user", "content": req.message.strip()[:8000]})

    try:
        if req.stream:
            vllm_base, vllm_key, vllm_model, _ = _vllm_env(req.model_key)
            payload = {
                "model": vllm_model,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 3072,
                "stream": True,
            }

            def _byte_iter():
                try:
                    r = requests.post(
                        f"{vllm_base}/chat/completions",
                        headers={
                            "Content-Type": "application/json",
                            "Authorization": f"Bearer {vllm_key}",
                        },
                        json=payload,
                        stream=True,
                        timeout=300,
                    )
                    if r.status_code != 200:
                        err = (r.text or str(r.status_code))[:2000]
                        yield (
                            'data: {"error":{"message":'
                            + json.dumps(err, ensure_ascii=False)
                            + "}}\n\n"
                        ).encode("utf-8")
                        yield b"data: [DONE]\n\n"
                        return
                    for chunk in r.iter_lines(decode_unicode=False):
                        if chunk:
                            yield chunk + b"\n"
                except Exception as e:
                    yield (
                        'data: {"error":{"message":'
                        + json.dumps(str(e), ensure_ascii=False)
                        + "}}\n\n"
                    ).encode("utf-8")
                    yield b"data: [DONE]\n\n"

            return StreamingResponse(_byte_iter(), media_type="text/event-stream")

        data = _vllm_chat_complete_json(
            messages, max_tokens=3072, temperature=0.7, model_key=req.model_key
        )
        answer = _vllm_parse_message_content(data)
        if not answer:
            answer = "[vllm 无回答，请检查模型或请求]"
        answer = _strip_trailing_investment_disclaimer(_sanitize_chat_answer(answer))
        return JSONResponse({"ok": True, "answer": answer})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.get("/api/stock-api-usage")
def api_stock_api_usage():
    """返回各股票数据接口的当日调用次数与限额剩余情况（供分析页弹窗展示）。"""
    # 若后续在后端统一代理并统计，可在此返回真实 used_today；目前为约定结构
    apis = [
        {"name": "Alpha Vantage (美股)", "limit_per_day": 25, "used_today": None, "remaining": None, "note": "免费版 25 次/天，由前端直接调用"},
        {"name": "东方财富/新浪 (港股)", "limit_per_day": None, "used_today": None, "remaining": None, "note": "通过代理请求，无官方单日限额"},
        {"name": "东方财富/新浪 (A股)", "limit_per_day": None, "used_today": None, "remaining": None, "note": "通过代理请求，无官方单日限额"},
    ]
    return {"ok": True, "apis": apis}


# 单函数部署时由 FastAPI 提供静态站（须在全部 /api 路由之后 mount）。
# 注意：Vercel Python 打包会排除 **/public/**，故构建产物须放在 web_public/，否则会打进包内仍为「目录不存在」。
_site_static = _GUX_ROOT / "web_public"
if not _site_static.is_dir():
    _site_static = _GUX_ROOT / "public"  # 本地或其它环境可选
if _site_static.is_dir():
    from fastapi.staticfiles import StaticFiles

    app.mount(
        "/",
        StaticFiles(directory=str(_site_static), html=True),
        name="site",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8123)
