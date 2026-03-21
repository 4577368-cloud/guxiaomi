function StockCharts({ stock }) {
  const dailyProfitChartRef = React.useRef(null);
  const priceTrendChartRef = React.useRef(null);
  const backtestChartRef = React.useRef(null);
  const dailyProfitChartInstance = React.useRef(null);
  const priceTrendChartInstance = React.useRef(null);
  const backtestChartInstance = React.useRef(null);
  const [effectiveHistory, setEffectiveHistory] = React.useState([]);
  const [activeTab, setActiveTab] = React.useState('charts'); // charts / backtest
  const windowSize = 30;

  /** 图表固定展示最近 windowSize 天（去掉无效滑块，避免与 effect 依赖不同步） */
  const sliceLastWindow = React.useCallback(
    (arr) => {
      if (!arr || !arr.length) return [];
      const start = Math.max(0, arr.length - windowSize);
      return arr.slice(start);
    },
    [windowSize],
  );

  const getPersistedHistory = () => {
    try {
      const key = `stock_price_history_${(stock.market || 'UNKNOWN').toString().toUpperCase()}_${(stock.symbol || 'UNKNOWN').toString().toUpperCase()}`;
      const saved = localStorage.getItem(key);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!parsed || !Array.isArray(parsed.history)) return [];
      return parsed.history;
    } catch (err) {
      console.error('读取 localStorage 历史失败', err);
      return [];
    }
  };

  const getEventCollection = () => {
    if (!Array.isArray(stock.positionEventHistory)) return [];
    return stock.positionEventHistory
      .filter(evt => evt && evt.date && evt.shares != null)
      .map(evt => ({
        ...evt,
        shares: Number(evt.shares) || 0,
        price: Number(evt.price) || 0,
        amount: Number(evt.amount) || (Number(evt.shares) || 0) * (Number(evt.price) || 0)
      }));
  };

  const calculatePortfolioBacktest = () => {
    const events = getEventCollection();
    let shares = 0;
    let cash = 0;
    let costBasis = 0;

    const eventsByDate = events.reduce((acc, evt) => {
      acc[evt.date] = acc[evt.date] || [];
      acc[evt.date].push(evt);
      return acc;
    }, {});

    let lastEquity = 0;

    return effectiveHistory.map((row) => {
      const rowEvents = eventsByDate[row.date] || [];
      rowEvents.forEach(evt => {
        if (evt.type === 'open' || evt.type === 'add' || evt.type === 'buy') {
          shares += evt.shares;
          cash -= evt.amount;
          costBasis += evt.amount;
        } else if (evt.type === 'reduce' || evt.type === 'sell') {
          const avgCost = shares > 0 ? costBasis / shares : 0;
          const reduceCost = avgCost * evt.shares;
          shares = Math.max(0, shares - evt.shares);
          cash += evt.amount;
          costBasis = Math.max(0, costBasis - reduceCost);
        }
      });

      const marketValue = shares * row.price;
      const totalEquity = cash + marketValue;
      const dailyProfit = Number.isFinite(totalEquity - lastEquity) ? totalEquity - lastEquity : 0;
      lastEquity = totalEquity;

      return {
        date: row.date,
        shares,
        marketValue,
        cash,
        costBasis,
        totalEquity,
        dailyProfit
      };
    });
  };

  const getEventMarkers = () => {
    const events = getEventCollection();
    const pointMap = new Map();
    events.forEach(evt => {
      pointMap.set(evt.date, evt);
    });

    const markers = effectiveHistory.map((row) => {
      const evt = pointMap.get(row.date);
      if (!evt) return null;
      return {
        x: row.date,
        y: row.price,
        event: evt
      };
    }).filter(Boolean);

    return markers;
  };

  React.useEffect(() => {
    const persistedHistory = window.loadStockPriceHistory ? window.loadStockPriceHistory(stock.symbol, stock.market) : [];
    let newHistory = [];
    if (Array.isArray(stock.priceHistory) && stock.priceHistory.length > 0) {
      newHistory = stock.priceHistory;
    }
    if ((!Array.isArray(newHistory) || newHistory.length === 0) && Array.isArray(persistedHistory) && persistedHistory.length > 0) {
      newHistory = persistedHistory;
    }

    // 还要合并历史，避免只存最近30天丢失过往数据
    const combinedMap = new Map();
    (Array.isArray(persistedHistory) ? persistedHistory : []).forEach(item => item && item.date && combinedMap.set(item.date, item));
    (Array.isArray(newHistory) ? newHistory : []).forEach(item => item && item.date && combinedMap.set(item.date, item));
    const mergedHistory = Array.from(combinedMap.values())
      .slice()
      .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-365);

    // 确保按日期升序（左侧旧，右侧新）
    const sortedHistory = (Array.isArray(mergedHistory) ? mergedHistory : []).slice().sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA - dateB;
    });

    console.log('[StockCharts] setEffectiveHistory', stock.symbol, stock.market, sortedHistory.length, sortedHistory.slice(0, 3));

    const nonEmpty = sortedHistory.length > 0 ? sortedHistory : getPersistedHistory();
    if (nonEmpty.length > 0 && nonEmpty !== sortedHistory) {
      console.log('[StockCharts] fallback to persisted history', nonEmpty.length);
    }

    const finalHistory = nonEmpty.length > 0 ? nonEmpty : [];
    setEffectiveHistory(finalHistory);
  }, [stock.symbol, stock.market, stock.priceHistory]);

  React.useEffect(() => {
    if (dailyProfitChartRef.current && effectiveHistory && effectiveHistory.length > 0) {
      const ctx = dailyProfitChartRef.current.getContext('2d');
      
      if (dailyProfitChartInstance.current) {
        dailyProfitChartInstance.current.destroy();
      }

      const displayData = sliceLastWindow(effectiveHistory);

      const dates = displayData.map(item => item.date);
      const profits = displayData.map(item => item.dailyProfit || 0);
      const colors = profits.map(p => p >= 0 ? 'rgba(5, 150, 105, 0.8)' : 'rgba(220, 38, 38, 0.8)');

      dailyProfitChartInstance.current = new ChartJS(ctx, {
        type: 'bar',
        data: {
          labels: dates,
          datasets: [{
            label: '每日盈亏',
            data: profits,
            backgroundColor: colors,
            borderColor: colors.map(c => c.replace('0.8', '1')),
            borderWidth: 1,
            barPercentage: 0.5,
            categoryPercentage: 0.7
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const value = context.parsed.y;
                  const symbol = stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : 'HK$';
                  return `盈亏: ${value >= 0 ? '+' : ''}${symbol}${value.toFixed(2)}`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grace: '10%',
              ticks: {
                callback: (value) => {
                  const symbol = stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : 'HK$';
                  return `${value >= 0 ? '' : '-'}${symbol}${Math.abs(value).toFixed(2)}`;
                }
              },
              grid: {
                color: (context) => {
                  if (context.tick.value === 0) {
                    return 'rgba(0, 0, 0, 0.3)';
                  }
                  return 'rgba(0, 0, 0, 0.1)';
                }
              }
            }
          }
        }
      });
    }

    return () => {
      if (dailyProfitChartInstance.current) {
        dailyProfitChartInstance.current.destroy();
      }
    };
  }, [effectiveHistory, stock.market, sliceLastWindow]);

  React.useEffect(() => {
    if (priceTrendChartRef.current && effectiveHistory && effectiveHistory.length > 0) {
      const ctx = priceTrendChartRef.current.getContext('2d');
      
      if (priceTrendChartInstance.current) {
        priceTrendChartInstance.current.destroy();
      }

      const displayData = sliceLastWindow(effectiveHistory);

      const dates = displayData.map(item => item.date);
      const prices = displayData.map(item => item.price);
      const changePercents = displayData.map((item, idx) => {
        if (idx === 0) return 0;
        const prev = displayData[idx - 1].price;
        if (!prev || prev === 0) return 0;
        return Number((((item.price - prev) / prev) * 100).toFixed(2));
      });

      const eventMarkers = getEventMarkers().filter(marker => {
        return dates.includes(marker.x);
      }).map(marker => ({
        x: marker.x,
        y: marker.y,
        event: marker.event
      }));

      priceTrendChartInstance.current = new ChartJS(ctx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [
            {
              label: '股票价格',
              data: prices,
              borderColor: 'rgba(59, 130, 246, 1)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
              yAxisID: 'price'
            },
            {
              label: '涨跌幅(%)',
              data: changePercents,
              borderColor: changePercents.map(v => v >= 0 ? 'rgba(220, 38, 38, 1)' : 'rgba(14, 165, 233, 1)'),
              backgroundColor: changePercents.map(v => v >= 0 ? 'rgba(220, 38, 38, 0.2)' : 'rgba(14, 165, 233, 0.2)'),
              borderWidth: 2,
              fill: false,
              tension: 0.2,
              yAxisID: 'change'
            },
            {
              type: 'scatter',
              label: '仓位事件',
              data: eventMarkers,
              pointStyle: eventMarkers.map(m => (m.event.type === 'sell' || m.event.type === 'reduce' ? 'triangle' : 'rect')),
              pointRadius: 8,
              pointBackgroundColor: eventMarkers.map(m => (m.event.type === 'sell' || m.event.type === 'reduce' ? 'rgba(14, 165, 233, 1)' : 'rgba(220, 38, 38, 1)')),
              yAxisID: 'price'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const value = context.parsed.y;
                  const symbol = stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : 'HK$';
                  return `价格: ${symbol}${value.toFixed(3)}`;
                }
              }
            }
          },
          scales: {
            price: {
              type: 'linear',
              position: 'left',
              ticks: {
                callback: (value) => {
                  const symbol = stock.market === 'US' ? '$' : stock.market === 'CN' ? '¥' : 'HK$';
                  return `${symbol}${value.toFixed(2)}`;
                }
              }
            },
            change: {
              type: 'linear',
              position: 'right',
              grid: { drawOnChartArea: false },
              ticks: {
                callback: (value) => `${value.toFixed(2)}%`
              }
            }
          }
        }
      });
    }

    return () => {
      if (priceTrendChartInstance.current) {
        priceTrendChartInstance.current.destroy();
      }
    };
  }, [effectiveHistory, stock.market, sliceLastWindow, stock.positionEventHistory]);

  React.useEffect(() => {
    if (activeTab !== 'backtest') return;
    if (!backtestChartRef.current || !effectiveHistory || effectiveHistory.length === 0) return;

    try {
      const backtestData = calculatePortfolioBacktest();
      const ctx = backtestChartRef.current.getContext('2d');

      if (backtestChartInstance.current) {
        backtestChartInstance.current.destroy();
      }

      backtestChartInstance.current = new ChartJS(ctx, {
        type: 'line',
        data: {
          labels: backtestData.map(d => d.date),
        datasets: [
          {
            label: '总权益',
            data: backtestData.map(d => Number(d.totalEquity.toFixed(2))),
            borderColor: 'rgba(34, 197, 94, 1)',
            borderWidth: 2,
            fill: false,
            tension: 0.2,
            yAxisID: 'equity'
          },
          {
            label: '每日收益',
            data: backtestData.map(d => Number(d.dailyProfit.toFixed(2))),
            type: 'bar',
            backgroundColor: backtestData.map(d => d.dailyProfit >= 0 ? 'rgba(5, 150, 105, 0.5)' : 'rgba(220, 38, 38, 0.5)'),
            yAxisID: 'daily'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true }
        },
        scales: {
          equity: {
            type: 'linear',
            position: 'left',
            ticks: {
              callback: value => `${value.toFixed(2)}`
            }
          },
          daily: {
            type: 'linear',
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              callback: value => `${value.toFixed(2)}`
            }
          }
        }
      }
    });

    } catch (e) {
      console.error('回测Chart渲染失败', e);
    }

    return () => {
      if (backtestChartInstance.current) {
        backtestChartInstance.current.destroy();
      }
    };
  }, [activeTab, effectiveHistory]);

  if (!effectiveHistory || effectiveHistory.length === 0) {
    return (
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
        <div className="icon-bar-chart text-4xl text-gray-300 mb-2 flex justify-center"></div>
        <p className="text-sm text-gray-500">暂无历史数据，请刷新后获取价格。若已获取请稍等数秒。</p>
      </div>
    );
  }

  const hasMoreData = effectiveHistory && effectiveHistory.length > 30;
  const backtestData = calculatePortfolioBacktest();

  return (
    <div className="mb-6 space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('charts')}
          className={`btn btn-sm ${activeTab === 'charts' ? 'btn-primary' : 'btn-secondary'}`}
        >价格+盈亏</button>
        <button
          onClick={() => setActiveTab('backtest')}
          className={`btn btn-sm ${activeTab === 'backtest' ? 'btn-primary' : 'btn-secondary'}`}
        >仓位事件+回测</button>
      </div>

      {activeTab === 'charts' ? (
        <>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <div className="icon-bar-chart text-sm text-green-600"></div>
                每日盈亏
              </h4>
              {hasMoreData && (
                <span className="text-xs text-gray-500">显示最近30天</span>
              )}
            </div>
            <div style={{ height: '200px' }}>
              <canvas ref={dailyProfitChartRef}></canvas>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <div className="icon-trending-up text-sm text-blue-600"></div>
              价格走势
            </h4>
            <div style={{ height: '200px' }}>
              <canvas ref={priceTrendChartRef}></canvas>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">仓位事件回测</h4>
            <div style={{ height: '260px' }}>
              <canvas ref={backtestChartRef}></canvas>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">仓位事件列表</h4>
            <div className="text-xs text-gray-600 mb-2">根据当前持仓事件填充，按日期表现叠加</div>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="p-1">日期</th>
                    <th className="p-1">事件</th>
                    <th className="p-1">数量</th>
                    <th className="p-1">价格</th>
                    <th className="p-1">金额</th>
                  </tr>
                </thead>
                <tbody>
                  {(stock.positionEventHistory || []).slice(-40).reverse().map(evt => (
                    <tr key={evt.id || `${evt.date}_${Math.random()}`}>
                      <td className="p-1">{evt.date}</td>
                      <td className="p-1">{evt.note || evt.type}</td>
                      <td className="p-1">{evt.shares}</td>
                      <td className="p-1">{evt.price}</td>
                      <td className="p-1">{evt.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-xs text-gray-500">最近显示 40 条事件，按时间逆序。</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">回测关键指标</h4>
            <div className="text-xs text-gray-600">最新权益: {backtestData.length > 0 ? backtestData[backtestData.length - 1].totalEquity.toFixed(2) : '0.00'}，持仓: {backtestData.length > 0 ? backtestData[backtestData.length - 1].shares : 0}</div>
          </div>
        </>
      )}
    </div>
  );
}