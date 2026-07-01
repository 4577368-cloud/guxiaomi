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
    const [swipeX, setSwipeX] = React.useState(0);
    const [swipeStartX, setSwipeStartX] = React.useState(0);
    const [isSwiping, setIsSwiping] = React.useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

    // 滑动删除手势处理
    const handleTouchStart = (e) => {
      const touch = e.touches[0];
      setSwipeStartX(touch.clientX);
      setIsSwiping(true);
    };

    const handleTouchMove = (e) => {
      if (!isSwiping) return;
      const touch = e.touches[0];
      const diff = touch.clientX - swipeStartX;
      // 只允许左滑（负值）
      if (diff < 0) {
        setSwipeX(Math.max(diff, -100));
      }
    };

    const handleTouchEnd = () => {
      setIsSwiping(false);
      if (swipeX < -60) {
        // 显示删除确认
        setShowDeleteConfirm(true);
        setSwipeX(-100);
      } else {
        setSwipeX(0);
      }
    };

    const resetSwipe = () => {
      setSwipeX(0);
      setShowDeleteConfirm(false);
    };


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

      const newPos = {
        ...position,
        id: Date.now().toString(),
        price: Number(position.price) || 0,
        shares: Number(position.shares) || 0,
        enabled: position.enabled !== false,
      };
      const updatedStock = {
        ...stock,
        positions: [...currentPositions, newPos],
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
    const returnPath = typeof window !== 'undefined'
      ? `${window.location.pathname.split('/').pop() || 'index.html'}${window.location.search || ''}${window.location.hash || ''}`
      : 'index.html';
    const fromParam = '&from=' + encodeURIComponent(returnPath);
    const detailUrl = `stock-detail.html?code=${encodeURIComponent(stock.symbol)}&market=${encodeURIComponent(marketStr)}${stock.name ? '&name=' + encodeURIComponent(stock.name) : ''}`;
    const analysisUrl = `analysis.html?code=${encodeURIComponent(stock.symbol)}&market=${encodeURIComponent(marketStr)}${stock.name ? '&name=' + encodeURIComponent(stock.name) : ''}${fromParam}`;
    const paipanUrl = `ziwei.html?code=${encodeURIComponent(stock.symbol)}&market=${encodeURIComponent(marketStr)}${stock.name ? '&name=' + encodeURIComponent(stock.name) : ''}${fromParam}`;
    const newsUrl = 'news.html?code=' + encodeURIComponent(stock.symbol) + '&market=' + encodeURIComponent(marketStr) + (stock.name ? '&name=' + encodeURIComponent(stock.name) : '') + (keywords.length ? '&keywords=' + encodeURIComponent(keywords.join(',')) : '') + fromParam;

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
    <div className="relative overflow-hidden" data-name="stock-card" data-file="components/StockCard.js"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* 滑动删除背景 */}
      <div className={`absolute inset-0 bg-gradient-to-l from-red-500 to-red-600 flex items-center justify-end pr-4 transition-opacity ${swipeX < -20 ? 'opacity-100' : 'opacity-0'}`}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
          className="p-3 rounded-full bg-white/20 text-white touch-manipulation"
          aria-label="删除"
        >
          <div className="icon-trash-2"></div>
        </button>
      </div>

      {/* 主卡片内容 */}
      <div
        id={`stock-${stock.id}`}
        className="card transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${swipeX}px)` }}
      >
        {/* Stock Header */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xl font-bold text-[var(--text-primary)]">
              {stock.symbol}
            </h3>
            <div className="flex items-center justify-end gap-1 flex-wrap">
              <a href={detailUrl} className="btn btn-secondary nav-chip gap-1">
                <div className="icon-layout-dashboard"></div>
                <span>详情</span>
              </a>
              <a href={analysisUrl} className="btn btn-secondary nav-chip gap-1">
                <div className="icon-bar-chart-2"></div>
                <span>分析</span>
              </a>
              <a href={paipanUrl} className="btn btn-secondary nav-chip gap-1">
                <div className="icon-sparkles"></div>
                <span>排盘</span>
              </a>
              <a href={newsUrl} className="btn btn-secondary nav-chip gap-1">
                <div className="icon-newspaper"></div>
                <span>新闻</span>
              </a>
              <button type="button" onClick={() => { try { handleRefreshPrice(); } catch (e) { console.error(e); setIsRefreshingPrice(false); } }} disabled={isRefreshingPrice} className="btn btn-secondary nav-chip gap-1 disabled:opacity-50 touch-manipulation">
                <div className={`icon-refresh-cw ${isRefreshingPrice ? 'animate-spin' : ''}`}></div>
                <span>{isRefreshingPrice ? '刷新中' : '刷新'}</span>
              </button>
              <button type="button" onClick={() => { try { setShowDeleteConfirm(true); } catch (e) { console.error(e); } }} className="btn btn-danger btn-icon touch-manipulation md:hidden" title="删除" aria-label="删除">
                <div className="icon-trash-2"></div>
              </button>
              <button type="button" onClick={onDelete} className="btn btn-danger btn-icon touch-manipulation hidden md:inline-flex" title="删除" aria-label="删除">
                <div className="icon-trash-2"></div>
              </button>
              <button type="button" onClick={onToggleCollapse} className="btn btn-secondary btn-icon touch-manipulation" title={isCollapsed ? '展开' : '折叠'} aria-label={isCollapsed ? '展开' : '折叠'}>
                <div className={`icon-chevron-${isCollapsed ? 'down' : 'up'}`}></div>
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
              const tagStyles = [
                { bg: 'rgba(52, 211, 153, 0.28)', text: '#d1fae5', border: 'rgba(52, 211, 153, 0.65)' },
                { bg: 'rgba(56, 189, 248, 0.28)', text: '#e0f2fe', border: 'rgba(56, 189, 248, 0.65)' },
                { bg: 'rgba(251, 191, 36, 0.28)', text: '#fef3c7', border: 'rgba(251, 191, 36, 0.65)' },
                { bg: 'rgba(163, 230, 53, 0.22)', text: '#ecfccb', border: 'rgba(190, 242, 100, 0.65)' },
                { bg: 'rgba(45, 212, 191, 0.28)', text: '#ccfbf1', border: 'rgba(45, 212, 191, 0.65)' },
                { bg: 'rgba(249, 115, 22, 0.28)', text: '#ffedd5', border: 'rgba(249, 115, 22, 0.65)' },
                { bg: 'rgba(14, 165, 233, 0.28)', text: '#e0f2fe', border: 'rgba(14, 165, 233, 0.65)' },
              ];
              const s = tagStyles[idx % tagStyles.length];
              return (
                <span
                  key={idx}
                  className="inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-xs font-semibold shadow-sm"
                  style={{ backgroundColor: s.bg, color: s.text, borderColor: s.border }}
                >
                  {kw}
                  <button
                    type="button"
                    onClick={() => handleRemoveKeyword(idx)}
                    className="ml-0.5 rounded px-0.5 hover:bg-white/15"
                    aria-label="删除"
                    style={{ color: s.text }}
                  >
                    ×
                  </button>
                </span>
              );
            })}
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="添加关键词（如美团、外卖）"
              className="input-field w-36 py-1 text-sm"
              onKeyDown={(e) => { if (e.key === 'Enter') { handleAddKeyword(newKeyword); setNewKeyword(''); } }}
            />
            <button type="button" onClick={() => { handleAddKeyword(newKeyword); setNewKeyword(''); }} className="btn btn-secondary btn-sm">添加</button>
          </div>
        </div>

      {!isCollapsed && (
        <>
          <div className="mt-3 rounded-2xl border border-white/12 bg-slate-950/18 p-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">
                <div className="text-[11px] text-slate-400">当前市值</div>
                <div className="gx-num mt-0.5 text-sm font-bold text-slate-100 tabular-nums">
                  {formatPrice(stockAnalysis.currentValue, 2)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">
                <div className="text-[11px] text-slate-400">浮动盈亏</div>
                <div className={`gx-num mt-0.5 text-sm font-bold tabular-nums ${stockAnalysis.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {stockAnalysis.profit >= 0 ? '+' : ''}{formatPrice(stockAnalysis.profit, 2)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">
                <div className="text-[11px] text-slate-400">平均成本</div>
                <div className="gx-num mt-0.5 text-sm font-bold text-slate-100 tabular-nums">
                  {formatPrice(stockAnalysis.avgCost, 3)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">
                <div className="text-[11px] text-slate-400">有效股数</div>
                <div className="gx-num mt-0.5 text-sm font-bold text-slate-100 tabular-nums">
                  {formatPrice(stockAnalysis.totalShares, 0)}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
              <p className="text-xs text-slate-400">
                完整持仓批次、价格趋势、卖出模拟和费率测算已迁入详情页，首页只保留决策摘要。
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowPositionForm(true)}
                  className="btn btn-primary btn-sm gap-1.5"
                >
                  <div className="icon-plus text-sm"></div>
                  <span>加仓</span>
                </button>
                <a href={detailUrl} className="btn btn-secondary btn-sm gap-1.5">
                  <div className="icon-layout-dashboard text-sm"></div>
                  <span>查看详情</span>
                </a>
              </div>
            </div>
          </div>

          {showPositionForm && (
            <PositionForm
              stock={stock}
              onAdd={handleAddPosition}
              onClose={() => setShowPositionForm(false)}
              brokerChannel={brokerChannel}
              onBrokerChannelChange={handleBrokerChannelChange}
            />
          )}
          </>
        )}
        {/* 删除确认弹窗 */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={resetSwipe}
          >
            <div className="w-full max-w-sm rounded-2xl bg-slate-800 p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 className="mb-2 text-lg font-semibold text-white">确认删除</h4>
              <p className="mb-4 text-slate-300">
                确定要删除 <span className="font-semibold text-white">{stock.symbol}</span> 吗？此操作无法撤销。
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={resetSwipe}
                  className="btn btn-secondary flex-1 touch-manipulation"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => { resetSwipe(); onDelete(); }}
                  className="btn flex-1 touch-manipulation bg-red-500 hover:bg-red-600 text-white border-red-500"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
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