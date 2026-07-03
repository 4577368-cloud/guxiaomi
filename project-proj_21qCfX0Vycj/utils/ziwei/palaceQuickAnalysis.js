/**
 * 宫位解读：局势评分 + 结构化预制解读（无套路套话）
 */
(function (global) {
  'use strict';

  var LUCKY_STARS = ['左辅', '右弼', '天魁', '天钺', '文昌', '文曲', '禄存'];
  var BAD_STARS = ['擎羊', '陀罗', '火星', '铃星', '地空', '地劫'];
  var BRIGHT = ['庙', '旺'];
  var DIM = ['陷'];

  function getPalaceBranch(palace) {
    if (!palace) return undefined;
    if (palace.zhiIndex !== undefined) return palace.zhiIndex;
    return palace.index;
  }

  function findByBranch(palaces, idx) {
    return palaces.find(function (p) {
      return getPalaceBranch(p) === idx;
    });
  }

  function getOppositePalace(palaces, zhiIndex) {
    return findByBranch(palaces, (zhiIndex + 6) % 12);
  }

  function getTrinePalaces(palaces, zhiIndex) {
    return [
      findByBranch(palaces, (zhiIndex + 4) % 12),
      findByBranch(palaces, (zhiIndex + 8) % 12),
    ].filter(Boolean);
  }

  function getSanFangSiZheng(palaces, zhiIndex) {
    return {
      self: findByBranch(palaces, zhiIndex),
      opposite: getOppositePalace(palaces, zhiIndex),
      trine: getTrinePalaces(palaces, zhiIndex),
    };
  }

  function getPalaceTheme(name) {
    var themes = global.ZiweiConstants && global.ZiweiConstants.PALACE_THEMES;
    return (themes && themes[name]) || '人生领域';
  }

  function getStarBrief(name) {
    var info = global.ZiweiConstants && global.ZiweiConstants.STAR_INFO;
    if (!info || !info[name]) return '';
    var text = info[name];
    return text.length > 56 ? text.slice(0, 54) + '…' : text;
  }

  function formatStarLine(palace) {
    if (!palace || !palace.stars) return '空宫';
    var parts = (palace.stars.major || []).map(function (s) {
      var t = s.name;
      if (s.brightness) t += '(' + s.brightness + ')';
      if (s.hua) t += '化' + s.hua;
      return t;
    });
    (palace.stars.minor || []).forEach(function (s) {
      if (s.isFlow) parts.push(s.name + '(流)');
      else if (parts.length < 8) parts.push(s.name);
    });
    return parts.length ? parts.join('、') : '空宫';
  }

  function calculatePalaceScore(palace, chart) {
    var score = 3;
    var reasons = [];
    var zhi = getPalaceBranch(palace);
    var group = getTrinePalaces(chart.palaces, zhi)
      .concat([palace, getOppositePalace(chart.palaces, zhi)])
      .filter(Boolean);
    var luckyCount = 0;
    var badCount = 0;
    var brightCount = 0;

    group.forEach(function (p) {
      [].concat(p.stars.major, p.stars.minor).forEach(function (s) {
        if (BRIGHT.indexOf(s.brightness || '') >= 0) brightCount++;
        if (DIM.indexOf(s.brightness || '') >= 0) score -= 0.2;
        if (LUCKY_STARS.indexOf(s.name) >= 0) luckyCount++;
        if (BAD_STARS.indexOf(s.name) >= 0) badCount++;
      });
    });

    score += luckyCount * 0.5;
    score -= badCount * 0.5;
    score += brightCount * 0.2;
    if (luckyCount > badCount + 2) reasons.push('吉星拱照');
    else if (badCount > luckyCount + 1) reasons.push('煞星冲破');
    else reasons.push('吉凶参半');
    if (brightCount > 5) reasons.push('星曜得地');

    return {
      score: Math.max(1, Math.min(5, Math.round(score * 2) / 2)),
      reason: reasons.join('，'),
      luckyCount: luckyCount,
      badCount: badCount,
    };
  }

  function getModeLabel(timeMode, flow) {
    if (timeMode === 'year') return flow.year + '年流年';
    if (timeMode === 'month') return flow.year + '年' + flow.month + '月流月';
    if (timeMode === 'day') {
      return flow.year + '年' + flow.month + '月' + flow.day + '日' + flow.hour + '时流日';
    }
    return '本命盘';
  }

  function buildScoreSection(palace, chart) {
    var r = calculatePalaceScore(palace, chart);
    var level = r.score >= 4.5 ? '上佳' : r.score >= 3.5 ? '中上' : r.score >= 2.5 ? '中等' : '偏弱';
    return (
      '<div class="zp-score-box">' +
      '<div class="zp-score-main"><span class="zp-score-num">' +
      r.score +
      '</span><span class="zp-score-unit">星</span><span class="zp-score-level">' +
      level +
      '</span></div>' +
      '<p class="zp-score-reason">' +
      r.reason +
      '（三方吉' +
      r.luckyCount +
      '、煞' +
      r.badCount +
      '）</p></div>'
    );
  }

  function interpretCombination(palace, sanFang) {
    var lines = [];
    var theme = getPalaceTheme(palace.name);

    if (!palace.stars.major.length) {
      var opp = sanFang.opposite;
      if (opp && opp.stars.major.length) {
        lines.push(
          '空宫借对宫【' + opp.name + '】' + formatStarLine(opp) + '，在「' + theme + '」上多受外界/对宫人事牵动。'
        );
      } else {
        lines.push('本宫与对宫皆无主星，「' + theme + '」议题缺乏固定主轴，随大运流年引动而变。');
      }
    } else if (palace.stars.major.length > 1) {
      lines.push(
        '双星同宫：' +
          formatStarLine(palace) +
          '，「' +
          theme +
          '」呈现两种特质交织，遇吉则互相成全，遇煞则互相激荡。'
      );
    } else {
      var main = palace.stars.major[0];
      var brief = getStarBrief(main.name);
      lines.push('独坐' + main.name + (main.brightness ? '(' + main.brightness + ')' : '') + '，主「' + theme + '」。' + (brief || ''));
    }

    var minor = (palace.stars.minor || []).filter(function (s) {
      return !s.isFlow;
    });
    var lucky = minor.filter(function (s) {
      return LUCKY_STARS.indexOf(s.name) >= 0;
    });
    var bad = minor.filter(function (s) {
      return BAD_STARS.indexOf(s.name) >= 0;
    });
    if (lucky.length && bad.length) {
      lines.push('本宫吉煞同见（' + lucky.map(function (s) { return s.name; }).join('、') + ' vs ' + bad.map(function (s) { return s.name; }).join('、') + '），吉凶起伏明显。');
    } else if (bad.length) {
      lines.push('本宫见煞（' + bad.map(function (s) { return s.name; }).join('、') + '），该领域易有阻滞、竞争或破耗。');
    } else if (lucky.length) {
      lines.push('本宫见吉（' + lucky.map(function (s) { return s.name; }).join('、') + '），该领域易得助力。');
    }

    return lines.join('');
  }

  function buildSanFangSection(palace, sanFang) {
    var rows =
      '<div class="zp-sf-stars">' +
      '<div class="zp-sf-row"><span class="zp-sf-tag">本宫</span>' +
      formatStarLine(sanFang.self) +
      '</div>';
    if (sanFang.opposite) {
      rows +=
        '<div class="zp-sf-row"><span class="zp-sf-tag">对宫</span><b>' +
        sanFang.opposite.name +
        '</b> ' +
        formatStarLine(sanFang.opposite) +
        '</div>';
    }
    sanFang.trine.forEach(function (p) {
      rows +=
        '<div class="zp-sf-row"><span class="zp-sf-tag">三合</span><b>' +
        p.name +
        '</b> ' +
        formatStarLine(p) +
        '</div>';
    });
    rows += '</div>';

    var combo = [];
    if (sanFang.opposite && palace.stars.major.length && sanFang.opposite.stars.major.length) {
      combo.push('本宫与对宫皆有主星，该领域内外因素并重。');
    }
    var allLucky = [];
    var allBad = [];
    [sanFang.self, sanFang.opposite]
      .concat(sanFang.trine)
      .forEach(function (p) {
        if (!p) return;
        [].concat(p.stars.major, p.stars.minor).forEach(function (s) {
          if (LUCKY_STARS.indexOf(s.name) >= 0) allLucky.push(s.name);
          if (BAD_STARS.indexOf(s.name) >= 0) allBad.push(s.name);
        });
      });
    if (allBad.length >= 3) combo.push('三方煞曜偏多，宜防连带拖累。');
    if (allLucky.length >= 3 && allBad.length <= 1) combo.push('三方吉曜有力，可借势拓展。');

    var hua = [];
    [sanFang.self, sanFang.opposite]
      .concat(sanFang.trine)
      .forEach(function (p) {
        if (!p) return;
        [].concat(p.stars.major, p.stars.minor).forEach(function (s) {
          if (s.hua) hua.push(p.name + s.name + '化' + s.hua);
        });
      });
    if (hua.length) combo.push('四化：' + hua.join('、') + '。');

    return rows + (combo.length ? '<p class="zp-sf-combo">' + combo.join('') + '</p>' : '');
  }

  function buildFlowSection(chart, palace, timeMode, flow) {
    if (timeMode === 'natal') return '';
    var parts = [];
    var flowStars = [].concat(palace.stars.major, palace.stars.minor).filter(function (s) {
      return s.isFlow;
    });
    if (flowStars.length) {
      parts.push('流曜：' + flowStars.map(function (s) { return s.name + (s.hua ? '化' + s.hua : ''); }).join('、'));
    }
    if (timeMode === 'year') {
      var idx = (flow.year - 4) % 12;
      var ln = chart.palaces.find(function (p) {
        return getPalaceBranch(p) === idx;
      });
      if (ln) {
        parts.push(flow.year + '流年命宫在【' + ln.name + '】' + (ln.name === palace.name ? '（叠本宫）' : '') + '：' + formatStarLine(ln));
      }
    }
    return parts.length ? '<p class="zp-flow-line">' + parts.join(' · ') + '</p>' : '';
  }

  function extractSiHuaSection(chart, palaceName, year, age) {
    if (!global.ZiweiInterpretation || typeof global.ZiweiInterpretation.generateRuleBasedAnalysis !== 'function') {
      return '';
    }
    try {
      var raw = global.ZiweiInterpretation.generateRuleBasedAnalysis(chart, palaceName, year, age);
      var match = raw.match(/<h4>四化变幻<\/h4>([\s\S]*?)(?=<h4>|$)/);
      if (!match) return '';
      return match[1].replace(/<h4[^>]*>[^<]*<\/h4>/g, '').trim();
    } catch (e) {
      return '';
    }
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

  function wrapSection(title, body) {
    if (!body) return '';
    return (
      '<section class="zp-section"><h4 class="zp-sec">' +
      title +
      '</h4><div class="zp-sec-body">' +
      body +
      '</div></section>'
    );
  }

  function getStyles() {
    return (
      '<style>' +
      '.ziwei-palace-analysis-body .ziwei-structured{font-size:13px;line-height:1.65;color:#292524}' +
      '.ziwei-palace-analysis-body .zp-section{padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid #e7e5e4}' +
      '.ziwei-palace-analysis-body .zp-section:last-child{border:0;margin:0;padding:0}' +
      '.ziwei-palace-analysis-body .zp-sec{font-size:13px;font-weight:800;color:#7c2d12;margin:0 0 6px;padding-left:8px;border-left:3px solid #b45309;font-family:ui-serif,Georgia,serif}' +
      '.ziwei-palace-analysis-body .zp-score-box{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #e7e5e4;border-radius:8px;padding:10px}' +
      '.ziwei-palace-analysis-body .zp-score-num{font-size:28px;font-weight:900;color:#92400e}' +
      '.ziwei-palace-analysis-body .zp-score-unit{font-size:12px;color:#b45309;font-weight:700}' +
      '.ziwei-palace-analysis-body .zp-score-level{font-size:11px;background:#b45309;color:#fff;padding:2px 6px;border-radius:4px;margin-left:6px}' +
      '.ziwei-palace-analysis-body .zp-score-reason{font-size:12px;color:#57534e;flex:1}' +
      '.ziwei-palace-analysis-body .zp-sf-row{font-size:11px;padding:4px 0;border-bottom:1px dashed #e7e5e4}' +
      '.ziwei-palace-analysis-body .zp-sf-tag{font-size:9px;font-weight:800;background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:3px;margin-right:4px}' +
      '.ziwei-palace-analysis-body .zp-sf-combo{margin-top:8px;padding:8px;background:#fffbeb;border-radius:6px;font-size:12px;color:#78350f}' +
      '.ziwei-palace-analysis-body .zp-flow-line{font-size:12px;color:#57534e}' +
      '.ziwei-palace-analysis-body .zp-pattern{margin-bottom:6px;font-size:12px}' +
      '.ziwei-palace-analysis-body .bg-indigo-50,.ziwei-palace-analysis-body .bg-indigo-50\\/50{background:#fafaf9!important}' +
      '.ziwei-palace-analysis-body .text-indigo-900,.ziwei-palace-analysis-body .text-slate-700{color:#44403c!important}' +
      '</style>'
    );
  }

  function generateStructuredPalaceAnalysis(chart, palaceName, options) {
    options = options || {};
    var palace = (chart.palaces || []).find(function (p) {
      return p.name === palaceName;
    });
    if (!palace) return { html: '<p>宫位数据不可用</p>' };

    var flow = options.flow || {};
    var timeMode = options.timeMode || 'natal';
    var birth = options.birth || {};
    var year = flow.year || new Date().getFullYear();
    var age = birth.y ? Math.max(0, year - birth.y) : 30;
    var sanFang = getSanFangSiZheng(chart.palaces, getPalaceBranch(palace));

    var sections = [
      wrapSection('局势得分', buildScoreSection(palace, chart)),
      wrapSection('组合断语', '<p>' + interpretCombination(palace, sanFang) + '</p>'),
    ];

    var flowHtml = buildFlowSection(chart, palace, timeMode, flow);
    if (flowHtml) sections.push(wrapSection('流运', flowHtml));

    sections.push(wrapSection('三方四正', buildSanFangSection(palace, sanFang)));

    var siHua = extractSiHuaSection(chart, palaceName, year, age);
    if (siHua) sections.push(wrapSection('四化', siHua));

    var pats = relatedPatterns(chart, palace);
    if (pats.length) {
      var patHtml = pats
        .map(function (pat) {
          return (
            '<div class="zp-pattern"><b>【' +
            pat.name +
            '】</b> ' +
            (pat.description || '') +
            '</div>'
          );
        })
        .join('');
      sections.push(wrapSection('格局', patHtml));
    }

    return {
      html: getStyles() + '<div class="ziwei-structured">' + sections.join('') + '</div>',
    };
  }

  function exportPlainPalaceFacts(chart, palaceName, options) {
    options = options || {};
    var palace = (chart.palaces || []).find(function (p) {
      return p.name === palaceName;
    });
    if (!palace) return '';

    var sanFang = getSanFangSiZheng(chart.palaces, getPalaceBranch(palace));
    var score = calculatePalaceScore(palace, chart);
    var lines = [];

    lines.push('【' + palace.name + '】' + palace.stem + palace.zhi + ' · 大限' + (palace.daXian || '—'));
    lines.push('星曜：' + formatStarLine(palace));
    lines.push('组合：' + interpretCombination(palace, sanFang));
    lines.push('局势：' + score.score + '星（' + score.reason + '）');

    if (sanFang.opposite) {
      lines.push('对宫【' + sanFang.opposite.name + '】' + formatStarLine(sanFang.opposite));
    }
    sanFang.trine.forEach(function (p) {
      lines.push('三合【' + p.name + '】' + formatStarLine(p));
    });

    var hua = [];
    [palace, sanFang.opposite]
      .concat(sanFang.trine)
      .forEach(function (p) {
        if (!p) return;
        [].concat(p.stars.major, p.stars.minor).forEach(function (s) {
          if (s.hua) hua.push(p.name + s.name + '化' + s.hua);
        });
      });
    if (hua.length) lines.push('四化：' + hua.join('、'));

    var pats = relatedPatterns(chart, palace);
    if (pats.length) {
      lines.push(
        '格局：' +
          pats
            .map(function (pat) {
              return pat.name + '（' + (pat.description || '') + '）';
            })
            .join('；')
      );
    }

    return lines.join('\n');
  }

  global.ZiweiPalaceAnalysis = {
    calculateScore: calculatePalaceScore,
    getModeLabel: getModeLabel,
    generateStructured: generateStructuredPalaceAnalysis,
    exportPlainFacts: exportPlainPalaceFacts,
  };
})(typeof window !== 'undefined' ? window : globalThis);
