/** 仓位分配：现代环形图 + 图例（Chart.js doughnut） */
/** 高饱和、与深色底区分明显（避免灰块糊成一片） */
var ALLOCATION_CHART_COLORS = [
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#84cc16",
  "#22d3ee",
  "#f97316",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#0ea5e9",
];

function PositionAllocationCard({ portfolio, capitalPool }) {
  var canvasRef = React.useRef(null);
  var chartRef = React.useRef(null);

  try {
    if (!portfolio || portfolio.length === 0) return null;

    var derived = React.useMemo(
      function () {
        var totalCapitalHKD =
          (capitalPool && capitalPool.usd ? Number(capitalPool.usd) : 0) * 7.78 +
          (capitalPool && capitalPool.hkd ? Number(capitalPool.hkd) : 0) +
          (capitalPool && capitalPool.cny ? Number(capitalPool.cny) : 0);

        if (!(totalCapitalHKD > 0)) {
          return null;
        }

        var positions = portfolio
          .map(function (stock) {
            var analysis = calculateStockAnalysis(stock, stock.brokerChannel);
            var valueInHKD = analysis.currentValue;
            if (stock.market === "US") {
              valueInHKD = valueInHKD * 7.78;
            }
            var allocation = (valueInHKD / totalCapitalHKD) * 100;
            return {
              symbol: stock.symbol,
              market: stock.market,
              valueInHKD: valueInHKD,
              allocation: allocation,
              profit: analysis.profit,
              profitPercent: analysis.profitPercent,
            };
          })
          .sort(function (a, b) {
            return b.allocation - a.allocation;
          });

        var totalPositionValue = positions.reduce(function (sum, pos) {
          return sum + pos.valueInHKD;
        }, 0);
        var remainingCapital = totalCapitalHKD - totalPositionValue;
        var remainingPercent = (remainingCapital / totalCapitalHKD) * 100;

        var labels = positions.map(function (p) {
          return p.symbol;
        });
        var data = positions.map(function (p) {
          return Math.round(p.allocation * 10) / 10;
        });
        var colors = positions.map(function (_, i) {
          return ALLOCATION_CHART_COLORS[i % ALLOCATION_CHART_COLORS.length];
        });

        if (remainingCapital > 0.01 && remainingPercent > 0.05) {
          labels.push("剩余资金");
          data.push(Math.round(remainingPercent * 10) / 10);
          colors.push("rgba(14, 165, 233, 0.4)");
        }

        return {
          totalCapitalHKD: totalCapitalHKD,
          positions: positions,
          totalPositionValue: totalPositionValue,
          remainingCapital: remainingCapital,
          remainingPercent: remainingPercent,
          chartPayload: { labels: labels, data: data, colors: colors },
        };
      },
      [portfolio, capitalPool],
    );

    React.useEffect(
      function () {
        if (!derived || !derived.chartPayload.labels.length) return;
        var canvas = canvasRef.current;
        var Chart = window.Chart;
        if (!canvas || !Chart) return;

        if (chartRef.current) {
          chartRef.current.destroy();
          chartRef.current = null;
        }

        var compact =
          typeof window !== "undefined" &&
          window.matchMedia &&
          window.matchMedia("(max-width: 640px)").matches;
        var cp = derived.chartPayload;
        chartRef.current = new Chart(canvas, {
          type: "doughnut",
          data: {
            labels: cp.labels,
            datasets: [
              {
                data: cp.data,
                backgroundColor: cp.colors.map(function(c) {
                  if (c.includes('rgba')) return c;
                  return c + '40';
                }),
                borderColor: cp.colors,
                borderWidth: compact ? 2 : 3,
                spacing: compact ? 2 : 4,
                borderRadius: compact ? 5 : 8,
                hoverBorderWidth: compact ? 3 : 4,
                hoverBorderColor: "#ffffff",
                hoverOffset: compact ? 3 : 6,
                hoverBackgroundColor: cp.colors,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              animateRotate: true,
              animateScale: true,
              duration: 800,
              easing: 'easeOutQuart'
            },
            plugins: {
              legend: { display: false },
              datalabels: { display: false },
              tooltip: {
                backgroundColor: "rgba(15, 23, 42, 0.98)",
                titleColor: "#f8fafc",
                bodyColor: "#e2e8f0",
                borderColor: "rgba(255,255,255,0.3)",
                borderWidth: 1,
                padding: 12,
                cornerRadius: 12,
                boxPadding: 6,
                callbacks: {
                  title: function(ctx) {
                    return ctx[0].label;
                  },
                  label: function (ctx) {
                    var v = ctx.raw;
                    return "仓位: " + (typeof v === "number" ? v.toFixed(1) : v) + "%";
                  },
                },
              },
            },
            cutout: compact ? "72%" : "68%",
          },
        });

        return function () {
          if (chartRef.current) {
            chartRef.current.destroy();
            chartRef.current = null;
          }
        };
      },
      [derived],
    );

    if (!derived) return null;

    var positions = derived.positions;
    var totalPositionValue = derived.totalPositionValue;
    var remainingCapital = derived.remainingCapital;
    var remainingPercent = derived.remainingPercent;
    var totalCapitalHKD = derived.totalCapitalHKD;
    var posPct = ((totalPositionValue / totalCapitalHKD) * 100).toFixed(1);

    return (
      <div
        className="card gx-allocation-card mb-4 overflow-hidden p-3 md:p-4"
        data-name="position-allocation-card"
        data-file="components/PositionAllocationCard.js"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 md:mb-4">
          <h2 className="font-display flex items-center gap-2 text-sm font-bold text-slate-100 md:text-lg">
            <div className="icon-pie-chart text-cyan-400"></div>
            仓位分配
          </h2>
          <div className="flex items-center gap-3 text-xs md:gap-4 md:text-sm">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-cyan-400"></div>
              <span className="text-slate-400">持仓</span>
              <span className="gx-num tabular-nums font-semibold text-cyan-300">
                {posPct}%
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-sky-400"></div>
              <span className="text-slate-400">现金</span>
              <span className="gx-num tabular-nums font-semibold text-sky-300">
                {remainingPercent.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-12 md:gap-4">
          <div className="mx-auto flex h-[108px] w-full max-w-[150px] items-center justify-center min-[520px]:col-span-4 min-[520px]:mx-0 sm:h-[128px] sm:max-w-[178px] md:h-[170px] md:max-w-[220px] lg:col-span-4">
            <div className="relative h-full w-full">
              <canvas ref={canvasRef} className="max-h-full max-w-full" />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold leading-none text-slate-100 sm:text-xl md:text-3xl">
                  {formatPrice(totalCapitalHKD, 0)}
                </span>
                <span className="mt-1 text-[10px] leading-none text-slate-400 md:text-xs">HK$ 总资产</span>
              </div>
            </div>
          </div>
          <div className="min-w-0 min-[520px]:col-span-8 lg:col-span-8">
            <ul className="space-y-1.5 md:space-y-2">
              {positions.slice(0, 6).map(function (pos, index) {
                var hue = ALLOCATION_CHART_COLORS[index % ALLOCATION_CHART_COLORS.length];
                return (
                  <li
                    key={pos.symbol + "-" + index}
                    className="group flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 transition-all hover:border-white/20 hover:bg-white/10 md:px-3 md:py-2"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/20"
                      style={{ backgroundColor: hue }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 font-semibold text-slate-100 truncate">{pos.symbol}</span>
                    <span className="shrink-0 rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                      {pos.market === "US" ? "美" : pos.market === "HK" ? "港" : "A"}
                    </span>
                    <div className="flex items-center gap-2 md:gap-3">
                      <span className="gx-num tabular-nums font-bold text-slate-100 text-sm">
                        {pos.allocation.toFixed(1)}%
                      </span>
                      <span
                        className={
                          "gx-num tabular-nums text-[10px] md:text-xs font-semibold px-1.5 md:px-2 py-0.5 rounded-full " +
                          (pos.profit >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/15 text-rose-300")
                        }
                      >
                        {pos.profitPercent >= 0 ? "+" : ""}
                        {pos.profitPercent.toFixed(1)}%
                      </span>
                    </div>
                  </li>
                );
              })}
              {positions.length > 6 && (
                <li className="text-center text-xs text-slate-500 py-2">
                  还有 {positions.length - 6} 只股票...
                </li>
              )}
              {remainingCapital > 0.01 && remainingPercent > 0.05 && (
                <li className="flex items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-950/30 px-2.5 py-1.5 md:px-3 md:py-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full bg-sky-400 ring-2 ring-white/30"
                    aria-hidden
                  />
                  <span className="flex-1 font-medium text-slate-300">剩余资金</span>
                  <span className="gx-num tabular-nums font-bold text-slate-200">
                    {remainingPercent.toFixed(1)}%
                  </span>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error("PositionAllocationCard component error:", error);
    return null;
  }
}
