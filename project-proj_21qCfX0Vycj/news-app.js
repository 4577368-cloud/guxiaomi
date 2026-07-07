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

function initStockKeywords(urlParams) {
  var fromUrl = (urlParams.keywords || []).slice();
  if (fromUrl.length) return fromUrl;
  if (urlParams.code && typeof window.loadStockKeywordsFromStorage === 'function') {
    return window.loadStockKeywordsFromStorage(urlParams.code, urlParams.market) || [];
  }
  return [];
}

function buildSelectableKeywords(stockKeywords, pinnedKeywords, urlParams, excludedAuto) {
  var list = (stockKeywords || []).slice();
  var excluded = {};
  (excludedAuto || []).forEach(function (k) {
    excluded[String(k).toLowerCase()] = true;
  });
  if (urlParams && urlParams.name && !excluded[urlParams.name.toLowerCase()]) {
    list.unshift(urlParams.name);
  }
  if (
    urlParams &&
    urlParams.code &&
    !excluded[urlParams.code.toLowerCase()] &&
    urlParams.code !== urlParams.name
  ) {
    list.push(urlParams.code);
  }
  list = list.concat(pinnedKeywords || []);
  return typeof window.dedupeKeywords === 'function'
    ? window.dedupeKeywords(list)
    : list.filter(Boolean);
}

function buildKeywordChips(stockKeywords, pinnedKeywords, urlParams, excludedAuto) {
  var chips = [];
  var seen = {};
  function pushChip(kw, kind, locked) {
    var key = String(kw || '').trim();
    if (!key) return;
    var lower = key.toLowerCase();
    if (seen[lower]) return;
    seen[lower] = true;
    chips.push({ kw: key, kind: kind, locked: !!locked });
  }
  (stockKeywords || []).forEach(function (kw) {
    pushChip(kw, 'stock', false);
  });
  (pinnedKeywords || []).forEach(function (kw) {
    if ((stockKeywords || []).some(function (s) {
      return String(s).toLowerCase() === String(kw).toLowerCase();
    })) {
      return;
    }
    var locked = (window.LOCKED_PINNED_KEYWORDS || []).indexOf(kw) >= 0;
    pushChip(kw, 'pinned', locked);
  });
  var excluded = {};
  (excludedAuto || []).forEach(function (k) {
    excluded[String(k).toLowerCase()] = true;
  });
  if (urlParams && urlParams.name && !excluded[urlParams.name.toLowerCase()]) {
    if (!seen[urlParams.name.toLowerCase()]) pushChip(urlParams.name, 'auto', false);
  }
  if (
    urlParams &&
    urlParams.code &&
    !excluded[urlParams.code.toLowerCase()] &&
    urlParams.code !== urlParams.name
  ) {
    if (!seen[urlParams.code.toLowerCase()]) pushChip(urlParams.code, 'auto', false);
  }
  return chips;
}

function NewsApp() {
  const [urlParams] = React.useState(parseNewsUrlParams);
  const [pinnedKeywords, setPinnedKeywords] = React.useState(() =>
    typeof window.getPinnedKeywords === 'function' ? window.getPinnedKeywords() : [],
  );
  const [stockKeywords, setStockKeywords] = React.useState(() => initStockKeywords(parseNewsUrlParams()));
  const [activeKeyword, setActiveKeyword] = React.useState('');
  const [recommendedNews, setRecommendedNews] = React.useState([]);
  const [rssNews, setRssNews] = React.useState([]);
  const [meta, setMeta] = React.useState({ gnewsEnabled: false, usedFallback: false });
  const [isLoadingRecommended, setIsLoadingRecommended] = React.useState(false);
  const [isLoadingRss, setIsLoadingRss] = React.useState(false);
  const [error, setError] = React.useState('');
  const [newKeywordInput, setNewKeywordInput] = React.useState('');
  const [editingKeyword, setEditingKeyword] = React.useState(null);
  const [editingValue, setEditingValue] = React.useState('');
  const [editingKind, setEditingKind] = React.useState('');
  const [excludedAutoKeywords, setExcludedAutoKeywords] = React.useState([]);

  const selectableKeywords = React.useMemo(
    () => buildSelectableKeywords(stockKeywords, pinnedKeywords, urlParams, excludedAutoKeywords),
    [stockKeywords, pinnedKeywords, urlParams, excludedAutoKeywords],
  );

  const keywordChips = React.useMemo(
    () => buildKeywordChips(stockKeywords, pinnedKeywords, urlParams, excludedAutoKeywords),
    [stockKeywords, pinnedKeywords, urlParams, excludedAutoKeywords],
  );

  React.useEffect(function () {
    if (!activeKeyword && selectableKeywords.length) {
      setActiveKeyword(selectableKeywords[0]);
    } else if (activeKeyword && selectableKeywords.indexOf(activeKeyword) < 0) {
      setActiveKeyword(selectableKeywords[0] || '');
    }
  }, [selectableKeywords, activeKeyword]);

  const loadRecommended = React.useCallback(async (keyword) => {
    var kw = String(keyword || '').trim();
    if (!kw) {
      setRecommendedNews([]);
      return;
    }
    setIsLoadingRecommended(true);
    setError('');
    try {
      var result;
      if (typeof window.fetchRecommendedForKeyword === 'function') {
        result = await window.fetchRecommendedForKeyword(kw, 72, 20);
      } else {
        throw new Error('新闻服务未加载');
      }
      setRecommendedNews((result.items || []).slice(0, 20));
      setMeta(function (prev) {
        return Object.assign({}, prev, {
          gnewsEnabled: result.gnewsEnabled,
          usedFallback: false,
        });
      });
    } catch (e) {
      console.warn('推荐新闻 API 失败，尝试 RSS 回退:', e);
      try {
        var fb =
          typeof window.fetchNewsClientRssFallback === 'function'
            ? await window.fetchNewsClientRssFallback([kw], 72)
            : [];
        setRecommendedNews(fb.slice(0, 20));
        setMeta(function (prev) {
          return Object.assign({}, prev, { usedFallback: true });
        });
      } catch (e2) {
        setError((e && e.message) || '推荐新闻加载失败');
      }
    } finally {
      setIsLoadingRecommended(false);
    }
  }, []);

  const loadRss = React.useCallback(async (keyword) => {
    var kw = String(keyword || '').trim();
    setIsLoadingRss(true);
    try {
      var result;
      if (typeof window.fetchRssNewsFromBackend === 'function') {
        result = await window.fetchRssNewsFromBackend(kw, 72, 40);
      } else {
        throw new Error('RSS 服务未加载');
      }
      setRssNews(result.items || []);
    } catch (e) {
      console.warn('RSS API 失败，尝试浏览器 RSS 回退:', e);
      try {
        var fb =
          typeof window.fetchNewsClientRssFallback === 'function'
            ? await window.fetchNewsClientRssFallback(kw ? [kw] : [], 72)
            : [];
        setRssNews(fb);
        setMeta(function (prev) {
          return Object.assign({}, prev, { usedFallback: true });
        });
      } catch (_) {}
    } finally {
      setIsLoadingRss(false);
    }
  }, []);

  React.useEffect(function () {
    if (!activeKeyword) return;
    loadRecommended(activeKeyword);
    loadRss(activeKeyword);
  }, [activeKeyword, loadRecommended, loadRss]);

  React.useEffect(function () {
    if (!window.GuxiaomiChat) return;
    window.GuxiaomiChat.setContext({
      page: 'news',
      scopeKey: (urlParams.code || 'all') + '|news|' + activeKeyword,
      title: urlParams.code
        ? (urlParams.name || urlParams.code) + ' · 新闻'
        : '新闻中心',
      news: {
        query: activeKeyword || stockKeywords.join(' '),
        stockCode: urlParams.code || '',
        headlines: recommendedNews.slice(0, 8).map(function (n) {
          return n && n.title;
        }).filter(Boolean),
      },
    });
  }, [urlParams, activeKeyword, stockKeywords, recommendedNews]);

  const persistStockKeywords = React.useCallback(function (next) {
    var clean =
      typeof window.dedupeKeywords === 'function'
        ? window.dedupeKeywords(next)
        : next.filter(Boolean);
    setStockKeywords(clean);
    if (urlParams.code && typeof window.persistStockKeywordsToStorage === 'function') {
      window.persistStockKeywordsToStorage(urlParams.code, clean);
    }
    return clean;
  }, [urlParams.code]);

  const hasStockContext = !!(urlParams.code || urlParams.name);

  const refreshPinnedKeywords = React.useCallback(function () {
    if (typeof window.getPinnedKeywords === 'function') {
      setPinnedKeywords(window.getPinnedKeywords());
    }
  }, []);

  const selectKeyword = function (kw) {
    setActiveKeyword(kw);
  };

  const addKeyword = function () {
    var kw = String(newKeywordInput || '').trim();
    if (!kw) return;
    if (typeof window.showPinnedKeyword === 'function') {
      window.showPinnedKeyword(kw);
    }
    setExcludedAutoKeywords(function (prev) {
      return prev.filter(function (k) {
        return String(k).toLowerCase() !== kw.toLowerCase();
      });
    });
    if (hasStockContext) {
      if (stockKeywords.some(function (k) {
        return String(k).toLowerCase() === kw.toLowerCase();
      })) {
        setActiveKeyword(kw);
        setNewKeywordInput('');
        return;
      }
      persistStockKeywords(stockKeywords.concat([kw]));
      setNewKeywordInput('');
      setActiveKeyword(kw);
      return;
    }
    if (
      pinnedKeywords.some(function (k) {
        return String(k).toLowerCase() === kw.toLowerCase();
      })
    ) {
      refreshPinnedKeywords();
      setNewKeywordInput('');
      setActiveKeyword(kw);
      return;
    }
    var nextPinned = pinnedKeywords.concat([kw]);
    setPinnedKeywords(nextPinned);
    if (typeof window.saveExtraPinnedKeywords === 'function') {
      window.saveExtraPinnedKeywords(nextPinned);
    }
    refreshPinnedKeywords();
    setNewKeywordInput('');
    setActiveKeyword(kw);
  };

  const removeKeyword = function (chip) {
    if (!chip || !chip.kw) return;
    var kw = chip.kw;
    if (chip.kind === 'stock') {
      var next = persistStockKeywords(stockKeywords.filter(function (k) {
        return k !== kw;
      }));
      if (activeKeyword === kw) setActiveKeyword(next[0] || selectableKeywords.filter(function (k) { return k !== kw; })[0] || '');
      return;
    }
    if (chip.kind === 'auto') {
      setExcludedAutoKeywords(function (prev) {
        return prev.concat([kw]);
      });
      if (activeKeyword === kw) {
        setActiveKeyword(selectableKeywords.filter(function (k) { return k !== kw; })[0] || '');
      }
      return;
    }
    if (chip.kind === 'pinned') {
      if (chip.locked && typeof window.hidePinnedKeyword === 'function') {
        window.hidePinnedKeyword(kw);
        refreshPinnedKeywords();
      } else {
        var nextPin = pinnedKeywords.filter(function (k) {
          return k !== kw;
        });
        setPinnedKeywords(nextPin);
        if (typeof window.saveExtraPinnedKeywords === 'function') {
          window.saveExtraPinnedKeywords(nextPin);
        }
        refreshPinnedKeywords();
      }
      if (activeKeyword === kw) {
        setActiveKeyword(selectableKeywords.filter(function (k) { return k !== kw; })[0] || '');
      }
    }
  };

  const startEditKeyword = function (chip) {
    if (!chip || chip.kind === 'auto') return;
    setEditingKeyword(chip.kw);
    setEditingValue(chip.kw);
    setEditingKind(chip.kind);
  };

  const commitEditKeyword = function () {
    var oldKw = editingKeyword;
    var kind = editingKind;
    var newKw = String(editingValue || '').trim();
    setEditingKeyword(null);
    setEditingValue('');
    setEditingKind('');
    if (!oldKw || !newKw || oldKw === newKw) return;
    if (kind === 'stock') {
      var nextStock = stockKeywords.map(function (k) {
        return k === oldKw ? newKw : k;
      });
      persistStockKeywords(nextStock);
      if (activeKeyword === oldKw) setActiveKeyword(newKw);
      return;
    }
    if (kind === 'pinned' && !((window.LOCKED_PINNED_KEYWORDS || []).indexOf(oldKw) >= 0)) {
      var nextPin = pinnedKeywords.map(function (k) {
        return k === oldKw ? newKw : k;
      });
      setPinnedKeywords(nextPin);
      if (typeof window.saveExtraPinnedKeywords === 'function') {
        window.saveExtraPinnedKeywords(nextPin);
      }
      refreshPinnedKeywords();
      if (activeKeyword === oldKw) setActiveKeyword(newKw);
    }
  };

  const refreshAll = function () {
    if (activeKeyword) {
      loadRecommended(activeKeyword);
      loadRss(activeKeyword);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-3 py-4 md:px-6 md:py-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-slate-50 md:text-2xl">
              新闻中心
              {hasStockContext && (
                <span className="ml-2 text-base font-semibold text-slate-400 md:text-lg">
                  · {urlParams.code}
                  {urlParams.name ? ' ' + urlParams.name : ''}
                </span>
              )}
            </h1>
            <p className="mt-1 text-xs text-slate-400 md:text-sm">
              上方 GNews 推荐 · 下方 RSS 订阅
              {meta.gnewsEnabled ? (
                <span className="ml-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
                  GNews 已启用
                </span>
              ) : (
                <span className="ml-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-100">
                  GNews 未配置
                </span>
              )}
              {meta.usedFallback && (
                <span className="ml-2 text-amber-300">（API 失败，已回退浏览器 RSS）</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="index.html" className="btn btn-secondary btn-sm gap-1">
              <span className="icon-home"></span>
              首页
            </a>
            <button type="button" onClick={refreshAll} className="btn btn-primary btn-sm">
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
              推荐新闻
            </h2>
            <span className="text-xs text-slate-400">
              当前关键词「{activeKeyword || '—'}」· 单关键词最多 20 条 · 近 72 小时
            </span>
          </div>

          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            关键词（点击切换 · 可添加 / 删除 / 编辑）
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {keywordChips.map(function (chip) {
              var editing = editingKeyword === chip.kw;
              if (editing) {
                return (
                  <span key={chip.kind + '-' + chip.kw} className="inline-flex items-center gap-1">
                    <input
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEditKeyword();
                        if (e.key === 'Escape') {
                          setEditingKeyword(null);
                          setEditingValue('');
                          setEditingKind('');
                        }
                      }}
                      onBlur={commitEditKeyword}
                      className="h-7 w-24 rounded-lg border border-cyan-400/40 bg-slate-950/60 px-2 text-xs text-slate-100 outline-none"
                    />
                  </span>
                );
              }
              var tone =
                chip.kind === 'stock'
                  ? 'cyan'
                  : chip.locked
                    ? 'amber'
                    : 'slate';
              return (
                <KeywordChip
                  key={chip.kind + '-' + chip.kw}
                  kw={chip.kw}
                  active={activeKeyword === chip.kw}
                  tone={tone}
                  locked={chip.locked}
                  editable={chip.kind !== 'auto'}
                  onSelect={() => selectKeyword(chip.kw)}
                  onRemove={() => removeKeyword(chip)}
                  onEdit={chip.kind !== 'auto' ? () => startEditKeyword(chip) : null}
                />
              );
            })}
            <div className="flex items-center gap-1">
              <input
                value={newKeywordInput}
                onChange={(e) => setNewKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addKeyword();
                }}
                placeholder="添加关键词"
                className="h-8 w-28 rounded-lg border border-white/15 bg-slate-950/50 px-2 text-xs text-slate-100 outline-none focus:border-cyan-400/50"
              />
              <button type="button" onClick={addKeyword} className="btn btn-secondary btn-sm" title="添加关键词">
                <span className="icon-plus text-xs"></span>
              </button>
            </div>
          </div>

          {isLoadingRecommended ? (
            <div className="flex justify-center py-10">
              <div className="icon-loader animate-spin text-2xl text-cyan-300"></div>
            </div>
          ) : recommendedNews.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              {activeKeyword ? '暂无「' + activeKeyword + '」相关推荐' : '请选择关键词'}
            </p>
          ) : (
            <div className="space-y-2">
              {recommendedNews.map(function (news, idx) {
                return <HeadlineNewsRow key={'rec-' + idx} news={news} rank={idx + 1} />;
              })}
            </div>
          )}
        </section>

        <section className="card p-4 md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-50">
              <span className="icon-rss text-emerald-300"></span>
              RSS 订阅
            </h2>
            <span className="text-xs text-slate-400">
              {activeKeyword ? '已按「' + activeKeyword + '」过滤' : '最新财经 RSS'} · 近 72 小时
            </span>
          </div>
          {isLoadingRss ? (
            <div className="flex justify-center py-8">
              <div className="icon-loader animate-spin text-2xl text-emerald-300"></div>
            </div>
          ) : rssNews.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">暂无 RSS 新闻</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {rssNews.map(function (news, idx) {
                return <NewsCard key={'rss-' + idx} news={news} />;
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function KeywordChip({ kw, active, tone, locked, editable, onSelect, onRemove, onEdit }) {
  var toneClass =
    tone === 'cyan'
      ? active
        ? 'border-cyan-300/60 bg-cyan-400/20 text-cyan-50 ring-1 ring-cyan-300/40'
        : 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100'
      : tone === 'amber'
        ? active
          ? 'border-amber-300/60 bg-amber-400/20 text-amber-50 ring-1 ring-amber-300/40'
          : 'border-amber-300/30 bg-amber-400/10 text-amber-100'
        : active
          ? 'border-white/30 bg-white/[0.14] text-slate-50 ring-1 ring-white/20'
          : 'border-white/15 bg-white/[0.08] text-slate-200';
  return (
    <span className={'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ' + toneClass}>
      <button type="button" onClick={onSelect} className="inline-flex items-center gap-1">
        {locked && <span className="icon-lock text-[10px] opacity-80"></span>}
        {kw}
      </button>
      {editable && onEdit && (
        <button type="button" onClick={onEdit} className="opacity-60 hover:opacity-100" title="编辑关键词">
          <span className="icon-pencil text-[10px]"></span>
        </button>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} className="opacity-70 hover:opacity-100">
          <span className="icon-x text-[10px]"></span>
        </button>
      )}
    </span>
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
