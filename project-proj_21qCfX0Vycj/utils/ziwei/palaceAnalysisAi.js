/**
 * 宫位 AI 解读（非流式，结构化 Markdown 填入）
 */
(function (global) {
  'use strict';

  var SYSTEM_PROMPT =
    '你是资深紫微斗数实务派命理师，精通三合与飞星，擅长从「星曜组合+三方四正+四化+时间层」做整体论断。\n\n' +
    '【任务】根据用户提供的排盘事实，解读指定宫位在当前时间层下的真实呈现。\n\n' +
    '【必须做到】\n' +
    '1. 论组合：主星、辅煞、本宫与对宫/三合的联动机理。\n' +
    '2. 论现状：此刻可观察到的具体表现与反复模式。\n' +
    '3. 论三方四正：对宫与三合如何牵引本宫。\n' +
    '4. 流年/流月/流日层只谈该层引动，不写空泛套话。\n' +
    '5. 结尾 1～2 条实务建议。\n\n' +
    '【严禁】单星词典罗列、大限/流年模板句、臆造星曜。\n\n' +
    '【输出格式】严格四个二级标题（##），每段 2～4 句：\n' +
    '## 组合断语\n## 现状表现\n## 三方四正引动\n## 实务建议';

  /**
   * @param {{ apiBase, modelKey, context, signal, maxTokens }} opts
   * @returns {Promise<string>}
   */
  function fetchPalaceAnalysis(opts) {
    var apiBase = (opts.apiBase || '').replace(/\/+$/, '');
    if (!apiBase) {
      return Promise.reject(new Error('未配置分析 API，请启动后端或与股票分析同域部署'));
    }

    var controller = opts.signal ? null : new AbortController();
    var signal = opts.signal || (controller && controller.signal);
    var timeoutId = setTimeout(function () {
      if (controller) controller.abort();
    }, opts.timeoutMs || 120000);

    return fetch(apiBase + '/api/llm/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: SYSTEM_PROMPT,
        user: opts.context,
        stream: false,
        max_tokens: opts.maxTokens || 2048,
        model_key: opts.modelKey || 'model2',
      }),
      signal: signal,
    })
      .then(function (response) {
        clearTimeout(timeoutId);
        return response.json().then(function (data) {
          if (!response.ok) {
            throw new Error(data.detail || data.error || 'HTTP ' + response.status);
          }
          if (data.content == null && !data.ok) {
            throw new Error(data.detail || 'API 返回异常');
          }
          return data.content != null ? data.content : '';
        });
      })
      .catch(function (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') throw new Error('解析超时，请重试');
        throw err;
      });
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatInline(text) {
    return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
  }

  function markdownToHtml(text) {
    if (!text) return '';
    var parts = text.split(/^## /m);
    var html = '<div class="zp-ai-text">';
    if (parts[0] && parts[0].trim()) {
      html += '<p class="zp-ai-p">' + formatInline(parts[0].trim()) + '</p>';
    }
    for (var i = 1; i < parts.length; i++) {
      var chunk = parts[i];
      var nl = chunk.indexOf('\n');
      var title = nl >= 0 ? chunk.slice(0, nl).trim() : chunk.trim();
      var body = nl >= 0 ? chunk.slice(nl + 1).trim() : '';
      if (title) html += '<h3 class="zp-ai-h3">' + escapeHtml(title) + '</h3>';
      if (body) html += '<p class="zp-ai-p">' + formatInline(body) + '</p>';
    }
    return html + '</div>';
  }

  global.ZiweiPalaceAnalysisAi = {
    SYSTEM_PROMPT: SYSTEM_PROMPT,
    fetch: fetchPalaceAnalysis,
    markdownToHtml: markdownToHtml,
  };
})(typeof window !== 'undefined' ? window : globalThis);
