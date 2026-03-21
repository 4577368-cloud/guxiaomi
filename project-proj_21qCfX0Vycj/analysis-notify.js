/**
 * 全局分析任务完成提醒：任意页面轮询 localStorage 中的 analysis_job_id，
 * 分析完成或失败时弹窗提示（不依赖当前是否在分析页）。
 */
(function () {
  var JOB_STORAGE_KEY = 'analysis_job_id';
  var POLL_INTERVAL_MS = 3000;

  function getApiBase() {
    var params = new URLSearchParams(window.location.search);
    var api = params.get('api') || params.get('apiPort') || '';
    if (window.ANALYSIS_API_BASE) return window.ANALYSIS_API_BASE;
    if (api) {
      if (/^https?:\/\//i.test(api)) return api;
      var h = window.location.hostname;
      if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:' + api;
    }
    try {
      var saved = localStorage.getItem('analysis_api_base');
      if (saved) return saved;
    } catch (_) {}
    h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:8123';
    return '';
  }

  function showNotifyModal(title, message, isSuccess) {
    if (document.getElementById('analysis-notify-overlay')) return;

    var overlay = document.createElement('div');
    overlay.id = 'analysis-notify-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,0.2);max-width:360px;width:100%;padding:24px;';

    var titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:12px;color:' + (isSuccess ? '#059669' : '#dc2626') + ';';
    titleEl.textContent = title;

    var msgEl = document.createElement('div');
    msgEl.style.cssText = 'font-size:14px;color:#374151;line-height:1.5;margin-bottom:20px;white-space:pre-wrap;word-break:break-word;';
    msgEl.textContent = message;

    var btnWrap = document.createElement('div');
    btnWrap.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';

    function closeModal() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    var btnClose = document.createElement('button');
    btnClose.textContent = '确定';
    btnClose.style.cssText = 'px-4 py-2 rounded-lg font-medium bg-blue-600 text-white border:none;cursor:pointer;padding:8px 16px;font-size:14px;';
    btnClose.onclick = closeModal;

    var btnGo = document.createElement('button');
    btnGo.textContent = '前往查看';
    btnGo.style.cssText = 'padding:8px 16px;font-size:14px;border-radius:8px;font-weight:500;background:#059669;color:#fff;border:none;cursor:pointer;';
    btnGo.onclick = function () {
      closeModal();
      var base = window.location.pathname.replace(/\/[^/]*$/, '') || '';
      window.location.href = (base ? base + '/' : '') + 'analysis.html' + window.location.search;
    };

    overlay.onclick = function (e) {
      if (e.target === overlay) closeModal();
    };

    btnWrap.appendChild(btnClose);
    if (isSuccess) btnWrap.appendChild(btnGo);
    box.appendChild(titleEl);
    box.appendChild(msgEl);
    box.appendChild(btnWrap);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function pollJob(jobId) {
    var apiBase = getApiBase();
    if (!apiBase) {
      console.warn('analysis-notify: 未配置 ANALYSIS_API_BASE，跳过任务轮询');
      return;
    }
    var intervalId = setInterval(function () {
      fetch(apiBase + '/api/analyze/status/' + jobId)
        .then(function (res) {
          if (res.status === 404) {
            clearInterval(intervalId);
            try { localStorage.removeItem(JOB_STORAGE_KEY); } catch (_) {}
            return Promise.reject(new Error('NOT_FOUND'));
          }
          return res.ok ? res.json() : Promise.reject();
        })
        .then(function (data) {
          if (data.status === 'done') {
            clearInterval(intervalId);
            try { localStorage.removeItem(JOB_STORAGE_KEY); } catch (_) {}
            showNotifyModal('分析已完成', '报告已生成并保存，可点击「前往查看」打开分析页查看。', true);
          } else if (data.status === 'failed') {
            clearInterval(intervalId);
            try { localStorage.removeItem(JOB_STORAGE_KEY); } catch (_) {}
            showNotifyModal('分析失败', (data.error || '未知错误').trim(), false);
          }
        })
        .catch(function (err) {
          if (err && err.message === 'NOT_FOUND') {
            console.warn('分析任务状态已失效(404)，可能后端已重启。已停止轮询并清除本地任务 ID。');
          }
        });
    }, POLL_INTERVAL_MS);
  }

  function startPollIfNeeded() {
    try {
      var jobId = localStorage.getItem(JOB_STORAGE_KEY);
      if (jobId && jobId.trim()) pollJob(jobId.trim());
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPollIfNeeded);
  } else {
    startPollIfNeeded();
  }
})();
