function StockCard({ stock: stockProp, onUpdate, onDelete, isCollapsed, onToggleCollapse, capitalPool, onUpdateCapitalPool, onRefreshAllPrices }) {
  try {
    const stock = stockProp && stockProp.id
      ? { positions: [], ...stockProp, positions: Array.isArray(stockProp.positions) ? stockProp.positions : [] }
      : null;
    const [showPositionForm, setShowPositionForm] = React.useState(false);
    const [brokerChannel, setBrokerChannel] = React.useState(
      (stockProp && stockProp.brokerChannel) || "futu",
    );
    const [sellSimulations, setSellSimulations] = React.useState([]);
    const [showFeeModal, setShowFeeModal] = React.useState(false);
    const [editingPosition, setEditingPosition] = React.useState(null);
    const [showBuyFeesDetail, setShowBuyFeesDetail] = React.useState(null);
    const [newKeyword, setNewKeyword] = React.useState('');


    const handleAddPosition = (position) => {
      const currentPositions = Array.isArray(stock.positions) ? stock.positions : [];
      const existingTotalShares = currentPositions
        .filter(p => p.enabled !== false)
        .reduce((sum, p) => sum + (Number(p.shares) || 0), 0);
      const eventType = existingTotalShares > 0 ? 'add' : 'open';
      const event = {
        id: `evt_${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        type: eventType,
        shares: Number(position.shares) || 0,
        price: Number(position.price) || 0,
        amount: (Number(position.shares) || 0) * (Number(position.price) || 0),
        note: eventType === 'open' ? '开仓' : '加仓'
      };

      const updatedStock = {
        ...stock,
        positions: [...currentPositions, { ...position, id: Date.now().toString() }],
        positionEventHistory: [...(stock.positionEventHistory || []), event]
      };
      onUpdate(updatedStock);
      setShowPositionForm(false);
    };

    const handleUpdatePosition = (positionId, updatedPosition) => {
      const currentPositions = Array.isArray(stock.positions) ? stock.positions : [];
      const existingPos = currentPositions.find(pos => pos.id === positionId);
      const postPositions = currentPositions.map(pos => (pos.id === positionId ? updatedPosition : pos));

      let extraEvent = null;
      if (existingPos) {
        const oldShares = Number(existingPos.shares) || 0;
        const newShares = Number(updatedPosition.shares) || 0;
        const diff = newShares - oldShares;
        if (diff !== 0) {
          extraEvent = {
            id: `evt_${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            type: diff > 0 ? 'add' : 'reduce',
            shares: Math.abs(diff),
            price: Number(updatedPosition.price) || 0,
            amount: Math.abs(diff) * (Number(updatedPosition.price) || 0),
            note: diff > 0 ? '加仓' : '减仓'
          };
        }
      }

      const updatedStock = {
        ...stock,
        positions: postPositions,
        positionEventHistory: extraEvent
          ? [...(stock.positionEventHistory || []), extraEvent]
          : (stock.positionEventHistory || [])
      };
      onUpdate(updatedStock);
    };

    const handleDeletePosition = (positionId) => {
      const currentPositions = Array.isArray(stock.positions) ? stock.positions : [];
      const deleting = currentPositions.find(pos => pos.id === positionId);
      const updatedStock = {
        ...stock,
        positions: currentPositions.filter(pos => pos.id !== positionId),
        positionEventHistory: deleting ? [...(stock.positionEventHistory || []), {
          id: `evt_${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          type: 'reduce',
          shares: Number(deleting.shares) || 0,
          price: Number(deleting.price) || 0,
          amount: (Number(deleting.shares) || 0) * (Number(deleting.price) || 0),
          note: '平仓'
        }] : (stock.positionEventHistory || [])
      };
      onUpdate(updatedStock);
    };

    const handleConfirmSell = (sellPrice, sellShares, netAmount) => {
      if (!confirm(`确认要以 ${sellPrice.toFixed(3)} 的价格卖出 ${sellShares} 股吗？\n\n卖出金额: ${netAmount.toFixed(2)}`)) {
        return;
      }

      // Reduce positions by sold shares (FIFO - First In First Out)
      let remainingToSell = sellShares;
      const updatedPositions = [];
      
      for (const position of stock.positions) {
        if (!position.enabled) {
          updatedPositions.push(position);
          continue;
        }
        
        if (remainingToSell <= 0) {
          updatedPositions.push(position);
          continue;
        }
        
        if (position.shares <= remainingToSell) {
          remainingToSell -= position.shares;
          // Skip this position (fully sold)
        } else {
          // Partially sell from this position
          updatedPositions.push({
            ...position,
            shares: position.shares - remainingToSell
          });
          remainingToSell = 0;
        }
      }

      // If all positions are sold, delete the stock entirely
      if (updatedPositions.length === 0) {
        onDelete();
      } else {
        // Update stock positions
        onUpdate({ ...stock, positions: updatedPositions });
      }

      // Update capital pool based on market
      if (onUpdateCapitalPool && capitalPool) {
        const newCapital = { ...capitalPool };
        if (stock.market === 'US') {
          newCapital.usd = (newCapital.usd || 0) + netAmount;
        } else if (stock.market === 'HK') {
          newCapital.hkd = (newCapital.hkd || 0) + netAmount;
        } else if (stock.market === 'CN') {
          newCapital.cny = (newCapital.cny || 0) + netAmount;
        }
        onUpdateCapitalPool(newCapital);
      }

      // Clear sell simulations after successful sell
      setSellSimulations([]);
      
      alert(`卖出成功！\n\n卖出股数: ${sellShares}\n卖出价格: ${sellPrice.toFixed(3)}\n实收金额: ${netAmount.toFixed(2)}`);
    };

    const handleBrokerChannelChange = (newChannel) => {
      setBrokerChannel(newChannel);
      const updatedStock = {
        ...stock,
        brokerChannel: newChannel
      };
      onUpdate(updatedStock);
    };

    const handleManualPriceUpdate = (newPrice) => {
      console.log(`手动更新 ${stock.symbol} 价格: ${newPrice}`);
      const updatedStock = {
        ...stock,
        currentPrice: newPrice,
        marketData: {
          ...stock.marketData,
          price: newPrice,
          isManual: true
        }
      };
      onUpdate(updatedStock);
    };

    const [isRefreshingPrice, setIsRefreshingPrice] = React.useState(false);
    const [isRefreshingIndicators, setIsRefreshingIndicators] = React.useState(false);
    const [isFetchingHistory, setIsFetchingHistory] = React.useState(false);

    if (!stock) {
      return (
        <div className="card border border-amber-100 bg-amber-50/40 p-4 text-sm text-amber-900">
          无效的股票数据（缺少 id），请删除该卡片后重新添加。
        </div>
      );
    }

    const handleFetchHistory30 = async () => {
      if (!stock || typeof onUpdate !== 'function') return;
      setIsFetchingHistory(true);
      try {
        const historyFn = window.getHistoricalClose30Days || null;
        if (typeof historyFn !== 'function') {
          throw new Error('历史30天价格获取函数尚未初始化，请稍后重试');
        }

        const activePositions = (stock.positions || []).filter(pos => pos.enabled !== false && Number.isFinite(pos.shares) && pos.shares > 0);
        const totalShares = activePositions.reduce((sum, pos) => sum + Number(pos.shares), 0);

        let history = await historyFn(stock.symbol, stock.market, totalShares);
        if (!history || history.length === 0) {
          const persistedHistory = (window.loadStockPriceHistory && window.loadStockPriceHistory(stock.symbol, stock.market)) || [];
          if (!persistedHistory || persistedHistory.length === 0) {
            console.warn('获取历史30天收盘价失败或数据为空，且本地缓存也为空');
            return;
          }
          console.info('获取历史30天收盘价失败，已使用本地缓存数据。');
          history = persistedHistory.map(item => ({
            date: item.date,
            close: item.price || item.close || 0,
            open: item.open || item.price || 0,
            high: item.high || item.price || 0,
            low: item.low || item.price || 0,
            volume: item.volume || 0
          }));
        }

        const formattedHistory = history.map(item => ({
          date: item.date,
          price: item.close,
          shares: item.shares || 0,
          dailyProfit: item.dailyProfit
        }));

        // 合并已有历史，避免每次刷新后被覆盖（保留最久）
        const existingHistory = (window.loadStockPriceHistory && window.loadStockPriceHistory(stock.symbol, stock.market)) || [];
        const combined = [...existingHistory, ...formattedHistory];

        const dedup = [];
        const seen = {};
        combined.forEach(item => {
          if (!item || !item.date) return;
          if (!seen[item.date]) {
            seen[item.date] = true;
            dedup.push(item);
          }
        });

        const finalHistory = dedup
          .slice()
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(-365); // 保留最近1年

        saveStockPriceHistory(stock.symbol, stock.market, finalHistory);

        const updatedStockWithHistory = {
          ...stock,
          priceHistory: finalHistory
        };

        onUpdate(updatedStockWithHistory);

        // 再次保存组合到 localStorage（确保生成的30日历史持久化）
        try {
          if (typeof savePortfolio === 'function') {
            const storedPortfolio = loadPortfolio();
            const mergedPortfolio = (Array.isArray(storedPortfolio) ? storedPortfolio : []).map(item =>
              item.id === updatedStockWithHistory.id ? updatedStockWithHistory : item
            );
            savePortfolio(mergedPortfolio);
          }
        } catch (err) {
          console.warn('savePortfolio 不可用或保存失败:', err);
        }

        const shouldDownloadMd = false; // 改为 false 则只展示图表，不自动下载文件
        if (shouldDownloadMd) {
          const mdRows = ['# 历史收盘价（30天）', `- 股票: ${stock.symbol}`, `- 市场: ${stock.market}`, '', '| 日期 | 收盘价 | 日盈亏 |', '| --- | --- |'];

          formattedHistory.forEach(row => {
            mdRows.push(`| ${row.date} | ${row.price.toFixed(3)} | ${row.dailyProfit >= 0 ? '+' : ''}${row.dailyProfit.toFixed(2)} |`);
          });

          const mdContent = mdRows.join('\n');
          const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `${stock.symbol}_${stock.market}_30day_history.md`;
          link.click();

          console.log('历史30天收盘价已获取并保存，并触发本地文件下载。');
        } else {
          console.log('历史30天收盘价已获取并保存到本地缓存，无下载弹窗。');
        }
      } catch (error) {
        console.error('抓取历史30天收盘失败:', error);
        console.warn('请检查网络或API配置后重试');
      } finally {
        setIsFetchingHistory(false);
      }
    };

    const handleRefreshPrice = async () => {
      if (!stock || typeof onUpdate !== 'function') return;
      setIsRefreshingPrice(true);
      console.log(`开始刷新股票 ${stock.symbol} 的价格和技术指标...`);
      try {
        const pricePromise = getStockPrice(stock.symbol, stock.market);
        const indicatorsPromise = (stock.market === 'HK' || stock.market === 'CN')
          ? getHistoricalDataAndIndicators(stock.symbol, stock.market)
          : stock.market === 'US'
          ? getUSTechnicalIndicators(stock.symbol)
          : Promise.resolve(stock.technicalIndicators || null);
        const [priceData, indicators] = await Promise.all([pricePromise, indicatorsPromise]);
        if (priceData && priceData.isMock) {
          console.warn(`${stock.symbol}: API不可用，使用模拟数据；仍继续更新本地历史。`);
        }

        if (priceData) {
          try {
            const updatedStock = {
              ...stock,
              currentPrice: priceData.price,
              marketData: priceData,
              technicalIndicators: indicators != null ? indicators : stock.technicalIndicators
            };

            // 同步历史价格到本地存储（每天一点增量）
            if (typeof updateStockPriceHistory === 'function') {
              try {
                const updatedHistory = updateStockPriceHistory(updatedStock, priceData.price, priceData.previousClose);
                saveStockPriceHistory(updatedStock.symbol, updatedStock.market, updatedHistory);
                updatedStock.priceHistory = updatedHistory;
              } catch (historyErr) {
                console.warn('更新股票历史价格失败:', historyErr);
              }
            }

            onUpdate(updatedStock);

            // 组合存储补强，避免某些场景 onUpdate 不持久化
            if (typeof loadPortfolio === 'function' && typeof savePortfolio === 'function') {
              try {
                const stored = loadPortfolio() || [];
                const merged = stored.map(item => item.id === updatedStock.id ? updatedStock : item);
                savePortfolio(merged);
              } catch (persistErr) {
                console.warn('刷新后持久化组合失败:', persistErr);
              }
            }

            console.log(`${stock.symbol}: 价格和技术指标刷新成功`);
          } catch (updateErr) {
            console.error('更新股票状态失败', updateErr);
            console.warn(`刷新 ${stock.symbol} 成功但更新失败，请重试或刷新页面。`);
          }
        }
      } catch (error) {
        console.error(`刷新 ${stock.symbol} 失败:`, error);
        console.warn(`刷新 ${stock.symbol} 失败：${(error && error.message) || '请稍后重试'}`);
      } finally {
        setIsRefreshingPrice(false);
      }
    };

    const handleRefreshIndicators = async () => {
      setIsRefreshingIndicators(true);
      console.log(`开始刷新股票 ${stock.symbol} 的技术指标...`);
      
      try {
        let indicators;
        if (stock.market === 'US') {
          indicators = await getUSTechnicalIndicators(stock.symbol);
        } else {
          indicators = await getHistoricalDataAndIndicators(stock.symbol, stock.market);
        }
        
        onUpdate({
          ...stock,
          technicalIndicators: indicators
        });
        
        console.log(`${stock.symbol}: 技术指标刷新成功`, indicators);
      } catch (error) {
        console.error(`刷新 ${stock.symbol} 技术指标失败:`, error);
      } finally {
        setIsRefreshingIndicators(false);
      }
    };

    const stockAnalysis = calculateStockAnalysis(stock, brokerChannel);

    const addSellSimulation = () => {
      const newSim = {
        id: Date.now(),
        price: '',
        shares: '',
        profitLossPercent: ''
      };
      setSellSimulations(prev => [...prev, newSim]);
    };

    const updateSellSimulation = (id, field, value) => {
      setSellSimulations(prev => prev.map(sim => {
        if (sim.id === id) {
          const updatedSim = { ...sim, [field]: value || '' };
          
          if (field === 'price' && value && stockAnalysis.breakEvenPrice > 0) {
            const profitLossPercent = ((parseFloat(value) / stockAnalysis.breakEvenPrice) - 1) * 100;
            updatedSim.profitLossPercent = profitLossPercent.toFixed(2);
          } else if (field === 'profitLossPercent' && value && stockAnalysis.breakEvenPrice > 0) {
            const calculatedPrice = stockAnalysis.breakEvenPrice * (1 + parseFloat(value) / 100);
            updatedSim.price = calculatedPrice.toFixed(3);
          }
          
          return updatedSim;
        }
        return sim;
      }));
    };

    const removeSellSimulation = (id) => {
      setSellSimulations(prev => prev.filter(sim => sim.id !== id));
    };

    const marketStr = stock.market === 'US' ? '美股' : stock.market === 'HK' ? '港股' : 'A股';
    const keywords = Array.isArray(stock.keywords) ? stock.keywords : [];
    const newsUrl = 'news.html?code=' + encodeURIComponent(stock.symbol) + '&market=' + encodeURIComponent(marketStr) + (stock.name ? '&name=' + encodeURIComponent(stock.name) : '') + (keywords.length ? '&keywords=' + encodeURIComponent(keywords.join(',')) : '');

    const handleAddKeyword = (kw) => {
      const k = (kw || '').trim();
      if (!k) return;
      const next = [...(stock.keywords || []), k];
      onUpdate({ ...stock, keywords: next });
    };
    const handleRemoveKeyword = (idx) => {
      const next = (stock.keywords || []).filter((_, i) => i !== idx);
      onUpdate({ ...stock, keywords: next });
    };

  return (
    <div className="card" data-name="stock-card" data-file="components/StockCard.js">
        {/* Stock Header */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xl font-bold text-[var(--text-primary)]">
              {stock.symbol}
            </h3>
            <div className="flex items-center gap-1 flex-wrap">
              <a href={`analysis.html?code=${encodeURIComponent(stock.symbol)}&market=${marketStr}${stock.name ? '&name=' + encodeURIComponent(stock.name) : ''}`} className="btn btn-primary btn-sm">分析</a>
              <a href={newsUrl} className="btn btn-sm" style={{ backgroundColor: '#d02f5e', color: 'white' }}>新闻</a>
              <button type="button" onClick={() => { try { handleRefreshPrice(); } catch (e) { console.error(e); setIsRefreshingPrice(false); } }} disabled={isRefreshingPrice} className="btn btn-success btn-sm disabled:opacity-50">{isRefreshingPrice ? '刷新中' : '刷新'}</button>
              <button type="button" onClick={() => { try { handleFetchHistory30(); } catch (e) { console.error(e); setIsFetchingHistory(false); } }} disabled={isFetchingHistory} className="btn btn-primary btn-sm disabled:opacity-50">{isFetchingHistory ? '获取中' : '获取30日收盘'}</button>
              <button type="button" onClick={onDelete} className="btn btn-danger btn-sm">删除</button>
              <button type="button" onClick={onToggleCollapse} className="btn btn-secondary btn-sm p-1.5" title={isCollapsed ? '展开' : '折叠'} aria-label={isCollapsed ? '展开' : '折叠'}>
                <div className={`icon-chevron-${isCollapsed ? 'down' : 'up'} text-sm`}></div>
              </button>
            </div>
          </div>
          
          <StockBasicInfo 
            stock={stock} 
            brokerChannel={brokerChannel} 
            onBrokerChannelChange={handleBrokerChannelChange}
            onPriceUpdate={handleManualPriceUpdate}
            onRefreshAllPrices={onRefreshAllPrices}
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-[var(--text-secondary)]">备注关键词：</span>
            {keywords.map((kw, idx) => {
              const tagColors = ['#059669', '#2563eb', '#7c3aed', '#dc2626', '#ea580c', '#0891b2', '#4f46e5'];
              const color = tagColors[idx % tagColors.length];
              return (
                <span key={idx} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded border" style={{ backgroundColor: color + '18', color, borderColor: color + '60' }}>
                  {kw}
                  <button type="button" onClick={() => handleRemoveKeyword(idx)} className="opacity-70 hover:opacity-100 p-0.5" aria-label="删除" style={{ color }}>×</button>
                </span>
              );
            })}
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="添加关键词（如美团、外卖）"
              className="w-32 px-2 py-0.5 text-sm border border-gray-300 rounded"
              onKeyDown={(e) => { if (e.key === 'Enter') { handleAddKeyword(newKeyword); setNewKeyword(''); } }}
            />
            <button type="button" onClick={() => { handleAddKeyword(newKeyword); setNewKeyword(''); }} className="btn btn-secondary btn-sm">添加</button>
          </div>
        </div>

      {!isCollapsed && (
        <>
          <MarketDataSection stock={stock} />
          <StockCharts stock={stock} />
          <HoldingsAnalysisSection stockAnalysis={stockAnalysis} stock={stock} />
        
        <PositionsSection 
          stock={stock}
          brokerChannel={brokerChannel}
          onUpdatePosition={handleUpdatePosition}
          onDeletePosition={handleDeletePosition}
          showPositionForm={showPositionForm}
          setShowPositionForm={setShowPositionForm}
          editingPosition={editingPosition}
          setEditingPosition={setEditingPosition}
          showBuyFeesDetail={showBuyFeesDetail}
          setShowBuyFeesDetail={setShowBuyFeesDetail}
          onAddPosition={handleAddPosition}
        />

        <SellSimulationSection
          sellSimulations={sellSimulations}
          addSellSimulation={addSellSimulation}
          updateSellSimulation={updateSellSimulation}
          removeSellSimulation={removeSellSimulation}
          stock={stock}
          brokerChannel={brokerChannel}
          stockAnalysis={stockAnalysis}
          showFeeModal={showFeeModal}
          setShowFeeModal={setShowFeeModal}
          onConfirmSell={handleConfirmSell}
          capitalPool={capitalPool}
          onUpdateCapitalPool={onUpdateCapitalPool}
        />

            <FeeStructureSection 
              brokerChannel={brokerChannel}
              stock={stock}
              showFeeModal={showFeeModal}
              setShowFeeModal={setShowFeeModal}
            />
          </>
        )}
      </div>
    );
  } catch (error) {
    console.error('StockCard component error:', error);
    var sym = (stockProp && stockProp.symbol) || '—';
    return (
      <div className="card border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
        <p className="font-medium">该股票卡片渲染异常（{sym}）</p>
        <p className="text-xs text-amber-800/90 mt-1">
          可尝试刷新页面；若持续出现请查看控制台报错。
        </p>
      </div>
    );
  }
}