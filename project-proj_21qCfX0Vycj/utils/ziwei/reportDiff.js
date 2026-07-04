/**
 * 紫微历史报告对比 / 流年演变：按命主分组 + 行级 LCS 差异。
 * window.ZiweiReportDiff
 */
(function (global) {
  'use strict';

  var SECTIONS = [
    { key: 'basicReport', label: '命盘全析' },
    { key: 'wealthReport', label: '财富密码' },
    { key: 'portfolioReport', label: '持仓排盘' },
    { key: 'stockReport', label: '持仓技术' },
    { key: 'flowReport', label: '流月流日' },
  ];

  /** 从「姓名+MMDD/日期」中还原命主名（去掉结尾日期数字） */
  function personKey(timeName) {
    var s = String(timeName || '').trim();
    var stripped = s.replace(/[\s_\-]*\d{2,8}$/, '').trim();
    return stripped || s || '未命名';
  }

  function tsValue(item) {
    // timestamp 形如 2026/07/04 12:00:00，直接字符串比较即可（同格式）
    return String((item && item.timestamp) || (item && item.timeName) || '');
  }

  function groupByPerson(list) {
    var map = {};
    (list || []).forEach(function (it) {
      if (!it || !it.timeName) return;
      var key = personKey(it.timeName);
      if (!map[key]) map[key] = [];
      map[key].push(it);
    });
    var groups = Object.keys(map).map(function (k) {
      var items = map[k].slice().sort(function (a, b) {
        return tsValue(b).localeCompare(tsValue(a)); // 新→旧
      });
      return { person: k, items: items, count: items.length };
    });
    groups.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return a.person.localeCompare(b.person);
    });
    return groups;
  }

  function splitLines(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .split('\n')
      .map(function (l) { return l.replace(/\s+$/, ''); });
  }

  /** 行级 LCS 差异；超大文本降级为「整体替换」避免内存爆炸 */
  function diffLines(oldText, newText) {
    var a = splitLines(oldText);
    var b = splitLines(newText);
    var n = a.length;
    var m = b.length;

    if (n * m > 4000000) {
      var out2 = [];
      a.forEach(function (l) { out2.push({ type: 'del', text: l }); });
      b.forEach(function (l) { out2.push({ type: 'add', text: l }); });
      return out2;
    }

    var dp = [];
    for (var i = 0; i <= n; i++) dp.push(new Int32Array(m + 1));
    for (i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
        else dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
      }
    }

    var out = [];
    i = 0;
    j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: a[i] }); i++; }
      else { out.push({ type: 'add', text: b[j] }); j++; }
    }
    while (i < n) { out.push({ type: 'del', text: a[i] }); i++; }
    while (j < m) { out.push({ type: 'add', text: b[j] }); j++; }
    return out;
  }

  function stats(diff) {
    var add = 0;
    var del = 0;
    (diff || []).forEach(function (d) {
      if (d.type === 'add') add++;
      else if (d.type === 'del') del++;
    });
    return { add: add, del: del, changed: add + del };
  }

  global.ZiweiReportDiff = {
    SECTIONS: SECTIONS,
    personKey: personKey,
    groupByPerson: groupByPerson,
    diffLines: diffLines,
    stats: stats,
  };
})(typeof window !== 'undefined' ? window : globalThis);
