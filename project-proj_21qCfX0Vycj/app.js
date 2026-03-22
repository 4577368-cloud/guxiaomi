/** localStorage / 云端反序列化后 positions 偶为 JSON 字符串 */
function coercePositionsArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

/** 同一市场下港股 03690 与 3690 视为同一标的，便于合并多笔持仓到一条卡片 */
function normalizePortfolioSymbol(symbol, market) {
  const s = String(symbol || '').trim();
  const m = String(market || '').toUpperCase();
  if (m === 'HK' && /^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? String(n).padStart(5, '0') : s.toUpperCase();
  }
  if (m === 'CN' && /^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? String(n).padStart(6, '0') : s.toUpperCase();
  }
  return s.toUpperCase();
}

function portfolioMergeKey(stock) {
  const m = String(stock.market || '').toUpperCase();
  return m + '::' + normalizePortfolioSymbol(stock.symbol, stock.market);
}

function mergePriceHistoryByDate(a, b) {
  const m = new Map();
  (Array.isArray(a) ? a : []).forEach((item) => {
    if (item && item.date) m.set(item.date, item);
  });
  (Array.isArray(b) ? b : []).forEach((item) => {
    if (item && item.date) m.set(item.date, item);
  });
  return Array.from(m.values())
    .slice()
    .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())
    .slice(-365);
}

/**
 * 若用户曾用「03690」「3690」各加过一次同一只股票，会得到两条 portfolio 记录；
 * 合并为一条并拼接 positions，持仓明细汇总才能看到全部分批。
 */
function mergeDuplicatePortfolioStocks(portfolio) {
  if (!Array.isArray(portfolio) || portfolio.length === 0) return { list: portfolio, changed: false };
  const map = new Map();
  for (const stock of portfolio) {
    if (!stock) continue;
    const positions = coercePositionsArray(stock.positions);
    const sym = normalizePortfolioSymbol(stock.symbol, stock.market);
    const key = portfolioMergeKey({ ...stock, symbol: sym });
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...stock, symbol: sym, positions: [...positions] });
    } else {
      const mergedPos = [...coercePositionsArray(existing.positions), ...positions];
      const nextPrice = Number(stock.currentPrice);
      const usePrice =
        Number.isFinite(nextPrice) && nextPrice > 0
          ? nextPrice
          : existing.currentPrice;
      map.set(key, {
        ...existing,
        id: existing.id,
        symbol: sym,
        positions: mergedPos,
        currentPrice: usePrice,
        priceHistory: mergePriceHistoryByDate(existing.priceHistory, stock.priceHistory),
        marketData:
          stock.marketData && Object.keys(stock.marketData || {}).length
            ? { ...existing.marketData, ...stock.marketData }
            : existing.marketData,
        technicalIndicators: stock.technicalIndicators || existing.technicalIndicators,
        brokerChannel: stock.brokerChannel || existing.brokerChannel,
        positionEventHistory: [
          ...(existing.positionEventHistory || []),
          ...(stock.positionEventHistory || []),
        ],
      });
    }
  }
  const list = Array.from(map.values());
  return { list, changed: list.length !== portfolio.length };
}

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
        <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'linear-gradient(165deg, #0f172a 0%, #1e293b 100%)' }}>
          <div className="max-w-md rounded-2xl border border-white/20 bg-white/10 p-8 text-center shadow-xl backdrop-blur-md">
            <h1 className="font-display mb-2 text-xl font-bold text-slate-100">页面渲染错误</h1>
            <p className="mb-4 text-sm text-slate-400">
              可点击刷新重试。若反复出现，请打开开发者工具查看控制台报错。
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn btn-primary"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
    const [portfolio, setPortfolio] = React.useState([]);
    const [capitalPool, setCapitalPool] = React.useState({ usd: 0, hkd: 0, cny: 0 });
    const [showAddModal, setShowAddModal] = React.useState(false);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [collapsedStocks, setCollapsedStocks] = React.useState({});

    React.useEffect(() => {
      loadInitialData();
    }, []);

  async function refreshTodayHistoryForPortfolio(existingPortfolio) {
    const today = new Date().toISOString().split('T')[0];
    let updatedPortfolio = [...existingPortfolio];

    for (let i = 0; i < updatedPortfolio.length; i++) {
      const stock = updatedPortfolio[i];
      if (!stock || !stock.symbol || !stock.market) continue;

      const rawHistory = Array.isArray(stock.priceHistory) && stock.priceHistory.length > 0
        ? stock.priceHistory
        : ((window.loadStockPriceHistory && window.loadStockPriceHistory(stock.symbol, stock.market)) || []);

      const lastDate = rawHistory.length > 0 ? rawHistory[rawHistory.length - 1].date : null;
      if (lastDate === today) continue;

      try {
        const priceData = await getStockPrice(stock.symbol, stock.market);
        const mergedHistory = updateStockPriceHistory({ ...stock, priceHistory: rawHistory }, priceData.price, priceData.previousClose || (rawHistory.length > 0 ? rawHistory[rawHistory.length - 1].price : priceData.price));
        saveStockPriceHistory(stock.symbol, stock.market, mergedHistory);

        const newStock = {
          ...stock,
          currentPrice: priceData.price,
          marketData: priceData,
          priceHistory: mergedHistory
        };

        // 替换portfolio中的单只股票并持久化
        updatedPortfolio[i] = newStock;
      } catch (err) {
        console.warn(`更新 ${stock.symbol} 当天历史失败`, err);
      }
    }

    setPortfolio(updatedPortfolio);
    savePortfolio(updatedPortfolio);
  }

  const loadInitialData = async () => {
    let normalized = [];
    try {
      const localPortfolio = loadPortfolio();
      normalized = (Array.isArray(localPortfolio) ? localPortfolio : []).map(stock => {
        const symNorm = normalizePortfolioSymbol(stock.symbol, stock.market);
        const persistedHistory = window.loadStockPriceHistory
          ? window.loadStockPriceHistory(symNorm, stock.market)
          : [];

        // 合并本次存储与 localStorage 历史，优先保留本次已存在日期数据
        const combinedHistoryMap = new Map();
        (Array.isArray(persistedHistory) ? persistedHistory : []).forEach(item => {
          if (item && item.date) combinedHistoryMap.set(item.date, item);
        });
        (Array.isArray(stock.priceHistory) ? stock.priceHistory : []).forEach(item => {
          if (item && item.date) combinedHistoryMap.set(item.date, item);
        });

        const mergedHistory = Array.from(combinedHistoryMap.values())
          .slice()
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(-365);

        return {
          ...stock,
          symbol: symNorm,
          positions: coercePositionsArray(stock.positions),
          priceHistory: mergedHistory
        };
      });
      const mergedDup = mergeDuplicatePortfolioStocks(normalized);
      if (mergedDup.changed) {
        normalized = mergedDup.list;
      }
      // 组合数据 + 存量历史同步，以便重新启动后无需再手动获取历史数据
      const shouldSaveNorm =
        JSON.stringify(normalized) !== JSON.stringify(localPortfolio) || mergedDup.changed;
      if (shouldSaveNorm) {
        savePortfolio(normalized);
      }
      setPortfolio(normalized);
    } catch (e) {
      console.error('加载组合失败', e);
      setPortfolio([]);
      normalized = [];
    }
    // 与「读本地组合」分离：增量更新失败不应清空已有持仓
    if (normalized.length > 0) {
      try {
        await refreshTodayHistoryForPortfolio(normalized);
      } catch (e) {
        console.warn('启动当日行情增量更新失败（已保留本地组合）', e);
      }
    }
    try {
      const savedCapital = loadCapitalPool();
      if (savedCapital && typeof savedCapital === 'object') {
        setCapitalPool({
          usd: Number(savedCapital.usd) || 0,
          hkd: Number(savedCapital.hkd) || 0,
          cny: Number(savedCapital.cny) || 0
        });
      }
    } catch (e) {
      console.error('加载资金池失败', e);
    }
  };

  const handleAddStock = (stockData) => {
    if (!stockData || !stockData.symbol) return;
    const id = Date.now().toString();
    const symNorm = normalizePortfolioSymbol(stockData.symbol, stockData.market);
    const newStock = {
      ...stockData,
      symbol: symNorm,
      id,
      positions: [],
      currentPrice: Number(stockData.currentPrice) || 0,
      marketData:
        stockData.marketData && typeof stockData.marketData === 'object'
          ? stockData.marketData
          : {},
    };
    
    const updatedPortfolio = [...portfolio, newStock];
    setPortfolio(updatedPortfolio);
    savePortfolio(updatedPortfolio);
    setShowAddModal(false);
  };

  const handleUpdateStock = (stockId, updatedStock) => {
    try {
      const updatedPortfolio = portfolio.map(stock =>
        stock.id === stockId ? updatedStock : stock
      );
      setPortfolio(updatedPortfolio);
      savePortfolio(updatedPortfolio);
    } catch (err) {
      console.error('更新股票失败', err);
    }
  };

  const handleDeleteStock = (stockId) => {
    const updatedPortfolio = portfolio.filter(stock => stock.id !== stockId);
    setPortfolio(updatedPortfolio);
    savePortfolio(updatedPortfolio);
  };



    const handleUpdateCapitalPool = (newCapital) => {
      try {
        const usdValue = Number(newCapital?.usd);
        const hkdValue = Number(newCapital?.hkd);
        const cnyValue = Number(newCapital?.cny);
        const safe = {
          usd: Number.isFinite(usdValue) ? usdValue : 0,
          hkd: Number.isFinite(hkdValue) ? hkdValue : 0,
          cny: Number.isFinite(cnyValue) ? cnyValue : 0
        };
        setCapitalPool(safe);
        saveCapitalPool(safe);
      } catch (err) {
        console.error('更新资金池失败', err);
      }
    };

    const handleRefreshAll = async () => {
      setIsRefreshing(true);
      console.log('开始批量刷新所有股票价格和技术指标...');
      const updatedPortfolio = [];
      try {
        for (const stock of portfolio) {
          try {
            console.log(`正在刷新股票 ${stock.symbol} 的价格...`);
            const priceData = await getStockPrice(stock.symbol, stock.market);

            let indicators = stock.technicalIndicators;

            if (stock.market === 'HK' || stock.market === 'CN') {
              try {
                console.log(`正在获取 ${stock.symbol} 的技术指标...`);
                indicators = await getHistoricalDataAndIndicators(stock.symbol, stock.market);
                console.log(`${stock.symbol} 技术指标获取成功:`, indicators);
              } catch (error) {
                console.error(`获取 ${stock.symbol} 技术指标失败:`, error);
              }
            }

            const priceHistory = updateStockPriceHistory(stock, priceData.price, priceData.previousClose);

            updatedPortfolio.push({
              ...stock,
              currentPrice: priceData.price,
              marketData: priceData,
              technicalIndicators: indicators,
              priceHistory: priceHistory
            });

            console.log(`${stock.symbol} 价格更新成功: ${priceData.price}`);
          } catch (error) {
            console.error(`获取股票 ${stock.symbol} 价格失败:`, error);
            updatedPortfolio.push(stock);
          }
        }

        setPortfolio(updatedPortfolio);
        savePortfolio(updatedPortfolio);
        console.log('批量刷新完成');
        if (typeof document !== 'undefined') {
          document.body.classList.add('gx-data-flash');
          window.setTimeout(function () {
            document.body.classList.remove('gx-data-flash');
          }, 900);
        }
      } catch (e) {
        console.error('批量刷新异常', e);
      } finally {
        setIsRefreshing(false);
      }
    };

    const portfolioSummary = React.useMemo(() => {
      try {
        return calculatePortfolioSummary(portfolio);
      } catch (e) {
        console.error('汇总计算失败', e);
        return {
          stockCount: portfolio.length,
          totalCost: 0,
          totalValue: 0,
          totalProfit: 0,
          totalProfitPercent: 0,
          profitableStocks: 0,
          losingStocks: 0
        };
      }
    }, [portfolio]);

    return (
      <>
        <div className="flex min-h-screen flex-col" data-name="app" data-file="app.js">
          <header className="glass-nav sticky top-0 z-40">
            <div className="container mx-auto px-2 py-2 md:px-4 md:py-2.5">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
              <div className="flex min-w-0 items-center gap-2 md:gap-3">
              <img
                src="https://imgus.tangbuy.com/static/images/2025-09-26/e9e9e871b0b2477697e4b59f6da02ab5-17588742994027430860421454933872.png"
                alt="股小蜜 Logo"
                className="h-7 w-7 shrink-0 rounded-lg shadow-sm shadow-slate-900/10 ring-1 ring-white/60 md:h-9 md:w-9 md:rounded-xl"
              />
              <h1 className="font-display truncate text-base font-bold leading-tight tracking-tight text-[var(--text-primary)] md:text-xl">
                股小蜜～懂理财，更懂你！
              </h1>
              </div>
            




              <div className="flex flex-wrap items-center gap-1.5 md:shrink-0 md:justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="btn btn-sm btn-primary flex items-center gap-1"
                >
                  <div className="icon-plus text-xs sm:text-sm"></div>
                  <span className="hidden sm:inline">新增股票</span>
                  <span className="sm:hidden">新增</span>
                </button>
                <button
                  type="button"
                  onClick={handleRefreshAll}
                  disabled={isRefreshing || portfolio.length === 0}
                  className="btn btn-sm btn-success flex items-center gap-1 disabled:pointer-events-none disabled:opacity-50"
                >
                  <div className={`icon-refresh-cw text-xs sm:text-sm ${isRefreshing ? 'animate-spin' : ''}`}></div>
                  <span className="hidden sm:inline">{isRefreshing ? '刷新中...' : '刷新价格'}</span>
                  <span className="sm:hidden">{isRefreshing ? '刷新' : '刷新'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = 'news.html'; }}
                  className="btn btn-sm btn-accent-news flex items-center gap-1"
                >
                  <div className="icon-newspaper text-xs sm:text-sm"></div>
                  <span className="hidden sm:inline">新闻</span>
                  <span className="sm:hidden">新闻</span>
                </button>
                <a
                  href="analysis.html"
                  className="btn btn-sm btn-accent-analysis flex items-center gap-1"
                >
                  <div className="icon-bar-chart-2 text-xs sm:text-sm"></div>
                  <span className="hidden sm:inline">股票分析</span>
                  <span className="sm:hidden">分析</span>
                </a>
              </div>
            </div>
            {portfolio.length > 1 && (
              <StockNavigation portfolio={portfolio} />
            )}
            </div>
          </header>

          <main className="app-shell container mx-auto px-2 pb-8 pt-3 md:px-4 md:pb-12 md:pt-4">
          {/* Position Allocation Card */}
          {portfolio.length > 0 && (
            <PositionAllocationCard 
              portfolio={portfolio}
              capitalPool={capitalPool}
            />
          )}

          {/* Portfolio Summary */}
          {portfolio.length > 0 && (
            <PortfolioSummary 
              summary={portfolioSummary}
              capitalPool={capitalPool}
              onUpdateCapitalPool={handleUpdateCapitalPool}
            />
          )}

          {/* Holdings Summary Table */}
          {portfolio.length > 0 && (
            <HoldingsSummaryTable portfolio={portfolio} />
          )}

          {/* Stock Cards：lg+ 双列 Grid */}
          <div className="app-stock-grid">
            {portfolio.length === 0 ? (
              <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-10 text-center shadow-xl backdrop-blur-md md:py-14">
                <div className="icon-trending-up mb-3 flex justify-center text-4xl text-blue-400/80 md:mb-4 md:text-6xl"></div>
                <h3 className="font-display mb-2 text-lg font-semibold text-slate-200 md:text-xl">
                  还没有添加任何股票
                </h3>
                <p className="mx-auto mb-4 max-w-md px-4 text-sm text-slate-400 md:mb-6 md:text-base">
                  点击「新增股票」开始管理您的投资组合
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="btn btn-primary"
                >
                  新增第一只股票
                </button>
              </div>
            ) : (
              portfolio.map(stock => (
                <StockCard
                  key={stock.id}
                  stock={stock}
                  onUpdate={(updatedStock) => handleUpdateStock(stock.id, updatedStock)}
                  onDelete={() => handleDeleteStock(stock.id)}
                  isCollapsed={collapsedStocks[stock.id] || false}
                  onToggleCollapse={() => setCollapsedStocks(prev => ({
                    ...prev,
                    [stock.id]: !prev[stock.id]
                  }))}
                  capitalPool={capitalPool}
                  onUpdateCapitalPool={handleUpdateCapitalPool}
                  onRefreshAllPrices={handleRefreshAll}
                />
              ))
            )}
          </div>

          {/* Add Stock Modal */}
          {showAddModal && (
            <AddStockModal
              onAdd={handleAddStock}
              onClose={() => setShowAddModal(false)}
            />
          )}
          </main>
        </div>
      </>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);