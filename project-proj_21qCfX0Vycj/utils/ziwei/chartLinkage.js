/**
 * 宫位联动图谱逻辑：三方四正 + 宫干四化飞星（牵引关系）。
 * 纯计算，不依赖 React，供 ZiweiChartView / ZiweiChartPanel 复用。
 */
(function (global) {
  'use strict';

  var HUA_ORDER = ['禄', '权', '科', '忌'];

  var HUA_META = {
    禄: { label: '禄', color: '#059669', tone: 'emerald', desc: '财禄、机遇、顺遂' },
    权: { label: '权', color: '#dc2626', tone: 'red', desc: '权力、主导、扩张' },
    科: { label: '科', color: '#2563eb', tone: 'blue', desc: '名声、贵人、功名' },
    忌: { label: '忌', color: '#44403c', tone: 'stone', desc: '执着、纠葛、耗损' },
  };

  function getSiHuaTable() {
    if (global.ZiweiConstants && global.ZiweiConstants.SI_HUA_TABLE) {
      return global.ZiweiConstants.SI_HUA_TABLE;
    }
    return null;
  }

  function getBranchCenters() {
    if (global.ZiweiConstants && global.ZiweiConstants.BRANCH_CENTERS) {
      return global.ZiweiConstants.BRANCH_CENTERS;
    }
    return {
      0: { x: 62.5, y: 87.5 }, 1: { x: 37.5, y: 87.5 }, 2: { x: 12.5, y: 87.5 },
      3: { x: 12.5, y: 62.5 }, 4: { x: 12.5, y: 37.5 }, 5: { x: 12.5, y: 12.5 },
      6: { x: 37.5, y: 12.5 }, 7: { x: 62.5, y: 12.5 }, 8: { x: 87.5, y: 12.5 },
      9: { x: 87.5, y: 37.5 }, 10: { x: 87.5, y: 62.5 }, 11: { x: 87.5, y: 87.5 },
    };
  }

  /** 建立「星名 → 所在宫位」索引（主星优先，含辅星） */
  function indexStars(chart) {
    var map = {};
    if (!chart || !chart.palaces) return map;
    chart.palaces.forEach(function (p) {
      var all = [].concat(p.stars && p.stars.major ? p.stars.major : [], p.stars && p.stars.minor ? p.stars.minor : []);
      all.forEach(function (s) {
        if (s && s.name && !map[s.name]) {
          map[s.name] = { palaceName: p.name, zhiIndex: p.zhiIndex, type: s.type, hua: s.hua || null };
        }
      });
    });
    return map;
  }

  function findPalace(chart, palaceName) {
    if (!chart || !chart.palaces) return null;
    for (var i = 0; i < chart.palaces.length; i++) {
      if (chart.palaces[i].name === palaceName) return chart.palaces[i];
    }
    return null;
  }

  /** 三方四正的地支索引：本宫 / 财帛位(三合) / 官禄位(三合) / 对宫 */
  function sanFangIndices(zhiIndex) {
    if (zhiIndex === undefined || zhiIndex === null) return null;
    return {
      self: zhiIndex,
      wealth: (zhiIndex + 4) % 12,
      career: (zhiIndex + 8) % 12,
      opposite: (zhiIndex + 6) % 12,
    };
  }

  /**
   * 宫干四化飞星（本宫飞出）：以宫干查四化表，定位四颗被化星现落何宫。
   * @returns {Array<{hua,star,fromZhiIndex,fromPalaceName,toZhiIndex,toPalaceName,toStarType,found}>}
   */
  function palaceFlying(chart, palaceName) {
    var table = getSiHuaTable();
    var palace = findPalace(chart, palaceName);
    if (!table || !palace || !palace.stem) return [];
    var huaMap = table[palace.stem];
    if (!huaMap) return [];

    var starIndex = indexStars(chart);
    var result = [];
    Object.keys(huaMap).forEach(function (starName) {
      var hua = huaMap[starName];
      var loc = starIndex[starName];
      result.push({
        hua: hua,
        star: starName,
        fromZhiIndex: palace.zhiIndex,
        fromPalaceName: palace.name,
        fromStem: palace.stem,
        toZhiIndex: loc ? loc.zhiIndex : null,
        toPalaceName: loc ? loc.palaceName : null,
        toStarType: loc ? loc.type : null,
        found: !!loc,
      });
    });
    result.sort(function (a, b) { return HUA_ORDER.indexOf(a.hua) - HUA_ORDER.indexOf(b.hua); });
    return result;
  }

  /**
   * 某星被谁引动（飞入）：扫描全盘各宫，若其宫干四化命中该星，则记为一条飞入线。
   * @returns {Array<{hua,fromPalaceName,fromZhiIndex,fromStem,toZhiIndex,toPalaceName}>}
   */
  function starInbound(chart, starName) {
    var table = getSiHuaTable();
    if (!table || !starName || !chart || !chart.palaces) return [];
    var starIndex = indexStars(chart);
    var loc = starIndex[starName];
    var result = [];
    chart.palaces.forEach(function (p) {
      if (!p.stem) return;
      var huaMap = table[p.stem];
      if (!huaMap || !huaMap[starName]) return;
      result.push({
        hua: huaMap[starName],
        fromPalaceName: p.name,
        fromZhiIndex: p.zhiIndex,
        fromStem: p.stem,
        toZhiIndex: loc ? loc.zhiIndex : null,
        toPalaceName: loc ? loc.palaceName : null,
      });
    });
    result.sort(function (a, b) { return HUA_ORDER.indexOf(a.hua) - HUA_ORDER.indexOf(b.hua); });
    return result;
  }

  /** 生年四化列表（星带 hua 者），用于图例/摘要 */
  function birthHua(chart) {
    var out = [];
    if (!chart || !chart.palaces) return out;
    chart.palaces.forEach(function (p) {
      var all = [].concat(p.stars && p.stars.major ? p.stars.major : [], p.stars && p.stars.minor ? p.stars.minor : []);
      all.forEach(function (s) {
        if (s && s.hua) out.push({ hua: s.hua, star: s.name, palaceName: p.name, zhiIndex: p.zhiIndex });
      });
    });
    out.sort(function (a, b) { return HUA_ORDER.indexOf(a.hua) - HUA_ORDER.indexOf(b.hua); });
    return out;
  }

  global.ZiweiChartLinkage = {
    HUA_ORDER: HUA_ORDER,
    HUA_META: HUA_META,
    getBranchCenters: getBranchCenters,
    indexStars: indexStars,
    findPalace: findPalace,
    sanFangIndices: sanFangIndices,
    palaceFlying: palaceFlying,
    starInbound: starInbound,
    birthHua: birthHua,
  };
})(typeof window !== 'undefined' ? window : globalThis);
