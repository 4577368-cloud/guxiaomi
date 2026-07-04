#!/usr/bin/env python3
"""按文件内容 hash 统一注入静态资源的 ?v= 版本串，替代手写版本号。

用法：
    python3 scripts/stamp_assets.py                 # 就地改写源码目录（默认 project-proj_21qCfX0Vycj）
    python3 scripts/stamp_assets.py web_public       # 改写构建产物目录（Vercel 构建时用）
    python3 scripts/stamp_assets.py --check          # 只检查是否需要更新，不写入（CI 校验用）

行为：
    - 扫描目标目录下所有 .html
    - 对本地 <script src> / <link href> 指向的 .js/.css/.mjs，按其内容 sha1 生成 8 位 hash，
      改写为 `路径?v=<hash>`；外链（http/https/// /data:）与非 js/css 资源保持不变。
    - 幂等：内容不变则 hash 不变，重复运行无 diff。
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_WEB_ROOT = ROOT / "project-proj_21qCfX0Vycj"

STAMP_EXTS = {".js", ".css", ".mjs"}
ATTR_RE = re.compile(r'(?P<attr>\bsrc|\bhref)=(?P<q>["\'])(?P<url>[^"\']+)(?P=q)')
EXTERNAL_PREFIXES = ("http://", "https://", "//", "data:", "mailto:", "#")

_hash_cache: dict[Path, str] = {}


def content_hash(path: Path) -> str:
    cached = _hash_cache.get(path)
    if cached is not None:
        return cached
    h = hashlib.sha1(path.read_bytes()).hexdigest()[:8]
    _hash_cache[path] = h
    return h


def resolve_asset(url_path: str, html_file: Path, web_root: Path) -> Path | None:
    """把 HTML 中的相对/根路径解析为磁盘上的实际文件。"""
    candidates = []
    if url_path.startswith("/"):
        candidates.append(web_root / url_path.lstrip("/"))
    else:
        candidates.append((html_file.parent / url_path))
        candidates.append(web_root / url_path)
    for c in candidates:
        try:
            resolved = c.resolve()
        except OSError:
            continue
        if resolved.is_file():
            return resolved
    return None


def stamp_html(html_file: Path, web_root: Path) -> tuple[str, int, list[str]]:
    original = html_file.read_text(encoding="utf-8")
    misses: list[str] = []
    changed = 0

    def replace(match: re.Match) -> str:
        nonlocal changed
        attr = match.group("attr")
        quote = match.group("q")
        url = match.group("url")

        if url.startswith(EXTERNAL_PREFIXES):
            return match.group(0)

        base, _, _query = url.partition("?")
        ext = Path(base).suffix.lower()
        if ext not in STAMP_EXTS:
            return match.group(0)

        asset = resolve_asset(base, html_file, web_root)
        if asset is None:
            misses.append(base)
            return match.group(0)

        new_url = f"{base}?v={content_hash(asset)}"
        if new_url != url:
            changed += 1
        return f"{attr}={quote}{new_url}{quote}"

    updated = ATTR_RE.sub(replace, original)
    return updated, changed, misses


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--check"]
    check_only = "--check" in sys.argv[1:]
    web_root = (Path(args[0]).resolve() if args else DEFAULT_WEB_ROOT)

    if not web_root.is_dir():
        print(f"stamp_assets: 目录不存在: {web_root}", file=sys.stderr)
        return 1

    html_files = sorted(web_root.rglob("*.html"))
    html_files = [p for p in html_files if "node_modules" not in p.parts]
    if not html_files:
        print(f"stamp_assets: 未找到 HTML: {web_root}")
        return 0

    total_changed = 0
    needs_update = 0
    all_misses: set[str] = set()

    for html_file in html_files:
        updated, changed, misses = stamp_html(html_file, web_root)
        all_misses.update(misses)
        current = html_file.read_text(encoding="utf-8")
        if updated != current:
            needs_update += 1
            total_changed += changed
            if check_only:
                print(f"stamp_assets: 需要更新 {html_file.relative_to(web_root)}（{changed} 处）")
            else:
                html_file.write_text(updated, encoding="utf-8")
                print(f"stamp_assets: 已更新 {html_file.relative_to(web_root)}（{changed} 处）")

    for miss in sorted(all_misses):
        print(f"stamp_assets: [跳过] 未找到本地资源，保持原样: {miss}", file=sys.stderr)

    if check_only and needs_update:
        print(f"stamp_assets: 有 {needs_update} 个文件的版本串过期，请运行 python3 scripts/stamp_assets.py", file=sys.stderr)
        return 2

    if not needs_update:
        print("stamp_assets: 所有版本串均为最新，无需改动")
    else:
        print(f"stamp_assets: 完成，共处理 {needs_update} 个文件、{total_changed} 处引用")
    return 0


if __name__ == "__main__":
    sys.exit(main())
