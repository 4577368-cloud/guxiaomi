/**
 * 全盘 / 持仓报告用的结构化事实底稿（与宫位解读同源）
 */
(function (global) {
  'use strict';

  var PALACE_ORDER = [
    '命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄',
    '迁移', '交友', '官禄', '田宅', '福德', '父母',
  ];

  var PORTFOLIO_FOCUS = ['命宫', '财帛', '官禄', '田宅', '福德', '迁移'];

  function buildChart(profile) {
    if (!profile || !global.ZiweiChartTextExport) return null;
    return global.ZiweiChartTextExport.buildNatalChartFromProfile(profile);
  }

  function birthFromProfile(profile) {
    if (!profile || !global.ZiweiProfileUtils) return {};
    return global.ZiweiProfileUtils.profileToBirth(profile) || {};
  }

  function findPalace(chart, name) {
    return (chart.palaces || []).find(function (p) {
      return p.name === name;
    });
  }

  function calcVirtualAge(birthYear, refYear) {
    return refYear - birthYear + 1;
  }

  function parseDaXianRange(rangeStr) {
    if (!rangeStr) return null;
    var m = String(rangeStr).match(/(\d+)\s*[-~–]\s*(\d+)/);
    if (!m) return null;
    return { start: parseInt(m[1], 10), end: parseInt(m[2], 10), raw: rangeStr };
  }

  function formatStars(p, includeMinor) {
    if (!p || !p.stars) return '无主星';
    var parts = (p.stars.major || []).map(function (s) {
      var t = s.name;
      if (s.brightness) t += '[' + s.brightness + ']';
      if (s.hua) t += '化' + s.hua;
      return t;
    });
    if (includeMinor && p.stars.minor && p.stars.minor.length) {
      var minor = p.stars.minor
        .filter(function (s) { return !s.isFlow; })
        .map(function (s) {
          var t = s.name;
          if (s.hua) t += '化' + s.hua;
          return t;
        });
      if (minor.length) parts.push('辅：' + minor.join('、'));
    }
    return parts.length ? parts.join('、') : '无主星';
  }

  function exportOverview(chart, profile, refDate) {
    var ming = findPalace(chart, '命宫');
    var shen = (chart.palaces || []).find(function (p) {
      return p.isShen;
    });
    var lines = [
      '命主：' + (profile.name || '命主'),
      '五行局：' + (chart.bureau && chart.bureau.name ? chart.bureau.name : '未知'),
      '四柱：' + (chart.baZi ? chart.baZi.join(' ') : ''),
      '命宫：' + (ming ? ming.stem + ming.zhi + ' · ' + formatStars(ming) : '未知'),
      '身宫：' + (shen ? shen.name + '（' + shen.stem + shen.zhi + '）' : '未知'),
    ];
    var birth = birthFromProfile(profile);
    var year = refDate.getFullYear();
    if (birth.y) {
      lines.push('虚岁约：' + Math.max(1, calcVirtualAge(birth.y, year)) + '（' + year + '年基准）');
    }
    if (chart.patterns && chart.patterns.length) {
      lines.push(
        '全盘格局：' +
          chart.patterns
            .map(function (p) {
              return p.name;
            })
            .join('、')
      );
    }
    return lines.join('\n');
  }

  function exportSiHuaDetail(chart) {
    var lines = ['【四化详细事实】'];
    if (chart.yearGan) lines.push('生年天干：' + chart.yearGan);

    var typeMap = { 禄: [], 权: [], 科: [], 忌: [] };
    (chart.siHuaDisplay || []).forEach(function (item) {
      var key = item.type;
      if (!typeMap[key]) typeMap[key] = [];
      var palaceName = item.palace || item.palaceName || '';
      typeMap[key].push(item.star + (palaceName ? '@' + palaceName : ''));
    });
    ['禄', '权', '科', '忌'].forEach(function (t) {
      if (typeMap[t] && typeMap[t].length) {
        lines.push('化' + t + '：' + typeMap[t].join('、'));
      }
    });

    lines.push('');
    lines.push('【四化入宫效应】（引擎排盘）');
    var palaceHits = [];
    (chart.palaces || []).forEach(function (p) {
      (p.siHuaTexts || []).forEach(function (t) {
        var row =
          p.name +
          '：' +
          (t.star || '') +
          '化' +
          (t.hua || '') +
          (t.starDesc ? '｜' + t.starDesc : '') +
          (t.palaceDesc ? ' → ' + t.palaceDesc : '');
        palaceHits.push(row);
      });
    });
    if (palaceHits.length) {
      palaceHits.forEach(function (row) { lines.push('- ' + row); });
    } else {
      lines.push('- （命盘未记录入宫描述，请据星曜落宫自行组合论断）');
    }

    lines.push('');
    lines.push('【四化飞布扫描】（全盘的化禄/化权/化科/化忌星）');
    var flying = [];
    (chart.palaces || []).forEach(function (p) {
      [].concat(p.stars.major || [], p.stars.minor || []).forEach(function (s) {
        if (s.hua) flying.push(p.name + '·' + s.name + '化' + s.hua);
      });
    });
    if (flying.length) {
      lines.push(flying.join('、'));
    } else {
      lines.push('无');
    }

    return lines.join('\n');
  }

  function resolveCurrentNextDaXian(chart, age) {
    var ordered = [];
    (chart.palaces || []).forEach(function (p) {
      var r = parseDaXianRange(p.daXian);
      if (r) ordered.push({ palace: p, range: r });
    });
    ordered.sort(function (a, b) { return a.range.start - b.range.start; });

    var current = null;
    var next = null;
    var curIdx = -1;
    for (var i = 0; i < ordered.length; i++) {
      if (age >= ordered[i].range.start && age <= ordered[i].range.end) {
        current = ordered[i];
        curIdx = i;
        break;
      }
    }
    if (curIdx >= 0 && curIdx < ordered.length - 1) {
      next = ordered[curIdx + 1];
    }
    return { current: current, next: next, ordered: ordered };
  }

  function exportPalaceDaXianBlock(label, entry, chart) {
    if (!entry || !entry.palace) return label + '：无数据';
    var p = entry.palace;
    var lines = [
      label,
      '宫位：' + p.name + '（' + p.stem + p.zhi + '）',
      '大限区间：' + entry.range.raw + ' 虚岁',
      '主辅星：' + formatStars(p, true),
    ];
    if (p.changSheng) lines.push('长生：' + p.changSheng);

    if (global.ZiweiPalaceAnalysis && global.ZiweiPalaceAnalysis.exportPlainFacts) {
      lines.push('');
      lines.push(global.ZiweiPalaceAnalysis.exportPlainFacts(chart, p.name, {}));
    }
    return lines.join('\n');
  }

  function exportDaXianDetail(chart, profile, refDate) {
    if (!chart.palaces || !profile) return '';
    var birth = birthFromProfile(profile);
    if (!birth.y) return '';
    var refYear = refDate.getFullYear();
    var age = Math.max(1, calcVirtualAge(birth.y, refYear));
    var resolved = resolveCurrentNextDaXian(chart, age);
    var lines = [
      '【大限深度事实】',
      '参考虚岁：' + age + ' 岁（' + refYear + ' 年）',
      '',
    ];

    if (global.ZiweiCore && typeof global.ZiweiCore.calculateDaXianAnalysis === 'function') {
      var engine = global.ZiweiCore.calculateDaXianAnalysis(chart.palaces, chart.yearGan, age);
      if (engine && engine.currentDaXian) {
        var cur = engine.currentDaXian;
        lines.push(
          '引擎定位当前大限：' +
            cur.palace.name +
            '（' +
            cur.range +
            '）主星 ' +
            formatStars(cur.palace)
        );
        lines.push('');
      }
    }

    lines.push(exportPalaceDaXianBlock('▶ 当前大限（须重点展开）', resolved.current, chart));

    if (resolved.next) {
      lines.push('');
      lines.push(exportPalaceDaXianBlock('▶ 下一大限（须写转折）', resolved.next, chart));
      lines.push(
        '下一大限起运虚岁：约 ' + resolved.next.range.start + ' 岁（' + resolved.next.palace.name + '）'
      );
    } else {
      lines.push('');
      lines.push('▶ 下一大限：已是命盘最后一大限段，或未能定位');
    }

    lines.push('');
    lines.push('【大限总表】');
    resolved.ordered.forEach(function (item) {
      lines.push(
        item.palace.name +
          ' ' +
          item.palace.stem +
          item.palace.zhi +
          '：' +
          item.range.raw +
          ' · ' +
          formatStars(item.palace)
      );
    });

    return lines.join('\n');
  }

  function exportYearLayer(chart, year) {
    var idx = (year - 4) % 12;
    var ln = (chart.palaces || []).find(function (p) {
      var z = p.zhiIndex != null ? p.zhiIndex : p.index;
      return z === idx;
    });
    if (!ln) return '';
    return year + '年流年命宫叠在【' + ln.name + '】' + ln.stem + ln.zhi + ' · ' + formatStars(ln, true);
  }

  function exportPalaceFacts(chart, palaceName) {
    if (global.ZiweiPalaceAnalysis && global.ZiweiPalaceAnalysis.exportPlainFacts) {
      return global.ZiweiPalaceAnalysis.exportPlainFacts(chart, palaceName, {});
    }
    return '';
  }

  function buildFull(profile, options) {
    options = options || {};
    var refDate = options.refDate || new Date();
    var chart = buildChart(profile);
    if (!chart) return '';

    var year = refDate.getFullYear();
    var sections = [
      '=== 命盘全析·事实底稿（与同页宫位解读同源，请严格据此论断）===',
      '解析基准日：' + refDate.getFullYear() + '-' + (refDate.getMonth() + 1) + '-' + refDate.getDate(),
      '',
      '【命盘总览】',
      exportOverview(chart, profile, refDate),
      '',
      exportSiHuaDetail(chart),
      '',
      exportDaXianDetail(chart, profile, refDate),
      '',
      '【流年层】',
      exportYearLayer(chart, year),
      '',
      '【十二宫事实·逐宫】',
    ];

    PALACE_ORDER.forEach(function (name) {
      var block = exportPalaceFacts(chart, name);
      if (block) {
        sections.push('');
        sections.push(block);
      }
    });

    sections.push('');
    sections.push(
      '请仅根据以上事实撰写报告：论组合与三方引动；【生年四化全局】【当前大限深度】【下一大限前瞻】须充分展开，禁止单星词典罗列与模板套话。'
    );
    return sections.join('\n');
  }

  function buildPortfolioFocus(profile, options) {
    options = options || {};
    var refDate = options.refDate || new Date();
    var chart = buildChart(profile);
    if (!chart) return '';

    var year = refDate.getFullYear();
    var sections = [
      '=== 持仓排盘·命理事实底稿（聚焦财官田迁，与同页宫位解读同源）===',
      '解析基准日：' + refDate.getFullYear() + '-' + (refDate.getMonth() + 1) + '-' + refDate.getDate(),
      '',
      '【命盘总览】',
      exportOverview(chart, profile, refDate),
      '',
      exportSiHuaDetail(chart),
      '',
      exportDaXianDetail(chart, profile, refDate),
      '',
      '【流年层】',
      exportYearLayer(chart, year),
      '',
      '【关键宫位事实】',
    ];

    PORTFOLIO_FOCUS.forEach(function (name) {
      var block = exportPalaceFacts(chart, name);
      if (block) {
        sections.push('');
        sections.push(block);
      }
    });

    sections.push('');
    sections.push(
      '请结合下方持仓数据：先点财运格局，再逐股点评与仓位建议；禁止复述完整十二宫。'
    );
    return sections.join('\n');
  }

  global.ZiweiChartReportContext = {
    buildFull: buildFull,
    buildPortfolioFocus: buildPortfolioFocus,
  };
})(typeof window !== 'undefined' ? window : globalThis);
