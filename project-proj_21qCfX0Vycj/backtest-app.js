/**
 * 预测回测 · 胜率看板
 * 拉取 /api/backtest/predictions（后端把历史选股预测与真实走势逐条结算），
 * 展示方向命中率 / 策略胜率 / 概率校准 / 分维度拆解 / 个股榜 / 最近结算明细。
 */
(function () {
  'use strict';

  function getApiBase() {
    var injected = String(window.ANALYSIS_API_BASE || '').replace(/\/$/, '');
    if (injected) return injected;
    if (typeof location === 'undefined') return '';
    var host = location.hostname || '';
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8123';
    return String(location.origin || '').replace(/\/$/, '');
  }

  function fmtRate(v) {
    return v == null ? '—' : v + '%';
  }
  function fmtSigned(v) {
    if (v == null) return '—';
    return (v > 0 ? '+' : '') + v + '%';
  }
  function fmtNum(v) {
    if (v == null || !isFinite(Number(v))) return '—';
    var n = Number(v);
    var a = Math.abs(n);
    var d = a > 0 && a < 1 ? 4 : a < 10 ? 3 : 2;
    return n.toFixed(d);
  }
  function rateColor(v) {
    if (v == null) return 'text-slate-400';
    if (v >= 55) return 'text-emerald-300';
    if (v >= 45) return 'text-amber-300';
    return 'text-rose-300';
  }
  function retColor(v) {
    if (v == null || v === 0) return 'text-slate-300';
    return v > 0 ? 'text-emerald-300' : 'text-rose-300';
  }
  function barColor(v) {
    if (v == null) return 'bg-slate-500/40';
    if (v >= 55) return 'bg-emerald-400/70';
    if (v >= 45) return 'bg-amber-400/70';
    return 'bg-rose-400/70';
  }
  function shortDate(s) {
    var str = String(s || '');
    return /^\d{4}-\d{2}-\d{2}/.test(str) ? str.slice(5) : str;
  }

  function inferMarketFromSymbol(symbol) {
    var s = String(symbol || '').trim();
    if (/^\d{6}$/.test(s)) return 'CN';
    if (/^\d{4,5}$/.test(s)) return 'HK';
    if (/^\d+$/.test(s)) return 'HK';
    return 'US';
  }

  function normalizeBacktestMarket(market) {
    var m = String(market || '').trim().toUpperCase();
    if (m === 'US' || m === '美股') return 'US';
    if (m === 'HK' || m === '港股') return 'HK';
    if (m === 'CN' || m === 'A股' || m === 'A') return 'CN';
    return m || '';
  }

  function marketFromRow(row) {
    var m = normalizeBacktestMarket(row && row.market);
    if (m) return m;
    return inferMarketFromSymbol(row && row.symbol);
  }

  function calcReturn(fromPrice, toPrice) {
    var f = Number(fromPrice);
    var t = Number(toPrice);
    if (!isFinite(f) || f <= 0 || !isFinite(t) || t <= 0) return null;
    return Math.round((t - f) / f * 10000) / 100;
  }

  function quoteKey(symbol, market) {
    return String(symbol || '').toUpperCase() + '|' + normalizeBacktestMarket(market);
  }

  function showToast(message, type) {
    var el = document.createElement('div');
    el.className = 'fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-xs font-semibold shadow-lg ' +
      (type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-amber-500/90 text-white');
    el.textContent = message;
    document.body.appendChild(el);
    window.setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      window.setTimeout(function () { el.remove(); }, 300);
    }, 2200);
  }

  function followStock(row) {
    if (!row || !row.symbol) return;
    if (typeof window.addToWatchlist !== 'function') {
      showToast('关注功能未加载，请刷新页面重试', 'error');
      return;
    }
    var market = marketFromRow(row);
    var result = window.addToWatchlist({
      symbol: row.symbol,
      market: market,
      name: row.name || '',
      currentPrice: row.entry || 0,
      previousClose: row.entry || 0,
    });
    if (result && result.success) {
      showToast('已将 ' + row.symbol + ' 加入关注列表', 'success');
    } else {
      showToast(result && result.message ? result.message : '关注失败', 'error');
    }
  }

  function FollowButton(props) {
    var row = props.row;
    return React.createElement(
      'button',
      {
        type: 'button',
        onClick: function () { followStock(row); },
        title: '加入关注列表',
        className: 'inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/[0.06] px-2 py-1 text-[11px] font-semibold text-slate-200 transition-colors hover:bg-white/10 hover:text-white',
      },
      React.createElement('span', { className: 'icon-star', 'aria-hidden': true }),
      '关注'
    );
  }

  function KpiCard(props) {
    return React.createElement(
      'div',
      { className: 'kpi flex flex-col gap-1' },
      React.createElement(
        'div',
        { className: 'flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400' },
        props.icon && React.createElement('span', { className: props.icon + ' text-xs', 'aria-hidden': true }),
        props.label
      ),
      React.createElement('div', { className: 'gx-num text-2xl font-extrabold tabular-nums md:text-3xl ' + (props.valueClass || 'text-slate-50') }, props.value),
      props.hint && React.createElement('div', { className: 'text-[11px] text-slate-500' }, props.hint)
    );
  }

  function ProbBar(props) {
    var r = props.row;
    var w = r.hit_rate == null ? 0 : Math.max(2, Math.min(100, r.hit_rate));
    return React.createElement(
      'div',
      { className: 'flex items-center gap-2.5' },
      React.createElement('div', { className: 'w-16 shrink-0 text-xs font-semibold text-slate-200' }, r.label),
      React.createElement(
        'div',
        { className: 'relative h-5 flex-1 overflow-hidden rounded-md bg-white/[0.06]' },
        React.createElement('div', {
          className: 'absolute inset-y-0 left-0 rounded-md transition-all ' + barColor(r.hit_rate),
          style: { width: w + '%' },
        })
      ),
      React.createElement(
        'div',
        { className: 'w-24 shrink-0 text-right text-xs' },
        r.count === 0
          ? React.createElement('span', { className: 'text-slate-500' }, '无样本')
          : React.createElement(
              React.Fragment,
              null,
              React.createElement('span', { className: 'gx-num font-bold tabular-nums ' + rateColor(r.hit_rate) }, fmtRate(r.hit_rate)),
              React.createElement('span', { className: 'ml-1 text-slate-500' }, '·' + r.count)
            )
      )
    );
  }

  function DimTable(props) {
    return React.createElement(
      'div',
      { className: 'card !p-3 md:!p-4' },
      React.createElement(
        'div',
        { className: 'mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-100' },
        props.icon && React.createElement('span', { className: props.icon + ' text-slate-400', 'aria-hidden': true }),
        props.title
      ),
      React.createElement(
        'div',
        { className: 'overflow-x-auto' },
        React.createElement(
          'table',
          { className: 'w-full text-xs md:text-sm' },
          React.createElement(
            'thead',
            { className: 'text-left text-slate-400' },
            React.createElement(
              'tr',
              null,
              React.createElement('th', { className: 'py-1 pr-2 font-medium' }, props.dimLabel),
              React.createElement('th', { className: 'py-1 px-2 text-right font-medium' }, '样本'),
              React.createElement('th', { className: 'py-1 px-2 text-right font-medium' }, '命中率'),
              React.createElement('th', { className: 'py-1 px-2 text-right font-medium' }, '胜率'),
              React.createElement('th', { className: 'py-1 pl-2 text-right font-medium' }, '均收益')
            )
          ),
          React.createElement(
            'tbody',
            null,
            (props.rows || []).map(function (r, i) {
              return React.createElement(
                'tr',
                { key: i, className: 'border-t border-white/8 text-slate-200' },
                React.createElement('td', { className: 'py-1.5 pr-2 font-semibold text-slate-100' }, r.label),
                React.createElement('td', { className: 'gx-num py-1.5 px-2 text-right tabular-nums text-slate-300' }, r.count),
                React.createElement('td', { className: 'gx-num py-1.5 px-2 text-right tabular-nums font-semibold ' + rateColor(r.hit_rate) }, fmtRate(r.hit_rate)),
                React.createElement('td', { className: 'gx-num py-1.5 px-2 text-right tabular-nums ' + rateColor(r.win_rate) }, fmtRate(r.win_rate)),
                React.createElement('td', { className: 'gx-num py-1.5 pl-2 text-right tabular-nums ' + retColor(r.avg_strategy) }, fmtSigned(r.avg_strategy))
              );
            })
          )
        )
      )
    );
  }

  function LivePriceCell(props) {
    var q = props.quote;
    if (!q || q.price == null) {
      return React.createElement('span', { className: 'text-[11px] text-slate-500' }, '—');
    }
    var price = Number(q.price);
    return React.createElement(
      'div',
      { className: 'flex flex-col items-end leading-tight' },
      React.createElement('span', { className: 'gx-num font-semibold tabular-nums text-slate-200' }, fmtNum(price)),
      q.changePercent != null && React.createElement('span', { className: 'gx-num text-[10px] tabular-nums ' + retColor(Number(q.changePercent)) }, fmtSigned(Number(q.changePercent)))
    );
  }

  function ReturnCell(props) {
    var v = props.value;
    if (v == null || !isFinite(v)) {
      return React.createElement('span', { className: 'text-[11px] text-slate-500' }, '—');
    }
    return React.createElement('span', { className: 'gx-num tabular-nums font-semibold ' + retColor(v) }, fmtSigned(v));
  }

  function LeaderTable(props) {
    if (!props.rows || !props.rows.length) return null;
    var quotes = props.quotes || {};
    return React.createElement(
      'div',
      { className: 'flex-1' },
      React.createElement('div', { className: 'mb-1.5 text-xs font-semibold ' + props.titleClass }, props.title),
      React.createElement(
        'div',
        { className: 'overflow-x-auto rounded-xl border border-white/10 bg-slate-950/20' },
        React.createElement(
          'table',
          { className: 'w-full text-xs md:text-sm' },
          React.createElement(
            'thead',
            { className: 'text-left text-slate-400' },
            React.createElement(
              'tr',
              null,
              React.createElement('th', { className: 'p-2 font-medium' }, '标的'),
              React.createElement('th', { className: 'p-2 text-right font-medium' }, '样本'),
              React.createElement('th', { className: 'p-2 text-right font-medium' }, '命中率'),
              React.createElement('th', { className: 'p-2 text-right font-medium' }, '均策略收益'),
              React.createElement('th', { className: 'hidden p-2 text-right font-medium md:table-cell' }, '最新价'),
              React.createElement('th', { className: 'hidden p-2 text-right font-medium md:table-cell' }, '买入至今'),
              React.createElement('th', { className: 'hidden p-2 text-right font-medium md:table-cell' }, '结算至今'),
              React.createElement('th', { className: 'p-2 text-center font-medium' }, '操作')
            )
          ),
          React.createElement(
            'tbody',
            null,
            props.rows.map(function (r, i) {
              var q = quotes[quoteKey(r.symbol, r.market)];
              var entryToNow = q && q.price != null ? calcReturn(r.entry, q.price) : null;
              var targetToNow = q && q.price != null ? calcReturn(r.target, q.price) : null;
              return React.createElement(
                'tr',
                { key: i, className: 'border-t border-white/8 text-slate-200' },
                React.createElement(
                  'td',
                  { className: 'p-2' },
                  React.createElement('span', { className: 'font-semibold text-slate-50' }, r.symbol),
                  r.name && r.name !== r.symbol
                    ? React.createElement('span', { className: 'ml-1 text-[11px] text-slate-500' }, r.name.length > 8 ? r.name.slice(0, 8) : r.name)
                    : null
                ),
                React.createElement('td', { className: 'gx-num p-2 text-right tabular-nums text-slate-300' }, r.count),
                React.createElement('td', { className: 'gx-num p-2 text-right tabular-nums font-semibold ' + rateColor(r.hit_rate) }, fmtRate(r.hit_rate)),
                React.createElement('td', { className: 'gx-num p-2 text-right tabular-nums font-bold ' + retColor(r.avg_strategy) }, fmtSigned(r.avg_strategy)),
                React.createElement('td', { className: 'hidden p-2 text-right md:table-cell' }, React.createElement(LivePriceCell, { quote: q })),
                React.createElement('td', { className: 'hidden p-2 text-right md:table-cell' }, React.createElement(ReturnCell, { value: entryToNow })),
                React.createElement('td', { className: 'hidden p-2 text-right md:table-cell' }, React.createElement(ReturnCell, { value: targetToNow })),
                React.createElement('td', { className: 'p-2 text-center' }, React.createElement(FollowButton, { row: r }))
              );
            })
          )
        )
      )
    );
  }

  function LiveValidationTable(props) {
    var rows = props.rows || [];
    var quotes = props.quotes || {};
    if (!rows.length) return null;
    return React.createElement(
      'div',
      { className: 'card mb-4 !p-4 md:!p-5' },
      React.createElement(
        'div',
        { className: 'mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-100' },
        React.createElement('span', { className: 'icon-activity text-sky-400', 'aria-hidden': true }),
        '阶段一 · 实时行情验证'
      ),
      React.createElement('p', { className: 'mb-3 text-[11px] text-slate-500' }, '把回测中的“买入价 / 结算价”与最新真实行情对比，看表现最好的股票现在是否还在涨。'),
      React.createElement(
        'div',
        { className: 'overflow-x-auto' },
        React.createElement(
          'table',
          { className: 'w-full min-w-[680px] text-xs md:text-sm' },
          React.createElement(
            'thead',
            { className: 'text-left text-slate-400' },
            React.createElement(
              'tr',
              null,
              React.createElement('th', { className: 'p-2 font-medium' }, '标的'),
              React.createElement('th', { className: 'p-2 text-right font-medium' }, '最新价'),
              React.createElement('th', { className: 'p-2 text-right font-medium' }, '信号买入价'),
              React.createElement('th', { className: 'p-2 text-right font-medium' }, '买入至今'),
              React.createElement('th', { className: 'p-2 text-right font-medium' }, '信号结算价'),
              React.createElement('th', { className: 'p-2 text-right font-medium' }, '结算至今'),
              React.createElement('th', { className: 'p-2 text-center font-medium' }, '操作')
            )
          ),
          React.createElement(
            'tbody',
            null,
            rows.map(function (r, i) {
              var q = quotes[quoteKey(r.symbol, r.market)];
              var entryToNow = q && q.price != null ? calcReturn(r.entry, q.price) : null;
              var targetToNow = q && q.price != null ? calcReturn(r.target, q.price) : null;
              return React.createElement(
                'tr',
                { key: i, className: 'border-t border-white/8 text-slate-200 hover:bg-white/[0.05]' },
                React.createElement(
                  'td',
                  { className: 'p-2' },
                  React.createElement('span', { className: 'font-semibold text-slate-50' }, r.symbol),
                  r.name && r.name !== r.symbol
                    ? React.createElement('span', { className: 'ml-1 text-[11px] text-slate-500' }, r.name.length > 10 ? r.name.slice(0, 10) : r.name)
                    : null
                ),
                React.createElement('td', { className: 'p-2 text-right' }, React.createElement(LivePriceCell, { quote: q })),
                React.createElement('td', { className: 'gx-num p-2 text-right tabular-nums text-slate-300' }, fmtNum(r.entry)),
                React.createElement('td', { className: 'p-2 text-right' }, React.createElement(ReturnCell, { value: entryToNow })),
                React.createElement('td', { className: 'gx-num p-2 text-right tabular-nums text-slate-300' }, fmtNum(r.target)),
                React.createElement('td', { className: 'p-2 text-right' }, React.createElement(ReturnCell, { value: targetToNow })),
                React.createElement('td', { className: 'p-2 text-center' }, React.createElement(FollowButton, { row: r }))
              );
            })
          )
        )
      )
    );
  }

  function RecentTable(props) {
    var rows = props.rows || [];
    if (!rows.length) return null;
    var headers = props.headers || { tag: '周期', strength: '概率' };
    var cols = ['结算日', '标的', headers.tag, '方向', headers.strength, '买入→结算', '实际', '策略', '命中', '操作'];
    return React.createElement(
      'div',
      { className: 'overflow-x-auto' },
      React.createElement(
        'table',
        { className: 'w-full min-w-[760px] text-xs md:text-sm' },
        React.createElement(
          'thead',
          { className: 'sticky top-0 bg-slate-950/85 text-left text-slate-400 backdrop-blur' },
          React.createElement(
            'tr',
            null,
            cols.map(function (h, i) {
              return React.createElement('th', { key: i, className: 'p-2 font-medium ' + (i >= 4 ? 'text-right' : '') }, h);
            })
          )
        ),
        React.createElement(
          'tbody',
          null,
          rows.map(function (r, i) {
            var bullish = r.trend === '看涨' || r.trend === '看多';
            var trendCls = bullish ? 'text-emerald-200 bg-emerald-500/10' : 'text-rose-200 bg-rose-500/10';
            return React.createElement(
              'tr',
              { key: i, className: 'border-t border-white/8 text-slate-200 hover:bg-white/[0.05]' },
              React.createElement('td', { className: 'gx-num p-2 tabular-nums text-slate-400' }, shortDate(r.target_date)),
              React.createElement(
                'td',
                { className: 'p-2' },
                React.createElement('span', { className: 'font-semibold text-slate-50' }, r.symbol),
                r.name && r.name !== r.symbol
                  ? React.createElement('span', { className: 'ml-1 text-[11px] text-slate-500' }, r.name.length > 10 ? r.name.slice(0, 10) : r.name)
                  : null
              ),
              React.createElement('td', { className: 'p-2 text-slate-300' }, r.tag),
              React.createElement('td', { className: 'p-2' }, React.createElement('span', { className: 'rounded px-1.5 py-0.5 text-[11px] font-semibold ' + trendCls }, r.trend)),
              React.createElement('td', { className: 'gx-num p-2 text-right tabular-nums text-cyan-200' }, r.strength == null ? '—' : r.strength),
              React.createElement('td', { className: 'gx-num p-2 text-right tabular-nums text-slate-300' }, fmtNum(r.entry) + ' → ' + fmtNum(r.target)),
              React.createElement('td', { className: 'gx-num p-2 text-right tabular-nums ' + retColor(r.ret) }, fmtSigned(r.ret)),
              React.createElement('td', { className: 'gx-num p-2 text-right tabular-nums font-semibold ' + retColor(r.strat) }, fmtSigned(r.strat)),
              React.createElement(
                'td',
                { className: 'p-2 text-right' },
                r.hit
                  ? React.createElement('span', { className: 'icon-check text-emerald-400', 'aria-label': '命中' })
                  : React.createElement('span', { className: 'icon-x text-rose-400', 'aria-label': '未命中' })
              ),
              React.createElement('td', { className: 'p-2 text-center' }, React.createElement(FollowButton, { row: r }))
            );
          })
        )
      )
    );
  }

  function StreakCard(props) {
    var rows = props.rows || [];
    var quotes = props.quotes || {};
    if (!rows.length) return null;
    return React.createElement(
      'div',
      { className: 'card mb-4 !p-4 md:!p-5' },
      React.createElement(
        'div',
        { className: 'mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-100' },
        React.createElement('span', { className: 'icon-flame text-amber-400', 'aria-hidden': true }),
        '连续命中榜'
      ),
      React.createElement('p', { className: 'mb-3 text-[11px] text-slate-500' }, '同一方向、按时间连续命中的最长连击（连涨 = 连续预测看涨且都涨）。'),
      React.createElement(
        'div',
        { className: 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3' },
        rows.map(function (r, i) {
          var bull = r.direction === 'bull';
          var dirLabel = bull ? '连涨' : '连跌';
          var dirCls = bull ? 'text-emerald-300 bg-emerald-500/10 border-emerald-400/30' : 'text-rose-300 bg-rose-500/10 border-rose-400/30';
          var live = r.current >= 2 && r.current_direction === r.direction;
          var q = quotes[quoteKey(r.symbol, r.market)];
          var liveReturn = q && q.price != null && r.entry ? calcReturn(r.entry, q.price) : null;
          return React.createElement(
            'div',
            { key: i, className: 'flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/30 p-2.5' },
            React.createElement(
              'div',
              { className: 'flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border ' + dirCls },
              React.createElement('span', { className: 'gx-num text-lg font-extrabold leading-none tabular-nums' }, r.streak),
              React.createElement('span', { className: 'text-[9px] leading-none' }, '连')
            ),
            React.createElement(
              'div',
              { className: 'min-w-0 flex-1' },
              React.createElement(
                'div',
                { className: 'flex items-center gap-1.5' },
                React.createElement('span', { className: 'truncate font-semibold text-slate-50' }, r.symbol),
                React.createElement('span', { className: 'rounded px-1 py-0.5 text-[10px] font-semibold ' + dirCls }, dirLabel),
                live && React.createElement('span', { className: 'rounded bg-amber-400/15 px-1 py-0.5 text-[10px] font-semibold text-amber-300' }, '进行中 ' + r.current)
              ),
              React.createElement(
                'div',
                { className: 'mt-0.5 truncate text-[11px] text-slate-500' },
                (r.name && r.name !== r.symbol ? r.name + ' · ' : '') + '共 ' + r.total + ' 次预测' + (r.end ? ' · 至 ' + shortDate(r.end) : '')
              ),
              liveReturn != null && React.createElement(
                'div',
                { className: 'mt-1 flex items-center gap-1.5 text-[11px]' },
                React.createElement('span', { className: 'text-slate-500' }, '买入至今'),
                React.createElement('span', { className: 'gx-num font-semibold tabular-nums ' + retColor(liveReturn) }, fmtSigned(liveReturn))
              )
            )
          );
        })
      )
    );
  }

  function ScopeTabs(props) {
    var scopes = props.scopes || {};
    return React.createElement(
      'div',
      { className: 'inline-flex rounded-xl border border-white/10 bg-slate-950/40 p-0.5' },
      [
        { id: 'prediction', label: '预测信号', icon: 'icon-crosshair' },
        { id: 'report', label: '研报信号', icon: 'icon-file-text' },
      ].map(function (t) {
        var sc = scopes[t.id] || {};
        var active = props.active === t.id;
        var n = (sc.counts && sc.counts.resolved) || 0;
        return React.createElement(
          'button',
          {
            key: t.id,
            type: 'button',
            onClick: function () { props.onChange(t.id); },
            className: 'inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-semibold transition md:text-sm ' +
              (active ? 'bg-indigo-500/90 text-white shadow' : 'text-slate-300 hover:bg-white/5'),
          },
          React.createElement('span', { className: t.icon, 'aria-hidden': true }),
          t.label,
          React.createElement(
            'span',
            { className: 'gx-num rounded-full px-1.5 text-[10px] tabular-nums ' + (active ? 'bg-white/20' : 'bg-white/10 text-slate-400') },
            n
          )
        );
      })
    );
  }

  function BacktestApp() {
    var st = React.useState(null);
    var data = st[0];
    var setData = st[1];
    var ls = React.useState(true);
    var loading = ls[0];
    var setLoading = ls[1];
    var es = React.useState('');
    var err = es[0];
    var setErr = es[1];
    var rs = React.useState(false);
    var refreshing = rs[0];
    var setRefreshing = rs[1];
    var scs = React.useState('prediction');
    var scope = scs[0];
    var setScope = scs[1];
    var lqs = React.useState({});
    var liveQuotes = lqs[0];
    var setLiveQuotes = lqs[1];
    var lls = React.useState(false);
    var liveLoading = lls[0];
    var setLiveLoading = lls[1];
    var les = React.useState('');
    var liveErr = les[0];
    var setLiveErr = les[1];

    var load = React.useCallback(function (refresh) {
      var base = getApiBase();
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setErr('');
      var url = base + '/api/backtest/predictions' + (refresh ? '?refresh=1' : '');
      fetch(url)
        .then(function (r) {
          return r.json();
        })
        .then(function (j) {
          if (j && j.ok) setData(j);
          else setErr((j && j.error) || '回测计算失败');
        })
        .catch(function (e) {
          setErr('请求失败：' + (e && e.message ? e.message : e));
        })
        .then(function () {
          setLoading(false);
          setRefreshing(false);
        });
    }, []);

    var fetchLiveQuotes = React.useCallback(function (rows) {
      if (!rows || !rows.length) return;
      if (typeof window.getStockPrice !== 'function') {
        setLiveErr('实时行情接口未加载');
        return;
      }
      setLiveLoading(true);
      setLiveErr('');
      var tasks = rows.map(function (r) {
        var market = marketFromRow(r);
        return window.getStockPrice(r.symbol, market)
          .then(function (q) {
            return { key: quoteKey(r.symbol, r.market), ok: true, quote: q, symbol: r.symbol, market: market };
          })
          .catch(function (e) {
            return { key: quoteKey(r.symbol, r.market), ok: false, error: e && e.message ? e.message : String(e), symbol: r.symbol, market: market };
          });
      });
      Promise.allSettled(tasks).then(function (results) {
        var next = {};
        var failed = 0;
        results.forEach(function (res) {
          if (res.status !== 'fulfilled') return;
          var r = res.value;
          if (r.ok && r.quote) {
            next[r.key] = r.quote;
          } else {
            failed += 1;
            console.warn('回测实时行情失败:', r.symbol, r.error);
          }
        });
        setLiveQuotes(function (prev) { return Object.assign({}, prev, next); });
        if (failed > 0 && Object.keys(next).length === 0) {
          setLiveErr(failed + ' 只标的未能获取实时行情');
        }
        setLiveLoading(false);
      });
    }, []);

    React.useEffect(function () {
      load(false);
    }, [load]);

    React.useEffect(function () {
      if (!data) return;
      var sc = (data.scopes || {})[scope] || {};
      var leaders = (sc.leaders || {});
      var streaks = sc.streaks || [];
      var rows = []
        .concat(leaders.best || [])
        .concat(leaders.worst || [])
        .concat(streaks);
      // 去重
      var seen = {};
      var unique = [];
      rows.forEach(function (r) {
        var k = quoteKey(r.symbol, r.market);
        if (!seen[k]) {
          seen[k] = true;
          unique.push(r);
        }
      });
      if (unique.length) {
        fetchLiveQuotes(unique);
      }
    }, [data, scope, fetchLiveQuotes]);

    var scopes = (data && data.scopes) || {};
    var sc = scopes[scope] || {};
    var counts = sc.counts || {};
    var overall = sc.overall || {};
    var calibration = sc.calibration || {};
    var hasResolved = (counts.resolved || 0) > 0;
    var isReport = scope === 'report';

    return React.createElement(
      'div',
      { className: 'mx-auto max-w-6xl px-3 py-4 md:px-6 md:py-6' },
      // 顶部栏
      React.createElement(
        'div',
        { className: 'mb-4 flex flex-wrap items-center justify-between gap-3' },
        React.createElement(
          'div',
          null,
          React.createElement('h1', { className: 'font-display text-xl font-extrabold text-slate-50 md:text-2xl' }, '回测 · 命中率 / 胜率看板'),
          React.createElement('p', { className: 'mt-0.5 text-xs text-slate-400 md:text-sm' }, '把历史「预测」与「研报」逐条与真实走势结算，量化模型到底「说得准不准」')
        ),
        React.createElement('div', { className: 'flex flex-wrap items-center gap-2' },
            React.createElement('a', { href: 'index.html', className: 'btn btn-secondary btn-sm gap-1' }, React.createElement('span', { className: 'icon-home', 'aria-hidden': true }), '首页'),
            React.createElement('a', { href: 'analysis.html', className: 'btn btn-secondary btn-sm gap-1' }, React.createElement('span', { className: 'icon-chart-bar', 'aria-hidden': true }), '分析'),
            React.createElement('a', { href: 'ziwei.html', className: 'btn btn-secondary btn-sm gap-1' }, React.createElement('span', { className: 'icon-sparkles', 'aria-hidden': true }), '排盘'),
            React.createElement('a', { href: 'news.html', className: 'btn btn-secondary btn-sm gap-1' }, React.createElement('span', { className: 'icon-newspaper', 'aria-hidden': true }), '新闻'),
            React.createElement('a', { href: 'analysis.html', className: 'btn btn-secondary btn-sm gap-1' }, React.createElement('span', { className: 'icon-arrow-left', 'aria-hidden': true }), '返回分析'),
            React.createElement(
              'button',
            {
              type: 'button',
              className: 'btn btn-primary btn-sm gap-1 disabled:opacity-50',
              onClick: function () { load(true); },
              disabled: loading || refreshing,
            },
            React.createElement('span', { className: 'icon-refresh-cw ' + (refreshing ? 'animate-spin' : ''), 'aria-hidden': true }),
            refreshing ? '重新结算…' : '刷新回测'
          )
        )
      ),

      // 加载/错误
      loading &&
        React.createElement(
          'div',
          { className: 'card flex items-center justify-center gap-2 py-16 text-slate-300' },
          React.createElement('span', { className: 'icon-loader-2 animate-spin', 'aria-hidden': true }),
          '正在结算历史预测与研报…（首次需拉取真实行情，约 10–30 秒）'
        ),
      !loading && err &&
        React.createElement(
          'div',
          { className: 'card border-rose-400/30 bg-rose-500/10 py-6 text-center text-sm text-rose-200' },
          err
        ),

      !loading && !err && data &&
        React.createElement(
          React.Fragment,
          null,
          // 信号类型切换
          React.createElement(
            'div',
            { className: 'mb-3' },
            React.createElement(ScopeTabs, { scopes: scopes, active: scope, onChange: setScope })
          ),

          // 覆盖度摘要
          React.createElement(
            'div',
            { className: 'mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 md:text-xs' },
            React.createElement('span', null, '已结算 ', React.createElement('b', { className: 'text-slate-200' }, counts.resolved || 0), ' 条'),
            React.createElement('span', null, '待结算 ', React.createElement('b', { className: 'text-slate-300' }, counts.pending || 0)),
            React.createElement('span', null, '无行情 ', React.createElement('b', { className: 'text-slate-300' }, counts.no_data || 0)),
            isReport && counts.neutral != null && React.createElement('span', null, '中性略过 ', React.createElement('b', { className: 'text-slate-300' }, counts.neutral)),
            React.createElement('span', null, '覆盖标的 ', React.createElement('b', { className: 'text-slate-300' }, data.symbols_fetched + '/' + data.symbols_total)),
            data.computed_at && React.createElement('span', null, '结算于 ', React.createElement('b', { className: 'text-slate-300' }, String(data.computed_at).replace('T', ' ').slice(5, 16))),
            !data.db_enabled && React.createElement('span', { className: 'text-amber-300' }, '· 未连数据库，读取本地文件')
          ),

          sc.horizon_note &&
            React.createElement(
              'div',
              { className: 'mb-3 flex items-start gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400' },
              React.createElement('span', { className: 'icon-info mt-0.5 shrink-0 text-slate-500', 'aria-hidden': true }),
              sc.horizon_note
            ),

          !hasResolved
            ? React.createElement(
                'div',
                { className: 'card py-12 text-center' },
                React.createElement('div', { className: 'icon-target mx-auto mb-2 text-3xl text-slate-500', 'aria-hidden': true }),
                React.createElement('div', { className: 'mb-1 text-sm font-semibold text-slate-200' }, isReport ? '暂无可结算的研报' : '暂无可结算的预测'),
                React.createElement(
                  'div',
                  { className: 'mx-auto max-w-md text-xs leading-relaxed text-slate-400' },
                  isReport
                    ? '研报回测需要「历史研报」+「研报生成约 1 个月后的真实行情」。多生成几篇个股研报、待时间走完后再回来查看。仅 A 股 / 港股 / 美股个股可结算。'
                    : '回测需要「历史预测」+「已走完预测周期的真实行情」。请到分析页的股票预测区多获取几批预测快照，待其周期（日/周/月）走完后再回来查看。'
                ),
                React.createElement('a', { href: 'analysis.html', className: 'btn btn-secondary btn-sm mt-4 inline-flex' }, isReport ? '去生成研报' : '去获取预测')
              )
            : React.createElement(
                React.Fragment,
                null,
                // 核心 KPI
                React.createElement(
                  'div',
                  { className: 'mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3' },
                  React.createElement(KpiCard, {
                    icon: 'icon-crosshair',
                    label: '方向命中率',
                    value: fmtRate(overall.hit_rate),
                    valueClass: rateColor(overall.hit_rate),
                    hint: '看对涨/跌方向的比例',
                  }),
                  React.createElement(KpiCard, {
                    icon: 'icon-trophy',
                    label: '策略胜率',
                    value: fmtRate(overall.win_rate),
                    valueClass: rateColor(overall.win_rate),
                    hint: '跟随信号盈利的比例',
                  }),
                  React.createElement(KpiCard, {
                    icon: 'icon-trending-up',
                    label: '平均策略收益',
                    value: fmtSigned(overall.avg_strategy),
                    valueClass: retColor(overall.avg_strategy),
                    hint: '每笔跟随信号的平均收益',
                  }),
                  React.createElement(KpiCard, {
                    icon: 'icon-database',
                    label: '已结算样本',
                    value: String(overall.count || 0),
                    valueClass: 'text-slate-50',
                    hint: '共 ' + (counts.total || 0) + (isReport ? ' 篇研报' : ' 条预测'),
                  })
                ),

                // 校准（概率 / 信号强度）
                (calibration.buckets && calibration.buckets.length) &&
                  React.createElement(
                    'div',
                    { className: 'card mb-4 !p-4 md:!p-5' },
                    React.createElement(
                      'div',
                      { className: 'mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-100' },
                      React.createElement('span', { className: 'icon-gauge text-slate-400', 'aria-hidden': true }),
                      calibration.title || '校准'
                    ),
                    calibration.subtitle && React.createElement('p', { className: 'mb-3 text-[11px] text-slate-500' }, calibration.subtitle + '。理想情况下把握越大命中率应越高。'),
                    React.createElement(
                      'div',
                      { className: 'flex flex-col gap-2' },
                      calibration.buckets.map(function (r, i) {
                        return React.createElement(ProbBar, { key: i, row: r });
                      })
                    )
                  ),

                // 分维度拆解
                (sc.breakdowns && sc.breakdowns.length) &&
                  React.createElement(
                    'div',
                    { className: 'mb-4 grid gap-3 ' + (sc.breakdowns.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2') },
                    sc.breakdowns.map(function (bd, i) {
                      return React.createElement(DimTable, { key: i, title: bd.title, dimLabel: bd.dim_label, rows: bd.rows });
                    })
                  ),

                // 实时行情验证（阶段一）
                (sc.leaders && (sc.leaders.best.length || sc.leaders.worst.length)) &&
                  React.createElement(
                    React.Fragment,
                    null,
                    liveErr && React.createElement('div', { className: 'mb-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200' }, liveErr),
                    React.createElement(LiveValidationTable, {
                      rows: (sc.leaders.best || []).concat(sc.leaders.worst || []),
                      quotes: liveQuotes,
                    })
                  ),

                // 个股榜
                (sc.leaders && (sc.leaders.best.length || sc.leaders.worst.length)) &&
                  React.createElement(
                    'div',
                    { className: 'card mb-4 !p-4 md:!p-5' },
                    React.createElement(
                      'div',
                      { className: 'mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-100' },
                      React.createElement('span', { className: 'icon-list-ordered text-slate-400', 'aria-hidden': true }),
                      isReport ? '个股表现榜（≥2 篇研报）' : '个股表现榜（≥2 次预测）'
                    ),
                    React.createElement(
                      'div',
                      { className: 'flex flex-col gap-4 md:flex-row' },
                      React.createElement(LeaderTable, { title: '表现最好', titleClass: 'text-emerald-300', rows: sc.leaders.best, quotes: liveQuotes }),
                      React.createElement(LeaderTable, { title: '表现最差', titleClass: 'text-rose-300', rows: sc.leaders.worst, quotes: liveQuotes })
                    )
                  ),

                // 连续命中榜
                React.createElement(StreakCard, { rows: sc.streaks, quotes: liveQuotes }),

                // 最近结算明细
                React.createElement(
                  'div',
                  { className: 'card !p-3 md:!p-4' },
                  React.createElement(
                    'div',
                    { className: 'mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-100' },
                    React.createElement('span', { className: 'icon-history text-slate-400', 'aria-hidden': true }),
                    '最近结算明细'
                  ),
                  React.createElement(
                    'div',
                    { className: 'max-h-[560px] overflow-y-auto' },
                    React.createElement(RecentTable, { rows: sc.recent, headers: sc.recent_headers })
                  )
                )
              )
        )
    );
  }

  var root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(React.createElement(BacktestApp));
})();
