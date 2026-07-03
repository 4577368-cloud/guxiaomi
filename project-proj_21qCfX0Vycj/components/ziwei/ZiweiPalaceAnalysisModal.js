/**
 * 宫位解读弹窗 — 双 Tab：预制解读 / AI 解读
 */
function ZiweiPalaceAnalysisModal({ analysis, activeTab, onTabChange, onClose, onRequestAi, onRetryAi }) {
  if (!analysis) return null;

  var tab = activeTab || 'rule';

  function renderRuleTab() {
    return (
      <div
        className="ziwei-palace-analysis-body"
        dangerouslySetInnerHTML={{ __html: analysis.ruleHtml || '<p class="text-stone-500 text-sm">暂无解读</p>' }}
      />
    );
  }

  function renderAiTab() {
    if (analysis.aiError) {
      return (
        <div className="px-2 py-8 text-center">
          <p className="text-sm text-red-700 mb-3">{analysis.aiError}</p>
          {onRetryAi && (
            <button
              type="button"
              onClick={onRetryAi}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-stone-800 text-white hover:bg-stone-700"
            >
              重试
            </button>
          )}
        </div>
      );
    }
    if (analysis.aiLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="icon-loader text-xl text-amber-700 animate-spin" aria-hidden />
          <p className="text-xs text-stone-500">AI 正在生成组合解读…</p>
        </div>
      );
    }
    if (analysis.aiHtml) {
      return (
        <div className="ziwei-palace-analysis-body" dangerouslySetInnerHTML={{ __html: analysis.aiHtml }} />
      );
    }
    return (
      <div className="py-10 text-center text-xs text-stone-500">
        切换到本页后将请求 AI 解读
      </div>
    );
  }

  function renderAiTabStatus() {
    if (analysis.aiError) {
      return (
        <span className="icon-alert-circle text-xs text-red-600 shrink-0" title="生成失败" aria-label="生成失败" />
      );
    }
    if (analysis.aiLoading) {
      return (
        <span
          className="icon-loader text-xs text-amber-600 animate-spin shrink-0"
          title="生成中"
          aria-label="生成中"
        />
      );
    }
    if (analysis.aiLoaded && analysis.aiHtml) {
      return (
        <span className="icon-check text-xs text-emerald-600 shrink-0" title="已完成" aria-label="已完成" />
      );
    }
    return (
      <span className="icon-circle text-[10px] text-stone-300 shrink-0" title="未生成" aria-label="未生成" />
    );
  }

  function handleTabClick(next) {
    if (onTabChange) onTabChange(next);
    if (next === 'ai' && onRequestAi) onRequestAi();
  }

  var tabBtnClass = function (id) {
    var on = tab === id;
    return (
      'flex-1 py-2 text-xs font-bold transition-colors border-b-2 ' +
      (on ? 'border-amber-700 text-amber-900 bg-amber-50/50' : 'border-transparent text-stone-500 hover:text-stone-700')
    );
  };

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center p-1.5 sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ziwei-palace-analysis-title"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-stone-900/50 backdrop-blur-[2px] rounded-lg" aria-hidden />
      <div
        className="relative z-10 w-[min(100%,22rem)] sm:w-[min(100%,28rem)] max-h-[min(82vh,32rem)] flex flex-col rounded-xl border border-stone-300/80 bg-[#faf8f5] shadow-2xl shadow-stone-900/25 overflow-hidden"
        onClick={function (e) {
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-stone-200 bg-gradient-to-r from-stone-100 to-[#f5f0e8] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="icon-compass text-amber-800/70 text-sm shrink-0" aria-hidden />
            <div className="min-w-0">
              <h3 id="ziwei-palace-analysis-title" className="text-sm font-black text-stone-900 truncate font-serif">
                {analysis.title}
              </h3>
              <p className="text-[10px] text-stone-500 truncate">
                {analysis.subtitle}
                {analysis.score != null && (
                  <span className="ml-1.5 text-amber-800 font-bold">· {analysis.score}星</span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-7 h-7 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 text-lg leading-none"
            aria-label="关闭解读"
          >
            ×
          </button>
        </div>

        <div className="flex shrink-0 border-b border-stone-200 bg-white/80">
          <button type="button" className={tabBtnClass('rule')} onClick={function () { handleTabClick('rule'); }}>
            解读
          </button>
          <button
            type="button"
            className={tabBtnClass('ai') + ' flex items-center justify-center gap-1.5'}
            onClick={function () {
              handleTabClick('ai');
            }}
          >
            <span>AI 解读</span>
            {renderAiTabStatus()}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 text-left bg-[#faf8f5]">
          {tab === 'rule' ? renderRuleTab() : renderAiTab()}
        </div>

        <div className="shrink-0 px-3 py-2 border-t border-stone-200 bg-stone-100/90 text-[10px] text-stone-500 text-center">
          {tab === 'ai' && analysis.modelLabel ? 'AI · ' + analysis.modelLabel + ' · ' : '玄枢引擎 · '}
          切换时间后需重新解析
        </div>
      </div>

      <style>{`
        .ziwei-palace-analysis-body .zp-ai-text { font-size: 13px; line-height: 1.65; color: #292524; }
        .ziwei-palace-analysis-body .zp-ai-h3 {
          font-size: 13px; font-weight: 800; color: #7c2d12; margin: 14px 0 6px;
          padding-left: 8px; border-left: 3px solid #b45309; font-family: ui-serif, Georgia, serif;
        }
        .ziwei-palace-analysis-body .zp-ai-h3:first-child { margin-top: 0; }
        .ziwei-palace-analysis-body .zp-ai-p { margin: 0 0 8px; }
      `}</style>
    </div>
  );
}
