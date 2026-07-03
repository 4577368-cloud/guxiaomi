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

  function buildChart(profile, refDate) {
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
    if (chart.siHuaDisplay && chart.siHuaDisplay.length) {
      lines.push(
        '生年四化：' +
          chart.siHuaDisplay
            .map(function (x) {
              return x.star + '化' + x.type + (x.palace ? '@' + x.palace : '');
            })
            .join('、')
      );
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
    var birth = birthFromProfile(profile);
    var year = refDate.getFullYear();
    if (birth.y) {
      lines.push('虚岁约：' + Math.max(1, year - birth.y + 1) + '（' + year + '年基准）');
    }
    return lines.join('\n');
  }

  function formatStars(p) {
    if (!p || !p.stars) return '无主星';
    var maj = (p.stars.major || []).map(function (s) {
      var t = s.name;
      if (s.brightness) t += '[' + s.brightness + ']';
      if (s.hua) t += '化' + s.hua;
      return t;
    });
    return maj.length ? maj.join('、') : '无主星';
  }

  function exportDaXian(chart, profile, refDate) {
    if (!chart.palaces || !profile) return '';
    var birth = birthFromProfile(profile);
    if (!birth.y) return '';
    var age = Math.max(1, refDate.getFullYear() - birth.y + 1);
    var cur = null;
    chart.palaces.forEach(function (p) {
      if (!p.daXian) return;
      var m = String(p.daXian).match(/(\d+)\s*[-~–]\s*(\d+)/);
      if (!m) return;
      var lo = parseInt(m[1], 10);
      var hi = parseInt(m[2], 10);
      if (age >= lo && age <= hi) cur = p;
    });
    if (!cur) return '当前大限：未能从命盘定位（请结合大限区间判断）';
    return (
      '当前大限：' +
      cur.name +
      '（' +
      cur.stem +
      cur.zhi +
      '，' +
      cur.daXian +
      '）\n' +
      '大限主星：' +
      formatStars(cur)
    );
  }

  function exportYearLayer(chart, year) {
    var idx = (year - 4) % 12;
    var ln = (chart.palaces || []).find(function (p) {
      var z = p.zhiIndex != null ? p.zhiIndex : p.index;
      return z === idx;
    });
    if (!ln) return '';
    return year + '年流年命宫叠在【' + ln.name + '】' + ln.stem + ln.zhi + ' · ' + formatStars(ln);
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
    var chart = buildChart(profile, refDate);
    if (!chart) return '';

    var year = refDate.getFullYear();
    var sections = [
      '=== 命盘全析·事实底稿（与同页宫位解读同源，请严格据此论断）===',
      '解析基准日：' + refDate.getFullYear() + '-' + (refDate.getMonth() + 1) + '-' + refDate.getDate(),
      '',
      '【命盘总览】',
      exportOverview(chart, profile, refDate),
      '',
      '【大限与流年】',
      exportDaXian(chart, profile, refDate),
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
      '请仅根据以上事实撰写报告：论组合与三方引动，禁止单星词典罗列与模板套话。'
    );
    return sections.join('\n');
  }

  function buildPortfolioFocus(profile, options) {
    options = options || {};
    var refDate = options.refDate || new Date();
    var chart = buildChart(profile, refDate);
    if (!chart) return '';

    var year = refDate.getFullYear();
    var sections = [
      '=== 持仓排盘·命理事实底稿（聚焦财官田迁，与同页宫位解读同源）===',
      '解析基准日：' + refDate.getFullYear() + '-' + (refDate.getMonth() + 1) + '-' + refDate.getDate(),
      '',
      '【命盘总览】',
      exportOverview(chart, profile, refDate),
      '',
      '【大限与流年】',
      exportDaXian(chart, profile, refDate),
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
