function StockNavigation({ portfolio }) {
  try {
    if (!portfolio || portfolio.length === 0) {
      return null;
    }

    return (
      <div className="glass-quick-nav" data-name="stock-navigation" data-file="components/StockNavigation.js">
        <div className="glass-quick-nav-inner">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 md:gap-2">
            {portfolio.map((stock) => {
              const analysis = calculateStockAnalysis(stock, stock.brokerChannel);
              const isProfit = analysis.profit >= 0;
              const marketName = stock.market === "US" ? "美股" : stock.market === "HK" ? "港股" : "A股";
              const detailUrl = `stock-detail.html?code=${encodeURIComponent(stock.symbol)}&market=${encodeURIComponent(marketName)}${stock.name ? "&name=" + encodeURIComponent(stock.name) : ""}`;

              return (
                <a
                  key={stock.id}
                  href={detailUrl}
                  title={`查看 ${stock.symbol} 详情`}
                  className={`inline-flex h-7 min-w-[3.65rem] items-center justify-center rounded-full px-2.5 text-xs font-black tabular-nums transition-all duration-200 hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 md:h-8 md:min-w-[4rem] md:px-3 md:text-sm ${
                    isProfit
                      ? "bg-emerald-400/[0.10] text-emerald-100 hover:text-white"
                      : "bg-rose-400/[0.10] text-rose-100 hover:text-white"
                  }`}
                >
                  <span className="drop-shadow-sm">{stock.symbol}</span>
                </a>
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
