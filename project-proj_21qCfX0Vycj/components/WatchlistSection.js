// 监控列表卡片组件 - 用于展示关注的股票
function WatchlistCard({ item, onRemove, onRefresh, onAddPosition }) {
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isRemoving, setIsRemoving] = React.useState(false);

  const marketLabels = { US: '美', HK: '港', CN: 'A' };
  const marketColors = { US: 'bg-blue-500/20 text-blue-300', HK: 'bg-orange-500/20 text-orange-300', CN: 'bg-red-500/20 text-red-300' };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh(item);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRemove = () => {
    setIsRemoving(true);
    onRemove(item);
  };

  const currencySymbol = item.market === 'US' ? '$' : item.market === 'CN' ? '¥' : 'HK$';
  const isPositive = item.change >= 0;
  const changeColor = isPositive ? 'text-emerald-400' : 'text-lime-400';
  const changeBg = isPositive ? 'bg-emerald-500/20' : 'bg-lime-500/20';

  return (
    <div className="card p-3 flex items-center gap-3 hover:border-white/25 transition-all group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold text-slate-100">{item.symbol}</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${marketColors[item.market] || 'bg-slate-500/20 text-slate-300'}`}>
            {marketLabels[item.market] || item.market}
          </span>
          {item.name && item.name !== item.symbol && (
            <span className="text-xs text-slate-400 truncate">{item.name}</span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="gx-num text-lg font-bold text-slate-100 tabular-nums">
            {item.currentPrice > 0 ? `${currencySymbol}${formatPrice(item.currentPrice, 2)}` : '—'}
          </span>
          {item.currentPrice > 0 && (
            <span className={`gx-num text-sm font-semibold tabular-nums ${changeColor}`}>
              {isPositive ? '+' : ''}{item.change?.toFixed(2) || '0.00'}
              ({item.changePercent?.toFixed(2) || '0.00'}%)
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="btn btn-sm btn-secondary p-1.5 disabled:opacity-50 touch-manipulation"
          title="刷新价格"
        >
          <div className={`icon-refresh-cw text-sm ${isRefreshing ? 'animate-spin' : ''}`}></div>
        </button>
        {onAddPosition && (
          <button
            onClick={() => onAddPosition(item)}
            className="btn btn-sm btn-primary p-1.5 touch-manipulation"
            title="添加持仓"
          >
            <div className="icon-plus text-sm"></div>
          </button>
        )}
        <button
          onClick={handleRemove}
          disabled={isRemoving}
          className="btn btn-sm btn-danger p-1.5 touch-manipulation opacity-60 group-hover:opacity-100 transition-opacity"
          title="移出监控"
        >
          <div className="icon-x text-sm"></div>
        </button>
      </div>
    </div>
  );
}

// 监控列表容器组件
function WatchlistSection({ watchlist, onRemoveItem, onRefreshItem, onAddPosition, onRefreshAll }) {
  const [isRefreshingAll, setIsRefreshingAll] = React.useState(false);

  if (!watchlist || watchlist.length === 0) {
    return null;
  }

  const handleRefreshAll = async () => {
    setIsRefreshingAll(true);
    try {
      await onRefreshAll();
    } finally {
      setIsRefreshingAll(false);
    }
  };

  return (
    <div className="card mb-4 p-4" data-name="watchlist-section" data-file="components/WatchlistSection.js">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display flex items-center gap-2 text-base font-bold text-slate-100 md:text-lg">
          <div className="icon-eye text-cyan-400"></div>
          关注列表
          <span className="text-xs font-normal text-slate-400">({watchlist.length})</span>
        </h2>
        <button
          onClick={handleRefreshAll}
          disabled={isRefreshingAll}
          className="btn btn-sm btn-secondary flex items-center gap-1.5 touch-manipulation"
        >
          <div className={`icon-refresh-cw text-sm ${isRefreshingAll ? 'animate-spin' : ''}`}></div>
          <span className="hidden sm:inline">{isRefreshingAll ? '刷新中...' : '刷新全部'}</span>
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {watchlist.map((item) => (
          <WatchlistCard
            key={item.id || `${item.market}_${item.symbol}`}
            item={item}
            onRemove={onRemoveItem}
            onRefresh={onRefreshItem}
            onAddPosition={onAddPosition}
          />
        ))}
      </div>
    </div>
  );
}

// 导出组件
window.WatchlistCard = WatchlistCard;
window.WatchlistSection = WatchlistSection;
