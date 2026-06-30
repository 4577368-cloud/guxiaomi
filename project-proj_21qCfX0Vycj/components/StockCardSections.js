/** 持仓区（含添加持仓弹窗）异常时只降级本块，避免整页「页面渲染错误」 */
class HoldingsSectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("[HoldingsSectionErrorBoundary]", error, info && info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mb-6 p-4 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900">
          <p className="font-medium">持仓区域加载失败</p>
          <p className="text-xs mt-1 text-amber-800/90">
            已隔离错误，其余内容仍可使用。请点击重试或刷新页面；若反复出现请查看浏览器控制台。
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm mt-2"
            onClick={() => this.setState({ hasError: false })}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function _safePositionDateLabel(dateStr) {
  if (dateStr == null || dateStr === "") return "—";
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.getMonth() + 1 + "-" + d.getDate();
}

function _safeDaysHeld(dateStr) {
  if (dateStr == null || dateStr === "") return "—";
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  var t0 = new Date();
  t0.setHours(0, 0, 0, 0);
  var t1 = new Date(d);
  t1.setHours(0, 0, 0, 0);
  var diff = Math.floor((t0 - t1) / (1000 * 60 * 60 * 24));
  return Number.isFinite(diff) ? String(diff) : "—";
}

function StockBasicInfo({ stock, brokerChannel, onBrokerChannelChange, onPriceUpdate, onRefreshAllPrices }) {
  const [isEditingPrice, setIsEditingPrice] = React.useState(false);
  const [editPrice, setEditPrice] = React.useState('');

  if (!stock) return null;

  const handlePriceEdit = () => {
    const v = stock.currentPrice;
    setEditPrice((v != null && v !== '') ? String(v) : '');
    setIsEditingPrice(true);
  };

  const handlePriceSave = () => {
    const raw = typeof editPrice === 'string' ? editPrice.trim() : String(editPrice ?? '');
    const newPrice = parseFloat(raw);
    if (Number.isFinite(newPrice) && newPrice >= 0) {
      try {
        if (onPriceUpdate) onPriceUpdate(newPrice);
      } catch (err) {
        console.error('保存价格失败', err);
      }
    }
    setIsEditingPrice(false);
    setEditPrice('');
  };

  const handlePriceCancel = () => {
    setIsEditingPrice(false);
    setEditPrice('');
  };

  const marketLabel = stock.market === 'US' ? '美股' : stock.market === 'HK' ? '港股' : 'A股';
  const pricePrefix = stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : '';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--text-secondary)]">购入渠道</span>
        <select
          value={brokerChannel}
          onChange={(e) => onBrokerChannelChange(e.target.value)}
          className="min-w-0 max-w-[140px] py-1 text-sm"
          title="选择佣金与费率计算所用渠道"
        >
          <option value="futu">富途</option>
          <option value="longbridge">长桥</option>
          <option value="boc">中银</option>
        </select>
      </div>
      <div className="flex items-center gap-1.5"><span className="text-[var(--text-secondary)]">市场</span><span className="font-medium">{marketLabel}</span></div>
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--text-secondary)]">当前价格</span>
        {isEditingPrice ? (
          <span className="flex items-center gap-1">
            <input type="number" step="0.001" value={String(editPrice)} onChange={(e) => setEditPrice(e.target.value == null ? '' : String(e.target.value))} className="w-16 px-1 py-0.5 text-xs border rounded" placeholder="0" autoFocus />
            <button type="button" onClick={handlePriceSave} className="text-green-600 p-0.5" title="保存"><div className="icon-check text-xs"></div></button>
            <button type="button" onClick={handlePriceCancel} className="text-lime-400 p-0.5" title="取消"><div className="icon-x text-xs"></div></button>
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <button type="button" onClick={handlePriceEdit} className="font-bold text-amber-300 hover:text-yellow-300 flex items-center gap-0.5" title="点击编辑价格">
              <span dangerouslySetInnerHTML={{ __html: pricePrefix + formatPrice(stock.currentPrice || 0) }} /><div className="icon-edit text-xs"></div>
            </button>
            {onRefreshAllPrices && (
              <button type="button" onClick={() => { try { onRefreshAllPrices(); } catch (e) { console.error(e); } }} className="text-[var(--text-secondary)] hover:text-amber-300 p-0.5" title="获取全部持仓最新价格">
                <div className="icon-refresh-cw text-xs"></div>
              </button>
            )}
          </span>
        )}
        {stock.marketData?.isMock && (
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-md border border-amber-400/40" title="当前数据为模拟数据，非真实市场价格">
            <div className="icon-alert-circle text-xs"></div>
            模拟数据
          </span>
        )}
      </div>
    </div>
  );
}

function MarketDataSection({ stock }) {
  if (!stock.marketData || Object.keys(stock.marketData).length === 0) return null;
  const prefix = stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : '';
  const hasExtendedData = stock.marketData.previousClose !== undefined;
  const ti = stock.technicalIndicators;
  const ma5n = Number(ti && ti.ma5);
  const ma10n = Number(ti && ti.ma10);
  const rsin = Number(ti && ti.rsi);
  const hasTI =
    ti &&
    ((Number.isFinite(ma5n) && ma5n > 0) ||
      (Number.isFinite(ma10n) && ma10n > 0) ||
      (Number.isFinite(rsin) && rsin > 0));
  const openStr = prefix + formatPrice(stock.marketData.open || 0);
  const highStr = prefix + formatPrice(stock.marketData.high || 0);
  const lowStr = prefix + formatPrice(stock.marketData.low || 0);
  const prevStr = prefix + formatPrice(stock.marketData.previousClose || 0);
  const ch = Number(stock.marketData.change);
  const chN = Number.isFinite(ch) ? ch : 0;
  const chPct = Number(stock.marketData.changePercent);
  const chPctN = Number.isFinite(chPct) ? chPct : 0;
  const changeCls = chN >= 0 ? 'text-emerald-400' : 'text-rose-300';
  const changeSign = chN >= 0 ? '+' : '';
  const chPctCls = chPctN >= 0 ? 'text-emerald-400' : 'text-rose-300';
  const chPctStr = (chPctN >= 0 ? '+' : '') + chPctN.toFixed(2) + '%';
  const rsiCls =
    Number.isFinite(rsin) && rsin > 70
      ? "text-lime-400"
      : Number.isFinite(rsin) && rsin < 30
        ? "text-green-600"
        : "text-gray-700";
  const rsiDisplay = Number.isFinite(rsin) ? rsin.toFixed(2) : "—";
  return (
    <div className="mb-4">
      <div className="px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>开盘 <strong>{openStr}</strong>{stock.marketData.isManual && <span className="text-xs rounded border border-amber-400/50 bg-amber-500/20 px-1 text-amber-200 ml-0.5">手动</span>}</span>
          <span>最高 <strong className="text-green-600">{highStr}</strong></span>
          <span>最低 <strong className="text-rose-300">{lowStr}</strong></span>
          <span>成交量 <strong>{formatVolume(stock.marketData.volume || 0)}</strong></span>
          {hasExtendedData && (
            <>
              <span>前收 <strong>{prevStr}</strong></span>
              <span>涨跌 <strong className={changeCls}>{changeSign}{prefix}{formatPrice(chN)}</strong></span>
              <span>涨跌幅 <strong className={chPctCls}>{chPctStr}</strong></span>
            </>
          )}
          {hasTI && (
            <>
              <span>MA5 <strong className="text-amber-300 tabular-nums">{prefix}{formatPrice(Number.isFinite(ma5n) ? ma5n : 0)}</strong></span>
              <span>MA10 <strong className="text-yellow-300 tabular-nums">{prefix}{formatPrice(Number.isFinite(ma10n) ? ma10n : 0)}</strong></span>
              <span>RSI(14) <strong className={rsiCls}>{rsiDisplay}</strong></span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HoldingsAnalysisSection({ stockAnalysis, stock }) {
  const profitPct = Number(stockAnalysis.profitPercent);
  const dailyPct = Number(stockAnalysis.dailyProfitPercent);
  const profitPctStr = (Number.isFinite(profitPct) ? profitPct : 0).toFixed(2);
  const dailyPctStr = (Number.isFinite(dailyPct) ? dailyPct : 0).toFixed(2);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 py-2 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
      <span><span className="text-[var(--text-secondary)]">总成本</span> <strong className="text-gray-800">{formatPrice(stockAnalysis.totalCost, 2)}</strong></span>
      <span><span className="text-[var(--text-secondary)]">平均成本</span> <strong className="text-gray-800">{formatPrice(stockAnalysis.avgCost)}</strong></span>
      <span><span className="text-[var(--text-secondary)]">保本价</span> <strong className="text-orange-600">{formatPrice(stockAnalysis.breakEvenPrice)}</strong></span>
      <span><span className="text-[var(--text-secondary)]">当前市值</span> <strong className="text-amber-300 tabular-nums">{formatPrice(stockAnalysis.currentValue, 2)}</strong></span>
      <span><span className="text-[var(--text-secondary)]">浮动盈亏</span> <strong className={stockAnalysis.profit >= 0 ? 'profit-positive' : 'profit-negative'}>{stockAnalysis.profit >= 0 ? '+' : ''}{formatPrice(stockAnalysis.profit, 2)} ({(profitPct >= 0 ? '+' : '') + profitPctStr}%)</strong></span>
      <span><span className="text-[var(--text-secondary)]">每日盈亏</span> <strong className={stockAnalysis.dailyProfitLoss >= 0 ? 'profit-positive' : 'profit-negative'}>{stockAnalysis.dailyProfitLoss >= 0 ? '+' : ''}{formatPrice(stockAnalysis.dailyProfitLoss, 2)} ({(dailyPct >= 0 ? '+' : '') + dailyPctStr}%)</strong></span>
    </div>
  );
}

function PositionsSection({ 
  stock, 
  brokerChannel, 
  onUpdatePosition, 
  onDeletePosition, 
  showPositionForm, 
  setShowPositionForm, 
  editingPosition, 
  setEditingPosition, 
  showBuyFeesDetail, 
  setShowBuyFeesDetail, 
  onAddPosition,
  onBrokerChannelChange
}) {
  if (!stock || !stock.id) {
    return (
      <div className="mb-6 p-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600">
        持仓数据异常，请刷新页面或重新选择股票。
      </div>
    );
  }
  const positions = Array.isArray(stock.positions) ? stock.positions : [];
  const mkt = stock.market;
  const currencyPrefix = mkt === "US" ? "$" : mkt === "CN" ? "¥" : "";
  return (
    <div className="mb-6" id={`stock-${stock.id}`}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <div className="icon-layers text-lg text-amber-400"></div>
          持仓记录 ({positions.length})
        </h4>
        <button
          type="button"
          onClick={() => setShowPositionForm(true)}
          className="btn btn-primary btn-sm"
        >
          <div className="icon-plus text-sm"></div>
          
        </button>
      </div>


      {positions.length > 0 ? (
        <div className="space-y-2">
          {positions.map((position, idx) => {
            var buyFees = {};
            var totalBuyFees = 0;
            try {
              buyFees =
                calculateBuyFees(
                  brokerChannel || "futu",
                  stock.market,
                  position.price,
                  position.shares,
                ) || {};
              totalBuyFees = Object.values(buyFees).reduce(function (sum, fee) {
                var n = Number(fee);
                return sum + (Number.isFinite(n) ? n : 0);
              }, 0);
            } catch (err) {
              console.warn("[PositionsSection] calculateBuyFees failed", err);
              buyFees = {};
              totalBuyFees = 0;
            }
            var px = Number(position.price);
            var sh = Number(position.shares);
            var lineAmount =
              Number.isFinite(px) && Number.isFinite(sh) ? px * sh : NaN;

            return (
              <div key={position.id != null ? String(position.id) : "p-" + idx} className="p-3 bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg border border-gray-200">
                <div className="mb-2">
                  <div className="flex items-center gap-4 mb-2">
                    <input
                      type="checkbox"
                      checked={position.enabled !== false}
                      onChange={(e) => onUpdatePosition(position.id, { ...position, enabled: e.target.checked })}
                      className="w-4 h-4 accent-amber-500"
                    />
                    <div className="flex-1 grid grid-cols-4 gap-2 text-sm">
                      <div className="text-center">
                        <span className="text-xs font-medium text-[var(--text-secondary)] block">价格</span>
                        <span className="font-bold text-gray-800">
                          <span dangerouslySetInnerHTML={{ __html: `${currencyPrefix}${formatPrice(Number.isFinite(px) ? px : 0)}` }} />
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="text-xs font-medium text-[var(--text-secondary)] block">股数</span>
                        <span className="font-bold text-gray-800">{(Number(position.shares) || 0).toLocaleString()}</span>
                      </div>
                      <div className="text-center">
                        <span className="text-xs font-medium text-[var(--text-secondary)] block">日期</span>
                        <span className="font-bold text-gray-800">
                          {_safePositionDateLabel(position.date)}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="text-xs font-medium text-[var(--text-secondary)] block">天数</span>
                        <span className="font-bold text-gray-800">
                          {_safeDaysHeld(position.date)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingPosition(position)}
                        className="text-amber-300 hover:text-yellow-300 p-1"
                        title="编辑"
                      >
                        <div className="icon-edit text-xs"></div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePosition(position.id)}
                        className="text-lime-400 hover:text-lime-300 p-1"
                        title="删除"
                      >
                        <div className="icon-trash-2 text-xs"></div>
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2 text-xs bg-white rounded p-2 border ml-8">
                    <div className="text-center">
                      <span className="text-gray-600 block">成交金额</span>
                      <span className="font-medium">
                        <span dangerouslySetInnerHTML={{ __html: `${currencyPrefix}${formatPrice(Number.isFinite(lineAmount) ? lineAmount : 0, 2)}` }} />
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="text-gray-600 block">总手续费</span>
                      <span className="font-medium text-orange-600">
                        <span dangerouslySetInnerHTML={{ __html: `${currencyPrefix}${formatPrice(totalBuyFees, 2)}` }} />
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="text-gray-600 block">实际成本</span>
                      <span className="font-bold text-lime-400">
                        <span dangerouslySetInnerHTML={{ __html: `${currencyPrefix}${formatPrice((Number.isFinite(lineAmount) ? lineAmount : 0) + totalBuyFees, 2)}` }} />
                      </span>
                    </div>
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setShowBuyFeesDetail(showBuyFeesDetail === position.id ? null : position.id)}
                        className="text-amber-300 hover:text-yellow-300 text-xs font-semibold underline underline-offset-2"
                      >
                        费用详情
                      </button>
                    </div>
                  </div>
                </div>
                
                {showBuyFeesDetail === position.id && (
                  <BuyFeesDetail 
                    buyFees={buyFees}
                    stock={stock}
                    onClose={() => setShowBuyFeesDetail(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
          <div className="icon-package text-4xl text-gray-300 mb-3 flex justify-center"></div>
          <p className="text-gray-500 mb-4">还没有持仓记录</p>
          <button
            type="button"
            onClick={() => setShowPositionForm(true)}
            className="btn btn-primary btn-sm"
          >
            添加第一个持仓记录
          </button>
        </div>
      )}

      {(showPositionForm || editingPosition) && (
        <PositionForm
          stock={stock}
          position={editingPosition}
          brokerChannel={brokerChannel}
          onBrokerChannelChange={onBrokerChannelChange}
          onAdd={(position) => {
            if (editingPosition) {
              onUpdatePosition(editingPosition.id, { ...editingPosition, ...position });
              setEditingPosition(null);
            } else {
              onAddPosition(position);
            }
          }}
          onClose={() => {
            setShowPositionForm(false);
            setEditingPosition(null);
          }}
        />
      )}
    </div>
  );
}

function SellSimulationSection({ 
  sellSimulations, 
  addSellSimulation, 
  updateSellSimulation, 
  removeSellSimulation, 
  stock, 
  brokerChannel, 
  stockAnalysis,
  showFeeModal,
  setShowFeeModal,
  onConfirmSell,
  capitalPool,
  onUpdateCapitalPool
}) {
  const [targetProfit, setTargetProfit] = React.useState('');
  const [profitSimResult, setProfitSimResult] = React.useState(null);

  const currencyLabel =
    stock.market === 'US' ? '美元' : stock.market === 'CN' ? '人民币' : '港元';
  const currencyHint =
    stock.market === 'US' ? 'USD' : stock.market === 'CN' ? 'CNY' : 'HKD';

  const calculateSellForTargetProfit = (targetProfitAmount) => {
    if (!targetProfitAmount || targetProfitAmount <= 0 || stockAnalysis.totalShares === 0) {
      setProfitSimResult(null);
      return;
    }

    const target = parseFloat(targetProfitAmount);
    const plan =
      typeof findSellPlanForTargetNetProfit === 'function'
        ? findSellPlanForTargetNetProfit(stock, stockAnalysis, brokerChannel, target)
        : null;
    setProfitSimResult(plan);
  };

  const handleProfitTargetSelect = (amount) => {
    setTargetProfit(amount.toString());
    calculateSellForTargetProfit(amount);
  };

  const handleProfitTargetInput = (value) => {
    setTargetProfit(value);
    if (value && !isNaN(value)) {
      calculateSellForTargetProfit(parseFloat(value));
    } else {
      setProfitSimResult(null);
    }
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h4 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <div className="icon-calculator text-lg text-green-600"></div>
            卖出模拟
          </h4>
          <button
            onClick={() => setShowFeeModal(true)}
            className="text-amber-300 hover:text-yellow-300 transition-colors text-lg font-bold"
            title="查看费率结构"
          >
            ?
          </button>
        </div>
        <button
          onClick={addSellSimulation}
          className="btn btn-success btn-sm"
        >
          <div className="icon-plus text-sm"></div>
          
        </button>
      </div>

      {/* Net Profit Target Simulation */}
      <div className="mb-4 rounded-xl border border-amber-400/40 bg-slate-900/45 p-4 backdrop-blur-md">
        <h5 className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-100">
          <div className="icon-target text-sm text-amber-400"></div>
          净盈利目标 → 卖出规模
        </h5>
        <p className="mb-3 text-[11px] leading-relaxed text-slate-200">
          以<strong className="text-slate-50">当前持仓总股数</strong>为上限：优先按<strong className="text-slate-50">现价（无则保本/均价）</strong>算出需卖<strong className="text-slate-50">多少股</strong>才能接近目标净盈利；若现价下满仓也达不到目标，会给出<strong className="text-slate-50">一次性卖光</strong>时约需的<strong className="text-slate-50">单价</strong>。不再用「成交额最小」误选成只卖 1 股。
        </p>
        
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {[1000, 5000, 10000, 50000].map(amount => (
              <button
                key={amount}
                onClick={() => handleProfitTargetSelect(amount)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  targetProfit === amount.toString()
                    ? 'border border-amber-400/70 bg-amber-500/30 text-slate-50 shadow-[0_0_0_1px_rgba(251,191,36,0.45)]'
                    : 'border border-white/20 bg-white/[0.08] text-slate-100 hover:border-amber-400/45 hover:bg-white/[0.12]'
                }`}
              >
                {stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : ''}
                {amount.toLocaleString()}
                {stock.market === 'HK' ? ' 港元' : ''}
              </button>
            ))}
          </div>
          
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              自定义目标净盈利（{currencyLabel}，{currencyHint}）
            </label>
            <input
              type="number"
              step="100"
              value={targetProfit}
              onChange={(e) => handleProfitTargetInput(e.target.value)}
              className="input-field w-full rounded-lg px-3 py-2 text-sm"
              placeholder={'目标金额（' + currencyLabel + '）'}
            />
          </div>

          {profitSimResult ? (
            <div className="mt-3 rounded-lg border border-white/20 bg-white/[0.06] p-3 backdrop-blur-sm">
              {profitSimResult.planHint && (
                <p className="mb-3 border-b border-white/10 pb-2 text-[11px] leading-relaxed text-slate-200">
                  {profitSimResult.planHint}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                <div className="col-span-2 sm:col-span-1">
                  <span className="mb-1 block text-slate-400">卖出总价（毛）</span>
                  <span className="gx-num text-sm font-bold text-slate-50 tabular-nums" dangerouslySetInnerHTML={{ __html: `${stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : ''}${formatPrice(profitSimResult.grossAmount, 2)}` }} />
                </div>
                <div>
                  <span className="mb-1 block text-slate-400">实收净额</span>
                  <span className="gx-num text-sm font-bold text-slate-50 tabular-nums" dangerouslySetInnerHTML={{ __html: `${stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : ''}${formatPrice(profitSimResult.netAmount, 2)}` }} />
                </div>
                <div>
                  <span className="mb-1 block text-slate-400">该笔净盈利</span>
                  <span className={`gx-num text-sm font-bold tabular-nums ${profitSimResult.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-300'}`} dangerouslySetInnerHTML={{ __html: `${profitSimResult.netProfit >= 0 ? '+' : ''}${stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : ''}${formatPrice(profitSimResult.netProfit, 2)}` }} />
                </div>
                <div>
                  <span className="mb-1 block text-slate-400">参考卖出单价</span>
                  <span className="gx-num text-sm font-bold text-amber-200 tabular-nums" dangerouslySetInnerHTML={{ __html: `${stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : ''}${formatPrice(profitSimResult.sellPrice, 3)}` }} />
                </div>
                <div>
                  <span className="mb-1 block text-slate-400">卖出股数</span>
                  <span className="gx-num text-sm font-bold text-slate-50 tabular-nums">{profitSimResult.sellShares.toLocaleString()}</span>
                </div>
                <div>
                  <span className="mb-1 block text-slate-400">剩余持仓</span>
                  <span className="gx-num text-sm font-semibold text-yellow-300 tabular-nums">{profitSimResult.remainingShares.toLocaleString()} 股</span>
                </div>
                <div>
                  <span className="mb-1 block text-slate-400">该笔收益率</span>
                  <span className={`gx-num text-sm font-bold tabular-nums ${profitSimResult.profitPercent >= 0 ? 'text-emerald-400' : 'text-rose-300'}`}>
                    {(profitSimResult.profitPercent >= 0 ? '+' : '') +
                      (Number.isFinite(Number(profitSimResult.profitPercent))
                        ? Number(profitSimResult.profitPercent)
                        : 0
                      ).toFixed(2)}
                    %
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <span className="mb-1 block text-slate-400">手续费</span>
                  <span className="gx-num text-sm font-semibold text-amber-300 tabular-nums" dangerouslySetInnerHTML={{ __html: `${stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : ''}${formatPrice(profitSimResult.totalFees, 2)}` }} />
                </div>
              </div>
            </div>
          ) : targetProfit && (
            <div className="hint-glass mt-3 text-xs">
              在当前费率与持仓下，无法在合理单价范围内凑出该净盈利目标；可调低目标、或等待价格上行后再算。
            </div>
          )}
        </div>
      </div>

      {sellSimulations.length > 0 && (
        <div className="space-y-3">
          {sellSimulations.map(sim => {
            const sellPrice = parseFloat(sim.price) || 0;
            const sellShares = parseFloat(sim.shares) || 0;
            const simulation = sellPrice > 0 && sellShares > 0 
              ? calculateSellSimulation(stock, sellPrice, sellShares, brokerChannel)
              : null;
            var simProfitPct = simulation
              ? (Number.isFinite(Number(simulation.profitPercent))
                  ? Number(simulation.profitPercent)
                  : 0)
              : 0;

            return (
              <div key={sim.id} className="p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">卖出价格</label>
                    <input
                      type="number"
                      step="0.001"
                      value={sim.price}
                      onChange={(e) => updateSellSimulation(sim.id, 'price', e.target.value)}
                      className="w-full px-2 py-1 text-sm border rounded"
                      placeholder="0.000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">卖出股数</label>
                    <input
                      type="number"
                      value={sim.shares}
                      onChange={(e) => updateSellSimulation(sim.id, 'shares', e.target.value)}
                      className="w-full px-2 py-1 text-sm border rounded"
                      placeholder="0"
                      max={stockAnalysis.totalShares}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">盈亏百分比 (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={sim.profitLossPercent}
                      onChange={(e) => updateSellSimulation(sim.id, 'profitLossPercent', e.target.value)}
                      className="w-full px-2 py-1 text-sm border rounded"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => removeSellSimulation(sim.id)}
                      className="btn btn-danger btn-sm w-20"

                    >
                      <div className="icon-trash-2 text-sm"></div>
                    </button>
                  </div>
                </div>

                {simulation && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs bg-white rounded p-2 border">
                      <div className="text-center">
                        <span className="text-gray-600 block">成交金额</span>
                        <span className="font-medium">
                          <span dangerouslySetInnerHTML={{ __html: `${stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : ''}${formatPrice(simulation.grossAmount, 2)}` }} />
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="text-gray-600 block">手续费</span>
                        <span className="font-medium text-orange-600">
                          <span dangerouslySetInnerHTML={{ __html: `${stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : ''}${formatPrice(simulation.totalFees, 2)}` }} />
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="text-gray-600 block">净收入</span>
                        <span className="font-medium">
                          <span dangerouslySetInnerHTML={{ __html: `${stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : ''}${formatPrice(simulation.netAmount, 2)}` }} />
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="text-gray-600 block">净盈亏</span>
                        <span className={`font-bold ${simulation.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-300'}`}>
                          <span dangerouslySetInnerHTML={{ __html: `${simulation.netProfit >= 0 ? '+' : ''}${stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : ''}${formatPrice(simulation.netProfit, 2)}` }} />
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="text-gray-600 block">收益率</span>
                        <span className={`font-bold ${simulation.profitPercent >= 0 ? 'text-emerald-400' : 'text-rose-300'}`}>
                          {simProfitPct >= 0 ? '+' : ''}{simProfitPct.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-center">
                      <button                          type="button"                        onClick={() => onConfirmSell(sellPrice, sellShares, simulation.netAmount)}
                        className="btn btn-success btn-sm"
                      >
                        <div className="icon-check text-sm"></div>
                        确认卖出
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FeeStructureSection({ brokerChannel, stock, showFeeModal, setShowFeeModal }) {
  const feeStructure = getBrokerFeeStructure(brokerChannel, stock.market);

  return (
    <>
      {showFeeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
              <h3 className="text-lg md:text-xl font-bold text-[var(--text-primary)]">
                {brokerChannel === 'futu' ? '富途' : brokerChannel === 'longbridge' ? '长桥' : '中银'} - 
                {stock.market === 'US' ? '美股' : '港股'}费率结构
              </h3>
              <button
                onClick={() => setShowFeeModal(false)}
                className="text-gray-400 hover:text-gray-600 p-2"
              >
                <div className="icon-x text-xl md:text-2xl"></div>
              </button>
            </div>
            <div className="p-4 md:p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {Object.entries(feeStructure).map(([key, value]) => (
                  <div key={key} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="text-sm md:text-base font-medium text-gray-700 flex-1">{key}</span>
                    <span className="text-sm md:text-base text-gray-900 font-semibold bg-white px-3 py-1.5 rounded min-w-[100px] text-right">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

