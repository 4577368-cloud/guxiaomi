function AddStockModal({ onAdd, onClose, onAddToWatchlist }) {
    const [symbol, setSymbol] = React.useState('');
    const [market, setMarket] = React.useState('US');
    const [brokerChannel, setBrokerChannel] = React.useState('futu');
    const [addType, setAddType] = React.useState('position'); // 'position' | 'watch'
    const [isLoading, setIsLoading] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [searchResults, setSearchResults] = React.useState([]);
    const [showSearch, setShowSearch] = React.useState(false);
    const searchInputRef = React.useRef(null);

    // 搜索股票
    React.useEffect(() => {
      if (searchQuery.trim().length >= 1 && window.searchStocks) {
        const results = window.searchStocks(searchQuery, market === 'ALL' ? 'ALL' : market);
        setSearchResults(results);
        setShowSearch(true);
      } else {
        setSearchResults([]);
        setShowSearch(false);
      }
    }, [searchQuery, market]);

    // 选择搜索结果
    const handleSelectStock = (stock) => {
      setSymbol(stock.symbol);
      setMarket(stock.market);
      setSearchQuery('');
      setShowSearch(false);
      searchInputRef.current?.blur();
    };

    // 获取热门股票
    const hotStocks = React.useMemo(() => {
      if (window.getHotStocks) {
        return window.getHotStocks(market === 'ALL' ? 'ALL' : market, 6);
      }
      return [];
    }, [market]);

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!symbol.trim()) return;

      setIsLoading(true);
      try {
        console.log(`正在添加股票 ${symbol.toUpperCase()} 并获取最新价格...`);

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
          if (market === 'HK') {
            marketData = generateMockHKData(symbol.toUpperCase());
          } else if (market === 'CN') {
            marketData = generateMockCNData(symbol.toUpperCase());
          } else {
            marketData = generateMockUSData(symbol.toUpperCase());
          }
          currentPrice = marketData.price;
        }

        if (addType === 'watch') {
          // 添加到监控列表
          if (onAddToWatchlist) {
            onAddToWatchlist({
              symbol: symbol.toUpperCase(),
              market: market,
              name: searchResults.find(s => s.symbol === symbol.toUpperCase())?.nameCn || symbol.toUpperCase(),
              currentPrice: currentPrice,
              marketData: marketData,
              change: marketData.change || 0,
              changePercent: marketData.changePercent || 0,
              previousClose: marketData.previousClose || null
            });
            onClose();
          }
        } else {
          // 添加到持仓
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
        }
      } catch (error) {
        console.error('添加股票失败:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const handleSymbolChange = (e) => {
      const value = e.target.value.toUpperCase();
      setSymbol(value);
      setSearchQuery(value);

      if (value.match(/^\d{5}$/)) {
        setMarket('HK');
      } else if (value.match(/^\d{6}$/)) {
        setMarket('CN');
      } else if (value.match(/^[A-Z]{1,5}$/)) {
        setMarket('US');
      }
    };

    return (
      <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel mx-auto max-h-[90vh] overflow-y-auto touch-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold text-slate-900">添加新股票</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 -mr-2 text-slate-400 transition-colors hover:bg-white/60 hover:text-slate-600 active:bg-white/40 touch-manipulation"
          >
            <div className="icon-x text-xl"></div>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              交易市场
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMarket('US')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all touch-manipulation ${
                  market === 'US'
                    ? 'bg-[var(--primary-color)] text-white shadow-md'
                    : 'bg-white/10 text-[var(--text-secondary)] hover:bg-white/20 active:bg-white/30'
                }`}
              >
                🇺🇸 美股
              </button>
              <button
                type="button"
                onClick={() => setMarket('HK')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all touch-manipulation ${
                  market === 'HK'
                    ? 'bg-[var(--primary-color)] text-white shadow-md'
                    : 'bg-white/10 text-[var(--text-secondary)] hover:bg-white/20 active:bg-white/30'
                }`}
              >
                🇭🇰 港股
              </button>
              <button
                type="button"
                onClick={() => setMarket('CN')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all touch-manipulation ${
                  market === 'CN'
                    ? 'bg-[var(--primary-color)] text-white shadow-md'
                    : 'bg-white/10 text-[var(--text-secondary)] hover:bg-white/20 active:bg-white/30'
                }`}
              >
                🇨🇳 A股
              </button>
            </div>
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              股票代码
            </label>
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="搜索代码或名称..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSymbol(e.target.value.toUpperCase());
                }}
                onFocus={() => searchQuery.trim().length >= 1 && setShowSearch(true)}
                onBlur={() => setTimeout(() => setShowSearch(false), 200)}
                className="input-field pr-10"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setSymbol(''); setShowSearch(false); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                >
                  <div className="icon-x text-sm"></div>
                </button>
              )}
            </div>

            {/* 搜索结果下拉 */}
            {showSearch && searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 rounded-xl border border-white/20 bg-slate-800/95 backdrop-blur-lg shadow-xl max-h-64 overflow-y-auto">
                {searchResults.map((stock, idx) => (
                  <button
                    key={`${stock.market}-${stock.symbol}-${idx}`}
                    type="button"
                    onClick={() => handleSelectStock(stock)}
                    className="w-full px-3 py-2.5 text-left hover:bg-white/10 active:bg-white/20 transition-colors touch-manipulation flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-medium text-slate-100 text-sm">{stock.symbol}</div>
                      <div className="text-xs text-slate-400 truncate">{stock.nameCn || stock.name}</div>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      stock.market === 'US' ? 'bg-blue-500/20 text-blue-300' :
                      stock.market === 'HK' ? 'bg-orange-500/20 text-orange-300' :
                      'bg-red-500/20 text-red-300'
                    }`}>
                      {stock.marketName}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {showSearch && searchResults.length === 0 && searchQuery.trim().length >= 1 && (
              <div className="absolute z-10 w-full mt-1 rounded-xl border border-white/20 bg-slate-800/95 backdrop-blur-lg shadow-xl p-4 text-center text-sm text-slate-400">
                未找到匹配结果，请手动输入代码
              </div>
            )}
          </div>

          {/* 热门推荐 */}
          {!showSearch && hotStocks.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                热门推荐
              </label>
              <div className="grid grid-cols-2 gap-2">
                {hotStocks.slice(0, 6).map((stock, idx) => (
                  <button
                    key={`hot-${stock.market}-${stock.symbol}-${idx}`}
                    type="button"
                    onClick={() => handleSelectStock(stock)}
                    className="px-3 py-2 rounded-lg text-left bg-white/5 hover:bg-white/10 active:bg-white/20 transition-colors touch-manipulation border border-white/10"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-slate-100 text-xs">{stock.symbol}</span>
                      <span className={`text-[10px] px-1 rounded ${
                        stock.market === 'US' ? 'bg-blue-500/20 text-blue-300' :
                        stock.market === 'HK' ? 'bg-orange-500/20 text-orange-300' :
                        'bg-red-500/20 text-red-300'
                      }`}>
                        {stock.market === 'US' ? '美' : stock.market === 'HK' ? '港' : 'A股'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 truncate mt-0.5">{stock.nameCn}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              添加到
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAddType('position')}
                className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all touch-manipulation ${
                  addType === 'position'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'bg-white/10 text-[var(--text-secondary)] hover:bg-white/20 active:bg-white/30 border border-white/20'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <div className="icon-briefcase text-sm"></div>
                  持仓
                </div>
              </button>
              <button
                type="button"
                onClick={() => setAddType('watch')}
                className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all touch-manipulation ${
                  addType === 'watch'
                    ? 'bg-cyan-500 text-white shadow-md'
                    : 'bg-white/10 text-[var(--text-secondary)] hover:bg-white/20 active:bg-white/30 border border-white/20'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <div className="icon-eye text-sm"></div>
                  监控
                </div>
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2 text-center">
              {addType === 'position' ? '添加到持仓组合，跟踪盈亏' : '添加到关注列表，实时监控价格'}
            </p>
          </div>

          {addType === 'position' && (
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
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={isLoading || !symbol.trim()}
              className={`btn flex-1 disabled:opacity-50 touch-manipulation ${
                addType === 'watch' ? 'bg-cyan-500 hover:bg-cyan-600 text-white border-cyan-500' : 'btn-primary'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="icon-loader text-sm animate-spin"></div>
                  获取价格中...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <div className={addType === 'watch' ? 'icon-eye' : 'icon-plus'}></div>
                  {addType === 'watch' ? '添加到监控' : '添加股票'}
                </div>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary touch-manipulation"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
