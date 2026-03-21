function AddStockModal({ onAdd, onClose }) {
  try {
    const [symbol, setSymbol] = React.useState('');
    const [market, setMarket] = React.useState('US');
    const [brokerChannel, setBrokerChannel] = React.useState('futu');
    const [isLoading, setIsLoading] = React.useState(false);

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!symbol.trim()) return;

      setIsLoading(true);
      try {
        console.log(`正在添加股票 ${symbol.toUpperCase()} 并获取最新价格...`);
        
        // Always try to get current price when adding stock
        let currentPrice = 0;
        let marketData = {};
        
        try {
          const priceData = await getStockPrice(symbol.toUpperCase(), market);
          currentPrice = priceData.price;
          marketData = priceData;
          
          if (priceData.isMock) {
            console.warn(`${symbol.toUpperCase()}: 使用模拟数据，API暂时不可用`);
          } else {
            console.log(`${symbol.toUpperCase()}: 成功获取最新价格 ${currentPrice}`);
          }
        } catch (error) {
          console.error('获取股价失败，将使用模拟数据:', error);
          // Generate mock data as fallback
          if (market === 'HK') {
            marketData = generateMockHKData(symbol.toUpperCase());
          } else if (market === 'CN') {
            marketData = generateMockCNData(symbol.toUpperCase());
          } else {
            marketData = generateMockUSData(symbol.toUpperCase());
          }
          currentPrice = marketData.price;
        }

        // Fetch technical indicators for HK and CN stocks
        let technicalIndicators = undefined;
        if (market === 'HK' || market === 'CN') {
          try {
            console.log(`正在获取 ${symbol.toUpperCase()} 的技术指标...`);
            technicalIndicators = await getHistoricalDataAndIndicators(symbol.toUpperCase(), market);
            console.log(`技术指标获取成功:`, technicalIndicators);
          } catch (error) {
            console.error('获取技术指标失败:', error);
          }
        }

        onAdd({
          symbol: symbol.toUpperCase(),
          market: market,
          brokerChannel: brokerChannel,
          currentPrice: currentPrice,
          marketData: marketData,
          technicalIndicators: technicalIndicators,
          positions: []
        });
      } catch (error) {
        console.error('添加股票失败:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const handleSymbolChange = (e) => {
      const value = e.target.value.toUpperCase();
      setSymbol(value);
      
      // Auto-detect market based on symbol format
      if (value.match(/^\d{5}$/)) {
        setMarket('HK'); // 5-digit number format for HK stocks
      } else if (value.match(/^\d{6}$/)) {
        setMarket('CN'); // 6-digit number format for A stocks
      } else if (value.match(/^[A-Z]{1,5}$/)) {
        setMarket('US'); // Letter format for US stocks
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-name="add-stock-modal" data-file="components/AddStockModal.js">
      <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">添加新股票</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <div className="icon-x text-xl"></div>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              交易市场
            </label>
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              className="input-field"
            >
              <option value="US">美股 (US)</option>
              <option value="HK">港股 (HK)</option>
              <option value="CN">A股 (CN)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              股票代码
            </label>
            <input
              type="text"
              placeholder="例如: AAPL, 00700"
              value={symbol}
              onChange={handleSymbolChange}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">

              购入渠道
            </label>
            <select
              value={brokerChannel}
              onChange={(e) => setBrokerChannel(e.target.value)}
              className="input-field"
            >
              <option value="futu">富途</option>
              <option value="longbridge">长桥</option>
              <option value="boc">中银</option>
            </select>
          </div>

          <div className="text-sm text-[var(--text-secondary)] bg-blue-50 p-3 rounded-lg">
            <p className="font-medium mb-1">提示:</p>
            <ul className="space-y-1">
              <li>• 美股代码示例: AAPL, TSLA, MSFT</li>
              <li>• 港股代码示例: 00700, 09988, 03690</li>
              <li>• A股代码示例: 000001, 600036, 300059</li>
              <li>• 系统会自动获取实时股价</li>
            </ul>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={isLoading || !symbol.trim()}
              className="btn btn-primary flex-1 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="icon-loader text-sm animate-spin"></div>
                  获取价格中...
                </div>
              ) : (
                '添加股票'
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} catch (error) {
  console.error('AddStockModal component error:', error);
  return null;
}
}
