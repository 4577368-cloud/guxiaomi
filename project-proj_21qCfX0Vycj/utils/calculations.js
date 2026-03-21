// Financial calculation utilities for stock portfolio analysis

function formatPrice(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '0.00';
  
  const num = parseFloat(value);
  
  // For values >= 100,000, display in wan (万) format
  if (Math.abs(num) >= 100000) {
    const wanValue = num / 10000;
    return wanValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + '万';
  }
  
  // For values < 100,000, display normally
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function calculateDailyProfitLoss(stock) {
  if (!stock.positions || stock.positions.length === 0) {
    return {
      dailyProfitLoss: 0,
      dailyProfitPercent: 0
    };
  }

  const enabledPositions = stock.positions.filter(pos => pos.enabled !== false);
  const totalShares = enabledPositions.reduce(
    (sum, pos) => sum + (Number(pos.shares) || 0),
    0,
  );
  
  const currentPrice = Number(stock.currentPrice);
  const cp = Number.isFinite(currentPrice) ? currentPrice : 0;
  const prevRaw = Number(stock.marketData?.previousClose);
  const previousClose = Number.isFinite(prevRaw) ? prevRaw : cp;
  
  // Daily change is current price minus previous close
  const dailyChange = cp - previousClose;
  const dailyProfitLoss = totalShares * dailyChange;
  const dailyProfitPercent =
    previousClose > 0 && Number.isFinite(dailyChange)
      ? (dailyChange / previousClose) * 100
      : 0;
  
  return {
    dailyProfitLoss,
    dailyProfitPercent
  };
}

function calculateStockAnalysis(stock, brokerChannel) {
  if (!stock.positions || stock.positions.length === 0) {
    return {
      totalCost: 0,
      avgCost: 0,
      totalShares: 0,
      currentValue: 0,
      profit: 0,
      profitPercent: 0,
      totalBuyFees: 0,
      breakEvenPrice: 0,
      dailyProfitLoss: 0,
      dailyProfitPercent: 0
    };
  }

  const enabledPositions = stock.positions.filter(pos => pos.enabled !== false);
  
  let totalCostWithFees = 0; // 总成本（包含手续费）
  let totalSharesValue = 0;  // 总股票价值（不含手续费）
  let totalShares = 0;
  let totalBuyFees = 0;

  enabledPositions.forEach(position => {
    const sh = Number(position.shares) || 0;
    const pr = Number(position.price) || 0;
    const positionValue = pr * sh;
    const buyFees = calculateBuyFees(brokerChannel || 'futu', stock.market, pr, sh);
    const totalFees = Object.values(buyFees).reduce((sum, fee) => sum + fee, 0);
    
    totalCostWithFees += positionValue + totalFees; // 实际总成本
    totalSharesValue += positionValue; // 股票价值总和
    totalShares += sh;
    totalBuyFees += totalFees;
  });

  // 平均成本 = 实际总成本（含手续费）/ 总股数
  const avgCost = totalShares > 0 ? totalCostWithFees / totalShares : 0;
  
  // 当前市值 = 当前价格 × 总股数
  const currentValue = (stock.currentPrice || 0) * totalShares;
  
  // 浮动盈亏 = 当前市值 - 实际总成本（含手续费）
  const profit = currentValue - totalCostWithFees;
  const profitPercent = totalCostWithFees > 0 ? (profit / totalCostWithFees) * 100 : 0;
  
  // 盈亏保本价：考虑卖出时也需要支付手续费
  const breakEvenPrice = calculateBreakEvenPrice(stock, totalShares, totalCostWithFees, brokerChannel);

  // Calculate daily profit/loss
  const { dailyProfitLoss, dailyProfitPercent } = calculateDailyProfitLoss(stock);

  const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

  return {
    totalCost: n(totalCostWithFees),
    avgCost: n(avgCost),
    totalShares: n(totalShares),
    currentValue: n(currentValue),
    profit: n(profit),
    profitPercent: n(profitPercent),
    totalBuyFees: n(totalBuyFees),
    breakEvenPrice: n(breakEvenPrice),
    dailyProfitLoss: n(dailyProfitLoss),
    dailyProfitPercent: n(dailyProfitPercent),
  };
}

function calculatePortfolioSummary(portfolio) {
  let totalCostHKD = 0;
  let totalValueHKD = 0;
  let profitableStocks = 0;
  let losingStocks = 0;

  portfolio.forEach(stock => {
    if (!stock || typeof stock !== 'object') return;
    const analysis = calculateStockAnalysis(stock, stock.brokerChannel || 'futu');
    
    // Convert to HKD for portfolio summary
    let costInHKD = analysis.totalCost;
    let valueInHKD = analysis.currentValue;
    
    if (stock.market === 'US') {
      costInHKD = convertCurrency(analysis.totalCost, 'US', 'HK');
      valueInHKD = convertCurrency(analysis.currentValue, 'US', 'HK');
    }
    
    totalCostHKD += costInHKD;
    totalValueHKD += valueInHKD;
    
    if (analysis.profit > 0) profitableStocks++;
    else if (analysis.profit < 0) losingStocks++;
  });

  const totalProfit = totalValueHKD - totalCostHKD;
  const totalProfitPercent = totalCostHKD > 0 ? (totalProfit / totalCostHKD) * 100 : 0;

  return {
    stockCount: portfolio.length,
    totalCost: totalCostHKD,
    totalValue: totalValueHKD,
    totalProfit,
    totalProfitPercent,
    profitableStocks,
    losingStocks
  };
}

function calculateSellSimulation(stock, sellPrice, sellShares, brokerChannel) {
  const grossAmount = sellPrice * sellShares;
  
  // Calculate sell fees using broker-specific logic
  const sellFees = calculateSellFees(brokerChannel || 'futu', stock.market, sellPrice, sellShares);
  const totalFees = Object.values(sellFees).reduce((sum, fee) => sum + fee, 0);
  
  const netAmount = grossAmount - totalFees;
  
  // Calculate cost basis for sold shares (including original buy fees)
  const analysis = calculateStockAnalysis(stock, brokerChannel);
  const costBasis = analysis.avgCost * sellShares;
  
  const netProfit = netAmount - costBasis;

  // Calculate profit margin percentage (sell price vs average cost)
  const stockAnalysisData = calculateStockAnalysis(stock, brokerChannel);
  const profitMarginPercent = stockAnalysisData.avgCost > 0 ? ((sellPrice / stockAnalysisData.avgCost) - 1) * 100 : 0;

  const rawProfitPct = costBasis > 0 ? (netProfit / costBasis) * 100 : 0;
  const profitPercent = Number.isFinite(rawProfitPct) ? rawProfitPct : 0;

  return {
    grossAmount,
    totalFees,
    netAmount,
    costBasis,
    netProfit,
    profitPercent,
    profitMarginPercent: Number.isFinite(profitMarginPercent) ? profitMarginPercent : 0,
    feeBreakdown: sellFees
  };
}

function calculateBreakEvenPrice(stock, totalShares, totalCostWithFees, brokerChannel) {
  if (totalShares === 0) return 0;
  
  // 初始猜测：总成本除以总股数
  let breakEvenPrice = totalCostWithFees / totalShares;
  let iterations = 0;
  const maxIterations = 20;
  const tolerance = 0.001; // 更高精度
  
  while (iterations < maxIterations) {
    // 计算在此价格卖出的手续费
    const sellFees = calculateSellFees(brokerChannel || 'futu', stock.market, breakEvenPrice, totalShares);
    const totalSellFees = Object.values(sellFees).reduce((sum, fee) => sum + fee, 0);
    
    // 卖出后的净收入 = 卖出总额 - 卖出手续费
    const netAmount = (breakEvenPrice * totalShares) - totalSellFees;
    
    // 检查净收入是否能覆盖总成本
    const difference = netAmount - totalCostWithFees;
    
    if (Math.abs(difference) < tolerance) {
      break;
    }
    
    // 根据差额调整价格
    // 如果净收入不够，需要提高卖出价格
    const adjustment = difference / totalShares;
    breakEvenPrice = breakEvenPrice - adjustment;
    
    // 防止价格变成负数
    if (breakEvenPrice < 0) {
      breakEvenPrice = totalCostWithFees / totalShares;
      break;
    }
    
    iterations++;
  }
  
  return Math.max(0, Math.round(breakEvenPrice * 1000) / 1000);
}

/**
 * 反推：卖出多少股、在什么单价卖，使「该笔卖出」的净盈利（实收 - 对应成本）≈ targetNetProfit。
 * 与「现价 × 倍数」不同：会按单价从低到高搜索；持仓浮亏时需在更高价位卖足量才能净赚目标，而不是误导向「卖一部分就能实现目标盈利」。
 * 在多种股数组合中选 |净盈利-目标| 最小且卖出总价（毛）相对较低的一种。
 */
function findSellPlanForTargetNetProfit(stock, stockAnalysis, brokerChannel, targetNetProfit) {
  const maxShares = Math.floor(Number(stockAnalysis.totalShares) || 0);
  const avgCost = Number(stockAnalysis.avgCost) || 0;
  const currentPrice = Number(stock.currentPrice) || 0;
  const breakEven = Number(stockAnalysis.breakEvenPrice) || 0;

  if (!targetNetProfit || targetNetProfit <= 0 || maxShares <= 0 || avgCost <= 0) {
    return null;
  }

  const tol = Math.max(1, targetNetProfit * 0.02);
  let best = null;
  let bestScore = Infinity;

  const simAt = function (price, sh) {
    if (price <= 0 || sh <= 0) return { netProfit: -1e18, grossAmount: 1e18 };
    return calculateSellSimulation(stock, price, sh, brokerChannel);
  };

  const shareList = (function () {
    if (maxShares <= 800) {
      var arr = [];
      for (var i = 1; i <= maxShares; i++) arr.push(i);
      return arr;
    }
    var set = {};
    set[1] = true;
    set[maxShares] = true;
    var stride = Math.ceil(maxShares / 350);
    var j;
    for (j = 1; j <= maxShares; j += stride) set[j] = true;
    for (j = Math.max(1, maxShares - 40); j <= maxShares; j++) set[j] = true;
    return Object.keys(set)
      .map(function (x) {
        return parseInt(x, 10);
      })
      .sort(function (a, b) {
        return a - b;
      });
  })();

  var si, shares, hi, npHi, expand, it, l, r, m, sim, diff, score;
  for (si = 0; si < shareList.length; si++) {
    shares = shareList[si];
    hi = Math.max(currentPrice || 0, breakEven || 0, avgCost) * 2;
    if (hi < 1e-6) hi = avgCost * 2;
    npHi = simAt(hi, shares).netProfit;
    expand = 0;
    while (npHi < targetNetProfit - tol && expand < 45) {
      hi *= 1.4;
      npHi = simAt(hi, shares).netProfit;
      expand++;
    }
    if (npHi < targetNetProfit - tol) continue;

    l = 1e-12;
    r = hi;
    for (it = 0; it < 56; it++) {
      m = (l + r) / 2;
      if (simAt(m, shares).netProfit < targetNetProfit) l = m;
      else r = m;
    }
    sim = simAt(r, shares);
    diff = Math.abs(sim.netProfit - targetNetProfit);
    score = diff * 1e9 + sim.grossAmount;
    if (score < bestScore) {
      bestScore = score;
      best = {
        sellPrice: r,
        sellShares: shares,
        remainingShares: maxShares - shares,
        netProfit: sim.netProfit,
        grossAmount: sim.grossAmount,
        totalFees: sim.totalFees,
        netAmount: sim.netAmount,
        profitPercent: sim.profitPercent,
      };
    }
  }

  return best;
}
