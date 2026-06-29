function HoldingsSummaryTable({ portfolio }) {
  try {
    const allPositions = [];
    
    portfolio.forEach(stock => {
      if (stock.positions && stock.positions.length > 0) {
        const enabledPositions = stock.positions.filter(pos => pos.enabled !== false);
        const batchTotal = enabledPositions.length;
        enabledPositions.forEach((position, batchIdx) => {
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
          
          const dailyChange = Number(stock.marketData?.changePercent);
          const dailyChangeN = Number.isFinite(dailyChange) ? dailyChange : 0;
          const dailyProfitLoss =
            Number.isFinite(cp) && sh
              ? cp * sh * (dailyChangeN / 100)
              : 0;
          
          const posId =
            position.id != null
              ? String(position.id)
              : `p-${batchIdx}-${String(position.date)}-${position.price}`;
          allPositions.push({
            rowKey: `${stock.id || stock.symbol}-${posId}`,
            symbol: stock.symbol,
            market: stock.market,
            batchNote:
              batchTotal > 1 ? `第${batchIdx + 1}/${batchTotal}笔` : '',
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

    const isProfit = (val) => val >= 0;

    return (
      <div className="card mb-4 p-4" data-name="holdings-summary-table" data-file="components/HoldingsSummaryTable.js">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display flex items-center gap-2 text-base font-bold text-slate-100 md:text-lg">
            <div className="icon-list text-cyan-400"></div>
            持仓明细汇总
          </h2>
          <span className="text-xs text-slate-500">{allPositions.length} 笔持仓</span>
        </div>

        <div className="block md:hidden space-y-3">
          {allPositions.map((pos) => (
            <div key={pos.rowKey} className="rounded-xl border border-white/15 bg-gradient-to-br from-white/5 to-transparent p-3 backdrop-blur-sm">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-100">{pos.symbol}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                    pos.market === 'US' ? 'bg-blue-500/20 text-blue-300' :
                    pos.market === 'HK' ? 'bg-orange-500/20 text-orange-300' :
                    'bg-red-500/20 text-red-300'
                  }`}>
                    {pos.market === 'US' ? '美' : pos.market === 'HK' ? '港' : 'A'}
                  </span>
                  {pos.batchNote && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-medium">
                      {pos.batchNote}
                    </span>
                  )}
                </div>
                <div className={`px-2 py-1 rounded-lg text-xs font-bold ${isProfit(pos.profitLoss) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-lime-500/20 text-lime-400'}`}>
                  {isProfit(pos.profitLoss) ? '+' : ''}{pos.profitLossPercent.toFixed(1)}%
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-slate-500">买入价</span>
                  <p className="gx-num font-medium text-slate-200 tabular-nums">{pos.currencySymbol}{formatPrice(pos.buyPrice, 3)}</p>
                </div>
                <div>
                  <span className="text-slate-500">当前价</span>
                  <p className="gx-num font-medium text-slate-200 tabular-nums">{pos.currencySymbol}{formatPrice(pos.currentPrice, 3)}</p>
                </div>
                <div>
                  <span className="text-slate-500">股数</span>
                  <p className="gx-num font-medium text-slate-200 tabular-nums">{pos.shares}</p>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-slate-500">{new Date(pos.date).toLocaleDateString('zh-CN')} · {pos.holdingDays}天</span>
                <span className={`text-xs font-semibold ${isProfit(pos.dailyProfitLoss) ? 'text-emerald-400' : 'text-lime-400'}`}>
                  今日 {isProfit(pos.dailyProfitLoss) ? '+' : ''}{pos.currencySymbol}{formatPrice(Math.abs(pos.dailyProfitLoss), 2)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900/60 rounded-xl">
                <th className="px-4 py-3 text-left font-semibold text-slate-300 rounded-tl-xl">股票</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-300">买入价</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-300">股数</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-300">日期</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-300">天数</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-300">当前价</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-300">当日盈亏</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-300 rounded-tr-xl">浮动盈亏</th>
              </tr>
            </thead>
            <tbody>
              {allPositions.map((pos, idx) => (
                <tr
                  key={pos.rowKey}
                  className={`border-b border-white/5 transition-colors hover:bg-white/5 ${idx % 2 === 0 ? '' : 'bg-white/[0.02]'}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-100">{pos.symbol}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                        pos.market === 'US' ? 'bg-blue-500/20 text-blue-300' :
                        pos.market === 'HK' ? 'bg-orange-500/20 text-orange-300' :
                        'bg-red-500/20 text-red-300'
                      }`}>
                        {pos.market === 'US' ? '美' : pos.market === 'HK' ? '港' : 'A'}
                      </span>
                      {pos.batchNote && (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-medium">
                          {pos.batchNote}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="gx-num px-4 py-3 font-medium text-slate-200 tabular-nums">{pos.currencySymbol}{formatPrice(pos.buyPrice, 3)}</td>
                  <td className="gx-num px-4 py-3 text-center font-medium text-slate-200 tabular-nums">{(Number(pos.shares) || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-400">{new Date(pos.date).toLocaleDateString('zh-CN')}</td>
                  <td className="px-4 py-3 text-center text-slate-400">{pos.holdingDays}天</td>
                  <td className="gx-num px-4 py-3 font-medium text-slate-200 tabular-nums">{pos.currencySymbol}{formatPrice(pos.currentPrice, 3)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className={`gx-num font-bold tabular-nums ${isProfit(pos.dailyProfitLoss) ? 'text-emerald-400' : 'text-lime-400'}`}>
                      {isProfit(pos.dailyProfitLoss) ? '+' : ''}{pos.currencySymbol}{formatPrice(Math.abs(pos.dailyProfitLoss), 2)}
                    </div>
                    <div className={`gx-num text-xs font-semibold tabular-nums ${isProfit(pos.dailyChange) ? 'text-emerald-400/70' : 'text-lime-400/70'}`}>
                      ({isProfit(pos.dailyChange) ? '+' : ''}{Number(pos.dailyChange).toFixed(2)}%)
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className={`gx-num font-bold tabular-nums ${isProfit(pos.profitLoss) ? 'text-emerald-400' : 'text-lime-400'}`}>
                      {isProfit(pos.profitLoss) ? '+' : ''}{pos.currencySymbol}{formatPrice(pos.profitLoss, 2)}
                    </div>
                    <div className={`gx-num text-xs font-semibold tabular-nums ${isProfit(pos.profitLossPercent) ? 'text-emerald-400/70' : 'text-lime-400/70'}`}>
                      ({isProfit(pos.profitLossPercent) ? '+' : ''}{Number(pos.profitLossPercent).toFixed(2)}%)
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
