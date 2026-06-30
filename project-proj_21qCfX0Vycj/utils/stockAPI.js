// Stock API utility functions for US, HK and CN markets
const API_CONFIG = {
  ALPHA_VANTAGE_KEY: (window.API_CONFIG?.ALPHA_VANTAGE_KEY || '').trim(),
  BIYING_SECRET_KEY: (window.API_CONFIG?.BIYING_SECRET_KEY || '').trim(),
  CN_STOCK_API_KEY: (window.API_CONFIG?.CN_STOCK_API_KEY || '').trim(),
  PROXY_BASE: window.API_CONFIG?.PROXY_BASE || '',
  HK_EXCHANGE_RATE: 7.78, // USD to HKD
  CN_EXCHANGE_RATE: 1, // CNY to CNY
  REQUEST_TIMEOUT: 10000 // 10 seconds timeout
};

// 检查是否配置了API密钥
function checkApiConfig() {
  const missing = [];
  if (!window.API_CONFIG?.ALPHA_VANTAGE_KEY) {
    missing.push('Alpha Vantage (美股)');
  }
  if (!window.API_CONFIG?.CN_STOCK_API_KEY) {
    missing.push('A股 API');
  }
  if (missing.length > 0) {
    console.warn(`⚠️ 股小蜜: 以下API未配置，将使用模拟数据: ${missing.join(', ')}`);
    console.warn('请编辑 env.js 文件配置API密钥，或复制 env.js 为 env.local.js 并填入密钥');
  }
}

// 页面加载时检查配置
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkApiConfig);
} else {
  checkApiConfig();
}

let exchangeRateLastUpdated = null;

async function fetchExchangeRates() {
  try {
    const now = Date.now();
    if (exchangeRateLastUpdated && now - exchangeRateLastUpdated < 60 * 60 * 1000) {
      console.log('汇率缓存未过期，跳过获取');
      return;
    }
    
    console.log('开始获取实时汇率...');
    const apiUrl = 'https://api.frankfurter.app/latest?from=USD&to=HKD,CNY';
    let response;
    try {
      const proxyUrl = `https://proxy-api.trickle-app.host/?url=${encodeURIComponent(apiUrl)}`;
      response = await fetch(proxyUrl, {
        method: 'GET',
        headers: { Accept: '*/*' },
      });
      if (!response.ok) throw new Error(`proxy status ${response.status}`);
    } catch (proxyErr) {
      console.warn('汇率代理请求失败，尝试直连:', proxyErr.message);
      response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    }

    const data = await response.json();
    
    if (data.rates && data.rates.HKD) {
      API_CONFIG.HK_EXCHANGE_RATE = data.rates.HKD;
    }
    if (data.rates && data.rates.CNY) {
      API_CONFIG.CN_EXCHANGE_RATE = data.rates.CNY;
    }
    
    exchangeRateLastUpdated = now;
    console.log(`汇率更新成功: USD/HKD=${API_CONFIG.HK_EXCHANGE_RATE}, USD/CNY=${API_CONFIG.CN_EXCHANGE_RATE}`);
  } catch (error) {
    console.warn(`获取汇率失败，使用默认值: ${error.message}`);
  }
}

function getExchangeRate(market) {
  if (market === 'HK') return API_CONFIG.HK_EXCHANGE_RATE;
  if (market === 'CN') return API_CONFIG.CN_EXCHANGE_RATE;
  return 1;
}

function debounce(fn, delay) {
  let timer = null;
  return function(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function throttle(fn, limit) {
  let inThrottle = false;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

async function getStockPrice(symbol, market) {
  try {
    console.log(`开始获取股价: ${symbol} (${market})`);
    
    if (market === 'US') {
      try {
        return await getUSStockPrice(symbol);
      } catch (apiError) {
        console.warn(`美股API失败，使用模拟数据: ${apiError.message}`);
        return generateMockUSData(symbol);
      }
    } else if (market === 'HK') {
      try {
        return await getHKStockPrice(symbol);
      } catch (apiError) {
        console.warn(`港股API失败，使用模拟数据: ${apiError.message}`);
        return generateMockHKData(symbol);
      }
    } else if (market === 'CN') {
      try {
        return await getCNStockPrice(symbol);
      } catch (apiError) {
        console.warn(`A股API失败，使用模拟数据: ${apiError.message}`);
        return generateMockCNData(symbol);
      }
    }
    throw new Error('不支持的市场类型');
  } catch (error) {
    console.error(`获取 ${symbol} 股价失败:`, error.message);
    
    if (market === 'HK') {
      return generateMockHKData(symbol);
    } else if (market === 'CN') {
      return generateMockCNData(symbol);
    } else {
      return generateMockUSData(symbol);
    }
  }
}

// Make function available globally
window.generateMockUSData = generateMockUSData;
function generateMockUSData(symbol) {
  const basePrice = symbol === 'AAPL' ? 150 : 
                   symbol === 'TSLA' ? 250 : 
                   symbol === 'MSFT' ? 300 : 
                   Math.random() * 200 + 50;
  
  const variance = basePrice * 0.05;
  const price = basePrice + (Math.random() - 0.5) * variance;
  
  const prevClose = Math.round((price / (1 + (Math.random() - 0.5) * 0.02)) * 1000) / 1000;
  return {
    price: Math.round(price * 1000) / 1000,
    open: Math.round((price * (0.98 + Math.random() * 0.04)) * 1000) / 1000,
    high: Math.round((price * (1.00 + Math.random() * 0.03)) * 1000) / 1000,
    low: Math.round((price * (0.97 + Math.random() * 0.03)) * 1000) / 1000,
    volume: Math.floor(Math.random() * 50000000),
    previousClose: prevClose,
    change: Math.round((price - prevClose) * 1000) / 1000,
    changePercent: Math.round(((price - prevClose) / Math.max(prevClose, 0.0001)) * 10000) / 100,
    symbol: symbol,
    market: 'US',
    isMock: true
  };
}

// Utility functions for formatting
function formatVolume(volume) {
  var v = Number(volume);
  if (!Number.isFinite(v) || v < 0) return "0";
  if (v >= 1000000) {
    return (v / 1000000).toFixed(1) + "M";
  }
  if (v >= 1000) {
    return (v / 1000).toFixed(0) + "K";
  }
  return String(v);
}

function convertCurrency(amount, fromMarket, toMarket = 'HK', exchangeRate = 7.78) {
  if (fromMarket === 'US' && toMarket === 'HK') {
    return amount * exchangeRate;
  } else if (fromMarket === 'HK' && toMarket === 'US') {
    return amount / exchangeRate;
  }
  return amount;
}

// Format HK stock symbol to 5-digit format as required by BiYing API
/**
 * 拉取腾讯 qt.gtimg.cn 文本；优先 trickle 代理，失败则尝试直连（部分环境可跨域）。
 */
async function fetchGtimgQuoteText(apiUrl, signal) {
  const proxyUrl = `https://proxy-api.trickle-app.host/?url=${encodeURIComponent(apiUrl)}`;
  let proxyErr = null;
  try {
    const res = await fetch(proxyUrl, {
      method: 'GET',
      signal,
      headers: { Accept: '*/*' },
    });
    if (res.ok) {
      const text = await res.text();
      if (text && text.length > 8 && /="/.test(text)) return text;
    }
    proxyErr = new Error(`代理响应异常 ${res.status}`);
  } catch (e) {
    proxyErr = e;
  }
  try {
    const direct = await fetch(apiUrl, {
      method: 'GET',
      signal,
      headers: { Accept: '*/*' },
      mode: 'cors',
    });
    if (direct.ok) {
      const text = await direct.text();
      if (text && text.length > 8 && /="/.test(text)) {
        console.warn('腾讯行情：代理不可用，已改用直连');
        return text;
      }
    }
  } catch (_) {
    /* 浏览器 CORS 阻断时只能依赖代理 */
  }
  throw proxyErr || new Error('腾讯行情请求失败');
}

/**
 * 解析 v_hk00700="..." / v_sh600000="..." 。
 * 旧逻辑要求 split 后长度 ≥50，但实盘常仅 30～40 段，导致误报失败并落入模拟数据。
 */
function parseTencentGtimgLine(text) {
  const match = text.match(/v_[a-zA-Z0-9_]+="([^"]*)"/);
  if (!match || match[1] == null || match[1] === '') {
    throw new Error('无法解析API响应数据');
  }
  const dataArray = match[1].split('~');
  if (dataArray.length < 6) {
    throw new Error('API返回数据字段不足');
  }

  const price = parseFloat(dataArray[3]) || 0;
  const previousClose = parseFloat(dataArray[4]) || 0;
  const open = parseFloat(dataArray[5]) || 0;
  const volumeHands = parseFloat(dataArray[6]) || 0;

  let high = dataArray.length > 33 ? parseFloat(dataArray[33]) || 0 : 0;
  let low = dataArray.length > 34 ? parseFloat(dataArray[34]) || 0 : 0;
  if (high <= 0 || low <= 0) {
    const candidates = [price, open, previousClose].filter((x) => x > 0);
    const mx = candidates.length ? Math.max(...candidates) : price;
    const mn = candidates.length ? Math.min(...candidates) : price;
    if (high <= 0) high = mx;
    if (low <= 0) low = mn > 0 ? mn : price;
  }

  let changePercent =
    dataArray.length > 32 && dataArray[32] !== ''
      ? parseFloat(String(dataArray[32]).replace('%', '')) || 0
      : 0;
  if (
    changePercent === 0 &&
    previousClose > 0 &&
    price > 0 &&
    price !== previousClose
  ) {
    changePercent = ((price - previousClose) / previousClose) * 100;
  }

  const change = previousClose > 0 ? price - previousClose : 0;

  if (isNaN(price) || price <= 0) {
    throw new Error('返回数据中没有有效的价格信息');
  }

  return {
    price,
    open,
    high,
    low,
    volumeHands,
    previousClose,
    change,
    changePercent,
  };
}

function formatHKStockSymbol(symbol) {
  try {
    if (!symbol) {
      throw new Error('请输入股票代码');
    }
    
    // Remove any non-numeric characters
    const numericSymbol = symbol.replace(/\D/g, '');
    
    if (numericSymbol.length === 0) {
      throw new Error('无效的港股代码格式');
    }
    
    // Pad with leading zeros to make it 5 digits (BiYing API requirement)
    const hkStockCode = numericSymbol.padStart(5, '0');
    
    console.log(`港股代码格式化: ${symbol} -> ${hkStockCode}`);
    return hkStockCode;
  } catch (error) {
    console.error('港股代码格式化失败:', error);
    throw new Error(`港股代码格式化失败: ${symbol}`);
  }
}

async function getUSStockPrice(symbol) {
  if (!API_CONFIG.ALPHA_VANTAGE_KEY) {
    throw new Error('Alpha Vantage API Key 未配置');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.REQUEST_TIMEOUT);
  
  try {
    console.log(`开始获取美股 ${symbol} 数据，使用Alpha Vantage API`);
    
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_CONFIG.ALPHA_VANTAGE_KEY}`;
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'StockPortfolioApp/1.0'
      }
    });
    
    clearTimeout(timeoutId);
    
    console.log(`Alpha Vantage API响应状态: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const text = await response.text();
    console.log(`Alpha Vantage API响应内容长度: ${text.length} 字符`);
    console.log(`Alpha Vantage API响应前200字符: ${text.substring(0, 200)}`);
    
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error('JSON解析失败:', parseError);
      throw new Error('API返回的数据不是有效的JSON格式');
    }
    
    console.log('Alpha Vantage API解析后的数据结构:', typeof data, Object.keys(data || {}));
    
    // Check for API error responses first
    if (data['Error Message']) {
      console.error('Alpha Vantage API错误:', data['Error Message']);
      throw new Error(`API错误: ${data['Error Message']}`);
    }
    
    if (data['Note']) {
      console.warn('Alpha Vantage API频率限制:', data['Note']);
      throw new Error('API调用频率限制，请稍后再试');
    }
    
    // Check for valid quote data
    if (data['Global Quote'] && Object.keys(data['Global Quote']).length > 0) {
      const quote = data['Global Quote'];
      console.log('Alpha Vantage API获取到有效数据:', quote);
      
      const price = parseFloat(quote['05. price']) || 0;
      const previousClose = parseFloat(quote['08. previous close']) || 0;
      const change = parseFloat(quote['09. change']) || 0;
      const changePercent = parseFloat(quote['10. change percent']?.replace('%', '')) || 0;
      
      if (price <= 0) {
        console.warn('Alpha Vantage API返回的价格无效:', quote['05. price']);
        throw new Error('API返回的股价数据无效');
      }
      
      const result = {
        price: Math.round(price * 1000) / 1000,
        open: Math.round((parseFloat(quote['02. open']) || 0) * 1000) / 1000,
        high: Math.round((parseFloat(quote['03. high']) || 0) * 1000) / 1000,
        low: Math.round((parseFloat(quote['04. low']) || 0) * 1000) / 1000,
        volume: parseInt(quote['06. volume']) || 0,
        previousClose: Math.round(previousClose * 1000) / 1000,
        change: Math.round(change * 1000) / 1000,
        changePercent: Math.round(changePercent * 100) / 100,
        symbol: symbol,
        market: 'US'
      };
      
      console.log(`成功获取美股 ${symbol} 数据: $${result.price}`);
      return result;
    }
    
    console.error('Alpha Vantage API返回数据格式异常:', data);
    throw new Error('API返回数据格式无效或股票代码不存在');
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      console.warn('美股API请求超时，使用模拟数据');
    } else {
      console.error('获取美股价格失败:', error.message);
    }
    
    throw error;
  }
}

async function getUSTechnicalIndicators(symbol) {
  try {
    console.log(`获取美股 ${symbol} 技术指标...`);
    
    // Fetch SMA (Simple Moving Average)
    const smaUrl = `https://www.alphavantage.co/query?function=SMA&symbol=${symbol}&interval=daily&time_period=5&series_type=close&apikey=${API_CONFIG.ALPHA_VANTAGE_KEY}`;
    const smaResponse = await fetch(smaUrl);
    const smaData = await smaResponse.json();
    
    // Fetch RSI (Relative Strength Index)
    const rsiUrl = `https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=daily&time_period=14&series_type=close&apikey=${API_CONFIG.ALPHA_VANTAGE_KEY}`;
    const rsiResponse = await fetch(rsiUrl);
    const rsiData = await rsiResponse.json();
    
    let ma5 = 0, ma10 = 0, rsi = 0;
    
    if (smaData['Technical Analysis: SMA']) {
      const dates = Object.keys(smaData['Technical Analysis: SMA']);
      if (dates.length > 0) {
        ma5 = parseFloat(smaData['Technical Analysis: SMA'][dates[0]]['SMA']) || 0;
      }
    }
    
    if (rsiData['Technical Analysis: RSI']) {
      const dates = Object.keys(rsiData['Technical Analysis: RSI']);
      if (dates.length > 0) {
        rsi = parseFloat(rsiData['Technical Analysis: RSI'][dates[0]]['RSI']) || 0;
      }
    }
    
    return { ma5, ma10, rsi };
  } catch (error) {
    console.error('获取美股技术指标失败:', error);
    return { ma5: 0, ma10: 0, rsi: 0 };
  }
}

async function getHKStockPrice(symbol) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.REQUEST_TIMEOUT);
  
  try {
    console.log(`尝试获取港股 ${symbol} 数据，使用腾讯财经API`);
    
    // Format HK stock symbol to 5-digit format
    const hkStockCode = formatHKStockSymbol(symbol);
    
    // Use Tencent Finance API - format: hk + stock code
    const fullSymbol = `hk${hkStockCode}`;
    const apiUrl = `https://qt.gtimg.cn/q=${fullSymbol}`;

    console.log(`格式化后的港股代码: ${hkStockCode}`);
    console.log(`腾讯财经API URL: ${apiUrl}`);

    const text = await fetchGtimgQuoteText(apiUrl, controller.signal);
    clearTimeout(timeoutId);

    console.log(`腾讯财经API响应: ${text.substring(0, 200)}`);

    const parsed = parseTencentGtimgLine(text);
    const { price, previousClose, open, high, low, volumeHands, change, changePercent } =
      parsed;

    console.log(
      `解析的港股数据: price=${price}, previousClose=${previousClose}, changePercent=${changePercent}`,
    );

    return {
      price: Math.round(price * 1000) / 1000,
      open: Math.round(open * 1000) / 1000,
      high: Math.round(high * 1000) / 1000,
      low: Math.round(low * 1000) / 1000,
      volume: Math.floor(volumeHands * 100),
      previousClose: Math.round(previousClose * 1000) / 1000,
      change: Math.round(change * 1000) / 1000,
      changePercent: Math.round(changePercent * 100) / 100,
      symbol: hkStockCode,
      market: 'HK',
    };
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      console.warn('港股API请求超时');
    } else {
      console.error('港股API请求失败:', error);
    }
    
    throw error;
  }
}

function validateHKStockData(data) {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.price === 'number' &&
    data.price > 0 &&
    data.symbol &&
    data.market === 'HK'
  );
}





// Make function available globally
window.generateMockHKData = generateMockHKData;
function generateMockHKData(symbol) {
  const basePrice = symbol === '00700' ? 400 : 
                   symbol === '09988' ? 80 : 
                   symbol === '03690' ? 180 : 
                   Math.random() * 200 + 50;
  
  const variance = basePrice * 0.05;
  const price = basePrice + (Math.random() - 0.5) * variance;
  
  const prevClose = Math.round((price / (1 + (Math.random() - 0.5) * 0.02)) * 1000) / 1000;
  return {
    price: Math.round(price * 1000) / 1000,
    open: Math.round((price * (0.98 + Math.random() * 0.04)) * 1000) / 1000,
    high: Math.round((price * (1.00 + Math.random() * 0.03)) * 1000) / 1000,
    low: Math.round((price * (0.97 + Math.random() * 0.03)) * 1000) / 1000,
    volume: Math.floor(Math.random() * 10000000),
    previousClose: prevClose,
    change: Math.round((price - prevClose) * 1000) / 1000,
    changePercent: Math.round(((price - prevClose) / Math.max(prevClose, 0.0001)) * 10000) / 100,
    symbol: symbol,
    market: 'HK',
    isMock: true
  };
}

// Make function available globally
window.generateMockCNData = generateMockCNData;
function generateMockCNData(symbol) {
  const basePrice = symbol === '000001' ? 15 : 
                   symbol === '600036' ? 45 : 
                   symbol === '300059' ? 25 : 
                   Math.random() * 50 + 10;
  
  const variance = basePrice * 0.05;
  const price = basePrice + (Math.random() - 0.5) * variance;
  
  const prevClose = Math.round((price / (1 + (Math.random() - 0.5) * 0.02)) * 100) / 100;
  return {
    price: Math.round(price * 100) / 100,
    open: Math.round((price * (0.98 + Math.random() * 0.04)) * 100) / 100,
    high: Math.round((price * (1.00 + Math.random() * 0.03)) * 100) / 100,
    low: Math.round((price * (0.97 + Math.random() * 0.03)) * 100) / 100,
    volume: Math.floor(Math.random() * 100000000),
    previousClose: prevClose,
    change: Math.round((price - prevClose) * 100) / 100,
    changePercent: Math.round(((price - prevClose) / Math.max(prevClose, 0.0001)) * 10000) / 100,
    symbol: symbol,
    market: 'CN',
    isMock: true
  };
}

async function getCNStockPrice(symbol) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.REQUEST_TIMEOUT);
  
  try {
    console.log(`尝试获取A股 ${symbol} 数据`);
    
    // Format CN stock symbol (6 digits)
    const cnStockCode = symbol.replace(/\D/g, '').padStart(6, '0');
    
    // Determine market prefix (sh for Shanghai, sz for Shenzhen)
    const marketPrefix = cnStockCode.startsWith('6') ? 'sh' : 'sz';
    const fullSymbol = `${marketPrefix}${cnStockCode}`;
    
    console.log(`A股代码格式化: ${symbol} -> ${fullSymbol}`);
    
    const apiUrl = `https://qt.gtimg.cn/q=${fullSymbol}`;

    console.log(`使用腾讯财经API: ${apiUrl}`);

    const text = await fetchGtimgQuoteText(apiUrl, controller.signal);
    clearTimeout(timeoutId);

    console.log(`腾讯财经API响应: ${text.substring(0, 200)}`);

    const parsed = parseTencentGtimgLine(text);
    const { price, previousClose, open, high, low, volumeHands, change, changePercent } =
      parsed;

    console.log(
      `解析的A股数据: price=${price}, previousClose=${previousClose}, changePercent=${changePercent}`,
    );

    return {
      price: Math.round(price * 100) / 100,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      volume: Math.floor(volumeHands * 100),
      previousClose: Math.round(previousClose * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      symbol: cnStockCode,
      market: 'CN',
    };
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      console.warn('A股API请求超时');
    } else {
      console.error('A股API请求失败:', error);
    }
    
    throw error;
  }
}
