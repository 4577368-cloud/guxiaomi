#!/usr/bin/env python3
"""
报告用新闻聚合：GNews API + 多 RSS 订阅源。
生成报告时拉取与股票/公司相关新闻，供分析师引用解读利好利空。
"""
import os
import re
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import List, Optional

# 默认 RSS 源（可被环境或配置覆盖）
DEFAULT_RSS_URLS = [
    "http://feeds.reuters.com/reuters/topNews",
    "https://www.reutersagency.com/feed/?best-topics=business&format=xml",
    "https://www.reutersagency.com/feed/?best-topics=technology&format=xml",
    "https://feeds.a.dj.com/rss/RSSWSJD.xml",
    "https://www.ft.com/markets?format=rss",
    "https://www.technologyreview.com/topic/artificial-intelligence/feed/",
    "https://techcrunch.com/category/artificial-intelligence/feed/",
    "https://www.wired.com/feed/category/business/latest/rss",
    "https://openai.com/news/rss.xml",
]

# 新闻页用：含中文/财经来源，与之前前端订阅一致，便于关键词匹配
NEWSPAGE_RSS_URLS = [
    "https://plink.anyfeeder.com/zaobao/realtime/china",
    "https://plink.anyfeeder.com/zaobao/realtime/world",
    "https://plink.anyfeeder.com/bbc/cn",
    "https://plink.anyfeeder.com/fortunechina",
    "https://plink.anyfeeder.com/weixin/cctvnewscenter",
    "https://plink.anyfeeder.com/guangmingribao",
    "https://plink.anyfeeder.com/people-daily",
    "https://plink.anyfeeder.com/weixin/wallstreetcn",
    "https://plink.anyfeeder.com/tmtpost",
    "https://plink.anyfeeder.com/jiemian/finance",
    "https://plink.anyfeeder.com/jiemian/business",
    "https://plink.anyfeeder.com/jingjiribao",
    "https://plink.anyfeeder.com/chinadaily/world",
    "https://plink.anyfeeder.com/weixin/caixinwang",
    "https://cn.wsj.com/zh-hans/rss",
    "https://plink.anyfeeder.com/weixin/thepapernews",
    "https://plink.anyfeeder.com/weixin/cctvyscj",
    "https://plink.anyfeeder.com/weixin/hqsbwx",
]

# 从环境读取 GNews API Key（勿提交到仓库）
def _gnews_api_key() -> str:
    return (os.environ.get("GNEWS_API_KEY") or "").strip()


def _fetch_url(url: str, timeout: int = 20) -> Optional[str]:
    """拉取 URL 内容；直连失败时若设 RSS_PROXY_URL 或为 plink 源则通过代理重试。"""
    headers = {"Accept": "application/rss+xml, application/xml, text/xml, application/atom+xml, */*"}
    proxy_base = (os.environ.get("RSS_PROXY_URL") or "").strip().rstrip("/")
    if not proxy_base and "plink.anyfeeder.com" in url:
        proxy_base = "https://proxy-api.trickle-app.host"
    urls_to_try = [url]
    if proxy_base and not url.startswith(proxy_base):
        sep = "&" if "?" in proxy_base else "/?"
        urls_to_try.append(proxy_base.rstrip("/") + sep + "url=" + urllib.parse.quote(url, safe=""))
    for u in urls_to_try:
        try:
            req = urllib.request.Request(u, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except Exception:
            continue
    return None


def check_feeds(urls: Optional[List[str]] = None, timeout_per_url: int = 12) -> List[dict]:
    """检查一批 RSS 订阅源是否可用。返回 [{ "url", "ok", "items_count", "error" }]。"""
    urls = urls or (NEWSPAGE_RSS_URLS + DEFAULT_RSS_URLS)
    result: List[dict] = []
    for url in urls:
        entry: dict = {"url": url, "ok": False, "items_count": 0, "error": None}
        try:
            text = _fetch_url(url, timeout=timeout_per_url)
            if not text:
                entry["error"] = "拉取失败或超时"
                result.append(entry)
                continue
            name = urllib.parse.urlparse(url).netloc or "RSS"
            items = _parse_rss_items(text, name)
            entry["ok"] = True
            entry["items_count"] = len(items)
        except Exception as e:
            entry["error"] = str(e)[:200]
        result.append(entry)
    return result


def _parse_rss_items(xml_text: str, source_name: str) -> List[dict]:
    """解析 RSS/Atom 条目，返回 [{title, link, summary, pub_date, source}]"""
    items = []
    try:
        root = ET.fromstring(xml_text)
        # 处理命名空间
        ns = {"atom": "http://www.w3.org/2005/Atom", "dc": "http://purl.org/dc/elements/1.1/", "media": "http://search.yahoo.com/mrss/"}
        for tag in ("item", "entry"):
            for node in root.iter(tag):
                title = ""
                link = ""
                summary = ""
                pub_date = ""
                for child in node:
                    tag_lower = (child.tag.split("}")[-1] if "}" in child.tag else child.tag).lower()
                    if tag_lower == "title" and child.text:
                        title = child.text.strip()
                    elif tag_lower == "link":
                        link = child.get("href") or (child.text or "").strip()
                    elif tag_lower in ("description", "summary", "content"):
                        summary = (child.text or "").strip() if child.text else ""
                        if not summary and len(child) > 0 and child[0].text:
                            summary = child[0].text.strip()
                        # 去掉 HTML 标签
                        if summary:
                            summary = re.sub(r"<[^>]+>", "", summary)
                    elif tag_lower in ("pubdate", "published", "updated"):
                        pub_date = (child.text or "").strip()
                if title:
                    items.append({"title": title, "link": link, "summary": summary[:300] if summary else "", "pub_date": pub_date, "source": source_name})
    except Exception:
        pass
    return items


def _filter_by_keywords(items: List[dict], keywords: List[str], max_age_hours: int = 72, max_results: int = 25) -> List[dict]:
    """按关键词过滤，并限制在最近 max_age_hours 内（需 dateutil 才按时间过滤）。"""
    if not keywords:
        return items[:max_results]
    kw_lower = [k.lower() for k in keywords if k]
    filtered = []
    for it in items:
        text = (it.get("title") or "") + " " + (it.get("summary") or "")
        if not any(k in text.lower() for k in kw_lower):
            continue
        if it.get("pub_date") and max_age_hours > 0:
            try:
                from dateutil import parser as date_parser
                now = datetime.utcnow()
                pub = date_parser.parse(it["pub_date"])
                pub_naive = pub.replace(tzinfo=None) if hasattr(pub, "replace") else pub
                if (now - pub_naive).total_seconds() > max_age_hours * 3600:
                    continue
            except Exception:
                pass
        filtered.append(it)
    return filtered[:max_results]


def _filter_by_max_age(items: List[dict], max_age_hours: int, max_results: int) -> List[dict]:
    """仅按最近 max_age_hours 过滤。"""
    if max_age_hours <= 0:
        return items[:max_results]
    out = []
    for it in items:
        if it.get("pub_date"):
            try:
                from dateutil import parser as date_parser
                now = datetime.utcnow()
                pub = date_parser.parse(it["pub_date"])
                pub_naive = pub.replace(tzinfo=None) if hasattr(pub, "replace") else pub
                if (now - pub_naive).total_seconds() <= max_age_hours * 3600:
                    out.append(it)
            except Exception:
                out.append(it)
        else:
            out.append(it)
        if len(out) >= max_results:
            break
    return out[:max_results]


def _fetch_one_url(url: str):
    """拉取单个 URL 并解析为 items，供并行调用。"""
    text = _fetch_url(url)
    if not text:
        return []
    name = urllib.parse.urlparse(url).netloc or "RSS"
    return _parse_rss_items(text, name)


def fetch_rss_news(rss_urls: Optional[List[str]] = None, keywords: Optional[List[str]] = None, max_age_hours: int = 72, max_results: int = 25) -> List[dict]:
    """从 RSS 源拉取新闻，按关键词过滤。多源并行拉取以缩短总耗时。"""
    urls = rss_urls or DEFAULT_RSS_URLS
    all_items = []
    try:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        with ThreadPoolExecutor(max_workers=min(12, len(urls))) as executor:
            futures = {executor.submit(_fetch_one_url, url): url for url in urls}
            for fut in as_completed(futures, timeout=45):
                try:
                    items = fut.result()
                    all_items.extend(items)
                except Exception:
                    pass
    except Exception:
        for url in urls:
            items = _fetch_one_url(url)
            all_items.extend(items)
    if keywords:
        all_items = _filter_by_keywords(all_items, keywords, max_age_hours=max_age_hours, max_results=max_results)
    else:
        all_items = _filter_by_max_age(all_items, max_age_hours, max_results)
    # 按日期排序（无 dateutil 则保持顺序）
    try:
        from dateutil import parser as date_parser
        def _sort_key(x):
            s = x.get("pub_date") or ""
            try:
                return date_parser.parse(s)
            except Exception:
                return datetime.min
        all_items.sort(key=_sort_key, reverse=True)
    except Exception:
        pass
    return all_items


def fetch_gnews(query: str, api_key: str, max_articles: int = 10) -> List[dict]:
    """GNews API v4 搜索。返回 [{title, url, description, publishedAt, source}]"""
    if not api_key or not query:
        return []
    try:
        q = urllib.parse.quote(query)
        url = f"https://gnews.io/api/v4/search?q={q}&apikey={api_key}&max={max_articles}&sortby=publishedAt"
        text = _fetch_url(url, timeout=15)
        if not text:
            return []
        import json
        data = json.loads(text)
        articles = data.get("articles") or []
        out = []
        for a in articles:
            out.append({
                "title": a.get("title") or "",
                "link": a.get("url") or "",
                "summary": a.get("description") or "",
                "pub_date": a.get("publishedAt") or "",
                "source": a.get("source", {}).get("name", "GNews"),
            })
        return out
    except Exception:
        return []


def get_news_for_page(stock_name: str, stock_code: str, market: str, extra_keywords: Optional[List[str]] = None, max_age_hours: int = 48, max_items: int = 200) -> List[dict]:
    """新闻页用：用股票代码+名称+备注关键词拉取，近 max_age_hours 小时。返回带 source_type / matched_keywords。"""
    keywords: List[str] = []
    if stock_name:
        keywords.append(stock_name.strip())
    code_clean = re.sub(r"[^\w]", "", stock_code or "").upper()
    if code_clean and code_clean not in keywords:
        keywords.append(code_clean)
    if extra_keywords:
        for k in extra_keywords:
            k = (k or "").strip()
            if k and k not in keywords:
                keywords.append(k)
    if not keywords and code_clean:
        keywords = [code_clean]
    if not keywords:
        return []

    def _matched(text: str) -> List[str]:
        t = (text or "").lower()
        return [k for k in keywords if k and k.lower() in t]

    def _enrich(it: dict, source_type: str, default_matched: Optional[List[str]] = None) -> dict:
        text = (it.get("title") or "") + " " + (it.get("summary") or "")
        matched = _matched(text) or default_matched or []
        return {
            **it,
            "source_type": source_type,
            "matched_keywords": matched,
        }

    combined: List[dict] = []
    seen = set()
    api_key = _gnews_api_key()
    if api_key:
        gnews_query = " OR ".join(keywords[:5])
        for it in fetch_gnews(gnews_query, api_key, max_articles=30):
            t = (it.get("title") or "").strip()
            if t and t not in seen:
                seen.add(t)
                combined.append(_enrich(it, "gnews", keywords[:3]))
    for it in fetch_rss_news(NEWSPAGE_RSS_URLS, keywords, max_age_hours=max_age_hours, max_results=max_items):
        t = (it.get("title") or "").strip()
        if t and t not in seen:
            seen.add(t)
            combined.append(_enrich(it, "rss"))
    if not combined:
        for it in fetch_rss_news(DEFAULT_RSS_URLS, keywords, max_age_hours=max_age_hours, max_results=max_items):
            t = (it.get("title") or "").strip()
            if t and t not in seen:
                seen.add(t)
                combined.append(_enrich(it, "rss"))
    if not combined:
        for it in fetch_rss_news(DEFAULT_RSS_URLS, None, max_age_hours=max_age_hours, max_results=min(50, max_items)):
            t = (it.get("title") or "").strip()
            if t and t not in seen:
                seen.add(t)
                combined.append(_enrich(it, "rss"))
    try:
        from dateutil import parser as date_parser
        def _sort_key(x):
            s = x.get("pub_date") or ""
            try:
                return date_parser.parse(s)
            except Exception:
                return datetime.min
        combined.sort(key=_sort_key, reverse=True)
    except Exception:
        pass
    return combined[:max_items]


def get_pinned_headlines(keywords: List[str], max_age_hours: int = 72, max_items: int = 40) -> List[dict]:
    """推荐专区：仅按锁定关键词聚合头条（GNews + RSS）。"""
    clean = [k.strip() for k in (keywords or []) if k and str(k).strip()]
    if not clean:
        return []
    return get_news_for_page("", "", "", extra_keywords=clean, max_age_hours=max_age_hours, max_items=max_items)


def get_news_for_report(stock_name: str, stock_code: str, market: str, max_items: int = 20) -> str:
    """
    聚合与该公司/股票相关的新闻，供报告生成时注入分析师上下文。
    使用 GNews（若配置 API Key）+ 多 RSS 源；关键词为股票名、代码、公司简称。
    """
    keywords = []
    if stock_name:
        keywords.append(stock_name)
    # 代码转搜索词：600519→贵州茅台需映射，这里用代码数字/字母
    code_clean = re.sub(r"[^\w]", "", stock_code).upper()
    if code_clean and code_clean not in keywords:
        keywords.append(code_clean)
    # 常见公司简称（可从配置扩展）
    if not keywords:
        keywords = [stock_code]

    combined = []
    seen = set()
    api_key = _gnews_api_key()
    if api_key:
        for it in fetch_gnews(" OR ".join(keywords[:3]), api_key, max_articles=10):
            t = (it.get("title") or "").strip()
            if t and t not in seen:
                seen.add(t)
                combined.append(it)
    for it in fetch_rss_news(DEFAULT_RSS_URLS, keywords):
        t = (it.get("title") or "").strip()
        if t and t not in seen:
            seen.add(t)
            combined.append(it)
    combined = combined[:max_items]

    if not combined:
        return ""

    lines = ["【相关新闻】（供分析师引用并解读利好/利空）"]
    for i, n in enumerate(combined, 1):
        title = (n.get("title") or "").strip()
        source = n.get("source") or ""
        summary = (n.get("summary") or "").strip()[:150]
        line = f"{i}. {title}"
        if source:
            line += f"（来源：{source}）"
        if summary:
            line += f"\n   {summary}"
        lines.append(line)
    return "\n".join(lines)
