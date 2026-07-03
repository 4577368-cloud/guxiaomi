/**
 * 将 calculateChart 结构化命盘导出为 AI 报告可用的命盘文本（替代文墨天机粘贴）
 */
(function (global) {
  'use strict';

  var PALACE_ORDER = [
    '命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄',
    '迁移', '交友', '官禄', '田宅', '福德', '父母',
  ];

  var PALACE_DISPLAY = {
    '交友': '交友宫（奴仆宫）',
  };

  function palaceLabel(name) {
    if (name === '交友') return PALACE_DISPLAY['交友'];
    return name + (name.indexOf('宫') === name.length - 1 ? '' : '宫');
  }

  function formatBirthHeader(profile) {
    if (!profile || !profile.birthDate) return '';
    var parts = profile.birthDate.split('-').map(function (x) { return parseInt(x, 10); });
    var tp = (profile.birthTime || '12:00').split(':');
    var h = parseInt(tp[0], 10) || 0;
    var m = parseInt(tp[1], 10) || 0;
    var gender = profile.gender === 'female' ? '女' : '男';
    return parts[0] + '-' + parts[1] + '-' + parts[2] + ' ' + h + ':' + m + ' ' + gender;
  }

  function formatStar(star) {
    if (!star || !star.name) return '';
    var s = star.name;
    if (star.brightness) s += '[' + star.brightness + ']';
    if (star.hua) s += '化' + star.hua;
    if (star.isFlow) s += '(流)';
    return s;
  }

  function joinStars(stars) {
    if (!stars || !stars.length) return '无';
    return stars.map(formatStar).join('、');
  }

  function formatSolarLine(chart) {
    var solar = chart.solar;
    if (!solar) return '';
    try {
      if (typeof solar.toYmdHms === 'function') return '公历：' + solar.toYmdHms();
      return '公历：' + solar.getYear() + '-' + solar.getMonth() + '-' + solar.getDay() + ' ' +
        solar.getHour() + ':' + (solar.getMinute ? solar.getMinute() : 0);
    } catch (_) {
      return '';
    }
  }

  function formatLunarLine(chart) {
    var lunar = chart.lunar;
    if (!lunar) return '';
    try {
      var parts = [];
      if (typeof lunar.toString === 'function') parts.push('农历：' + lunar.toString());
      if (typeof lunar.getYearInGanZhi === 'function' && typeof lunar.getMonthInChinese === 'function') {
        parts.push(
          '农历干支：' + lunar.getYearInGanZhi() + '年 ' +
          lunar.getMonthInChinese() + '月 ' +
          (typeof lunar.getDayInChinese === 'function' ? lunar.getDayInChinese() : '')
        );
      }
      if (typeof lunar.getTimeZhi === 'function') {
        parts.push('时辰：' + lunar.getTimeZhi() + '时');
      }
      if (typeof lunar.getJieQi === 'function') {
        var jq = lunar.getJieQi();
        if (jq) parts.push('节气：' + jq);
      }
      return parts.join('\n');
    } catch (_) {
      return '';
    }
  }

  function findPalace(chart, name) {
    return (chart.palaces || []).find(function (p) { return p.name === name; });
  }

  function calcVirtualAge(birthYear, refYear) {
    return refYear - birthYear + 1;
  }

  function exportSiHuaSection(chart) {
    var lines = ['【生年四化】'];
    if (chart.yearGan) lines.push('生年天干：' + chart.yearGan);
    if (chart.siHuaDisplay && chart.siHuaDisplay.length) {
      chart.siHuaDisplay.forEach(function (item) {
        lines.push('化' + item.type + '：' + item.star);
      });
    }
    (chart.palaces || []).forEach(function (p) {
      if (p.siHuaTexts && p.siHuaTexts.length) {
        p.siHuaTexts.forEach(function (t) {
          var line = palaceLabel(p.name) + '：' + (t.star || '') + '化' + (t.hua || '');
          if (t.starDesc) line += '（' + t.starDesc + '）';
          if (t.palaceDesc) line += ' → ' + t.palaceDesc;
          lines.push(line);
        });
      }
    });
    return lines.join('\n');
  }

  function exportPalaceSection(chart) {
    var lines = ['【十二宫星曜分布】'];
    PALACE_ORDER.forEach(function (name) {
      var p = findPalace(chart, name);
      if (!p) return;
      var tags = [];
      if (p.isMing) tags.push('命宫');
      if (p.isShen) tags.push('身宫');
      var head = '■ ' + palaceLabel(name) + '（' + (p.stem || '') + (p.zhi || '') + '）';
      if (tags.length) head += ' [' + tags.join('、') + ']';
      if (p.daXian) head += ' 大限' + p.daXian;
      if (p.changSheng) head += ' 长生:' + p.changSheng;
      lines.push(head);
      lines.push('  主星：' + joinStars(p.stars && p.stars.major));
      lines.push('  辅星：' + joinStars(p.stars && p.stars.minor));
    });
    return lines.join('\n');
  }

  function exportDaXianSection(chart, profile, refDate) {
    var lines = ['【大限总表】'];
    PALACE_ORDER.forEach(function (name) {
      var p = findPalace(chart, name);
      if (p && p.daXian) {
        lines.push(palaceLabel(name) + '（' + (p.stem || '') + (p.zhi || '') + '）：大限 ' + p.daXian);
      }
    });

    if (!profile || !profile.birthDate || !global.ZiweiCore) return lines.join('\n');
    var birthYear = parseInt(profile.birthDate.split('-')[0], 10);
    var refYear = refDate ? refDate.getFullYear() : new Date().getFullYear();
    var age = calcVirtualAge(birthYear, refYear);
    lines.push('');
    lines.push('【当前大限】（虚岁 ' + age + ' 岁，参考年 ' + refYear + '）');
    var analysis = global.ZiweiCore.calculateDaXianAnalysis(chart.palaces, chart.yearGan, age);
    if (analysis && analysis.currentDaXian) {
      var cur = analysis.currentDaXian;
      lines.push(
        '当前行运：' + palaceLabel(cur.palace.name) + '  区间 ' + cur.range +
        '  主星：' + joinStars(cur.palace.stars && cur.palace.stars.major)
      );
    } else {
      lines.push('（未能定位当前大限，请结合大限总表判断）');
    }
    return lines.join('\n');
  }

  function exportPatternsSection(chart) {
    if (!chart.patterns || !chart.patterns.length) {
      return '【格局】\n无特殊格局记录';
    }
    var lines = ['【格局与特殊组合】'];
    chart.patterns.forEach(function (pat, i) {
      lines.push((i + 1) + '. ' + pat.name + '（' + (pat.type || '') + '）：' + (pat.description || ''));
    });
    return lines.join('\n');
  }

  function exportOverview(chart, profile) {
    var ming = findPalace(chart, '命宫');
    var shen = (chart.palaces || []).find(function (p) { return p.isShen; });
    var lines = [
      '【命盘总览】',
      '命主：' + (profile && profile.name ? profile.name : '命主'),
      '五行局：' + (chart.bureau && chart.bureau.name ? chart.bureau.name : '未知'),
      '四柱八字：' + (chart.baZi ? chart.baZi.join(' ') : ''),
      '命宫：' + (ming ? ming.stem + ming.zhi : '') + '  主星 ' + joinStars(ming && ming.stars && ming.stars.major),
      '身宫：' + (shen ? palaceLabel(shen.name) + '（' + shen.stem + shen.zhi + '）' : '未知'),
    ];
    if (profile && profile.city) {
      lines.push('出生地：' + (profile.province || '') + (profile.city ? ' ' + profile.city : '') +
        '  经度 ' + (profile.longitude != null ? profile.longitude : 120));
    }
    return lines.join('\n');
  }

  /**
   * @param {object} profile 出生档案
   * @param {object} chart calculateChart 结果
   * @param {{ refDate?: Date }} [options]
   */
  function exportChartText(profile, chart, options) {
    if (!profile || !chart || !chart.palaces) return '';

    var opts = options || {};
    var refDate = opts.refDate || new Date();
    var sections = [
      '══════════════════════════════════════',
      '紫微斗数命盘（股小蜜玄枢引擎自动生成）',
      '══════════════════════════════════════',
      '',
      formatBirthHeader(profile),
      formatSolarLine(chart),
      formatLunarLine(chart),
      '',
      exportOverview(chart, profile),
      '',
      exportSiHuaSection(chart),
      '',
      exportPalaceSection(chart),
      '',
      exportDaXianSection(chart, profile, refDate),
      '',
      exportPatternsSection(chart),
      '',
      '【说明】以上命盘由出生信息与玄枢排盘引擎计算，十二宫主星、辅星、四化、大限、格局均来自程序排盘，可直接用于命理分析与投资报告生成。',
    ];

    return sections.filter(function (line) { return line !== null && line !== undefined; }).join('\n');
  }

  function buildNatalChartFromProfile(profile) {
    if (!profile || !global.ZiweiProfileUtils || !global.ZiweiCore) return null;
    var err = global.ZiweiProfileUtils.validateProfile(profile);
    if (err) return null;
    var birth = global.ZiweiProfileUtils.profileToBirth(profile);
    if (!birth) return null;
    return global.ZiweiCore.calculateChart(birth.y, birth.m, birth.d, birth.h, birth.gender, birth.lng);
  }

  function exportFromProfile(profile, options) {
    var chart = buildNatalChartFromProfile(profile);
    if (!chart) return '';
    return exportChartText(profile, chart, options);
  }

  global.ZiweiChartTextExport = {
    exportChartText: exportChartText,
    buildNatalChartFromProfile: buildNatalChartFromProfile,
    exportFromProfile: exportFromProfile,
  };
})(typeof window !== 'undefined' ? window : globalThis);
