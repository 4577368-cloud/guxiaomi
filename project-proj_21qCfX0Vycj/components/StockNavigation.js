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

              const marketTheme =
                stock.market === "US"
                  ? { bg: "bg-blue-400/[0.12]", text: "text-blue-100", border: "border-blue-400/20", hover: "hover:bg-blue-400/[0.20]" }
                  : stock.market === "HK"
                  ? { bg: "bg-orange-400/[0.12]", text: "text-orange-100", border: "border-orange-400/20", hover: "hover:bg-orange-400/[0.20]" }
                  : { bg: "bg-red-400/[0.12]", text: "text-red-100", border: "border-red-400/20", hover: "hover:bg-red-400/[0.20]" };

              return (
                <a
                  key={stock.id}
                  href={detailUrl}
                  title={`${marketName} · 查看 ${stock.symbol} 详情`}
                  className={`inline-flex h-7 min-w-[3.65rem] items-center justify-center gap-1 rounded-full border px-2.5 text-xs font-black tabular-nums transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 md:h-8 md:min-w-[4rem] md:px-3 md:text-sm ${marketTheme.bg} ${marketTheme.text} ${marketTheme.border} ${marketTheme.hover}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full md:h-2 md:w-2 ${isProfit ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
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
