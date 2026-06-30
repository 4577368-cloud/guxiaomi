// 关注列表：每只股票一行，展示关注后表现、关键行情与价格走势。
function WatchSparkline({ history, currentPrice, isPositive }) {
  const rows = React.useMemo(() => {
    const list = (Array.isArray(history) ? history : [])
      .filter((row) => row && Number.isFinite(Number(row.price)))
      .slice(-30);
    if (list.length > 0) return list;
    return Number(currentPrice) > 0
      ? [{ date: new Date().toISOString().slice(0, 10), price: Number(currentPrice) }]
      : [];
  }, [history, currentPrice]);

  if (!rows.length) {
    return (
      <div className="flex h-16 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xs text-slate-400">
        暂无走势
      </div>
    );
  }

  const prices = rows.map((row) => Number(row.price)).filter((n) => Number.isFinite(n));
  const min = Math.min.apply(null, prices);
  const max = Math.max.apply(null, prices);
  const range = Math.max(max - min, Math.abs(max) * 0.001, 0.001);
  const width = 220;
  const height = 62;
  const points = rows.map((row, idx) => {
    const x = rows.length === 1 ? width - 6 : (idx / (rows.length - 1)) * (width - 12) + 6;
    const y = height - 8 - ((Number(row.price) - min) / range) * (height - 16);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const first = prices[0];
  const last = prices[prices.length - 1];
  const pct = first > 0 ? ((last - first) / first) * 100 : 0;
  const stroke = isPositive ? '#34d399' : '#fca5a5';
  const fill = isPositive ? 'rgba(52, 211, 153, 0.16)' : 'rgba(252, 165, 165, 0.12)';

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full" preserveAspectRatio="none" aria-label="价格走势">
        <polyline
          points={`6,${height - 8} ${points} ${width - 6},${height - 8}`}
          fill={fill}
          stroke="none"
        />
        <polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>{rows.length > 1 ? `近${rows.length}点` : '当前点'}</span>
        <span className={pct >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

function daysSince(dateStr) {
  const start = new Date(dateStr || Date.now());
  if (Number.isNaN(start.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today - start) / (24 * 60 * 60 * 1000)));
}

function marketDisplay(market) {
  if (market === 'US') return '美股';
  if (market === 'HK') return '港股';
  if (market === 'CN') return 'A股';
  return market || '—';
}

function currencySymbolFor(market) {
  if (market === 'US') return '$';
  if (market === 'CN') return '¥';
  return 'HK$';
}

function formatWatchMoney(value, market, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return currencySymbolFor(market) + formatPrice(n, decimals);
}

function WatchMetric({ label, value, valueClass }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">
      <div className="mb-0.5 text-[11px] text-slate-400">{label}</div>
      <div className={`gx-num text-sm font-semibold tabular-nums ${valueClass || 'text-slate-100'}`}>{value}</div>
    </div>
  );
}

function WatchlistCard({ item, onRemove, onRefresh, onAddPosition }) {
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isRemoving, setIsRemoving] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh(item);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRemove = () => {
    setIsRemoving(true);
    onRemove(item);
  };

  const marketColors = {
    US: 'bg-blue-500/20 text-blue-300 border-blue-400/30',
    HK: 'bg-orange-500/20 text-orange-300 border-orange-400/30',
    CN: 'bg-red-500/20 text-red-300 border-red-400/30',
  };
  const history = Array.isArray(item.priceHistory) && item.priceHistory.length > 0
    ? item.priceHistory
    : (window.loadStockPriceHistory ? window.loadStockPriceHistory(item.symbol, item.market) : []);
  const md = item.marketData || {};
  const current = Number(item.currentPrice) || Number(md.price) || 0;
  const previousClose = Number(item.previousClose) || Number(md.previousClose) || 0;
  const change = Number(item.change);
  const effectiveChange = Number.isFinite(change)
    ? change
    : (previousClose > 0 && current > 0 ? current - previousClose : 0);
  const changePercent = Number(item.changePercent);
  const effectiveChangePercent = Number.isFinite(changePercent)
    ? changePercent
    : (previousClose > 0 ? (effectiveChange / previousClose) * 100 : 0);
  const isPositive = effectiveChange >= 0;
  const watchStartPrice =
    Number(item.watchStartPrice) ||
    (history.length > 0 ? Number(history[0].price) : 0) ||
    previousClose ||
    current;
  const watchGain = current > 0 && watchStartPrice > 0 ? current - watchStartPrice : 0;
  const watchGainPct = watchStartPrice > 0 ? (watchGain / watchStartPrice) * 100 : 0;
  const watchedDays = daysSince(item.addedAt);
  const open = Number(md.open);
  const high = Number(md.high);
  const low = Number(md.low);
  const volume = Number(md.volume);
  const marketStr = marketDisplay(item.market);
  const returnPath = typeof window !== 'undefined'
    ? `${window.location.pathname.split('/').pop() || 'index.html'}${window.location.search || ''}${window.location.hash || ''}`
    : 'index.html';
  const fromParam = '&from=' + encodeURIComponent(returnPath);
  const detailUrl = 'stock-detail.html?code=' + encodeURIComponent(item.symbol) + '&market=' + encodeURIComponent(marketStr) + (item.name ? '&name=' + encodeURIComponent(item.name) : '');
  const newsUrl = 'news.html?code=' + encodeURIComponent(item.symbol) + '&market=' + encodeURIComponent(marketStr) + (item.name ? '&name=' + encodeURIComponent(item.name) : '') + fromParam;
  const analysisUrl = 'analysis.html?code=' + encodeURIComponent(item.symbol) + '&market=' + encodeURIComponent(marketStr) + (item.name ? '&name=' + encodeURIComponent(item.name) : '') + fromParam;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2.5 shadow-lg transition-all hover:border-white/20 hover:bg-white/[0.08]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-[8rem] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-slate-50">{item.symbol}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${marketColors[item.market] || 'bg-slate-500/20 text-slate-300 border-slate-400/30'}`}>
              {marketStr}
            </span>
            <span className="rounded-lg bg-white/[0.06] px-2 py-0.5 text-xs text-slate-400">关注 {watchedDays} 天</span>
          </div>
          {item.name && item.name !== item.symbol && (
            <div className="truncate text-xs text-slate-400">{item.name}</div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <div>
            <span className="text-xs text-slate-400">当前 </span>
            <span className="gx-num font-bold text-amber-200 tabular-nums">
              {current > 0 ? formatWatchMoney(current, item.market, item.market === 'US' ? 3 : 2) : '—'}
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-400">今日 </span>
            <span className={`gx-num font-semibold tabular-nums ${isPositive ? 'text-emerald-300' : 'text-rose-300'}`}>
              {effectiveChange >= 0 ? '+' : ''}{formatWatchMoney(effectiveChange, item.market, item.market === 'US' ? 3 : 2)}
              <span className="ml-1">({effectiveChangePercent >= 0 ? '+' : ''}{effectiveChangePercent.toFixed(2)}%)</span>
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-400">关注后 </span>
            <span className={`gx-num font-semibold tabular-nums ${watchGain >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {watchGain >= 0 ? '+' : ''}{formatWatchMoney(watchGain, item.market, item.market === 'US' ? 3 : 2)}
              <span className="ml-1">({watchGainPct >= 0 ? '+' : ''}{watchGainPct.toFixed(2)}%)</span>
            </span>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
          <a href={detailUrl} className="inline-flex h-8 min-w-[3.6rem] items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.08] px-2.5 text-xs font-bold text-slate-100 transition-colors hover:bg-white/[0.14]">
            <div className="icon-layout-dashboard text-sm"></div>
            <span>详情</span>
          </a>
          <a href={analysisUrl} className="inline-flex h-8 min-w-[3.6rem] items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.08] px-2.5 text-xs font-bold text-cyan-100 transition-colors hover:bg-white/[0.14]">
            <div className="icon-bar-chart-2 text-sm"></div>
            <span>分析</span>
          </a>
          <a href={newsUrl} className="inline-flex h-8 min-w-[3.6rem] items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.08] px-2.5 text-xs font-bold text-pink-100 transition-colors hover:bg-white/[0.14]">
            <div className="icon-newspaper text-sm"></div>
            <span>新闻</span>
          </a>
          </div>
          <div className="h-6 w-px bg-white/10"></div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex h-8 min-w-[3.6rem] items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.08] px-2.5 text-xs font-bold text-slate-100 transition-colors hover:bg-white/[0.14] disabled:opacity-50 touch-manipulation"
            title="刷新价格"
          >
            <div className={`icon-refresh-cw text-sm ${isRefreshing ? 'animate-spin' : ''}`}></div>
            <span>{isRefreshing ? '刷新中' : '刷新'}</span>
          </button>
          {onAddPosition && (
            <button
              type="button"
              onClick={() => onAddPosition(item)}
              className="inline-flex h-8 min-w-[3.6rem] items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.08] px-2.5 text-xs font-bold text-blue-100 transition-colors hover:bg-white/[0.14] touch-manipulation"
              title="添加到持仓"
            >
              <div className="icon-plus text-sm"></div>
              <span>持仓</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleRemove}
            disabled={isRemoving}
            className="inline-flex h-8 min-w-[3.6rem] items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.08] px-2.5 text-xs font-bold text-lime-100 transition-colors hover:bg-white/[0.14] disabled:opacity-50 touch-manipulation"
            title="移出关注"
          >
            <div className="icon-x text-sm"></div>
            <span>移除</span>
          </button>
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="inline-flex h-8 min-w-[3.8rem] items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.08] px-2.5 text-xs font-bold text-slate-100 transition-colors hover:bg-white/[0.14] touch-manipulation"
            title={isExpanded ? '收起详情' : '展开详情'}
          >
            <div className={`icon-chevron-${isExpanded ? 'up' : 'down'} text-sm`}></div>
            <span>{isExpanded ? '收起' : '展开'}</span>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <WatchMetric label="开盘" value={Number.isFinite(open) && open > 0 ? formatWatchMoney(open, item.market, item.market === 'US' ? 3 : 2) : '—'} />
            <WatchMetric label="前收/收盘" value={previousClose > 0 ? formatWatchMoney(previousClose, item.market, item.market === 'US' ? 3 : 2) : '—'} />
            <WatchMetric label="最高" value={Number.isFinite(high) && high > 0 ? formatWatchMoney(high, item.market, item.market === 'US' ? 3 : 2) : '—'} valueClass="text-emerald-300" />
            <WatchMetric label="最低" value={Number.isFinite(low) && low > 0 ? formatWatchMoney(low, item.market, item.market === 'US' ? 3 : 2) : '—'} valueClass="text-rose-300" />
            <WatchMetric label="成交量" value={Number.isFinite(volume) && volume > 0 ? formatVolume(volume) : '—'} />
            <WatchMetric label="关注价" value={watchStartPrice > 0 ? formatWatchMoney(watchStartPrice, item.market, item.market === 'US' ? 3 : 2) : '—'} />
          </div>
          <div className="mt-3">
            <WatchSparkline history={history} currentPrice={current} isPositive={watchGain >= 0} />
          </div>
        </div>
      )}
    </div>
  );
}

function WatchlistSection({ watchlist, onRemoveItem, onRefreshItem, onAddPosition, onRefreshAll }) {
  const [isRefreshingAll, setIsRefreshingAll] = React.useState(false);

  const summary = React.useMemo(() => {
    const byMarket = {};
    let winners = 0;
    let losers = 0;
    let pctSum = 0;
    let pctCount = 0;

    (Array.isArray(watchlist) ? watchlist : []).forEach((item) => {
      const market = item.market || 'UNKNOWN';
      const history = Array.isArray(item.priceHistory) && item.priceHistory.length > 0
        ? item.priceHistory
        : (window.loadStockPriceHistory ? window.loadStockPriceHistory(item.symbol, item.market) : []);
      const current = Number(item.currentPrice) || Number(item.marketData && item.marketData.price) || 0;
      const start =
        Number(item.watchStartPrice) ||
        (history.length > 0 ? Number(history[0].price) : 0) ||
        Number(item.previousClose) ||
        current ||
        0;
      if (!byMarket[market]) byMarket[market] = { market, start: 0, current: 0, gain: 0, count: 0 };
      if (current > 0 && start > 0) {
        const gain = current - start;
        byMarket[market].start += start;
        byMarket[market].current += current;
        byMarket[market].gain += gain;
        byMarket[market].count += 1;
        pctSum += (gain / start) * 100;
        pctCount += 1;
        if (gain >= 0) winners += 1;
        else losers += 1;
      }
    });

    const rows = Object.values(byMarket).filter((row) => row.count > 0);
    const equalPct = pctCount > 0 ? pctSum / pctCount : 0;
    return { rows, equalPct, winners, losers, counted: pctCount };
  }, [watchlist]);

  if (!watchlist || watchlist.length === 0) {
    return null;
  }

  const handleRefreshAll = async () => {
    setIsRefreshingAll(true);
    try {
      await onRefreshAll();
    } finally {
      setIsRefreshingAll(false);
    }
  };

  return (
    <div className="card mb-4 p-4" data-name="watchlist-section" data-file="components/WatchlistSection.js">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display flex items-center gap-2 text-base font-bold text-slate-100 md:text-lg">
            <div className="icon-eye text-cyan-400"></div>
            关注列表
            <span className="text-xs font-normal text-slate-400">({watchlist.length})</span>
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            按“每只关注股票 1 股/1 手”估算关注后的整体涨跌；真正盈亏请看持仓区。
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefreshAll}
          disabled={isRefreshingAll}
          className="btn btn-sm btn-secondary flex items-center gap-1.5 touch-manipulation"
        >
          <div className={`icon-refresh-cw text-sm ${isRefreshingAll ? 'animate-spin' : ''}`}></div>
          <span>{isRefreshingAll ? '刷新中...' : '刷新全部'}</span>
        </button>
      </div>

      <div className="mb-4 grid gap-2 md:grid-cols-4">
        <WatchMetric label="已计入股票" value={`${summary.counted}/${watchlist.length} 只`} valueClass="text-slate-100" />
        <WatchMetric label="等权整体涨跌" value={`${summary.equalPct >= 0 ? '+' : ''}${summary.equalPct.toFixed(2)}%`} valueClass={summary.equalPct >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
        <WatchMetric label="上涨/下跌" value={`${summary.winners} / ${summary.losers}`} valueClass="text-slate-100" />
        <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">
          <div className="mb-0.5 text-[11px] text-slate-400">按市场涨跌额</div>
          <div className="space-y-0.5 text-xs">
            {summary.rows.length > 0 ? summary.rows.map((row) => {
              const pct = row.start > 0 ? (row.gain / row.start) * 100 : 0;
              return (
                <div key={row.market} className={row.gain >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  {marketDisplay(row.market)} {row.gain >= 0 ? '+' : ''}{formatWatchMoney(row.gain, row.market, row.market === 'US' ? 3 : 2)} ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)
                </div>
              );
            }) : <div className="text-slate-400">暂无可计算数据</div>}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {watchlist.map((item) => (
          <WatchlistCard
            key={item.id || `${item.market}_${item.symbol}`}
            item={item}
            onRemove={onRemoveItem}
            onRefresh={onRefreshItem}
            onAddPosition={onAddPosition}
          />
        ))}
      </div>
    </div>
  );
}

window.WatchlistCard = WatchlistCard;
window.WatchlistSection = WatchlistSection;
