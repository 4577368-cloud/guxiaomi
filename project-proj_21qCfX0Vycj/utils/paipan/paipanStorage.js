/** 排盘页本地历史：命盘快照 + AI 报告 */
(function () {
  var STORAGE_KEY = 'paipan_history_v1';
  var MAX_ITEMS = 16;

  function formatBirthLabel(birthInfo) {
    if (!birthInfo) return '未命名命盘';
    var y = birthInfo.year || '?';
    var m = birthInfo.month || '?';
    var d = birthInfo.day || '?';
    var g = birthInfo.gender === 'female' ? '女' : '男';
    var hourOpt = typeof getHourOptions === 'function'
      ? getHourOptions().find(function (o) {
          return String(o.value) === String(birthInfo.hour);
        })
      : null;
    var hourShort = hourOpt ? hourOpt.label.split(' ')[0] : '';
    return y + '/' + m + '/' + d + ' ' + g + (hourShort ? ' ' + hourShort : '');
  }

  function loadPaipanHistory() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function savePaipanHistory(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify((list || []).slice(0, MAX_ITEMS)));
    } catch (e) {
      console.warn('保存排盘历史失败', e);
    }
  }

  function buildRecord(payload) {
    payload = payload || {};
    var birthInfo = payload.birthInfo || {};
    var now = new Date().toISOString();
    return {
      id: payload.id || 'pp_' + Date.now(),
      label: payload.label || formatBirthLabel(birthInfo),
      birthInfo: birthInfo,
      chartData: payload.chartData || null,
      aiAnalysis: payload.aiAnalysis || '',
      savedAt: payload.savedAt || now,
      updatedAt: now,
    };
  }

  function upsertPaipanRecord(record) {
    var list = loadPaipanHistory();
    var rec = buildRecord(record);
    var idx = list.findIndex(function (x) {
      return x.id === rec.id;
    });
    if (idx >= 0) {
      list[idx] = Object.assign({}, list[idx], rec, { savedAt: list[idx].savedAt });
    } else {
      list.unshift(rec);
    }
    savePaipanHistory(list);
    return list.slice(0, MAX_ITEMS);
  }

  function deletePaipanRecord(id) {
    var list = loadPaipanHistory().filter(function (x) {
      return x.id !== id;
    });
    savePaipanHistory(list);
    return list;
  }

  window.PaipanStorage = {
    STORAGE_KEY: STORAGE_KEY,
    MAX_ITEMS: MAX_ITEMS,
    formatBirthLabel: formatBirthLabel,
    loadPaipanHistory: loadPaipanHistory,
    savePaipanHistory: savePaipanHistory,
    upsertPaipanRecord: upsertPaipanRecord,
    deletePaipanRecord: deletePaipanRecord,
    buildRecord: buildRecord,
  };
})();
