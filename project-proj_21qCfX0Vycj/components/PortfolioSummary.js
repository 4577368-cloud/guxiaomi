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

    const statCard =
      'flex min-h-0 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] p-2 backdrop-blur-sm';

    return (
      <div className="card mb-4 p-3 shadow-md md:mb-6 md:rounded-xl md:p-4" data-name="portfolio-summary" data-file="components/PortfolioSummary.js">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-slate-100 md:text-lg">
          <div className="icon-pie-chart text-base text-cyan-400"></div>
          投资组合总览
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div className={statCard + ' border-cyan-400/30'}>
            <div className="icon-wallet shrink-0 text-cyan-400"></div>
            <div className="min-w-0">
              <span className="block text-xs font-medium text-slate-300">资金池</span>
              {isEditingCapital ? (
                <div className="mt-0.5 flex items-center gap-1">
                  <input type="number" step="0.01" value={typeof editCapital === 'string' ? editCapital : String(editCapital ?? '')} onChange={(e) => setEditCapital(e.target.value == null ? '' : String(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') handleCapitalSave(); }} className="input-field w-24 rounded px-1.5 py-0.5 text-xs" autoFocus />
                  <button onClick={handleCapitalSave} className="p-0.5 text-emerald-400" title="保存"><div className="icon-check text-xs"></div></button>
                  <button onClick={handleCapitalCancel} className="p-0.5 text-lime-400" title="取消"><div className="icon-x text-xs"></div></button>
                </div>
              ) : (
                <button onClick={handleCapitalEdit} className="block text-left">
                  <span className="gx-num text-sm font-bold text-cyan-300 tabular-nums">HK${formatPrice(totalCapitalHKD, 2)}</span>
                  {!isEditingCapital && (
                    <span className="ml-1 text-xs font-medium text-slate-300">已用 {usedPercent.toFixed(1)}%</span>
                  )}
                </button>
              )}
            </div>
          </div>
          <div className={statCard + ' border-amber-400/25'}>
            <div className="icon-dollar-sign shrink-0 text-amber-400"></div>
            <div className="min-w-0">
              <span className="block text-xs font-medium text-slate-300">总投入</span>
              <p className="gx-num text-sm font-bold tabular-nums text-amber-200">{formatPrice(safeSummary.totalCost, 2)}</p>
            </div>
          </div>
          <div className={statCard + (remainingCapital >= 0 ? ' border-emerald-400/25' : ' border-lime-400/35')}>
            <div className={'shrink-0 ' + (remainingCapital >= 0 ? 'icon-piggy-bank text-emerald-400' : 'icon-alert-circle text-lime-400')}></div>
            <div className="min-w-0">
              <span className="block text-xs font-medium text-slate-300">剩余资金</span>
              <p className={'gx-num text-sm font-bold tabular-nums ' + (remainingCapital >= 0 ? 'text-emerald-300' : 'text-lime-300')}>
                {remainingCapital >= 0 ? '' : '-'}{formatPrice(Math.abs(remainingCapital), 2)}
              </p>
            </div>
          </div>
          <div className={statCard + ' border-amber-400/40'}>
            <div className="icon-trending-up shrink-0 text-amber-400"></div>
            <div className="min-w-0">
              <span className="block text-xs font-medium text-slate-300">当前市值</span>
              <p className="gx-num text-sm font-bold tabular-nums text-amber-200">{formatPrice(safeSummary.totalValue, 2)}</p>
            </div>
          </div>
          <div className={statCard + ((safeSummary.totalProfit || 0) >= 0 ? ' border-emerald-400/25' : ' border-lime-400/35')}>
            <div className={'shrink-0 ' + ((safeSummary.totalProfit || 0) >= 0 ? 'icon-trending-up text-emerald-400' : 'icon-trending-down text-lime-400')}></div>
            <div className="min-w-0">
              <span className="block text-xs font-medium text-slate-300">总盈亏</span>
              <p className={'gx-num text-sm font-bold tabular-nums ' + ((safeSummary.totalProfit || 0) >= 0 ? 'text-emerald-300' : 'text-lime-300')}>
                {(safeSummary.totalProfit || 0) >= 0 ? '+' : ''}{formatPrice(safeSummary.totalProfit, 2)} ({(safeSummary.totalProfitPercent || 0) >= 0 ? '+' : ''}{(Number(safeSummary.totalProfitPercent) || 0).toFixed(2)}%)
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('PortfolioSummary component error:', error);
    return null;
  }
}