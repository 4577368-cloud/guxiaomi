/**
 * 紫微财富命盘 · 分享海报生成（纯 Canvas 2D，无外部依赖）。
 * window.ZiweiSharePoster.render(options) -> HTMLCanvasElement
 *
 * 版式：顶部品牌 + 完整命盘(全星曜) + 双栏结论（左=传统命理断语 / 右=AI结论）。
 * 结论/断语由外部传入 traditional[] 与 conclusions[]（"标签｜正文" 字符串）。
 */
(function (global) {
  'use strict';

  var W = 1080;
  var SCALE = 2;
  var FONT = '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif';

  var HUA_COLOR = { 禄: '#10b981', 权: '#ef4444', 科: '#3b82f6', 忌: '#57534e' };

  var GOLD_TITLE = '#fde68a';
  var GOLD_LABEL = '#fcd34d';
  var GOLD_BODY = '#f2e2ad';
  var PARCH_BODY = '#ecd7ac';

  // 星曜配色（深色底）
  var STAR_COLOR = { major: '#fca5a5', lucky: '#6ee7b7', bad: '#a8a29e', minor: '#cbd5e1' };

  var KW = ['财', '富', '宜', '忌', '建议', '格局', '运势', '机会', '机遇', '风险',
    '投资', '仓位', '节奏', '偏财', '正财', '事业', '官禄', '大限', '流年', '贵人',
    '现金流', '资产', '配置', '权威', '扩张', '爆发', '窗口', '时机', '风格',
    '进取', '激进', '稳健', '主导', '开拓', '重组'];
  var SIGNAL = ['预示', '意味', '属于', '典型', '整体', '综合', '决定', '利好', '应', '需', '切忌'];
  var SETUP_RE = /生于.{0,8}年|引发.{0,24}化(?:禄|权|科|忌)/;
  // 逐宫/情感健康类小节：不进 AI 结论（避免啰嗦）
  var PALACE_TITLES = /^(命宫|身宫|兄弟|夫妻|子女|财帛|疾厄|迁移|交友|仆役|官禄|田宅|福德|父母)宫?$|感情|健康/;

  function stripMd(s) {
    return String(s || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/[#>*`_~]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseSections(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var sections = [];
    var cur = null;
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^\s*【\s*([^】]{1,24})\s*】\s*(.*)$/);
      if (m) {
        cur = { title: m[1].trim(), body: [] };
        if (m[2] && m[2].trim()) cur.body.push(m[2].trim());
        sections.push(cur);
      } else if (cur) {
        cur.body.push(lines[i]);
      }
    }
    return sections.map(function (s) {
      return { title: s.title, body: s.body.join('\n').trim() };
    });
  }

  function findSection(sections, matchers) {
    for (var i = 0; i < sections.length; i++) {
      for (var j = 0; j < matchers.length; j++) {
        if (matchers[j].test(sections[i].title)) return sections[i];
      }
    }
    return null;
  }

  function splitSentences(body) {
    var out = [];
    String(body || '').split('\n').forEach(function (ln) {
      if (ln.indexOf('|') >= 0) return;
      var t = stripMd(ln);
      if (!t) return;
      t = t.replace(/^[^，。：:；;]{0,22}[：:]\s*/, '');
      t.split(/[。！；;!]/).forEach(function (s) {
        s = s.trim().replace(/^(?:[-–—•·]\s*|\d+[.、)]\s*)+/, '').trim();
        if (s) out.push(s);
      });
    });
    return out;
  }

  function summarize(section, maxLen) {
    maxLen = maxLen || 48;
    var sents = splitSentences(section.body);
    if (!sents.length) return '';
    var best = null;
    var bestScore = -1e9;
    for (var i = 0; i < sents.length; i++) {
      var s = sents[i];
      if (s.length < 10) continue;
      var score = 0;
      for (var k = 0; k < KW.length; k++) if (s.indexOf(KW[k]) >= 0) score += 2;
      for (var g = 0; g < SIGNAL.length; g++) if (s.indexOf(SIGNAL[g]) >= 0) score += 2;
      if (s.length >= 16 && s.length <= 46) score += 3;
      if (s.length > 58) score -= 3;
      if (SETUP_RE.test(s)) score -= 4;
      score -= i * 0.4;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    if (!best) best = sents[0];
    if (best.length > maxLen) best = best.slice(0, maxLen - 1) + '…';
    return best;
  }

  function tableSummary(section, maxLen) {
    maxLen = maxLen || 48;
    var rows = [];
    String(section.body || '').split('\n').forEach(function (ln) {
      if (ln.indexOf('|') < 0) return;
      var cells = ln.split('|').map(function (c) { return stripMd(c).trim(); })
        .filter(function (c) { return c !== ''; });
      if (!cells.length) return;
      if (cells.join('').replace(/[-:：\s]/g, '') === '') return;
      rows.push(cells);
    });
    if (rows.length <= 1) return '';
    var header = rows[0];
    var col = -1;
    for (var i = 0; i < header.length; i++) {
      if (/板块|领域|方向|核心|行业|标的/.test(header[i])) { col = i; break; }
    }
    if (col < 0) col = header.length >= 2 ? 1 : 0;
    var vals = [];
    for (var r = 1; r < rows.length && vals.length < 4; r++) {
      var v = rows[r][col] || rows[r][1] || rows[r][0];
      if (v) vals.push(v.replace(/[、,，;；\s]+$/, ''));
    }
    var text = vals.join('、');
    if (text.length > maxLen) text = text.slice(0, maxLen - 1) + '…';
    return text;
  }

  var BOARDS = [
    { label: '命格总纲', src: 'basic', match: [/命盘总论/, /总论/, /总纲/], type: 'text' },
    { label: '财富格局', src: 'wealth', match: [/财富.*总/, /格局总/, /总论/, /总纲/], type: 'text' },
    { label: '事业财运', src: 'basic', match: [/事业财运/, /事业.*综合/, /财运/], type: 'text' },
    { label: '投资风格', src: 'wealth', match: [/投资风格/, /风险偏好/, /风格/], type: 'text' },
    { label: '板块机会', src: 'wealth', match: [/行业板块/, /板块机会/, /板块/], type: 'table' },
    { label: '仓位节奏', src: 'wealth', match: [/仓位/, /节奏/], type: 'text' },
    { label: '当前大限', src: 'basic', match: [/当前大限/], type: 'text' },
    { label: '下一大限', src: 'basic', match: [/下一大限/], type: 'text' },
    { label: '流年运势', src: 'basic', match: [/流年及关键|流年.*窗口|关键窗口|流年/], type: 'text' },
    { label: '时间窗口', src: 'wealth', match: [/关键时间窗/, /时间窗/, /流年.*窗/], type: 'text' },
  ];

  /**
   * 结合命盘全析(basic)+财富密码(wealth)逐板块提炼「总纲结论」。
   * 只取板块级小节，剔除逐宫/情感健康等啰嗦内容，并按内容去重。
   */
  function extractHighlights(reports, max) {
    max = max || 6;
    reports = reports || {};
    var basic = parseSections(reports.basic);
    var wealth = parseSections(reports.wealth);
    var pools = { basic: basic, wealth: wealth };

    var out = [];
    var usedSec = {};
    var seenText = {};
    BOARDS.forEach(function (b) {
      if (out.length >= max) return;
      var sec = findSection(pools[b.src] || [], b.match);
      if (!sec) return;
      if (PALACE_TITLES.test(sec.title)) return;
      var key = b.src + '|' + sec.title;
      if (usedSec[key]) return;
      var text = b.type === 'table' ? tableSummary(sec) : summarize(sec);
      if (!text || text.length < 8) return;
      var dedup = text.slice(0, 12);
      if (seenText[dedup]) return; // 去重（避免总论/总纲重复）
      usedSec[key] = 1;
      seenText[dedup] = 1;
      out.push(b.label + '｜' + text);
    });
    return out;
  }

  function parseItem(str) {
    var s = String(str || '').trim();
    var idx = s.indexOf('｜');
    if (idx < 0) idx = s.indexOf('|');
    if (idx > 0 && idx <= 8) {
      return { label: s.slice(0, idx).trim(), text: s.slice(idx + 1).trim() };
    }
    return { label: '', text: s };
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapOffset(ctx, text, colW, firstOffset) {
    var chars = String(text).split('');
    var lines = [];
    var cur = '';
    var avail = colW - (firstOffset || 0);
    for (var i = 0; i < chars.length; i++) {
      var test = cur + chars[i];
      if (ctx.measureText(test).width > avail && cur) {
        lines.push(cur);
        cur = chars[i];
        avail = colW;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  function drawBackground(ctx, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#211c4e');
    g.addColorStop(0.5, '#141033');
    g.addColorStop(1, '#0b1020');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, h);

    var glow = ctx.createRadialGradient(W / 2, 260, 40, W / 2, 260, 520);
    glow.addColorStop(0, 'rgba(129,140,248,0.20)');
    glow.addColorStop(1, 'rgba(129,140,248,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, 700);

    ctx.save();
    for (var i = 0; i < 60; i++) {
      var x = (i * 137.5) % W;
      var y = (i * 223.7) % h;
      var r = (i % 3 === 0) ? 1.8 : 1.0;
      ctx.globalAlpha = 0.14 + ((i * 37) % 40) / 200;
      ctx.fillStyle = '#e0e7ff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHeader(ctx, opts) {
    var M = 56;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fbbf24';
    ctx.font = '800 56px ' + FONT;
    ctx.fillText('股小蜜', M, 116);

    ctx.fillStyle = '#c7d2fe';
    ctx.font = '500 30px ' + FONT;
    ctx.fillText('紫微斗数 · 财富命盘', M, 162);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(251,191,36,0.9)';
    ctx.font = '700 26px ' + FONT;
    ctx.fillText('AI 命理速览', W - M, 116);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 44px ' + FONT;
    var name = (opts.name || '命主');
    ctx.fillText(name, M, 242);
    var nameW = ctx.measureText(name).width;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '500 28px ' + FONT;
    ctx.fillText(opts.gender === 'female' ? ' 女' : ' 男', M + nameW + 10, 242);

    ctx.fillStyle = 'rgba(199,210,254,0.75)';
    ctx.font = '400 25px ' + FONT;
    if (opts.birthLabel) ctx.fillText(opts.birthLabel, M, 282);
  }

  function starKind(s) {
    if (s.kind) return s.kind;
    return 'minor';
  }

  function fmtBright(b) {
    if (b === '得地') return '得';
    if (b === '利益') return '利';
    return b;
  }

  function brightColor(b) {
    if (b === '庙' || b === '旺' || b === '得地') return '#fbbf24';
    return '#78716c';
  }

  function starsForCell(palace) {
    var arr = [];
    (palace.stars && palace.stars.major || []).forEach(function (s) {
      arr.push({ name: s.name, brightness: s.brightness, hua: s.hua, isFlow: s.isFlow, kind: 'major' });
    });
    (palace.stars && palace.stars.minor || []).forEach(function (s) {
      arr.push({ name: s.name, brightness: s.brightness, hua: s.hua, isFlow: s.isFlow, kind: s.type || 'minor' });
    });
    return arr;
  }

  function drawStarsInCell(ctx, palace, x, y, cell) {
    var stars = starsForCell(palace);
    var pad = 9;
    var bottomBar = 30;
    var nameLH = 18;
    var brightH = 13;
    var gap = 9;
    var maxCols = 4;
    var colStep = 23;
    var topY = y + pad + 14;
    var availH = cell - pad - bottomBar - 14;

    if (!stars.length) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.font = '600 18px ' + FONT;
      ctx.fillText('空宫', x + cell / 2, topY + 12);
      return;
    }

    var colX = x + cell - 16;
    var col = 0;
    var slotTop = topY;
    ctx.textAlign = 'center';

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var chars = String(s.name).split('');
      var need = chars.length * nameLH + (s.brightness ? brightH : 0) + gap;
      if (slotTop + need - topY > availH) {
        col++;
        if (col >= maxCols) break;
        slotTop = topY;
        colX -= colStep;
      }
      var cy = slotTop;

      if (s.hua) {
        ctx.fillStyle = HUA_COLOR[s.hua] || '#9ca3af';
        roundRect(ctx, colX - 20, cy - 14, 16, 16, 4);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 12px ' + FONT;
        ctx.fillText(s.hua, colX - 12, cy - 1);
      }
      if (s.isFlow) {
        ctx.fillStyle = '#a855f7';
        roundRect(ctx, colX + 6, cy - 14, 15, 15, 4);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 11px ' + FONT;
        ctx.fillText('流', colX + 13, cy - 2);
      }

      ctx.font = '800 17px ' + FONT;
      ctx.fillStyle = STAR_COLOR[starKind(s)] || STAR_COLOR.minor;
      for (var c = 0; c < chars.length; c++) {
        ctx.fillText(chars[c], colX, cy);
        cy += nameLH;
      }
      if (s.brightness) {
        ctx.font = '700 12px ' + FONT;
        ctx.fillStyle = brightColor(s.brightness);
        ctx.fillText(fmtBright(s.brightness), colX, cy);
      }
      slotTop += need;
    }
  }

  function drawChart(ctx, chart, opts, region) {
    var gx = region.x;
    var gy = region.y;
    var S = region.size;
    var cell = S / 4;

    ctx.save();
    roundRect(ctx, gx - 14, gy - 14, S + 28, S + 28, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(251,191,36,0.22)';
    ctx.stroke();
    ctx.restore();

    if (!chart || !chart.palaces || !chart.gridMapping) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '500 30px ' + FONT;
      ctx.fillText('命盘生成中…', gx + S / 2, gy + S / 2);
      return;
    }

    chart.gridMapping.forEach(function (branchIndex, gridIdx) {
      var row = Math.floor(gridIdx / 4);
      var col = gridIdx % 4;
      var x = gx + col * cell;
      var y = gy + row * cell;

      if (branchIndex === null) {
        if (gridIdx === 5) {
          var cx = gx + cell;
          var cy = gy + cell;
          var cw = cell * 2;
          ctx.save();
          roundRect(ctx, cx + 5, cy + 5, cw - 10, cw - 10, 12);
          ctx.fillStyle = 'rgba(129,140,248,0.10)';
          ctx.fill();
          ctx.restore();

          ctx.textAlign = 'center';
          ctx.fillStyle = '#e9d5ff';
          ctx.font = '800 30px ' + FONT;
          if (chart.bureau && chart.bureau.name) ctx.fillText(chart.bureau.name, cx + cw / 2, cy + cw / 2 - 22);

          ctx.fillStyle = 'rgba(255,255,255,0.82)';
          ctx.font = '600 25px ' + FONT;
          var bz = (chart.baZi || []).join('  ');
          if (bz) ctx.fillText(bz, cx + cw / 2, cy + cw / 2 + 18);

          ctx.fillStyle = 'rgba(199,210,254,0.6)';
          ctx.font = '400 20px ' + FONT;
          ctx.fillText('股小蜜 · 紫微财富盘', cx + cw / 2, cy + cw / 2 + 54);
        }
        return;
      }

      var palace = chart.palaces[branchIndex];
      var isMing = palace.name === '命宫';
      var isShen = !!palace.isShen;

      ctx.save();
      ctx.fillStyle = isMing ? 'rgba(251,191,36,0.10)' : 'rgba(255,255,255,0.02)';
      ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
      ctx.lineWidth = isMing ? 2.5 : 1;
      ctx.strokeStyle = isMing ? 'rgba(251,191,36,0.75)' : 'rgba(255,255,255,0.09)';
      ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
      ctx.restore();

      drawStarsInCell(ctx, palace, x, y, cell);

      // 底部：干支(左) · 宫名(右) · 大限(角标)
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.font = '600 16px ' + FONT;
      ctx.fillText((palace.stem || '') + (palace.zhi || ''), x + 10, y + cell - 13);

      if (palace.daXian) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '400 12px ' + FONT;
        ctx.fillText(String(palace.daXian), x + 10, y + cell - 30);
      }

      ctx.textAlign = 'right';
      ctx.fillStyle = isMing ? '#fbbf24' : '#fca5a5';
      ctx.font = '800 21px ' + FONT;
      var pname = palace.name + (isShen ? '·身' : '');
      ctx.fillText(pname, x + cell - 10, y + cell - 12);
    });
  }

  var COL = { labelFont: '800 24px', bodyFont: '400 23px', lineH: 32, gap: 15 };

  function layoutColumn(mc, items, colW) {
    var blocks = [];
    var total = 0;
    (items || []).forEach(function (raw) {
      var it = parseItem(raw);
      var lab = it.label ? '「' + it.label + '」' : '';
      mc.font = COL.labelFont + ' ' + FONT;
      var labW = lab ? mc.measureText(lab).width : 0;
      mc.font = COL.bodyFont + ' ' + FONT;
      var lines = wrapOffset(mc, it.text, colW, labW ? labW + 6 : 0);
      blocks.push({ label: it.label, labW: labW, lines: lines });
      total += lines.length * COL.lineH + COL.gap;
    });
    return { blocks: blocks, height: total };
  }

  function colLineCount(L) {
    var n = 0;
    L.blocks.forEach(function (b) { n += b.lines.length; });
    return n;
  }

  function recomputeHeight(L) {
    var t = 0;
    L.blocks.forEach(function (b) { t += b.lines.length * COL.lineH + COL.gap; });
    L.height = t;
  }

  /** 两栏行数尽量对齐：把偏长的一栏按整块裁到与短栏相差不超过 tol 行（保留 minBlocks 块） */
  function balanceColumns(A, B) {
    var tol = 2;
    var minBlocks = 3;
    function trim(L, target) {
      while (L.blocks.length > minBlocks && colLineCount(L) > target) {
        L.blocks.pop();
      }
      recomputeHeight(L);
    }
    var la = colLineCount(A);
    var lb = colLineCount(B);
    if (la > lb + tol) trim(A, lb + tol);
    else if (lb > la + tol) trim(B, la + tol);
  }

  function drawColHeader(ctx, x, y, title, w) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fbbf24';
    ctx.save();
    ctx.translate(x + 8, y - 7);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
    ctx.fillStyle = GOLD_TITLE;
    ctx.font = '800 28px ' + FONT;
    ctx.fillText(title, x + 32, y + 4);
    ctx.fillStyle = 'rgba(251,191,36,0.32)';
    ctx.fillRect(x, y + 22, w, 2);
  }

  function drawColumn(ctx, layout, x, y, bodyColor) {
    var cy = y;
    layout.blocks.forEach(function (b) {
      if (b.label) {
        ctx.font = COL.labelFont + ' ' + FONT;
        ctx.fillStyle = GOLD_LABEL;
        ctx.textAlign = 'left';
        ctx.fillText('「' + b.label + '」', x, cy);
      }
      ctx.font = COL.bodyFont + ' ' + FONT;
      ctx.fillStyle = bodyColor;
      ctx.textAlign = 'left';
      b.lines.forEach(function (ln, i) {
        var lx = (i === 0 && b.label) ? x + b.labW + 6 : x;
        ctx.fillText(ln, lx, cy + i * COL.lineH);
      });
      cy += b.lines.length * COL.lineH + COL.gap;
    });
  }

  function drawEmpty(ctx, x, y, w, text) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '400 22px ' + FONT;
    wrapOffset(ctx, text, w, 0).forEach(function (ln, i) {
      ctx.fillText(ln, x, y + i * 32);
    });
  }

  function drawFooter(ctx, h) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(199,210,254,0.6)';
    ctx.font = '500 24px ' + FONT;
    ctx.fillText('股小蜜 · 命理 × 投资，读懂你的财富节律', W / 2, h - 52);

    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font = '400 20px ' + FONT;
    var d = new Date();
    var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    ctx.fillText('生成于 ' + ds + ' · 仅供研究娱乐，不构成投资建议', W / 2, h - 22);
  }

  /**
   * @param {object} opts { name, gender, birthLabel, chart, traditional:[], conclusions:[] }
   * @returns {HTMLCanvasElement}
   */
  function render(opts) {
    opts = opts || {};
    var M = 56;
    var gutter = 40;
    var colW = (W - M * 2 - gutter) / 2;
    var leftX = M;
    var rightX = M + colW + gutter;

    var trad = (opts.traditional || []).filter(Boolean);
    var conc = (opts.conclusions || []).filter(Boolean);

    var mc = document.createElement('canvas').getContext('2d');
    var Ltrad = layoutColumn(mc, trad, colW);
    var Lconc = layoutColumn(mc, conc, colW);
    balanceColumns(Ltrad, Lconc);

    var chartX = 120;
    var chartY = 320;
    var chartSize = 840;
    var chartBottom = chartY + chartSize + 14;
    var headerY = chartBottom + 56;
    var bodyY = headerY + 48;
    var colsH = Math.max(Ltrad.height, Lconc.height, 70);
    var footerH = 92;
    var H = Math.max(1420, Math.round(bodyY + colsH + footerH));

    var canvas = document.createElement('canvas');
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    var ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    drawBackground(ctx, H);
    drawHeader(ctx, opts);
    drawChart(ctx, opts.chart, opts, { x: chartX, y: chartY, size: chartSize });

    drawColHeader(ctx, leftX, headerY, '传统命理 · 星盘断语', colW);
    drawColHeader(ctx, rightX, headerY, 'AI 财富结论', colW);

    // 竖分隔线
    ctx.fillStyle = 'rgba(251,191,36,0.14)';
    ctx.fillRect(M + colW + gutter / 2 - 1, headerY - 22, 2, colsH + 56);

    if (trad.length) drawColumn(ctx, Ltrad, leftX, bodyY, PARCH_BODY);
    else drawEmpty(ctx, leftX, bodyY, colW, '命盘就绪后自动生成星盘断语。');

    if (conc.length) drawColumn(ctx, Lconc, rightX, bodyY, GOLD_BODY);
    else drawEmpty(ctx, rightX, bodyY, colW, '生成命盘全析或财富密码后，AI 结论将自动呈现。');

    drawFooter(ctx, H);
    return canvas;
  }

  function download(canvas, filename) {
    try {
      var url = canvas.toDataURL('image/png');
      var a = document.createElement('a');
      a.href = url;
      a.download = filename || 'ziwei-poster.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    } catch (e) {
      return false;
    }
  }

  global.ZiweiSharePoster = {
    render: render,
    extractHighlights: extractHighlights,
    download: download,
    WIDTH: W,
  };
})(typeof window !== 'undefined' ? window : globalThis);
