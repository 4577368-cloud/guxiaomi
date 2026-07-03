/**
 * 命盘档案切换条（仅档案卡片，标题由父级提供）
 */
function ZiweiProfileSwitcher({ profiles, activeId, isNewDraft, onSelect, onDelete, layout }) {
  var vertical = layout === 'vertical';

  if ((!profiles || !profiles.length) && !isNewDraft) {
    return (
      <p className="text-[11px] text-slate-500 py-1">填写下方信息后点「保存」</p>
    );
  }

  return (
    <div
      className={
        vertical
          ? 'flex flex-col gap-1.5 max-h-36 overflow-y-auto no-scrollbar'
          : 'flex gap-1.5 overflow-x-auto pb-0.5'
      }
      style={vertical ? undefined : { scrollbarWidth: 'thin' }}
    >
      {isNewDraft && (
        <div
          className={
            'flex items-center rounded-lg border border-cyan-400/60 bg-cyan-500/10 px-2 py-1.5 ' +
            (vertical ? 'w-full' : 'shrink-0')
          }
        >
          <span className="text-xs font-bold text-cyan-200">新建档案</span>
          <span className="ml-1.5 text-[10px] text-cyan-400/80">编辑中</span>
        </div>
      )}
      {(profiles || []).map(function (p) {
        var active = !isNewDraft && p.id === activeId;
        return (
          <div
            key={p.id}
            className={
              'group relative flex items-stretch rounded-lg border transition-all ' +
              (vertical ? 'w-full ' : 'min-w-[8.5rem] max-w-[12rem] shrink-0 ') +
              (active
                ? 'border-cyan-500/60 bg-cyan-950/40'
                : 'border-white/10 bg-slate-950/40 hover:border-cyan-500/30')
            }
          >
            <button
              type="button"
              onClick={function () {
                onSelect(p.id);
              }}
              className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
            >
              <span className={'truncate text-xs font-bold ' + (active ? 'text-cyan-100' : 'text-slate-200')}>
                {p.name || '未命名'}
              </span>
              <span className="truncate text-[10px] text-slate-500 tabular-nums shrink-0">
                {p.birthDate}
              </span>
            </button>
            <button
              type="button"
              onClick={function (e) {
                e.stopPropagation();
                if (window.confirm('确定删除命盘档案「' + (p.name || '未命名') + '」？')) onDelete(p.id);
              }}
              className="px-1 text-slate-600 hover:text-red-400 opacity-50 group-hover:opacity-100"
              title="删除"
            >
              <span className="icon-trash-2 text-[10px]" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
