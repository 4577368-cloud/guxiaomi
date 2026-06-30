function PortfolioSummary({ summary, capitalPool, onUpdateCapitalPool }) {
  try {
    const safeSummary = summary && typeof summary === 'object' ? summary : { totalCost: 0, totalValue: 0, totalProfit: 0, totalProfitPercent: 0, stockCount: 0, profitableStocks: 0, losingStocks: 0 };
    const [isEditingCapital, setIsEditingCapital] = React.useState(false);
    const [editCapital, setEditCapital] = React.useState('');

    const pool = capitalPool && typeof capitalPool === 'object' ? capitalPool : { usd: 0, hkd: 0, cny: 0 };
    const totalCapitalHKD = Number((pool.usd || 0) * 7.78) + Number(pool.hkd || 0) + Number(pool.cny || 0);
    const totalCost = Number(safeSummary.totalCost) || 0;
    const remainingCapital = totalCapitalHKD - totalCost;
    const usedPercent = totalCapitalHKD > 0 ? (totalCost / totalCapitalHKD * 100) : 0;
    const profitStatus = safeSummary.totalProfit >= 0;

    const handleCapitalEdit = () => {
      setEditCapital(Number.isFinite(totalCapitalHKD) ? String(totalCapitalHKD) : '0');
      setIsEditingCapital(true);
    };

    const handleCapitalSave = () => {
      const raw = typeof editCapital === 'string' ? editCapital.trim() : String(editCapital ?? '');
      const newTotal = parseFloat(raw);
      if (!Number.isFinite(newTotal) || newTotal < 0) {
        setIsEditingCapital(false);
        return;
      }
      try {
        const safeTotalCapitalHKD = Number.isFinite(totalCapitalHKD) ? totalCapitalHKD : 0;
        const safeUsd = Number.isFinite(Number(pool.usd)) ? Number(pool.usd) : 0;
        const safeHkd = Number.isFinite(Number(pool.hkd)) ? Number(pool.hkd) : 0;
        const safeCny = Number.isFinite(Number(pool.cny)) ? Number(pool.cny) : 0;

        if (safeTotalCapitalHKD === 0 || newTotal === 0) {
          onUpdateCapitalPool && onUpdateCapitalPool({ usd: 0, hkd: newTotal, cny: 0 });
        } else {
          const ratio = newTotal / safeTotalCapitalHKD;
          onUpdateCapitalPool && onUpdateCapitalPool({
            usd: Number((safeUsd * ratio).toFixed(2)),
            hkd: Number((safeHkd * ratio).toFixed(2)),
            cny: Number((safeCny * ratio).toFixed(2))
          });
        }
      } catch (err) {
        console.error('保存资金池失败', err);
      }
      setIsEditingCapital(false);
      setEditCapital('');
    };

    const handleCapitalCancel = () => {
      setIsEditingCapital(false);
      setEditCapital(0);
    };

    return (
      <div className="card mb-4 p-4" data-name="portfolio-summary" data-file="components/PortfolioSummary.js">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display flex items-center gap-2 text-base font-bold text-slate-100 md:text-lg">
            <div className="icon-bar-chart-2 text-cyan-400"></div>
            投资组合总览
          </h2>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>共 {safeSummary.stockCount || 0} 只股票</span>
            <span className="flex items-center gap-1">
              <span className="text-emerald-400">🟢 {safeSummary.profitableStocks || 0}</span>
              <span className="text-rose-300">🔴 {safeSummary.losingStocks || 0}</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="col-span-2 md:col-span-1 rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="icon-wallet text-cyan-400"></div>
              <span className="text-xs font-medium text-slate-400">资金池</span>
            </div>
            {isEditingCapital ? (
              <div className="flex items-center gap-1">
                <input type="number" step="0.01" value={typeof editCapital === 'string' ? editCapital : String(editCapital ?? '')} onChange={(e) => setEditCapital(e.target.value == null ? '' : String(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') handleCapitalSave(); }} className="input-field w-full rounded px-2 py-1 text-sm bg-slate-800/50 border-slate-600" autoFocus />
              </div>
            ) : (
              <button onClick={handleCapitalEdit} className="w-full text-left">
                <span className="gx-num text-lg font-bold text-cyan-300 tabular-nums">
                  {formatPrice(totalCapitalHKD, 0)}
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                    <div className="h-full rounded-full bg-cyan-400" style={{ width: usedPercent + '%' }}></div>
                  </div>
                  <span className="text-[10px] text-slate-500">{usedPercent.toFixed(0)}%</span>
                </div>
              </button>
            )}
          </div>

          <div className="rounded-xl border border-amber-400/25 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="icon-dollar-sign text-amber-400"></div>
              <span className="text-xs font-medium text-slate-400">总投入</span>
            </div>
            <p className="gx-num text-lg font-bold tabular-nums text-amber-200">{formatPrice(safeSummary.totalCost, 0)}</p>
          </div>

          <div className="rounded-xl border border-sky-400/25 bg-gradient-to-br from-sky-500/10 to-sky-500/5 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="icon-piggy-bank text-sky-400"></div>
              <span className="text-xs font-medium text-slate-400">剩余资金</span>
            </div>
            <p className="gx-num text-lg font-bold tabular-nums text-sky-300">{formatPrice(remainingCapital, 0)}</p>
          </div>

          <div className="rounded-xl border border-violet-400/25 bg-gradient-to-br from-violet-500/10 to-violet-500/5 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="icon-trending-up text-violet-400"></div>
              <span className="text-xs font-medium text-slate-400">当前市值</span>
            </div>
            <p className="gx-num text-lg font-bold tabular-nums text-violet-200">{formatPrice(safeSummary.totalValue, 0)}</p>
          </div>

          <div className={`rounded-xl border ${profitStatus ? 'border-emerald-400/30' : 'border-lime-400/30'} bg-gradient-to-br ${profitStatus ? 'from-emerald-500/15 to-emerald-500/5' : 'from-lime-500/15 to-lime-500/5'} p-3 backdrop-blur-sm`}>
            <div className="flex items-center gap-2 mb-1">
              <div className={profitStatus ? 'icon-trending-up text-emerald-400' : 'icon-trending-down text-rose-300'}></div>
              <span className="text-xs font-medium text-slate-400">总盈亏</span>
            </div>
            <p className={`gx-num text-lg font-bold tabular-nums ${profitStatus ? 'text-emerald-300' : 'text-rose-300'}`}>
              {(safeSummary.totalProfit || 0) >= 0 ? '+' : ''}{formatPrice(safeSummary.totalProfit, 0)}
            </p>
            <p className={`gx-num text-xs font-semibold tabular-nums mt-0.5 ${profitStatus ? 'text-emerald-400/80' : 'text-rose-300/80'}`}>
              {(safeSummary.totalProfitPercent || 0) >= 0 ? '+' : ''}{(Number(safeSummary.totalProfitPercent) || 0).toFixed(2)}%
            </p>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('PortfolioSummary component error:', error);
    return null;
  }
}