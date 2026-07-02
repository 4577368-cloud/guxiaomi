// 云端 Postgres 同步：线上以数据库为准；本地开发仍以 localStorage 为主。

function getCloudApiBase() {
  var injected = String(window.ANALYSIS_API_BASE || '').replace(/\/$/, '');
  if (injected) return injected;
  if (typeof location === 'undefined') return '';
  var host = location.hostname || '';
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:8123';
  }
  return String(location.origin || '').replace(/\/$/, '');
}

/** 线上部署（Vercel 等）：以 Postgres 为唯一数据源 */
function isCloudPrimary() {
  if (typeof location === 'undefined') return false;
  var host = location.hostname || '';
  return host !== 'localhost' && host !== '127.0.0.1';
}

async function cloudFetchJson(path, options) {
  var base = getCloudApiBase();
  if (!base) return null;
  try {
    var res = await fetch(base + path, options || {});
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('云端请求失败:', path, e.message || e);
    return null;
  }
}

function debounceCloudSync(fn, delay) {
  var timer = null;
  return function () {
    var args = arguments;
    var self = this;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      fn.apply(self, args);
    }, delay || 800);
  };
}

function mergePriceHistoryRows() {
  var map = {};
  for (var i = 0; i < arguments.length; i++) {
    var src = arguments[i];
    if (!Array.isArray(src)) continue;
    src.forEach(function (row) {
      if (row && row.date) map[row.date] = row;
    });
  }
  return Object.keys(map)
    .sort()
    .map(function (d) {
      return map[d];
    })
    .slice(-365);
}

function buildSnapshotFromStock(stock, context) {
  if (!stock || !stock.symbol || !stock.market) return null;
  var price = Number(stock.currentPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  var md = stock.marketData || {};
  var analysis =
    typeof calculateStockAnalysis === 'function'
      ? calculateStockAnalysis(stock, stock.brokerChannel)
      : null;
  var shares = analysis && Number.isFinite(analysis.totalShares) ? analysis.totalShares : null;
  var marketValue =
    shares && shares > 0 ? Math.round(price * shares * 100) / 100 : null;
  var today = new Date().toISOString().split('T')[0];
  var history = Array.isArray(stock.priceHistory) ? stock.priceHistory : [];
  var todayRow = history.find(function (h) {
    return h && h.date === today;
  });
  return {
    symbol: stock.symbol,
    market: stock.market,
    snapshot_date: today,
    price: price,
    previous_close: md.previousClose != null ? md.previousClose : undefined,
    previousClose: md.previousClose != null ? md.previousClose : undefined,
    change: md.change,
    changePercent: md.changePercent,
    shares: todayRow && todayRow.shares != null ? todayRow.shares : shares,
    market_value: marketValue,
    marketValue: marketValue,
    daily_profit: todayRow && todayRow.dailyProfit != null ? todayRow.dailyProfit : undefined,
    dailyProfit: todayRow && todayRow.dailyProfit != null ? todayRow.dailyProfit : undefined,
    source: md.source || 'frontend',
    context: context || 'portfolio',
    quote: md,
  };
}

function buildSnapshotsFromHistory(symbol, market, history, context) {
  if (!Array.isArray(history)) return [];
  return history
    .map(function (row) {
      if (!row || !row.date) return null;
      var price = Number(row.price);
      if (!Number.isFinite(price) || price <= 0) return null;
      var shares = Number(row.shares);
      return {
        symbol: symbol,
        market: market,
        snapshot_date: row.date,
        date: row.date,
        price: price,
        previousClose: row.previousClose,
        shares: Number.isFinite(shares) ? shares : undefined,
        market_value:
          Number.isFinite(shares) && shares > 0
            ? Math.round(price * shares * 100) / 100
            : undefined,
        daily_profit: row.dailyProfit,
        context: context || 'portfolio',
        source: 'price_history',
      };
    })
    .filter(Boolean);
}

async function recordPriceSnapshots(items) {
  if (!items || !items.length) return false;
  var data = await cloudFetchJson('/api/price-snapshots/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: items }),
  });
  return !!(data && data.ok);
}

async function recordPriceSnapshot(symbol, market, quote, opts) {
  if (!symbol || !market || !quote) return false;
  var price = Number(quote.price);
  if (!Number.isFinite(price) || price <= 0) return false;
  var item = {
    symbol: symbol,
    market: market,
    snapshot_date: new Date().toISOString().split('T')[0],
    price: price,
    previous_close: quote.previousClose,
    previousClose: quote.previousClose,
    change: quote.change,
    changePercent: quote.changePercent,
    source: (opts && opts.source) || quote.source || 'quote',
    context: (opts && opts.context) || 'quote',
    quote: quote,
  };
  if (opts && opts.shares != null) item.shares = opts.shares;
  if (opts && opts.marketValue != null) item.market_value = opts.marketValue;
  if (opts && opts.dailyProfit != null) item.daily_profit = opts.dailyProfit;
  return recordPriceSnapshots([item]);
}

async function recordStockPriceHistory(symbol, market, history, context) {
  var items = buildSnapshotsFromHistory(symbol, market, history, context);
  if (!items.length) return false;
  return recordPriceSnapshots(items);
}

async function fetchCloudPortfolio() {
  var data = await cloudFetchJson('/api/portfolio/list');
  if (!data || !data.ok) return { ok: false, items: null };
  return { ok: true, items: Array.isArray(data.items) ? data.items : [] };
}

async function fetchCloudWatchlist() {
  var data = await cloudFetchJson('/api/watchlist/list');
  if (!data || !data.ok) return { ok: false, items: null };
  return { ok: true, items: Array.isArray(data.items) ? data.items : [] };
}

async function fetchCloudCapitalPool() {
  var data = await cloudFetchJson('/api/capital-pool/get');
  if (!data || !data.ok) return { ok: false, pool: null };
  return { ok: true, pool: data.pool || { usd: 0, hkd: 0, cny: 0 } };
}

async function enrichItemsWithCloudPriceHistory(items) {
  if (!Array.isArray(items) || !items.length) return items || [];
  var enriched = await Promise.all(
    items.map(async function (item) {
      if (!item || !item.symbol || !item.market) return item;
      var sym = item.symbol;
      var mkt = item.market;
      var localHist =
        typeof window.loadStockPriceHistory === 'function'
          ? window.loadStockPriceHistory(sym, mkt) || []
          : [];
      var embedded = Array.isArray(item.priceHistory) ? item.priceHistory : [];
      var cloudHist = [];
      try {
        cloudHist = await loadPriceSnapshotsFromCloud(sym, mkt, 365);
      } catch (_) {}
      var merged = mergePriceHistoryRows(localHist, embedded, cloudHist);
      if (typeof window.saveStockPriceHistory === 'function' && merged.length) {
        window.saveStockPriceHistory(sym, mkt, merged);
      }
      return Object.assign({}, item, { priceHistory: merged });
    }),
  );
  return enriched;
}

async function syncPortfolioToCloudImmediate(portfolio) {
  var base = getCloudApiBase();
  if (!base || !Array.isArray(portfolio)) return false;
  try {
    var res = await fetch(base + '/api/portfolio/save-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(portfolio),
    });
    if (!res.ok) return false;
    var snapItems = [];
    portfolio.forEach(function (stock) {
      var snap = buildSnapshotFromStock(stock, 'portfolio');
      if (snap) snapItems.push(snap);
      snapItems = snapItems.concat(
        buildSnapshotsFromHistory(stock.symbol, stock.market, stock.priceHistory, 'portfolio'),
      );
    });
    if (snapItems.length) await recordPriceSnapshots(snapItems);
    return true;
  } catch (e) {
    console.warn('同步投资组合到云端失败:', e.message || e);
    return false;
  }
}

var _syncPortfolioDebounced = debounceCloudSync(syncPortfolioToCloudImmediate, 1000);

async function syncPortfolioToCloud(portfolio) {
  if (isCloudPrimary()) {
    return syncPortfolioToCloudImmediate(portfolio);
  }
  _syncPortfolioDebounced(portfolio);
  return true;
}

async function loadPortfolioFromCloud() {
  var result = await fetchCloudPortfolio();
  if (!result.ok) return null;
  return result.items;
}

async function syncWatchlistToCloudImmediate(watchlist) {
  var base = getCloudApiBase();
  if (!base || !Array.isArray(watchlist)) return false;
  try {
    var res = await fetch(base + '/api/watchlist/replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: watchlist }),
    });
    if (!res.ok) return false;
    var snapItems = [];
    watchlist.forEach(function (item) {
      var snap = buildSnapshotFromStock(item, 'watchlist');
      if (snap) snapItems.push(snap);
      snapItems = snapItems.concat(
        buildSnapshotsFromHistory(item.symbol, item.market, item.priceHistory, 'watchlist'),
      );
    });
    if (snapItems.length) await recordPriceSnapshots(snapItems);
    return true;
  } catch (e) {
    console.warn('同步关注列表到云端失败:', e.message || e);
    return false;
  }
}

var _syncWatchlistDebounced = debounceCloudSync(syncWatchlistToCloudImmediate, 1000);

async function syncWatchlistToCloud(watchlist) {
  if (isCloudPrimary()) {
    return syncWatchlistToCloudImmediate(watchlist);
  }
  _syncWatchlistDebounced(watchlist);
  return true;
}

async function loadWatchlistFromCloud() {
  var result = await fetchCloudWatchlist();
  if (!result.ok) return null;
  return result.items;
}

async function syncCapitalPoolToCloudImmediate(pool) {
  var base = getCloudApiBase();
  if (!base || !pool) return false;
  try {
    var res = await fetch(base + '/api/capital-pool/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pool),
    });
    return res.ok;
  } catch (e) {
    console.warn('同步资金池到云端失败:', e.message || e);
    return false;
  }
}

var _syncCapitalDebounced = debounceCloudSync(syncCapitalPoolToCloudImmediate, 800);

async function syncCapitalPoolToCloud(pool) {
  if (isCloudPrimary()) {
    return syncCapitalPoolToCloudImmediate(pool);
  }
  _syncCapitalDebounced(pool);
  return true;
}

async function loadCapitalPoolFromCloud() {
  var result = await fetchCloudCapitalPool();
  if (!result.ok) return null;
  return result.pool;
}

async function loadPriceSnapshotsFromCloud(symbol, market, days) {
  var q =
    '/api/price-snapshots/history?symbol=' +
    encodeURIComponent(symbol) +
    '&market=' +
    encodeURIComponent(market) +
    '&days=' +
    encodeURIComponent(days || 30);
  var data = await cloudFetchJson(q);
  if (!data || !data.ok || !Array.isArray(data.history)) return [];
  return data.history;
}

/** 应用启动：加载投资组合（线上只读云端） */
async function loadAppPortfolio() {
  if (!isCloudPrimary()) {
    var local =
      typeof window.loadPortfolio === 'function' ? window.loadPortfolio() || [] : [];
    try {
      var cloud = await fetchCloudPortfolio();
      if (cloud.ok && cloud.items && cloud.items.length > 0) {
        var enriched = await enrichItemsWithCloudPriceHistory(cloud.items);
        if (typeof window.savePortfolio === 'function') {
          window.savePortfolio(enriched, { skipCloudSync: true });
        }
        return enriched;
      }
    } catch (_) {}
    if (local.length > 0) syncPortfolioToCloud(local);
    return local;
  }

  var cloud = await fetchCloudPortfolio();
  if (!cloud.ok) {
    console.warn('线上读取云端组合失败，回退本地缓存');
    return typeof window.loadPortfolio === 'function' ? window.loadPortfolio() || [] : [];
  }
  var items = await enrichItemsWithCloudPriceHistory(cloud.items || []);
  if (typeof window.savePortfolio === 'function') {
    window.savePortfolio(items, { skipCloudSync: true });
  }
  return items;
}

async function loadAppWatchlist() {
  if (!isCloudPrimary()) {
    var local =
      typeof window.loadWatchlist === 'function' ? window.loadWatchlist() || [] : [];
    try {
      var cloud = await fetchCloudWatchlist();
      if (cloud.ok && cloud.items && cloud.items.length > 0) {
        var enriched = await enrichItemsWithCloudPriceHistory(cloud.items);
        if (typeof window.saveWatchlist === 'function') {
          window.saveWatchlist(enriched, { skipCloudSync: true });
        }
        return enriched;
      }
    } catch (_) {}
    if (local.length > 0) syncWatchlistToCloud(local);
    return local;
  }

  var cloud = await fetchCloudWatchlist();
  if (!cloud.ok) {
    console.warn('线上读取云端关注列表失败，回退本地缓存');
    return typeof window.loadWatchlist === 'function' ? window.loadWatchlist() || [] : [];
  }
  var items = await enrichItemsWithCloudPriceHistory(cloud.items || []);
  if (typeof window.saveWatchlist === 'function') {
    window.saveWatchlist(items, { skipCloudSync: true });
  }
  return items;
}

async function loadAppCapitalPool() {
  if (!isCloudPrimary()) {
    var local =
      typeof window.loadCapitalPool === 'function'
        ? window.loadCapitalPool() || { usd: 0, hkd: 0, cny: 0 }
        : { usd: 0, hkd: 0, cny: 0 };
    try {
      var cloud = await fetchCloudCapitalPool();
      if (cloud.ok && cloud.pool) {
        if (typeof window.saveCapitalPool === 'function') {
          window.saveCapitalPool(cloud.pool, { skipCloudSync: true });
        }
        return cloud.pool;
      }
    } catch (_) {}
    syncCapitalPoolToCloud(local);
    return local;
  }

  var cloud = await fetchCloudCapitalPool();
  if (!cloud.ok) {
    return typeof window.loadCapitalPool === 'function'
      ? window.loadCapitalPool() || { usd: 0, hkd: 0, cny: 0 }
      : { usd: 0, hkd: 0, cny: 0 };
  }
  if (typeof window.saveCapitalPool === 'function') {
    window.saveCapitalPool(cloud.pool, { skipCloudSync: true });
  }
  return cloud.pool;
}

async function persistAppPortfolio(portfolio) {
  if (isCloudPrimary()) {
    return syncPortfolioToCloudImmediate(portfolio);
  }
  return syncPortfolioToCloud(portfolio);
}

async function persistAppWatchlist(watchlist) {
  if (isCloudPrimary()) {
    return syncWatchlistToCloudImmediate(watchlist);
  }
  return syncWatchlistToCloud(watchlist);
}

async function persistAppCapitalPool(pool) {
  if (isCloudPrimary()) {
    return syncCapitalPoolToCloudImmediate(pool);
  }
  return syncCapitalPoolToCloud(pool);
}

window.isCloudPrimary = isCloudPrimary;
window.getCloudApiBase = getCloudApiBase;
window.mergePriceHistoryRows = mergePriceHistoryRows;
window.syncPortfolioToCloud = syncPortfolioToCloud;
window.loadPortfolioFromCloud = loadPortfolioFromCloud;
window.syncWatchlistToCloud = syncWatchlistToCloud;
window.loadWatchlistFromCloud = loadWatchlistFromCloud;
window.syncCapitalPoolToCloud = syncCapitalPoolToCloud;
window.loadCapitalPoolFromCloud = loadCapitalPoolFromCloud;
window.recordPriceSnapshot = recordPriceSnapshot;
window.recordPriceSnapshots = recordPriceSnapshots;
window.recordStockPriceHistory = recordStockPriceHistory;
window.loadPriceSnapshotsFromCloud = loadPriceSnapshotsFromCloud;
window.loadAppPortfolio = loadAppPortfolio;
window.loadAppWatchlist = loadAppWatchlist;
window.loadAppCapitalPool = loadAppCapitalPool;
window.persistAppPortfolio = persistAppPortfolio;
window.persistAppWatchlist = persistAppWatchlist;
window.persistAppCapitalPool = persistAppCapitalPool;
