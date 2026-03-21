function PortfolioSummary({ summary, capitalPool, onUpdateCapitalPool }) {
  try {
    const safeSummary = summary && typeof summary === 'object' ? summary : { totalCost: 0, totalValue: 0, totalProfit: 0, totalProfitPercent: 0 };
    const [isEditingCapital, setIsEditingCapital] = React.useState(false);
    const [editCapital, setEditCapital] = React.useState('');

    const pool = capitalPool && typeof capitalPool === 'object' ? capitalPool : { usd: 0, hkd: 0, cny: 0 };
    const totalCapitalHKD = Number((pool.usd || 0) * 7.78) + Number(pool.hkd || 0) + Number(pool.cny || 0);
    const totalCost = Number(safeSummary.totalCost) || 0;
    const remainingCapital = totalCapitalHKD - totalCost;
    const usedPercent = totalCapitalHKD > 0 ? (totalCost / totalCapitalHKD * 100) : 0;

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
      <div className="bg-white rounded-lg md:rounded-xl shadow-md border border-gray-300 p-3 md:p-4 mb-4 md:mb-6" data-name="portfolio-summary" data-file="components/PortfolioSummary.js">
        <h2 className="text-base md:text-lg font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
          <div className="icon-pie-chart text-base text-[var(--primary-color)]"></div>
          投资组合总览
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200 min-h-0">
            <div className="icon-wallet text-blue-600 shrink-0"></div>
            <div className="min-w-0">
              <span className="text-xs text-[var(--text-secondary)]">资金池</span>
              {isEditingCapital ? (
                <div className="flex items-center gap-1 mt-0.5">
                  <input type="number" step="0.01" value={typeof editCapital === 'string' ? editCapital : String(editCapital ?? '')} onChange={(e) => setEditCapital(e.target.value == null ? '' : String(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') handleCapitalSave(); }} className="w-20 px-1 py-0.5 text-xs border border-blue-300 rounded" autoFocus />
                  <button onClick={handleCapitalSave} className="text-green-600 p-0.5" title="保存"><div className="icon-check text-xs"></div></button>
                  <button onClick={handleCapitalCancel} className="text-red-600 p-0.5" title="取消"><div className="icon-x text-xs"></div></button>
                </div>
              ) : (
                <button onClick={handleCapitalEdit} className="block text-sm font-bold text-blue-800 hover:text-blue-900 text-left">
                  HK${formatPrice(totalCapitalHKD, 2)}{!isEditingCapital && <span className="text-xs font-normal text-gray-600 ml-1">已用 {usedPercent.toFixed(1)}%</span>}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 bg-orange-50 rounded-lg border border-orange-200 min-h-0">
            <div className="icon-dollar-sign text-orange-600 shrink-0"></div>
            <div className="min-w-0"><span className="text-xs text-[var(--text-secondary)]">总投入</span><p className="text-sm font-bold text-orange-800">{formatPrice(safeSummary.totalCost, 2)}</p></div>
          </div>
          <div className={`flex items-center gap-2 p-2 rounded-lg border min-h-0 ${remainingCapital >= 0 ? 'bg-cyan-50 border-cyan-200' : 'bg-red-50 border-red-200'}`}>
            <div className={`shrink-0 ${remainingCapital >= 0 ? 'icon-piggy-bank text-cyan-600' : 'icon-alert-circle text-red-600'}`}></div>
            <div className="min-w-0"><span className="text-xs text-[var(--text-secondary)]">剩余资金</span><p className={`text-sm font-bold ${remainingCapital >= 0 ? 'text-cyan-800' : 'text-red-800'}`}>{remainingCapital >= 0 ? '' : '-'}{formatPrice(Math.abs(remainingCapital), 2)}</p></div>
          </div>
          <div className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg border border-purple-200 min-h-0">
            <div className="icon-trending-up text-purple-600 shrink-0"></div>
            <div className="min-w-0"><span className="text-xs text-[var(--text-secondary)]">当前市值</span><p className="text-sm font-bold text-purple-800">{formatPrice(safeSummary.totalValue, 2)}</p></div>
          </div>
          <div className={`flex items-center gap-2 p-2 rounded-lg border min-h-0 ${(safeSummary.totalProfit || 0) >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className={`shrink-0 ${(safeSummary.totalProfit || 0) >= 0 ? 'icon-trending-up text-[var(--success-color)]' : 'icon-trending-down text-[var(--danger-color)]'}`}></div>
            <div className="min-w-0"><span className="text-xs text-[var(--text-secondary)]">总盈亏</span><p className={`text-sm font-bold ${(safeSummary.totalProfit || 0) >= 0 ? 'profit-positive' : 'profit-negative'}`}>{(safeSummary.totalProfit || 0) >= 0 ? '+' : ''}{formatPrice(safeSummary.totalProfit, 2)} ({(safeSummary.totalProfitPercent || 0) >= 0 ? '+' : ''}{(Number(safeSummary.totalProfitPercent) || 0).toFixed(2)}%)</p></div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('PortfolioSummary component error:', error);
    return null;
  }
}