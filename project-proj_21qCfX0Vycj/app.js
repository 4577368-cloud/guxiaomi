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
    const [watchlist, setWatchlist] = React.useState([]);
    const [capitalPool, setCapitalPool] = React.useState({ usd: 0, hkd: 0, cny: 0 });
    const [showAddModal, setShowAddModal] = React.useState(false);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);
    const [collapsedStocks, setCollapsedStocks] = React.useState({});
    const [focusedStockId, setFocusedStockId] = React.useState(null);
    const [quickPositionStock, setQuickPositionStock] = React.useState(null);

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
      setIsLoading(true);
      fetchExchangeRates().catch(() => {});
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
    // 加载监控列表
    try {
      const savedWatchlist = window.loadWatchlist ? window.loadWatchlist() : [];
      const normalizedWatchlist = (Array.isArray(savedWatchlist) ? savedWatchlist : []).map(item => {
        const symNorm = normalizePortfolioSymbol(item.symbol, item.market);
        const persistedHistory = window.loadStockPriceHistory
          ? window.loadStockPriceHistory(symNorm, item.market)
          : [];
        const combinedHistoryMap = new Map();
        (Array.isArray(persistedHistory) ? persistedHistory : []).forEach(row => {
          if (row && row.date) combinedHistoryMap.set(row.date, row);
        });
        (Array.isArray(item.priceHistory) ? item.priceHistory : []).forEach(row => {
          if (row && row.date) combinedHistoryMap.set(row.date, row);
        });
        const mergedHistory = Array.from(combinedHistoryMap.values())
          .slice()
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(-365);
        return {
          ...item,
          symbol: symNorm,
          priceHistory: mergedHistory,
          watchStartPrice:
            Number(item.watchStartPrice) ||
            (mergedHistory.length > 0 ? Number(mergedHistory[0].price) : 0) ||
            Number(item.currentPrice) ||
            0
        };
      });
      setWatchlist(normalizedWatchlist);
      if (JSON.stringify(normalizedWatchlist) !== JSON.stringify(savedWatchlist) && window.saveWatchlist) {
        window.saveWatchlist(normalizedWatchlist);
      }
      console.log('监控列表已加载:', savedWatchlist?.length || 0, '只股票');
    } catch (e) {
      console.error('加载监控列表失败', e);
      setWatchlist([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddStock = (stockData) => {
    if (!stockData || !stockData.symbol) return;
    const id = Date.now().toString();
    const symNorm = normalizePortfolioSymbol(stockData.symbol, stockData.market);
    const initialPositions = Array.isArray(stockData.positions)
      ? stockData.positions.map((pos, idx) => ({
        ...pos,
        id: pos.id || `${Date.now()}_${idx}`,
        price: Number(pos.price) || 0,
        shares: Number(pos.shares) || 0,
        enabled: pos.enabled !== false
      })).filter(pos => pos.price > 0 && pos.shares > 0)
      : [];
    const newStock = {
      ...stockData,
      symbol: symNorm,
      id,
      positions: initialPositions,
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

  const appendPositionToStock = (stock, position) => {
    const currentPositions = Array.isArray(stock.positions) ? stock.positions : [];
    const existingTotalShares = currentPositions
      .filter(p => p.enabled !== false)
      .reduce((sum, p) => sum + (Number(p.shares) || 0), 0);
    const eventType = existingTotalShares > 0 ? 'add' : 'open';
    const normalizedPosition = {
      ...position,
      id: position.id || Date.now().toString(),
      price: Number(position.price) || 0,
      shares: Number(position.shares) || 0,
      enabled: position.enabled !== false
    };
    const event = {
      id: `evt_${Date.now()}`,
      date: normalizedPosition.date || new Date().toISOString().split('T')[0],
      type: eventType,
      shares: normalizedPosition.shares,
      price: normalizedPosition.price,
      amount: normalizedPosition.shares * normalizedPosition.price,
      note: eventType === 'open' ? '开仓' : '加仓'
    };
    return {
      ...stock,
      brokerChannel: position.brokerChannel || stock.brokerChannel || 'futu',
      positions: [...currentPositions, normalizedPosition],
      positionEventHistory: [...(stock.positionEventHistory || []), event]
    };
  };

  const handleUpdateStock = (stockId, updatedStock) => {
    try {
      setPortfolio(prev => {
        const updated = prev.map(stock =>
          stock.id === stockId ? updatedStock : stock
        );
        savePortfolio(updated);
        return updated;
      });
    } catch (err) {
      console.error('更新股票失败', err);
    }
  };

  const handleDeleteStock = (stockId) => {
    setPortfolio(prev => {
      const updated = prev.filter(stock => stock.id !== stockId);
      savePortfolio(updated);
      return updated;
    });
  };

  // 监控列表处理函数
  const handleAddToWatchlist = (stockData) => {
    if (!stockData || !stockData.symbol) return;
    if (window.addToWatchlist) {
      const result = window.addToWatchlist(stockData);
      if (result.success) {
        setWatchlist(result.watchlist);
        console.log(`已将 ${stockData.symbol} 添加到监控列表`);
      } else {
        console.warn(result.message);
      }
    }
  };

  const handleRemoveFromWatchlist = (item) => {
    if (window.removeFromWatchlist) {
      const key = `${item.market}_${item.symbol}`.toUpperCase();
      const result = window.removeFromWatchlist(item.symbol, item.market);
      if (result.success) {
        setWatchlist(result.watchlist);
        console.log(`已将 ${item.symbol} 从监控列表移除`);
      }
    }
  };

  const handleRefreshWatchlistItem = async (item) => {
    try {
      const priceData = await getStockPrice(item.symbol, item.market);
      const priceHistory = updateStockPriceHistory(
        {
          ...item,
          positions: [],
          brokerChannel: item.brokerChannel || 'futu',
          priceHistory: Array.isArray(item.priceHistory) ? item.priceHistory : []
        },
        priceData.price,
        priceData.previousClose
      );
      if (window.updateWatchlistItem) {
        const result = window.updateWatchlistItem(item.symbol, item.market, {
          currentPrice: priceData.price,
          previousClose: priceData.previousClose,
          change: priceData.change,
          changePercent: priceData.changePercent,
          marketData: priceData,
          priceHistory: priceHistory,
          watchStartPrice: Number(item.watchStartPrice) || (priceHistory[0] ? Number(priceHistory[0].price) : priceData.price)
        });
        if (result.success) {
          setWatchlist([...result.watchlist]);
        }
      }
    } catch (error) {
      console.error(`刷新 ${item.symbol} 价格失败:`, error);
    }
  };

  const handleRefreshAllWatchlist = async () => {
    console.log('开始刷新监控列表...');
    for (const item of watchlist) {
      await handleRefreshWatchlistItem(item);
    }
    console.log('监控列表刷新完成');
  };

  const handleAddPositionFromWatchlist = (item) => {
    setQuickPositionStock({
      symbol: item.symbol,
      market: item.market,
      name: item.name,
      currentPrice: item.currentPrice,
      marketData: item.marketData,
      brokerChannel: item.brokerChannel || 'futu',
      source: 'watchlist'
    });
  };

    const handleOpenQuickPositionForStock = (stockId) => {
      const stock = portfolio.find(s => s.id === stockId);
      if (!stock) return;
      setQuickPositionStock({
        ...stock,
        source: 'portfolio'
      });
    };

    const handleSubmitQuickPosition = (position) => {
      if (!quickPositionStock) return;
      const key = `${quickPositionStock.market}_${quickPositionStock.symbol}`.toUpperCase();
      const existing = portfolio.find(stock => `${stock.market}_${stock.symbol}`.toUpperCase() === key);
      let updatedPortfolio;
      let targetId = existing && existing.id;
      if (existing) {
        updatedPortfolio = portfolio.map(stock =>
          stock.id === existing.id ? appendPositionToStock(stock, position) : stock
        );
      } else {
        targetId = Date.now().toString();
        updatedPortfolio = [
          ...portfolio,
          appendPositionToStock({
            ...quickPositionStock,
            id: targetId,
            symbol: normalizePortfolioSymbol(quickPositionStock.symbol, quickPositionStock.market),
            positions: [],
            currentPrice: Number(quickPositionStock.currentPrice) || 0,
            marketData: quickPositionStock.marketData || {},
            brokerChannel: position.brokerChannel || quickPositionStock.brokerChannel || 'futu'
          }, position)
        ];
      }
      setPortfolio(updatedPortfolio);
      savePortfolio(updatedPortfolio);
      setQuickPositionStock(null);
      if (targetId) {
        window.setTimeout(() => handleSelectStockDetail(targetId), 80);
      }
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
      try {
        const refreshPromises = portfolio.map(async (stock) => {
          try {
            console.log(`正在刷新股票 ${stock.symbol} 的价格...`);
            const [priceData, indicators] = await Promise.all([
              getStockPrice(stock.symbol, stock.market),
              (stock.market === 'HK' || stock.market === 'CN')
                ? getHistoricalDataAndIndicators(stock.symbol, stock.market)
                : Promise.resolve(stock.technicalIndicators)
            ]);

            if (indicators) {
              console.log(`${stock.symbol} 技术指标获取成功`);
            }

            const priceHistory = updateStockPriceHistory(stock, priceData.price, priceData.previousClose);

            console.log(`${stock.symbol} 价格更新成功: ${priceData.price}`);

            // 检查价格提醒
            if (window.checkPriceAlert && stock.currentPrice > 0) {
              const alert = window.checkPriceAlert(stock, priceData.price, stock.currentPrice);
              if (alert) {
                console.log(`🔔 价格提醒: ${alert.message}`);
                window.sendPriceNotification?.(alert);
              }
            }

            return {
              ...stock,
              currentPrice: priceData.price,
              marketData: priceData,
              technicalIndicators: indicators || stock.technicalIndicators,
              priceHistory: priceHistory
            };
          } catch (error) {
            console.error(`获取股票 ${stock.symbol} 价格失败:`, error);
            return stock;
          }
        });

        const updatedPortfolio = await Promise.all(refreshPromises);

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

    const handleSelectStockDetail = (stockId) => {
      if (!stockId) return;
      setCollapsedStocks(prev => ({
        ...prev,
        [stockId]: false
      }));
      setFocusedStockId(stockId);
      window.setTimeout(() => {
        const el = document.getElementById(`stock-card-${stockId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 80);
      window.setTimeout(() => {
        setFocusedStockId(prev => (prev === stockId ? null : prev));
      }, 1600);
    };

    return (
      <>
        <div className="flex min-h-screen flex-col" data-name="app" data-file="app.js">
          <header className="glass-nav sticky top-0 z-40">
            <div className="container mx-auto px-2 py-2 md:px-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="relative shrink-0">
                    <img
                      src="https://imgus.tangbuy.com/static/images/2025-09-26/e9e9e871b0b2477697e4b59f6da02ab5-17588742994027430860421454933872.png"
                      alt="股小蜜 Logo"
                      className="h-8 w-8 rounded-xl shadow-lg shadow-slate-900/20 ring-2 ring-white/70 md:h-9 md:w-9"
                    />
                    <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-slate-900"></div>
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <h1 className="font-display text-base font-bold tracking-tight text-[var(--text-primary)] md:text-lg">
                      股小蜜
                    </h1>
                    <p className="text-[10px] text-slate-400 md:text-xs">
                      懂理财，更懂你
                    </p>
                  </div>
                  {isLoading && (
                    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent"></span>
                  )}
                </div>

                <div className="top-action-bar">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(true)}
                    className="btn btn-primary top-action gap-1.5"
                  >
                    <div className="icon-plus text-sm"></div>
                    <span>新增</span>
                  </button>
                  <a
                    href="analysis.html?from=index.html"
                    className="btn btn-accent-analysis top-action gap-1.5"
                  >
                    <div className="icon-bar-chart-2 text-sm"></div>
                    <span>分析</span>
                  </a>
                  <a
                    href="ziwei.html?from=index.html"
                    className="btn btn-accent-paipan top-action gap-1.5"
                  >
                    <div className="icon-sparkles text-sm"></div>
                    <span>排盘</span>
                  </a>
                  <a
                    href="news.html?from=index.html"
                    className="btn btn-accent-news top-action gap-1.5"
                  >
                    <div className="icon-newspaper text-sm"></div>
                    <span>新闻</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleRefreshAll}
                    disabled={isRefreshing || portfolio.length === 0}
                    className="btn btn-success top-action gap-1.5 disabled:opacity-50"
                    title={portfolio.length === 0 ? '添加股票后可刷新行情' : '刷新全部行情'}
                  >
                    <div className={`icon-refresh-cw text-sm ${isRefreshing ? 'animate-spin' : ''}`}></div>
                    <span>刷新</span>
                  </button>
                </div>
              </div>

            </div>
          </header>

          <main className="app-shell container mx-auto px-2 pb-8 pt-3 md:px-4 md:pb-12 md:pt-4">
          {portfolio.length > 1 && (
            <div className="mb-3">
              <StockNavigation portfolio={portfolio} />
            </div>
          )}
          {isLoading ? (
            <div className="card mb-4 animate-pulse p-5">
              <div className="h-5 w-36 rounded bg-white/20"></div>
              <div className="mt-3 h-10 w-64 rounded bg-white/10"></div>
              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="h-20 rounded-2xl bg-white/10"></div>
                <div className="h-20 rounded-2xl bg-white/10"></div>
                <div className="h-20 rounded-2xl bg-white/10"></div>
                <div className="h-20 rounded-2xl bg-white/10"></div>
              </div>
            </div>
          ) : (
            <HomeDashboard
              portfolio={portfolio}
              watchlist={watchlist}
              summary={portfolioSummary}
              capitalPool={capitalPool}
              onUpdateCapitalPool={handleUpdateCapitalPool}
              onAddStock={() => setShowAddModal(true)}
              onRefreshAll={handleRefreshAll}
            />
          )}

          {/* Unified Holdings List */}
          {isLoading ? (
            <div className="card mb-4 animate-pulse overflow-hidden p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="h-6 w-32 rounded bg-white/20"></div>
                <div className="h-8 w-48 rounded bg-white/10"></div>
              </div>
              <div className="space-y-2">
                <div className="h-16 rounded-2xl bg-white/10"></div>
                <div className="h-16 rounded-2xl bg-white/10"></div>
                <div className="h-16 rounded-2xl bg-white/10"></div>
              </div>
            </div>
          ) : portfolio.length > 0 && (
            <PortfolioQueue
              portfolio={portfolio}
              capitalPool={capitalPool}
              summary={portfolioSummary}
              isRefreshing={isRefreshing}
              onAddStock={() => setShowAddModal(true)}
              onRefreshAll={handleRefreshAll}
              onQuickAddStock={handleOpenQuickPositionForStock}
              onDeleteStock={handleDeleteStock}
              onUpdateStock={handleUpdateStock}
            />
          )}

          {/* Watchlist Section */}
          <WatchlistSection
            watchlist={watchlist}
            onRemoveItem={handleRemoveFromWatchlist}
            onRefreshItem={handleRefreshWatchlistItem}
            onAddPosition={handleAddPositionFromWatchlist}
            onRefreshAll={handleRefreshAllWatchlist}
          />

          {!isLoading && portfolio.length === 0 && (
            <div className="flex justify-center">
              <div className="w-full max-w-xl rounded-2xl border border-white/20 bg-white/10 px-4 py-10 text-center shadow-xl backdrop-blur-md md:py-14">
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
            </div>
          )}

          {/* Add Stock Modal */}
          {showAddModal && (
            <AddStockModal
              onAdd={handleAddStock}
              onClose={() => setShowAddModal(false)}
              onAddToWatchlist={handleAddToWatchlist}
            />
          )}
          {quickPositionStock && (
            <PositionForm
              stock={quickPositionStock}
              brokerChannel={quickPositionStock.brokerChannel || 'futu'}
              onBrokerChannelChange={(channel) => {
                setQuickPositionStock(prev => prev ? { ...prev, brokerChannel: channel } : prev);
              }}
              onAdd={handleSubmitQuickPosition}
              onClose={() => setQuickPositionStock(null)}
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