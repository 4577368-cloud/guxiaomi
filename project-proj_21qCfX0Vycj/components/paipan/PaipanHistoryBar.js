/** 排盘历史：横向列表，一键恢复 */
function PaipanHistoryBar({ history, activeId, onLoad, onDelete, onSaveCurrent, canSave, saving }) {
  if (!history || !history.length) {
    return (
      <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 to-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="icon-history text-base text-indigo-600" aria-hidden />
            <div>
              <h3 className="text-sm font-bold text-slate-800">历史排盘</h3>
              <p className="text-xs text-slate-500">排盘后可保存，下次一键恢复生辰、命盘与 AI 报告</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onSaveCurrent}
            disabled={!canSave || saving}
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-40"
          >
            <div className={`icon-save text-sm ${saving ? 'animate-pulse' : ''}`} aria-hidden />
            {saving ? '保存中' : '保存当前'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="icon-history text-base text-indigo-600" aria-hidden />
          <h3 className="text-sm font-bold text-slate-800">历史排盘</h3>
          <span className="text-xs text-slate-400">({history.length})</span>
        </div>
        <button
          type="button"
          onClick={onSaveCurrent}
          disabled={!canSave || saving}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
        >
          <div className={`icon-save text-sm ${saving ? 'animate-pulse' : ''}`} aria-hidden />
          {saving ? '保存中' : '保存当前'}
        </button>
      </div>
      <div className="custom-scrollbar flex gap-2 overflow-x-auto px-3 py-2.5">
        {history.map(function (item) {
          var isActive = item.id === activeId;
          var hasAi = !!(item.aiAnalysis && String(item.aiAnalysis).trim());
          return (
            <div
              key={item.id}
              className={
                'group flex min-w-[10.5rem] shrink-0 items-stretch overflow-hidden rounded-lg border text-left transition ' +
                (isActive
                  ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200'
                  : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-white')
              }
            >
              <button
                type="button"
                onClick={function () {
                  onLoad(item);
                }}
                className="min-w-0 flex-1 px-2.5 py-2"
              >
                <div className="truncate text-xs font-bold text-slate-800">{item.label}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                  <span>{item.savedAt ? new Date(item.savedAt).toLocaleDateString('zh-CN') : ''}</span>
                  {hasAi && (
                    <span className="rounded bg-purple-100 px-1 py-0.5 text-purple-700">AI</span>
                  )}
                </div>
              </button>
              <button
                type="button"
                onClick={function (e) {
                  e.stopPropagation();
                  if (window.confirm('删除这条历史排盘？')) onDelete(item.id);
                }}
                className="border-l border-slate-200 px-2 text-slate-400 opacity-0 transition hover:text-rose-600 group-hover:opacity-100"
                title="删除"
                aria-label="删除"
              >
                <div className="icon-trash-2 text-sm" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
