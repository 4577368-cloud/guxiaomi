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
 * 在固定单价下，找整数股数使净盈利最接近目标（优先符合「按市价卖多少股」的习惯）。
 */
function closestIntegerSharesForTargetProfit(stock, brokerChannel, unitPrice, targetNetProfit, maxShares) {
  if (!(unitPrice > 0) || maxShares < 1) return null;

  const simFull = (s) => calculateSellSimulation(stock, unitPrice, s, brokerChannel);
  const np = (s) => simFull(s).netProfit;
  const candidates = new Set();

  if (maxShares <= 400) {
    for (let s = 1; s <= maxShares; s++) candidates.add(s);
  } else {
    const v1 = np(1);
    const vMax = np(maxShares);
    candidates.add(1);
    candidates.add(maxShares);

    if (vMax >= v1 - 1e-9) {
      let lo = 1;
      let hi = maxShares;
      let rb = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (np(mid) <= targetNetProfit) {
          rb = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      for (const x of [rb - 1, rb, rb + 1, rb + 2]) {
        if (x >= 1 && x <= maxShares) candidates.add(x);
      }
    } else {
      let lo = 1;
      let hi = maxShares;
      let lb = maxShares;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (np(mid) >= targetNetProfit) {
          lb = mid;
          hi = mid - 1;
        } else lo = mid + 1;
      }
      for (const x of [lb - 1, lb, lb + 1]) {
        if (x >= 1 && x <= maxShares) candidates.add(x);
      }
      const stride = Math.ceil(maxShares / 300);
      for (let s = 1; s <= maxShares; s += stride) candidates.add(s);
      for (let s = Math.max(1, maxShares - 60); s <= maxShares; s++) candidates.add(s);
    }
  }

  let bestS = 1;
  let bestDiff = Infinity;
  let bestSim = simFull(1);
  for (const s of candidates) {
    const sm = simFull(s);
    const d = Math.abs(sm.netProfit - targetNetProfit);
    if (d < bestDiff - 1e-12 || (Math.abs(d - bestDiff) < 1e-12 && s > bestS)) {
      bestDiff = d;
      bestS = s;
      bestSim = sm;
    }
  }
  return { s: bestS, sim: bestSim, diff: bestDiff };
}

/**
 * 固定股数，对单价二分，使净盈利 ≈ 目标（用于「一次性卖光需多少价」）。
 */
function binarySearchPriceForTargetOnShares(
  stock,
  brokerChannel,
  shares,
  targetNetProfit,
  seedPrice,
  breakEven,
  avgCost,
) {
  if (!(shares > 0)) return null;
  const tol = Math.max(1, targetNetProfit * 0.02);
  const simAt = (p) => calculateSellSimulation(stock, p, shares, brokerChannel);

  let hi = Math.max(seedPrice || 0, breakEven || 0, avgCost) * 2;
  if (hi < 1e-9) hi = (avgCost || 1) * 2;
  let expand = 0;
  while (simAt(hi).netProfit < targetNetProfit - tol && expand < 55) {
    hi *= 1.35;
    expand++;
  }
  if (simAt(hi).netProfit < targetNetProfit - tol) return null;

  let l = 1e-12;
  let r = hi;
  for (let it = 0; it < 60; it++) {
    const m = (l + r) / 2;
    if (simAt(m).netProfit < targetNetProfit) l = m;
    else r = m;
  }
  const sim = simAt(r);
  return { price: r, sim };
}

/**
 * 反推：净盈利目标 → 卖出股数 + 参考单价。
 * 1）优先按参考价（现价 > 保本价 > 平均成本）固定单价，只调股数，避免旧算法用「成交额最小」误选成卖 1 股。
 * 2）若该价下满仓仍达不到目标，再给「一次性卖光全部持仓」所需的单价。
 * 3）最后才做股数×单价联合搜索，评分优先贴近参考价、多股数，而非低成交额。
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
  const relaxedTol = Math.max(tol * 2.5, targetNetProfit * 0.08);
  const refPrice =
    currentPrice > 0 ? currentPrice : breakEven > 0 ? breakEven : avgCost;

  const pack = (sim, sellPrice, sellShares, planMode, planHint) => ({
    sellPrice,
    sellShares,
    remainingShares: maxShares - sellShares,
    netProfit: sim.netProfit,
    grossAmount: sim.grossAmount,
    totalFees: sim.totalFees,
    netAmount: sim.netAmount,
    profitPercent: sim.profitPercent,
    planMode,
    planHint,
    referencePriceUsed: refPrice,
  });

  const simAt = function (price, sh) {
    if (price <= 0 || sh <= 0) return { netProfit: -1e18, grossAmount: 1e18 };
    return calculateSellSimulation(stock, price, sh, brokerChannel);
  };

  // —— A. 参考价下满仓是否够得着目标 ——
  if (refPrice > 0) {
    const npMaxAtRef = calculateSellSimulation(stock, refPrice, maxShares, brokerChannel).netProfit;
    if (npMaxAtRef >= targetNetProfit - tol) {
      const hit = closestIntegerSharesForTargetProfit(
        stock,
        brokerChannel,
        refPrice,
        targetNetProfit,
        maxShares,
      );
      if (hit) {
        if (hit.diff <= tol) {
          return pack(
            hit.sim,
            refPrice,
            hit.s,
            "at_reference_price",
            currentPrice > 0
              ? "按当前价测算：卖出上述股数时，该笔净盈利约等于目标（已含卖出手续费与对应持仓成本）。"
              : "按参考价（无现价时用保本/均价）测算：卖出上述股数约实现目标净盈利。",
          );
        }
        if (hit.diff <= relaxedTol) {
          return pack(
            hit.sim,
            refPrice,
            hit.s,
            "at_reference_price_approx",
            "按当前参考价测算，与目标略有偏差；可微调股数或价格。",
          );
        }
      }
    }
  }

  // —— B. 一次性卖光全部持仓，反推单价 ——
  const liq = binarySearchPriceForTargetOnShares(
    stock,
    brokerChannel,
    maxShares,
    targetNetProfit,
    refPrice,
    breakEven,
    avgCost,
  );
  if (liq && Math.abs(liq.sim.netProfit - targetNetProfit) <= relaxedTol) {
    return pack(
      liq.sim,
      liq.price,
      maxShares,
      "liquidate_all",
      "在卖光全部持仓（" +
        maxShares.toLocaleString() +
        " 股）的前提下，约需上述卖出单价才能实现目标净盈利；若达不到该价，需降低目标或保留部分仓位。",
    );
  }

  // —— C. 联合搜索：评分 = 误差优先，其次贴近参考价，再次多卖股（杜绝「只卖 1 股」）——
  const shareList = (function buildShareList() {
    if (maxShares <= 800) {
      const arr = [];
      for (let i = 1; i <= maxShares; i++) arr.push(i);
      return arr;
    }
    const set = new Set();
    const add = (x) => {
      const n = Math.floor(Number(x));
      if (n >= 1 && n <= maxShares) set.add(n);
    };
    add(1);
    add(maxShares);
    let p2 = 1;
    while (p2 <= maxShares) {
      add(p2);
      p2 *= 2;
    }
    const stride = Math.max(1, Math.ceil(maxShares / 250));
    for (let j = 1; j <= maxShares; j += stride) add(j);
    for (let j = Math.max(1, maxShares - 100); j <= maxShares; j++) add(j);
    return Array.from(set).sort((a, b) => a - b);
  })();

  let best = null;
  let bestScore = Infinity;

  for (let si = 0; si < shareList.length; si++) {
    const shares = shareList[si];
    let hi = Math.max(currentPrice || 0, breakEven || 0, avgCost) * 2;
    if (hi < 1e-6) hi = avgCost * 2;
    let npHi = simAt(hi, shares).netProfit;
    let expand = 0;
    while (npHi < targetNetProfit - tol && expand < 45) {
      hi *= 1.4;
      npHi = simAt(hi, shares).netProfit;
      expand++;
    }
    if (npHi < targetNetProfit - tol) continue;

    let l = 1e-12;
    let r = hi;
    for (let it = 0; it < 56; it++) {
      const m = (l + r) / 2;
      if (simAt(m, shares).netProfit < targetNetProfit) l = m;
      else r = m;
    }
    const sim = simAt(r, shares);
    const diff = Math.abs(sim.netProfit - targetNetProfit);
    const pricePen = Math.abs(r - refPrice) * (100 + maxShares * 0.02);
    const score = diff * 1e15 + pricePen * 5e2 - shares;
    if (score < bestScore) {
      bestScore = score;
      best = pack(
        sim,
        r,
        shares,
        "general",
        "综合费率数值解：已优先贴近参考价并避免「极少股数 + 极端单价」的不合理组合。",
      );
    }
  }

  return best;
}
