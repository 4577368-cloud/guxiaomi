function WatchlistMetric({ label, value, valueClass, hint }) {
  return (
    <div className="min-w-[4.6rem]">
      <div className="truncate text-[10px] font-semibold leading-none text-slate-400">{label}</div>
      <div className={`gx-num mt-1 whitespace-nowrap text-xs font-bold leading-tight tabular-nums md:text-sm ${valueClass || 'text-slate-100'}`}>{value}</div>
      {hint && <div className={`gx-num mt-0.5 truncate text-[10px] font-semibold leading-none tabular-nums ${valueClass || 'text-slate-400'}`}>{hint}</div>}
    </div>
  );
}

function WatchlistSection({ watchlist, onRemoveItem, onRefreshItem, onAddPosition, onRefreshAll }) {
  const [openMenuId, setOpenMenuId] = React.useState(null);
  const [refreshingId, setRefreshingId] = React.useState(null);
  const menuRootRef = React.useRef(null);
  const safeWatchlist = Array.isArray(watchlist) ? watchlist : [];

  React.useEffect(() => {
    if (!openMenuId) return undefined;
    const closeOnOutside = (event) => {
      if (menuRootRef.current && menuRootRef.current.contains(event.target)) return;
      setOpenMenuId(null);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenuId]);

  const rows = safeWatchlist.map((item, idx) => {
    const marketLabel = item.market === 'US' ? '美股' : item.market === 'HK' ? '港股' : 'A股';
    const currency = item.market === 'US' ? '$' : item.market === 'CN' ? '¥' : 'HK$';
    const currentPrice = Number(item.currentPrice) || Number(item.marketData?.price) || 0;
    const history = Array.isArray(item.priceHistory) ? item.priceHistory : [];
    const addedPrice = history.length > 0 && history[0]?.price > 0
      ? history[0].price
      : Number(item.addedPrice) || currentPrice || 0;
    const addedAt = item.addedAt;
    const daysWatched = addedAt
      ? Math.max(0, Math.floor((new Date() - new Date(addedAt)) / (1000 * 60 * 60 * 24)))
      : 0;
    const watchProfit = addedPrice > 0 ? currentPrice - addedPrice : 0;
    const watchProfitPercent = addedPrice > 0 ? (watchProfit / addedPrice) * 100 : 0;
    const watchProfitPositive = watchProfit >= 0;
    const changePct = Number(item.changePercent) || Number(item.marketData?.changePercent) || 0;
    const changePositive = changePct >= 0;
    const watchMarketValue = currentPrice;
    const detailUrl = `stock-detail.html?code=${encodeURIComponent(item.symbol)}&market=${encodeURIComponent(marketLabel)}${item.name ? '&name=' + encodeURIComponent(item.name) : ''}`;
    const analysisUrl = `analysis.html?code=${encodeURIComponent(item.symbol)}&market=${encodeURIComponent(marketLabel)}${item.name ? '&name=' + encodeURIComponent(item.name) : ''}`;
    return {
      idx,
      item,
      currentPrice,
      addedPrice,
      daysWatched,
      watchProfit,
      watchProfitPercent,
      watchProfitPositive,
      changePct,
      changePositive,
      watchMarketValue,
      marketLabel,
      currency,
      detailUrl,
      analysisUrl,
    };
  });

  const totalWatchValue = rows.reduce((sum, row) => sum + row.watchMarketValue, 0);
  const rowsWithAllocation = rows.map((row) => ({
    ...row,
    allocation: totalWatchValue > 0 ? (row.watchMarketValue / totalWatchValue) * 100 : 0,
  }));

  const handleRefreshOne = async (row) => {
    if (!row || !row.item || !onRefreshItem) return;
    setRefreshingId(row.item.id || `${row.item.market}_${row.item.symbol}`);
    try {
      await onRefreshItem(row.item);
    } catch (error) {
      console.error('刷新关注股票失败:', error);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleAddPosition = (row) => {
    if (!row || !row.item || !onAddPosition) return;
    setOpenMenuId(null);
    onAddPosition(row.item);
  };

  const handleRemove = (row) => {
    if (!row || !row.item || !onRemoveItem) return;
    setOpenMenuId(null);
    if (window.confirm(`确定从关注列表移除 ${row.item.symbol} 吗？`)) {
      onRemoveItem(row.item);
    }
  };

  if (safeWatchlist.length === 0) {
    return (
      <section className="card mb-4" id="watchlist-section" data-name="watchlist-section" data-file="components/WatchlistSection.js">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3 px-1">
          <div>
            <h2 className="font-display flex items-center gap-2 text-sm font-bold text-slate-100 md:text-base">
              <div className="icon-eye text-cyan-400"></div>
              关注列表
              <span className="text-xs font-normal text-slate-400">(0)</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-400 md:text-sm">
              关注感兴趣的股票，实时监控价格变动。
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
          <div className="icon-eye-off text-slate-500 text-3xl mx-auto mb-2"></div>
          <p className="text-slate-400 text-sm">暂无关注股票</p>
          <p className="text-slate-500 text-xs mt-1">点击右上角「新增」添加关注，或在分析页点击「+监控」</p>
        </div>
      </section>
    );
  }

  return (
    <section className="card mb-4" id="watchlist-section" data-name="watchlist-section" data-file="components/WatchlistSection.js">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3 px-1">
        <div>
          <h2 className="font-display flex items-center gap-2 text-sm font-bold text-slate-100 md:text-base">
            <div className="icon-eye text-cyan-400"></div>
            关注列表
            <span className="text-xs font-normal text-slate-400">({safeWatchlist.length})</span>
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-400">
            关注股票的摘要、明细和操作入口，单只深度信息进入详情页。
          </p>
        </div>
        <button
          type="button"
          onClick={onRefreshAll}
          className="btn btn-secondary nav-chip gap-1 disabled:opacity-50"
        >
          <div className="icon-refresh-cw"></div>
          刷新
        </button>
      </div>

      <div className="rounded-xl">
        {rowsWithAllocation.map((row, idx) => {
          const id = row.item.id || `${row.item.market}_${row.item.symbol}`;
          return (
            <div
              key={id}
              className={`relative grid gap-x-4 gap-y-2 border-t border-white/[0.07] px-2 py-2.5 transition-colors first:border-t-0 hover:bg-cyan-500/[0.08] md:px-3 lg:grid-cols-12 lg:items-center xl:gap-x-5 ${
                idx % 2 === 1 ? 'bg-white/[0.025]' : ''
              } ${openMenuId === id ? 'z-30' : 'z-0'}`}
            >
              <div className="min-w-0 lg:col-span-2">
                <div className="flex flex-wrap items-center gap-2">
                  <a href={row.detailUrl} className="text-sm font-black text-slate-50 hover:text-cyan-200 md:text-base">
                    {row.item.symbol}
                  </a>
                  <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                    {row.marketLabel}
                  </span>
                </div>
                {row.item.name && row.item.name !== row.item.symbol && (
                  <div className="truncate text-xs text-slate-400">{row.item.name}</div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm md:grid-cols-7 md:gap-x-5 lg:col-span-8 xl:gap-x-6">
                <WatchlistMetric label={`当前（${row.currency}）`} value={row.currentPrice > 0 ? formatPrice(row.currentPrice, row.item.market === 'US' ? 3 : 2) : '—'} />
                <WatchlistMetric
                  label={`关注时价（${row.currency}）`}
                  value={row.addedPrice > 0 ? formatPrice(row.addedPrice, row.item.market === 'US' ? 3 : 2) : '—'}
                />
                <WatchlistMetric label="关注天数" value={`${row.daysWatched}天`} />
                <WatchlistMetric
                  label="今日"
                  value={`${row.changePositive ? '+' : ''}${row.changePct.toFixed(2)}%`}
                  valueClass={row.changePositive ? 'text-emerald-300' : 'text-rose-300'}
                />
                <WatchlistMetric
                  label={`关注盈亏（${row.currency}）`}
                  value={`${row.watchProfitPositive ? '+' : ''}${formatPrice(row.watchProfit, 0)}`}
                  valueClass={row.watchProfitPositive ? 'text-emerald-300' : 'text-rose-300'}
                />
                <WatchlistMetric
                  label="盈亏比例"
                  value={`${row.watchProfitPositive ? '+' : ''}${row.watchProfitPercent.toFixed(2)}%`}
                  valueClass={row.watchProfitPositive ? 'text-emerald-300' : 'text-rose-300'}
                />
                <WatchlistMetric label="仓位" value={`${row.allocation.toFixed(1)}%`} />
              </div>

              <div
                ref={openMenuId === id ? menuRootRef : null}
                className="relative flex justify-start gap-1 lg:col-span-2 lg:justify-end"
              >
                <a href={row.detailUrl} className="btn btn-secondary btn-sm min-w-[3.4rem]">详情</a>
                <button
                  type="button"
                  onClick={() => {
                    if (window.GuxiaomiChatDiagnosis) window.GuxiaomiChatDiagnosis.openFromWatchlistRow(row);
                  }}
                  title="AI 诊断"
                  className="btn btn-secondary btn-sm min-w-[3.4rem]"
                >
                  AI
                </button>
                <a href={row.analysisUrl} className="btn btn-secondary btn-sm min-w-[3.4rem] text-cyan-100">分析</a>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(openMenuId === id ? null : id);
                  }}
                  className="btn btn-secondary btn-sm min-w-[3.4rem]"
                  aria-expanded={openMenuId === id}
                >
                  更多
                </button>
                {openMenuId === id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-7 z-50 w-32 overflow-hidden rounded-xl border border-white/15 bg-slate-950/95 p-1 shadow-2xl shadow-black/40 backdrop-blur-xl"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenuId(null);
                        handleRefreshOne(row);
                      }}
                      disabled={refreshingId === id}
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/[0.08] disabled:opacity-50"
                    >
                      {refreshingId === id ? '刷新中' : '刷新'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddPosition(row)}
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/[0.08]"
                    >
                      买入
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(row)}
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-lime-200 hover:bg-lime-400/10"
                    >
                      移除
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

window.WatchlistSection = WatchlistSection;