function BuyFeesDetail({ buyFees, stock, onClose }) {
  var mkt = stock && stock.market;
  var currencyPrefix = mkt === "US" ? "$" : mkt === "CN" ? "¥" : "";
  const feeNames = {
    commission: '经纪佣金',
    platformFee: '平台使用费',
    tradingLevy: '交易征费',
    sfcLevy: '财局交易征费',
    settlementFee: '交收费',
    stampDuty: '印花税',
    tradingFee: '交易费',
    exchangeFee: '联交所交易费',
    transferFee: '过户费',
    tradingActivityFee: '交易活动费',
    auditTrailFee: '审计跟踪费'
  };

  return (
    <div className="mt-2 rounded-lg border border-amber-400/35 bg-slate-900/50 p-2 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-amber-200">买入手续费明细</span>
        <button
          type="button"
          onClick={onClose}
          className="text-amber-300 hover:text-yellow-300"
        >
          <div className="icon-x text-xs"></div>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs text-slate-200">
        {Object.entries(buyFees).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-2">
            <span className="text-slate-400">{feeNames[key] || key}:</span>
            <span className="font-medium tabular-nums text-amber-100" dangerouslySetInnerHTML={{ __html: `${currencyPrefix}${formatPrice(value, 2)}` }} />
          </div>
        ))}
      </div>
    </div>
  );
}