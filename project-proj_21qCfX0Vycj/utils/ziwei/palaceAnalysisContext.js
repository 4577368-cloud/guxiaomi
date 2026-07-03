/**
 * 构建宫位 AI 解读用的结构化事实（无套路文案，仅供模型阅读）
 */
(function (global) {
  'use strict';

  var LUCKY = ['左辅', '右弼', '天魁', '天钺', '文昌', '文曲', '禄存'];
  var BAD = ['擎羊', '陀罗', '火星', '铃星', '地空', '地劫'];

  function getBranch(p) {
    if (!p) return undefined;
    return p.zhiIndex != null ? p.zhiIndex : p.index;
  }

  function findByBranch(palaces, idx) {
    return palaces.find(function (p) {
      return getBranch(p) === idx;
    });
  }

  function oppositeOf(palaces, zhi) {
    return findByBranch(palaces, (zhi + 6) % 12);
  }

  function trineOf(palaces, zhi) {
    return [
      findByBranch(palaces, (zhi + 4) % 12),
      findByBranch(palaces, (zhi + 8) % 12),
    ].filter(Boolean);
  }

  function modeLabel(timeMode, flow) {
    if (timeMode === 'year') return flow.year + '年流年层';
    if (timeMode === 'month') return flow.year + '年' + flow.month + '月流月层';
    if (timeMode === 'day') {
      return flow.year + '年' + flow.month + '月' + flow.day + '日' + flow.hour + '时流日层';
    }
    return '本命盘层';
  }

  function fmtStar(s) {
    if (!s) return '';
    var t = s.name;
    if (s.brightness) t += '[' + s.brightness + ']';
    if (s.hua) t += '化' + s.hua;
    if (s.isFlow) t += '(流)';
    return t;
  }

  function fmtPalaceStars(p) {
    if (!p || !p.stars) return '无主星';
    var maj = (p.stars.major || []).map(fmtStar);
    var natalMin = (p.stars.minor || []).filter(function (s) {
      return !s.isFlow;
    }).map(fmtStar);
    var flowMin = (p.stars.minor || []).filter(function (s) {
      return s.isFlow;
    }).map(fmtStar);
    var parts = [];
    if (maj.length) parts.push('主星：' + maj.join('、'));
    else parts.push('主星：无');
    if (natalMin.length) parts.push('辅煞：' + natalMin.join('、'));
    if (flowMin.length) parts.push('流曜：' + flowMin.join('、'));
    return parts.join('；');
  }

  function palaceScore(palace, chart) {
    if (global.ZiweiPalaceAnalysis && global.ZiweiPalaceAnalysis.calculateScore) {
      return global.ZiweiPalaceAnalysis.calculateScore(palace, chart);
    }
    return null;
  }

  function exportPalaceBlock(title, p) {
    if (!p) return title + '：无数据';
    return title + '（' + p.stem + p.zhi + '，大限' + (p.daXian || '—') + '）\n  ' + fmtPalaceStars(p);
  }

  function relatedPatterns(chart, palace) {
    var names = new Set(
      [].concat(palace.stars.major, palace.stars.minor).map(function (s) {
        return s.name;
      })
    );
    return (chart.patterns || []).filter(function (pat) {
      return (pat.stars || []).some(function (s) {
        return names.has(s);
      });
    });
  }

  function buildPalaceAnalysisContext(chart, palaceName, options) {
    options = options || {};
    var palace = (chart.palaces || []).find(function (p) {
      return p.name === palaceName;
    });
    if (!palace) return '';

    var flow = options.flow || {};
    var timeMode = options.timeMode || 'natal';
    var birth = options.birth || {};
    var zhi = getBranch(palace);
    var opp = oppositeOf(chart.palaces, zhi);
    var trine = trineOf(chart.palaces, zhi);
    var lines = [];

    lines.push('=== 宫位专项分析请求 ===');
    lines.push('时间层：' + modeLabel(timeMode, flow));
    if (birth.y) lines.push('命主出生：' + birth.y + '年，解析时虚岁约 ' + Math.max(1, (flow.year || new Date().getFullYear()) - birth.y + 1));
    lines.push('');

    lines.push(exportPalaceBlock('【本宫·' + palace.name + '】', palace));

    lines.push(exportPalaceBlock('【对宫·' + (opp ? opp.name : '—') + '】', opp));
    trine.forEach(function (p) {
      lines.push(exportPalaceBlock('【三合·' + p.name + '】', p));
    });

    var pats = relatedPatterns(chart, palace);
    if (pats.length) {
      lines.push('');
      lines.push('【触发的格局】');
      pats.forEach(function (pat) {
        lines.push('- ' + pat.name + '（' + (pat.type || '') + '）：' + (pat.description || ''));
      });
    }

    var score = palaceScore(palace, chart);
    if (score) {
      lines.push('');
      lines.push('【量化参考】三方四正局势约 ' + score.score + ' 星（' + score.reason + '），仅供结合星情判断，不可单独定论。');
    }

    if (timeMode === 'year' && flow.year) {
      var lnIdx = (flow.year - 4) % 12;
      var lnPalace = chart.palaces.find(function (p) {
        return getBranch(p) === lnIdx;
      });
      if (lnPalace) {
        lines.push('');
        lines.push('【' + flow.year + '年流年命宫】叠在 ' + lnPalace.name + '：' + fmtPalaceStars(lnPalace));
      }
    }

    if (chart.yearGan) {
      lines.push('生年天干：' + chart.yearGan);
    }
    if (chart.siHuaDisplay && chart.siHuaDisplay.length) {
      lines.push(
        '生年四化：' +
          chart.siHuaDisplay
            .map(function (x) {
              return x.star + '化' + x.type;
            })
            .join('、')
      );
    }

    lines.push('');
    lines.push('请仅根据以上事实，解读【' + palace.name + '】在「' + modeLabel(timeMode, flow) + '」下的组合意义。');

    return lines.join('\n');
  }

  global.ZiweiPalaceAnalysisContext = {
    build: buildPalaceAnalysisContext,
  };
})(typeof window !== 'undefined' ? window : globalThis);
