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
from datetime import datetime

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
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from typing import Optional, List, Dict, Any

import requests

app = FastAPI(title="股票分析 API", version="1.0")

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


def _infer_stock_from_base_name(base_name: str) -> tuple:
    """从报告文件名推断股票代码与市场（与 demo_ulti_analyst.report_base_name 格式一致）。"""
    if not base_name:
        return "", ""
    m = re.match(r"^(A股|港股|美股)_([^_]+)_(\d{8})_(\d{6})$", base_name)
    if not m:
        return "", ""
    market_map = {"A股": "A 股", "港股": "港股", "美股": "美股"}
    return (m.group(2).strip().upper(), market_map.get(m.group(1), ""))

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


class AnalyzeRequest(BaseModel):
    stock_code: str
    market: str = "A 股"
    stock_name: Optional[str] = None
    days: int = 90
    use_mock: bool = False


class ChatRequest(BaseModel):
    stock_code: str
    market: str = "A 股"
    message: str
    report_base_name: Optional[str] = None
    report_text: Optional[str] = None
    use_mock: bool = False


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
        analyst = MultiAgentStockAnalyst(use_real_llm=not req.use_mock, debate_rounds=1)
        report = analyst.analyze(
            stock_code=req.stock_code.strip(),
            stock_name=req.stock_name.strip() if req.stock_name else None,
            market=market,
            days=req.days,
            selected_analysts=None,
            reports_dir=REPORTS_DIR,
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
        payload["stock_name"] = (req.stock_name or "").strip()
        json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
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
    """历史报告列表，按生成时间倒序。"""
    items = []
    for f in REPORTS_DIR.glob("*.json"):
        try:
            mtime = f.stat().st_mtime
            base_name = f.stem
            stock_code = ''
            market = ''
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
                "generated_at": datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M"),
                "stock_code": stock_code,
                "market": market
            })
        except OSError:
            continue
    items.sort(key=lambda x: x["generated_at"], reverse=True)
    return {"ok": True, "items": items}


@app.get("/api/reports/get")
def api_reports_get(name: str):
    """根据 base_name 获取已保存的报告内容。"""
    if not name or ".." in name or "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="无效的报告名")
    path = REPORTS_DIR / f"{name}.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="报告不存在")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _reports_delete_impl(name: str) -> dict:
    """删除指定 base_name 的报告文件（.json / .md / .html）；幂等。"""
    name = (name or "").strip()
    if not name or ".." in name or "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="无效的报告名")
    if Path(name).name != name:
        raise HTTPException(status_code=400, detail="无效的报告名")
    deleted_any = False
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
    """已保存的预测快照列表（按保存时间倒序）。"""
    items: List[Dict[str, Any]] = []
    for f in PREDICTIONS_DIR.glob("*.json"):
        try:
            mtime = f.stat().st_mtime
            d = json.loads(f.read_text(encoding="utf-8"))
            data_inner = d.get("data") if isinstance(d.get("data"), dict) else {}
            row_list = data_inner.get("list") or []
            items.append({
                "base_name": d.get("base_name") or f.stem,
                "saved_at": d.get("saved_at") or datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S"),
                "period_label": d.get("period_label"),
                "trend_label": d.get("trend_label"),
                "symbol_kind": d.get("symbol_kind"),
                "page": d.get("page"),
                "page_size": d.get("page_size"),
                "total": data_inner.get("total"),
                "list_count": len(row_list) if isinstance(row_list, list) else 0,
            })
        except (OSError, json.JSONDecodeError, TypeError):
            continue
    items.sort(key=lambda x: x.get("saved_at") or "", reverse=True)
    return {"ok": True, "items": items}


@app.get("/api/screener/get")
def api_screener_get(name: str):
    """读取单条预测快照完整内容。"""
    if not _safe_prediction_name(name):
        raise HTTPException(status_code=400, detail="无效的快照名")
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
    path = PREDICTIONS_DIR / f"{name}.json"
    deleted = False
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


@app.get("/api/news")
def api_news(code: str, market: str = "A 股", name: str = "", keywords: str = "", hours: int = 48):
    """拉取与该公司/股票相关的新闻（GNews + RSS）。keywords 为逗号分隔的备注关键词；hours 为新闻时效（默认 48）。"""
    try:
        from news_feeds import get_news_for_page
        market = _market_norm(market)
        extra = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else None
        raw = get_news_for_page(name or "", code.strip(), market, extra_keywords=extra, max_age_hours=hours, max_items=200)
        items = [{"title": it.get("title") or "", "source": it.get("source") or "", "link": it.get("link") or "", "summary": it.get("summary") or "", "pub_date": it.get("pub_date") or ""} for it in raw]
        return {"ok": True, "items": items}
    except Exception as e:
        return {"ok": False, "items": [], "error": str(e)}


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


@app.post("/api/analyze/chat")
def api_analyze_chat(req: ChatRequest):
    """深度诊断对话接口：调用 vllm 标准聊天 API（模型同当前配置），以报告作为上下文。"""
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="message 不能为空")

    report_text = ''
    if req.report_text:
        report_text = req.report_text
    elif req.report_base_name:
        report_path = REPORTS_DIR / f"{req.report_base_name}.json"
        if report_path.is_file():
            try:
                report_json = json.loads(report_path.read_text(encoding='utf-8'))
                parts = []
                if report_json.get('markdown'):
                    parts.append(report_json.get('markdown'))
                if report_json.get('分析主题'):
                    parts.append('分析主题：' + str(report_json.get('分析主题')))
                if report_json.get('融合摘要'):
                    parts.append('融合摘要：' + str(report_json.get('融合摘要')))
                report_text = '\n\n'.join(parts)
            except Exception as e:
                raise HTTPException(status_code=500, detail='读取报告失败: ' + str(e))

    if not report_text:
        report_text = '当前无历史报告内容。'

    if req.use_mock:
        # 模拟返回（用于测试）
        return JSONResponse({"ok": True, "answer": "[模拟] 深度诊断：请在真实模式下使用。"})

    vllm_base = (
        os.environ.get("VLLM_BASE_URL") or "http://vllm.tangbuy.cn:8080/v1"
    ).strip().rstrip("/")
    vllm_key = (os.environ.get("VLLM_API_KEY") or "123456").strip()
    vllm_model = (
        os.environ.get("VLLM_MODEL_ID") or os.environ.get("VLLM_MODEL") or "MiniMax-M2.1-AWQ"
    ).strip()

    system_prompt = f"你是专业股票分析助手，擅长结合历史生成的报告输出可执行策略建议。当前股票: {req.stock_code}，市场: {req.market}。"
    user_prompt = f"已生成报告内容（上下文）:\n{report_text}\n\n用户问题：{req.message}\n请根据报告进行进一步分析、意见、风险提示与建议。"

    payload = {
        "model": vllm_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 1024,
        "stream": False
    }

    try:
        resp = requests.post(
            f"{vllm_base}/chat/completions",
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {vllm_key}',
            },
            json=payload,
            timeout=120
        )

        if resp.status_code != 200:
            # 兼容部分 vllm 直接 /v1 body: {"model_id":..., "input":...}
            try:
                fallback_payload = {
                    "model_id": vllm_model,
                    "input": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 1024,
                    "stream": False
                }
                resp2 = requests.post(
                    vllm_base,
                    headers={
                        'Content-Type': 'application/json',
                        'Authorization': f'Bearer {vllm_key}',
                    },
                    json=fallback_payload,
                    timeout=120
                )
                if resp2.status_code != 200:
                    raise HTTPException(status_code=500, detail=f"vllm 失败(主/备选): {resp.status_code}/{resp2.status_code}, 主响应: {resp.text}, 备选: {resp2.text}")
                data = resp2.json()
            except requests.exceptions.RequestException as ee:
                raise HTTPException(status_code=500, detail=f"vllm 请求失败: {ee}")
        else:
            data = resp.json()

        answer = ''
        if isinstance(data, dict):
            if data.get('choices'):
                choice = data['choices'][0]
                if 'message' in choice and 'content' in choice['message']:
                    answer = choice['message']['content']
                elif 'text' in choice:
                    answer = choice['text']
            elif data.get('response'):
                answer = data.get('response')
            elif data.get('output'):
                answer = data.get('output')

        if not answer:
            answer = '[vllm 无回答，请检查模型或请求]'

        return JSONResponse({"ok": True, "answer": answer})

    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"vllm 请求失败: {e}")



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
