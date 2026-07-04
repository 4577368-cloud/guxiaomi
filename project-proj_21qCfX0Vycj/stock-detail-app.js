function normalizeDetailMarket(market) {
  const m = String(market || '').trim().toUpperCase();
  if (m === 'US' || m === '美股') return 'US';
  if (m === 'HK' || m === '港股') return 'HK';
  if (m === 'CN' || m === 'A股' || m === 'A') return 'CN';
  return m || '';
}

function marketName(market) {
  const m = normalizeDetailMarket(market);
  if (m === 'US') return '美股';
  if (m === 'HK') return '港股';
  if (m === 'CN') return 'A股';
  return market || '未知市场';
}

function currencyForMarket(market) {
  const m = normalizeDetailMarket(market);
  if (m === 'US') return '$';
  if (m === 'CN') return '¥';
  return 'HK$';
}

function detailMoney(value, market, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return currencyForMarket(market) + formatPrice(n, decimals);
}

function detailPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function formatCompactVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 100000000) return `${(n / 100000000).toFixed(2)}亿`;
  if (n >= 10000) return `${(n / 10000).toFixed(2)}万`;
  return Math.round(n).toLocaleString('zh-CN');
}

function daysSinceDetail(dateStr) {
  const start = new Date(dateStr || Date.now());
  if (Number.isNaN(start.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today - start) / 86400000));
}

function buildDetailUrl(path, stock) {
  const market = marketName(stock.market);
  const params = new URLSearchParams();
  params.set('code', stock.symbol || '');
  params.set('market', market);
  if (stock.name) params.set('name', stock.name);
  const keywords =
    typeof window.collectStockKeywords === 'function'
      ? window.collectStockKeywords(stock)
      : (Array.isArray(stock.keywords) ? stock.keywords : []);
  if (keywords.length) params.set('keywords', keywords.join(','));
  params.set('from', getCurrentReturnPath());
  return `${path}?${params.toString()}`;
}

function getCurrentReturnPath() {
  if (typeof window === 'undefined') return 'index.html';
  return `${window.location.pathname.split('/').pop() || 'index.html'}${window.location.search || ''}${window.location.hash || ''}`;
}

const DETAIL_RSS_FEEDS = [
  'https://plink.anyfeeder.com/zaobao/realtime/china',
  'https://plink.anyfeeder.com/zaobao/realtime/world',
  'https://plink.anyfeeder.com/fortunechina',
  'https://plink.anyfeeder.com/weixin/wallstreetcn',
  'https://plink.anyfeeder.com/tmtpost',
  'https://plink.anyfeeder.com/jiemian/finance',
  'https://plink.anyfeeder.com/jiemian/business',
  'https://plink.anyfeeder.com/weixin/caixinwang',
  'https://cn.wsj.com/zh-hans/rss',
  'https://plink.anyfeeder.com/weixin/cctvyscj',
];

const DETAIL_HISTORY_LIST_CACHE_KEY = 'analysis_reports_list_cache_v1';
const DETAIL_REPORT_BODY_PREFIX = 'analysis_report_body_v1:';
const DETAIL_REPORT_TOMBSTONE_KEY = 'analysis_reports_deleted_base_names_v1';

function cleanDetailText(text) {
  return String(text || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeDetailHistoryRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && Number.isFinite(Number(row.price || row.close)))
    .map((row) => ({
      ...row,
      date: row.date || row.time || new Date().toISOString().slice(0, 10),
      price: Number(row.price || row.close),
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function normalizeDetailReportCode(code, market) {
  var c = String(code || '').trim().toUpperCase();
  if (!c) return '';
  var mk = String(market || '').trim();
  var isHK = mk.indexOf('港') >= 0 || mk === 'HK';
  var isCN = mk.indexOf('A') >= 0 || mk.indexOf('CN') >= 0 || mk === 'A 股';
  c = c.replace(/\.HK$/i, '');
  if (/^\d+$/.test(c)) {
    var n = parseInt(c, 10);
    if (!Number.isFinite(n)) return c;
    if (isCN) return String(n).padStart(6, '0');
    if (isHK) return String(n).padStart(5, '0');
    if (c.length >= 6) return String(n).padStart(6, '0');
    return String(n).padStart(5, '0');
  }
  return c;
}

function inferDetailReportStock(baseName) {
  var m = String(baseName || '').match(/^(A股|港股|美股)_([^_]+)_/);
  if (!m) return { stock_code: '', market: '' };
  return {
    stock_code: (m[2] || '').trim().toUpperCase(),
    market: m[1] || '',
  };
}

function readDetailDeletedReportSet() {
  try {
    var raw = localStorage.getItem(DETAIL_REPORT_TOMBSTONE_KEY);
    var arr = raw ? JSON.parse(raw) : [];
    var out = {};
    if (Array.isArray(arr)) arr.forEach((x) => { if (x) out[String(x)] = true; });
    return out;
  } catch (_) {
    return {};
  }
}

function readDetailReportCache() {
  try {
    var raw = localStorage.getItem(DETAIL_HISTORY_LIST_CACHE_KEY);
    var list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    var deleted = readDetailDeletedReportSet();
    return list.filter((item) => item && item.base_name && !deleted[item.base_name]);
  } catch (_) {
    return [];
  }
}

function readDetailReportBody(baseName) {
  try {
    var raw = localStorage.getItem(DETAIL_REPORT_BODY_PREFIX + baseName);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function saveDetailReportList(items) {
  try {
    localStorage.setItem(DETAIL_HISTORY_LIST_CACHE_KEY, JSON.stringify((items || []).slice(0, 200)));
  } catch (_) {}
}

function cacheDetailReportBody(baseName, payload) {
  if (!baseName || !payload) return;
  try {
    localStorage.setItem(DETAIL_REPORT_BODY_PREFIX + baseName, JSON.stringify(payload));
  } catch (_) {}
}

function upsertDetailReportFromPayload(payload) {
  if (!payload || !payload.base_name) return;
  var current = readDetailReportCache();
  var generatedAt = (payload.生成时间 && String(payload.生成时间).trim()) || new Date().toISOString().slice(0, 16).replace('T', ' ');
  var item = {
    base_name: payload.base_name,
    generated_at: generatedAt,
    stock_code: String(payload.stock_code || '').toUpperCase(),
    market: payload.market || '',
  };
  var next = [item].concat(current.filter((x) => x && x.base_name !== item.base_name));
  saveDetailReportList(next);
}

function getDetailApiBase() {
  try {
    var injected = (window.ANALYSIS_API_BASE || '').trim().replace(/\/+$/, '');
    if (injected) return injected;
    var saved = (localStorage.getItem('analysis_api_base') || '').trim().replace(/\/+$/, '');
    if (saved) return saved;
  } catch (_) {}
  if (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    return 'http://localhost:8123';
  }
  return typeof location !== 'undefined' && location.origin ? location.origin : '';
}

function formatPriceVsBreakEven(price, breakEven, market) {
  const p = Number(price);
  const be = Number(breakEven);
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(be) || be <= 0) return null;
  const pct = ((p / be) - 1) * 100;
  const diff = p - be;
  const above = diff >= 0;
  return {
    pct,
    diff,
    above,
    label: above ? '高于回本线' : '低于回本线',
    arrow: above ? '↑' : '↓',
    pctText: detailPercent(pct),
    diffText: `${diff >= 0 ? '+' : ''}${detailMoney(diff, market, 3)}`,
  };
}

function SellSimStat({ label, value, valueClass, sub }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] py-1.5 text-xs last:border-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className={`gx-num text-right font-semibold tabular-nums ${valueClass || 'text-slate-100'}`}>
        {value}
        {sub ? <span className="ml-1 text-[10px] font-normal text-slate-500">{sub}</span> : null}
      </span>
    </div>
  );
}

function TargetPlanResultTable({ plan, market, targetAmount }) {
  if (!plan) return null;
  const currentPrice = Number(plan.currentPrice) || Number(plan.meta && plan.meta.currentPrice) || 0;
  const maxAtCurrent =
    plan.maxNetProfitAtRefPrice != null
      ? plan.maxNetProfitAtRefPrice
      : plan.meta && plan.meta.maxNetProfitAtRefPrice != null
        ? plan.meta.maxNetProfitAtRefPrice
        : null;
  const sellPrice = Number(plan.sellPrice) || 0;
  const gap = plan.priceGapFromCurrent != null
    ? plan.priceGapFromCurrent
    : plan.fullLiquidationForTarget
      ? plan.fullLiquidationForTarget.priceGapFromCurrent
      : currentPrice > 0 && sellPrice > 0
        ? sellPrice - currentPrice
        : 0;
  const gapPct = plan.priceGapPercentFromCurrent != null
    ? plan.priceGapPercentFromCurrent
    : plan.fullLiquidationForTarget
      ? plan.fullLiquidationForTarget.priceGapPercentFromCurrent
      : currentPrice > 0 && sellPrice > 0
        ? ((sellPrice / currentPrice) - 1) * 100
        : 0;
  const target = Number(targetAmount) || Number(plan.targetNetProfit) || 0;
  const feasible = plan.feasible !== false;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2">
      {target > 0 && (
        <SellSimStat label="目标净盈利" value={detailMoney(target, market, 2)} valueClass="text-amber-100" />
      )}
      {currentPrice > 0 && (
        <SellSimStat label="现价" value={detailMoney(currentPrice, market, 3)} valueClass="text-cyan-200" />
      )}
      {maxAtCurrent != null && (
        <SellSimStat
          label="现价全仓净盈利"
          value={`${maxAtCurrent >= 0 ? '+' : ''}${detailMoney(maxAtCurrent, market, 2)}`}
          valueClass={maxAtCurrent >= 0 ? 'text-emerald-300' : 'text-rose-300'}
        />
      )}
      {sellPrice > 0 && (
        <SellSimStat
          label={feasible && plan.planMode === 'liquidate_all' ? '全仓达标卖出价' : '参考卖出价'}
          value={detailMoney(sellPrice, market, 3)}
          valueClass="text-amber-200"
        />
      )}
      {currentPrice > 0 && sellPrice > 0 && (
        <SellSimStat
          label="卖出价较现价"
          value={detailPercent(gapPct)}
          valueClass={gap >= 0 ? 'text-emerald-300' : 'text-rose-300'}
          sub={`${gap >= 0 ? '+' : ''}${detailMoney(gap, market, 3)}`}
        />
      )}
      {feasible && plan.sellShares > 0 && (
        <SellSimStat label="卖出股数" value={`${formatPrice(plan.sellShares, 0)} 股`} />
      )}
      {feasible && plan.netProfit != null && (
        <SellSimStat
          label="预计净盈利"
          value={`${plan.netProfit >= 0 ? '+' : ''}${detailMoney(plan.netProfit, market, 2)}`}
          valueClass={plan.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}
        />
      )}
      {feasible && plan.remainingShares != null && (
        <SellSimStat label="剩余持仓" value={`${formatPrice(plan.remainingShares, 0)} 股`} />
      )}
    </div>
  );
}

function DetailMetric({ label, value, valueClass, hint }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.06] p-2 md:rounded-2xl md:p-3">
      <div className="text-[10px] text-slate-400 md:text-xs">{label}</div>
      <div className={`gx-num mt-0.5 text-sm font-bold tabular-nums md:mt-1 md:text-lg ${valueClass || 'text-slate-50'}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-500 md:text-[11px]">{hint}</div>}
    </div>
  );
}

function DetailHeaderMetric({ label, value, valueClass, hint }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 md:rounded-none md:border-0 md:border-l md:border-white/10 md:bg-transparent md:px-0 md:py-0 md:pl-4">
      <div className="text-[10px] font-medium leading-tight text-slate-400 md:text-[11px] md:font-semibold">{label}</div>
      <div className={`gx-num mt-0.5 truncate text-sm font-bold tabular-nums md:mt-1 md:text-lg md:font-black ${valueClass || 'text-slate-50'}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}

function getSparklineViewport(innerWidth) {
  var mobile = innerWidth < 640;
  var compact = innerWidth < 1024;
  if (mobile) {
    return {
      width: 400,
      height: 176,
      pad: { left: 34, right: 8, top: 12, bottom: 22 },
      pointRadius: 3,
      selectedRadius: 5,
      strokeWidth: 2.5,
      tooltipWidth: 142,
      yTickSize: 10,
    };
  }
  if (compact) {
    return {
      width: 560,
      height: 220,
      pad: { left: 42, right: 12, top: 16, bottom: 34 },
      pointRadius: 4,
      selectedRadius: 6,
      strokeWidth: 3.5,
      tooltipWidth: 160,
      yTickSize: 11,
    };
  }
  return {
    width: 720,
    height: 260,
    pad: { left: 54, right: 18, top: 20, bottom: 42 },
    pointRadius: 4,
    selectedRadius: 6,
    strokeWidth: 4,
    tooltipWidth: 174,
    yTickSize: 11,
  };
}

function useSparklineViewport() {
  const [viewport, setViewport] = React.useState(function () {
    return getSparklineViewport(typeof window !== 'undefined' ? window.innerWidth : 768);
  });
  React.useEffect(function () {
    function onResize() {
      setViewport(getSparklineViewport(window.innerWidth));
    }
    window.addEventListener('resize', onResize);
    return function () {
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return viewport;
}

function DetailSparkline({ history, currentPrice, positive, market }) {
  const [rangeDays, setRangeDays] = React.useState(15);
  const [activeIndex, setActiveIndex] = React.useState(null);
  const viewport = useSparklineViewport();
  const rows = React.useMemo(() => {
    const list = (Array.isArray(history) ? history : [])
      .filter((row) => row && Number.isFinite(Number(row.price)))
      .map((row) => ({
        date: row.date || row.time || '',
        price: Number(row.price),
      }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const sliced = list.slice(-rangeDays);
    if (sliced.length) return sliced;
    const cp = Number(currentPrice);
    return cp > 0 ? [{ date: new Date().toISOString().slice(0, 10), price: cp }] : [];
  }, [history, currentPrice, rangeDays]);

  if (!rows.length) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/25 text-sm text-slate-400">
        暂无价格走势
      </div>
    );
  }

  const prices = rows.map((row) => Number(row.price));
  const min = Math.min.apply(null, prices);
  const max = Math.max.apply(null, prices);
  const range = Math.max(max - min, Math.abs(max) * 0.001, 0.001);
  const width = viewport.width;
  const height = viewport.height;
  const pad = viewport.pad;
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const coords = rows.map((row, idx) => {
    const x = rows.length === 1 ? pad.left + chartW : pad.left + (idx / (rows.length - 1)) * chartW;
    const y = pad.top + chartH - ((Number(row.price) - min) / range) * chartH;
    return { ...row, x, y };
  });
  const selectedIndex = activeIndex == null ? coords.length - 1 : Math.min(activeIndex, coords.length - 1);
  const selected = coords[selectedIndex] || coords[coords.length - 1];
  const selectedPrev = selectedIndex > 0 ? coords[selectedIndex - 1] : null;
  const selectedDelta = selected && selectedPrev ? selected.price - selectedPrev.price : null;
  const selectedPct = selectedDelta != null && selectedPrev && selectedPrev.price > 0 ? (selectedDelta / selectedPrev.price) * 100 : null;
  const selectedUp = selectedDelta == null ? positive : selectedDelta >= 0;
  const ticks = [max, min + range / 2, min];
  const start = coords[0];
  const end = coords[coords.length - 1];
  const latestDelta = coords.length > 1 ? coords[coords.length - 1].price - coords[coords.length - 2].price : (positive ? 1 : -1);
  const latestUp = latestDelta >= 0;
  const stroke = latestUp ? '#34d399' : '#fca5a5';
  const fill = latestUp ? 'rgba(52, 211, 153, 0.16)' : 'rgba(252, 165, 165, 0.12)';
  const pointColor = (idx) => {
    if (idx === 0) return 'rgba(203,213,225,0.9)';
    return coords[idx].price - coords[idx - 1].price >= 0 ? '#6ee7b7' : '#fca5a5';
  };
  const buildSmoothPath = (items) => {
    if (!items.length) return '';
    if (items.length === 1) return `M ${items[0].x.toFixed(1)} ${items[0].y.toFixed(1)}`;
    if (items.length === 2) return `M ${items[0].x.toFixed(1)} ${items[0].y.toFixed(1)} L ${items[1].x.toFixed(1)} ${items[1].y.toFixed(1)}`;
    let path = `M ${items[0].x.toFixed(1)} ${items[0].y.toFixed(1)}`;
    for (let i = 0; i < items.length - 1; i++) {
      const p0 = items[i - 1] || items[i];
      const p1 = items[i];
      const p2 = items[i + 1];
      const p3 = items[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return path;
  };
  const smoothPath = buildSmoothPath(coords);
  const areaPath = coords.length > 1
    ? `${smoothPath} L ${(end?.x || pad.left).toFixed(1)} ${(pad.top + chartH).toFixed(1)} L ${(start?.x || pad.left).toFixed(1)} ${(pad.top + chartH).toFixed(1)} Z`
    : '';
  const tooltipWidth = viewport.tooltipWidth;
  const tooltipX = selected ? Math.max(pad.left + 4, Math.min(width - pad.right - tooltipWidth, selected.x - tooltipWidth / 2)) : pad.left;
  const tooltipY = selected ? Math.max(pad.top + 8, selected.y - 76) : pad.top;
  const compactDate = (date) => {
    const s = String(date || '');
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(5, 10).replace('-', '/');
    return s || '今日';
  };
  const syncActivePoint = (clientX, target) => {
    if (!target || coords.length < 2) return;
    const rect = target.getBoundingClientRect();
    if (!rect.width) return;
    const viewX = ((clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let nearestGap = Infinity;
    coords.forEach((point, idx) => {
      const gap = Math.abs(point.x - viewX);
      if (gap < nearestGap) {
        nearest = idx;
        nearestGap = gap;
      }
    });
    setActiveIndex(nearest);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/25 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-400">
          {rows.length > 1 ? `${rows.length} 个价格点` : '当前价格点'}
          {selected && (
            <span className="gx-num ml-2 font-semibold tabular-nums text-slate-100">
              {compactDate(selected.date)} · {detailMoney(selected.price, market, market === 'US' ? 3 : 2)}
              {selectedDelta != null && (
                <span className={selectedUp ? 'text-emerald-300' : 'text-rose-300'}>
                  {' '}({selectedDelta >= 0 ? '+' : ''}{detailMoney(selectedDelta, market, market === 'US' ? 3 : 2)}{selectedPct != null ? ` · ${selectedPct >= 0 ? '+' : ''}${selectedPct.toFixed(2)}%` : ''})
                </span>
              )}
            </span>
          )}
        </div>
        <div className="flex rounded-xl border border-white/10 bg-white/[0.05] p-0.5">
          {[7, 15, 30].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => {
                setRangeDays(days);
                setActiveIndex(null);
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                rangeDays === days ? 'bg-cyan-400/20 text-cyan-100' : 'text-slate-400 hover:bg-white/[0.08] hover:text-slate-200'
              }`}
            >
              {days}天
            </button>
          ))}
        </div>
      </div>
      <div className="relative w-full overflow-hidden rounded-xl bg-slate-950/20">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full max-h-[200px] sm:max-h-[240px] lg:max-h-[260px]"
          preserveAspectRatio="xMidYMid meet"
          aria-label="价格趋势图"
          onMouseMove={(event) => syncActivePoint(event.clientX, event.currentTarget)}
          onTouchMove={(event) => {
            const touch = event.touches && event.touches[0];
            if (touch) syncActivePoint(touch.clientX, event.currentTarget);
          }}
        >
        {ticks.map((tick, idx) => {
          const y = pad.top + ((max - tick) / range) * chartH;
          return (
            <g key={`tick-${idx}`}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgba(148,163,184,0.14)" strokeDasharray="4 6" />
              <text x={pad.left - 6} y={y + 4} textAnchor="end" fill="rgba(203,213,225,0.7)" fontSize={viewport.yTickSize}>
                {detailMoney(tick, market, market === 'US' ? 2 : 2)}
              </text>
            </g>
          );
        })}
        <line x1={pad.left} x2={pad.left} y1={pad.top} y2={pad.top + chartH} stroke="rgba(148,163,184,0.18)" />
        <line x1={pad.left} x2={width - pad.right} y1={pad.top + chartH} y2={pad.top + chartH} stroke="rgba(148,163,184,0.18)" />
        {areaPath && <path d={areaPath} fill={fill} stroke="none" className="transition-all duration-200 ease-out" />}
        <path d={smoothPath} fill="none" stroke={stroke} strokeWidth={viewport.strokeWidth} strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-200 ease-out" />
        {coords.map((point, idx) => (
          <g key={`${point.date}-${idx}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r={idx === selectedIndex ? viewport.selectedRadius : viewport.pointRadius}
              fill={idx === selectedIndex ? '#f8fafc' : pointColor(idx)}
              stroke={pointColor(idx)}
              strokeWidth="2"
              className="cursor-pointer transition-all duration-150 ease-out"
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => setActiveIndex(idx)}
            />
            <circle
              cx={point.x}
              cy={point.y}
              r="13"
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => setActiveIndex(idx)}
            />
          </g>
        ))}
        {selected && (
          <g>
            <line x1={selected.x} x2={selected.x} y1={pad.top} y2={pad.top + chartH} stroke="rgba(248,250,252,0.24)" strokeDasharray="3 5" />
            <circle cx={selected.x} cy={selected.y} r="8" fill="none" stroke="rgba(248,250,252,0.46)" strokeWidth="2" />
            <g>
              <rect
                x={tooltipX}
                y={tooltipY}
                width={tooltipWidth}
                height="58"
                rx="12"
                fill="rgba(15,23,42,0.88)"
                stroke={selectedUp ? 'rgba(110,231,183,0.36)' : 'rgba(252,165,165,0.36)'}
              />
              <text x={tooltipX + 12} y={tooltipY + 19} fill="rgba(226,232,240,0.78)" fontSize="11" fontWeight="700">
                {selected.date || '当前'}
              </text>
              <text x={tooltipX + 12} y={tooltipY + 37} fill="#f8fafc" fontSize="13" fontWeight="800">
                {detailMoney(selected.price, market, market === 'US' ? 3 : 2)}
              </text>
              {selectedDelta != null && (
                <text x={tooltipX + 12} y={tooltipY + 52} fill={selectedUp ? '#6ee7b7' : '#fca5a5'} fontSize="11" fontWeight="800">
                  {selectedDelta >= 0 ? '+' : ''}{detailMoney(selectedDelta, market, market === 'US' ? 3 : 2)}{selectedPct != null ? ` · ${selectedPct >= 0 ? '+' : ''}${selectedPct.toFixed(2)}%` : ''}
                </text>
              )}
            </g>
          </g>
        )}
        {start && (
          <text x={pad.left} y={height - 10} textAnchor="start" fill="rgba(203,213,225,0.75)" fontSize={viewport.yTickSize}>
            {compactDate(start.date)}
          </text>
        )}
        {end && (
          <text x={width - pad.right} y={height - 10} textAnchor="end" fill="rgba(203,213,225,0.75)" fontSize={viewport.yTickSize}>
            {compactDate(end.date)}
          </text>
        )}
      </svg>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
        <span>{rows.length < rangeDays ? `当前仅有 ${rows.length} 个历史点` : `近 ${rangeDays} 天`}</span>
        <span>区间 {detailMoney(min, market, 2)} - {detailMoney(max, market, 2)}</span>
      </div>
    </div>
  );
}

function DetailSellSimulator({ stock, stockAnalysis, market }) {
  const [brokerChannel, setBrokerChannel] = React.useState(stock.brokerChannel || 'futu');
  const [targetProfit, setTargetProfit] = React.useState('');
  const totalShares = Math.floor(Number(stockAnalysis.totalShares) || 0);
  const currentPrice = Number(stock.currentPrice) || 0;
  const breakEven = Number(stockAnalysis.breakEvenPrice) || 0;
  const avgCost = Number(stockAnalysis.avgCost) || 0;

  const [manual, setManual] = React.useState({
    priceMode: 'current',
    priceValue: '',
    sharesMode: 'custom',
    sharesValue: totalShares ? String(totalShares) : '',
  });

  React.useEffect(() => {
    setManual((prev) => ({
      ...prev,
      sharesValue:
        prev.sharesMode === 'custom' && !prev.sharesValue && totalShares
          ? String(totalShares)
          : prev.sharesValue,
    }));
  }, [totalShares]);

  const parsedTarget = React.useMemo(() => {
    const raw = String(targetProfit || '').trim();
    if (!raw) return NaN;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  }, [targetProfit]);

  const targetPlan = React.useMemo(() => {
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0 || totalShares <= 0) return null;
    if (typeof findSellPlanForTargetNetProfit !== 'function') return null;
    return findSellPlanForTargetNetProfit(stock, stockAnalysis, brokerChannel, parsedTarget);
  }, [stock, stockAnalysis, brokerChannel, parsedTarget, totalShares]);

  const resolvedManual = React.useMemo(() => {
    const price =
      typeof resolveManualSellPrice === 'function'
        ? resolveManualSellPrice(manual.priceMode, {
            currentPrice,
            breakEvenPrice: breakEven,
            priceValue: manual.priceValue,
          })
        : Number(manual.priceValue) || currentPrice;
    const rawShares =
      typeof resolveManualSellShares === 'function'
        ? resolveManualSellShares(manual.sharesMode, {
            totalShares,
            sharesValue: manual.sharesValue,
          })
        : Number(manual.sharesValue) || 0;
    const shares =
      typeof clampSellShares === 'function'
        ? clampSellShares(rawShares, totalShares)
        : Math.min(totalShares, rawShares);
    const requestedShares = Math.floor(Number(manual.sharesValue) || 0);
    const sharesCapped =
      manual.sharesMode === 'custom' && requestedShares > totalShares && totalShares > 0;
    return { price, shares, sharesCapped, requestedShares };
  }, [manual, currentPrice, breakEven, totalShares]);

  const manualResult = React.useMemo(() => {
    const { price, shares } = resolvedManual;
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(shares) || shares <= 0) return null;
    return calculateSellSimulation(stock, price, shares, brokerChannel);
  }, [stock, brokerChannel, resolvedManual]);

  const fullAtCurrent = React.useMemo(() => {
    if (!currentPrice || totalShares <= 0) return null;
    return calculateSellSimulation(stock, currentPrice, totalShares, brokerChannel);
  }, [stock, brokerChannel, currentPrice, totalShares]);

  if (!stockAnalysis || totalShares <= 0) {
    return (
      <section className="card mt-3 !p-3 md:mt-4 md:!p-4">
        <h3 className="text-base font-bold text-slate-50 md:text-lg">卖出模拟</h3>
        <div className="mt-2 rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-sm text-amber-100 md:mt-3 md:rounded-2xl md:p-4">
          当前没有有效持仓，暂不能进行卖出模拟。
        </div>
      </section>
    );
  }

  const quickTargets = market === 'US' ? [500, 1000, 5000, 10000] : [1000, 5000, 10000, 50000];
  const priceModeOptions = [
    { id: 'current', label: '现价' },
    { id: 'breakeven', label: '回本线' },
    { id: 'offset_amount', label: '现价±金额' },
    { id: 'offset_percent', label: '现价±%' },
    { id: 'custom', label: '自定义价' },
  ];
  const sharesModeOptions = [
    { id: 'full', label: '全仓' },
    { id: 'half', label: '半仓' },
    { id: 'custom', label: '自定义股数' },
  ];
  const priceVsBreakEven = formatPriceVsBreakEven(currentPrice, breakEven, market);
  const sellPriceVsBreakEven =
    resolvedManual.price > 0 ? formatPriceVsBreakEven(resolvedManual.price, breakEven, market) : null;

  return (
    <section className="card mt-3 !p-3 md:mt-4 md:!p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2 md:mb-3 md:gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-50 md:text-lg">卖出模拟</h3>
          <p className="mt-0.5 text-[10px] text-slate-400 md:text-[11px]">基于持仓与费率估算，不改动实际持仓。</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          渠道
          <select
            value={brokerChannel}
            onChange={(e) => setBrokerChannel(e.target.value)}
            className="rounded-lg border border-white/20 bg-slate-900/80 px-2 py-1 text-xs text-slate-100"
          >
            <option value="futu">富途</option>
            <option value="longbridge">长桥</option>
            <option value="boc">中银</option>
          </select>
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-white/10 bg-slate-950/35 px-3 py-2 text-[11px] text-slate-300">
        <span>持仓 <strong className="text-slate-100">{formatPrice(totalShares, 0)}</strong> 股</span>
        <span className="hidden text-white/15 sm:inline">|</span>
        <span>均价 <strong className="text-slate-100">{detailMoney(avgCost, market, 3)}</strong></span>
        <span className="hidden text-white/15 sm:inline">|</span>
        <span>现价 <strong className="text-cyan-200">{detailMoney(currentPrice, market, 3)}</strong></span>
        <span className="hidden text-white/15 sm:inline">|</span>
        <span>回本线 <strong className="text-amber-200">{breakEven > 0 ? detailMoney(breakEven, market, 3) : '—'}</strong></span>
        {priceVsBreakEven && (
          <>
            <span className="hidden text-white/15 sm:inline">|</span>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${
                priceVsBreakEven.above
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              <span>{priceVsBreakEven.arrow}</span>
              <span>现价{priceVsBreakEven.label}</span>
              <span>{priceVsBreakEven.pctText}</span>
              <span className="text-white/50">({priceVsBreakEven.diffText})</span>
            </span>
          </>
        )}
        <span className="hidden text-white/15 sm:inline">|</span>
        <span>
          全仓净盈{' '}
          <strong
            className={
              fullAtCurrent && fullAtCurrent.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'
            }
          >
            {fullAtCurrent
              ? `${fullAtCurrent.netProfit >= 0 ? '+' : ''}${detailMoney(fullAtCurrent.netProfit, market, 2)}`
              : '—'}
          </strong>
        </span>
      </div>

      <div className="grid items-stretch gap-3 lg:grid-cols-2">
        <div className="flex h-[430px] flex-col overflow-hidden rounded-xl border border-white/12 bg-slate-950/22 p-3">
          <h4 className="shrink-0 text-sm font-semibold text-amber-100">净盈利目标 → 卖出规模</h4>
          <p className="mt-0.5 shrink-0 text-[10px] leading-snug text-slate-500">
            盈利时算最少股数；达不到时反推全仓达标价。
          </p>
          <div className="mt-2 flex shrink-0 flex-wrap gap-1.5">
            {quickTargets.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setTargetProfit(String(amount))}
                className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                  parsedTarget === amount
                    ? 'border-amber-300/70 bg-amber-400/24 text-amber-50'
                    : 'border-white/20 bg-white/[0.06] text-slate-200 hover:bg-white/[0.12]'
                }`}
              >
                {detailMoney(amount, market, 0)}
              </button>
            ))}
          </div>
          <label className="mt-2 block shrink-0 text-[10px] text-slate-500">
            自定义目标净盈利（{market === 'US' ? 'USD' : market === 'CN' ? 'CNY' : 'HKD'}）
          </label>
          <input
            type="number"
            step="1"
            min="0.01"
            inputMode="decimal"
            value={targetProfit}
            onChange={(e) => setTargetProfit(e.target.value)}
            className="w-full shrink-0 rounded-lg border border-white/20 bg-slate-950/40 px-2.5 py-1.5 text-sm text-slate-50 outline-none focus:border-blue-300/60"
            placeholder={`例如 ${quickTargets[0]}`}
          />
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto border-t border-white/10 pt-2">
            {targetPlan ? (
              <div className="space-y-2">
                {targetPlan.planHint && (
                  <p className="text-[10px] leading-relaxed text-slate-400">{targetPlan.planHint}</p>
                )}
                <TargetPlanResultTable plan={targetPlan} market={market} targetAmount={parsedTarget} />
              </div>
            ) : Number.isFinite(parsedTarget) ? (
              <p className="text-[11px] text-rose-300/90">无法测算该目标，请检查持仓与费率设置。</p>
            ) : (
              <p className="text-[11px] text-slate-500">点击快捷金额或输入任意目标净盈利</p>
            )}
          </div>
        </div>

        <div className="flex h-[430px] flex-col overflow-hidden rounded-xl border border-white/12 bg-slate-950/22 p-3">
          <h4 className="shrink-0 text-sm font-semibold text-slate-100">手动卖出测算</h4>
          <div className="mt-2 shrink-0">
            <div className="mb-1 text-[10px] text-slate-500">卖出价格</div>
            <div className="flex flex-wrap gap-1">
              {priceModeOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setManual((prev) => ({ ...prev, priceMode: opt.id }))}
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                    manual.priceMode === opt.id
                      ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-50'
                      : 'border-white/15 bg-white/[0.05] text-slate-300 hover:bg-white/[0.1]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {(manual.priceMode === 'custom' ||
              manual.priceMode === 'offset_amount' ||
              manual.priceMode === 'offset_percent') && (
              <input
                type="number"
                step={manual.priceMode === 'offset_percent' ? '0.1' : '0.001'}
                value={manual.priceValue}
                onChange={(e) => setManual((prev) => ({ ...prev, priceValue: e.target.value }))}
                className="mt-1.5 w-full rounded-lg border border-white/20 bg-slate-950/40 px-2.5 py-1.5 text-sm text-slate-50 outline-none focus:border-blue-300/60"
                placeholder={
                  manual.priceMode === 'custom'
                    ? '卖出价格'
                    : manual.priceMode === 'offset_amount'
                      ? '相对现价±金额'
                      : '相对现价±%'
                }
              />
            )}
          </div>

          <div className="mt-2 shrink-0">
            <div className="mb-1 text-[10px] text-slate-500">卖出股数（上限 {formatPrice(totalShares, 0)}）</div>
            <div className="flex flex-wrap gap-1">
              {sharesModeOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setManual((prev) => ({ ...prev, sharesMode: opt.id }))}
                  className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                    manual.sharesMode === opt.id
                      ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-50'
                      : 'border-white/15 bg-white/[0.05] text-slate-300 hover:bg-white/[0.1]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {(manual.sharesMode === 'custom') && (
              <input
                type="number"
                min="0"
                max={String(totalShares)}
                value={manual.sharesValue}
                onChange={(e) => setManual((prev) => ({ ...prev, sharesValue: e.target.value }))}
                className="mt-1.5 w-full rounded-lg border border-white/20 bg-slate-950/40 px-2.5 py-1.5 text-sm text-slate-50 outline-none focus:border-blue-300/60"
                placeholder="股数"
              />
            )}
            {resolvedManual.sharesCapped && (
              <p className="mt-1 text-[10px] text-amber-200">已限制为最大 {formatPrice(totalShares, 0)} 股</p>
            )}
          </div>

          <div className="mt-2 min-h-0 flex-1 overflow-y-auto border-t border-white/10 pt-2">
            <div className="mb-2 flex gap-4 text-[11px]">
              <span className="text-slate-500">
                测算价{' '}
                <strong className="text-slate-100">
                  {resolvedManual.price > 0 ? detailMoney(resolvedManual.price, market, 3) : '—'}
                </strong>
              </span>
              <span className="text-slate-500">
                股数{' '}
                <strong className="text-slate-100">
                  {resolvedManual.shares > 0 ? `${formatPrice(resolvedManual.shares, 0)}` : '—'}
                </strong>
              </span>
              {sellPriceVsBreakEven && (
                <span
                  className={
                    sellPriceVsBreakEven.above ? 'text-emerald-300' : 'text-rose-300'
                  }
                >
                  {sellPriceVsBreakEven.arrow} 卖出价{sellPriceVsBreakEven.label}{' '}
                  {sellPriceVsBreakEven.pctText}
                </span>
              )}
            </div>
            {manualResult ? (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2">
                <SellSimStat label="成交金额" value={detailMoney(manualResult.grossAmount, market, 2)} />
                <SellSimStat label="手续费" value={detailMoney(manualResult.totalFees, market, 2)} valueClass="text-amber-200" />
                <SellSimStat label="实收净额" value={detailMoney(manualResult.netAmount, market, 2)} />
                <SellSimStat
                  label="净盈亏"
                  value={`${manualResult.netProfit >= 0 ? '+' : ''}${detailMoney(manualResult.netProfit, market, 2)}`}
                  valueClass={manualResult.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}
                  sub={detailPercent(manualResult.profitPercent)}
                />
                <SellSimStat label="剩余持仓" value={`${formatPrice(totalShares - resolvedManual.shares, 0)} 股`} />
                {sellPriceVsBreakEven && (
                  <SellSimStat
                    label="卖出价 vs 回本线"
                    value={`${sellPriceVsBreakEven.arrow} ${sellPriceVsBreakEven.label}`}
                    valueClass={sellPriceVsBreakEven.above ? 'text-emerald-300' : 'text-rose-300'}
                    sub={`${sellPriceVsBreakEven.pctText} · ${sellPriceVsBreakEven.diffText}`}
                  />
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">选择价格与股数后显示测算结果</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function DetailPositionModal({ stock, onClose, onSubmit }) {
  const [channel, setChannel] = React.useState(stock.brokerChannel || 'futu');
  const [form, setForm] = React.useState({
    price: stock.currentPrice ? String(stock.currentPrice) : '',
    shares: '',
    date: new Date().toISOString().split('T')[0],
  });
  const market = normalizeDetailMarket(stock.market);

  const submit = (e) => {
    e.preventDefault();
    const price = Number(form.price);
    const shares = parseInt(form.shares, 10);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(shares) || shares <= 0) return;
    onSubmit({
      id: Date.now().toString(),
      price,
      shares,
      date: form.date,
      brokerChannel: channel,
      enabled: true,
    }, channel);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/20 bg-slate-900/95 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-50">添加持仓</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/[0.08] hover:text-slate-100">×</button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm text-slate-300">
            购入渠道
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="mt-1 w-full rounded-xl border border-white/20 bg-slate-950/50 px-3 py-2 text-slate-50">
              <option value="futu">富途</option>
              <option value="longbridge">长桥</option>
              <option value="boc">中银</option>
            </select>
          </label>
          <label className="block text-sm text-slate-300">
            买入价格 ({market === 'US' ? 'USD' : market === 'CN' ? 'CNY' : 'HKD'})
            <input type="number" step="0.001" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} className="mt-1 w-full rounded-xl border border-white/20 bg-slate-950/50 px-3 py-2 text-slate-50" required />
          </label>
          <label className="block text-sm text-slate-300">
            买入股数
            <input type="number" value={form.shares} onChange={(e) => setForm((p) => ({ ...p, shares: e.target.value }))} className="mt-1 w-full rounded-xl border border-white/20 bg-slate-950/50 px-3 py-2 text-slate-50" required />
          </label>
          <label className="block text-sm text-slate-300">
            买入日期
            <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="mt-1 w-full rounded-xl border border-white/20 bg-slate-950/50 px-3 py-2 text-slate-50" required />
          </label>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn btn-primary flex-1">保存持仓</button>
            <button type="button" onClick={onClose} className="btn btn-secondary">取消</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetailNewsPanel({ stock, newsUrl, onSaveKeywords }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [editingIndex, setEditingIndex] = React.useState(null);
  const [editingValue, setEditingValue] = React.useState('');
  const [generating, setGenerating] = React.useState(false);
  const [keywordMessage, setKeywordMessage] = React.useState('');

  const keywordChips = React.useMemo(() => {
    if (typeof window.ensureStockKeywords === 'function') return window.ensureStockKeywords(stock);
    return Array.isArray(stock.keywords) ? stock.keywords : [];
  }, [stock]);

  const keywords = React.useMemo(() => {
    const out = [];
    if (stock.name && stock.name !== stock.symbol) out.push(stock.name);
    if (stock.symbol) out.push(stock.symbol);
    out.push(...keywordChips);
    return out
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .filter((x, idx, arr) => arr.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === idx);
  }, [stock.symbol, stock.name, keywordChips.join('|')]);

  React.useEffect(() => {
    if ((!Array.isArray(stock.keywords) || stock.keywords.length === 0) && keywordChips.length > 0) {
      onSaveKeywords && onSaveKeywords(keywordChips);
    }
  }, [stock.symbol, stock.market]);

  const parseKeywordResponse = (content) => {
    const raw = String(content || '').trim();
    const cleaned = raw
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    try {
      const data = JSON.parse(cleaned);
      const arr = Array.isArray(data) ? data : data.keywords;
      if (Array.isArray(arr)) return arr;
    } catch (_) {}
    return cleaned
      .replace(/[，、；;\n]/g, ',')
      .split(',')
      .map((x) => x.replace(/^[-*\d.\s]+/, '').trim())
      .filter(Boolean);
  };

  const generateKeywordsByModel = async () => {
    if (generating) return;
    setGenerating(true);
    setKeywordMessage('');
    try {
      const apiBase = getDetailApiBase();
      if (!apiBase) throw new Error('未找到模型 API 地址');
      const modelKey = (() => {
        try {
          return localStorage.getItem('analysis_selected_model_key') || 'model2';
        } catch (_) {
          return 'model2';
        }
      })();
      const system = '你是股票新闻检索关键词助手。只输出 JSON 数组，不要解释。';
      const user = [
        '请根据股票代码和公司名称，生成最适合中文新闻检索的 3-5 个关键词。',
        '要求：',
        '1. 优先包含公司中文简称或最常用中文名。',
        '2. 可包含 2-4 个核心业务、产品、行业或品牌词。',
        '3. 不要包含宽泛词，如 股票、股价、财报、市场。',
        '4. 只返回 JSON 数组，例如 ["美团","外卖","本地生活","即时零售"]。',
        '',
        `股票代码：${stock.symbol || ''}`,
        `市场：${marketName(stock.market)}`,
        `公司名称：${stock.name || stock.nameCn || ''}`,
        `现有关键词：${keywordChips.join('、') || '无'}`,
      ].join('\n');
      const res = await fetch(apiBase + '/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system,
          user,
          stream: false,
          max_tokens: 512,
          temperature: 0.2,
          model_key: modelKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.detail || data.error || '关键词生成失败');
      const generated = parseKeywordResponse(data.content || data.answer || '')
        .map((x) => String(x).trim())
        .filter(Boolean)
        .filter((x, idx, arr) => arr.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === idx)
        .slice(0, 5);
      if (generated.length < 3) throw new Error('模型返回关键词不足，请重试');
      onSaveKeywords && onSaveKeywords(generated);
      setKeywordMessage('');
    } catch (e) {
      setKeywordMessage(e.message || '关键词生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const startEdit = (idx) => {
    setEditingIndex(idx);
    setEditingValue(keywordChips[idx] || '');
  };

  const commitEdit = () => {
    if (editingIndex == null) return;
    const value = editingValue.trim();
    const next = keywordChips.slice();
    if (value) next[editingIndex] = value;
    onSaveKeywords && onSaveKeywords(next);
    setEditingIndex(null);
    setEditingValue('');
  };

  const loadNews = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (typeof window.fetchNewsFromBackend === 'function') {
        const result = await window.fetchNewsFromBackend({
          code: stock.symbol,
          market: marketName(stock.market),
          name: stock.name || '',
          keywords: keywords,
          hours: 72,
        });
        setItems((result.items || []).slice(0, 8));
        return;
      }
      if (typeof fetchRSSFeeds !== 'function') {
        throw new Error('新闻服务未加载');
      }
      const raw = await fetchRSSFeeds(DETAIL_RSS_FEEDS, keywords, 10, false, 72);
      setItems((raw || []).slice(0, 8));
    } catch (e) {
      console.warn('详情页新闻加载失败:', e);
      setError(e && e.message ? e.message : '新闻加载失败');
    } finally {
      setLoading(false);
    }
  }, [keywords, stock]);

  React.useEffect(() => {
    if (keywords.length) loadNews();
  }, [loadNews, keywords.length]);

  return (
    <section className="card mt-3 !p-3 md:mt-4 md:!p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2 md:mb-3 md:gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-50 md:text-lg">相关新闻</h3>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <button
            type="button"
            onClick={generateKeywordsByModel}
            disabled={generating}
            className="btn btn-sm shrink-0 border border-cyan-300/20 bg-cyan-400/10 font-bold text-cyan-100 hover:bg-cyan-400/15 disabled:opacity-50"
          >
            {generating ? '生成中' : keywordChips.length > 0 ? '生成关键词' : 'AI 关键词'}
          </button>
          <button
            type="button"
            onClick={loadNews}
            disabled={loading}
            className="btn btn-secondary btn-sm shrink-0 font-bold disabled:opacity-50"
          >
            {loading ? '加载中' : '刷新'}
          </button>
          <a
            href={newsUrl}
            className="btn btn-sm shrink-0 border border-pink-300/20 bg-pink-400/12 font-bold text-pink-100 hover:bg-pink-400/18"
          >
            更多
          </a>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {keywordChips.length === 0 && <span className="text-xs text-slate-500">暂无关键词</span>}
        {keywordChips.map((kw, idx) => (
          editingIndex === idx ? (
            <input
              key={`${kw}-${idx}-edit`}
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') {
                  setEditingIndex(null);
                  setEditingValue('');
                }
              }}
              className="h-7 w-28 rounded-full border border-cyan-300/40 bg-slate-950/60 px-2.5 text-xs font-semibold text-slate-50 outline-none"
              autoFocus
            />
          ) : (
            <span
              key={`${kw}-${idx}`}
              onDoubleClick={() => startEdit(idx)}
              className="inline-flex cursor-text items-center rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-xs font-semibold text-slate-100 transition-colors hover:border-cyan-300/30 hover:bg-cyan-400/10 hover:text-cyan-100"
            >
              {kw}
            </span>
          )
        ))}
      </div>

      {keywordMessage && <div className="mb-3 rounded-xl border border-amber-300/15 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">{keywordMessage}</div>}

      {loading && <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm text-slate-300">正在获取相关新闻…</div>}
      {!loading && error && (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          {error}，可点击“更多”查看完整新闻工具。
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm text-slate-400">暂无匹配新闻。</div>
      )}
      {!loading && items.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((news, idx) => (
            <a
              key={(news.link || '') + idx}
              href={news.link || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 transition-colors hover:border-pink-300/35 hover:bg-white/[0.1]"
            >
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-pink-300/20 bg-pink-400/10 px-2 py-0.5 text-[11px] font-semibold text-pink-100">
                  {news.sourceName || news.source || '新闻'}
                </span>
                {(news.matchedKeywords || []).slice(0, 3).map((kw) => (
                  <span key={kw} className="rounded-full border border-blue-300/20 bg-blue-400/10 px-2 py-0.5 text-[11px] text-blue-100">{kw}</span>
                ))}
              </div>
              <h4 className="line-clamp-2 text-sm font-bold leading-snug text-slate-50">{cleanDetailText(news.title)}</h4>
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">{cleanDetailText(news.description)}</p>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function DetailReportPanel({ stock, analysisUrl, refreshKey, onDiagnosis }) {
  const [reports, setReports] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  const matchesStock = React.useCallback((item) => {
    if (!item || !item.base_name) return false;
    var inferred = inferDetailReportStock(item.base_name);
    var code = item.stock_code || inferred.stock_code;
    var market = item.market || inferred.market;
    var a = normalizeDetailReportCode(code, market);
    var b = normalizeDetailReportCode(stock.symbol, stock.market);
    return a && b && a === b;
  }, [stock.symbol, stock.market]);

  const enrich = React.useCallback((list) => {
    return (list || [])
      .filter(matchesStock)
      .map((item) => {
        var body = readDetailReportBody(item.base_name);
        return {
          ...item,
          body,
          generated_at: item.generated_at || (body && body.生成时间) || '',
          title: (body && (body.分析主题 || body.title)) || item.base_name,
        };
      })
      .sort((a, b) => String(b.generated_at || '').localeCompare(String(a.generated_at || '')))
      .slice(0, 6);
  }, [matchesStock]);

  const loadReports = React.useCallback(async () => {
    setLoading(true);
    try {
      var cached = readDetailReportCache();
      var merged = cached.slice();
      var apiBase = getDetailApiBase();
      if (apiBase) {
        try {
          var res = await fetch(apiBase + '/api/reports/list');
          var data = await res.json().catch(() => ({}));
          if (res.ok && Array.isArray(data.reports)) {
            var map = {};
            cached.concat(data.reports).forEach((it) => {
              if (it && it.base_name) map[it.base_name] = { ...(map[it.base_name] || {}), ...it };
            });
            merged = Object.keys(map).map((k) => map[k]);
          }
        } catch (e) {
          console.warn('详情页报告列表服务端加载失败，使用本地缓存:', e);
        }
      }
      setReports(enrich(merged));
    } finally {
      setLoading(false);
    }
  }, [enrich]);

  React.useEffect(() => {
    loadReports();
  }, [loadReports, refreshKey]);

  return (
    <section className="card mt-3 overflow-hidden !p-3 md:mt-4 md:!p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2 md:mb-4 md:gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-50 md:text-lg">历史 AI 分析报告</h3>
          <p className="mt-0.5 text-[10px] text-slate-400 md:mt-1 md:text-xs">自动筛选本地缓存和服务端列表中与该股票匹配的报告。</p>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={loadReports} disabled={loading} className="btn btn-secondary btn-sm disabled:opacity-50">
            {loading ? '加载中' : '刷新'}
          </button>
          <a href={analysisUrl} className="btn btn-accent-analysis btn-sm">生成新分析</a>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm text-slate-400">
          暂无该股票的历史报告。生成一次分析后，这里会自动聚合展示。
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {reports.map((report) => {
            var body = report.body || {};
            var summary = body.投资决策摘要 || body.摘要 || body.summary || '';
            return (
              <div
                key={report.base_name}
                className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.085] via-white/[0.045] to-slate-950/35 p-4 shadow-lg shadow-black/10 transition-colors hover:border-cyan-300/30 hover:bg-white/[0.09]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="mb-2 inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">
                      AI Report
                    </div>
                    <h4 className="line-clamp-2 text-sm font-bold leading-snug text-slate-50 group-hover:text-cyan-100">{report.title}</h4>
                    <p className="mt-1 text-xs text-slate-400">{report.generated_at || '时间未知'}</p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => onDiagnosis && onDiagnosis(report)}
                      className="btn btn-secondary btn-sm min-w-[3.4rem]"
                      title="AI 诊断"
                    >
                      AI
                    </button>
                    <a href={analysisUrl} className="btn btn-secondary btn-sm">查看</a>
                  </div>
                </div>
                {summary && (
                  <p className="mt-3 line-clamp-4 border-t border-white/10 pt-3 text-xs leading-relaxed text-slate-300">
                    {typeof summary === 'string' ? summary : JSON.stringify(summary).slice(0, 220)}
                  </p>
                )}
                {!report.body && (
                  <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">仅有报告索引，打开分析页可加载完整报告。</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DetailInlineAnalysis({ stock, onReportDone, className }) {
  const [status, setStatus] = React.useState('');
  const [error, setError] = React.useState('');
  const [running, setRunning] = React.useState(false);

  const pollJob = async (apiBase, jobId) => {
    for (var i = 0; i < 120; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const res = await fetch(apiBase + '/api/analyze/status/' + encodeURIComponent(jobId));
      if (!res.ok) continue;
      const data = await res.json().catch(() => ({}));
      if (data.status === 'done' && data.result) return data.result;
      if (data.status === 'failed') throw new Error(data.error || '分析失败');
      setStatus('分析进行中…');
    }
    throw new Error('分析仍在进行，请稍后刷新历史报告');
  };

  const run = async () => {
    if (running) return;
    setRunning(true);
    setError('');
    setStatus('正在提交分析任务…');
    try {
      const apiBase = getDetailApiBase();
      if (!apiBase) throw new Error('未找到分析 API 地址');
      const marketLabel = marketName(stock.market);
      const modelKey = (() => {
        try {
          return localStorage.getItem('analysis_selected_model_key') || 'model2';
        } catch (_) {
          return 'model2';
        }
      })();
      const body = JSON.stringify({
        stock_code: stock.symbol,
        market: marketLabel === 'A股' ? 'A 股' : marketLabel,
        user_data_notes: stock.name && stock.name !== stock.symbol ? stock.name : null,
        days: 90,
        use_mock: false,
        client_quote: Number(stock.currentPrice) > 0
          ? {
              price: Number(stock.currentPrice),
              change_percent: stock.marketData?.changePercent != null ? Number(stock.marketData.changePercent) : undefined,
              name: stock.name || undefined,
              is_mock: false,
            }
          : null,
        model_key: modelKey,
      });
      const res = await fetch(apiBase + '/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || '提交分析失败');
      }
      const data = await res.json();
      let result = null;
      if (data.sync && data.status === 'done' && data.result) {
        result = data.result;
      } else if (data.job_id) {
        setStatus('分析任务已创建，正在等待结果…');
        result = await pollJob(apiBase, data.job_id);
      } else {
        throw new Error('未返回分析任务 ID');
      }
      if (result && result.base_name) {
        cacheDetailReportBody(result.base_name, result);
        upsertDetailReportFromPayload(result);
        setStatus('分析完成，已写入历史报告');
        onReportDone && onReportDone(result);
      }
    } catch (e) {
      setError(e.message || '分析失败');
      setStatus('');
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <button type="button" onClick={run} disabled={running} className={`btn btn-secondary nav-chip gap-1 disabled:opacity-50 ${className || ''}`}>
        <div className="icon-chart-bar"></div>
        <span>{running ? '分析中…' : '分析'}</span>
      </button>
      {status && <div className="basis-full rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">{status}</div>}
      {error && <div className="basis-full rounded-xl border border-lime-300/20 bg-lime-400/10 px-3 py-2 text-xs text-lime-100">{error}</div>}
    </>
  );
}

function StockDetailApp() {
  const params = React.useMemo(() => new URLSearchParams(window.location.search), []);
  const querySymbol = String(params.get('code') || params.get('symbol') || '').trim().toUpperCase();
  const queryMarket = normalizeDetailMarket(params.get('market') || '');

  const [portfolio, setPortfolio] = React.useState([]);
  const [watchlist, setWatchlist] = React.useState([]);
  const [sessionReady, setSessionReady] = React.useState(false);
  const [showPositionModal, setShowPositionModal] = React.useState(false);
  const [reportRefreshKey, setReportRefreshKey] = React.useState(0);
  const [detailHistory, setDetailHistory] = React.useState([]);
  const [historyRefreshing, setHistoryRefreshing] = React.useState(false);
  const [historyMessage, setHistoryMessage] = React.useState('');
  const [chartMode, setChartMode] = React.useState('kline');

  const stock = React.useMemo(() => {
    const same = (item) => {
      if (!item) return false;
      const symbolMatch = String(item.symbol || '').toUpperCase() === querySymbol;
      const marketMatch = !queryMarket || normalizeDetailMarket(item.market) === queryMarket;
      return symbolMatch && marketMatch;
    };
    const holding = portfolio.find(same);
    const watching = watchlist.find(same);
    if (holding) return { ...holding, detailSource: watching ? 'holding-watch' : 'holding', watchItem: watching || null };
    if (watching) return { ...watching, positions: [], detailSource: 'watch', watchItem: watching };
    return null;
  }, [portfolio, watchlist, querySymbol, queryMarket]);

  React.useEffect(function () {
    var cancelled = false;
    async function loadSession() {
      try {
        var p = [];
        var w = [];
        if (typeof window.loadAppPortfolio === 'function') {
          p = await window.loadAppPortfolio();
        } else if (window.loadPortfolio) {
          p = window.loadPortfolio() || [];
        }
        if (typeof window.loadAppWatchlist === 'function') {
          w = await window.loadAppWatchlist();
        } else if (window.loadWatchlist) {
          w = window.loadWatchlist() || [];
        }
        if (cancelled) return;
        setPortfolio(Array.isArray(p) ? p : []);
        setWatchlist(Array.isArray(w) ? w : []);
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    }
    loadSession();
    return function () {
      cancelled = true;
    };
  }, []);

  React.useEffect(function () {
    if (!window.GuxiaomiChat) return;
    window.GuxiaomiChat.setContext({
      page: 'stock-detail',
      scopeKey: (querySymbol || 'unknown') + '|workbench',
      title: querySymbol ? querySymbol + ' · 详情' : '股票详情',
      stock: null,
      focus: null,
    });
  }, [querySymbol]);

  const loadDetailHistory = React.useCallback(async (options = {}) => {
    if (!stock) return;
    const silent = Boolean(options.silent);
    const local = normalizeDetailHistoryRows(
      Array.isArray(stock.priceHistory) && stock.priceHistory.length
        ? stock.priceHistory
        : (window.loadStockPriceHistory ? window.loadStockPriceHistory(stock.symbol, stock.market) : [])
    );
    var cloudHist = [];
    if (typeof window.loadPriceSnapshotsFromCloud === 'function') {
      try {
        cloudHist = await window.loadPriceSnapshotsFromCloud(stock.symbol, stock.market, 60);
      } catch (_) {}
    }
    var mergedLocal = typeof window.mergePriceHistoryRows === 'function'
      ? window.mergePriceHistoryRows(local, cloudHist)
      : local.concat(cloudHist);
    setDetailHistory(normalizeDetailHistoryRows(mergedLocal));
    if (!silent) {
      setHistoryRefreshing(true);
      setHistoryMessage('');
    }

    if (typeof window.getHistoricalClose30Days !== 'function') {
      if (!silent) setHistoryMessage('历史价格脚本未加载，请刷新页面后重试。');
      setHistoryRefreshing(false);
      return;
    }

    try {
      const positions = Array.isArray(stock.positions) ? stock.positions.filter((pos) => pos && pos.enabled !== false) : [];
      const totalShares = positions.reduce((sum, pos) => sum + (Number(pos.shares) || 0), 0);
      const rows = await window.getHistoricalClose30Days(stock.symbol, normalizeDetailMarket(stock.market), totalShares);
      const remote = normalizeDetailHistoryRows(rows);
      if (!remote.length) {
        const isUS = normalizeDetailMarket(stock.market) === 'US';
        if (!silent) {
          setHistoryMessage(isUS
            ? '暂时无法获取美股历史日线，已保留本地价格点。系统已尝试 Yahoo Finance 与 Alpha Vantage。'
            : '未获取到更多历史价格，当前显示本地已记录价格点。');
        }
        return;
      }
      const map = new Map();
      local.concat(remote).forEach((row) => {
        if (row && row.date) map.set(row.date, row);
      });
      const merged = Array.from(map.values()).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-60);
      setDetailHistory(merged);
      setHistoryMessage(!silent ? `已刷新 ${remote.length} 个历史价格点。` : '');
      if (window.saveStockPriceHistory) window.saveStockPriceHistory(stock.symbol, stock.market, merged);
    } catch (error) {
      console.warn('详情页历史价格获取失败，使用本地缓存:', error);
      if (!silent) setHistoryMessage('历史价格获取失败，当前显示本地已记录价格点。');
    } finally {
      setHistoryRefreshing(false);
    }
  }, [stock]);

  React.useEffect(() => {
    if (!stock) return;
    let cancelled = false;
    setHistoryMessage('');
    loadDetailHistory({ silent: true }).finally(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [loadDetailHistory, stock]);

  const detailMetrics = React.useMemo(function () {
    if (!stock) {
      return {
        market: '',
        current: 0,
        effectiveChangePct: 0,
        analysis: { currentValue: 0, avgCost: 0, totalShares: 0, breakEvenPrice: 0 },
        hasHolding: false,
        watchItem: null,
        history: [],
      };
    }
    const market = normalizeDetailMarket(stock.market);
    const md = stock.marketData || {};
    const current = Number(stock.currentPrice) || Number(md.price) || 0;
    const previousClose = Number(stock.previousClose) || Number(md.previousClose) || 0;
    const change = Number(stock.change);
    const effectiveChange = Number.isFinite(change)
      ? change
      : previousClose > 0 && current > 0
        ? current - previousClose
        : 0;
    const changePct = Number(stock.changePercent);
    const effectiveChangePct = Number.isFinite(changePct)
      ? changePct
      : previousClose > 0
        ? (effectiveChange / previousClose) * 100
        : 0;
    const analysis = calculateStockAnalysis(stock, stock.brokerChannel || 'futu');
    const hasHolding = Array.isArray(stock.positions) && stock.positions.some((p) => p && p.enabled !== false && Number(p.shares) > 0);
    const watchItem = stock.watchItem || (stock.detailSource === 'watch' ? stock : null);
    const history = Array.isArray(detailHistory) && detailHistory.length
      ? detailHistory
      : Array.isArray(stock.priceHistory) && stock.priceHistory.length
        ? stock.priceHistory
        : (window.loadStockPriceHistory ? window.loadStockPriceHistory(stock.symbol, market) : []);
    return {
      market,
      current,
      effectiveChangePct,
      analysis,
      hasHolding,
      watchItem,
      history,
    };
  }, [stock, detailHistory]);

  const openDetailDiagnosis = React.useCallback(function (report) {
    if (!stock || !window.GuxiaomiChatDiagnosis) return;
    const m = detailMetrics;
    window.GuxiaomiChatDiagnosis.openFromStockDetail(stock, {
      currentPrice: m.current,
      changePercent: m.effectiveChangePct,
      analysis: m.analysis,
      hasHolding: m.hasHolding,
      watchItem: m.watchItem,
      watchDays: m.watchItem ? daysSinceDetail(m.watchItem.addedAt) : 0,
      priceHistory: m.history,
      report: report && report.body ? report.body : null,
      reportBaseName: report && report.base_name,
    });
  }, [stock, detailMetrics]);

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        <div className="icon-loader animate-spin text-2xl"></div>
      </div>
    );
  }

  if (!stock) {
    return (
      <div className="min-h-screen px-3 py-6 md:px-6">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/20 bg-white/[0.08] p-6 text-center backdrop-blur-xl">
          <h1 className="text-xl font-bold text-slate-50">没有找到这只股票</h1>
          <p className="mt-2 text-sm text-slate-400">请从首页持仓或关注列表进入详情页。</p>
          <a href="index.html" className="btn btn-primary mt-5">返回首页</a>
        </div>
      </div>
    );
  }

  const market = normalizeDetailMarket(stock.market);
  const md = stock.marketData || {};
  const current = Number(stock.currentPrice) || Number(md.price) || 0;
  const previousClose = Number(stock.previousClose) || Number(md.previousClose) || 0;
  const change = Number(stock.change);
  const effectiveChange = Number.isFinite(change)
    ? change
    : previousClose > 0 && current > 0
      ? current - previousClose
      : 0;
  const changePct = Number(stock.changePercent);
  const effectiveChangePct = Number.isFinite(changePct)
    ? changePct
    : previousClose > 0
      ? (effectiveChange / previousClose) * 100
      : 0;
  const highPrice = Number(md.high) || 0;
  const lowPrice = Number(md.low) || 0;
  const amplitudePct = previousClose > 0 && highPrice > 0 && lowPrice > 0
    ? ((highPrice - lowPrice) / previousClose) * 100
    : 0;
  const positive = effectiveChange >= 0;
  const analysis = calculateStockAnalysis(stock, stock.brokerChannel || 'futu');
  const hasHolding = Array.isArray(stock.positions) && stock.positions.some((p) => p && p.enabled !== false && Number(p.shares) > 0);
  const watchItem = stock.watchItem || (stock.detailSource === 'watch' ? stock : null);
  const isTracked = Boolean(watchItem || hasHolding);
  const history = Array.isArray(detailHistory) && detailHistory.length
    ? detailHistory
    : Array.isArray(stock.priceHistory) && stock.priceHistory.length
    ? stock.priceHistory
    : (window.loadStockPriceHistory ? window.loadStockPriceHistory(stock.symbol, market) : []);
  const watchStartPrice = watchItem
    ? Number(watchItem.watchStartPrice) || (history[0] ? Number(history[0].price) : 0) || current
    : hasHolding
      ? Number(analysis.avgCost) || current
      : 0;
  const watchGain = watchStartPrice > 0 && current > 0 ? current - watchStartPrice : 0;
  const watchGainPct = watchStartPrice > 0 ? (watchGain / watchStartPrice) * 100 : 0;
  const positions = Array.isArray(stock.positions) ? stock.positions.filter((p) => p && p.enabled !== false) : [];
  const newsUrl = buildDetailUrl('news.html', stock);
  const analysisUrl = buildDetailUrl('analysis.html', stock);
  const paipanUrl = buildDetailUrl('ziwei.html', stock);

  const sameStock = (item) => {
    if (!item) return false;
    return String(item.symbol || '').toUpperCase() === String(stock.symbol || '').toUpperCase() &&
      normalizeDetailMarket(item.market) === normalizeDetailMarket(stock.market);
  };

  const persistPortfolio = (next) => {
    setPortfolio(next);
    if (window.savePortfolio) window.savePortfolio(next);
  };

  const persistWatchlist = (next) => {
    setWatchlist(next);
    if (window.saveWatchlist) window.saveWatchlist(next);
  };

  const updateKeywords = (keywords) => {
    const clean = (keywords || []).map((k) => String(k).trim()).filter(Boolean);
    let touchedPortfolio = false;
    const nextPortfolio = portfolio.map((item) => {
      if (!sameStock(item)) return item;
      touchedPortfolio = true;
      return { ...item, keywords: clean };
    });
    if (touchedPortfolio) persistPortfolio(nextPortfolio);
    let touchedWatch = false;
    const nextWatchlist = watchlist.map((item) => {
      if (!sameStock(item)) return item;
      touchedWatch = true;
      return { ...item, keywords: clean };
    });
    if (touchedWatch) persistWatchlist(nextWatchlist);
  };

  const addPositionFromDetail = (position, brokerChannel) => {
    const currentPortfolio = Array.isArray(portfolio) ? portfolio : [];
    const existing = currentPortfolio.find(sameStock);
    const newPosition = {
      ...position,
      id: position.id || Date.now().toString(),
      enabled: true,
    };
    let nextPortfolio;
    if (existing) {
      nextPortfolio = currentPortfolio.map((item) => {
        if (!sameStock(item)) return item;
        return {
          ...item,
          brokerChannel,
          positions: [...(Array.isArray(item.positions) ? item.positions : []), newPosition],
        };
      });
    } else {
      nextPortfolio = currentPortfolio.concat({
        ...stock,
        id: `stock_${Date.now()}`,
        brokerChannel,
        positions: [newPosition],
        source: 'detail',
      });
    }
    persistPortfolio(nextPortfolio);
    setShowPositionModal(false);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/72 backdrop-blur-xl shadow-lg shadow-slate-950/25">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 md:px-6">
          <a href="index.html" className="flex min-w-0 items-center gap-2">
            <img
              src="https://imgus.tangbuy.com/static/images/2025-09-26/e9e9e871b0b2477697e4b59f6da02ab5-17588742994027430860421454933872.png"
              alt="股小蜜 Logo"
              className="h-8 w-8 shrink-0 rounded-xl shadow-lg shadow-slate-900/20 ring-2 ring-white/40 md:h-9 md:w-9"
            />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">股小蜜</p>
              <h1 className="truncate font-display text-base font-bold text-slate-50 md:text-lg">股票详情</h1>
            </div>
          </a>
          <div className="ml-auto flex items-center gap-1 overflow-x-auto">
            <a href="index.html" className="btn btn-secondary nav-chip gap-1 shrink-0">
              <div className="icon-layout-dashboard"></div>
              <span>首页</span>
            </a>
            <a href={paipanUrl} className="btn btn-secondary nav-chip gap-1 shrink-0">
              <div className="icon-sparkles"></div>
              <span>排盘</span>
            </a>
            <a href={newsUrl} className="btn btn-secondary nav-chip gap-1 shrink-0">
              <div className="icon-newspaper"></div>
              <span>新闻</span>
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-3 md:px-6 md:py-6">
        {portfolio.length > 1 && (
          <div className="mb-2 md:mb-3">
            <StockNavigation portfolio={portfolio} />
          </div>
        )}
        <section className="card mb-3 overflow-hidden !p-3 md:mb-4 md:!p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 md:mb-3 md:gap-2">
                <span className="rounded-full border border-blue-300/30 bg-blue-400/12 px-2 py-0.5 text-[10px] font-semibold text-blue-100 md:px-2.5 md:py-1 md:text-xs">{marketName(market)}</span>
                {hasHolding && <span className="rounded-full border border-emerald-300/30 bg-emerald-400/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-100 md:px-2.5 md:py-1 md:text-xs">已持仓</span>}
                {watchItem && <span className="rounded-full border border-amber-300/30 bg-amber-400/12 px-2 py-0.5 text-[10px] font-semibold text-amber-100 md:px-2.5 md:py-1 md:text-xs">已关注 {daysSinceDetail(watchItem.addedAt)} 天</span>}
                {!watchItem && hasHolding && <span className="rounded-full border border-amber-300/30 bg-amber-400/12 px-2 py-0.5 text-[10px] font-semibold text-amber-100 md:px-2.5 md:py-1 md:text-xs">已关注</span>}
              </div>
              <h2 className="flex flex-wrap items-baseline gap-2 text-2xl font-black tracking-tight text-slate-50 md:gap-3 md:text-5xl">
                {stock.symbol}
                {stock.name && stock.name !== stock.symbol && <span className="text-sm font-semibold text-slate-300 md:text-2xl">{stock.name}</span>}
              </h2>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] text-slate-400 md:text-xs">当前价格</div>
              <div className="gx-num mt-0.5 text-2xl font-black tabular-nums text-amber-100 md:mt-1 md:text-5xl">{detailMoney(current, market, market === 'US' ? 3 : 2)}</div>
              <div className={`gx-num mt-0.5 text-xs font-semibold tabular-nums md:mt-1 md:text-sm ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>
                {effectiveChange >= 0 ? '+' : ''}{detailMoney(effectiveChange, market, market === 'US' ? 3 : 2)} · {detailPercent(effectiveChangePct)}
              </div>
            </div>
          </div>
          <div className="mt-3 border-t border-white/10 pt-3 md:mt-5 md:pt-4">
            <div className="grid gap-2 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-3">
              <div className="grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-4">
                <DetailHeaderMetric label="持仓市值" value={hasHolding ? detailMoney(analysis.currentValue, market, 2) : '未持仓'} valueClass="text-slate-50" />
                <DetailHeaderMetric label="浮动盈亏" value={hasHolding ? `${analysis.profit >= 0 ? '+' : ''}${detailMoney(analysis.profit, market, 2)}` : '—'} valueClass={analysis.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'} hint={hasHolding ? detailPercent(analysis.profitPercent) : ''} />
                <DetailHeaderMetric label="平均成本" value={hasHolding ? detailMoney(analysis.avgCost, market, market === 'US' ? 3 : 2) : '—'} hint={hasHolding ? `${formatPrice(analysis.totalShares, 0)} 股` : ''} />
                <DetailHeaderMetric label="跟踪表现" value={isTracked ? `${watchGain >= 0 ? '+' : ''}${detailMoney(watchGain, market, 2)}` : '未跟踪'} valueClass={watchGain >= 0 ? 'text-emerald-300' : 'text-rose-300'} hint={isTracked ? detailPercent(watchGainPct) : ''} />
              </div>
              <div className="flex flex-row gap-1.5 lg:flex-col lg:justify-end">
                <button type="button" onClick={() => setShowPositionModal(true)} className="btn btn-secondary nav-chip justify-center gap-1 lg:w-full">
                  <div className="icon-plus"></div>
                  <span>加仓</span>
                </button>
                <button
                  type="button"
                  onClick={() => openDetailDiagnosis(null)}
                  className="btn btn-secondary nav-chip justify-center gap-1 lg:w-full"
                  title="AI 诊断"
                >
                  <div className="icon-sparkles"></div>
                  <span>AI</span>
                </button>
                <DetailInlineAnalysis stock={stock} onReportDone={() => setReportRefreshKey((v) => v + 1)} className="justify-center gap-1 lg:w-full" />
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-3 lg:grid-cols-12 lg:gap-4">
          <section className="card !p-3 lg:col-span-8 md:!p-4">
            <div className="mb-2 flex items-center justify-between gap-3 md:mb-3">
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-slate-50 md:text-lg">{chartMode === 'kline' ? 'K 线走势' : '价格趋势'}</h3>
                <div className="flex rounded-xl border border-white/10 bg-white/[0.05] p-0.5">
                  {[{ k: 'kline', label: 'K线' }, { k: 'trend', label: '走势' }].map((m) => (
                    <button
                      key={m.k}
                      type="button"
                      onClick={() => setChartMode(m.k)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                        chartMode === m.k ? 'bg-cyan-400/20 text-cyan-100' : 'text-slate-400 hover:bg-white/[0.08] hover:text-slate-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden text-xs text-slate-400 sm:inline">历史日线 / 本地记录</span>
                <button
                  type="button"
                  onClick={() => loadDetailHistory({ silent: false })}
                  disabled={historyRefreshing}
                  className="btn-icon-plain disabled:opacity-50"
                  aria-label="刷新价格趋势"
                  title="刷新价格趋势"
                >
                  <span className={`icon-refresh-cw ${historyRefreshing ? 'animate-spin' : ''}`}></span>
                </button>
              </div>
            </div>
            {chartMode === 'kline' && typeof KLineChart !== 'undefined' ? (
              <KLineChart symbol={stock.symbol} market={market} fallbackHistory={history} currentPrice={current} />
            ) : (
              <DetailSparkline history={history} currentPrice={current} positive={watchGain >= 0 || effectiveChange >= 0} market={market} />
            )}
            {historyMessage && (
              <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs text-slate-300">
                {historyMessage}
              </div>
            )}
          </section>

          <section className="card !p-3 lg:col-span-4 md:!p-4">
            <h3 className="mb-2 text-base font-bold text-slate-50 md:mb-3 md:text-lg">行情快照</h3>
            <div className="grid grid-cols-2 gap-1.5 md:gap-2">
              <DetailMetric label="开盘" value={Number(md.open) > 0 ? detailMoney(md.open, market, 2) : '—'} />
              <DetailMetric label="前收" value={previousClose > 0 ? detailMoney(previousClose, market, 2) : '—'} />
              <DetailMetric label="最高" value={highPrice > 0 ? detailMoney(highPrice, market, 2) : '—'} valueClass="text-emerald-300" />
              <DetailMetric label="最低" value={lowPrice > 0 ? detailMoney(lowPrice, market, 2) : '—'} valueClass="text-rose-300" />
              <DetailMetric label="涨跌额" value={`${effectiveChange >= 0 ? '+' : ''}${detailMoney(effectiveChange, market, market === 'US' ? 3 : 2)}`} valueClass={positive ? 'text-emerald-300' : 'text-rose-300'} />
              <DetailMetric label="涨跌幅" value={detailPercent(effectiveChangePct)} valueClass={positive ? 'text-emerald-300' : 'text-rose-300'} />
              <DetailMetric label="振幅" value={amplitudePct > 0 ? `${amplitudePct.toFixed(2)}%` : '—'} />
              <DetailMetric label="成交量" value={formatCompactVolume(md.volume)} />
            </div>
          </section>
        </div>

        <section className="card mt-3 !p-3 md:mt-4 md:!p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 md:mb-3 md:gap-3">
            <h3 className="text-base font-bold text-slate-50 md:text-lg">持仓批次</h3>
            <span className="text-xs text-slate-400">{positions.length} 笔有效记录</span>
          </div>
          {positions.length === 0 ? (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
              这只股票还没有持仓批次。商业化下一步会把“交易流水”和“快捷加仓”迁入详情页。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-slate-400">
                    <th className="px-3 py-2">日期</th>
                    <th className="px-3 py-2 text-right">买入价</th>
                    <th className="px-3 py-2 text-right">股数</th>
                    <th className="px-3 py-2 text-right">当前价</th>
                    <th className="px-3 py-2 text-right">浮动盈亏</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos, idx) => {
                    const buy = Number(pos.price) || 0;
                    const shares = Number(pos.shares) || 0;
                    const pnl = (current - buy) * shares;
                    const pct = buy > 0 ? ((current / buy) - 1) * 100 : 0;
                    return (
                      <tr key={pos.id || `${pos.date}-${idx}`} className="border-b border-white/5">
                        <td className="px-3 py-3 text-slate-200">{pos.date || '—'}</td>
                        <td className="gx-num px-3 py-3 text-right tabular-nums text-slate-200">{detailMoney(buy, market, market === 'US' ? 3 : 2)}</td>
                        <td className="gx-num px-3 py-3 text-right tabular-nums text-slate-200">{formatPrice(shares, 0)}</td>
                        <td className="gx-num px-3 py-3 text-right tabular-nums text-slate-200">{detailMoney(current, market, market === 'US' ? 3 : 2)}</td>
                        <td className={`gx-num px-3 py-3 text-right font-semibold tabular-nums ${pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {pnl >= 0 ? '+' : ''}{detailMoney(pnl, market, 2)} · {detailPercent(pct)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <DetailNewsPanel stock={stock} newsUrl={newsUrl} onSaveKeywords={updateKeywords} />
        <DetailSellSimulator stock={stock} stockAnalysis={analysis} market={market} />
        <DetailReportPanel stock={stock} analysisUrl={analysisUrl} refreshKey={reportRefreshKey} onDiagnosis={openDetailDiagnosis} />
      </main>
      {showPositionModal && (
        <DetailPositionModal
          stock={stock}
          onClose={() => setShowPositionModal(false)}
          onSubmit={addPositionFromDetail}
        />
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<StockDetailApp />);
