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
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600/10 ring-1 ring-indigo-500/20 md:h-7 md:w-7">
              <div className="icon-navigation text-sm text-indigo-600 md:text-base"></div>
            </div>
            <span className="font-display text-[11px] font-bold uppercase tracking-wide text-indigo-600/90 md:text-xs">
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
                  className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums shadow-sm transition-all duration-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 md:px-2.5 md:py-1 md:text-sm ${
                    isProfit
                      ? "border border-emerald-300/60 bg-gradient-to-b from-emerald-50 to-emerald-100/90 text-emerald-900 hover:border-emerald-400/80 hover:from-emerald-100 hover:to-emerald-50"
                      : "border border-rose-300/60 bg-gradient-to-b from-rose-50 to-rose-100/90 text-rose-900 hover:border-rose-400/80 hover:from-rose-100 hover:to-rose-50"
                  }`}
                >
                  <span>{stock.symbol}</span>
                  <span
                    className={`text-sm font-bold leading-none md:text-base ${
                      isProfit ? "text-emerald-600" : "text-rose-600"
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
