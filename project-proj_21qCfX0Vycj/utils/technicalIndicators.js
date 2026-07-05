// Technical indicators calculation utilities for HK and CN stocks

// Calculate Simple Moving Average
function calculateSMA(prices, period) {
  if (!prices || prices.length < period) return 0;
  
  const slice = prices.slice(0, period);
  const sum = slice.reduce((acc, price) => acc + price, 0);
  return Math.round((sum / period) * 1000) / 1000;
}

// Calculate Relative Strength Index
function calculateRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) return 0;
  
  let gains = 0;
  let losses = 0;
  
  // Calculate initial average gain and loss
  for (let i = 1; i <= period; i++) {
    const change = prices[i - 1] - prices[i];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  return Math.round(rsi * 100) / 100;
}

// Get historical data for US stocks. Yahoo is keyless and works well for the trend chart;
// Alpha Vantage remains as a configured backup.
async function getUSYahooHistoricalData(symbol) {
  const ticker = String(symbol || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
  if (!ticker) return [];
  const parseYahooChart = (data) => {
    const result = data?.chart?.result?.[0];
    const timestamps = result?.timestamp || [];
    const quote = result?.indicators?.quote?.[0] || {};
    const opens = quote.open || [];
    const highs = quote.high || [];
    const lows = quote.low || [];
    const closes = quote.close || [];
    const volumes = quote.volume || [];
    return timestamps.map((ts, idx) => {
      const close = Number(closes[idx]);
      if (!Number.isFinite(close) || close <= 0) return null;
      return {
        date: new Date(Number(ts) * 1000).toISOString().slice(0, 10),
        open: Number(opens[idx]) || null,
        high: Number(highs[idx]) || null,
        low: Number(lows[idx]) || null,
        close,
        volume: Number(volumes[idx]) || 0,
        source: 'Yahoo Finance'
      };
    }).filter(Boolean);
  };
  const fetchYahoo = async (url) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`Yahoo Finance HTTP ${response.status}`);
      const text = await response.text();
      return parseYahooChart(JSON.parse(text));
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };
  try {
    console.log(`获取美股 ${ticker} 历史数据(Yahoo Finance)`);
    const params = new URLSearchParams({ range: '3mo', interval: '1d' });
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?${params.toString()}`;
    let history = [];
    try {
      history = await fetchYahoo(yahooUrl);
    } catch (directError) {
      console.warn('Yahoo Finance 直连失败，尝试代理:', directError);
      const proxyUrl = `https://proxy-api.trickle-app.host/?url=${encodeURIComponent(yahooUrl)}`;
      history = await fetchYahoo(proxyUrl);
    }
    console.log(`Yahoo Finance 美股历史记录条数: ${history.length}`);
    if (history.length) {
      window.LAST_HISTORY_FETCH_META = { ok: true, source: 'Yahoo Finance', history };
    }
    return history;
  } catch (err) {
    console.warn('Yahoo Finance 美股历史数据获取失败', err);
    return [];
  }
}

async function getUSAlphaVantageHistoricalData(symbol) {
  const key = ((window.API_CONFIG && window.API_CONFIG.ALPHA_VANTAGE_KEY) || '').trim();
  if (!key) {
    console.warn('Alpha Vantage API Key 未配置，跳过美股历史技术指标');
    return [];
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    console.log(`获取美股 ${symbol} 历史数据(Alpha Vantage)`);
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${key}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`Alpha Vantage HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!data['Time Series (Daily)']) {
      console.warn('Alpha Vantage 无历史数据', data);
      window.LAST_HISTORY_FETCH_META = { ok: false, source: 'Alpha Vantage', detail: data?.Note || data?.Information || data?.['Error Message'] || 'Alpha Vantage 未返回日线' };
      return [];
    }
    const series = data['Time Series (Daily)'];
    const history = Object.keys(series)
      .sort((a, b) => new Date(a) - new Date(b))
      .map(date => {
        const point = series[date];
        return {
          date,
          open: parseFloat(point['1. open']),
          high: parseFloat(point['2. high']),
          low: parseFloat(point['3. low']),
          close: parseFloat(point['4. close']),
          volume: parseInt(point['6. volume']) || 0
        };
      });

    console.log(`美股历史记录条数: ${history.length}`);
    if (history.length) {
      window.LAST_HISTORY_FETCH_META = { ok: true, source: 'Alpha Vantage', history };
    }
    return history;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('美股历史数据获取失败', err);
    return [];
  }
}

async function getUSHistoricalData(symbol) {
  const yahoo = await getUSYahooHistoricalData(symbol);
  if (yahoo && yahoo.length) return yahoo;
  return getUSAlphaVantageHistoricalData(symbol);
}

async function getHistoricalDataAndIndicators(symbol, market) {
  try {
    console.log(`获取 ${market} ${symbol} 历史数据用于计算技术指标...`);

    if (market === 'US') {
      const history = await getUSHistoricalData(symbol);
      if (!history || history.length === 0) {
        return { ma5: 0, ma10: 0, rsi: 0, history: [] };
      }
      const closePrices = history.map(item => item.close);
      const ma5 = calculateSMA(closePrices, 5);
      const ma10 = calculateSMA(closePrices, 10);
      const rsi = calculateRSI(closePrices, 14);
      return { ma5, ma10, rsi, history };
    }

    const formattedSymbol = market === 'HK' 
      ? `hk${symbol.replace(/\D/g, '').padStart(5, '0')}`
      : market === 'CN'
      ? (symbol.startsWith('6') ? 'sh' : 'sz') + symbol.replace(/\D/g, '').padStart(6, '0')
      : symbol;
    
    console.log(`格式化后的股票代码: ${formattedSymbol}`);
    
    // Use Tencent Finance historical data API (last 30 days)
    const apiUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${formattedSymbol},day,,,30,qfq`;
    const proxyUrl = `https://proxy-api.trickle-app.host/?url=${encodeURIComponent(apiUrl)}`;
    
    console.log(`请求历史数据API: ${apiUrl}`);
    
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`获取历史数据失败: ${response.status}`);
    }
    
    const text = await response.text();
    console.log(`历史数据API响应前200字符: ${text.substring(0, 200)}`);
    
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error('JSON解析失败:', parseError);
      throw new Error('API返回的数据不是有效的JSON格式');
    }
    
    console.log('解析后的数据结构:', JSON.stringify(data).substring(0, 300));
    
    // Check for different possible data structures
    let dayData = null;
    
    if (data.data && data.data[formattedSymbol]) {
      if (data.data[formattedSymbol].qfqday) {
        dayData = data.data[formattedSymbol].qfqday;
      } else if (data.data[formattedSymbol].day) {
        dayData = data.data[formattedSymbol].day;
      }
    }
    
    if (!dayData || !Array.isArray(dayData) || dayData.length === 0) {
      console.warn(`未找到有效的历史数据，数据结构: ${JSON.stringify(data)}`);
      // 可能是接口或代理问题，尝试搜狐备用接口
      const sohuHistory = await getHistoricalCloseFromSohu(symbol, market);
      if (sohuHistory && sohuHistory.length > 0) {
        console.log(`已使用搜狐api作为回退，获取到 ${sohuHistory.length} 条历史数据`);
        const history = sohuHistory.map(item => ({
          date: item.date,
          open: item.open,
          close: item.close,
          high: item.high,
          low: item.low,
          volume: item.volume
        }));

        const closePrices = history.map(item => item.close);
        const ma5 = calculateSMA(closePrices, 5);
        const ma10 = calculateSMA(closePrices, 10);
        const rsi = calculateRSI(closePrices, 14);

        return { ma5, ma10, rsi, history };
      }

      throw new Error('历史数据格式无效或数据为空');
    }
    
    console.log(`找到 ${dayData.length} 天的历史数据，第一条数据: ${JSON.stringify(dayData[0])}`);
    
    // 按日期升序提取历史日线（date, open, close, high, low, volume）
    const history = dayData
      .map(item => ({
        date: item[0],
        open: parseFloat(item[1]),
        close: parseFloat(item[2]),
        high: parseFloat(item[3]),
        low: parseFloat(item[4]),
        volume: parseFloat(item[5])
      }))
      .reverse();

    const closePrices = history.map(item => item.close);

    console.log(`提取到 ${closePrices.length} 个收盘价，前5个: ${closePrices.slice(0, 5).join(', ')}`);

    // Calculate indicators
    const ma5 = calculateSMA(closePrices, 5);
    const ma10 = calculateSMA(closePrices, 10);
    const rsi = calculateRSI(closePrices, 14);

    console.log(`计算完成 - MA5: ${ma5}, MA10: ${ma10}, RSI: ${rsi}`);

    return { ma5, ma10, rsi, history };

    
  } catch (error) {
    console.error(`获取历史数据和技术指标失败:`, error);
    return { ma5: 0, ma10: 0, rsi: 0, history: [] };
  }
}

function formatDateYYYYMMDD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function getHistoricalCloseFromSohu(symbol, market) {
  try {
    const code = symbol.replace(/\D/g, '');
    let sohuCode;
    if (market === 'HK') {
      sohuCode = `hk_${code.padStart(5, '0')}`;
    } else if (market === 'CN') {
      const c = code.padStart(6, '0');
      sohuCode = c.startsWith('6') ? `cn_sh${c}` : `cn_sz${c}`;
    } else {
      return [];
    }

    const end = new Date();
    const start = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const startStr = formatDateYYYYMMDD(start).replace(/-/g, '');
    const endStr = formatDateYYYYMMDD(end).replace(/-/g, '');
    const url = `https://q.stock.sohu.com/hisHq?code=${sohuCode}&start=${startStr}&end=${endStr}&stat=1&order=D&count=60`;

    console.log(`尝试使用SOHU历史接口: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`SOHU历史接口响应失败: ${response.status}`);
      return [];
    }

    const json = await response.json();
    if (!Array.isArray(json) || json.length === 0 || !Array.isArray(json[0].hq)) {
      console.warn('SOHU历史接口返回格式异常', json);
      return [];
    }

    return json[0].hq.map(item => ({
      date: item[0],
      open: parseFloat(item[1]),
      close: parseFloat(item[2]),
      high: parseFloat(item[3]),
      low: parseFloat(item[4]),
      volume: parseFloat(item[5])
    }));
  } catch (err) {
    console.error('SOHU历史接口异常', err);
    return [];
  }
}

function getHistoryApiBase() {
  if (window.ANALYSIS_API_BASE) return String(window.ANALYSIS_API_BASE).replace(/\/+$/, '');
  const h = typeof location !== 'undefined' ? location.hostname : '';
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:8123';
  return typeof location !== 'undefined' && location.origin ? location.origin : '';
}

function getHistoryApiCandidates() {
  const list = [];
  const add = (url) => {
    const s = String(url || '').trim().replace(/\/+$/, '');
    if (s && !list.includes(s)) list.push(s);
  };
  add(window.ANALYSIS_API_BASE);
  const h = typeof location !== 'undefined' ? location.hostname : '';
  if (h === 'localhost' || h === '127.0.0.1') {
    add('http://localhost:8123');
    add('http://localhost:8124');
    add('http://localhost:8125');
  }
  if (typeof location !== 'undefined' && location.origin) add(location.origin);
  return list;
}

async function getHistoricalCloseFromBackend(symbol, market, days = 30) {
  const candidates = getHistoryApiCandidates();
  if (!candidates.length) return null;
  const params = new URLSearchParams({
    symbol: String(symbol || '').trim(),
    market: String(market || '').trim(),
    days: String(days || 30)
  });
  const errors = [];
  for (const apiBase of candidates) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${apiBase}/api/stock/history?${params.toString()}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        errors.push(`${apiBase}: HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      window.LAST_HISTORY_FETCH_META = { ...(data || {}), api_base: apiBase };
      if (!data || !Array.isArray(data.history) || data.history.length === 0) return data || null;
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      errors.push(`${apiBase}: ${error && error.message ? error.message : error}`);
    }
  }
  window.LAST_HISTORY_FETCH_META = {
    ok: false,
    history: [],
    errors,
    detail: '后端历史行情接口不可用或不是最新版本'
  };
  console.warn('后端历史行情接口不可用:', errors);
  return null;
}

async function getHistoricalClose30Days(symbol, market, totalShares = 0) {
  try {
    window.LAST_HISTORY_FETCH_META = null;
    const backend = await getHistoricalCloseFromBackend(symbol, market, 30);
    if (backend && Array.isArray(backend.history) && backend.history.length > 0) {
      const shares = Number.isFinite(totalShares) && totalShares > 0 ? totalShares : 0;
      return backend.history.map((item, idx, arr) => ({
        date: item.date,
        price: Number(item.price || item.close),
        close: Number(item.close || item.price),
        open: item.open,
        high: item.high,
        low: item.low,
        volume: item.volume,
        source: backend.source || 'backend',
        shares: shares,
        dailyProfit: shares > 0 && idx > 0
          ? Math.round((Number(item.close || item.price) - Number(arr[idx - 1].close || arr[idx - 1].price)) * shares * 100) / 100
          : 0
      }));
    }

    const result = await getHistoricalDataAndIndicators(symbol, market);
    if (!result || !Array.isArray(result.history) || result.history.length === 0) {
      window.LAST_HISTORY_FETCH_META = window.LAST_HISTORY_FETCH_META || { ok: false, detail: '历史数据源均未返回有效日线' };
      throw new Error('历史收盘数据为空');
    }

    const shares = Number.isFinite(totalShares) && totalShares > 0 ? totalShares : 0;

    return result.history.map((item, idx) => ({
      date: item.date,
      price: item.close,
      close: item.close,
      shares: shares,
      dailyProfit: shares > 0 && idx > 0
        ? Math.round((item.close - result.history[idx - 1].close) * shares * 100) / 100
        : 0
    }));
  } catch (error) {
    console.error('获取历史30天收盘失败:', error);
    return [];
  }
}

window.getHistoricalClose30Days = getHistoricalClose30Days;

/**
 * 专业 K 线数据：优先后端统一日线（含 OHLC + 成交量），失败则回退浏览器直连数据源。
 * 返回 [{date, open, high, low, close, volume}]，最多 days 根（后端上限 120）。
 */
async function getDailyKLine(symbol, market, days = 120) {
  const want = Math.max(1, Math.min(Number(days) || 120, 120));
  try {
    const backend = await getHistoricalCloseFromBackend(symbol, market, want);
    if (backend && Array.isArray(backend.history) && backend.history.length > 0) {
      return backend.history
        .map(function (item) {
          const close = Number(item.close != null ? item.close : item.price);
          if (!Number.isFinite(close) || close <= 0) return null;
          function ohlc(v) {
            const n = Number(v);
            return Number.isFinite(n) && n > 0 ? n : null;
          }
          let open = ohlc(item.open);
          let high = ohlc(item.high);
          let low = ohlc(item.low);
          if (open == null) open = close;
          if (high == null) high = close;
          if (low == null) low = close;
          high = Math.max(high, open, close);
          low = Math.min(low, open, close);
          return {
            date: item.date,
            open: open,
            high: high,
            low: low,
            close: close,
            volume: Number(item.volume) || 0,
          };
        })
        .filter(Boolean);
    }
  } catch (error) {
    console.warn('getDailyKLine 后端历史失败，尝试浏览器直连:', error);
  }
  try {
    const result = await getHistoricalDataAndIndicators(symbol, market);
    if (result && Array.isArray(result.history) && result.history.length) {
      return result.history
        .map(function (item) {
          const close = Number(item.close != null ? item.close : item.price);
          if (!Number.isFinite(close) || close <= 0) return null;
          function ohlc(v) {
            const n = Number(v);
            return Number.isFinite(n) && n > 0 ? n : null;
          }
          let open = ohlc(item.open);
          let high = ohlc(item.high);
          let low = ohlc(item.low);
          if (open == null) open = close;
          if (high == null) high = close;
          if (low == null) low = close;
          high = Math.max(high, open, close);
          low = Math.min(low, open, close);
          return {
            date: item.date,
            open: open,
            high: high,
            low: low,
            close: close,
            volume: Number(item.volume) || 0,
          };
        })
        .filter(Boolean);
    }
  } catch (error) {
    console.warn('getDailyKLine 浏览器直连失败:', error);
  }
  return [];
}

window.getDailyKLine = getDailyKLine;

