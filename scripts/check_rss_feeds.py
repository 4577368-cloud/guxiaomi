#!/usr/bin/env python3
"""
检查新闻页使用的 RSS 订阅源是否可用。不依赖 api_server，直接拉取并解析。
用法（在 guxiaomi 目录下）:
  python scripts/check_rss_feeds.py
或:
  cd guxiaomi && python scripts/check_rss_feeds.py
"""
import sys
from pathlib import Path

# 保证可导入 news_feeds
_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from news_feeds import check_feeds, NEWSPAGE_RSS_URLS


def main():
    print("正在检查新闻页 RSS 订阅源（每个源超时 12 秒）…\n")
    feeds = check_feeds(NEWSPAGE_RSS_URLS, timeout_per_url=12)
    ok_count = sum(1 for f in feeds if f.get("ok"))
    print(f"结果: {ok_count}/{len(feeds)} 个源可用\n")
    print("-" * 80)
    for f in feeds:
        status = "✓" if f.get("ok") else "✗"
        count = f.get("items_count", 0)
        err = f.get("error") or ""
        url = (f.get("url") or "")[:60] + ("…" if len(f.get("url", "")) > 60 else "")
        print(f"  {status}  {count:3d} 条  {url}")
        if err:
            print(f"      错误: {err}")
    print("-" * 80)
    if ok_count == 0:
        print("建议: 检查网络或设置环境变量 RSS_PROXY_URL 使用代理，例如:")
        print("  export RSS_PROXY_URL=https://proxy-api.trickle-app.host")
        print("  python scripts/check_rss_feeds.py")
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
