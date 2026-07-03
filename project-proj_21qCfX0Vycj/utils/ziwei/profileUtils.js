/**
 * 命盘档案 ↔ 排盘参数转换
 */
(function (global) {
  'use strict';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function normalizeDate(dateStr) {
    if (!dateStr) return '';
    var s = String(dateStr).trim().replace(/\//g, '-');
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return s;
    return m[1] + '-' + pad2(parseInt(m[2], 10)) + '-' + pad2(parseInt(m[3], 10));
  }

  function parseTimeParts(timeStr) {
    if (!timeStr) return { h: 12, min: 0 };
    var m = String(timeStr).trim().match(/^(\d{1,2}):(\d{1,2})/);
    if (!m) return { h: 12, min: 0 };
    return {
      h: Math.min(23, Math.max(0, parseInt(m[1], 10))),
      min: Math.min(59, Math.max(0, parseInt(m[2], 10))),
    };
  }

  /**
   * @param {object} profile
   * @returns {{ y,m,d,h,gender,lng,name }|null}
   */
  function profileToBirth(profile) {
    if (!profile || !profile.birthDate) return null;
    var date = normalizeDate(profile.birthDate);
    var dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dm) return null;
    var tp = parseTimeParts(profile.birthTime);
    return {
      y: parseInt(dm[1], 10),
      m: parseInt(dm[2], 10),
      d: parseInt(dm[3], 10),
      h: tp.h,
      gender: profile.gender === 'female' ? 'female' : 'male',
      lng: profile.longitude != null ? Number(profile.longitude) : 120,
      name: profile.name || '命主',
    };
  }

  function formatProfileLabel(profile) {
    if (!profile) return '';
    var name = profile.name || '未命名';
    var date = normalizeDate(profile.birthDate);
    var time = profile.birthTime || '';
    return name + ' · ' + date + (time ? ' ' + time : '');
  }

  function formatBirthLabel(profile) {
    if (!profile) return '';
    var b = profileToBirth(profile);
    if (!b) return '';
    return b.y + '-' + b.m + '-' + b.d + ' ' + pad2(b.h) + ':00';
  }

  function validateProfile(profile) {
    if (!profile) return '档案无效';
    if (!profile.birthDate) return '请填写出生日期';
    var date = normalizeDate(profile.birthDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '日期格式应为 YYYY-MM-DD';
    var parts = date.split('-').map(function (x) { return parseInt(x, 10); });
    var y = parts[0], mo = parts[1], d = parts[2];
    if (y < 1900 || y > 2100) return '年份需在 1900–2100';
    if (mo < 1 || mo > 12) return '月份无效';
    var maxDay = new Date(y, mo, 0).getDate();
    if (d < 1 || d > maxDay) return '日期无效';
    if (!profile.birthTime || !/^\d{1,2}:\d{2}$/.test(profile.birthTime)) return '请填写出生时间 HH:mm';
    return null;
  }

  function getAllCities() {
    var data = (global.ZiweiConstants && global.ZiweiConstants.PROVINCE_DATA) || [];
    var out = [];
    data.forEach(function (prov) {
      (prov.cities || []).forEach(function (city) {
        out.push({
          province: prov.name,
          name: city.name,
          longitude: city.lng != null ? city.lng : city.longitude,
        });
      });
    });
    return out;
  }

  /**
   * 从粘贴文本生成草稿档案
   */
  function profileFromPastedText(text) {
    if (!global.ZiweiBirthParse) return null;
    var parsed = global.ZiweiBirthParse.parseZiweiBirthFromText(text);
    if (!parsed) return null;
    var p = global.ZiweiProfileStorage
      ? global.ZiweiProfileStorage.createEmptyProfile()
      : { id: 'zp_import_' + Date.now() };
    p.name = parsed.name || '';
    p.gender = parsed.gender;
    p.birthDate = parsed.y + '-' + pad2(parsed.m) + '-' + pad2(parsed.d);
    p.birthTime = pad2(parsed.h) + ':00';
    p.longitude = parsed.lng;
    return p;
  }

  global.ZiweiProfileUtils = {
    normalizeDate: normalizeDate,
    profileToBirth: profileToBirth,
    formatProfileLabel: formatProfileLabel,
    formatBirthLabel: formatBirthLabel,
    validateProfile: validateProfile,
    getAllCities: getAllCities,
    profileFromPastedText: profileFromPastedText,
  };
})(typeof window !== 'undefined' ? window : globalThis);
