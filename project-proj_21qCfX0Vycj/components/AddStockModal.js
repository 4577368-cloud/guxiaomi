function AddStockModal({ onAdd, onClose, onAddToWatchlist }) {
    const [symbol, setSymbol] = React.useState('');
    const [market, setMarket] = React.useState('US');
    const [brokerChannel, setBrokerChannel] = React.useState('futu');
    const [buyPrice, setBuyPrice] = React.useState('');
    const [buyShares, setBuyShares] = React.useState('');
    const [buyDate, setBuyDate] = React.useState(new Date().toISOString().split('T')[0]);
    const [addType, setAddType] = React.useState('position'); // 'position' | 'watch'
    const [isLoading, setIsLoading] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [searchResults, setSearchResults] = React.useState([]);
    const [showSearch, setShowSearch] = React.useState(false);
    const [hotStockOffset, setHotStockOffset] = React.useState(0);
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
        return window.getHotStocks(market === 'ALL' ? 'ALL' : market, 6, hotStockOffset);
      }
      return [];
    }, [market, hotStockOffset]);

    React.useEffect(() => {
      setHotStockOffset(0);
    }, [market]);

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!symbol.trim()) return;
      if (addType === 'position') {
        const pr = parseFloat(buyPrice);
        const sh = parseInt(buyShares, 10);
        if (!Number.isFinite(pr) || pr <= 0 || !Number.isFinite(sh) || sh <= 0) {
          console.warn('添加持仓必须填写有效买入价和股数');
          return;
        }
      }

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
          console.error('获取股价失败:', error);
          alert(
            (symbol.toUpperCase() || '标的') +
              ' 无法获取真实行情：' +
              (error && error.message ? error.message : '请确认后端 API 已启动（run_web.py）'),
          );
          setIsLoading(false);
          return;
        }

        const selectedStockMeta = searchResults.find(s => s.symbol === symbol.toUpperCase() && s.market === market)
          || hotStocks.find(s => s.symbol === symbol.toUpperCase() && s.market === market)
          || null;
        const displayName = selectedStockMeta?.nameCn || selectedStockMeta?.name || symbol.toUpperCase();
        const defaultKeywords = window.generateDefaultStockKeywords
          ? window.generateDefaultStockKeywords({
              symbol: symbol.toUpperCase(),
              market,
              name: displayName,
              nameCn: selectedStockMeta?.nameCn,
            })
          : [];

        if (addType === 'watch') {
          // 添加到监控列表
          if (onAddToWatchlist) {
            onAddToWatchlist({
              symbol: symbol.toUpperCase(),
              market: market,
              name: displayName,
              nameCn: selectedStockMeta?.nameCn,
              keywords: defaultKeywords,
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
            name: displayName,
            nameCn: selectedStockMeta?.nameCn,
            keywords: defaultKeywords,
            brokerChannel: brokerChannel,
            currentPrice: currentPrice,
            marketData: marketData,
            technicalIndicators: technicalIndicators,
            positions: [{
              id: Date.now().toString(),
              price: parseFloat(buyPrice),
              shares: parseInt(buyShares, 10),
              date: buyDate,
              brokerChannel: brokerChannel,
              enabled: true
            }],
            positionEventHistory: [{
              id: `evt_${Date.now()}`,
              date: buyDate,
              type: 'open',
              shares: parseInt(buyShares, 10),
              price: parseFloat(buyPrice),
              amount: parseInt(buyShares, 10) * parseFloat(buyPrice),
              note: '开仓'
            }]
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

    const handleRefreshHotStocks = () => {
      setHotStockOffset((prev) => prev + 6);
    };

    return (
      <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel mx-auto max-h-[calc(100dvh-2rem)] overflow-y-auto touch-auto p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg font-semibold text-slate-50">添加新股票</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 -mr-2 text-slate-400 transition-colors hover:bg-white/60 hover:text-slate-600 active:bg-white/40 touch-manipulation"
          >
            <div className="icon-x text-xl"></div>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              交易市场
            </label>
            <div className="grid grid-cols-3 gap-1.5">
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
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
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
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-sm font-medium text-[var(--text-secondary)]">
                  热门推荐
                </label>
                <button
                  type="button"
                  onClick={handleRefreshHotStocks}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/[0.06] px-2 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 active:bg-white/20"
                  title="换一批热门股票"
                >
                  <div className="icon-refresh-cw text-xs"></div>
                  换一批
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {hotStocks.slice(0, 6).map((stock, idx) => {
                  const isSelected = symbol === stock.symbol && market === stock.market;
                  return (
                    <button
                      key={`hot-${stock.market}-${stock.symbol}-${idx}`}
                      type="button"
                      onClick={() => handleSelectStock(stock)}
                      className={`px-3 py-2 rounded-lg text-left transition-all touch-manipulation border ${
                        isSelected
                          ? 'border-sky-300 bg-sky-500/25 shadow-[0_0_0_1px_rgba(125,211,252,0.55),0_0_18px_rgba(56,189,248,0.18)]'
                          : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10 active:bg-white/20'
                      }`}
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
                      <div className={`text-xs truncate mt-0.5 ${isSelected ? 'text-sky-100' : 'text-slate-400'}`}>{stock.nameCn}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
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
            <p className="text-xs text-slate-400 mt-1.5 text-center">
              {addType === 'position' ? '添加到持仓组合，跟踪盈亏' : '添加到关注列表，实时监控价格'}
            </p>
          </div>

          {addType === 'position' && (
            <div className="grid gap-3">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                    买入价
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    className="input-field"
                    placeholder="如 150.50"
                    required={addType === 'position'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                    股数
                  </label>
                  <input
                    type="number"
                    value={buyShares}
                    onChange={(e) => setBuyShares(e.target.value)}
                    className="input-field"
                    placeholder="如 100"
                    required={addType === 'position'}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                  买入日期
                </label>
                <input
                  type="date"
                  value={buyDate}
                  onChange={(e) => setBuyDate(e.target.value)}
                  className="input-field"
                  required={addType === 'position'}
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={
                isLoading ||
                !symbol.trim() ||
                (addType === 'position' && (!buyPrice || !buyShares || !buyDate))
              }
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
