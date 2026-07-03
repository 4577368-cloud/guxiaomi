/**
 * 从粘贴的命盘文本中解析出生参数（Step 2 过渡方案，Step 3 将改为表单）
 */
(function (global) {
  'use strict';

  function inferGender(text) {
    if (!text) return 'male';
    if (/(?:^|\s)女(?:\s|$)|性别[：:]\s*女|female/i.test(text)) return 'female';
    if (/(?:^|\s)男(?:\s|$)|性别[：:]\s*男|male/i.test(text)) return 'male';
    return 'male';
  }

  function inferLng(text) {
    if (!text) return 120;
    var m = text.match(/经度[：:]\s*([\d.]+)/);
    if (m) return parseFloat(m[1]);
    m = text.match(/([\d.]+)\s*°?\s*E/);
    if (m) return parseFloat(m[1]);
    return 120;
  }

  function inferName(text) {
    if (!text) return '';
    var m = text.match(/(?:姓名|名字)[：:]\s*([^\s\n,，]+)/);
    if (m) return m[1].trim();
    return '';
  }

  /**
   * @param {string} text
   * @returns {{ y:number, m:number, d:number, h:number, gender:'male'|'female', lng:number, name:string }|null}
   */
  function parseZiweiBirthFromText(text) {
    if (!text || !String(text).trim()) return null;
    var s = String(text);

    var timeMatch = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})/);
    if (timeMatch) {
      return {
        y: parseInt(timeMatch[1], 10),
        m: parseInt(timeMatch[2], 10),
        d: parseInt(timeMatch[3], 10),
        h: parseInt(timeMatch[4], 10),
        gender: inferGender(s),
        lng: inferLng(s),
        name: inferName(s),
      };
    }

    var dateOnly = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (dateOnly) {
      return {
        y: parseInt(dateOnly[1], 10),
        m: parseInt(dateOnly[2], 10),
        d: parseInt(dateOnly[3], 10),
        h: 12,
        gender: inferGender(s),
        lng: inferLng(s),
        name: inferName(s),
      };
    }

    return null;
  }

  global.ZiweiBirthParse = {
    parseZiweiBirthFromText: parseZiweiBirthFromText,
  };
})(typeof window !== 'undefined' ? window : globalThis);
