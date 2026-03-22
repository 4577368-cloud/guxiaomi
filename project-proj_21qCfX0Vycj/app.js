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
        <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'linear-gradient(165deg, #eef2ff 0%, #f8fafc 50%, #f0f9ff 100%)' }}>
          <div className="text-center max-w-md rounded-2xl border border-white/60 bg-white/75 p-8 shadow-xl shadow-slate-900/10 backdrop-blur-xl">
            <h1 className="font-display text-xl font-bold text-slate-900 mb-2">页面渲染错误</h1>
            <p className="text-gray-600 text-sm mb-4">
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
        const persistedHistory = window.loadStockPriceHistory ? window.loadStockPriceHistory(stock.symbol, stock.market) : [];

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
          priceHistory: mergedHistory
        };
      });
      // 组合数据 + 存量历史同步，以便重新启动后无需再手动获取历史数据
      if (JSON.stringify(normalized) !== JSON.stringify(localPortfolio)) {
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
    const newStock = {
      ...stockData,
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
        <div className="min-h-screen" data-name="app" data-file="app.js">
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

          <main className="container mx-auto px-2 pb-8 pt-4 md:px-4 md:pb-12 md:pt-6">
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

          {/* Stock Cards */}
          <div className="space-y-6">
            {portfolio.length === 0 ? (
              <div className="rounded-2xl border border-white/60 bg-white/45 px-4 py-10 text-center shadow-xl shadow-slate-900/5 backdrop-blur-md md:py-14">
                <div className="icon-trending-up mb-3 flex justify-center text-4xl text-indigo-300 md:mb-4 md:text-6xl"></div>
                <h3 className="font-display text-lg font-semibold text-slate-600 md:text-xl mb-2">
                  还没有添加任何股票
                </h3>
                <p className="mb-4 max-w-md mx-auto text-sm text-slate-500 md:mb-6 md:text-base px-4">
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