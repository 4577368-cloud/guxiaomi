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

// Get historical data for HK/CN stocks and calculate indicators
async function getUSHistoricalData(symbol) {
  const key = (window.API_CONFIG && window.API_CONFIG.ALPHA_VANTAGE_KEY) || '9555C3GN360DR3OW';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    console.log(`获取美股 ${symbol} 历史数据(Alpha Vantage)`);
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=compact&apikey=${key}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`Alpha Vantage HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!data['Time Series (Daily)']) {
      console.warn('Alpha Vantage 无历史数据', data);
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
    return history;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('美股历史数据获取失败', err);
    return [];
  }
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

async function getHistoricalClose30Days(symbol, market, totalShares = 0) {
  try {
    const result = await getHistoricalDataAndIndicators(symbol, market);
    if (!result || !Array.isArray(result.history) || result.history.length === 0) {
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

