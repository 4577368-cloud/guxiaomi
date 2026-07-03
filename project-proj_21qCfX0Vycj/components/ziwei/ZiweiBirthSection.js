/**
 * 命盘档案：切换 + 紧凑出生表单
 */
function ZiweiBirthSection({
  profiles,
  activeId,
  isNewDraft,
  draft,
  onDraftChange,
  onSelectProfile,
  onNewProfile,
  onDeleteProfile,
  onSaveProfile,
  onImportFromText,
  canImportFromText,
}) {
  var _collapsed = React.useState(function () {
    return profiles && profiles.length > 0 && !isNewDraft;
  });
  var collapsed = _collapsed[0];
  var setCollapsed = _collapsed[1];

  React.useEffect(
    function () {
      if (isNewDraft) setCollapsed(false);
    },
    [isNewDraft]
  );

  var activeProfile = profiles.find(function (p) {
    return p.id === activeId;
  }) || null;
  var isEditing = !!(activeProfile && draft && draft.id === activeProfile.id && !isNewDraft);
  var validationError = window.ZiweiProfileUtils
    ? window.ZiweiProfileUtils.validateProfile(draft)
    : null;

  function handleNew() {
    if (onNewProfile) onNewProfile();
    setCollapsed(false);
  }

  return (
    <div className="zi-card overflow-hidden h-full flex flex-col">
      <div className="border-b border-white/10 px-2.5 py-2 sm:px-3">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="icon-users text-sm text-cyan-400 shrink-0" aria-hidden />
            <span className="text-sm font-bold text-slate-100">命盘档案</span>
            <span className="text-[10px] text-slate-500">({profiles.length})</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={handleNew} className="btn btn-secondary btn-xs gap-0.5">
              <span className="icon-plus text-[10px]" aria-hidden />
              新建
            </button>
            <button
              type="button"
              onClick={function () {
                setCollapsed(!collapsed);
              }}
              className="btn btn-secondary btn-xs"
            >
              {collapsed ? '编辑' : '收起'}
            </button>
          </div>
        </div>
        <ZiweiProfileSwitcher
          profiles={profiles}
          activeId={activeId}
          isNewDraft={isNewDraft}
          onSelect={onSelectProfile}
          onDelete={onDeleteProfile}
          layout="vertical"
        />
      </div>

      {!collapsed && draft && (
        <div className="p-2 sm:p-2.5 flex-1">
          {isNewDraft && (
            <p className="mb-2 text-[10px] font-medium text-cyan-300/90">新建档案 · 填写后点「保存」</p>
          )}
          <ZiweiBirthProfileForm
            draft={draft}
            onDraftChange={onDraftChange}
            onSave={onSaveProfile}
            onImportFromText={onImportFromText}
            canImport={canImportFromText}
            saveDisabled={!!validationError}
            isEditing={isEditing}
          />
          {validationError && (
            <p className="mt-1 text-[10px] text-amber-400/90">{validationError}</p>
          )}
        </div>
      )}
    </div>
  );
}
