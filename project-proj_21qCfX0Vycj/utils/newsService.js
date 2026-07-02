// 新闻页共享：后端 GNews+RSS、URL 构建、推荐关键词

var CLIENT_RSS_FEEDS = [
  'https://plink.anyfeeder.com/zaobao/realtime/china',
  'https://plink.anyfeeder.com/zaobao/realtime/world',
  'https://plink.anyfeeder.com/bbc/cn',
  'https://plink.anyfeeder.com/fortunechina',
  'https://plink.anyfeeder.com/weixin/cctvnewscenter',
  'https://plink.anyfeeder.com/guangmingribao',
  'https://plink.anyfeeder.com/people-daily',
  'https://plink.anyfeeder.com/weixin/wallstreetcn',
  'https://plink.anyfeeder.com/tmtpost',
  'https://plink.anyfeeder.com/jiemian/finance',
  'https://plink.anyfeeder.com/jiemian/business',
  'https://plink.anyfeeder.com/jingjiribao',
  'https://plink.anyfeeder.com/chinadaily/world',
  'https://plink.anyfeeder.com/weixin/caixinwang',
  'https://cn.wsj.com/zh-hans/rss',
  'https://plink.anyfeeder.com/weixin/thepapernews',
  'https://plink.anyfeeder.com/weixin/cctvyscj',
  'https://plink.anyfeeder.com/weixin/hqsbwx',
];

var LOCKED_PINNED_KEYWORDS = [
  '人工智能',
  '美联储',
  '特朗普',
  '半导体',
  '新能源汽车',
  '港股',
  '美股',
  '跨境电商',
];

var PINNED_STORAGE_KEY = 'news_pinned_keywords_v1';

function getNewsApiBase() {
  var injected = String(window.ANALYSIS_API_BASE || '').replace(/\/$/, '');
  if (injected) return injected;
  if (typeof location === 'undefined') return '';
  var host = location.hostname || '';
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:8123';
  }
  return String(location.origin || '').replace(/\/$/, '');
}

function marketLabelForNews(market) {
  var m = String(market || '').trim().toUpperCase();
  if (m === 'US' || m.indexOf('美') >= 0) return '美股';
  if (m === 'HK' || m.indexOf('港') >= 0) return '港股';
  if (m === 'CN' || m.indexOf('A') >= 0) return 'A股';
  return market || 'A股';
}

function collectStockKeywords(stockLike) {
  if (typeof window.ensureStockKeywords === 'function') {
    return window.ensureStockKeywords(stockLike || {});
  }
  var stock = stockLike || {};
  var list = Array.isArray(stock.keywords)
    ? stock.keywords.map(function (k) {
        return String(k).trim();
      }).filter(Boolean)
    : [];
  if (stock.name) list.unshift(String(stock.name).trim());
  if (stock.symbol) list.push(String(stock.symbol).trim());
  var seen = {};
  return list.filter(function (k) {
    var key = k.toLowerCase();
    if (!k || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function getPinnedKeywords() {
  var extra = [];
  try {
    var raw = localStorage.getItem(PINNED_STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) extra = parsed.map(String).filter(Boolean);
    }
  } catch (_) {}
  var merged = LOCKED_PINNED_KEYWORDS.concat(extra);
  var seen = {};
  return merged.filter(function (k) {
    var key = k.toLowerCase();
    if (!k || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function saveExtraPinnedKeywords(keywords) {
  try {
    var locked = {};
    LOCKED_PINNED_KEYWORDS.forEach(function (k) {
      locked[k.toLowerCase()] = true;
    });
    var extra = (keywords || [])
      .map(String)
      .filter(Boolean)
      .filter(function (k) {
        return !locked[k.toLowerCase()];
      });
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(extra));
  } catch (_) {}
}

function buildNewsUrl(stockLike, options) {
  options = options || {};
  var stock = stockLike || {};
  var params = new URLSearchParams();
  if (stock.symbol) params.set('code', stock.symbol);
  params.set('market', marketLabelForNews(stock.market));
  if (stock.name) params.set('name', stock.name);
  var keywords = collectStockKeywords(stock);
  if (keywords.length) params.set('keywords', keywords.join(','));
  if (options.from) params.set('from', options.from);
  else if (typeof window !== 'undefined') {
    var path =
      window.location.pathname.split('/').pop() || 'index.html';
    params.set(
      'from',
      path + (window.location.search || '') + (window.location.hash || ''),
    );
  }
  return 'news.html?' + params.toString();
}

function normalizeNewsItem(it) {
  if (!it) return null;
  return {
    title: it.title || '',
    description: it.summary || it.description || '',
    sourceName: it.source || it.sourceName || '',
    link: it.link || it.url || '',
    pub_date: it.pub_date || it.pubDate || it.publishedAt || '',
    matchedKeywords: it.matched_keywords || it.matchedKeywords || [],
    sourceType: it.source_type || it.sourceType || 'rss',
  };
}

async function fetchNewsFromBackend(params) {
  var base = getNewsApiBase();
  if (!base) throw new Error('未配置 API 地址');
  var q = new URLSearchParams();
  if (params.code) q.set('code', params.code);
  if (params.market) q.set('market', params.market);
  if (params.name) q.set('name', params.name);
  if (params.keywords && params.keywords.length) {
    q.set('keywords', params.keywords.join(','));
  }
  q.set('hours', String(params.hours || 72));
  var res = await fetch(base + '/api/news?' + q.toString(), {
    headers: { Accept: 'application/json' },
  });
  var data = await res.json().catch(function () {
    return {};
  });
  if (!res.ok || !data || data.ok === false) {
    throw new Error((data && data.error) || '新闻 API 请求失败');
  }
  return {
    items: (data.items || []).map(normalizeNewsItem).filter(Boolean),
    gnewsEnabled: !!data.gnews_enabled,
    gnewsCount: Number(data.gnews_count) || 0,
    rssCount: Number(data.rss_count) || 0,
  };
}

async function fetchPinnedNewsFromBackend(keywords, hours) {
  var base = getNewsApiBase();
  if (!base) throw new Error('未配置 API 地址');
  var q = new URLSearchParams();
  if (keywords && keywords.length) q.set('keywords', keywords.join(','));
  q.set('hours', String(hours || 72));
  var res = await fetch(base + '/api/news/pinned?' + q.toString(), {
    headers: { Accept: 'application/json' },
  });
  var data = await res.json().catch(function () {
    return {};
  });
  if (!res.ok || !data || data.ok === false) {
    throw new Error((data && data.error) || '推荐新闻 API 请求失败');
  }
  return {
    items: (data.items || []).map(normalizeNewsItem).filter(Boolean),
    gnewsEnabled: !!data.gnews_enabled,
    gnewsCount: Number(data.gnews_count) || 0,
    rssCount: Number(data.rss_count) || 0,
  };
}

async function fetchNewsClientRssFallback(keywords, hours) {
  if (typeof fetchRSSFeeds !== 'function') return [];
  var feeds =
    typeof CLIENT_RSS_FEEDS !== 'undefined' && CLIENT_RSS_FEEDS
      ? CLIENT_RSS_FEEDS
      : [];
  var raw = await fetchRSSFeeds(feeds, keywords || [], 30, false, hours || 72);
  return (raw || []).map(function (it) {
    return normalizeNewsItem({
      title: it.title,
      summary: it.description,
      source: it.sourceName || it.source,
      link: it.link,
      pub_date: it.pubDate,
      matched_keywords: it.matchedKeywords || [],
      source_type: 'rss',
    });
  });
}

window.LOCKED_PINNED_KEYWORDS = LOCKED_PINNED_KEYWORDS;
window.getPinnedKeywords = getPinnedKeywords;
window.saveExtraPinnedKeywords = saveExtraPinnedKeywords;
window.buildNewsUrl = buildNewsUrl;
window.collectStockKeywords = collectStockKeywords;
window.fetchNewsFromBackend = fetchNewsFromBackend;
window.fetchPinnedNewsFromBackend = fetchPinnedNewsFromBackend;
window.fetchNewsClientRssFallback = fetchNewsClientRssFallback;
window.normalizeNewsItem = normalizeNewsItem;
window.getNewsApiBase = getNewsApiBase;
