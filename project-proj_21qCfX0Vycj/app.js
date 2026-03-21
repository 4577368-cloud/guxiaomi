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
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Something went wrong</h1>
            <p className="text-gray-600 mb-4">We're sorry, but something unexpected happened.</p>
            <button
              onClick={() => window.location.reload()}
              className="btn btn-black"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  try {
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
    try {
      const localPortfolio = loadPortfolio();
      const normalized = (Array.isArray(localPortfolio) ? localPortfolio : []).map(stock => {
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

      // 启动当日首访增量更新
      await refreshTodayHistoryForPortfolio(normalized);
    } catch (e) {
      console.error('加载组合失败', e);
      setPortfolio([]);
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
    const newStock = {
      id: Date.now().toString(),
      ...stockData,
      positions: [],
      currentPrice: 0,
      marketData: {}
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
      
      for (const stock of portfolio) {
        try {
          console.log(`正在刷新股票 ${stock.symbol} 的价格...`);
          const priceData = await getStockPrice(stock.symbol, stock.market);
          
          let indicators = stock.technicalIndicators;
          
          // Fetch technical indicators for HK and CN stocks
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
      setIsRefreshing(false);
      console.log('批量刷新完成');
    };

    const portfolioSummary = calculatePortfolioSummary(portfolio);

    return (
      <>
        <div className="min-h-screen bg-gray-50" data-name="app" data-file="app.js">
          <div className="container mx-auto px-2 md:px-4 py-3 md:py-8">
          {/* Header */}
          <div className="mb-4 md:mb-8">
            <div className="flex items-center gap-2 md:gap-4 mb-3 md:mb-4">
              <img 
                src="https://imgus.tangbuy.com/static/images/2025-09-26/e9e9e871b0b2477697e4b59f6da02ab5-17588742994027430860421454933872.png"
                alt="股小蜜 Logo"
                className="w-8 h-8 md:w-12 md:h-12 rounded-lg shadow-md"
              />
              <h1 className="text-lg md:text-3xl font-bold text-[var(--text-primary)]">
                股小蜜～懂理财，更懂你！
              </h1>
            </div>
            




            <div className="flex flex-wrap gap-2 md:gap-4 items-center justify-between">
              <div className="flex flex-wrap gap-2 md:gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="btn btn-primary flex items-center gap-1 md:gap-2"
                >
                  <div className="icon-plus text-sm md:text-lg"></div>
                  <span className="hidden sm:inline">新增股票</span>
                  <span className="sm:hidden">新增</span>
                </button>
                
                <button
                  type="button"
                  onClick={handleRefreshAll}
                  disabled={isRefreshing || portfolio.length === 0}
                  className="btn btn-success flex items-center gap-1 md:gap-2 disabled:opacity-50"
                >
                  <div className={`icon-refresh-cw text-sm md:text-lg ${isRefreshing ? 'animate-spin' : ''}`}></div>
                  <span className="hidden sm:inline">{isRefreshing ? '刷新中...' : '刷新价格'}</span>
                  <span className="sm:hidden">{isRefreshing ? '刷新' : '刷新'}</span>
                </button>

                <button
                  onClick={() => window.location.href = 'news.html'}
                  className="btn btn-primary flex items-center gap-1"
                  style={{backgroundColor: '#d02f5e'}}
                >
                  <div className="icon-newspaper text-sm"></div>
                  <span className="hidden sm:inline">新闻</span>
                  <span className="sm:hidden">新闻</span>
                </button>

                <a
                  href="analysis.html"
                  className="btn btn-primary flex items-center gap-1 md:gap-2"
                  style={{backgroundColor: '#0d9488'}}
                >
                  <div className="icon-bar-chart-2 text-sm md:text-lg"></div>
                  <span className="hidden sm:inline">股票分析</span>
                  <span className="sm:hidden">分析</span>
                </a>


              </div>
            </div>
          </div>

          {/* Position Allocation Card */}
          {portfolio.length > 0 && (
            <PositionAllocationCard 
              portfolio={portfolio}
              capitalPool={capitalPool}
            />
          )}

          {/* Stock Navigation */}
          {portfolio.length > 1 && (
            <StockNavigation portfolio={portfolio} />
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
              <div className="text-center py-8 md:py-12">
                <div className="icon-trending-up text-4xl md:text-6xl text-gray-300 mb-3 md:mb-4 flex justify-center"></div>
                <h3 className="text-lg md:text-xl font-semibold text-gray-500 mb-2">
                  还没有添加任何股票
                </h3>
                <p className="text-sm md:text-base text-gray-400 mb-4 md:mb-6 px-4">
                  点击"新增股票"开始管理您的投资组合
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
          </div>
        </div>
      </>
    );
  } catch (error) {
    console.error('App component error:', error);
    return null;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);