/**
 * 紫微历史报告 ↔ Postgres（/api/ziwei/reports/*）
 */
(function (global) {
  'use strict';

  function getApiBase() {
    if (typeof getZiweiApiBase === 'function') return getZiweiApiBase();
    var injected = String(global.ANALYSIS_API_BASE || '').replace(/\/+$/, '');
    if (injected) return injected;
    if (typeof location !== 'undefined') {
      var host = location.hostname || '';
      if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8123';
      return String(location.origin || '').replace(/\/+$/, '');
    }
    return '';
  }

  async function fetchJson(path, options) {
    var base = getApiBase();
    if (!base) return null;
    try {
      var res = await fetch(base + path, options || {});
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('[ZiweiReportCloud]', path, e.message || e);
      return null;
    }
  }

  function normalizeItem(item) {
    if (!item) return null;
    return {
      timeName: item.timeName || item.report_name || '',
      input: item.input || item.input_text || '',
      timestamp: item.timestamp || '',
      basicReport: item.basicReport || item.basic_report || '',
      wealthReport: item.wealthReport || item.wealth_report || '',
      portfolioReport: item.portfolioReport || item.portfolio_report || '',
      stockReport: item.stockReport || item.stock_report || '',
      flowReport: item.flowReport || item.flow_report || '',
      model: item.model || '',
      chatHistory: item.chatHistory || [],
    };
  }

  async function loadReports() {
    var data = await fetchJson('/api/ziwei/reports/list?limit=50');
    if (!data || !data.ok || !Array.isArray(data.items)) return null;
    return data.items.map(normalizeItem).filter(function (it) { return it && it.timeName; });
  }

  async function saveReport(item) {
    var payload = normalizeItem(item);
    if (!payload || !payload.timeName) return false;
    var data = await fetchJson('/api/ziwei/reports/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return !!(data && data.ok);
  }

  async function deleteReport(timeName) {
    var name = String(timeName || '').trim();
    if (!name) return false;
    var data = await fetchJson('/api/ziwei/reports/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeName: name }),
    });
    return !!(data && data.ok);
  }

  global.ZiweiReportCloud = {
    loadReports: loadReports,
    saveReport: saveReport,
    deleteReport: deleteReport,
  };
})(typeof window !== 'undefined' ? window : globalThis);
