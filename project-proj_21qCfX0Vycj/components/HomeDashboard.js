const INVESTMENT_DAILY_REPORTS_KEY = 'guxiaomi_investment_daily_reports_v1';
const INVESTMENT_DAILY_REPORT_LIMIT = 20;
const HOME_ALLOCATION_COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#38bdf8'];

function getHomeDashboardApiBase() {
  try {
    var injected = (window.ANALYSIS_API_BASE || '').trim().replace(/\/+$/, '');
    if (injected) return injected;
    var saved = (localStorage.getItem('analysis_api_base') || '').trim().replace(/\/+$/, '');
    if (saved) return saved;
  } catch (_) {}
  if (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    return 'http://localhost:8123';
  }
  return typeof location !== 'undefined' && location.origin ? location.origin : '';
}

function loadInvestmentDailyReports() {
  try {
    var raw = localStorage.getItem(INVESTMENT_DAILY_REPORTS_KEY);
    var parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveInvestmentDailyReports(items) {
  try {
    localStorage.setItem(INVESTMENT_DAILY_REPORTS_KEY, JSON.stringify((items || []).slice(0, INVESTMENT_DAILY_REPORT_LIMIT)));
  } catch (_) {}
}

function normalizeDashboardReportCode(code, market) {
  var c = String(code || '').trim().toUpperCase().replace(/\.HK$/i, '');
  var mk = String(market || '').trim();
  var isHK = mk === 'HK' || mk.indexOf('港') >= 0;
  var isCN = mk === 'CN' || mk.indexOf('A') >= 0;
  if (/^\d+$/.test(c)) {
    if (isCN) return c.padStart(6, '0');
    if (isHK || c.length <= 5) return c.padStart(5, '0');
    return c.padStart(6, '0');
  }
  return c;
}

function getLatestStockAnalysisSnippets(portfolio) {
  try {
    var listRaw = localStorage.getItem('analysis_reports_list_cache_v1');
    var list = listRaw ? JSON.parse(listRaw) : [];
    if (!Array.isArray(list)) return [];
    var stocks = (portfolio || []).map((stock) => ({
      symbol: normalizeDashboardReportCode(stock.symbol, stock.market),
      market: stock.market,
      raw: stock,
    }));
    return stocks.map((entry) => {
      var matched = list
        .filter((item) => {
          if (!item || !item.base_name) return false;
          var inferred = String(item.stock_code || '').trim();
          var market = item.market || '';
          if (!inferred) {
            var m = String(item.base_name || '').match(/^(A股|港股|美股)_([^_]+)_/);
            if (m) {
              inferred = m[2] || '';
              market = m[1] || market;
            }
          }
          return normalizeDashboardReportCode(inferred, market) === entry.symbol;
        })
        .sort((a, b) => String(b.generated_at || '').localeCompare(String(a.generated_at || '')))[0];
      if (!matched || !matched.base_name) return null;
      var bodyRaw = localStorage.getItem('analysis_report_body_v1:' + matched.base_name);
      var body = {};
      try {
        body = bodyRaw ? JSON.parse(bodyRaw) : {};
      } catch (_) {
        body = {};
      }
      return {
        symbol: entry.raw.symbol,
        name: entry.raw.name || '',
        generated_at: matched.generated_at || body.生成时间 || '',
        price_context: typeof body.数据基准 === 'string' ? body.数据基准.slice(0, 500) : '',
        summary: String(body.融合摘要 || body.投资决策摘要 || body.最终建议 || '').slice(0, 800),
      };
    }).filter(Boolean).slice(0, 8);
  } catch (_) {
    return [];
  }
}

function renderDailyReportText(text) {
  const cleanLine = (line) => String(line || '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/^[-*]\s+/, '• ')
    .replace(/^\d+\.\s+/, '• ')
    .trim();

  return String(text || '')
    .split(/\n+/)
    .map(cleanLine)
    .filter(Boolean)
    .slice(0, 18)
    .map((line, idx) => {
      if (/^(今日结论|当前持仓成绩|个股异动与对比|今日操作关注)/.test(line)) {
        return <h4 key={idx} className="mt-3 text-sm font-black text-slate-50 first:mt-0">{line}</h4>;
      }
      if (/^•\s+/.test(line)) {
        return <p key={idx} className="pl-3 text-xs leading-relaxed text-slate-300">{line}</p>;
      }
      return <p key={idx} className="text-xs leading-relaxed text-slate-300">{line}</p>;
    });
}

function getDashboardPriceHistory(stock) {
  if (!stock) return [];
  const direct = Array.isArray(stock.priceHistory) ? stock.priceHistory : [];
  if (direct.length) return direct;
  try {
    return window.loadStockPriceHistory ? window.loadStockPriceHistory(stock.symbol, stock.market) : [];
  } catch (_) {
    return [];
  }
}

function getDownStreakFromHistory(history) {
  const rows = (Array.isArray(history) ? history : [])
    .filter((row) => row && Number.isFinite(Number(row.price)))
    .slice(-8);
  if (rows.length < 2) return 0;
  let streak = 0;
  for (let i = rows.length - 1; i > 0; i--) {
    const today = Number(rows[i].price);
    const prev = Number(rows[i - 1].price);
    if (today < prev) streak += 1;
    else break;
  }
  return streak;
}

function dashboardMarketLabel(market) {
  return market === 'US' ? '美股' : market === 'HK' ? '港股' : 'A股';
}

function buildDashboardDetailUrl(entry) {
  if (!entry || !entry.symbol) return '';
  const marketName = dashboardMarketLabel(entry.market);
  return (
    'stock-detail.html?code=' +
    encodeURIComponent(entry.symbol) +
    '&market=' +
    encodeURIComponent(marketName) +
    (entry.name ? '&name=' + encodeURIComponent(entry.name) : '')
  );
}

function DashboardAlertRow({ task, compact, onAction }) {
  const hasAction = task && task.action && task.action.label;
  const toneClass =
    task.tone === 'red'
      ? 'border-rose-300/20 bg-rose-400/10'
      : task.tone === 'amber'
        ? 'border-amber-300/20 bg-amber-400/10'
        : task.tone === 'green'
          ? 'border-emerald-300/20 bg-emerald-400/10'
          : 'border-white/10 bg-white/[0.06]';
  const inner = (
  <>
      <div className="min-w-0 flex-1">
        <div className={'font-semibold text-slate-100 ' + (compact ? 'truncate text-sm' : 'text-sm')}>
          {task.title}
        </div>
        {!compact && task.desc && (
          <div className="mt-1 text-xs leading-relaxed text-slate-400">{task.desc}</div>
        )}
      </div>
      {hasAction && (
        <span className="ml-2 flex shrink-0 items-center gap-0.5 text-xs font-semibold text-cyan-300">
          {task.action.label}
          <div className="icon-chevron-right text-[11px]" aria-hidden />
        </span>
      )}
    </>
  );

  if (!hasAction) {
    return (
      <div className={'flex items-center rounded-xl border px-3 py-2 ' + toneClass + (compact ? ' h-11' : ' px-4 py-3')}>
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={function (e) {
        onAction(task, e);
      }}
      className={
        'flex w-full items-center rounded-xl border text-left transition-colors hover:border-cyan-300/35 hover:bg-white/[0.1] ' +
        toneClass +
        (compact ? ' h-11 px-3 py-2' : ' px-4 py-3')
      }
    >
      {inner}
    </button>
  );
}

function HomeDashboard({
  portfolio,
  watchlist,
  summary,
  capitalPool,
  onUpdateCapitalPool,
  onAddStock,
  onRefreshAll,
  onFocusPortfolioStock,
  onQuickAddStock,
  onRefreshWatchlist,
}) {
  try {
    const [dailyReports, setDailyReports] = React.useState(() => loadInvestmentDailyReports());
    const [dailyRunning, setDailyRunning] = React.useState(false);
    const [dailyError, setDailyError] = React.useState('');
    const [expandedDailyId, setExpandedDailyId] = React.useState('');
    const [expandedCard, setExpandedCard] = React.useState(null); // 'movers' | 'tasks' | null
    const [editingCapital, setEditingCapital] = React.useState(false);
    const [capitalDraft, setCapitalDraft] = React.useState({
      usd: Number(capitalPool?.usd) || 0,
      hkd: Number(capitalPool?.hkd) || 0,
      cny: Number(capitalPool?.cny) || 0,
    });
    const safePortfolio = Array.isArray(portfolio) ? portfolio : [];
    const safeWatchlist = Array.isArray(watchlist) ? watchlist : [];
    const safeSummary = summary && typeof summary === 'object'
      ? summary
      : { totalCost: 0, totalValue: 0, totalProfit: 0, totalProfitPercent: 0, stockCount: 0 };
    const pool = capitalPool && typeof capitalPool === 'object' ? capitalPool : { usd: 0, hkd: 0, cny: 0 };
    const totalCapitalHKD = Number(pool.usd || 0) * 7.78 + Number(pool.hkd || 0) + Number(pool.cny || 0);
    const remainingCapital = totalCapitalHKD > 0 ? totalCapitalHKD - (Number(safeSummary.totalCost) || 0) : 0;
    const todayProfitHKD = safePortfolio.reduce((sum, stock) => {
      const analysis = calculateStockAnalysis(stock, stock.brokerChannel || 'futu');
      const raw = Number(analysis.dailyProfitLoss) || 0;
      return sum + (stock.market === 'US' ? raw * 7.78 : raw);
    }, 0);
    const investedPct = totalCapitalHKD > 0
      ? Math.min(999, Math.max(0, ((Number(safeSummary.totalCost) || 0) / totalCapitalHKD) * 100))
      : 0;
    const allocationRows = React.useMemo(() => {
      if (!(totalCapitalHKD > 0)) return [];
      return safePortfolio
        .map((stock) => {
          const analysis = calculateStockAnalysis(stock, stock.brokerChannel || 'futu');
          const costHKD = stock.market === 'US'
            ? (Number(analysis.totalCost) || 0) * 7.78
            : Number(analysis.totalCost) || 0;
          return {
            symbol: stock.symbol,
            name: stock.name || '',
            market: stock.market,
            costHKD,
            percent: totalCapitalHKD > 0 ? (costHKD / totalCapitalHKD) * 100 : 0,
          };
        })
        .filter((item) => item.costHKD > 0)
        .sort((a, b) => b.costHKD - a.costHKD);
    }, [safePortfolio, totalCapitalHKD]);
    const visibleAllocationRows = allocationRows;
    const cashPct = totalCapitalHKD > 0
      ? Math.max(0, Math.min(100, (remainingCapital / totalCapitalHKD) * 100))
      : 0;

    React.useEffect(() => {
      if (editingCapital) return;
      setCapitalDraft({
        usd: Number(capitalPool?.usd) || 0,
        hkd: Number(capitalPool?.hkd) || 0,
        cny: Number(capitalPool?.cny) || 0,
      });
    }, [capitalPool?.usd, capitalPool?.hkd, capitalPool?.cny, editingCapital]);

    const saveCapitalDraft = React.useCallback(() => {
      if (!onUpdateCapitalPool) return;
      onUpdateCapitalPool({
        usd: Number(capitalDraft.usd) || 0,
        hkd: Number(capitalDraft.hkd) || 0,
        cny: Number(capitalDraft.cny) || 0,
      });
      setEditingCapital(false);
    }, [capitalDraft, onUpdateCapitalPool]);

    const holdingMovers = safePortfolio.map((stock) => {
      const analysis = calculateStockAnalysis(stock, stock.brokerChannel || 'futu');
      const pct = Number(stock.marketData?.changePercent);
      const fallback = Number(analysis.dailyProfitPercent);
      const changePercent = Number.isFinite(pct) ? pct : (Number.isFinite(fallback) ? fallback : 0);
      const marketName = stock.market === 'US' ? '美股' : stock.market === 'HK' ? '港股' : 'A股';
      const detailUrl = `stock-detail.html?code=${encodeURIComponent(stock.symbol)}&market=${encodeURIComponent(marketName)}${stock.name ? '&name=' + encodeURIComponent(stock.name) : ''}`;
      return {
        symbol: stock.symbol,
        name: stock.name,
        market: stock.market,
        detailUrl,
        changePercent,
        amount: analysis.dailyProfitLoss,
        source: '持仓'
      };
    });
    const watchMovers = safeWatchlist.map((item) => {
      const pct = Number(item.changePercent);
      const mdPct = Number(item.marketData?.changePercent);
      const changePercent = Number.isFinite(pct) ? pct : (Number.isFinite(mdPct) ? mdPct : 0);
      const marketName = item.market === 'US' ? '美股' : item.market === 'HK' ? '港股' : 'A股';
      const detailUrl = `stock-detail.html?code=${encodeURIComponent(item.symbol)}&market=${encodeURIComponent(marketName)}${item.name ? '&name=' + encodeURIComponent(item.name) : ''}`;
      return {
        symbol: item.symbol,
        name: item.name,
        market: item.market,
        detailUrl,
        changePercent,
        source: '关注'
      };
    });
    const movers = holdingMovers
      .concat(watchMovers)
      .filter((x) => Number.isFinite(Number(x.changePercent)) && Math.abs(Number(x.changePercent)) > 0)
      .sort((a, b) => Math.abs(Number(b.changePercent)) - Math.abs(Number(a.changePercent)));

    const emptyPositionStocks = safePortfolio.filter((stock) => {
      const positions = Array.isArray(stock.positions) ? stock.positions : [];
      return !positions.some((p) => p && p.enabled !== false && Number(p.shares) > 0);
    });
    const staleStocks = safePortfolio.filter((stock) => !stock.marketData || !Number(stock.currentPrice));
    const tasks = [];

    const holdingDetailAction = (stock, label) => ({
      type: 'detail',
      href: buildDashboardDetailUrl(stock),
      label: label || '查看详情',
      stockId: stock.id,
      symbol: stock.symbol,
      market: stock.market,
    });

    const watchDetailAction = (item, label) => ({
      type: 'detail',
      href: buildDashboardDetailUrl(item),
      label: label || '查看详情',
      symbol: item.symbol,
      market: item.market,
    });

    const handleAlertAction = React.useCallback(
      function (task) {
        var action = task && task.action;
        if (!action || !action.label) return;
        setExpandedCard(null);
        if ((action.type === 'detail' || action.type === 'analysis') && action.href) {
          window.location.href = action.href;
          return;
        }
        if (action.type === 'portfolio' && action.stockId && onFocusPortfolioStock) {
          onFocusPortfolioStock(action.stockId);
          return;
        }
        if (action.type === 'portfolio_section') {
          var portfolioEl = document.getElementById('portfolio-queue');
          if (portfolioEl) portfolioEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        if (action.type === 'watchlist_section') {
          var watchEl = document.getElementById('watchlist-section');
          if (watchEl) watchEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        if (action.type === 'refresh' && onRefreshAll) {
          onRefreshAll();
          var refreshAnchor = document.getElementById('portfolio-queue');
          if (refreshAnchor) refreshAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        if (action.type === 'watchlist_refresh' && onRefreshWatchlist) {
          onRefreshWatchlist();
          var watchAnchor = document.getElementById('watchlist-section');
          if (watchAnchor) watchAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        if (action.type === 'quick_add' && action.stockId && onQuickAddStock) {
          onQuickAddStock(action.stockId);
          return;
        }
      },
      [onFocusPortfolioStock, onQuickAddStock, onRefreshAll, onRefreshWatchlist],
    );

    const holdingAlerts = safePortfolio.map((stock) => {
      const analysis = calculateStockAnalysis(stock, stock.brokerChannel || 'futu');
      const currentPrice = Number(stock.currentPrice) || Number(stock.marketData?.price) || 0;
      const dailyPct = Number(stock.marketData?.changePercent);
      const effectiveDailyPct = Number.isFinite(dailyPct) ? dailyPct : Number(analysis.dailyProfitPercent) || 0;
      const profitPct = Number(analysis.profitPercent) || 0;
      const history = getDashboardPriceHistory(stock);
      const downStreak = getDownStreakFromHistory(history);
      return {
        stock,
        currentPrice,
        dailyPct: effectiveDailyPct,
        profitPct,
        downStreak,
      };
    });

    holdingAlerts
      .filter((item) => item.dailyPct <= -5)
      .slice(0, 2)
      .forEach((item) => {
        tasks.push({
          title: `${item.stock.symbol} 今日快速下跌 ${item.dailyPct.toFixed(2)}%`,
          desc: '单日跌幅超过 5%，建议查看详情页新闻、技术面和持仓成本。',
          tone: 'red',
          action: holdingDetailAction(item.stock, '查看详情'),
        });
      });

    holdingAlerts
      .filter((item) => item.downStreak >= 3)
      .slice(0, 2)
      .forEach((item) => {
        tasks.push({
          title: `${item.stock.symbol} 已连续 ${item.downStreak} 个价格点走弱`,
          desc: '连续下跌可能意味着趋势转弱，建议复核止损线和仓位。',
          tone: 'amber',
          action: holdingDetailAction(item.stock, '查看技术面'),
        });
      });

    holdingAlerts
      .filter((item) => item.profitPct <= -10)
      .slice(0, 2)
      .forEach((item) => {
        tasks.push({
          title: `${item.stock.symbol} 持仓累计亏损 ${item.profitPct.toFixed(2)}%`,
          desc: '累计亏损超过 10%，需要判断是补仓、持有还是止损。',
          tone: 'red',
          action: {
            type: 'detail',
            href: buildDashboardDetailUrl(item.stock),
            label: '复盘持仓',
            stockId: item.stock.id,
            symbol: item.stock.symbol,
            market: item.stock.market,
          },
        });
      });

    holdingAlerts
      .filter((item) => item.profitPct >= 10 || item.dailyPct >= 5)
      .slice(0, 2)
      .forEach((item) => {
        tasks.push({
          title: `${item.stock.symbol} 表现强势`,
          desc: `持仓收益 ${item.profitPct.toFixed(2)}%，今日 ${item.dailyPct >= 0 ? '+' : ''}${item.dailyPct.toFixed(2)}%，可考虑复盘是否需要止盈或提高跟踪级别。`,
          tone: 'green',
          action: holdingDetailAction(item.stock, '查看详情'),
        });
      });

    safeWatchlist.forEach((item) => {
      const current = Number(item.currentPrice) || Number(item.marketData?.price) || 0;
      const history = getDashboardPriceHistory(item);
      const start =
        Number(item.watchStartPrice) ||
        (history.length > 0 ? Number(history[0].price) : 0) ||
        Number(item.previousClose) ||
        current ||
        0;
      const watchPct = start > 0 && current > 0 ? ((current / start) - 1) * 100 : 0;
      const downStreak = getDownStreakFromHistory(history);
      if (watchPct <= -8) {
        tasks.push({
          title: `${item.symbol} 关注后下跌 ${watchPct.toFixed(2)}%`,
          desc: '关注后累计跌幅超过 8%，建议确认是否仍符合观察逻辑。',
          tone: 'amber',
          action: watchDetailAction(item, '查看详情'),
        });
      } else if (watchPct >= 8) {
        tasks.push({
          title: `${item.symbol} 关注后上涨 ${watchPct.toFixed(2)}%`,
          desc: '关注后涨幅超过 8%，可考虑进入详情页复盘催化因素。',
          tone: 'green',
          action: watchDetailAction(item, '查看详情'),
        });
      } else if (downStreak >= 3) {
        tasks.push({
          title: `${item.symbol} 关注股连续走弱`,
          desc: `最近连续 ${downStreak} 个价格点下跌，建议重新评估关注价值。`,
          tone: 'amber',
          action: watchDetailAction(item, '查看详情'),
        });
      }
    });

    if (emptyPositionStocks.length === 1) {
      tasks.push({
        title: `${emptyPositionStocks[0].symbol} 缺少持仓记录`,
        desc: '补充买入价和股数后，盈亏与仓位才会准确。',
        tone: 'amber',
        action: {
          type: 'quick_add',
          stockId: emptyPositionStocks[0].id,
          label: '补充持仓',
          symbol: emptyPositionStocks[0].symbol,
          market: emptyPositionStocks[0].market,
        },
      });
    } else if (emptyPositionStocks.length > 1) {
      tasks.push({
        title: `${emptyPositionStocks.length} 只股票缺少持仓记录`,
        desc: '补充买入价和股数后，盈亏与仓位才会准确。',
        tone: 'amber',
        action: { type: 'portfolio_section', label: '去持仓列表' },
      });
    }
    if (staleStocks.length === 1) {
      tasks.push({
        title: `${staleStocks[0].symbol} 需要刷新行情`,
        desc: '刷新后今日异动和详情页价格走势更准确。',
        tone: 'blue',
        action: {
          type: 'refresh',
          label: '刷新行情',
          stockId: staleStocks[0].id,
          symbol: staleStocks[0].symbol,
          market: staleStocks[0].market,
        },
      });
    } else if (staleStocks.length > 1) {
      tasks.push({
        title: `${staleStocks.length} 只股票需要刷新行情`,
        desc: '刷新后今日异动和详情页价格走势更准确。',
        tone: 'blue',
        action: { type: 'refresh', label: '刷新' },
      });
    }
    if (safeWatchlist.length && safeWatchlist.filter((x) => !Number(x.currentPrice)).length) {
      tasks.push({
        title: '部分关注股票缺少价格',
        desc: '可以刷新关注列表，完善关注后涨跌表现。',
        tone: 'pink',
        action: { type: 'watchlist_refresh', label: '刷新关注' },
      });
    }
    if (!tasks.length) {
      tasks.push({
        title: '暂无需要关注的提醒',
        desc: '组合数据状态良好，可查看今日异动或进入详情页复盘。',
        tone: 'green',
      });
    }

    const profitPositive = (Number(safeSummary.totalProfit) || 0) >= 0;
    const todayPositive = todayProfitHKD >= 0;

    const buildPortfolioSnapshot = React.useCallback(() => {
      return safePortfolio.map((stock) => {
        const stockAnalysis = calculateStockAnalysis(stock, stock.brokerChannel || 'futu');
        const positions = Array.isArray(stock.positions) ? stock.positions.filter((pos) => pos && pos.enabled !== false) : [];
        const firstDate = positions.map((pos) => pos.date).filter(Boolean).sort()[0] || '';
        const holdingDays = firstDate ? Math.max(0, Math.floor((Date.now() - new Date(firstDate).getTime()) / 86400000)) : 0;
        return {
          symbol: stock.symbol,
          name: stock.name || '',
          market: stock.market,
          currentPrice: Number(stock.currentPrice) || Number(stock.marketData?.price) || 0,
          changePercent: Number(stock.marketData?.changePercent) || Number(stockAnalysis.dailyProfitPercent) || 0,
          totalShares: Number(stockAnalysis.totalShares) || 0,
          avgCost: Number(stockAnalysis.avgCost) || 0,
          currentValue: Number(stockAnalysis.currentValue) || 0,
          profit: Number(stockAnalysis.profit) || 0,
          profitPercent: Number(stockAnalysis.profitPercent) || 0,
          holdingDays,
          technicalIndicators: stock.technicalIndicators || {},
        };
      });
    }, [safePortfolio]);

    const runDailyReport = React.useCallback(async () => {
      if (dailyRunning || !safePortfolio.length) return;
      setDailyRunning(true);
      setDailyError('');
      try {
        const apiBase = getHomeDashboardApiBase();
        if (!apiBase) throw new Error('未找到模型 API 地址');
        const modelKey = (() => {
          try {
            return localStorage.getItem('analysis_selected_model_key') || 'model2';
          } catch (_) {
            return 'model2';
          }
        })();
        const snapshot = buildPortfolioSnapshot();
        const previousDaily = dailyReports[0] || null;
        const analysisSnippets = getLatestStockAnalysisSnippets(safePortfolio);
        const dashboardMetrics = {
          totalCapitalHKD,
          totalInputCost: Number(safeSummary.totalCost) || 0,
          investedPercent: investedPct,
          remainingCapital,
          currentMarketValue: Number(safeSummary.totalValue) || 0,
          totalProfit: Number(safeSummary.totalProfit) || 0,
          totalProfitPercent: Number(safeSummary.totalProfitPercent) || 0,
          todayProfitHKD,
          stockCount: safePortfolio.length,
        };
        const system = '你是股小蜜的投资组合日报分析师。输出简洁、专业、中文，不写免责声明，不要使用冗长套话。';
        const user = [
          '请生成一份「我的投资日报」。',
          '',
          '分析目标：',
          '1. 说明当前持仓有哪些股票，整体成绩如何。',
          '2. 借鉴排盘页“持仓股票分析”的结构，但不要写命理玄学：逐只股票、市场分布、整体盈亏、技术面/持仓周期、操作策略。',
          '3. 参考最近一次股票 AI 分析结果及其当时股价信息，和当前价格/盈亏做对比，指出是否出现异动增长或下降。',
          '4. 如果有上一份投资日报，请对比上一份日报里的价格、盈亏和结论，指出变化。',
          '',
          '输出结构固定为四段，但不要使用 Markdown 符号、不要使用 #、不要使用 **、不要使用代码块：',
          '今日结论',
          '当前持仓成绩',
          '个股异动与对比',
          '今日操作关注',
          '',
          '要求每节 2-4 条，要具体到股票代码；用自然语言短句或「•」项目符号；不要超过 900 字。',
          '',
          `当前时间：${new Date().toLocaleString('zh-CN')}`,
          '投资工作台卡片数据：',
          JSON.stringify(dashboardMetrics, null, 2),
          `中文摘要：总资产 HK$ ${formatPrice(totalCapitalHKD, 0)}，总投入 ${formatPrice(safeSummary.totalCost, 0)}，资金使用率 ${investedPct.toFixed(1)}%，剩余资金 ${formatPrice(remainingCapital, 0)}，当前市值 ${formatPrice(safeSummary.totalValue, 0)}，总盈亏 ${formatPrice(safeSummary.totalProfit, 0)}，收益率 ${(Number(safeSummary.totalProfitPercent) || 0).toFixed(2)}%，今日盈亏 ${formatPrice(todayProfitHKD, 0)}`,
          '',
          '当前持仓快照：',
          JSON.stringify(snapshot, null, 2),
          '',
          '最近一次投资日报：',
          previousDaily ? JSON.stringify({ createdAt: previousDaily.createdAt, snapshot: previousDaily.snapshot, content: previousDaily.content }, null, 2).slice(0, 6000) : '暂无',
          '',
          '最近一次股票 AI 分析摘要：',
          analysisSnippets.length ? JSON.stringify(analysisSnippets, null, 2) : '暂无',
        ].join('\n');
        const res = await fetch(apiBase + '/api/llm/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system,
            user,
            stream: false,
            use_mock: false,
            max_tokens: 2048,
            temperature: 0.35,
            model_key: modelKey,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) throw new Error(data.detail || data.error || '投资日报生成失败');
        const report = {
          id: `daily_${Date.now()}`,
          createdAt: new Date().toLocaleString('zh-CN'),
          title: new Date().toLocaleString('zh-CN'),
          content: data.content || data.answer || '',
          source: String(data.content || data.answer || '').indexOf('[模拟]') >= 0 ? '模拟' : '真实模型',
          modelKey,
          prompt: { system, user },
          snapshot,
          summary: {
            totalCapitalHKD,
            totalInputCost: safeSummary.totalCost,
            investedPct,
            remainingCapital,
            totalValue: safeSummary.totalValue,
            totalProfit: safeSummary.totalProfit,
            totalProfitPercent: safeSummary.totalProfitPercent,
            todayProfitHKD,
          },
        };
        const next = [report].concat(dailyReports).slice(0, INVESTMENT_DAILY_REPORT_LIMIT);
        setDailyReports(next);
        saveInvestmentDailyReports(next);
        setExpandedDailyId(report.id);
      } catch (e) {
        setDailyError(e.message || '投资日报生成失败');
      } finally {
        setDailyRunning(false);
      }
    }, [dailyRunning, safePortfolio, safeSummary, todayProfitHKD, totalCapitalHKD, remainingCapital, investedPct, buildPortfolioSnapshot, dailyReports]);

    const deleteDailyReport = React.useCallback((reportId) => {
      const next = dailyReports.filter((item) => item && item.id !== reportId);
      setDailyReports(next);
      saveInvestmentDailyReports(next);
      setExpandedDailyId((current) => current === reportId ? '' : current);
    }, [dailyReports]);

    return (
      <>
      <section className="mb-4 grid gap-4 xl:grid-cols-12" data-name="home-dashboard" data-file="components/HomeDashboard.js">
        <div className="card overflow-hidden xl:col-span-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Investment Portal</p>
              <h2 className="mt-1 font-display text-2xl font-black tracking-tight text-slate-50 md:text-4xl">
                股小蜜投资工作台
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onAddStock}
                className="icon-action icon-action-sky"
                title="新增股票"
                aria-label="新增股票"
              >
                <div className="icon-plus"></div>
              </button>
              <button
                type="button"
                onClick={onRefreshAll}
                disabled={!safePortfolio.length}
                className="icon-action icon-action-emerald"
                title="刷新行情"
                aria-label="刷新行情"
              >
                <div className="icon-refresh-cw"></div>
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <DashboardMetric
              label="总资产 HK$"
              value={formatPrice(totalCapitalHKD || safeSummary.totalValue, 0)}
              icon="icon-wallet"
              tone="cyan"
              action={onUpdateCapitalPool ? (
                <button
                  type="button"
                  onClick={() => setEditingCapital((v) => !v)}
                  className="rounded-lg px-1.5 py-1 text-[11px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/12"
                >
                  {editingCapital ? '收起' : '编辑'}
                </button>
              ) : null}
            />
            <DashboardMetric label="当前市值" value={formatPrice(safeSummary.totalValue, 0)} icon="icon-piggy-bank" tone="violet" />
            <DashboardMetric
              label="总盈亏"
              value={`${profitPositive ? '+' : ''}${formatPrice(safeSummary.totalProfit, 0)}`}
              hint={`${(Number(safeSummary.totalProfitPercent) || 0) >= 0 ? '+' : ''}${(Number(safeSummary.totalProfitPercent) || 0).toFixed(2)}%`}
              icon={profitPositive ? 'icon-trending-up' : 'icon-trending-down'}
              tone={profitPositive ? 'green' : 'lime'}
            />
            <DashboardMetric
              label="今日盈亏"
              value={`${todayPositive ? '+' : ''}${formatPrice(todayProfitHKD, 0)}`}
              icon={todayPositive ? 'icon-activity' : 'icon-alert-triangle'}
              tone={todayPositive ? 'green' : 'lime'}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/22 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-50">
                  <span className="icon-pie-chart text-cyan-300"></span>
                  资金占用分布
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">按买入投入成本统计，盈亏单独在上方展示。</p>
              </div>
              <div className="text-right text-xs text-slate-400">
                <div className="gx-num font-semibold tabular-nums text-cyan-200">已用 {investedPct.toFixed(1)}%</div>
                <div>{allocationRows.length} 项</div>
              </div>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-800/80">
              {visibleAllocationRows.map((item, index) => (
                <div
                  key={`${item.market}-${item.symbol}`}
                  title={`${item.symbol} ${item.percent.toFixed(1)}%`}
                  className="h-full"
                  style={{
                    width: `${Math.max(1.5, Math.min(100, item.percent))}%`,
                    backgroundColor: HOME_ALLOCATION_COLORS[index % HOME_ALLOCATION_COLORS.length],
                  }}
                ></div>
              ))}
              {cashPct > 0 && (
                <div
                  title={`可用资金 ${cashPct.toFixed(1)}%`}
                  className="h-full bg-sky-400/30"
                  style={{ width: `${Math.max(1.5, cashPct)}%` }}
                ></div>
              )}
            </div>
            <div className="gx-soft-scrollbar mt-3 grid max-h-[6.75rem] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
              {visibleAllocationRows.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-slate-400 md:col-span-2">
                  暂无有效持仓成本，补充买入价格和股数后会显示分布。
                </div>
              ) : visibleAllocationRows.map((item, index) => (
                <div key={`${item.market}-${item.symbol}-row`} className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: HOME_ALLOCATION_COLORS[index % HOME_ALLOCATION_COLORS.length] }}
                  ></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold text-slate-100">{item.symbol}{item.name && item.name !== item.symbol ? ` · ${item.name}` : ''}</div>
                    <div className="gx-num text-[11px] tabular-nums text-slate-500">投入 {formatPrice(item.costHKD, 0)} HK$</div>
                  </div>
                  <div className="gx-num shrink-0 text-right text-xs font-bold tabular-nums text-cyan-200">{item.percent.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>
          {editingCapital && (
            <div className="mt-4 rounded-2xl border border-cyan-300/18 bg-cyan-400/10 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-50">编辑总资产</h3>
                <span className="text-xs text-slate-400">统一折算为 HK$ 展示</span>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {[
                  ['usd', '美元 USD'],
                  ['hkd', '港币 HKD'],
                  ['cny', '人民币 CNY'],
                ].map(([key, label]) => (
                  <label key={key} className="text-xs font-semibold text-slate-300">
                    {label}
                    <input
                      type="number"
                      step="0.01"
                      value={capitalDraft[key]}
                      onChange={(e) => setCapitalDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-white/16 bg-slate-950/42 px-3 py-2 text-sm text-slate-50 outline-none focus:border-cyan-300/50"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCapitalDraft({
                      usd: Number(capitalPool?.usd) || 0,
                      hkd: Number(capitalPool?.hkd) || 0,
                      cny: Number(capitalPool?.cny) || 0,
                    });
                    setEditingCapital(false);
                  }}
                  className="btn btn-secondary"
                >
                  取消
                </button>
                <button type="button" onClick={saveCapitalDraft} className="btn btn-primary">
                  保存
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 xl:col-span-5">
          <div className="card overflow-hidden p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-50">
                <div className="icon-zap text-amber-300"></div>
                今日异动
              </h3>
              <div className="flex items-center gap-2">
                {movers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpandedCard('movers')}
                    className="btn-icon-plain"
                    title="展开查看全部"
                    aria-label="展开查看全部"
                  >
                    <div className="icon-maximize-2"></div>
                  </button>
                )}
                <span className="text-xs text-slate-500">{movers.length} 条</span>
              </div>
            </div>
            {movers.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-sm text-slate-400">
                暂无明显异动，刷新行情后会自动更新。
              </div>
            ) : (
              <div className="gx-soft-scrollbar max-h-[8.75rem] space-y-2 overflow-y-auto pr-1">
                {movers.map((item) => (
                  <a key={`${item.source}-${item.market}-${item.symbol}`} href={item.detailUrl} className="flex h-11 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 transition-colors hover:border-cyan-300/35 hover:bg-white/[0.1]">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-bold text-slate-100">{item.symbol}</span>
                        <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] text-slate-400">{item.source}</span>
                      </div>
                      {item.name && item.name !== item.symbol && <div className="max-w-[12rem] truncate text-xs text-slate-500">{item.name}</div>}
                    </div>
                    <span className={`gx-num shrink-0 text-sm font-bold tabular-nums ${Number(item.changePercent) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {Number(item.changePercent) >= 0 ? '+' : ''}{Number(item.changePercent).toFixed(2)}%
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="card overflow-hidden p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-50">
                <div className="icon-list-checks text-sky-300"></div>
                关注提醒
              </h3>
              <div className="flex items-center gap-2">
                {tasks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpandedCard('tasks')}
                    className="btn-icon-plain"
                    title="展开查看全部"
                    aria-label="展开查看全部"
                  >
                    <div className="icon-maximize-2"></div>
                  </button>
                )}
                <span className="text-xs text-slate-500">{tasks.length} 项</span>
              </div>
            </div>
            <div className="gx-soft-scrollbar max-h-[7.5rem] space-y-2 overflow-y-auto pr-1">
              {tasks.map((task, idx) => (
                <DashboardAlertRow
                  key={(task.action && task.action.symbol ? task.action.symbol + '-' : '') + idx}
                  task={task}
                  compact
                  onAction={handleAlertAction}
                />
              ))}
            </div>
          </div>
        </div>

        {expandedCard && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && setExpandedCard(null)}
          >
            <div className="w-full max-w-lg max-h-[80vh] overflow-hidden rounded-2xl border border-white/20 bg-slate-900/95 p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-bold text-slate-50">
                  {expandedCard === 'movers' ? (
                    <>
                      <div className="icon-zap text-amber-300"></div>
                      今日异动 ({movers.length} 条)
                    </>
                  ) : (
                    <>
                      <div className="icon-list-checks text-sky-300"></div>
                      关注提醒 ({tasks.length} 项)
                    </>
                  )}
                </h3>
                <button
                  type="button"
                  onClick={() => setExpandedCard(null)}
                  className="btn-icon-plain text-slate-400"
                  aria-label="关闭"
                >
                  <div className="icon-x"></div>
                </button>
              </div>
              <div className="gx-soft-scrollbar max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {expandedCard === 'movers' ? (
                  movers.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm text-slate-400">
                      暂无明显异动。
                    </div>
                  ) : (
                    movers.map((item) => (
                      <a
                        key={`modal-${item.source}-${item.market}-${item.symbol}`}
                        href={item.detailUrl}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 transition-colors hover:border-cyan-300/35 hover:bg-white/[0.1]"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-bold text-slate-100">{item.symbol}</span>
                            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] text-slate-400">{item.source}</span>
                          </div>
                          {item.name && item.name !== item.symbol && (
                            <div className="truncate text-xs text-slate-500">{item.name}</div>
                          )}
                        </div>
                        <span className={`gx-num shrink-0 text-sm font-bold tabular-nums ${Number(item.changePercent) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {Number(item.changePercent) >= 0 ? '+' : ''}{Number(item.changePercent).toFixed(2)}%
                        </span>
                      </a>
                    ))
                  )
                ) : (
                  tasks.map((task, idx) => (
                    <DashboardAlertRow
                      key={'modal-' + (task.action && task.action.symbol ? task.action.symbol + '-' : '') + idx}
                      task={task}
                      onAction={handleAlertAction}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </section>
      <section className="card mb-4 p-4" data-name="investment-daily-card" data-file="components/HomeDashboard.js">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-50">
              <div className="icon-newspaper text-cyan-300"></div>
              我的投资日报
              <span className="text-xs font-normal text-slate-500">({dailyReports.length})</span>
            </h3>
          </div>
          <button
            type="button"
            onClick={runDailyReport}
            disabled={!safePortfolio.length || dailyRunning}
            className="btn btn-secondary gap-1.5 disabled:opacity-50"
          >
            <div className={`icon-clipboard-list text-sm ${dailyRunning ? 'animate-pulse' : ''}`}></div>
            <span>{dailyRunning ? '获取中' : '获取'}</span>
          </button>
        </div>
        {dailyRunning && <div className="mb-2 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">正在分析当前持仓表现…</div>}
        {dailyError && <div className="mb-2 rounded-xl border border-lime-300/20 bg-lime-400/10 px-3 py-2 text-xs text-lime-100">{dailyError}</div>}
        {dailyReports.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-5 text-center text-sm text-slate-400">
            暂无投资日报，点击「获取」生成今日摘要。
          </div>
        ) : (
          <div className="space-y-2">
            {dailyReports.slice(0, 4).map((report, idx) => {
              const expanded = expandedDailyId ? expandedDailyId === report.id : idx === 0;
              const hasContent = String(report.content || '').trim().length > 0;
              return (
                <div key={report.id} className="rounded-xl border border-white/10 bg-white/[0.05]">
                  <button
                    type="button"
                    onClick={() => hasContent && setExpandedDailyId(expanded ? '__none__' : report.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-100">{report.title || report.createdAt}</span>
                      <span className="block text-xs text-slate-500">
                        {report.source || '历史记录'} · {report.modelKey || 'model'}{hasContent ? '' : ' · 内容为空'}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm('确定删除这篇投资日报吗？')) deleteDailyReport(report.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (window.confirm('确定删除这篇投资日报吗？')) deleteDailyReport(report.id);
                          }
                        }}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-lime-200 transition-colors hover:bg-lime-400/10"
                        title="删除日报"
                      >
                        删除
                      </span>
                      {hasContent && (
                        <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-white/[0.08]">
                          {expanded ? '收起' : '展开'}
                          <span className={`icon-chevron-${expanded ? 'up' : 'down'} text-slate-400`}></span>
                        </span>
                      )}
                    </span>
                  </button>
                  {expanded && hasContent && (
                    <div className="border-t border-white/10 px-3 py-3">
                      <div className="mb-3 grid gap-2 text-xs sm:grid-cols-4">
                        <div className="rounded-lg bg-white/[0.05] px-2 py-1.5 text-slate-300">总投入 {formatPrice(report.summary?.totalInputCost || 0, 0)}</div>
                        <div className="rounded-lg bg-white/[0.05] px-2 py-1.5 text-slate-300">使用率 {Number(report.summary?.investedPct || 0).toFixed(1)}%</div>
                        <div className="rounded-lg bg-white/[0.05] px-2 py-1.5 text-slate-300">市值 {formatPrice(report.summary?.totalValue || 0, 0)}</div>
                        <div className="rounded-lg bg-white/[0.05] px-2 py-1.5 text-slate-300">盈亏 {formatPrice(report.summary?.totalProfit || 0, 0)}</div>
                      </div>
                      <div className="space-y-1.5">{renderDailyReportText(report.content)}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      </>
    );
  } catch (error) {
    console.error('HomeDashboard component error:', error);
    return null;
  }
}

function DashboardMetric({ label, value, hint, icon, tone, action }) {
  const toneMap = {
    cyan: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200',
    violet: 'border-violet-400/25 bg-violet-400/10 text-violet-200',
    green: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
    lime: 'border-lime-400/25 bg-lime-400/10 text-lime-200',
  };
  return (
    <div className={`rounded-2xl border p-3 ${toneMap[tone] || toneMap.cyan}`}>
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-400">
        <span className="flex min-w-0 items-center gap-2">
          <div className={`${icon || 'icon-circle'} text-base`}></div>
          <span>{label}</span>
        </span>
        {action}
      </div>
      <div className="gx-num text-xl font-black tabular-nums text-slate-50">{value}</div>
      {hint && <div className="gx-num mt-0.5 text-xs font-semibold tabular-nums">{hint}</div>}
    </div>
  );
}
