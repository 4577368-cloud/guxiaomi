function HoldingsSummaryTable({ portfolio }) {
  try {
    // Collect all positions from all stocks
    const allPositions = [];
    
    portfolio.forEach(stock => {
      if (stock.positions && stock.positions.length > 0) {
        const enabledPositions = stock.positions.filter(pos => pos.enabled !== false);
        enabledPositions.forEach(position => {
          const cp = Number(stock.currentPrice);
          const buyP = Number(position.price);
          const sh = Number(position.shares) || 0;
          const profitLoss =
            Number.isFinite(cp) && Number.isFinite(buyP) ? (cp - buyP) * sh : 0;
          const profitLossPercent =
            buyP > 0 && Number.isFinite(cp)
              ? ((cp / buyP) - 1) * 100
              : 0;
          const posDate = position.date ? new Date(position.date) : new Date(NaN);
          const holdingDays = Number.isFinite(posDate.getTime())
            ? Math.floor((Date.now() - posDate.getTime()) / (1000 * 60 * 60 * 24))
            : 0;
          const currencySymbol = stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : 'HK$';
          
          // Calculate daily profit/loss（changePercent 可能来自 JSON 字符串）
          const dailyChange = Number(stock.marketData?.changePercent);
          const dailyChangeN = Number.isFinite(dailyChange) ? dailyChange : 0;
          const dailyProfitLoss =
            Number.isFinite(cp) && sh
              ? cp * sh * (dailyChangeN / 100)
              : 0;
          
          allPositions.push({
            symbol: stock.symbol,
            market: stock.market,
            buyPrice: position.price,
            shares: position.shares,
            date: position.date,
            holdingDays,
            currentPrice: stock.currentPrice,
            profitLoss,
            profitLossPercent,
            dailyProfitLoss,
            dailyChange: dailyChangeN,
            currencySymbol
          });
        });
      }
    });

    if (allPositions.length === 0) return null;

    return (
      <div className="bg-white rounded-lg md:rounded-xl shadow-md border border-gray-300 p-3 md:p-6 mb-4 md:mb-6" data-name="holdings-summary-table" data-file="components/HoldingsSummaryTable.js">
        <h2 className="text-base md:text-lg font-bold text-[var(--text-primary)] mb-3 md:mb-4 flex items-center gap-2">
          <div className="icon-list text-base md:text-lg text-[var(--primary-color)]"></div>
          持仓明细汇总
        </h2>
        
        {/* Mobile view - Card layout */}
        <div className="block md:hidden space-y-3">
          {allPositions.map((pos, index) => (
            <div key={index} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-bold text-sm">{pos.symbol}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    ({pos.market === 'US' ? '美股' : pos.market === 'HK' ? '港股' : 'A股'})
                  </span>
                </div>
                <div>
                  <div className={`text-sm font-bold ${pos.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`} dangerouslySetInnerHTML={{ __html: `${pos.profitLoss >= 0 ? '+' : ''}${pos.currencySymbol}${formatPrice(pos.profitLoss, 2)}` }} />
                  <div className={`text-xs ${pos.dailyProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    今日: {pos.dailyProfitLoss >= 0 ? '+' : ''}{pos.currencySymbol}{formatPrice(Math.abs(pos.dailyProfitLoss), 2)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">买入价:</span>
                  <span className="ml-1 font-medium" dangerouslySetInnerHTML={{ __html: `${pos.currencySymbol}${formatPrice(pos.buyPrice, 3)}` }} />
                </div>
                <div>
                  <span className="text-gray-500">当前价:</span>
                  <span className="ml-1 font-medium" dangerouslySetInnerHTML={{ __html: `${pos.currencySymbol}${formatPrice(pos.currentPrice, 3)}` }} />
                </div>
                <div>
                  <span className="text-gray-500">股数:</span>
                  <span className="ml-1 font-medium">{pos.shares}</span>
                </div>
                <div>
                  <span className="text-gray-500">持仓天数:</span>
                  <span className="ml-1 font-medium">{pos.holdingDays}天</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">日期:</span>
                  <span className="ml-1 font-medium">{new Date(pos.date).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop view - Table layout */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b-2 border-gray-200">
                <th className="text-left py-3 px-4 font-semibold">股票代码</th>
                <th className="text-left py-3 px-4 font-semibold">买入价格</th>
                <th className="text-center py-3 px-4 font-semibold">股数</th>
                <th className="text-left py-3 px-4 font-semibold">买入日期</th>
                <th className="text-center py-3 px-4 font-semibold">持仓天数</th>
                <th className="text-left py-3 px-4 font-semibold">当前价格</th>
                <th className="text-right py-3 px-4 font-semibold">当日盈亏</th>
                <th className="text-right py-3 px-4 font-semibold">浮动盈亏</th>
              </tr>
            </thead>
            <tbody>
              {allPositions.map((pos, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{pos.symbol}</span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {pos.market === 'US' ? '美股' : pos.market === 'HK' ? '港股' : 'A股'}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-medium" dangerouslySetInnerHTML={{ __html: `${pos.currencySymbol}${formatPrice(pos.buyPrice, 3)}` }} />
                  <td className="py-3 px-4 text-center font-medium">{(Number(pos.shares) || 0).toLocaleString()}</td>
                  <td className="py-3 px-4">{new Date(pos.date).toLocaleDateString('zh-CN')}</td>
                  <td className="py-3 px-4 text-center">{pos.holdingDays}天</td>
                  <td className="py-3 px-4 font-medium" dangerouslySetInnerHTML={{ __html: `${pos.currencySymbol}${formatPrice(pos.currentPrice, 3)}` }} />
                  <td className="py-3 px-4 text-right">
                    <div className={`font-bold ${pos.dailyProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`} dangerouslySetInnerHTML={{ __html: `${pos.dailyProfitLoss >= 0 ? '+' : ''}${pos.currencySymbol}${formatPrice(Math.abs(pos.dailyProfitLoss), 2)}` }} />
                    <div className={`text-xs ${pos.dailyProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ({(Number(pos.dailyChange) >= 0 ? '+' : '')}{(Number.isFinite(Number(pos.dailyChange)) ? Number(pos.dailyChange) : 0).toFixed(2)}%)
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className={`font-bold ${pos.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`} dangerouslySetInnerHTML={{ __html: `${pos.profitLoss >= 0 ? '+' : ''}${pos.currencySymbol}${formatPrice(pos.profitLoss, 2)}` }} />
                    <div className={`text-xs ${pos.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ({(Number(pos.profitLossPercent) >= 0 ? '+' : '')}{(Number.isFinite(Number(pos.profitLossPercent)) ? Number(pos.profitLossPercent) : 0).toFixed(2)}%)
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  } catch (error) {
    console.error('HoldingsSummaryTable component error:', error);
    return null;
  }
}
