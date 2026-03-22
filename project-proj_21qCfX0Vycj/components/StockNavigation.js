function StockNavigation({ portfolio }) {
  try {
    if (!portfolio || portfolio.length === 0) {
      return null;
    }

    const scrollToStock = (stockId) => {
      const stockElement = document.getElementById(`stock-${stockId}`);
      if (stockElement) {
        stockElement.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    };

    return (
      <div className="glass-quick-nav" data-name="stock-navigation" data-file="components/StockNavigation.js">
        <div className="glass-quick-nav-inner">
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400/35 to-amber-600/15 shadow-[0_0_16px_-4px_rgba(251,191,36,0.55)] ring-1 ring-amber-300/40 md:h-7 md:w-7">
              <div className="icon-navigation text-sm text-amber-50 drop-shadow-sm md:text-base"></div>
            </div>
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.12em] text-white drop-shadow-sm md:text-xs">
              快速导航
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 md:gap-2">
            {portfolio.map((stock) => {
              const analysis = calculateStockAnalysis(stock, stock.brokerChannel);
              const isProfit = analysis.profit >= 0;

              return (
                <button
                  key={stock.id}
                  type="button"
                  onClick={() => scrollToStock(stock.id)}
                  title={`跳转到 ${stock.symbol}`}
                  className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums transition-all duration-200 hover:scale-[1.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 md:px-2.5 md:py-1 md:text-sm ${
                    isProfit
                      ? "border border-emerald-300/60 bg-gradient-to-br from-emerald-400/30 to-emerald-700/20 text-white shadow-[0_0_22px_-6px_rgba(52,211,153,0.55)] hover:border-emerald-200/70 hover:from-emerald-400/42 hover:to-emerald-700/28 hover:shadow-[0_0_28px_-4px_rgba(52,211,153,0.65)]"
                      : "border border-rose-300/60 bg-gradient-to-br from-rose-400/30 to-rose-700/22 text-white shadow-[0_0_22px_-6px_rgba(251,113,133,0.5)] hover:border-rose-200/70 hover:from-rose-400/42 hover:to-rose-700/30 hover:shadow-[0_0_28px_-4px_rgba(251,113,133,0.6)]"
                  }`}
                >
                  <span className="drop-shadow-sm">{stock.symbol}</span>
                  <span
                    className={`text-sm font-extrabold leading-none md:text-base ${
                      isProfit ? "text-emerald-100" : "text-rose-100"
                    }`}
                    aria-hidden
                  >
                    {isProfit ? "↗" : "↘"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error("StockNavigation component error:", error);
    return null;
  }
}
