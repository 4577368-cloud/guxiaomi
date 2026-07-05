/**
 * 专业 K 线图（纯 Canvas 2D，无第三方图表库）。
 *   <KLineChart symbol market fallbackHistory currentPrice />
 *
 * 主图：蜡烛（红涨绿跌，符合 A/港/美股中文习惯）+ MA5/10/20/60 叠加
 * 副图 1：成交量柱
 * 副图 2：MACD(12,26,9) 或 RSI(14)，可切换/关闭
 * 交互：鼠标/触摸十字光标 + 顶部 O/H/L/C/涨跌/量/均线数值浮动图例
 *
 * 数据统一走 window.getDailyKLine(symbol, market, 120)（后端 /api/stock/history），
 * 失败时回退到传入的 fallbackHistory。
 */
(function () {
  'use strict';

  // ---------- 纯计算 ----------
  function num(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /** 开高低为 0 或缺失时视为无效，避免 K 线从 0 拉到收盘价把主图压扁 */
  function sanitizeOhlcRow(row) {
    var close = num(row.close);
    if (close == null || close <= 0) return null;
    function field(v) {
      var n = num(v);
      return n != null && n > 0 ? n : null;
    }
    var open = field(row.open);
    var high = field(row.high);
    var low = field(row.low);
    if (open == null) open = close;
    if (high == null) high = close;
    if (low == null) low = close;
    high = Math.max(high, open, close);
    low = Math.min(low, open, close);
    return {
      date: row.date,
      open: open,
      high: high,
      low: low,
      close: close,
      volume: Math.max(0, num(row.volume) || 0),
    };
  }

  function normalizeKlineRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
      .map(function (r) {
        if (!r) return null;
        var close = num(r.close != null ? r.close : r.price);
        if (close == null || close <= 0) return null;
        return sanitizeOhlcRow({
          date: String(r.date || r.time || '').slice(0, 10),
          open: r.open,
          high: r.high,
          low: r.low,
          close: close,
          volume: r.volume,
        });
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return String(a.date).localeCompare(String(b.date));
      });
  }

  function sma(vals, period) {
    var out = new Array(vals.length).fill(null);
    var sum = 0;
    for (var i = 0; i < vals.length; i++) {
      sum += vals[i];
      if (i >= period) sum -= vals[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  function ema(vals, period) {
    var out = new Array(vals.length).fill(null);
    var k = 2 / (period + 1);
    var prev = null;
    for (var i = 0; i < vals.length; i++) {
      if (prev == null) prev = vals[i];
      else prev = vals[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  function computeMACD(closes) {
    var e12 = ema(closes, 12);
    var e26 = ema(closes, 26);
    var dif = closes.map(function (_, i) {
      return e12[i] != null && e26[i] != null ? e12[i] - e26[i] : null;
    });
    var difClean = dif.map(function (v) {
      return v == null ? 0 : v;
    });
    var dea = ema(difClean, 9);
    var hist = dif.map(function (v, i) {
      return v != null && dea[i] != null ? (v - dea[i]) * 2 : null;
    });
    // 前 25 根未成型，置空更干净
    for (var i = 0; i < closes.length && i < 25; i++) {
      dif[i] = null;
      dea[i] = null;
      hist[i] = null;
    }
    return { dif: dif, dea: dea, hist: hist };
  }

  function computeRSI(closes, period) {
    period = period || 14;
    var out = new Array(closes.length).fill(null);
    var gain = 0;
    var loss = 0;
    for (var i = 1; i < closes.length; i++) {
      var ch = closes[i] - closes[i - 1];
      var g = ch > 0 ? ch : 0;
      var l = ch < 0 ? -ch : 0;
      if (i <= period) {
        gain += g;
        loss += l;
        if (i === period) {
          var ag = gain / period;
          var al = loss / period;
          out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
          gain = ag;
          loss = al;
        }
      } else {
        gain = (gain * (period - 1) + g) / period;
        loss = (loss * (period - 1) + l) / period;
        out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
      }
    }
    return out;
  }

  function computeIndicators(rows) {
    var closes = rows.map(function (r) {
      return r.close;
    });
    return {
      ma5: sma(closes, 5),
      ma10: sma(closes, 10),
      ma20: sma(closes, 20),
      ma60: sma(closes, 60),
      macd: computeMACD(closes),
      rsi: computeRSI(closes, 14),
    };
  }

  // ---------- 格式化 ----------
  function priceDigits(v) {
    var a = Math.abs(v);
    if (a > 0 && a < 1) return 4;
    if (a < 10) return 3;
    return 2;
  }

  function fmtPrice(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    return v.toFixed(priceDigits(v));
  }

  function fmtVol(v) {
    v = Number(v) || 0;
    if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
    if (v >= 1e4) return (v / 1e4).toFixed(1) + '万';
    return String(Math.round(v));
  }

  function niceTicks(min, max, count) {
    var span = max - min;
    if (span <= 0) return [min];
    var raw = span / Math.max(1, count);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step;
    if (norm < 1.5) step = 1;
    else if (norm < 3) step = 2;
    else if (norm < 7) step = 5;
    else step = 10;
    step *= mag;
    var start = Math.ceil(min / step) * step;
    var ticks = [];
    for (var t = start; t <= max + step * 0.001; t += step) ticks.push(t);
    return ticks;
  }

  // ---------- 绘制 ----------
  var COLOR = {
    up: '#f0616d',
    down: '#33c46b',
    upFill: 'rgba(240,97,109,0.55)',
    downFill: 'rgba(51,196,107,0.5)',
    grid: 'rgba(148,163,184,0.10)',
    axisText: '#8595ad',
    subText: '#6b7a91',
    crosshair: 'rgba(226,232,240,0.4)',
    ma5: '#e6b34d',
    ma10: '#4ea1f2',
    ma20: '#c07bf0',
    ma60: '#4bd6b0',
  };
  var FONT = '11px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSeries(ctx, arr, yFn, cxFn, n, color, lineW) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < n; i++) {
      var v = arr[i];
      if (v == null) {
        started = false;
        continue;
      }
      var x = cxFn(i);
      var y = yFn(v);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  function drawKline(canvas, o) {
    if (!canvas) return;
    var width = o.width;
    var height = o.height;
    var dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = FONT;

    var rows = o.rows || [];
    var n = rows.length;
    if (!n) {
      ctx.fillStyle = COLOR.axisText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.loading ? '加载 K 线中…' : '暂无 K 线数据', width / 2, height / 2);
      return;
    }

    var ind = o.indicators || {};
    var sub = o.sub;
    var hasSub = sub === 'MACD' || sub === 'RSI';
    var hover = o.hover;

    var AXW = 50;
    var plotL = 6;
    var plotR = width - AXW;
    var plotW = Math.max(10, plotR - plotL);
    var topPad = 6;
    var dateH = 16;
    var gap = 8;
    var avail = height - topPad - dateH;
    var mainH;
    var volH;
    var subH = 0;
    if (hasSub) {
      mainH = avail * 0.58;
      volH = avail * 0.17;
      subH = avail - mainH - volH - 2 * gap;
    } else {
      mainH = avail * 0.76;
      volH = avail - mainH - gap;
    }
    var mainTop = topPad;
    var mainBot = mainTop + mainH;
    var volTop = mainBot + gap;
    var volBot = volTop + volH;
    var subTop = volBot + gap;
    var subBot = subTop + subH;

    var cw = plotW / n;
    var bodyW = Math.max(1, Math.min(cw * 0.64, 16));
    function cx(i) {
      return plotL + (i + 0.5) * cw;
    }

    // 主图价格区间（含高低点与均线）
    var maxP = -Infinity;
    var minP = Infinity;
    var i;
    var r;
    for (i = 0; i < n; i++) {
      r = rows[i];
      var hi = r.high != null ? r.high : r.close;
      var lo = r.low != null ? r.low : r.close;
      if (hi > maxP) maxP = hi;
      if (lo < minP) minP = lo;
    }
    if (o.maOn) {
      [ind.ma5, ind.ma10, ind.ma20, ind.ma60].forEach(function (arr) {
        if (!arr) return;
        for (var j = 0; j < arr.length; j++) {
          var v = arr[j];
          if (v == null) continue;
          if (v > maxP) maxP = v;
          if (v < minP) minP = v;
        }
      });
    }
    if (!isFinite(maxP) || !isFinite(minP)) {
      maxP = 1;
      minP = 0;
    }
    if (maxP === minP) {
      maxP += 1;
      minP -= 1;
    }
    var padP = (maxP - minP) * 0.06;
    maxP += padP;
    minP -= padP;
    function py(v) {
      return mainTop + ((maxP - v) / (maxP - minP)) * mainH;
    }

    // 主图网格 + 右侧价格刻度
    ctx.textBaseline = 'middle';
    var ticks = niceTicks(minP, maxP, 5);
    ctx.lineWidth = 1;
    ticks.forEach(function (t) {
      if (t < minP || t > maxP) return;
      var y = py(t);
      ctx.strokeStyle = COLOR.grid;
      ctx.beginPath();
      ctx.moveTo(plotL, y);
      ctx.lineTo(plotR, y);
      ctx.stroke();
      ctx.fillStyle = COLOR.axisText;
      ctx.textAlign = 'left';
      ctx.fillText(fmtPrice(t), plotR + 4, y);
    });

    // 蜡烛
    for (i = 0; i < n; i++) {
      r = rows[i];
      var c = r.close;
      var op = r.open;
      var high = r.high != null ? r.high : Math.max(op != null ? op : c, c);
      var low = r.low != null ? r.low : Math.min(op != null ? op : c, c);
      var up = op == null ? (i > 0 ? c >= rows[i - 1].close : true) : c >= op;
      var col = up ? COLOR.up : COLOR.down;
      var X = cx(i);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X, py(high));
      ctx.lineTo(X, py(low));
      ctx.stroke();
      if (op == null) {
        ctx.beginPath();
        ctx.moveTo(X - bodyW / 2, py(c));
        ctx.lineTo(X + bodyW / 2, py(c));
        ctx.stroke();
      } else {
        var yO = py(op);
        var yC = py(c);
        var top = Math.min(yO, yC);
        var h = Math.max(1, Math.abs(yC - yO));
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(X - bodyW / 2) + 0.5, top, Math.max(1, bodyW - 1), h);
      }
    }

    // 均线
    if (o.maOn) {
      drawSeries(ctx, ind.ma5, py, cx, n, COLOR.ma5, 1.1);
      drawSeries(ctx, ind.ma10, py, cx, n, COLOR.ma10, 1.1);
      drawSeries(ctx, ind.ma20, py, cx, n, COLOR.ma20, 1.1);
      drawSeries(ctx, ind.ma60, py, cx, n, COLOR.ma60, 1.1);
    }

    // 成交量副图（量为 0 的不画柱，避免占位干扰）
    var maxV = 0;
    for (i = 0; i < n; i++) {
      if ((rows[i].volume || 0) > maxV) maxV = rows[i].volume || 0;
    }
    if (maxV <= 0) maxV = 1;
    function vy(v) {
      return volTop + (1 - v / maxV) * volH;
    }
    for (i = 0; i < n; i++) {
      r = rows[i];
      var vv = r.volume || 0;
      if (vv <= 0) continue;
      var vUp = r.close >= r.open;
      ctx.fillStyle = vUp ? COLOR.upFill : COLOR.downFill;
      var vYy = vy(vv);
      ctx.fillRect(Math.round(cx(i) - bodyW / 2) + 0.5, vYy, Math.max(1, bodyW - 1), Math.max(0.5, volBot - vYy));
    }
    ctx.fillStyle = COLOR.subText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('量 ' + fmtVol(maxV), plotL + 2, volTop + 1);

    // MACD / RSI 副图
    if (sub === 'MACD' && ind.macd) {
      var dif = ind.macd.dif;
      var dea = ind.macd.dea;
      var hist = ind.macd.hist;
      var mmax = 1e-9;
      for (i = 0; i < n; i++) {
        [dif[i], dea[i], hist[i]].forEach(function (v) {
          if (v != null && Math.abs(v) > mmax) mmax = Math.abs(v);
        });
      }
      var sMid = subTop + subH / 2;
      function sy(v) {
        return sMid - (v / mmax) * (subH / 2) * 0.9;
      }
      ctx.strokeStyle = 'rgba(148,163,184,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotL, sy(0));
      ctx.lineTo(plotR, sy(0));
      ctx.stroke();
      for (i = 0; i < n; i++) {
        var hv = hist[i];
        if (hv == null) continue;
        var y0 = sy(0);
        var y1 = sy(hv);
        ctx.fillStyle = hv >= 0 ? 'rgba(240,97,109,0.75)' : 'rgba(51,196,107,0.7)';
        var bw = Math.max(1, bodyW * 0.7);
        ctx.fillRect(cx(i) - bw / 2, Math.min(y0, y1), bw, Math.max(1, Math.abs(y1 - y0)));
      }
      drawSeries(ctx, dif, sy, cx, n, COLOR.ma5, 1.1);
      drawSeries(ctx, dea, sy, cx, n, COLOR.ma10, 1.1);
      ctx.fillStyle = COLOR.subText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('MACD(12,26,9)', plotL + 2, subTop + 1);
    } else if (sub === 'RSI' && ind.rsi) {
      function ry(v) {
        return subTop + (1 - v / 100) * subH;
      }
      [30, 50, 70].forEach(function (g) {
        ctx.strokeStyle = g === 50 ? 'rgba(148,163,184,0.10)' : 'rgba(148,163,184,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(plotL, ry(g));
        ctx.lineTo(plotR, ry(g));
        ctx.stroke();
        ctx.fillStyle = COLOR.subText;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(g), plotR + 4, ry(g));
      });
      drawSeries(ctx, ind.rsi, ry, cx, n, COLOR.ma20, 1.3);
      ctx.fillStyle = COLOR.subText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('RSI(14)', plotL + 2, subTop + 1);
    }

    // 日期轴
    ctx.fillStyle = COLOR.subText;
    ctx.textBaseline = 'alphabetic';
    var labelCount = width < 420 ? 3 : width < 720 ? 4 : 6;
    for (var k = 0; k < labelCount; k++) {
      var idx = Math.round((k * (n - 1)) / (labelCount - 1));
      if (idx < 0) idx = 0;
      if (idx > n - 1) idx = n - 1;
      var ds = String(rows[idx].date || '').slice(5).replace('-', '/');
      ctx.textAlign = k === 0 ? 'left' : k === labelCount - 1 ? 'right' : 'center';
      ctx.fillText(ds, Math.min(Math.max(cx(idx), plotL + 2), plotR - 2), height - 4);
    }

    // 十字光标
    if (hover != null && hover >= 0 && hover < n) {
      var hx = cx(hover);
      var hr = rows[hover];
      ctx.strokeStyle = COLOR.crosshair;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, mainTop);
      ctx.lineTo(hx, hasSub ? subBot : volBot);
      ctx.stroke();
      var hyC = py(hr.close);
      ctx.beginPath();
      ctx.moveTo(plotL, hyC);
      ctx.lineTo(plotR, hyC);
      ctx.stroke();
      ctx.setLineDash([]);
      var tag = fmtPrice(hr.close);
      ctx.fillStyle = '#0b1220';
      roundRect(ctx, plotR + 1, hyC - 8, AXW - 2, 16, 3);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(tag, plotR + 4, hyC);
    }
  }

  // ---------- React 组件 ----------
  function KLineChart(props) {
    var symbol = props.symbol;
    var market = props.market;
    var fallbackHistory = props.fallbackHistory;

    var containerRef = React.useRef(null);
    var canvasRef = React.useRef(null);

    var daysState = React.useState(60);
    var days = daysState[0];
    var setDays = daysState[1];
    var subState = React.useState('MACD');
    var sub = subState[0];
    var setSub = subState[1];
    var maState = React.useState(true);
    var maOn = maState[0];
    var setMaOn = maState[1];

    var rowsState = React.useState(function () {
      return normalizeKlineRows(fallbackHistory);
    });
    var rows = rowsState[0];
    var setRows = rowsState[1];
    var loadingState = React.useState(false);
    var loading = loadingState[0];
    var setLoading = loadingState[1];
    var errState = React.useState('');
    var err = errState[0];
    var setErr = errState[1];
    var hoverState = React.useState(null);
    var hover = hoverState[0];
    var setHover = hoverState[1];
    var widthState = React.useState(680);
    var width = widthState[0];
    var setWidth = widthState[1];

    // 拉取 120 根日线（每次换标的拉一次，周期切换只切片）
    React.useEffect(
      function () {
        var cancelled = false;
        function load() {
          if (!symbol) {
            setRows(normalizeKlineRows(fallbackHistory));
            return;
          }
          if (typeof window.getDailyKLine !== 'function') {
            setRows(normalizeKlineRows(fallbackHistory));
            return;
          }
          setLoading(true);
          setErr('');
          window
            .getDailyKLine(symbol, market, 120)
            .then(function (data) {
              if (cancelled) return;
              var norm = normalizeKlineRows(data);
              if (norm.length) {
                setRows(norm);
              } else {
                var fb = normalizeKlineRows(fallbackHistory);
                setRows(fb);
                if (!fb.length) setErr('暂无 K 线数据');
                else setErr('未获取到日线，显示本地记录');
              }
            })
            .catch(function () {
              if (cancelled) return;
              var fb = normalizeKlineRows(fallbackHistory);
              setRows(fb);
              setErr(fb.length ? 'K 线获取失败，显示本地记录' : 'K 线获取失败');
            })
            .then(function () {
              if (!cancelled) setLoading(false);
            });
        }
        load();
        return function () {
          cancelled = true;
        };
      },
      // eslint-disable-next-line
      [symbol, market]
    );

    // 容器宽度自适应
    React.useEffect(function () {
      var el = containerRef.current;
      if (!el) return;
      function apply(w) {
        var nw = Math.max(280, Math.floor(w));
        setWidth(function (prev) {
          return Math.abs(prev - nw) < 2 ? prev : nw;
        });
      }
      apply(el.clientWidth);
      if (typeof ResizeObserver === 'undefined') {
        var onResize = function () {
          if (containerRef.current) apply(containerRef.current.clientWidth);
        };
        window.addEventListener('resize', onResize);
        return function () {
          window.removeEventListener('resize', onResize);
        };
      }
      var ro = new ResizeObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) apply(entries[i].contentRect.width);
      });
      ro.observe(el);
      return function () {
        ro.disconnect();
      };
    }, []);

    var height = React.useMemo(
      function () {
        var base = width < 480 ? 300 : width < 900 ? 360 : 420;
        return sub === 'NONE' ? base : base + 92;
      },
      [width, sub]
    );

    var indicators = React.useMemo(
      function () {
        return computeIndicators(rows);
      },
      [rows]
    );

    var view = React.useMemo(
      function () {
        return rows.slice(-days);
      },
      [rows, days]
    );

    function sliceArr(arr) {
      return Array.isArray(arr) ? arr.slice(-days) : arr;
    }

    var viewInd = React.useMemo(
      function () {
        return {
          ma5: sliceArr(indicators.ma5),
          ma10: sliceArr(indicators.ma10),
          ma20: sliceArr(indicators.ma20),
          ma60: sliceArr(indicators.ma60),
          macd: {
            dif: sliceArr(indicators.macd.dif),
            dea: sliceArr(indicators.macd.dea),
            hist: sliceArr(indicators.macd.hist),
          },
          rsi: sliceArr(indicators.rsi),
        };
      },
      // eslint-disable-next-line
      [indicators, days]
    );

    // 绘制
    React.useEffect(
      function () {
        drawKline(canvasRef.current, {
          rows: view,
          indicators: viewInd,
          sub: sub,
          maOn: maOn,
          hover: hover,
          width: width,
          height: height,
          loading: loading,
        });
      },
      [view, viewInd, sub, maOn, hover, width, height, loading]
    );

    function pointerIndex(clientX) {
      var canvas = canvasRef.current;
      if (!canvas || !view.length) return null;
      var rect = canvas.getBoundingClientRect();
      if (!rect.width) return null;
      var AXW = 50;
      var plotL = 6;
      var plotR = width - AXW;
      var plotW = Math.max(10, plotR - plotL);
      var xInCanvas = ((clientX - rect.left) / rect.width) * width;
      var rel = (xInCanvas - plotL) / plotW;
      var idx = Math.floor(rel * view.length);
      if (idx < 0) idx = 0;
      if (idx > view.length - 1) idx = view.length - 1;
      return idx;
    }

    var legend = React.useMemo(
      function () {
        if (!view.length) return null;
        var idx = hover == null ? view.length - 1 : Math.min(hover, view.length - 1);
        var r = view[idx];
        var prev = idx > 0 ? view[idx - 1] : null;
        var base = r.open != null ? r.open : prev ? prev.close : r.close;
        var chg = r.close - base;
        var chgPct = base > 0 ? (chg / base) * 100 : 0;
        return {
          idx: idx,
          row: r,
          up: chg >= 0,
          chg: chg,
          chgPct: chgPct,
          ma5: viewInd.ma5 ? viewInd.ma5[idx] : null,
          ma10: viewInd.ma10 ? viewInd.ma10[idx] : null,
          ma20: viewInd.ma20 ? viewInd.ma20[idx] : null,
          ma60: viewInd.ma60 ? viewInd.ma60[idx] : null,
        };
      },
      [view, viewInd, hover]
    );

    function ohlcCell(label, val, cls) {
      return React.createElement(
        'span',
        { className: 'inline-flex items-center gap-1 whitespace-nowrap' },
        React.createElement('span', { className: 'text-slate-500' }, label),
        React.createElement('span', { className: 'gx-num font-semibold tabular-nums ' + (cls || 'text-slate-200') }, val)
      );
    }

    function maChip(label, val, color) {
      if (val == null) return null;
      return React.createElement(
        'span',
        { className: 'inline-flex items-center gap-1 whitespace-nowrap' },
        React.createElement('span', { style: { color: color }, className: 'font-bold' }, label),
        React.createElement('span', { className: 'gx-num tabular-nums text-slate-300' }, fmtPrice(val))
      );
    }

    var rangeBtns = [
      { k: 30, label: '30日' },
      { k: 60, label: '60日' },
      { k: 120, label: '120日' },
    ];
    var subBtns = [
      { k: 'MACD', label: 'MACD' },
      { k: 'RSI', label: 'RSI' },
      { k: 'NONE', label: '收起' },
    ];

    function segBtn(active, label, onClick, key) {
      return React.createElement(
        'button',
        {
          key: key,
          type: 'button',
          onClick: onClick,
          className:
            'rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ' +
            (active
              ? 'bg-cyan-400/20 text-cyan-100'
              : 'text-slate-400 hover:bg-white/[0.08] hover:text-slate-200'),
        },
        label
      );
    }

    return React.createElement(
      'div',
      { className: 'rounded-2xl border border-white/10 bg-slate-950/25 p-2.5 sm:p-3' },
      // 顶部图例 + 控件
      React.createElement(
        'div',
        { className: 'mb-2 flex flex-wrap items-center justify-between gap-2' },
        React.createElement(
          'div',
          { className: 'flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs' },
          legend &&
            React.createElement(
              React.Fragment,
              null,
              React.createElement('span', { className: 'gx-num font-semibold text-slate-300' }, String(legend.row.date || '').slice(5).replace('-', '/')),
              ohlcCell('开', fmtPrice(legend.row.open != null ? legend.row.open : legend.row.close), 'text-slate-200'),
              ohlcCell('高', fmtPrice(legend.row.high != null ? legend.row.high : legend.row.close), 'text-rose-300'),
              ohlcCell('低', fmtPrice(legend.row.low != null ? legend.row.low : legend.row.close), 'text-emerald-300'),
              ohlcCell('收', fmtPrice(legend.row.close), legend.up ? 'text-rose-300' : 'text-emerald-300'),
              ohlcCell('涨跌', (legend.chg >= 0 ? '+' : '') + fmtPrice(legend.chg) + ' · ' + (legend.chgPct >= 0 ? '+' : '') + legend.chgPct.toFixed(2) + '%', legend.up ? 'text-rose-300' : 'text-emerald-300'),
              ohlcCell('量', fmtVol(legend.row.volume), 'text-slate-300')
            )
        ),
        React.createElement(
          'div',
          { className: 'flex items-center gap-2' },
          React.createElement(
            'div',
            { className: 'flex rounded-xl border border-white/10 bg-white/[0.05] p-0.5' },
            rangeBtns.map(function (b) {
              return segBtn(days === b.k, b.label, function () {
                setDays(b.k);
                setHover(null);
              }, b.k);
            })
          )
        )
      ),
      // 均线图例
      maOn &&
        legend &&
        React.createElement(
          'div',
          { className: 'mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]' },
          maChip('MA5', legend.ma5, COLOR.ma5),
          maChip('MA10', legend.ma10, COLOR.ma10),
          maChip('MA20', legend.ma20, COLOR.ma20),
          maChip('MA60', legend.ma60, COLOR.ma60)
        ),
      // 画布
      React.createElement(
        'div',
        { ref: containerRef, className: 'relative w-full' },
        React.createElement('canvas', {
          ref: canvasRef,
          style: { width: '100%', height: height + 'px', display: 'block', touchAction: 'pan-y' },
          onMouseMove: function (e) {
            var idx = pointerIndex(e.clientX);
            if (idx != null) setHover(idx);
          },
          onMouseLeave: function () {
            setHover(null);
          },
          onTouchStart: function (e) {
            var t = e.touches && e.touches[0];
            if (t) {
              var idx = pointerIndex(t.clientX);
              if (idx != null) setHover(idx);
            }
          },
          onTouchMove: function (e) {
            var t = e.touches && e.touches[0];
            if (t) {
              var idx = pointerIndex(t.clientX);
              if (idx != null) setHover(idx);
            }
          },
          onTouchEnd: function () {
            setHover(null);
          },
          'aria-label': 'K 线走势图',
        })
      ),
      // 底部：副图切换 + 均线开关 + 状态
      React.createElement(
        'div',
        { className: 'mt-2 flex flex-wrap items-center justify-between gap-2' },
        React.createElement(
          'div',
          { className: 'flex items-center gap-2' },
          React.createElement(
            'div',
            { className: 'flex rounded-xl border border-white/10 bg-white/[0.05] p-0.5' },
            subBtns.map(function (b) {
              return segBtn(sub === b.k, b.label, function () {
                setSub(b.k);
                setHover(null);
              }, b.k);
            })
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: function () {
                setMaOn(function (v) {
                  return !v;
                });
              },
              className:
                'rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ' +
                (maOn
                  ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100'
                  : 'border-white/10 text-slate-400 hover:text-slate-200'),
            },
            '均线'
          )
        ),
        React.createElement(
          'div',
          { className: 'text-[11px] text-slate-500' },
          loading ? '加载中…' : err ? err : '红涨绿跌 · 日线'
        )
      )
    );
  }

  window.KLineChart = KLineChart;
  window.normalizeKlineRows = normalizeKlineRows;
})();
