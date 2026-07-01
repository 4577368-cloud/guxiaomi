function PortfolioQueue({ portfolio, capitalPool, summary, isRefreshing, onAddStock, onRefreshAll, onQuickAddStock, onDeleteStock, onUpdateStock }) {
  try {
    const [sortKey, setSortKey] = React.useState('default');
    const [refreshingId, setRefreshingId] = React.useState(null);
    const [openMenuId, setOpenMenuId] = React.useState(null);
    const menuRootRef = React.useRef(null);
    const safePortfolio = Array.isArray(portfolio) ? portfolio : [];

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

    const totalCapitalHKD =
      Number(capitalPool?.usd || 0) * 7.78 +
      Number(capitalPool?.hkd || 0) +
      Number(capitalPool?.cny || 0);
    const safeSummary = summary && typeof summary === 'object'
      ? summary
      : { totalValue: 0, totalProfit: 0, totalProfitPercent: 0, stockCount: safePortfolio.length };
    const totalProfit = Number(safeSummary.totalProfit) || 0;
    const profitPositive = totalProfit >= 0;
    const investedValue = Number(safeSummary.totalValue) || 0;
    const investedPct = totalCapitalHKD > 0 ? (investedValue / totalCapitalHKD) * 100 : 0;

    const rows = safePortfolio.map((stock, idx) => {
      const analysis = calculateStockAnalysis(stock, stock.brokerChannel || 'futu');
      const currentPrice = Number(stock.currentPrice) || Number(stock.marketData?.price) || 0;
      const changePctRaw = Number(stock.marketData?.changePercent);
      const changePct = Number.isFinite(changePctRaw)
        ? changePctRaw
        : Number(analysis.dailyProfitPercent) || 0;
      const currentValueHKD = stock.market === 'US'
        ? analysis.currentValue * 7.78
        : analysis.currentValue;
      const allocation = totalCapitalHKD > 0 ? (currentValueHKD / totalCapitalHKD) * 100 : 0;
      const marketLabel = stock.market === 'US' ? '美股' : stock.market === 'HK' ? '港股' : 'A股';
      const currency = stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : 'HK$';
      const activePositions = Array.isArray(stock.positions)
        ? stock.positions.filter((pos) => pos && pos.enabled !== false && Number(pos.shares) > 0)
        : [];
      const totalShares = activePositions.reduce((sum, pos) => sum + (Number(pos.shares) || 0), 0);
      const avgCost = totalShares > 0
        ? activePositions.reduce((sum, pos) => sum + (Number(pos.price) || 0) * (Number(pos.shares) || 0), 0) / totalShares
        : 0;
      const returnPath = typeof window !== 'undefined'
        ? `${window.location.pathname.split('/').pop() || 'index.html'}${window.location.search || ''}${window.location.hash || ''}`
        : 'index.html';
      const fromParam = `&from=${encodeURIComponent(returnPath)}`;
      const detailUrl = `stock-detail.html?code=${encodeURIComponent(stock.symbol)}&market=${encodeURIComponent(marketLabel)}${stock.name ? '&name=' + encodeURIComponent(stock.name) : ''}`;
      const analysisUrl = `analysis.html?code=${encodeURIComponent(stock.symbol)}&market=${encodeURIComponent(marketLabel)}${stock.name ? '&name=' + encodeURIComponent(stock.name) : ''}${fromParam}`;
      return {
        idx,
        stock,
        analysis,
        currentPrice,
        changePct,
        allocation,
        activePositions,
        totalShares,
        avgCost,
        marketLabel,
        currency,
        detailUrl,
        analysisUrl,
      };
    });

    const sortedRows = rows.slice().sort((a, b) => {
      if (sortKey === 'move') return Math.abs(b.changePct) - Math.abs(a.changePct);
      if (sortKey === 'profit') return b.analysis.profit - a.analysis.profit;
      if (sortKey === 'allocation') return b.allocation - a.allocation;
      return a.idx - b.idx;
    });

    const handleRefreshOne = async (row) => {
      if (!row || !row.stock || !onUpdateStock || typeof getStockPrice !== 'function') return;
      setRefreshingId(row.stock.id);
      try {
        const priceData = await getStockPrice(row.stock.symbol, row.stock.market);
        if (!priceData) return;
        const updatedStock = {
          ...row.stock,
          currentPrice: priceData.price,
          marketData: priceData,
        };
        if (typeof updateStockPriceHistory === 'function') {
          try {
            const nextHistory = updateStockPriceHistory(
              updatedStock,
              priceData.price,
              priceData.previousClose,
            );
            updatedStock.priceHistory = nextHistory;
            if (typeof saveStockPriceHistory === 'function') {
              saveStockPriceHistory(updatedStock.symbol, updatedStock.market, nextHistory);
            }
          } catch (historyError) {
            console.warn('更新摘要队列价格历史失败:', historyError);
          }
        }
        onUpdateStock(row.stock.id, updatedStock);
      } catch (error) {
        console.error('刷新单只股票失败:', error);
      } finally {
        setRefreshingId(null);
      }
    };

    const totalDailyProfit = todayProfitForRows(sortedRows);

    return (
      <section className="card mb-4 p-4" id="portfolio-queue" data-name="portfolio-queue" data-file="components/PortfolioQueue.js">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3 px-1">
          <div>
            <h2 className="font-display flex items-center gap-2 text-sm font-bold text-slate-100 md:text-base">
              <div className="icon-list-filter text-cyan-400"></div>
              组合持仓列表
              <span className="text-xs font-normal text-slate-400">({safePortfolio.length})</span>
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              摘要、明细和操作入口合并到这一张列表卡片；单只股票深度信息进入详情页。
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onAddStock}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-cyan-300/20 bg-cyan-400/20 px-3 text-sm font-bold text-cyan-50 shadow-sm shadow-cyan-950/20 transition-colors hover:bg-cyan-400/30"
              >
                <div className="icon-plus text-sm"></div>
                新增
              </button>
              <button
                type="button"
                onClick={onRefreshAll}
                disabled={!safePortfolio.length || isRefreshing}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.09] px-3 text-sm font-bold text-slate-100 shadow-sm shadow-slate-950/20 transition-colors hover:bg-white/[0.14] disabled:opacity-50"
              >
                <div className={`icon-refresh-cw text-sm ${isRefreshing ? 'animate-spin' : ''}`}></div>
                {isRefreshing ? '刷新中' : '刷新'}
              </button>
            </div>
          </div>
        </div>

        <div className="mb-2 flex flex-wrap gap-1.5 px-1">
          {[
            ['default', '默认'],
            ['move', '今日异动'],
            ['profit', '总盈亏'],
            ['allocation', '仓位'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setOpenMenuId(null);
                setSortKey(key);
              }}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                sortKey === key
                  ? 'bg-cyan-400/18 text-cyan-100'
                  : 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.10] hover:text-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-xl">
          {sortedRows.map((row) => {
            const profitPositive = row.analysis.profit >= 0;
            const movePositive = row.changePct >= 0;
            return (
              <div
                key={row.stock.id || `${row.stock.market}_${row.stock.symbol}`}
                id={row.stock.id ? `portfolio-row-${row.stock.id}` : undefined}
                className={`relative grid gap-x-4 gap-y-2 border-t border-white/[0.07] px-2 py-2.5 transition-colors first:border-t-0 hover:bg-white/[0.055] md:px-3 lg:grid-cols-12 lg:items-center xl:gap-x-5 ${
                  openMenuId === row.stock.id ? 'z-30' : 'z-0'
                }`}
              >
                <div className="min-w-0 lg:col-span-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={row.detailUrl} className="text-sm font-black text-slate-50 hover:text-cyan-200 md:text-base">
                      {row.stock.symbol}
                    </a>
                    <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                      {row.marketLabel}
                    </span>
                  </div>
                  {row.stock.name && row.stock.name !== row.stock.symbol && (
                    <div className="truncate text-xs text-slate-400">{row.stock.name}</div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm md:grid-cols-7 md:gap-x-5 lg:col-span-8 xl:gap-x-6">
                  <QueueMetric label={`当前（${row.currency}）`} value={formatPrice(row.currentPrice, row.stock.market === 'US' ? 3 : 2)} />
                  <QueueMetric label={`均价（${row.currency}）`} value={row.avgCost > 0 ? formatPrice(row.avgCost, row.stock.market === 'US' ? 3 : 2) : '待补充'} />
                  <QueueMetric label="股数" value={row.totalShares > 0 ? row.totalShares.toLocaleString() : '0'} />
                  <QueueMetric
                    label="今日"
                    value={`${movePositive ? '+' : ''}${row.changePct.toFixed(2)}%`}
                    valueClass={movePositive ? 'text-emerald-300' : 'text-rose-300'}
                  />
                  <QueueMetric
                    label={`持仓盈亏（${row.currency}）`}
                    value={`${profitPositive ? '+' : ''}${formatPrice(row.analysis.profit, 0)}`}
                    valueClass={profitPositive ? 'text-emerald-300' : 'text-rose-300'}
                  />
                  <QueueMetric
                    label="盈亏比例"
                    value={`${profitPositive ? '+' : ''}${(Number(row.analysis.profitPercent) || 0).toFixed(2)}%`}
                    valueClass={profitPositive ? 'text-emerald-300' : 'text-rose-300'}
                  />
                  <QueueMetric label="仓位" value={`${row.allocation.toFixed(1)}%`} />
                </div>

                <div
                  ref={openMenuId === row.stock.id ? menuRootRef : null}
                  className="relative flex justify-start gap-1 lg:col-span-2 lg:justify-end"
                >
                  <a href={row.detailUrl} className="inline-flex h-8 min-w-[3.4rem] items-center justify-center rounded-xl border border-white/10 bg-white/[0.08] px-3 text-xs font-bold text-slate-100 transition-colors hover:bg-white/[0.14]">详情</a>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.GuxiaomiChatDiagnosis) window.GuxiaomiChatDiagnosis.openFromHoldingRow(row);
                    }}
                    title="AI 诊断"
                    className="inline-flex h-8 min-w-[3.4rem] items-center justify-center rounded-xl border border-white/10 bg-white/[0.08] px-3 text-xs font-bold text-slate-100 transition-colors hover:bg-white/[0.14]"
                  >
                    AI
                  </button>
                  <a href={row.analysisUrl} className="inline-flex h-8 min-w-[3.4rem] items-center justify-center rounded-xl border border-white/10 bg-white/[0.08] px-3 text-xs font-bold text-cyan-100 transition-colors hover:bg-white/[0.14]">分析</a>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === row.stock.id ? null : row.stock.id);
                    }}
                    className="inline-flex h-8 min-w-[3.4rem] items-center justify-center rounded-xl border border-white/10 bg-white/[0.08] px-3 text-xs font-bold text-slate-100 transition-colors hover:bg-white/[0.14]"
                    aria-expanded={openMenuId === row.stock.id}
                  >
                    更多
                  </button>
                  {openMenuId === row.stock.id && (
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
                        disabled={refreshingId === row.stock.id}
                        className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/[0.08] disabled:opacity-50"
                      >
                        {refreshingId === row.stock.id ? '刷新中' : '刷新'}
                      </button>
                      {onQuickAddStock && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            onQuickAddStock(row.stock.id);
                          }}
                          className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/[0.08]"
                        >
                          加仓
                        </button>
                      )}
                      {onDeleteStock && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            if (window.confirm(`确定删除 ${row.stock.symbol} 吗？`)) onDeleteStock(row.stock.id);
                          }}
                          className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-lime-200 hover:bg-lime-400/10"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div className="grid gap-x-4 gap-y-2 border-t border-white/[0.10] bg-slate-950/18 px-2 py-3 md:px-3 lg:grid-cols-12 lg:items-center xl:gap-x-5">
            <div className="min-w-0 lg:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-black text-slate-50 md:text-base">总计</span>
                <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                  {safePortfolio.length} 只
                </span>
              </div>
              <div className="truncate text-xs text-slate-400">组合持仓汇总</div>
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm md:grid-cols-7 md:gap-x-5 lg:col-span-8 xl:gap-x-6">
              <QueueMetric label="当前市值（HK$）" value={formatPrice(investedValue, 0)} />
              <QueueMetric label="总投入（HK$）" value={formatPrice(Number(safeSummary.totalCost) || 0, 0)} />
              <QueueMetric label="股票数" value={`${safePortfolio.length}`} />
              <QueueMetric
                label="今日（HK$）"
                value={`${totalDailyProfit >= 0 ? '+' : ''}${formatPrice(totalDailyProfit, 0)}`}
                valueClass={totalDailyProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}
              />
              <QueueMetric
                label="持仓盈亏（HK$）"
                value={`${profitPositive ? '+' : ''}${formatPrice(totalProfit, 0)}`}
                valueClass={profitPositive ? 'text-emerald-300' : 'text-rose-300'}
              />
              <QueueMetric
                label="盈亏比例"
                value={`${(Number(safeSummary.totalProfitPercent) || 0) >= 0 ? '+' : ''}${(Number(safeSummary.totalProfitPercent) || 0).toFixed(2)}%`}
                valueClass={profitPositive ? 'text-emerald-300' : 'text-rose-300'}
              />
              <QueueMetric label="仓位" value={`${investedPct.toFixed(1)}%`} />
            </div>
            <div className="hidden lg:col-span-2 lg:block"></div>
          </div>
        </div>
      </section>
    );
  } catch (error) {
    console.error('PortfolioQueue component error:', error);
    return null;
  }
}

function QueueMetric({ label, value, valueClass, hint }) {
  return (
    <div className="min-w-[4.6rem]">
      <div className="truncate text-[10px] font-semibold leading-none text-slate-400">{label}</div>
      <div className={`gx-num mt-1 whitespace-nowrap text-xs font-bold leading-tight tabular-nums md:text-sm ${valueClass || 'text-slate-100'}`}>{value}</div>
      {hint && <div className={`gx-num mt-0.5 truncate text-[10px] font-semibold leading-none tabular-nums ${valueClass || 'text-slate-400'}`}>{hint}</div>}
    </div>
  );
}

function todayProfitForRows(rows) {
  return (rows || []).reduce((sum, row) => {
    const amount = Number(row.analysis?.dailyProfitLoss) || 0;
    return sum + (row.stock?.market === 'US' ? amount * 7.78 : amount);
  }, 0);
}
