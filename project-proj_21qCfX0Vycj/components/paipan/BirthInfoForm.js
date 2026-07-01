function BirthInfoForm({
  birthInfo,
  setBirthInfo,
  onSubmit,
  loading,
  compact,
  collapsed,
  onToggleCollapse,
  summaryLabel,
}) {
  var handleChange = function (field, value) {
    setBirthInfo(function (prev) {
      var next = Object.assign({}, prev);
      next[field] = value;
      return next;
    });
  };

  var showForm = !collapsed || !compact;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="icon-calendar text-sm text-indigo-600" aria-hidden />
          <span className="text-sm font-bold text-slate-800">生辰信息</span>
          {compact && collapsed && summaryLabel && (
            <span className="truncate text-xs text-slate-500">{summaryLabel}</span>
          )}
        </div>
        {compact && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
          >
            {collapsed ? '修改' : '收起'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={onSubmit} className="p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium text-slate-500">年</span>
              <input
                type="number"
                value={birthInfo.year}
                onChange={function (e) {
                  handleChange('year', e.target.value);
                }}
                className="w-[4.5rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                placeholder="1990"
                required
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium text-slate-500">月</span>
              <input
                type="number"
                value={birthInfo.month}
                onChange={function (e) {
                  handleChange('month', e.target.value);
                }}
                className="w-[3rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                min="1"
                max="12"
                required
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium text-slate-500">日</span>
              <input
                type="number"
                value={birthInfo.day}
                onChange={function (e) {
                  handleChange('day', e.target.value);
                }}
                className="w-[3rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                min="1"
                max="31"
                required
              />
            </label>
            <label className="flex min-w-[7.5rem] flex-1 flex-col gap-0.5">
              <span className="text-[10px] font-medium text-slate-500">时辰</span>
              <select
                value={birthInfo.hour}
                onChange={function (e) {
                  handleChange('hour', e.target.value);
                }}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                required
              >
                <option value="">选择</option>
                {getHourOptions().map(function (opt) {
                  return (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="flex items-center gap-2 pb-0.5">
              <label className="flex cursor-pointer items-center gap-1 text-xs">
                <input
                  type="radio"
                  checked={birthInfo.gender === 'male'}
                  onChange={function () {
                    handleChange('gender', 'male');
                  }}
                />
                男
              </label>
              <label className="flex cursor-pointer items-center gap-1 text-xs">
                <input
                  type="radio"
                  checked={birthInfo.gender === 'female'}
                  onChange={function () {
                    handleChange('gender', 'female');
                  }}
                />
                女
              </label>
            </div>
            <button
              type="submit"
              className="btn btn-primary shrink-0 px-4 py-1.5"
              disabled={loading}
            >
              {loading ? '计算中…' : '排盘'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
