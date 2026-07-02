class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">出现错误</h1>
            <button onClick={() => window.location.reload()} className="btn btn-primary">
              重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

(function () {
  var q = new URLSearchParams(window.location.search);
  var api = q.get('apiPort') || q.get('api') || '';
  if (!api || window.ANALYSIS_API_BASE) return;
  if (/^https?:\/\//i.test(api)) {
    window.ANALYSIS_API_BASE = api;
    return;
  }
  var h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') {
    window.ANALYSIS_API_BASE = 'http://localhost:' + api;
  }
})();

function parseNewsUrlParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    code: q.get('code') || '',
    market: q.get('market') || 'A股',
    name: q.get('name') || '',
    keywords: (q.get('keywords') || '').split(',').map((k) => k.trim()).filter(Boolean),
    from: q.get('from') || '',
  };
}

function getReturnTarget(fallback) {
  const q = new URLSearchParams(window.location.search);
  const from = q.get('from') || '';
  if (from) {
    try {
      const target = new URL(from, window.location.href);
      if (target.origin === window.location.origin) {
        return `${target.pathname.split('/').pop() || fallback}${target.search || ''}${target.hash || ''}`;
      }
    } catch (_) {}
  }
  return fallback;
}

function goBackToSource() {
  const hasExplicitSource = new URLSearchParams(window.location.search).has('from');
  const target = getReturnTarget('index.html');
  if (hasExplicitSource && target) {
    window.location.href = target;
    return;
  }
  if (window.history && window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = 'index.html';
}

function formatNewsTime(pubDate) {
  if (!pubDate) return '';
  try {
    var d = new Date(pubDate);
    if (Number.isNaN(d.getTime())) return String(pubDate).slice(0, 16);
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return String(pubDate).slice(0, 16);
  }
}

function NewsApp() {
  const [urlParams] = React.useState(parseNewsUrlParams);
  const [pinnedKeywords, setPinnedKeywords] = React.useState(() =>
    typeof window.getPinnedKeywords === 'function' ? window.getPinnedKeywords() : [],
  );
  const [pinnedNews, setPinnedNews] = React.useState([]);
  const [stockNews, setStockNews] = React.useState([]);
  const [meta, setMeta] = React.useState({ gnewsEnabled: false, gnewsCount: 0, rssCount: 0, usedFallback: false });
  const [isLoadingPinned, setIsLoadingPinned] = React.useState(false);
  const [isLoadingStock, setIsLoadingStock] = React.useState(false);
  const [error, setError] = React.useState('');
  const [newPinnedInput, setNewPinnedInput] = React.useState('');

  const stockKeywords = React.useMemo(() => {
    var list = (urlParams.keywords || []).slice();
    if (urlParams.name) list.unshift(urlParams.name);
    if (urlParams.code) list.push(urlParams.code);
    var seen = {};
    return list.filter(function (k) {
      var key = k.toLowerCase();
      if (!k || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }, [urlParams]);

  const loadPinned = React.useCallback(async () => {
    setIsLoadingPinned(true);
    setError('');
    try {
      var keywords =
        typeof window.getPinnedKeywords === 'function' ? window.getPinnedKeywords() : pinnedKeywords;
      var result;
      if (typeof window.fetchPinnedNewsFromBackend === 'function') {
        result = await window.fetchPinnedNewsFromBackend(keywords, 72);
      } else {
        throw new Error('新闻服务未加载');
      }
      setPinnedNews(result.items || []);
      setMeta((prev) => ({
        ...prev,
        gnewsEnabled: result.gnewsEnabled,
        gnewsCount: (result.gnewsCount || 0) + (prev.gnewsCountStock || 0),
        rssCount: (result.rssCount || 0) + (prev.rssCountStock || 0),
        usedFallback: false,
      }));
    } catch (e) {
      console.warn('推荐新闻 API 失败，尝试 RSS 回退:', e);
      try {
        var fb =
          typeof window.fetchNewsClientRssFallback === 'function'
            ? await window.fetchNewsClientRssFallback(pinnedKeywords, 72)
            : [];
        setPinnedNews(fb);
        setMeta((prev) => ({ ...prev, usedFallback: true }));
      } catch (e2) {
        setError((e && e.message) || '推荐新闻加载失败');
      }
    } finally {
      setIsLoadingPinned(false);
    }
  }, [pinnedKeywords]);

  const loadStockNews = React.useCallback(async () => {
    if (!urlParams.code && !urlParams.name && stockKeywords.length === 0) {
      setStockNews([]);
      return;
    }
    setIsLoadingStock(true);
    try {
      var result;
      if (typeof window.fetchNewsFromBackend === 'function') {
        result = await window.fetchNewsFromBackend({
          code: urlParams.code,
          market: urlParams.market,
          name: urlParams.name,
          keywords: stockKeywords,
          hours: 72,
        });
        setStockNews(result.items || []);
        setMeta((prev) => ({
          ...prev,
          gnewsEnabled: result.gnewsEnabled,
          gnewsCountStock: result.gnewsCount || 0,
          rssCountStock: result.rssCount || 0,
        }));
      }
    } catch (e) {
      console.warn('股票新闻 API 失败，RSS 回退:', e);
      try {
        var fb =
          typeof window.fetchNewsClientRssFallback === 'function'
            ? await window.fetchNewsClientRssFallback(stockKeywords, 72)
            : [];
        setStockNews(fb);
        setMeta((prev) => ({ ...prev, usedFallback: true }));
      } catch (_) {}
    } finally {
      setIsLoadingStock(false);
    }
  }, [urlParams, stockKeywords]);

  React.useEffect(() => {
    loadPinned();
  }, [loadPinned]);

  React.useEffect(() => {
    if (urlParams.code || urlParams.name || stockKeywords.length) {
      loadStockNews();
    }
  }, [loadStockNews, urlParams.code, urlParams.name, stockKeywords.length]);

  React.useEffect(function () {
    if (!window.GuxiaomiChat) return;
    var query = stockKeywords.join(' ');
    window.GuxiaomiChat.setContext({
      page: 'news',
      scopeKey: (urlParams.code || 'all') + '|news',
      title: urlParams.code ? (urlParams.name || urlParams.code) + ' · 新闻' : '新闻中心',
      news: {
        query: query,
        stockCode: urlParams.code || '',
        headlines: (stockNews.length ? stockNews : pinnedNews).slice(0, 8).map(function (n) {
          return n && n.title;
        }).filter(Boolean),
      },
    });
  }, [urlParams, stockKeywords, stockNews, pinnedNews]);

  const addPinnedKeyword = () => {
    var kw = String(newPinnedInput || '').trim();
    if (!kw) return;
    var next = pinnedKeywords.concat([kw]);
    setPinnedKeywords(next);
    if (typeof window.saveExtraPinnedKeywords === 'function') {
      window.saveExtraPinnedKeywords(next);
    }
    setNewPinnedInput('');
    loadPinned();
  };

  const removeExtraPinned = (kw) => {
    if ((window.LOCKED_PINNED_KEYWORDS || []).indexOf(kw) >= 0) return;
    var next = pinnedKeywords.filter(function (k) {
      return k !== kw;
    });
    setPinnedKeywords(next);
    if (typeof window.saveExtraPinnedKeywords === 'function') {
      window.saveExtraPinnedKeywords(next);
    }
    loadPinned();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-3 py-4 md:px-6 md:py-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-slate-50 md:text-2xl">新闻中心</h1>
            <p className="mt-1 text-xs text-slate-400 md:text-sm">
              后端聚合 GNews + RSS
              {meta.gnewsEnabled ? (
                <span className="ml-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
                  GNews 已启用
                </span>
              ) : (
                <span className="ml-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-100">
                  GNews 未配置，仅 RSS
                </span>
              )}
              {meta.usedFallback && (
                <span className="ml-2 text-amber-300">（API 失败，已回退浏览器 RSS）</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { loadPinned(); loadStockNews(); }} className="btn btn-primary btn-sm">
              刷新
            </button>
            <button type="button" onClick={goBackToSource} className="btn btn-secondary btn-sm">
              返回
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </div>
        )}

        <section className="card mb-4 p-4 md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-50">
              <span className="icon-flame text-amber-300"></span>
              推荐新闻专区
            </h2>
            <span className="text-xs text-slate-400">锁定关键词头条 · 近 72 小时</span>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {pinnedKeywords.map(function (kw) {
              var locked = (window.LOCKED_PINNED_KEYWORDS || []).indexOf(kw) >= 0;
              return (
                <span
                  key={kw}
                  className={
                    'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ' +
                    (locked
                      ? 'border-amber-300/30 bg-amber-400/10 text-amber-100'
                      : 'border-white/15 bg-white/[0.08] text-slate-200')
                  }
                >
                  {locked && <span className="icon-lock text-[10px] opacity-80"></span>}
                  {kw}
                  {!locked && (
                    <button type="button" onClick={() => removeExtraPinned(kw)} className="opacity-70 hover:opacity-100">
                      <span className="icon-x text-[10px]"></span>
                    </button>
                  )}
                </span>
              );
            })}
            <div className="flex items-center gap-1">
              <input
                value={newPinnedInput}
                onChange={(e) => setNewPinnedInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addPinnedKeyword(); }}
                placeholder="添加关注词"
                className="h-8 w-28 rounded-lg border border-white/15 bg-slate-950/50 px-2 text-xs text-slate-100 outline-none focus:border-cyan-400/50"
              />
              <button type="button" onClick={addPinnedKeyword} className="btn btn-secondary btn-sm">
                添加
              </button>
            </div>
          </div>
          {isLoadingPinned ? (
            <div className="flex justify-center py-10">
              <div className="icon-loader animate-spin text-2xl text-cyan-300"></div>
            </div>
          ) : pinnedNews.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">暂无推荐头条</p>
          ) : (
            <div className="space-y-2">
              {pinnedNews.slice(0, 20).map(function (news, idx) {
                return <HeadlineNewsRow key={'pin-' + idx} news={news} rank={idx + 1} />;
              })}
            </div>
          )}
        </section>

        {(urlParams.code || urlParams.name || stockKeywords.length > 0) && (
          <section className="card p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-50">
                {urlParams.code ? `${urlParams.code}${urlParams.name ? ' ' + urlParams.name : ''}` : '关键词'} · 相关新闻
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {stockKeywords.map(function (kw) {
                  return (
                    <span key={kw} className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2.5 py-0.5 text-[11px] text-cyan-100">
                      {kw}
                    </span>
                  );
                })}
              </div>
            </div>
            {isLoadingStock ? (
              <div className="flex justify-center py-8">
                <div className="icon-loader animate-spin text-2xl text-cyan-300"></div>
              </div>
            ) : stockNews.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                未匹配到相关新闻。请确认已从持仓/详情页带入关键词，或检查 GNews API Key。
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {stockNews.map(function (news, idx) {
                  return <NewsCard key={'stock-' + idx} news={news} />;
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function HeadlineNewsRow({ news, rank }) {
  var clean = (news.title || '').replace(/<[^>]*>/g, '').trim();
  return (
    <a
      href={news.link || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 transition-colors hover:border-cyan-300/30 hover:bg-white/[0.08]"
    >
      <span className="gx-num mt-0.5 w-6 shrink-0 text-center text-sm font-black text-amber-300">{rank}</span>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-50 group-hover:text-cyan-100 md:text-base">
          {clean}
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <SourceBadge news={news} />
          {formatNewsTime(news.pub_date) && <span>{formatNewsTime(news.pub_date)}</span>}
          {(news.matchedKeywords || []).slice(0, 3).map(function (kw) {
            return (
              <span key={kw} className="rounded border border-blue-300/20 bg-blue-400/10 px-1.5 py-0.5 text-blue-100">
                {kw}
              </span>
            );
          })}
        </div>
      </div>
      <span className="icon-external-link shrink-0 text-slate-500 group-hover:text-cyan-200"></span>
    </a>
  );
}

function NewsCard({ news }) {
  var cleanTitle = (news.title || '').replace(/<[^>]*>/g, '').trim();
  var cleanDesc = (news.description || '').replace(/<[^>]*>/g, '').trim();
  return (
    <a
      href={news.link || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-2xl border border-white/10 bg-white/[0.05] p-4 transition-colors hover:border-pink-300/30 hover:bg-white/[0.08]"
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <SourceBadge news={news} />
        {(news.matchedKeywords || []).map(function (kw, i) {
          return (
            <span key={i} className="rounded-full border border-blue-300/20 bg-blue-400/10 px-2 py-0.5 text-[11px] text-blue-100">
              {kw}
            </span>
          );
        })}
      </div>
      <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-50 md:text-base">{cleanTitle}</h3>
      {cleanDesc && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-400">{cleanDesc}</p>}
    </a>
  );
}

function SourceBadge({ news }) {
  var isGnews = news.sourceType === 'gnews' || String(news.sourceName || '').toLowerCase().indexOf('gnews') >= 0;
  return (
    <span
      className={
        'rounded-full border px-2 py-0.5 text-[11px] font-semibold ' +
        (isGnews
          ? 'border-violet-300/30 bg-violet-400/10 text-violet-100'
          : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100')
      }
    >
      {isGnews ? 'GNews' : news.sourceName || 'RSS'}
    </span>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <NewsApp />
  </ErrorBoundary>
);
