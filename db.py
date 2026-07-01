#!/usr/bin/env python3
"""
股小蜜数据库层（Vercel Postgres / Neon）。
- 无 POSTGRES_URL 时自动回退到文件存储，保证本地零配置可运行。
- 所有写操作使用 upsert，避免 delete-recreate。
- 表结构在首次有数据库连接时自动创建。
"""
import os
import json
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


def screener_delete(base_name: str) -> bool:
    if not is_db_enabled():
        return False
    _execute(
        "DELETE FROM screener_snapshots WHERE base_name = %s",
        (base_name,),
        commit=True,
    )
    return True
