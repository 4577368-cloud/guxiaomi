// Stock API utility functions for US, HK and CN markets
const API_CONFIG = {
  ALPHA_VANTAGE_KEY: '9555C3GN360DR3OW',
  BIYING_SECRET_KEY: 'A48A2FA7-E039-4B2D-B551-4C10A53D9BDD',
  CN_STOCK_API_KEY: 'a4e5c8be774842f162cf08886ff442dfbfe38eb1c64f712434d6303f',
  HK_EXCHANGE_RATE: 7.78, // USD to HKD
  CN_EXCHANGE_RATE: 1, // CNY to CNY
  REQUEST_TIMEOUT: 10000 // 10 seconds timeout
};

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
    
    // Return appropriate mock data based on market
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
  if (volume >= 1000000) {
    return (volume / 1000000).toFixed(1) + 'M';
  } else if (volume >= 1000) {
    return (volume / 1000).toFixed(0) + 'K';
  }
  return volume.toString();
}

function formatPrice(price, precision = 3) {
  const num = Number(price).toFixed(precision);
  const parts = num.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (parts[1]) {
    return `${parts[0]}.<span style="font-size: 0.7em; vertical-align: baseline;">${parts[1]}</span>`;
  }
  return parts[0];
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
    const proxyUrl = `https://proxy-api.trickle-app.host/?url=${encodeURIComponent(apiUrl)}`;
    
    console.log(`格式化后的港股代码: ${hkStockCode}`);
    console.log(`腾讯财经API URL: ${apiUrl}`);
    
    const response = await fetch(proxyUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': '*/*'
      }
    });
    
    clearTimeout(timeoutId);
    
    console.log(`腾讯财经API响应状态: ${response.status}`);
    
    if (!response.ok) {
      throw new Error(`网络响应异常: ${response.status}`);
    }
    
    const text = await response.text();
    console.log(`腾讯财经API响应: ${text.substring(0, 200)}`);
    
    // Parse Tencent Finance response format
    // Format: v_${fullSymbol}="51~股票名称~股票代码~当前价格~涨跌~涨跌%~成交量(手)~成交额(万)~...~今开~最高~最低~...";
    const match = text.match(/="(.+)"/);
    if (!match || !match[1]) {
      throw new Error('无法解析API响应数据');
    }
    
    const dataArray = match[1].split('~');
    if (dataArray.length < 50) {
      throw new Error('API返回数据不完整');
    }
    
    const price = parseFloat(dataArray[3]) || 0;   // Current price (index 3)
    const previousClose = parseFloat(dataArray[4]) || 0;  // Previous close (index 4)
    const open = parseFloat(dataArray[5]) || 0;    // Open price (index 5)
    const high = parseFloat(dataArray[33]) || 0;   // High price (index 33)
    const low = parseFloat(dataArray[34]) || 0;    // Low price (index 34)
    const volume = parseFloat(dataArray[6]) || 0;  // Volume in hands (index 6)
    const changePercent = parseFloat(dataArray[32]) || 0;  // Change percent (index 32)
    const change = previousClose > 0 ? price - previousClose : 0;
    
    console.log(`解析的港股数据: price=${price}, previousClose=${previousClose}, changePercent=${changePercent}`);
    
    if (isNaN(price) || price <= 0) {
      throw new Error('返回数据中没有有效的价格信息');
    }
    
    return {
      price: Math.round(price * 1000) / 1000,
      open: Math.round(open * 1000) / 1000,
      high: Math.round(high * 1000) / 1000,
      low: Math.round(low * 1000) / 1000,
      volume: Math.floor(volume * 100), // Convert from hands to shares
      previousClose: Math.round(previousClose * 1000) / 1000,
      change: Math.round(change * 1000) / 1000,
      changePercent: Math.round(changePercent * 100) / 100,
      symbol: hkStockCode,
      market: 'HK'
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
    
    // Use Tencent Finance API with proxy
    const apiUrl = `https://qt.gtimg.cn/q=${fullSymbol}`;
    const proxyUrl = `https://proxy-api.trickle-app.host/?url=${encodeURIComponent(apiUrl)}`;
    
    console.log(`使用腾讯财经API: ${apiUrl}`);
    
    const response = await fetch(proxyUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': '*/*'
      }
    });
    
    clearTimeout(timeoutId);
    
    console.log(`腾讯财经API响应状态: ${response.status}`);
    
    if (!response.ok) {
      throw new Error(`网络响应异常: ${response.status}`);
    }
    
    const text = await response.text();
    console.log(`腾讯财经API响应: ${text.substring(0, 200)}`);
    
    // Parse Tencent Finance response format
    // Format: v_${fullSymbol}="51~股票名称~股票代码~当前价格~涨跌~涨跌%~成交量(手)~成交额(万)~...~今开~最高~最低~...";
    const match = text.match(/="(.+)"/);
    if (!match || !match[1]) {
      throw new Error('无法解析API响应数据');
    }
    
    const dataArray = match[1].split('~');
    if (dataArray.length < 50) {
      throw new Error('API返回数据不完整');
    }
    
    const price = parseFloat(dataArray[3]) || 0;   // Current price (index 3)
    const previousClose = parseFloat(dataArray[4]) || 0;  // Previous close (index 4)
    const open = parseFloat(dataArray[5]) || 0;    // Open price (index 5)
    const high = parseFloat(dataArray[33]) || 0;   // High price (index 33)
    const low = parseFloat(dataArray[34]) || 0;    // Low price (index 34)
    const volume = parseFloat(dataArray[6]) || 0;  // Volume in hands (index 6)
    const changePercent = parseFloat(dataArray[32]) || 0;  // Change percent (index 32)
    const change = previousClose > 0 ? price - previousClose : 0;
    
    console.log(`解析的A股数据: price=${price}, previousClose=${previousClose}, changePercent=${changePercent}`);
    
    if (isNaN(price) || price <= 0) {
      throw new Error('返回数据中没有有效的价格信息');
    }
    
    return {
      price: Math.round(price * 100) / 100,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      volume: Math.floor(volume * 100), // Convert from hands to shares
      previousClose: Math.round(previousClose * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      symbol: cnStockCode,
      market: 'CN'
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
