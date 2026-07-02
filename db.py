#!/usr/bin/env python3
"""
股小蜜数据库层（Vercel Postgres / Neon）。
- 无 POSTGRES_URL 时自动回退到文件存储，保证本地零配置可运行。
- 所有写操作使用 upsert，避免 delete-recreate。
- 表结构在首次有数据库连接时自动创建。
"""
import os
import json
import math
from datetime import datetime
from typing import Any, Dict, List, Optional
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    from psycopg2.pool import SimpleConnectionPool
    _PSYCOPG2_AVAILABLE = True
except ImportError:
    psycopg2 = None  # type: ignore
    RealDictCursor = None  # type: ignore
    SimpleConnectionPool = None  # type: ignore
    _PSYCOPG2_AVAILABLE = False

# Vercel Postgres 常见环境变量名（按优先级）
POSTGRES_ENV_KEYS = ["POSTGRES_URL", "DATABASE_URL", "POSTGRES_URL_NON_POOLING"]

_pool: Optional[SimpleConnectionPool] = None


def get_db_url() -> Optional[str]:
    for key in POSTGRES_ENV_KEYS:
        url = os.environ.get(key, "").strip()
        if url:
            return url
    return None


def is_db_enabled() -> bool:
    return _PSYCOPG2_AVAILABLE and bool(get_db_url())


def _get_pool() -> SimpleConnectionPool:
    global _pool
    if _pool is None:
        url = get_db_url()
        if not url:
            raise RuntimeError("未配置 POSTGRES_URL / DATABASE_URL")
        # Neon / Vercel Postgres 需要 sslmode=require
        if "sslmode=" not in url:
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}sslmode=require"
        _pool = SimpleConnectionPool(1, 10, url)
    return _pool


def _execute(
    sql: str,
    params: Optional[tuple] = None,
    fetch: bool = False,
    commit: bool = False,
) -> Optional[List[Dict[str, Any]]]:
    """执行 SQL 并返回结果（fetch=True）或仅提交（commit=True）。"""
    pool = _get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params or ())
            result = [dict(row) for row in cur.fetchall()] if fetch else None
        if commit:
            conn.commit()
        return result
    finally:
        pool.putconn(conn)


def _execute_many(
    sql: str,
    params_list: List[tuple],
    commit: bool = False,
) -> None:
    """批量执行 SQL，减少连接池往返。"""
    if not params_list:
        return
    pool = _get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.executemany(sql, params_list)
        if commit:
            conn.commit()
    finally:
        pool.putconn(conn)


def init_db() -> None:
    """自动建表（幂等）。"""
    if not is_db_enabled():
        return
    _execute(
        """
        CREATE TABLE IF NOT EXISTS reports (
            base_name VARCHAR(255) PRIMARY KEY,
            stock_code VARCHAR(32) NOT NULL,
            market VARCHAR(32) NOT NULL,
            stock_name VARCHAR(128),
            generated_at TIMESTAMP NOT NULL,
            report_json JSONB NOT NULL,
            md_content TEXT,
            html_content TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """,
        commit=True,
    )
    _execute(
        """
        CREATE TABLE IF NOT EXISTS screener_snapshots (
            base_name VARCHAR(255) PRIMARY KEY,
            period_type SMALLINT NOT NULL,
            trend_type SMALLINT NOT NULL,
            symbol_type SMALLINT NOT NULL,
            page INTEGER NOT NULL,
            page_size INTEGER NOT NULL,
            saved_at TIMESTAMP NOT NULL,
            source VARCHAR(64),
            source_api TEXT,
            intellectia_ret INTEGER,
            intellectia_msg TEXT,
            data_json JSONB,
            raw_json JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """,
        commit=True,
    )
    _execute(
        """
        CREATE INDEX IF NOT EXISTS idx_reports_generated_at
            ON reports(generated_at DESC);
        """,
        commit=True,
    )
    _execute(
        """
        CREATE INDEX IF NOT EXISTS idx_screener_saved_at
            ON screener_snapshots(saved_at DESC);
        """,
        commit=True,
    )
    _execute(
        """
        CREATE INDEX IF NOT EXISTS idx_screener_dims
            ON screener_snapshots(period_type, trend_type, symbol_type, saved_at DESC);
        """,
        commit=True,
    )
    _execute(
        """
        CREATE TABLE IF NOT EXISTS screener_symbols (
            id SERIAL PRIMARY KEY,
            base_name VARCHAR(255) NOT NULL REFERENCES screener_snapshots(base_name) ON DELETE CASCADE,
            symbol VARCHAR(32) NOT NULL,
            market VARCHAR(32),
            name VARCHAR(128),
            symbol_type SMALLINT DEFAULT 0,
            pre_close NUMERIC(18,4),
            current_price NUMERIC(18,4),
            change_ratio NUMERIC(18,4),
            probability NUMERIC(5,2),
            profit NUMERIC(18,4),
            logo TEXT,
            item_timestamp TIMESTAMP,
            klines JSONB,
            raw_item JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(base_name, symbol)
        );
        """,
        commit=True,
    )
    _execute(
        """
        CREATE INDEX IF NOT EXISTS idx_screener_symbols_base
            ON screener_symbols(base_name);
        """,
        commit=True,
    )
    _execute(
        """
        CREATE INDEX IF NOT EXISTS idx_screener_symbols_symbol
            ON screener_symbols(symbol, market);
        """,
        commit=True,
    )
    _execute(
        """
        CREATE INDEX IF NOT EXISTS idx_screener_symbols_saved
            ON screener_symbols(item_timestamp DESC NULLS LAST);
        """,
        commit=True,
    )
    _execute(
        """
        CREATE TABLE IF NOT EXISTS watchlist_items (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(64) DEFAULT 'default',
            symbol VARCHAR(32) NOT NULL,
            market VARCHAR(32) NOT NULL,
            name VARCHAR(128),
            current_price NUMERIC(18,4),
            previous_close NUMERIC(18,4),
            change NUMERIC(18,4),
            change_percent NUMERIC(18,4),
            market_data JSONB,
            price_history JSONB,
            keywords JSONB,
            added_at TIMESTAMP,
            watch_start_price NUMERIC(18,4),
            notes TEXT,
            alert_enabled BOOLEAN DEFAULT FALSE,
            alert_threshold NUMERIC(18,4) DEFAULT 5,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, market, symbol)
        );
        """,
        commit=True,
    )
    _execute(
        """
        CREATE INDEX IF NOT EXISTS idx_watchlist_user
            ON watchlist_items(user_id, updated_at DESC);
        """,
        commit=True,
    )
    _execute(
        """
        CREATE TABLE IF NOT EXISTS portfolio_stocks (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(64) DEFAULT 'default',
            symbol VARCHAR(32) NOT NULL,
            market VARCHAR(32) NOT NULL,
            broker_channel VARCHAR(64),
            current_price NUMERIC(18,4),
            market_data JSONB,
            technical_indicators JSONB,
            positions JSONB,
            price_history JSONB,
            keywords JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, market, symbol)
        );
        """,
        commit=True,
    )
    _execute(
        """
        CREATE INDEX IF NOT EXISTS idx_portfolio_user
            ON portfolio_stocks(user_id, updated_at DESC);
        """,
        commit=True,
    )
    _execute(
        """
        CREATE TABLE IF NOT EXISTS capital_pool (
            user_id VARCHAR(64) PRIMARY KEY DEFAULT 'default',
            usd NUMERIC(18,4) DEFAULT 0,
            hkd NUMERIC(18,4) DEFAULT 0,
            cny NUMERIC(18,4) DEFAULT 0,
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """,
        commit=True,
    )
    _execute(
        """
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id VARCHAR(64) PRIMARY KEY DEFAULT 'default',
            selected_model VARCHAR(32),
            settings_json JSONB,
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """,
        commit=True,
    )
    _execute(
        """
        CREATE TABLE IF NOT EXISTS stock_price_snapshots (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(64) DEFAULT 'default',
            symbol VARCHAR(32) NOT NULL,
            market VARCHAR(32) NOT NULL,
            snapshot_date DATE NOT NULL,
            price NUMERIC(18,4),
            previous_close NUMERIC(18,4),
            change_amount NUMERIC(18,4),
            change_percent NUMERIC(18,4),
            shares NUMERIC(18,4),
            market_value NUMERIC(18,4),
            daily_profit NUMERIC(18,4),
            source VARCHAR(64),
            context VARCHAR(32) DEFAULT 'quote',
            quote_json JSONB,
            fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, market, symbol, snapshot_date)
        );
        """,
        commit=True,
    )
    _execute(
        """
        CREATE INDEX IF NOT EXISTS idx_price_snapshots_symbol_date
            ON stock_price_snapshots(user_id, market, symbol, snapshot_date DESC);
        """,
        commit=True,
    )


def _parse_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
    return None


def _parse_date(value: Any):
    """解析 YYYY-MM-DD 日期。"""
    if value is None:
        return None
    if hasattr(value, "isoformat") and not isinstance(value, str):
        return value
    if isinstance(value, str):
        s = value.strip()[:10]
        try:
            return datetime.strptime(s, "%Y-%m-%d").date()
        except ValueError:
            return None
    return None


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

def reports_list() -> List[Dict[str, Any]]:
    """历史报告列表，按生成时间倒序。"""
    if not is_db_enabled():
        return []
    rows = _execute(
        """
        SELECT base_name, stock_code, market, generated_at, report_json
        FROM reports
        ORDER BY generated_at DESC
        """,
        fetch=True,
    )
    items = []
    for row in rows or []:
        report_json = row["report_json"] or {}
        generated_at = row["generated_at"]
        items.append({
            "base_name": row["base_name"],
            "generated_at": generated_at.strftime("%Y-%m-%d %H:%M") if generated_at else "",
            "stock_code": row["stock_code"],
            "market": row["market"],
            "_mtime": generated_at.timestamp() if generated_at else 0,
        })
    return items


def report_get(base_name: str) -> Optional[Dict[str, Any]]:
    if not is_db_enabled():
        return None
    rows = _execute(
        "SELECT report_json FROM reports WHERE base_name = %s",
        (base_name,),
        fetch=True,
    )
    if not rows:
        return None
    return rows[0]["report_json"]


def report_save(
    base_name: str,
    payload: Dict[str, Any],
    md_content: Optional[str] = None,
    html_content: Optional[str] = None,
) -> None:
    if not is_db_enabled():
        return
    stock_code = (payload.get("stock_code") or "").strip().upper()
    market = (payload.get("market") or "").strip()
    stock_name = (payload.get("stock_name") or "").strip()
    generated_at_str = payload.get("生成时间") or payload.get("generated_at")
    generated_at = _parse_dt(generated_at_str) or datetime.now()
    _execute(
        """
        INSERT INTO reports (
            base_name, stock_code, market, stock_name, generated_at,
            report_json, md_content, html_content
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (base_name) DO UPDATE SET
            stock_code = EXCLUDED.stock_code,
            market = EXCLUDED.market,
            stock_name = EXCLUDED.stock_name,
            generated_at = EXCLUDED.generated_at,
            report_json = EXCLUDED.report_json,
            md_content = EXCLUDED.md_content,
            html_content = EXCLUDED.html_content,
            updated_at = NOW();
        """,
        (
            base_name,
            stock_code,
            market,
            stock_name,
            generated_at,
            json.dumps(payload, ensure_ascii=False),
            md_content,
            html_content,
        ),
        commit=True,
    )


def report_delete(base_name: str) -> bool:
    if not is_db_enabled():
        return False
    _execute(
        "DELETE FROM reports WHERE base_name = %s",
        (base_name,),
        commit=True,
    )
    return True


# ---------------------------------------------------------------------------
# Screener snapshots
# ---------------------------------------------------------------------------

def screener_list() -> List[Dict[str, Any]]:
    if not is_db_enabled():
        return []
    rows = _execute(
        """
        SELECT base_name, period_type, trend_type, symbol_type, page, page_size,
               saved_at, source, data_json
        FROM screener_snapshots
        ORDER BY saved_at DESC
        """,
        fetch=True,
    )
    items = []
    for row in rows or []:
        data = row["data_json"] or {}
        total = data.get("total") if isinstance(data, dict) else None
        row_list = data.get("list") if isinstance(data, dict) else None
        items.append({
            "base_name": row["base_name"],
            "saved_at": row["saved_at"].strftime("%Y-%m-%d %H:%M:%S") if row["saved_at"] else "",
            "period_label": {0: "日（明日）", 1: "周", 2: "月"}.get(row["period_type"], str(row["period_type"])),
            "trend_label": {0: "看涨", 1: "看跌"}.get(row["trend_type"], str(row["trend_type"])),
            "symbol_kind": {0: "股票", 1: "ETF", 2: "加密货币"}.get(row["symbol_type"], str(row["symbol_type"])),
            "page": row["page"],
            "page_size": row["page_size"],
            "total": total,
            "list_count": len(row_list) if isinstance(row_list, list) else 0,
        })
    return items


def screener_get(base_name: str) -> Optional[Dict[str, Any]]:
    if not is_db_enabled():
        return None
    rows = _execute(
        """
        SELECT base_name, period_type, trend_type, symbol_type, page, page_size,
               saved_at, source, source_api, intellectia_ret, intellectia_msg,
               data_json, raw_json
        FROM screener_snapshots
        WHERE base_name = %s
        """,
        (base_name,),
        fetch=True,
    )
    if not rows:
        return None
    row = rows[0]
    return {
        "ok": True,
        "base_name": row["base_name"],
        "saved_at": row["saved_at"].strftime("%Y-%m-%d %H:%M:%S") if row["saved_at"] else "",
        "period_type": row["period_type"],
        "trend_type": row["trend_type"],
        "symbol_type": row["symbol_type"],
        "page": row["page"],
        "page_size": row["page_size"],
        "source": row["source"],
        "source_api": row["source_api"],
        "intellectia_ret": row["intellectia_ret"],
        "intellectia_msg": row["intellectia_msg"],
        "data": row["data_json"],
        "raw": row["raw_json"],
    }


def screener_save(payload: Dict[str, Any]) -> None:
    if not is_db_enabled():
        return
    saved_at = _parse_dt(payload.get("saved_at")) or datetime.now()
    _execute(
        """
        INSERT INTO screener_snapshots (
            base_name, period_type, trend_type, symbol_type, page, page_size,
            saved_at, source, source_api, intellectia_ret, intellectia_msg,
            data_json, raw_json
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (base_name) DO UPDATE SET
            period_type = EXCLUDED.period_type,
            trend_type = EXCLUDED.trend_type,
            symbol_type = EXCLUDED.symbol_type,
            page = EXCLUDED.page,
            page_size = EXCLUDED.page_size,
            saved_at = EXCLUDED.saved_at,
            source = EXCLUDED.source,
            source_api = EXCLUDED.source_api,
            intellectia_ret = EXCLUDED.intellectia_ret,
            intellectia_msg = EXCLUDED.intellectia_msg,
            data_json = EXCLUDED.data_json,
            raw_json = EXCLUDED.raw_json,
            updated_at = NOW();
        """,
        (
            payload.get("base_name"),
            int(payload.get("period_type", 0)),
            int(payload.get("trend_type", 0)),
            int(payload.get("symbol_type", 0)),
            int(payload.get("page", 1)),
            int(payload.get("page_size", 10)),
            saved_at,
            payload.get("source"),
            payload.get("source_api"),
            payload.get("intellectia_ret"),
            payload.get("intellectia_msg"),
            json.dumps(payload.get("data"), ensure_ascii=False),
            json.dumps(payload.get("raw"), ensure_ascii=False),
        ),
        commit=True,
    )
    _screener_symbols_upsert_from_payload(payload)


def _screener_symbols_upsert_from_payload(payload: Dict[str, Any]) -> None:
    """把快照 data.list 中的股票逐条落库到 screener_symbols。"""
    if not is_db_enabled():
        return
    base_name = payload.get("base_name")
    if not base_name:
        return
    saved_at = _parse_dt(payload.get("saved_at")) or datetime.now()
    period_type = int(payload.get("period_type", 0))
    trend_type = int(payload.get("trend_type", 0))
    symbol_type = int(payload.get("symbol_type", 0))
    data = payload.get("data") or {}
    items = data.get("list") if isinstance(data, dict) else []
    if not isinstance(items, list) or not items:
        return

    params_list = []
    for item in items:
        if not isinstance(item, dict):
            continue
        code = str(item.get("code") or item.get("symbol") or "").strip().upper()
        symbol = str(item.get("symbol") or "").strip().upper()
        if not symbol:
            symbol = code.split(".")[0]
        market = _infer_market_from_code(code)
        ts_raw = item.get("timestamp")
        item_ts = _parse_dt(ts_raw) if isinstance(ts_raw, str) else None
        if item_ts is None and ts_raw:
            try:
                item_ts = datetime.fromtimestamp(int(ts_raw))
            except Exception:
                item_ts = None

        params_list.append((
            base_name,
            symbol,
            market,
            str(item.get("name") or "").strip() or symbol,
            int(item.get("symbol_type", symbol_type)),
            _num_or_none(item.get("pre_close")),
            _num_or_none(item.get("price")),
            _num_or_none(item.get("change_ratio")),
            _num_or_none(item.get("probability")),
            _num_or_none(item.get("profit")),
            str(item.get("logo") or "").strip() or None,
            item_ts or saved_at,
            json.dumps(item.get("klines") or [], ensure_ascii=False),
            json.dumps(item, ensure_ascii=False),
        ))

    if params_list:
        _execute_many(
            """
            INSERT INTO screener_symbols (
                base_name, symbol, market, name, symbol_type, pre_close,
                current_price, change_ratio, probability, profit, logo,
                item_timestamp, klines, raw_item
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (base_name, symbol) DO UPDATE SET
                market = EXCLUDED.market,
                name = EXCLUDED.name,
                symbol_type = EXCLUDED.symbol_type,
                pre_close = EXCLUDED.pre_close,
                current_price = EXCLUDED.current_price,
                change_ratio = EXCLUDED.change_ratio,
                probability = EXCLUDED.probability,
                profit = EXCLUDED.profit,
                logo = EXCLUDED.logo,
                item_timestamp = EXCLUDED.item_timestamp,
                klines = EXCLUDED.klines,
                raw_item = EXCLUDED.raw_item,
                updated_at = NOW();
            """,
            params_list,
            commit=True,
        )


def screener_symbols_list(
    base_name: Optional[str] = None,
    symbol: Optional[str] = None,
    market: Optional[str] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    """查询预测股票明细；可指定快照、股票代码或市场。"""
    if not is_db_enabled():
        return []
    conditions = ["1=1"]
    params: List[Any] = []
    if base_name:
        conditions.append("base_name = %s")
        params.append(base_name)
    if symbol:
        conditions.append("symbol = %s")
        params.append(symbol.upper().strip())
    if market:
        conditions.append("market = %s")
        params.append(market.upper().strip())
    sql = f"""
        SELECT id, base_name, symbol, market, name, symbol_type, pre_close,
               current_price, change_ratio, probability, profit, logo,
               item_timestamp, klines, raw_item
        FROM screener_symbols
        WHERE {" AND ".join(conditions)}
        ORDER BY item_timestamp DESC NULLS LAST, probability DESC NULLS LAST
        LIMIT %s
    """
    params.append(limit)
    rows = _execute(sql, tuple(params), fetch=True)
    items = []
    for row in rows or []:
        item_ts = row["item_timestamp"]
        items.append({
            "id": str(row["id"]),
            "base_name": row["base_name"],
            "symbol": row["symbol"],
            "market": row["market"] or "",
            "name": row["name"] or row["symbol"],
            "symbol_type": int(row["symbol_type"]) if row["symbol_type"] is not None else 0,
            "pre_close": float(row["pre_close"]) if row["pre_close"] is not None else None,
            "current_price": float(row["current_price"]) if row["current_price"] is not None else None,
            "change_ratio": float(row["change_ratio"]) if row["change_ratio"] is not None else None,
            "probability": float(row["probability"]) if row["probability"] is not None else None,
            "profit": float(row["profit"]) if row["profit"] is not None else None,
            "logo": row["logo"] or "",
            "item_timestamp": item_ts.isoformat() if item_ts else "",
            "klines": row["klines"] or [],
            "raw_item": row["raw_item"] or {},
        })
    return items


def screener_symbols_delete_by_snapshot(base_name: str) -> bool:
    if not is_db_enabled():
        return False
    _execute(
        "DELETE FROM screener_symbols WHERE base_name = %s",
        (base_name,),
        commit=True,
    )
    return True


def screener_delete(base_name: str) -> bool:
    if not is_db_enabled():
        return False
    _execute(
        "DELETE FROM screener_snapshots WHERE base_name = %s",
        (base_name,),
        commit=True,
    )
    return True


# ---------------------------------------------------------------------------
# Watchlist
# ---------------------------------------------------------------------------

def _infer_market_from_code(code: str) -> str:
    """根据 Intellectia code 后缀推断市场。"""
    c = (code or "").strip().upper()
    if c.endswith(".HK"):
        return "HK"
    if c.endswith(".SS") or c.endswith(".SZ") or c.endswith(".BJ"):
        return "CN"
    if c.endswith(".N") or c.endswith(".O") or c.endswith(".A"):
        return "US"
    if c and c.isalpha():
        return "US"
    return ""


def _num_or_none(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value) if math.isfinite(value) else None
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None


def watchlist_list(user_id: str = "default") -> List[Dict[str, Any]]:
    if not is_db_enabled():
        return []
    rows = _execute(
        """
        SELECT id, symbol, market, name, current_price, previous_close, change,
               change_percent, market_data, price_history, keywords, added_at,
               watch_start_price, notes, alert_enabled, alert_threshold
        FROM watchlist_items
        WHERE user_id = %s
        ORDER BY added_at DESC NULLS LAST, updated_at DESC
        """,
        (user_id,),
        fetch=True,
    )
    items = []
    for row in rows or []:
        items.append({
            "id": str(row["id"]),
            "symbol": row["symbol"],
            "market": row["market"],
            "name": row["name"] or row["symbol"],
            "currentPrice": float(row["current_price"]) if row["current_price"] is not None else 0,
            "previousClose": float(row["previous_close"]) if row["previous_close"] is not None else None,
            "change": float(row["change"]) if row["change"] is not None else 0,
            "changePercent": float(row["change_percent"]) if row["change_percent"] is not None else 0,
            "marketData": row["market_data"] or {},
            "priceHistory": row["price_history"] or [],
            "keywords": row["keywords"] or [],
            "addedAt": row["added_at"].isoformat() if row["added_at"] else datetime.now().isoformat(),
            "watchStartPrice": float(row["watch_start_price"]) if row["watch_start_price"] is not None else 0,
            "notes": row["notes"] or "",
            "alertEnabled": bool(row["alert_enabled"]),
            "alertThreshold": float(row["alert_threshold"]) if row["alert_threshold"] is not None else 5,
        })
    return items


def watchlist_upsert(user_id: str, item: Dict[str, Any]) -> None:
    if not is_db_enabled():
        return
    symbol = str(item.get("symbol", "")).upper().strip()
    market = str(item.get("market", "")).upper().strip()
    if not symbol or not market:
        raise ValueError("symbol 和 market 不能为空")
    added_at = _parse_dt(item.get("addedAt")) or datetime.now()
    _execute(
        """
        INSERT INTO watchlist_items (
            user_id, symbol, market, name, current_price, previous_close, change,
            change_percent, market_data, price_history, keywords, added_at,
            watch_start_price, notes, alert_enabled, alert_threshold
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (user_id, market, symbol) DO UPDATE SET
            name = EXCLUDED.name,
            current_price = EXCLUDED.current_price,
            previous_close = EXCLUDED.previous_close,
            change = EXCLUDED.change,
            change_percent = EXCLUDED.change_percent,
            market_data = EXCLUDED.market_data,
            price_history = EXCLUDED.price_history,
            keywords = EXCLUDED.keywords,
            added_at = EXCLUDED.added_at,
            watch_start_price = EXCLUDED.watch_start_price,
            notes = EXCLUDED.notes,
            alert_enabled = EXCLUDED.alert_enabled,
            alert_threshold = EXCLUDED.alert_threshold,
            updated_at = NOW();
        """,
        (
            user_id,
            symbol,
            market,
            str(item.get("name", "")).strip() or symbol,
            _num_or_none(item.get("currentPrice")),
            _num_or_none(item.get("previousClose")),
            _num_or_none(item.get("change")),
            _num_or_none(item.get("changePercent")),
            json.dumps(item.get("marketData") or {}, ensure_ascii=False),
            json.dumps(item.get("priceHistory") or [], ensure_ascii=False),
            json.dumps(item.get("keywords") or [], ensure_ascii=False),
            added_at,
            _num_or_none(item.get("watchStartPrice")),
            str(item.get("notes", "")).strip(),
            bool(item.get("alertEnabled", False)),
            _num_or_none(item.get("alertThreshold", 5)) or 5,
        ),
        commit=True,
    )
    _sync_price_history_to_snapshots(
        user_id, symbol, market, item.get("priceHistory"), context="watchlist", source="watchlist_sync"
    )


def watchlist_delete(user_id: str, symbol: str, market: str) -> bool:
    if not is_db_enabled():
        return False
    _execute(
        "DELETE FROM watchlist_items WHERE user_id = %s AND market = %s AND symbol = %s",
        (user_id, market.upper().strip(), symbol.upper().strip()),
        commit=True,
    )
    return True


def watchlist_replace(user_id: str, items: List[Dict[str, Any]]) -> None:
    """全量替换关注列表（用于前端批量同步）。"""
    if not is_db_enabled():
        return
    _execute(
        "DELETE FROM watchlist_items WHERE user_id = %s",
        (user_id,),
        commit=True,
    )
    for item in items:
        watchlist_upsert(user_id, item)


# ---------------------------------------------------------------------------
# Portfolio & Capital Pool
# ---------------------------------------------------------------------------

def portfolio_list(user_id: str = "default") -> List[Dict[str, Any]]:
    if not is_db_enabled():
        return []
    rows = _execute(
        """
        SELECT id, symbol, market, broker_channel, current_price, market_data,
               technical_indicators, positions, price_history, keywords
        FROM portfolio_stocks
        WHERE user_id = %s
        ORDER BY updated_at DESC
        """,
        (user_id,),
        fetch=True,
    )
    items = []
    for row in rows or []:
        items.append({
            "id": str(row["id"]),
            "symbol": row["symbol"],
            "market": row["market"],
            "brokerChannel": row["broker_channel"] or "",
            "currentPrice": float(row["current_price"]) if row["current_price"] is not None else 0,
            "marketData": row["market_data"] or {},
            "technicalIndicators": row["technical_indicators"] or {},
            "positions": row["positions"] or [],
            "priceHistory": row["price_history"] or [],
            "keywords": row["keywords"] or [],
        })
    return items


def portfolio_upsert(user_id: str, stock: Dict[str, Any]) -> None:
    if not is_db_enabled():
        return
    symbol = str(stock.get("symbol", "")).upper().strip()
    market = str(stock.get("market", "")).upper().strip()
    if not symbol or not market:
        raise ValueError("symbol 和 market 不能为空")
    _execute(
        """
        INSERT INTO portfolio_stocks (
            user_id, symbol, market, broker_channel, current_price, market_data,
            technical_indicators, positions, price_history, keywords
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (user_id, market, symbol) DO UPDATE SET
            broker_channel = EXCLUDED.broker_channel,
            current_price = EXCLUDED.current_price,
            market_data = EXCLUDED.market_data,
            technical_indicators = EXCLUDED.technical_indicators,
            positions = EXCLUDED.positions,
            price_history = EXCLUDED.price_history,
            keywords = EXCLUDED.keywords,
            updated_at = NOW();
        """,
        (
            user_id,
            symbol,
            market,
            str(stock.get("brokerChannel", "")).strip(),
            _num_or_none(stock.get("currentPrice")),
            json.dumps(stock.get("marketData") or {}, ensure_ascii=False),
            json.dumps(stock.get("technicalIndicators") or {}, ensure_ascii=False),
            json.dumps(stock.get("positions") or [], ensure_ascii=False),
            json.dumps(stock.get("priceHistory") or [], ensure_ascii=False),
            json.dumps(stock.get("keywords") or [], ensure_ascii=False),
        ),
        commit=True,
    )
    _sync_price_history_to_snapshots(
        user_id, symbol, market, stock.get("priceHistory"), context="portfolio", source="portfolio_sync"
    )


def portfolio_delete(user_id: str, symbol: str, market: str) -> bool:
    if not is_db_enabled():
        return False
    _execute(
        "DELETE FROM portfolio_stocks WHERE user_id = %s AND market = %s AND symbol = %s",
        (user_id, market.upper().strip(), symbol.upper().strip()),
        commit=True,
    )
    return True


def capital_pool_get(user_id: str = "default") -> Dict[str, float]:
    if not is_db_enabled():
        return {"usd": 0, "hkd": 0, "cny": 0}
    rows = _execute(
        "SELECT usd, hkd, cny FROM capital_pool WHERE user_id = %s",
        (user_id,),
        fetch=True,
    )
    if not rows:
        return {"usd": 0, "hkd": 0, "cny": 0}
    row = rows[0]
    return {
        "usd": float(row["usd"]) if row["usd"] is not None else 0,
        "hkd": float(row["hkd"]) if row["hkd"] is not None else 0,
        "cny": float(row["cny"]) if row["cny"] is not None else 0,
    }


def capital_pool_set(user_id: str, pool: Dict[str, Any]) -> None:
    if not is_db_enabled():
        return
    _execute(
        """
        INSERT INTO capital_pool (user_id, usd, hkd, cny)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (user_id) DO UPDATE SET
            usd = EXCLUDED.usd,
            hkd = EXCLUDED.hkd,
            cny = EXCLUDED.cny,
            updated_at = NOW();
        """,
        (
            user_id,
            _num_or_none(pool.get("usd")) or 0,
            _num_or_none(pool.get("hkd")) or 0,
            _num_or_none(pool.get("cny")) or 0,
        ),
        commit=True,
    )


# ---------------------------------------------------------------------------
# User settings
# ---------------------------------------------------------------------------

def settings_get(user_id: str = "default") -> Dict[str, Any]:
    if not is_db_enabled():
        return {}
    rows = _execute(
        "SELECT selected_model, settings_json FROM user_settings WHERE user_id = %s",
        (user_id,),
        fetch=True,
    )
    if not rows:
        return {}
    row = rows[0]
    settings = row["settings_json"] or {}
    if row["selected_model"]:
        settings["selectedModel"] = row["selected_model"]
    return settings


def settings_set(user_id: str, settings: Dict[str, Any]) -> None:
    if not is_db_enabled():
        return
    selected_model = settings.get("selectedModel") or settings.get("selected_model")
    settings_json = {k: v for k, v in settings.items() if k not in ("selectedModel", "selected_model")}
    _execute(
        """
        INSERT INTO user_settings (user_id, selected_model, settings_json)
        VALUES (%s, %s, %s)
        ON CONFLICT (user_id) DO UPDATE SET
            selected_model = EXCLUDED.selected_model,
            settings_json = EXCLUDED.settings_json,
            updated_at = NOW();
        """,
        (
            user_id,
            selected_model,
            json.dumps(settings_json, ensure_ascii=False),
        ),
        commit=True,
    )


# ---------------------------------------------------------------------------
# Stock price snapshots (daily quotes / portfolio marks)
# ---------------------------------------------------------------------------

def _snapshot_row_to_history(row: Dict[str, Any]) -> Dict[str, Any]:
    snap = row.get("snapshot_date")
    date_str = snap.isoformat() if hasattr(snap, "isoformat") else str(snap or "")
    return {
        "date": date_str,
        "price": float(row["price"]) if row.get("price") is not None else None,
        "previousClose": float(row["previous_close"]) if row.get("previous_close") is not None else None,
        "shares": float(row["shares"]) if row.get("shares") is not None else None,
        "dailyProfit": float(row["daily_profit"]) if row.get("daily_profit") is not None else None,
        "marketValue": float(row["market_value"]) if row.get("market_value") is not None else None,
        "change": float(row["change_amount"]) if row.get("change_amount") is not None else None,
        "changePercent": float(row["change_percent"]) if row.get("change_percent") is not None else None,
        "source": row.get("source") or "",
        "context": row.get("context") or "",
    }


def _sync_price_history_to_snapshots(
    user_id: str,
    symbol: str,
    market: str,
    price_history: Any,
    context: str = "portfolio",
    source: str = "history_sync",
) -> None:
    """把 priceHistory 数组逐日写入快照表。"""
    if not is_db_enabled() or not price_history:
        return
    if isinstance(price_history, str):
        try:
            price_history = json.loads(price_history)
        except Exception:
            return
    if not isinstance(price_history, list):
        return
    for entry in price_history:
        if not isinstance(entry, dict):
            continue
        snap_date = _parse_date(entry.get("date"))
        if snap_date is None:
            continue
        price = _num_or_none(entry.get("price"))
        if price is None or price <= 0:
            continue
        shares = _num_or_none(entry.get("shares"))
        market_value = (price * shares) if shares is not None and shares > 0 else None
        price_snapshot_upsert(
            user_id,
            {
                "symbol": symbol,
                "market": market,
                "snapshot_date": snap_date.isoformat(),
                "price": price,
                "previous_close": _num_or_none(entry.get("previousClose")),
                "shares": shares,
                "market_value": market_value,
                "daily_profit": _num_or_none(entry.get("dailyProfit")),
                "context": context,
                "source": source,
            },
        )


def price_snapshot_upsert(user_id: str, snap: Dict[str, Any]) -> None:
    if not is_db_enabled():
        return
    symbol = str(snap.get("symbol", "")).upper().strip()
    market = str(snap.get("market", "")).upper().strip()
    if not symbol or not market:
        return
    snap_date = _parse_date(snap.get("snapshot_date") or snap.get("date"))
    if snap_date is None:
        snap_date = datetime.now().date()
    price = _num_or_none(snap.get("price"))
    if price is None or price <= 0:
        return
    prev = _num_or_none(snap.get("previous_close") or snap.get("previousClose"))
    shares = _num_or_none(snap.get("shares"))
    market_value = _num_or_none(snap.get("market_value") or snap.get("marketValue"))
    if market_value is None and shares is not None and shares > 0:
        market_value = price * shares
    change_amount = _num_or_none(snap.get("change_amount") or snap.get("change"))
    change_percent = _num_or_none(snap.get("change_percent") or snap.get("changePercent"))
    if change_amount is None and prev is not None:
        change_amount = price - prev
    if change_percent is None and prev is not None and prev > 0:
        change_percent = (price - prev) / prev * 100
    quote_json = snap.get("quote_json") or snap.get("quote") or snap.get("marketData")
    if quote_json is not None and not isinstance(quote_json, str):
        quote_json = json.dumps(quote_json, ensure_ascii=False)
    fetched_at = _parse_dt(snap.get("fetched_at")) or datetime.now()
    _execute(
        """
        INSERT INTO stock_price_snapshots (
            user_id, symbol, market, snapshot_date, price, previous_close,
            change_amount, change_percent, shares, market_value, daily_profit,
            source, context, quote_json, fetched_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (user_id, market, symbol, snapshot_date) DO UPDATE SET
            price = EXCLUDED.price,
            previous_close = COALESCE(EXCLUDED.previous_close, stock_price_snapshots.previous_close),
            change_amount = COALESCE(EXCLUDED.change_amount, stock_price_snapshots.change_amount),
            change_percent = COALESCE(EXCLUDED.change_percent, stock_price_snapshots.change_percent),
            shares = COALESCE(EXCLUDED.shares, stock_price_snapshots.shares),
            market_value = COALESCE(EXCLUDED.market_value, stock_price_snapshots.market_value),
            daily_profit = COALESCE(EXCLUDED.daily_profit, stock_price_snapshots.daily_profit),
            source = COALESCE(EXCLUDED.source, stock_price_snapshots.source),
            context = COALESCE(EXCLUDED.context, stock_price_snapshots.context),
            quote_json = COALESCE(EXCLUDED.quote_json, stock_price_snapshots.quote_json),
            fetched_at = EXCLUDED.fetched_at,
            updated_at = NOW();
        """,
        (
            user_id,
            symbol,
            market,
            snap_date,
            price,
            prev,
            change_amount,
            change_percent,
            shares,
            market_value,
            _num_or_none(snap.get("daily_profit") or snap.get("dailyProfit")),
            str(snap.get("source") or "").strip() or None,
            str(snap.get("context") or "quote").strip() or "quote",
            quote_json,
            fetched_at,
        ),
        commit=True,
    )


def price_snapshot_record_batch(user_id: str, items: List[Dict[str, Any]]) -> int:
    if not is_db_enabled():
        return 0
    count = 0
    for item in items or []:
        if not isinstance(item, dict):
            continue
        price_snapshot_upsert(user_id, item)
        count += 1
    return count


def price_snapshot_list(
    symbol: str,
    market: str,
    days: int = 30,
    user_id: str = "default",
) -> List[Dict[str, Any]]:
    if not is_db_enabled():
        return []
    sym = str(symbol or "").upper().strip()
    mkt = str(market or "").upper().strip()
    n = max(1, min(int(days or 30), 365))
    rows = _execute(
        """
        SELECT snapshot_date, price, previous_close, change_amount, change_percent,
               shares, market_value, daily_profit, source, context, quote_json, fetched_at
        FROM stock_price_snapshots
        WHERE user_id = %s AND symbol = %s AND market = %s
          AND snapshot_date >= (CURRENT_DATE - %s::integer)
        ORDER BY snapshot_date ASC
        """,
        (user_id, sym, mkt, n),
        fetch=True,
    )
    return [_snapshot_row_to_history(row) for row in (rows or [])]
