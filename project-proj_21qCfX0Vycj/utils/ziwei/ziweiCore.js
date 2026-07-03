/**
 * 紫微斗数排盘内核（玄枢 astrologyService 迁移）
 * 依赖：astrologyService.bundle.js、interpretationService.bundle.js（由 scripts/build-ziwei.sh 从 doushu0117 构建）
 */
(function (global) {
  'use strict';

  var astro = global.ZiweiAstrology;
  var interp = global.ZiweiInterpretation;
  var constants = global.ZiweiConstants;

  if (!astro || typeof astro.calculateChart !== 'function') {
    console.error('[ZiweiCore] astrologyService.bundle.js 未加载或 calculateChart 不可用');
    return;
  }

  /**
   * @param {number} year
   * @param {number} month
   * @param {number} day
   * @param {number} hour 0-23
   * @param {'male'|'female'} gender
   * @param {number} [lng=120] 出生地经度（真太阳时）
   * @returns {object|null}
   */
  function calculateZiweiChart(year, month, day, hour, gender, lng) {
    return astro.calculateChart(year, month, day, hour, gender, lng == null ? 120 : lng);
  }

  function calculateZiweiDaXianAnalysis(palaces, currentYearGan, currentAge) {
    return astro.calculateDaXianAnalysis(palaces, currentYearGan, currentAge);
  }

  function generateZiweiRuleBasedAnalysis(chart, palaceName, analysisYear, age) {
    if (!interp || typeof interp.generateRuleBasedAnalysis !== 'function') {
      return null;
    }
    return interp.generateRuleBasedAnalysis(chart, palaceName, analysisYear, age);
  }

  global.ZiweiCore = {
    calculateChart: calculateZiweiChart,
    calculateDaXianAnalysis: calculateZiweiDaXianAnalysis,
    generateRuleBasedAnalysis: generateZiweiRuleBasedAnalysis,
    constants: constants || null,
    version: '1.0.0-step1'
  };
})(typeof window !== 'undefined' ? window : globalThis);
