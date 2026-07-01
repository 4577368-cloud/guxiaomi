// Financial calculation utilities for stock portfolio analysis

function formatPrice(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '0.00';
  
  const num = parseFloat(value);
  
  if (Math.abs(num) >= 100000) {
    const wanValue = num / 10000;
    const formatted = wanValue.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    return formatted + '万';
  }
  
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  return formatted;
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
 * 在固定单价下，找最少股数使净盈利 ≥ 目标（优先部分卖出，避免不必要的清仓）。
 */
function closestIntegerSharesForTargetProfit(stock, brokerChannel, unitPrice, targetNetProfit, maxShares) {
  if (!(unitPrice > 0) || maxShares < 1) return null;

  const tol = Math.max(1, targetNetProfit * 0.02);
  const simFull = (s) => calculateSellSimulation(stock, unitPrice, s, brokerChannel);
  const np = (s) => simFull(s).netProfit;

  const npMax = np(maxShares);
  if (npMax < targetNetProfit - tol) {
    return { s: maxShares, sim: simFull(maxShares), diff: Math.abs(npMax - targetNetProfit), belowTarget: true };
  }

  let lo = 1;
  let hi = maxShares;
  let firstMeet = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (np(mid) >= targetNetProfit - tol) {
      firstMeet = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  if (firstMeet === null) {
    const sim = simFull(maxShares);
    return { s: maxShares, sim, diff: Math.abs(sim.netProfit - targetNetProfit), belowTarget: true };
  }

  const candidates = new Set();
  for (let x = Math.max(1, firstMeet - 2); x <= Math.min(maxShares, firstMeet + 2); x++) {
    candidates.add(x);
  }

  let best = null;
  for (const s of candidates) {
    const sm = simFull(s);
    const d = Math.abs(sm.netProfit - targetNetProfit);
    const meets = sm.netProfit >= targetNetProfit - tol;
    if (!best) {
      best = { s, sim: sm, diff: d, belowTarget: !meets };
      continue;
    }
    const better =
      (meets && best.sim.netProfit < targetNetProfit - tol) ||
      (meets === (best.sim.netProfit >= targetNetProfit - tol) &&
        (d < best.diff - 1e-12 || (Math.abs(d - best.diff) < 1e-12 && s < best.s)));
    if (better) best = { s, sim: sm, diff: d, belowTarget: !meets };
  }
  return best;
}

function clampSellShares(shares, maxShares) {
  const max = Math.floor(Number(maxShares) || 0);
  const s = Math.floor(Number(shares) || 0);
  if (max <= 0) return 0;
  return Math.min(max, Math.max(0, s));
}

function resolveManualSellPrice(priceMode, opts) {
  const current = Number(opts.currentPrice) || 0;
  const breakEven = Number(opts.breakEvenPrice) || 0;
  const val = Number(opts.priceValue);
  switch (priceMode) {
    case 'breakeven':
      return breakEven > 0 ? breakEven : 0;
    case 'current':
      return current > 0 ? current : 0;
    case 'custom':
      return Number.isFinite(val) && val > 0 ? val : 0;
    case 'offset_amount':
      return current > 0 ? current + (Number.isFinite(val) ? val : 0) : 0;
    case 'offset_percent':
      return current > 0 ? current * (1 + (Number.isFinite(val) ? val : 0) / 100) : 0;
    default:
      return 0;
  }
}

function resolveManualSellShares(sharesMode, opts) {
  const max = Math.floor(Number(opts.totalShares) || 0);
  const val = Number(opts.sharesValue);
  let shares = 0;
  switch (sharesMode) {
    case 'full':
      shares = max;
      break;
    case 'half':
      shares = max <= 1 ? max : Math.max(1, Math.floor(max / 2));
      break;
    case 'percent':
      shares = Math.floor(max * ((Number.isFinite(val) ? val : 0) / 100));
      break;
    case 'custom':
    default:
      shares = Math.floor(Number.isFinite(val) ? val : 0);
      break;
  }
  return clampSellShares(shares, max);
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

  const maxAtRef =
    refPrice > 0
      ? calculateSellSimulation(stock, refPrice, maxShares, brokerChannel)
      : null;
  const maxNetProfitAtRefPrice = maxAtRef ? maxAtRef.netProfit : 0;

  const fullLiqPlan = binarySearchPriceForTargetOnShares(
    stock,
    brokerChannel,
    maxShares,
    targetNetProfit,
    refPrice,
    breakEven,
    avgCost,
  );

  const buildMeta = () => ({
    refPrice,
    breakEven,
    avgCost,
    currentPrice,
    maxShares,
    targetNetProfit,
    maxNetProfitAtRefPrice,
    achievableAtCurrentPrice: maxNetProfitAtRefPrice >= targetNetProfit - tol,
    fullLiquidationForTarget: fullLiqPlan
      ? {
          sellPrice: fullLiqPlan.price,
          sellShares: maxShares,
          netProfit: fullLiqPlan.sim.netProfit,
          priceGapFromCurrent: currentPrice > 0 ? fullLiqPlan.price - currentPrice : 0,
          priceGapPercentFromCurrent:
            currentPrice > 0 ? ((fullLiqPlan.price / currentPrice) - 1) * 100 : 0,
        }
      : null,
  });

  const pack = (sim, sellPrice, sellShares, planMode, planHint) => {
    const gap = currentPrice > 0 ? sellPrice - currentPrice : 0;
    const gapPct = currentPrice > 0 ? ((sellPrice / currentPrice) - 1) * 100 : 0;
    return {
      feasible: true,
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
      currentPrice,
      maxNetProfitAtRefPrice,
      targetNetProfit,
      priceGapFromCurrent: gap,
      priceGapPercentFromCurrent: gapPct,
      meta: buildMeta(),
    };
  };

  const simAt = function (price, sh) {
    if (price <= 0 || sh <= 0) return { netProfit: -1e18, grossAmount: 1e18 };
    return calculateSellSimulation(stock, price, sh, brokerChannel);
  };

  // —— A. 参考价下用部分仓位达成目标 ——
  if (refPrice > 0 && maxNetProfitAtRefPrice >= targetNetProfit - tol) {
    const hit = closestIntegerSharesForTargetProfit(
      stock,
      brokerChannel,
      refPrice,
      targetNetProfit,
      maxShares,
    );
    if (hit && !hit.belowTarget) {
      if (hit.diff <= tol) {
        return pack(
          hit.sim,
          refPrice,
          hit.s,
          'partial_at_reference',
          currentPrice > 0
            ? `按现价测算：卖出 ${hit.s.toLocaleString()} 股即可接近目标净盈利，无需清仓（剩余 ${(maxShares - hit.s).toLocaleString()} 股）。`
            : `按参考价测算：卖出 ${hit.s.toLocaleString()} 股约实现目标净盈利。`,
        );
      }
      if (hit.diff <= relaxedTol) {
        return pack(
          hit.sim,
          refPrice,
          hit.s,
          'partial_at_reference_approx',
          `按现价测算卖出 ${hit.s.toLocaleString()} 股，与目标略有偏差，可微调股数。`,
        );
      }
    }
  }

  // —— B. 现价下满仓仍不够：反推全仓卖出所需单价 ——
  if (fullLiqPlan && Math.abs(fullLiqPlan.sim.netProfit - targetNetProfit) <= relaxedTol) {
    const gap = currentPrice > 0 ? fullLiqPlan.price - currentPrice : 0;
    const gapPct = currentPrice > 0 ? ((fullLiqPlan.price / currentPrice) - 1) * 100 : 0;
    const lossHint =
      maxNetProfitAtRefPrice < 0
        ? `当前持仓处于浮亏，现价全仓卖出净盈利约 ${maxNetProfitAtRefPrice.toFixed(2)}，未达目标。`
        : `现价全仓卖出净盈利约 ${maxNetProfitAtRefPrice.toFixed(2)}，未达目标。`;
    return pack(
      fullLiqPlan.sim,
      fullLiqPlan.price,
      maxShares,
      'liquidate_all',
      `${lossHint}若坚持净盈利目标 ${targetNetProfit.toLocaleString()}，需一次性卖光全部 ${maxShares.toLocaleString()} 股，约需卖出单价 ${fullLiqPlan.price.toFixed(3)}` +
        (currentPrice > 0
          ? `（较现价 ${gap >= 0 ? '上涨' : '下跌'} ${Math.abs(gap).toFixed(3)}，约 ${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(2)}%）。`
          : '。'),
    );
  }

  // —— C. 联合搜索 ——
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
    const score = diff * 1e15 + pricePen * 5e2 + shares;
    if (score < bestScore) {
      bestScore = score;
      best = pack(
        sim,
        r,
        shares,
        'general',
        shares < maxShares
          ? `卖出 ${shares.toLocaleString()} 股、单价 ${r.toFixed(3)} 时接近目标净盈利。`
          : `需卖光全部持仓，单价约 ${r.toFixed(3)} 才能接近目标净盈利。`,
      );
    }
  }

  if (best) return best;

  const meta = buildMeta();
  return {
    feasible: false,
    planMode: 'unachievable',
    currentPrice,
    maxNetProfitAtRefPrice,
    targetNetProfit,
    planHint:
      maxNetProfitAtRefPrice < targetNetProfit
        ? `现价下满仓卖出净盈利约 ${maxNetProfitAtRefPrice.toFixed(2)}，低于目标 ${targetNetProfit.toLocaleString()}。` +
          (meta.fullLiquidationForTarget
            ? ` 若全仓卖出，约需单价 ${meta.fullLiquidationForTarget.sellPrice.toFixed(3)}（较现价 ${meta.fullLiquidationForTarget.priceGapPercentFromCurrent >= 0 ? '+' : ''}${meta.fullLiquidationForTarget.priceGapPercentFromCurrent.toFixed(2)}%）。`
            : ' 在当前费率与持仓下，该目标过高。')
        : '在当前费率与持仓下，无法在合理单价范围内凑出该净盈利目标。',
    meta,
    fullLiquidationForTarget: meta.fullLiquidationForTarget,
    priceGapFromCurrent: meta.fullLiquidationForTarget
      ? meta.fullLiquidationForTarget.priceGapFromCurrent
      : 0,
    priceGapPercentFromCurrent: meta.fullLiquidationForTarget
      ? meta.fullLiquidationForTarget.priceGapPercentFromCurrent
      : 0,
    sellPrice: meta.fullLiquidationForTarget ? meta.fullLiquidationForTarget.sellPrice : 0,
    sellShares: maxShares,
  };
}
