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
    <div className="mt-2 p-2 bg-blue-50 rounded border">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium text-blue-800">买入手续费明细</span>
        <button
          onClick={onClose}
          className="text-blue-600 hover:text-blue-800"
        >
          <div className="icon-x text-xs"></div>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs">
        {Object.entries(buyFees).map(([key, value]) => (
          <div key={key} className="flex justify-between">
            <span className="text-gray-600">{feeNames[key] || key}:</span>
            <span className="font-medium" dangerouslySetInnerHTML={{ __html: `${currencyPrefix}${formatPrice(value, 2)}` }} />
          </div>
        ))}
      </div>
    </div>
  );
}