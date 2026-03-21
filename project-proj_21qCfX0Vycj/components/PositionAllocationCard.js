function PositionAllocationCard({ portfolio, capitalPool }) {
  try {
    if (portfolio.length === 0) return null;

    // Calculate total capital in HKD
    const totalCapitalHKD = (capitalPool?.usd || 0) * 7.78 + 
                            (capitalPool?.hkd || 0) + 
                            (capitalPool?.cny || 0);

    if (totalCapitalHKD === 0) return null;

    // Calculate position values and allocations
    const positions = portfolio.map(stock => {
      const analysis = calculateStockAnalysis(stock, stock.brokerChannel);
      let valueInHKD = analysis.currentValue;
      
      if (stock.market === 'US') {
        valueInHKD = valueInHKD * 7.78;
      }
      
      const allocation = (valueInHKD / totalCapitalHKD) * 100;
      
      return {
        symbol: stock.symbol,
        market: stock.market,
        valueInHKD,
        allocation,
        profit: analysis.profit,
        profitPercent: analysis.profitPercent
      };
    }).sort((a, b) => b.allocation - a.allocation);

    const totalPositionValue = positions.reduce((sum, pos) => sum + pos.valueInHKD, 0);
    const remainingCapital = totalCapitalHKD - totalPositionValue;
    const remainingPercent = (remainingCapital / totalCapitalHKD) * 100;

    return (
      <div className="bg-white rounded-lg md:rounded-xl shadow-md border border-gray-300 p-3 md:p-6 mb-4 md:mb-6 overflow-hidden min-w-0" data-name="position-allocation-card" data-file="components/PositionAllocationCard.js">
        <h2 className="text-base md:text-lg font-bold text-[var(--text-primary)] mb-3 md:mb-4 flex items-center gap-2">
          <div className="icon-pie-chart text-base md:text-lg text-[var(--primary-color)]"></div>
          仓位分配
        </h2>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="text-center p-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
            <span className="text-xs text-gray-600 block mb-1">持仓市值</span>
            <p className="text-base md:text-lg font-bold text-blue-800">HK${formatPrice(totalPositionValue, 2)}</p>
            <p className="text-xs text-blue-600 mt-1">{((totalPositionValue / totalCapitalHKD) * 100).toFixed(1)}%</p>
          </div>
          <div className="text-center p-3 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
            <span className="text-xs text-gray-600 block mb-1">剩余资金</span>
            <p className="text-base md:text-lg font-bold text-green-800">HK${formatPrice(remainingCapital, 2)}</p>
            <p className="text-xs text-green-600 mt-1">{remainingPercent.toFixed(1)}%</p>
          </div>
        </div>

        <div className="space-y-2">
          {positions.map((pos, index) => (
            <div key={index} className="relative">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{pos.symbol}</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {pos.market === 'US' ? '美股' : pos.market === 'HK' ? '港股' : 'A股'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-sm">{pos.allocation.toFixed(1)}%</span>
                  <span className={`text-xs ml-2 ${pos.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ({pos.profitPercent >= 0 ? '+' : ''}{pos.profitPercent.toFixed(1)}%)
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden min-w-0">
                <div
                  className={`h-2 rounded-full ${pos.profit >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, Math.max(0, pos.allocation))}%` }}
                ></div>
              </div>
            </div>
          ))}
          
          {remainingCapital > 0 && (
            <div className="relative pt-2 border-t border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm text-gray-600">剩余资金</span>
                <span className="font-bold text-sm">{remainingPercent.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden min-w-0">
                <div
                  className="h-2 rounded-full bg-gray-400"
                  style={{ width: `${Math.min(100, Math.max(0, remainingPercent))}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error('PositionAllocationCard component error:', error);
    return null;
  }
}