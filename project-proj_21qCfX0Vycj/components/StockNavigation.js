function StockNavigation({ portfolio }) {
  try {
    if (!portfolio || portfolio.length === 0) {
      return null;
    }

    const scrollToStock = (stockId) => {
      const stockElement = document.getElementById(`stock-${stockId}`);
      if (stockElement) {
        stockElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start'
        });
      }
    };

    return (
      <div className="mb-3 md:mb-4 p-2 md:p-3 bg-white rounded-lg shadow-sm border border-gray-200" data-name="stock-navigation" data-file="components/StockNavigation.js">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="flex items-center gap-1">
            <div className="icon-navigation text-xs md:text-sm text-[var(--primary-color)]"></div>
            <span className="text-xs md:text-sm font-medium text-[var(--text-secondary)]">快速导航:</span>
          </div>
          <div className="flex flex-wrap gap-1.5 md:gap-2">
          {portfolio.map(stock => {
            const analysis = calculateStockAnalysis(stock, stock.brokerChannel);
            const isProfit = analysis.profit >= 0;
            
            return (
              <button
                key={stock.id}
                onClick={() => scrollToStock(stock.id)}
                className={`px-1.5 md:px-2 py-0.5 md:py-1 text-xs font-medium rounded-md transition-all duration-200 hover:scale-105 ${
                  isProfit 
                    ? 'bg-green-100 text-green-700 border border-green-200 hover:bg-green-200' 
                    : 'bg-red-100 text-red-700 border border-red-200 hover:bg-red-200'
                }`}
              >
                {stock.symbol}
                <span className={`ml-0.5 md:ml-1 text-xs ${
                  isProfit ? 'text-green-600' : 'text-red-600'
                }`}>
                  {isProfit ? '↗' : '↘'}
                </span>
              </button>
            );
          })}
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('StockNavigation component error:', error);
    return null;
  }
}