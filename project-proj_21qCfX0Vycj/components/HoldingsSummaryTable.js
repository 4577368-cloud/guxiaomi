function HoldingsSummaryTable({ portfolio }) {
  try {
    // Collect all positions from all stocks
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
          
          // Calculate daily profit/loss（changePercent 可能来自 JSON 字符串）
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

    const marketTag =
      'inline-flex shrink-0 items-center rounded border border-white/25 bg-slate-900/90 px-2 py-0.5 text-[11px] font-semibold text-slate-100';

    return (
      <div className="card mb-4 p-3 shadow-md md:mb-6 md:rounded-xl md:p-6" data-name="holdings-summary-table" data-file="components/HoldingsSummaryTable.js">
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-100 md:mb-4 md:text-lg">
          <div className="icon-list text-base text-cyan-400 md:text-lg"></div>
          持仓明细汇总
        </h2>
        
        {/* Mobile view - Card layout */}
        <div className="block md:hidden space-y-3">
          {allPositions.map((pos) => (
            <div key={pos.rowKey} className="rounded-lg border border-white/15 bg-white/[0.06] p-3 backdrop-blur-sm">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-100">
                    {pos.symbol}
                    {pos.batchNote ? (
                      <span className="ml-1.5 text-xs font-semibold text-amber-300">
                        {pos.batchNote}
                      </span>
                    ) : null}
                  </span>
                  <span className={marketTag}>
                    {pos.market === 'US' ? '美股' : pos.market === 'HK' ? '港股' : 'A股'}
                  </span>
                </div>
                <div className="text-right">
                  <div className={`gx-num text-sm font-bold tabular-nums ${pos.profitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} dangerouslySetInnerHTML={{ __html: `${pos.profitLoss >= 0 ? '+' : ''}${pos.currencySymbol}${formatPrice(pos.profitLoss, 2)}` }} />
                  <div className={`gx-num text-xs tabular-nums font-semibold ${pos.dailyProfitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    今日: {pos.dailyProfitLoss >= 0 ? '+' : ''}{pos.currencySymbol}{formatPrice(Math.abs(pos.dailyProfitLoss), 2)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-200">
                <div>
                  <span className="text-slate-400">买入价:</span>
                  <span className="ml-1 font-medium tabular-nums" dangerouslySetInnerHTML={{ __html: `${pos.currencySymbol}${formatPrice(pos.buyPrice, 3)}` }} />
                </div>
                <div>
                  <span className="text-slate-400">当前价:</span>
                  <span className="ml-1 font-medium tabular-nums" dangerouslySetInnerHTML={{ __html: `${pos.currencySymbol}${formatPrice(pos.currentPrice, 3)}` }} />
                </div>
                <div>
                  <span className="text-slate-400">股数:</span>
                  <span className="ml-1 font-medium tabular-nums">{pos.shares}</span>
                </div>
                <div>
                  <span className="text-slate-400">持仓天数:</span>
                  <span className="ml-1 font-medium">{pos.holdingDays}天</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400">日期:</span>
                  <span className="ml-1 font-medium">{new Date(pos.date).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop view - Table layout */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm selection:bg-sky-500/35 selection:text-white">
            <thead>
              <tr className="border-b border-white/15 bg-slate-900/55">
                <th className="px-4 py-3 text-left font-semibold text-slate-200">股票代码 / 批次</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-200">买入价格</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-200">股数</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-200">买入日期</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-200">持仓天数</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-200">当前价格</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-200">当日盈亏</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-200">浮动盈亏</th>
              </tr>
            </thead>
            <tbody>
              {allPositions.map((pos) => (
                <tr
                  key={pos.rowKey}
                  className="border-b border-white/10 text-slate-100 transition-colors hover:bg-white/[0.07] active:bg-white/[0.1]"
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-50">{pos.symbol}</span>
                      {pos.batchNote ? (
                        <span className="rounded border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-200">
                          {pos.batchNote}
                        </span>
                      ) : null}
                      <span className={marketTag}>
                        {pos.market === 'US' ? '美股' : pos.market === 'HK' ? '港股' : 'A股'}
                      </span>
                    </div>
                  </td>
                  <td className="gx-num px-4 py-3 font-medium tabular-nums" dangerouslySetInnerHTML={{ __html: `${pos.currencySymbol}${formatPrice(pos.buyPrice, 3)}` }} />
                  <td className="gx-num px-4 py-3 text-center font-medium tabular-nums">{(Number(pos.shares) || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-200">{new Date(pos.date).toLocaleDateString('zh-CN')}</td>
                  <td className="px-4 py-3 text-center text-slate-200">{pos.holdingDays}天</td>
                  <td className="gx-num px-4 py-3 font-medium tabular-nums" dangerouslySetInnerHTML={{ __html: `${pos.currencySymbol}${formatPrice(pos.currentPrice, 3)}` }} />
                  <td className="px-4 py-3 text-right">
                    <div className={`gx-num font-bold tabular-nums ${pos.dailyProfitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} dangerouslySetInnerHTML={{ __html: `${pos.dailyProfitLoss >= 0 ? '+' : ''}${pos.currencySymbol}${formatPrice(Math.abs(pos.dailyProfitLoss), 2)}` }} />
                    <div className={`gx-num text-xs font-semibold tabular-nums ${pos.dailyProfitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      ({(Number(pos.dailyChange) >= 0 ? '+' : '')}{(Number.isFinite(Number(pos.dailyChange)) ? Number(pos.dailyChange) : 0).toFixed(2)}%)
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className={`gx-num font-bold tabular-nums ${pos.profitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} dangerouslySetInnerHTML={{ __html: `${pos.profitLoss >= 0 ? '+' : ''}${pos.currencySymbol}${formatPrice(pos.profitLoss, 2)}` }} />
                    <div className={`gx-num text-xs font-semibold tabular-nums ${pos.profitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
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
