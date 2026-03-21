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
        return p >= 0 ? 'rgba(5, 150, 105, 0.8)' : 'rgba(220, 38, 38, 0.8)';
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
                return v >= 0 ? '#065f46' : '#991b1b';
              },
              backgroundColor: 'rgba(255,255,255,0.94)',
              borderRadius: 4,
              borderWidth: 1,
              borderColor: function (ctx) {
                var v = ctx.dataset.data[ctx.dataIndex];
                return v >= 0
                  ? 'rgba(5, 150, 105, 0.45)'
                  : 'rgba(220, 38, 38, 0.45)';
              },
              padding: { top: 2, right: 4, bottom: 2, left: 4 },
              font: { size: 10, weight: '600' },
              anchor: 'end',
              align: 'top',
              offset: 2,
              clip: false,
            },
            tooltip: {
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
            y: {
              beginAtZero: true,
              grace: '10%',
              ticks: {
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
                    return 'rgba(0, 0, 0, 0.3)';
                  }
                  return 'rgba(0, 0, 0, 0.1)';
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
              borderColor: 'rgba(37, 99, 235, 1)',
              backgroundColor: 'rgba(37, 99, 235, 0.12)',
              borderWidth: 2,
              fill: true,
              tension: 0.35,
              pointRadius: 3,
              pointHoverRadius: 5,
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
              labels: { boxWidth: 12, font: { size: 11 } },
            },
            datalabels: {
              display: showPriceLabel,
              formatter: function (value) {
                return formatMoney(value, priceDecimals);
              },
              color: '#172554',
              backgroundColor: 'rgba(255,255,255,0.94)',
              borderColor: 'rgba(37, 99, 235, 0.5)',
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
            y: {
              ticks: {
                callback: function (value) {
                  var n = Number(value);
                  if (!Number.isFinite(n)) n = 0;
                  return formatMoney(n, priceDecimals);
                },
              },
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
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
        <div className="icon-bar-chart text-4xl text-gray-300 mb-2 flex justify-center" />
        <p className="text-sm text-gray-500">
          暂无历史数据，请刷新后获取价格。若已获取请稍等数秒。
        </p>
      </div>
    );
  }

  const hasMoreData = effectiveHistory.length > 30;

  return (
    <div className="mb-6 space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <div className="icon-bar-chart text-sm text-green-600" />
            每日盈亏（按持仓推算）
          </h4>
          {hasMoreData && (
            <span className="text-xs text-gray-500">最近约 30 天</span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-2 leading-relaxed">
          柱状图表示：若持仓不变，仅因股价变动，每个交易日大约盈亏多少（与上方持仓分析一致）。
        </p>
        {profitSummary && (
          <div className="mb-2 rounded-md bg-emerald-50/60 border border-emerald-100/80 px-2.5 py-1.5 text-sm">
            <span className="text-gray-600">最近交易日 </span>
            <span className="font-mono text-gray-800">{profitSummary.date}</span>
            <span className="text-gray-600"> 当日约 </span>
            <span
              className={
                profitSummary.profit >= 0
                  ? 'font-semibold text-red-600'
                  : 'font-semibold text-emerald-700'
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

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2">
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <div className="icon-trending-up text-sm text-blue-600" />
            收盘价走势
          </h4>
          <span className="text-xs text-gray-500">
            最近约 {Math.min(windowSize, effectiveHistory.length)} 个交易日
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-2 leading-relaxed">
          下图只有一条线：历史收盘价。关键数字已写在下面，无需对准曲线才能看价。
        </p>
        {priceSummary && (
          <div className="mb-3 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 space-y-1.5">
            <div className="text-sm text-slate-800">
              <span className="text-gray-500">最新 </span>
              <span className="font-mono font-medium">{priceSummary.lastDate}</span>
              <span className="mx-1.5 text-gray-300">|</span>
              <span className="font-mono text-lg font-bold text-blue-700 tabular-nums">
                {formatMoney(priceSummary.lastPrice)}
              </span>
              {priceSummary.dayChg != null &&
                Number.isFinite(priceSummary.dayChg) && (
                  <span
                    className={
                      'ml-2 text-sm font-medium tabular-nums ' +
                      (priceSummary.dayChg >= 0
                        ? 'text-red-600'
                        : 'text-emerald-600')
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
            <div className="text-xs text-gray-600 leading-relaxed">
              区间内最低 {formatMoney(priceSummary.min)}（{priceSummary.minDate || '—'}）
              <span className="mx-1.5 text-gray-300">·</span>
              最高 {formatMoney(priceSummary.max)}（{priceSummary.maxDate || '—'}）
            </div>
            <p className="text-[11px] text-gray-400">
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
