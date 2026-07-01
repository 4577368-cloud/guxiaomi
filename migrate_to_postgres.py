#!/usr/bin/env python3
"""
一次性迁移脚本：把本地 reports/ 和 predictions/ 目录下的 JSON 文件导入 Postgres。
- 已存在的 base_name 会跳过（保留数据库中数据）。
- 运行前请确认 .env 中 POSTGRES_URL 已配置。
"""
import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

import db

REPORTS_DIR = Path(__file__).parent / "reports"
PREDICTIONS_DIR = Path(__file__).parent / "predictions"


def migrate_reports():
    if not REPORTS_DIR.is_dir():
        print("[reports] 目录不存在，跳过")
        return 0, 0, 0

    existing = {it["base_name"] for it in db.reports_list()}
    files = sorted(REPORTS_DIR.glob("*.json"))
    created = skipped = failed = 0

    for path in files:
        base_name = path.stem
        if base_name in existing:
            skipped += 1
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            payload["base_name"] = base_name
            md_path = path.with_suffix(".md")
            html_path = path.with_suffix(".html")
            md_content = md_path.read_text(encoding="utf-8") if md_path.is_file() else None
            html_content = html_path.read_text(encoding="utf-8") if html_path.is_file() else None
            db.report_save(base_name, payload, md_content, html_content)
            created += 1
            print(f"[reports] 已导入 {base_name}")
        except Exception as e:
            failed += 1
            print(f"[reports] 导入失败 {base_name}: {e}")

    print(f"[reports] 总计 {len(files)} | 成功 {created} | 跳过 {skipped} | 失败 {failed}")
    return created, skipped, failed


def migrate_screener():
    if not PREDICTIONS_DIR.is_dir():
        print("[predictions] 目录不存在，跳过")
        return 0, 0, 0

    existing = {it["base_name"] for it in db.screener_list()}
    files = sorted(PREDICTIONS_DIR.glob("*.json"))
    created = skipped = failed = 0

    for path in files:
        base_name = path.stem
        if base_name in existing:
            skipped += 1
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            payload["base_name"] = base_name
            db.screener_save(payload)
            created += 1
            print(f"[screener] 已导入 {base_name}")
        except Exception as e:
            failed += 1
            print(f"[screener] 导入失败 {base_name}: {e}")

    print(f"[screener] 总计 {len(files)} | 成功 {created} | 跳过 {skipped} | 失败 {failed}")
    return created, skipped, failed


def migrate_screener_symbols():
    """为所有预测快照补充股票明细落库（支持对已存在快照补全）。"""
    if not PREDICTIONS_DIR.is_dir():
        print("[screener_symbols] 目录不存在，跳过")
        return 0, 0

    files = sorted(PREDICTIONS_DIR.glob("*.json"))
    created = skipped = failed = 0

    for path in files:
        base_name = path.stem
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            payload["base_name"] = base_name
            data = payload.get("data") or {}
            items = data.get("list") if isinstance(data, dict) else []
            if not items:
                skipped += 1
                continue
            # 先确保快照存在（upsert），再写入 symbols
            db.screener_save(payload)
            created += 1
            print(f"[screener_symbols] 已导入 {base_name} 共 {len(items)} 条")
        except Exception as e:
            failed += 1
            print(f"[screener_symbols] 导入失败 {base_name}: {e}")

    print(f"[screener_symbols] 总计 {len(files)} | 成功 {created} | 跳过 {skipped} | 失败 {failed}")
    return created, skipped, failed


def main():
    if not db.is_db_enabled():
        print("错误：未配置 POSTGRES_URL，无法迁移。")
        sys.exit(1)

    db.init_db()
    print("数据库连接正常，开始迁移...\n")

    r_created, r_skipped, r_failed = migrate_reports()
    print()
    s_created, s_skipped, s_failed = migrate_screener()
    print()
    ss_created, ss_skipped, ss_failed = migrate_screener_symbols()
    print()

    print("迁移完成。")
    print(f"  reports:          成功 {r_created} | 跳过 {r_skipped} | 失败 {r_failed}")
    print(f"  screener:         成功 {s_created} | 跳过 {s_skipped} | 失败 {s_failed}")
    print(f"  screener_symbols: 成功 {ss_created} | 跳过 {ss_skipped} | 失败 {ss_failed}")


if __name__ == "__main__":
    main()
