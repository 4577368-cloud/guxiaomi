// Local storage utility functions for portfolio management
const PORTFOLIO_STORAGE_KEY = 'stock_portfolio_data';
const CURRENT_VERSION = '1.1';

function validateStockData(stock) {
  if (!stock || typeof stock !== 'object') return false;
  if (!stock.symbol || !stock.market) return false;
  if (stock.currentPrice !== undefined && (!Number.isFinite(stock.currentPrice) || stock.currentPrice < 0)) {
    return false;
  }
  return true;
}

function sanitizeStockData(stock) {
  if (!stock || typeof stock !== 'object') return null;
  const keywords = typeof window.ensureStockKeywords === 'function'
    ? window.ensureStockKeywords(stock)
    : (Array.isArray(stock.keywords) ? stock.keywords.filter(Boolean) : []);
  return {
    ...stock,
    currentPrice: stock.currentPrice !== undefined && Number.isFinite(stock.currentPrice) && stock.currentPrice >= 0
      ? stock.currentPrice
      : 0,
    positions: Array.isArray(stock.positions) ? stock.positions : [],
    priceHistory: Array.isArray(stock.priceHistory) ? stock.priceHistory : [],
    technicalIndicators: stock.technicalIndicators || {},
    marketData: stock.marketData || {},
    keywords
  };
}

function migratePortfolioData(data) {
  if (!data) return { portfolio: [], version: CURRENT_VERSION };
  
  let portfolio = data.portfolio || [];
  
  portfolio = portfolio.map(stock => {
    const sanitized = sanitizeStockData(stock);
    if (!sanitized) return null;
    return {
      ...sanitized,
      id: sanitized.id || Date.now().toString()
    };
  }).filter(Boolean);
  
  return {
    portfolio: portfolio,
    version: CURRENT_VERSION,
    lastUpdated: data.lastUpdated || new Date().toISOString()
  };
}

function savePortfolio(portfolio) {
  try {
    const sanitizedPortfolio = portfolio.map(sanitizeStockData).filter(Boolean);
    const dataToSave = {
      portfolio: sanitizedPortfolio,
      lastUpdated: new Date().toISOString(),
      version: CURRENT_VERSION
    };
    localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(dataToSave));
    console.log('投资组合数据已保存');
  } catch (error) {
    console.error('保存投资组合数据失败:', error);
  }
}

function loadPortfolio() {
  try {
    const savedData = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if (savedData) {
      let parsedData;
      try {
        parsedData = JSON.parse(savedData);
      } catch (parseError) {
        console.error('解析投资组合数据失败:', parseError);
        return [];
      }
      
      const migratedData = migratePortfolioData(parsedData);
      
      if (migratedData.version !== parsedData?.version) {
        savePortfolio(migratedData.portfolio);
        console.log('投资组合数据已迁移到新版本:', CURRENT_VERSION);
      }
      
      console.log('投资组合数据已加载, 最后更新:', migratedData.lastUpdated);
      return migratedData.portfolio || [];
    }
    return [];
  } catch (error) {
    console.error('加载投资组合数据失败:', error);
    return [];
  }
}

function clearPortfolio() {
  try {
    localStorage.removeItem(PORTFOLIO_STORAGE_KEY);
    console.log('投资组合数据已清除');
  } catch (error) {
    console.error('清除投资组合数据失败:', error);
  }
}

function exportPortfolio() {
  try {
    const portfolio = loadPortfolio();
    const dataStr = JSON.stringify(portfolio, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `stock_portfolio_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    console.log('投资组合数据导出成功');
  } catch (error) {
    console.error('导出投资组合数据失败:', error);
  }
}

function saveCapitalPool(capitalPool) {
  try {
    const dataToSave = {
      capitalPool: capitalPool,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem('capital_pool_data', JSON.stringify(dataToSave));
    console.log('资金池数据已保存');
  } catch (error) {
    console.error('保存资金池数据失败:', error);
  }
}

function loadCapitalPool() {
  try {
    const savedData = localStorage.getItem('capital_pool_data');
    if (savedData) {
      const parsedData = JSON.parse(savedData);
      console.log('资金池数据已加载, 最后更新:', parsedData.lastUpdated);
      return parsedData.capitalPool || { usd: 0, hkd: 0, cny: 0 };
    }
    return { usd: 0, hkd: 0, cny: 0 };
  } catch (error) {
    console.error('加载资金池数据失败:', error);
    return { usd: 0, hkd: 0, cny: 0 };
  }
}

const STOCK_HISTORY_KEY_PREFIX = 'stock_price_history';

function getStockHistoryKey(symbol, market) {
  return `${STOCK_HISTORY_KEY_PREFIX}_${(market || 'UNKNOWN').toString().toUpperCase()}_${(symbol || 'UNKNOWN').toString().toUpperCase()}`;
}

function saveStockPriceHistory(symbol, market, history) {
  try {
    const key = getStockHistoryKey(symbol, market);
    localStorage.setItem(key, JSON.stringify({ history, lastUpdated: new Date().toISOString() }));
  } catch (error) {
    console.error('保存股票历史数据失败:', error);
  }
}

function loadStockPriceHistory(symbol, market) {
  try {
    const key = getStockHistoryKey(symbol, market);
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return parsed.history || [];
  } catch (error) {
    console.error('读取股票历史数据失败:', error);
    return [];
  }
}

function updateStockPriceHistory(stock, newPrice, previousClose) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let priceHistory = Array.isArray(stock.priceHistory) ? [...stock.priceHistory] : loadStockPriceHistory(stock.symbol, stock.market);

  if (previousClose != null && !Number.isNaN(previousClose) && previousClose > 0) {
    const hasYesterday = priceHistory.some(item => item.date === yesterday);
    if (!hasYesterday) {
      const lastPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].price : null;
      const previousShares = priceHistory.length > 0 ? (priceHistory[priceHistory.length - 1].shares || 0) : 0;
      const profit = (lastPrice != null && previousShares > 0) ? (previousClose - lastPrice) * previousShares : 0;
      priceHistory.push({
        date: yesterday,
        price: Math.round(previousClose * 1000) / 1000,
        shares: previousShares,
        dailyProfit: Math.round(profit * 100) / 100
      });
    }
  }

  const analysis = calculateStockAnalysis(stock, stock.brokerChannel);
  const previousClosePrice = Number.isFinite(previousClose) ? previousClose : (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].price : newPrice);
  const previousShares = priceHistory.length > 0 ? (priceHistory[priceHistory.length - 1].shares || analysis.totalShares) : analysis.totalShares;
  const dailyProfit = Number.isFinite((newPrice - previousClosePrice) * previousShares) ? Math.round((newPrice - previousClosePrice) * previousShares * 100) / 100 : 0;

  const existingIndex = priceHistory.findIndex(item => item.date === today);

  const updatedEntry = {
    date: today,
    price: Math.round(newPrice * 1000) / 1000,
    previousClose: Number.isFinite(previousClose) ? Math.round(previousClose * 1000) / 1000 : null,
    dailyProfit: dailyProfit,
    shares: Number.isFinite(analysis.totalShares) ? analysis.totalShares : 0
  };

  if (existingIndex >= 0) {
    priceHistory[existingIndex] = {
      ...priceHistory[existingIndex],
      ...updatedEntry
    };
  } else {
    priceHistory.push(updatedEntry);
  }

  const trimmed = priceHistory.slice(-365); // 只保留最近一年历史，防止无限增长
  saveStockPriceHistory(stock.symbol, stock.market, trimmed);
  return trimmed;
}

// ============== 监控列表功能 ==============
const WATCHLIST_STORAGE_KEY = 'stock_watchlist_data';

function validateWatchlistItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (!item.symbol || !item.market) return false;
  return true;
}

function sanitizeWatchlistItem(item) {
  if (!item || typeof item !== 'object') return null;
  const currentPrice = Number(item.currentPrice) || 0;
  const history = Array.isArray(item.priceHistory) ? item.priceHistory : [];
  const firstHistoryPrice =
    history.length > 0 && Number.isFinite(Number(history[0].price))
      ? Number(history[0].price)
      : 0;
  const watchStartPrice =
    Number(item.watchStartPrice) ||
    firstHistoryPrice ||
    Number(item.previousClose) ||
    currentPrice ||
    0;
  const keywords = typeof window.ensureStockKeywords === 'function'
    ? window.ensureStockKeywords(item)
    : (Array.isArray(item.keywords) ? item.keywords.filter(Boolean) : []);
  return {
    id: item.id || `${item.market}_${item.symbol}_${Date.now()}`,
    symbol: item.symbol.toUpperCase(),
    market: item.market.toUpperCase(),
    name: item.name || item.symbol,
    currentPrice: currentPrice,
    previousClose: item.previousClose || null,
    change: item.change || 0,
    changePercent: item.changePercent || 0,
    marketData: item.marketData || {},
    priceHistory: history,
    keywords: keywords,
    addedAt: item.addedAt || new Date().toISOString(),
    watchStartPrice: watchStartPrice,
    notes: item.notes || '',
    alertEnabled: item.alertEnabled || false,
    alertThreshold: item.alertThreshold || 5 // 涨跌幅超过5%提醒
  };
}

function saveWatchlist(watchlist) {
  try {
    const sanitized = watchlist
      .map(item => sanitizeWatchlistItem(item))
      .filter(Boolean);
    const dataToSave = {
      watchlist: sanitized,
      lastUpdated: new Date().toISOString(),
      version: '1.0'
    };
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(dataToSave));
    console.log('监控列表已保存');
  } catch (error) {
    console.error('保存监控列表失败:', error);
  }
}

function loadWatchlist() {
  try {
    const savedData = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (savedData) {
      const parsedData = JSON.parse(savedData);
      console.log('监控列表已加载');
      return parsedData.watchlist || [];
    }
    return [];
  } catch (error) {
    console.error('加载监控列表失败:', error);
    return [];
  }
}

function addToWatchlist(item) {
  const watchlist = loadWatchlist();
  const key = `${item.market}_${item.symbol}`.toUpperCase();

  // 检查是否已存在
  const exists = watchlist.some(w => `${w.market}_${w.symbol}`.toUpperCase() === key);
  if (exists) {
    console.warn(`${item.symbol} 已在监控列表中`);
    return { success: false, message: '该股票已在监控列表中' };
  }

  watchlist.push(sanitizeWatchlistItem({
    ...item,
    addedAt: new Date().toISOString(),
    watchStartPrice: Number(item.currentPrice) || Number(item.previousClose) || 0
  }));
  saveWatchlist(watchlist);
  return { success: true, watchlist };
}

function removeFromWatchlist(symbol, market) {
  const watchlist = loadWatchlist();
  const key = `${market}_${symbol}`.toUpperCase();
  const filtered = watchlist.filter(w => `${w.market}_${w.symbol}`.toUpperCase() !== key);
  saveWatchlist(filtered);
  return { success: true, watchlist: filtered };
}

function updateWatchlistItem(symbol, market, updates) {
  const watchlist = loadWatchlist();
  const key = `${market}_${symbol}`.toUpperCase();
  const updated = watchlist.map(w => {
    if (`${w.market}_${w.symbol}`.toUpperCase() === key) {
      return sanitizeWatchlistItem({ ...w, ...updates });
    }
    return w;
  });
  saveWatchlist(updated);
  return { success: true, watchlist: updated };
}

function isInWatchlist(symbol, market) {
  const watchlist = loadWatchlist();
  const key = `${market}_${symbol}`.toUpperCase();
  return watchlist.some(w => `${w.market}_${w.symbol}`.toUpperCase() === key);
}

function clearWatchlist() {
  try {
    localStorage.removeItem(WATCHLIST_STORAGE_KEY);
    console.log('监控列表已清除');
  } catch (error) {
    console.error('清除监控列表失败:', error);
  }
}

// 导出为全局函数
window.loadWatchlist = loadWatchlist;
window.saveWatchlist = saveWatchlist;
window.addToWatchlist = addToWatchlist;
window.removeFromWatchlist = removeFromWatchlist;
window.updateWatchlistItem = updateWatchlistItem;
window.isInWatchlist = isInWatchlist;
window.clearWatchlist = clearWatchlist;

