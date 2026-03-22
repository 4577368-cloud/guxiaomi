/** 仓位分配：紧凑环形图 + 图例（Chart.js doughnut） */
/** 高饱和、与深色底区分明显（避免灰块糊成一片） */
var ALLOCATION_CHART_COLORS = [
  "#22d3ee",
  "#34d399",
  "#fbbf24",
  "#84cc16",
  "#bef264",
  "#2dd4bf",
  "#f97316",
  "#60a5fa",
  "#f472b6",
  "#4ade80",
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
          colors.push("rgba(56, 189, 248, 0.55)");
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

        var cp = derived.chartPayload;
        chartRef.current = new Chart(canvas, {
          type: "doughnut",
          data: {
            labels: cp.labels,
            datasets: [
              {
                data: cp.data,
                backgroundColor: cp.colors,
                borderWidth: 0,
                spacing: 3,
                borderRadius: 6,
                hoverBorderWidth: 2,
                hoverBorderColor: "rgba(255,255,255,0.85)",
                hoverOffset: 4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400 },
            plugins: {
              legend: { display: false },
              datalabels: { display: false },
              tooltip: {
                backgroundColor: "rgba(15, 23, 42, 0.95)",
                titleColor: "#f8fafc",
                bodyColor: "#e2e8f0",
                borderColor: "rgba(255,255,255,0.25)",
                borderWidth: 1,
                padding: 10,
                callbacks: {
                  label: function (ctx) {
                    var v = ctx.raw;
                    return " " + (typeof v === "number" ? v.toFixed(1) : v) + "%";
                  },
                },
              },
            },
            cutout: "62%",
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
        className="card gx-allocation-card mb-3 overflow-hidden p-3 md:mb-4 md:p-4"
        data-name="position-allocation-card"
        data-file="components/PositionAllocationCard.js"
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-white/15 pb-2">
          <h2 className="font-display flex items-center gap-2 text-sm font-bold text-slate-100 md:text-base">
            <div className="icon-pie-chart text-cyan-400"></div>
            仓位分配
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:text-sm">
            <span className="text-slate-400">
              持仓{" "}
              <strong className="gx-num tabular-nums text-cyan-300">
                HK${formatPrice(totalPositionValue, 2)}
              </strong>
              <span className="text-slate-500"> ({posPct}%)</span>
            </span>
            <span className="hidden text-slate-600 sm:inline">·</span>
            <span className="text-slate-400">
              现金{" "}
              <strong className="gx-num tabular-nums text-emerald-300">
                HK${formatPrice(remainingCapital, 2)}
              </strong>
              <span className="text-slate-500"> ({remainingPercent.toFixed(1)}%)</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-12 md:gap-4">
          <div className="mx-auto flex h-[140px] w-full max-w-[200px] items-center justify-center min-[480px]:col-span-5 min-[480px]:mx-0 md:h-[160px] md:max-w-none lg:col-span-4">
            <canvas ref={canvasRef} className="max-h-full max-w-full" />
          </div>
          <div className="min-w-0 min-[480px]:col-span-7 lg:col-span-8">
            <ul className="max-h-[200px] space-y-1.5 overflow-y-auto pr-1 text-sm md:max-h-[180px]">
              {positions.map(function (pos, index) {
                var hue = ALLOCATION_CHART_COLORS[index % ALLOCATION_CHART_COLORS.length];
                return (
                  <li
                    key={pos.symbol + "-" + index}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/30"
                      style={{ backgroundColor: hue }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{pos.symbol}</span>
                    <span className="shrink-0 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                      {pos.market === "US" ? "美" : pos.market === "HK" ? "港" : "A"}
                    </span>
                    <span className="gx-num tabular-nums shrink-0 font-bold text-slate-100">
                      {pos.allocation.toFixed(1)}%
                    </span>
                    <span
                      className={
                        "gx-num shrink-0 tabular-nums text-xs font-semibold " +
                        (pos.profit >= 0 ? "text-emerald-400" : "text-lime-400")
                      }
                    >
                      {pos.profitPercent >= 0 ? "+" : ""}
                      {pos.profitPercent.toFixed(1)}%
                    </span>
                  </li>
                );
              })}
              {remainingCapital > 0.01 && remainingPercent > 0.05 && (
                <li className="flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-950/35 px-2 py-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-400 ring-1 ring-white/40"
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
