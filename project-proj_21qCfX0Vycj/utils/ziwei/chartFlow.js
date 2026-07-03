/**
 * 本命 + 流年/流月/流日 合并显示（移植自玄枢 ZiweiView）
 */
(function (global) {
  'use strict';

  function getPalaceBranch(palace) {
    if (!palace) return undefined;
    if (palace.zhiIndex !== undefined) return palace.zhiIndex;
    if (palace.dizhi !== undefined) return palace.dizhi;
    if (palace.earthlyBranch !== undefined) return palace.earthlyBranch;
    return palace.index;
  }

  /**
   * @param {object} natal
   * @param {object} flow
   * @returns {object}
   */
  function mergeFlowChart(natal, flow) {
    if (!natal || !flow) return natal;

    var merged = Object.assign({}, natal);
    merged.siHuaDisplay = flow.siHuaDisplay;
    merged.yearGan = flow.yearGan;

    var flowPalaceMap = new Map();
    flow.palaces.forEach(function (p) {
      var branch = getPalaceBranch(p);
      if (branch !== undefined) flowPalaceMap.set(branch, p);
    });

    merged.palaces = natal.palaces.map(function (natalPalace) {
      var currentBranch = getPalaceBranch(natalPalace);
      var flowPalace =
        flowPalaceMap.size > 0
          ? flowPalaceMap.get(currentBranch)
          : flow.palaces[natal.palaces.indexOf(natalPalace)];

      var overlayMinor = (flowPalace && flowPalace.stars && flowPalace.stars.minor) || [];
      var flowStarsMap = {};
      var flowStars = []
        .concat((flowPalace && flowPalace.stars && flowPalace.stars.major) || [])
        .concat((flowPalace && flowPalace.stars && flowPalace.stars.minor) || []);
      flowStars.forEach(function (star) {
        flowStarsMap[star.name] = star;
      });

      var baseNames = new Set(
        natalPalace.stars.major
          .map(function (s) { return s.name; })
          .concat(natalPalace.stars.minor.map(function (s) { return s.name; }))
      );

      var starsToAdd = overlayMinor
        .filter(function (s) { return !baseNames.has(s.name); })
        .map(function (s) {
          return Object.assign({}, s, { isFlow: true });
        });

      var updatedMajor = natalPalace.stars.major.map(function (s) {
        return Object.assign({}, s, { hua: (flowStarsMap[s.name] && flowStarsMap[s.name].hua) || s.hua });
      });
      var updatedMinor = natalPalace.stars.minor
        .map(function (s) {
          return Object.assign({}, s, { hua: (flowStarsMap[s.name] && flowStarsMap[s.name].hua) || s.hua });
        })
        .concat(starsToAdd);

      return Object.assign({}, natalPalace, {
        stars: {
          major: updatedMajor,
          minor: updatedMinor,
        },
      });
    });

    return merged;
  }

  /**
   * @param {object} birth { y, m, d, h, gender, lng }
   * @param {'natal'|'year'|'month'|'day'} timeMode
   * @param {{ year:number, month:number, day:number, hour:number }} flowTime
   * @returns {object|null}
   */
  function buildDisplayChart(birth, timeMode, flowTime) {
    if (!birth || !global.ZiweiCore) return null;
    var calc = global.ZiweiCore.calculateChart;
    var natal = calc(birth.y, birth.m, birth.d, birth.h, birth.gender, birth.lng);
    if (!natal) return null;
    if (timeMode === 'natal') return natal;

    var y = flowTime.year;
    var m = timeMode === 'month' || timeMode === 'day' ? flowTime.month : birth.m;
    var d = timeMode === 'day' ? flowTime.day : birth.d;
    var h = timeMode === 'day' ? flowTime.hour : birth.h;

    var flow = calc(y, m, d, h, birth.gender, birth.lng);
    if (!flow) return natal;
    return mergeFlowChart(natal, flow);
  }

  global.ZiweiChartFlow = {
    mergeFlowChart: mergeFlowChart,
    buildDisplayChart: buildDisplayChart,
  };
})(typeof window !== 'undefined' ? window : globalThis);
