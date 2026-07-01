/** 注册 Chart.js 数据标签插件（仅一次） */
(function registerChartDataLabelsOnce() {
  try {
    if (typeof ChartJS === 'undefined') return;
    if (typeof window !== 'undefined' && window.__guxiaomiDataLabelsRegistered) {
      return;
    }
    var Plugin =
      typeof ChartDataLabels !== 'undefined'
        ? ChartDataLabels
        : typeof window !== 'undefined' && window.ChartDataLabels
          ? window.ChartDataLabels
          : null;
    if (!Plugin) {
      console.warn(
        '[StockCharts] 未找到 ChartDataLabels：请在 chart.js 之后加载 chartjs-plugin-datalabels',
      );
      return;
    }
    ChartJS.register(Plugin);
    if (typeof window !== 'undefined') {
      window.__guxiaomiDataLabelsRegistered = true;
    }
  } catch (e) {
    console.warn('[StockCharts] chartjs-plugin-datalabels 注册失败', e);
  }
})();

/** 深色玻璃卡片上图表：坐标轴与图例用高对比浅色 */
var GX_CHART_AXIS_COLOR = '#e8eef7';
var GX_CHART_GRID_COLOR = 'rgba(241, 245, 249, 0.14)';
var GX_CHART_GRID_ZERO = 'rgba(248, 250, 252, 0.35)';
/** 收盘价折线：亮青蓝，避免发灰的 blue-600 */
var GX_PRICE_LINE = 'rgba(56, 189, 248, 1)';
var GX_PRICE_FILL = 'rgba(56, 189, 248, 0.18)';
var GX_PRICE_POINT = '#7dd3fc';

function StockCharts({ stock }) {
  const dailyProfitChartRef = React.useRef(null);
  const priceTrendChartRef = React.useRef(null);
  const dailyProfitChartInstance = React.useRef(null);
  const priceTrendChartInstance = React.useRef(null);
  const [effectiveHistory, setEffectiveHistory] = React.useState([]);
  const windowSize = 30;

  /** 货币前缀 + 数字（图表外直接可读） */
  const formatMoney = React.useCallback(function (n, decimals) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '—';
    var d =
      decimals != null
        ? decimals
        : stock.market === 'US'
          ? 3
          : 2;
    var sym =
      stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : 'HK$';
    return sym + v.toFixed(d);
  }, [stock.market]);

  const sliceLastWindow = React.useCallback(
    function (arr) {
      if (!arr || !arr.length) return [];
      var start = Math.max(0, arr.length - windowSize);
      return arr.slice(start);
    },
    [windowSize],
  );

  const getPersistedHistory = function () {
    try {
      var key =
        'stock_price_history_' +
        (stock.market || 'UNKNOWN').toString().toUpperCase() +
        '_' +
        (stock.symbol || 'UNKNOWN').toString().toUpperCase();
      var saved = localStorage.getItem(key);
      if (!saved) return [];
      var parsed = JSON.parse(saved);
      if (!parsed || !Array.isArray(parsed.history)) return [];
      return parsed.history;
    } catch (err) {
      console.error('读取 localStorage 历史失败', err);
      return [];
    }
  };

  React.useEffect(
    function () {
      var persistedHistory = window.loadStockPriceHistory
        ? window.loadStockPriceHistory(stock.symbol, stock.market)
        : [];
      var newHistory = [];
      if (Array.isArray(stock.priceHistory) && stock.priceHistory.length > 0) {
        newHistory = stock.priceHistory;
      }
      if (
        (!Array.isArray(newHistory) || newHistory.length === 0) &&
        Array.isArray(persistedHistory) &&
        persistedHistory.length > 0
      ) {
        newHistory = persistedHistory;
      }

      var combinedMap = new Map();
      (Array.isArray(persistedHistory) ? persistedHistory : []).forEach(
        function (item) {
          if (item && item.date) combinedMap.set(item.date, item);
        },
      );
      (Array.isArray(newHistory) ? newHistory : []).forEach(function (item) {
        if (item && item.date) combinedMap.set(item.date, item);
      });
      var mergedHistory = Array.from(combinedMap.values())
        .slice()
        .sort(function (a, b) {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        })
        .slice(-365);

      var sortedHistory = (Array.isArray(mergedHistory) ? mergedHistory : [])
        .slice()
        .sort(function (a, b) {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

      var nonEmpty =
        sortedHistory.length > 0 ? sortedHistory : getPersistedHistory();
      setEffectiveHistory(nonEmpty.length > 0 ? nonEmpty : []);
    },
    [stock.symbol, stock.market, stock.priceHistory],
  );

  const displayWindow = React.useMemo(
    function () {
      return sliceLastWindow(effectiveHistory);
    },
    [effectiveHistory, sliceLastWindow],
  );

  const priceSummary = React.useMemo(
    function () {
      var rows = displayWindow;
      if (!rows || !rows.length) return null;
      var nums = rows
        .map(function (r) {
          return Number(r.price);
        })
        .filter(function (n) {
          return Number.isFinite(n);
        });
      if (!nums.length) return null;
      var last = rows[rows.length - 1];
      var lastP = Number(last.price);
      var prevP = null;
      if (rows.length >= 2) {
        prevP = Number(rows[rows.length - 2].price);
      }
      var min = Math.min.apply(null, nums);
      var max = Math.max.apply(null, nums);
      var minRow = rows.find(function (r) {
        return Number(r.price) === min;
      });
      var maxRow = rows.find(function (r) {
        return Number(r.price) === max;
      });
      var dayChg = null;
      var dayPct = null;
      if (
        prevP != null &&
        Number.isFinite(prevP) &&
        prevP !== 0 &&
        Number.isFinite(lastP)
      ) {
        dayChg = lastP - prevP;
        dayPct = (dayChg / prevP) * 100;
      }
      return {
        lastDate: last.date,
        lastPrice: lastP,
        dayChg: dayChg,
        dayPct: dayPct,
        min: min,
        max: max,
        minDate: minRow ? minRow.date : '',
        maxDate: maxRow ? maxRow.date : '',
      };
    },
    [displayWindow],
  );

  const profitSummary = React.useMemo(
    function () {
      var rows = displayWindow;
      if (!rows || !rows.length) return null;
      var last = rows[rows.length - 1];
      return {
        date: last.date,
        profit: Number(last.dailyProfit) || 0,
      };
    },
    [displayWindow],
  );

  React.useEffect(
    function () {
      if (!dailyProfitChartRef.current || !effectiveHistory.length) return;
      var ctx = dailyProfitChartRef.current.getContext('2d');
      if (!ctx) return;

      if (dailyProfitChartInstance.current) {
        dailyProfitChartInstance.current.destroy();
        dailyProfitChartInstance.current = null;
      }

      var displayData = sliceLastWindow(effectiveHistory);
      var dates = displayData.map(function (item) {
        return item.date;
      });
      var profits = displayData.map(function (item) {
        return Number(item.dailyProfit) || 0;
      });
      var colors = profits.map(function (p) {
        return p >= 0 ? 'rgba(5, 150, 105, 0.8)' : 'rgba(252, 165, 165, 0.78)';
      });

      var maxAbsIdx = 0;
      var maxAbs = 0;
      for (var pi = 0; pi < profits.length; pi++) {
        var ab = Math.abs(profits[pi]);
        if (ab > maxAbs) {
          maxAbs = ab;
          maxAbsIdx = pi;
        }
      }
      var nProf = profits.length;
      var showProfitLabel = function (ctx) {
        var i = ctx.dataIndex;
        if (nProf <= 7) return true;
        return i === 0 || i === nProf - 1 || i === maxAbsIdx;
      };

      dailyProfitChartInstance.current = new ChartJS(ctx, {
        type: 'bar',
        data: {
          labels: dates,
          datasets: [
            {
              label: '每日盈亏',
              data: profits,
              backgroundColor: colors,
              borderColor: colors.map(function (c) {
                return c.replace('0.8', '1');
              }),
              borderWidth: 1,
              barPercentage: 0.5,
              categoryPercentage: 0.7,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: { top: 16, right: 4, left: 2, bottom: 2 },
          },
          plugins: {
            legend: { display: false },
            datalabels: {
              display: showProfitLabel,
              formatter: function (value) {
                var nv = Number(value);
                if (!Number.isFinite(nv)) return '';
                return (nv >= 0 ? '+' : '') + formatMoney(nv, 2);
              },
              color: function (ctx) {
                var v = ctx.dataset.data[ctx.dataIndex];
                return v >= 0 ? '#065f46' : '#4d7c0f';
              },
              backgroundColor: 'rgba(255,255,255,0.94)',
              borderRadius: 4,
              borderWidth: 1,
              borderColor: function (ctx) {
                var v = ctx.dataset.data[ctx.dataIndex];
                return v >= 0
                  ? 'rgba(5, 150, 105, 0.45)'
                  : 'rgba(132, 204, 22, 0.5)';
              },
              padding: { top: 2, right: 4, bottom: 2, left: 4 },
              font: { size: 10, weight: '600' },
              anchor: 'end',
              align: 'top',
              offset: 2,
              clip: false,
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.94)',
              titleColor: '#f8fafc',
              bodyColor: '#e2e8f0',
              borderColor: 'rgba(148, 163, 184, 0.35)',
              borderWidth: 1,
              callbacks: {
                label: function (context) {
                  var value = context.parsed && context.parsed.y;
                  var n = Number(value);
                  if (!Number.isFinite(n)) n = 0;
                  var symbol =
                    stock.market === 'US'
                      ? '$'
                      : stock.market === 'CN'
                        ? '¥'
                        : 'HK$';
                  return (
                    '盈亏: ' +
                    (n >= 0 ? '+' : '') +
                    symbol +
                    n.toFixed(2)
                  );
                },
              },
            },
          },
          scales: {
            x: {
              ticks: {
                color: GX_CHART_AXIS_COLOR,
                maxRotation: 45,
                font: { size: 11, weight: '600' },
              },
              grid: { color: GX_CHART_GRID_COLOR },
            },
            y: {
              beginAtZero: true,
              grace: '10%',
              ticks: {
                color: GX_CHART_AXIS_COLOR,
                font: { size: 11, weight: '600' },
                callback: function (value) {
                  var n = Number(value);
                  if (!Number.isFinite(n)) n = 0;
                  var symbol =
                    stock.market === 'US'
                      ? '$'
                      : stock.market === 'CN'
                        ? '¥'
                        : 'HK$';
                  return (
                    (n >= 0 ? '' : '-') +
                    symbol +
                    Math.abs(n).toFixed(2)
                  );
                },
              },
              grid: {
                color: function (context) {
                  if (context.tick.value === 0) {
                    return GX_CHART_GRID_ZERO;
                  }
                  return GX_CHART_GRID_COLOR;
                },
              },
            },
          },
        },
      });

      return function () {
        if (dailyProfitChartInstance.current) {
          try {
            dailyProfitChartInstance.current.destroy();
          } catch (_) {}
          dailyProfitChartInstance.current = null;
        }
      };
    },
    [effectiveHistory, stock.market, sliceLastWindow, formatMoney],
  );

  React.useEffect(
    function () {
      if (!priceTrendChartRef.current || !effectiveHistory.length) return;
      var ctx = priceTrendChartRef.current.getContext('2d');
      if (!ctx) return;

      if (priceTrendChartInstance.current) {
        priceTrendChartInstance.current.destroy();
        priceTrendChartInstance.current = null;
      }

      var displayData = sliceLastWindow(effectiveHistory);
      var dates = displayData.map(function (item) {
        return item.date;
      });
      var prices = displayData.map(function (item) {
        var p = Number(item.price);
        return Number.isFinite(p) ? p : 0;
      });
      var priceDecimals = stock.market === 'US' ? 3 : 2;

      var nP = prices.length;
      var lastIdx = nP - 1;
      var minP = Math.min.apply(null, prices);
      var minIdx = prices.indexOf(minP);
      var maxIdx = prices.indexOf(Math.max.apply(null, prices));
      var showPriceLabel = function (ctx) {
        var i = ctx.dataIndex;
        if (nP <= 10) return true;
        return (
          i === 0 ||
          i === lastIdx ||
          i === minIdx ||
          i === maxIdx
        );
      };

      priceTrendChartInstance.current = new ChartJS(ctx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [
            {
              label: '收盘价',
              data: prices,
              borderColor: GX_PRICE_LINE,
              backgroundColor: GX_PRICE_FILL,
              borderWidth: 3,
              fill: true,
              tension: 0.35,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBackgroundColor: GX_PRICE_POINT,
              pointBorderColor: '#f8fafc',
              pointBorderWidth: 1.5,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: { top: 22, right: 8, bottom: 10, left: 8 },
          },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                boxWidth: 14,
                color: '#f1f5f9',
                font: { size: 12, weight: '700' },
              },
            },
            datalabels: {
              display: showPriceLabel,
              formatter: function (value) {
                return formatMoney(value, priceDecimals);
              },
              color: '#0c4a6e',
              backgroundColor: 'rgba(255,255,255,0.96)',
              borderColor: 'rgba(56, 189, 248, 0.75)',
              borderWidth: 1,
              borderRadius: 4,
              padding: { top: 2, right: 5, bottom: 2, left: 5 },
              font: { size: 10, weight: '700' },
              anchor: 'center',
              align: function (ctx) {
                if (ctx.dataIndex === minIdx) return 'bottom';
                return 'top';
              },
              offset: 6,
              clip: false,
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.94)',
              titleColor: '#f8fafc',
              bodyColor: '#e2e8f0',
              borderColor: 'rgba(56, 189, 248, 0.4)',
              borderWidth: 1,
              callbacks: {
                title: function (items) {
                  var i = items && items[0] && items[0].dataIndex;
                  if (i == null || !dates[i]) return '';
                  return dates[i];
                },
                label: function (context) {
                  var value = context.parsed && context.parsed.y;
                  var n = Number(value);
                  if (!Number.isFinite(n)) n = 0;
                  return '收盘价 ' + formatMoney(n, priceDecimals);
                },
              },
            },
          },
          scales: {
            x: {
              ticks: {
                color: GX_CHART_AXIS_COLOR,
                maxRotation: 45,
                font: { size: 11, weight: '600' },
              },
              grid: { color: GX_CHART_GRID_COLOR },
            },
            y: {
              ticks: {
                color: GX_CHART_AXIS_COLOR,
                font: { size: 11, weight: '600' },
                callback: function (value) {
                  var n = Number(value);
                  if (!Number.isFinite(n)) n = 0;
                  return formatMoney(n, priceDecimals);
                },
              },
              grid: { color: GX_CHART_GRID_COLOR },
            },
          },
        },
      });

      return function () {
        if (priceTrendChartInstance.current) {
          try {
            priceTrendChartInstance.current.destroy();
          } catch (_) {}
          priceTrendChartInstance.current = null;
        }
      };
    },
    [effectiveHistory, stock.market, sliceLastWindow, formatMoney],
  );

  if (!effectiveHistory || effectiveHistory.length === 0) {
    return (
      <div className="card mb-6 p-4 text-center">
        <div className="icon-chart-bar mb-2 flex justify-center text-4xl text-slate-500" />
        <p className="text-sm text-slate-300">
          暂无历史数据，请刷新后获取价格。若已获取请稍等数秒。
        </p>
      </div>
    );
  }

  const hasMoreData = effectiveHistory.length > 30;

  return (
    <div className="mb-6 space-y-4">
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <div className="icon-chart-bar text-sm text-emerald-400" />
            每日盈亏（按持仓推算）
          </h4>
          {hasMoreData && (
            <span className="text-xs font-medium text-slate-300">最近约 30 天</span>
          )}
        </div>
        <p className="mb-2 text-xs leading-relaxed text-slate-200">
          柱状图表示：若持仓不变，仅因股价变动，每个交易日大约盈亏多少（与上方持仓分析一致）。
        </p>
        {profitSummary && (
          <div className="mb-2 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1.5 text-sm">
            <span className="text-slate-300">最近交易日 </span>
            <span className="font-mono text-slate-100">{profitSummary.date}</span>
            <span className="text-slate-300"> 当日约 </span>
            <span
              className={
                profitSummary.profit >= 0
                  ? 'font-semibold text-emerald-400'
                  : 'font-semibold text-rose-300'
              }
            >
              {profitSummary.profit >= 0 ? '+' : ''}
              {formatMoney(profitSummary.profit, 2)}
            </span>
          </div>
        )}
        <div style={{ height: '200px' }}>
          <canvas ref={dailyProfitChartRef} />
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <div className="icon-trending-up text-sm text-amber-400" />
            收盘价走势
          </h4>
          <span className="text-xs font-medium text-slate-300">
            最近约 {Math.min(windowSize, effectiveHistory.length)} 个交易日
          </span>
        </div>
        <p className="mb-2 text-xs leading-relaxed text-slate-200">
          下图只有一条线：历史收盘价。关键数字已写在下面，无需对准曲线才能看价。
        </p>
        {priceSummary && (
          <div className="mb-3 space-y-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2.5 backdrop-blur-sm">
            <div className="text-sm text-slate-100">
              <span className="text-slate-400">最新 </span>
              <span className="font-mono font-medium text-slate-200">{priceSummary.lastDate}</span>
              <span className="mx-1.5 text-slate-500">|</span>
              <span className="gx-num font-mono text-lg font-bold text-amber-300 tabular-nums">
                {formatMoney(priceSummary.lastPrice)}
              </span>
              {priceSummary.dayChg != null &&
                Number.isFinite(priceSummary.dayChg) && (
                  <span
                    className={
                      'gx-num ml-2 text-sm font-medium tabular-nums ' +
                      (priceSummary.dayChg >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-300')
                    }
                  >
                    较前一交易日{' '}
                    {priceSummary.dayChg >= 0 ? '+' : ''}
                    {formatMoney(
                      priceSummary.dayChg,
                      stock.market === 'US' ? 3 : 2,
                    )}
                    {priceSummary.dayPct != null &&
                      Number.isFinite(priceSummary.dayPct) && (
                        <span>
                          {' '}
                          ({priceSummary.dayPct >= 0 ? '+' : ''}
                          {priceSummary.dayPct.toFixed(2)}%)
                        </span>
                      )}
                  </span>
                )}
            </div>
            <div className="text-xs leading-relaxed text-slate-300">
              区间内最低 {formatMoney(priceSummary.min)}（{priceSummary.minDate || '—'}）
              <span className="mx-1.5 text-slate-500">·</span>
              最高 {formatMoney(priceSummary.max)}（{priceSummary.maxDate || '—'}）
            </div>
            <p className="text-[11px] text-slate-300">
              悬停曲线可查看任意一天的收盘价。
            </p>
          </div>
        )}
        <div style={{ height: '220px' }}>
          <canvas ref={priceTrendChartRef} />
        </div>
      </div>
    </div>
  );
}
