/**
 * 紧凑出生信息表单
 */
function ZiweiBirthProfileForm({ draft, onDraftChange, onSave, onImportFromText, canImport, saveDisabled, isEditing }) {
  var _cityQuery = React.useState('');
  var cityQuery = _cityQuery[0];
  var setCityQuery = _cityQuery[1];

  var _showCity = React.useState(false);
  var showCityDropdown = _showCity[0];
  var setShowCityDropdown = _showCity[1];

  var cityRef = React.useRef(null);

  var allCities = React.useMemo(function () {
    return window.ZiweiProfileUtils ? window.ZiweiProfileUtils.getAllCities() : [];
  }, []);

  var filteredCities = React.useMemo(
    function () {
      var q = cityQuery.trim();
      if (!q) return allCities.slice(0, 8);
      return allCities
        .filter(function (c) {
          return c.name.indexOf(q) >= 0 || c.province.indexOf(q) >= 0;
        })
        .slice(0, 12);
    },
    [allCities, cityQuery]
  );

  React.useEffect(function () {
    function handleClickOutside(e) {
      if (cityRef.current && !cityRef.current.contains(e.target)) {
        setShowCityDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return function () {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  function patch(fields) {
    onDraftChange(Object.assign({}, draft, fields));
  }

  function selectCity(province, cityName, lng) {
    patch({ province: province, city: cityName, longitude: lng });
    setCityQuery('');
    setShowCityDropdown(false);
  }

  var cityDisplay = (draft.province || '') + (draft.city && draft.city !== draft.province ? ' · ' + draft.city : '');

  return (
    <form
      className="space-y-2"
      onSubmit={function (e) {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="block col-span-2 sm:col-span-1">
          <span className="mb-0.5 block text-[10px] font-medium text-slate-500">姓名</span>
          <input
            type="text"
            value={draft.name || ''}
            onChange={function (e) { patch({ name: e.target.value }); }}
            placeholder="命主"
            className="input-field input-field-compact !h-8 !text-xs"
          />
        </label>

        <label className="block">
          <span className="mb-0.5 block text-[10px] font-medium text-slate-500">性别</span>
          <div className="flex gap-1 h-8">
            {[{ v: 'male', label: '男' }, { v: 'female', label: '女' }].map(function (g) {
              var active = draft.gender === g.v;
              return (
                <button
                  key={g.v}
                  type="button"
                  onClick={function () { patch({ gender: g.v }); }}
                  className={
                    'flex-1 rounded-lg border text-xs font-bold transition-colors ' +
                    (active
                      ? 'border-cyan-500/50 bg-cyan-950/50 text-cyan-100'
                      : 'border-white/10 bg-slate-950/40 text-slate-400')
                  }
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </label>

        <label className="block">
          <span className="mb-0.5 block text-[10px] font-medium text-slate-500">出生日期</span>
          <input
            type="date"
            value={draft.birthDate || ''}
            onChange={function (e) { patch({ birthDate: e.target.value }); }}
            className="input-field input-field-compact !h-8 !text-xs"
            min="1900-01-01"
            max="2100-12-31"
          />
        </label>

        <label className="block">
          <span className="mb-0.5 block text-[10px] font-medium text-slate-500">出生时间</span>
          <input
            type="time"
            value={draft.birthTime || '12:00'}
            onChange={function (e) { patch({ birthTime: e.target.value }); }}
            className="input-field input-field-compact !h-8 !text-xs"
          />
        </label>

        <label className="block col-span-2" ref={cityRef}>
          <span className="mb-0.5 block text-[10px] font-medium text-slate-500">出生地</span>
          <div className="relative">
            <input
              type="text"
              value={showCityDropdown ? cityQuery : cityDisplay || draft.city || ''}
              onChange={function (e) {
                setCityQuery(e.target.value);
                setShowCityDropdown(true);
              }}
              onFocus={function () { setShowCityDropdown(true); }}
              placeholder="搜索城市"
              className="input-field input-field-compact !h-8 !text-xs pr-14"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 tabular-nums">
              {draft.longitude != null ? draft.longitude.toFixed(1) + '°' : ''}
            </span>
            {showCityDropdown && filteredCities.length > 0 && (
              <div className="absolute z-50 mt-0.5 max-h-36 w-full overflow-y-auto rounded-lg border border-white/10 bg-slate-900 shadow-xl">
                {filteredCities.map(function (c) {
                  return (
                    <button
                      key={c.province + '-' + c.name}
                      type="button"
                      onClick={function () { selectCity(c.province, c.name, c.longitude); }}
                      className="flex w-full justify-between px-2 py-1.5 text-left hover:bg-white/5 border-b border-white/5 last:border-0"
                    >
                      <span className="text-[11px] text-slate-200">{c.province} · {c.name}</span>
                      <span className="text-[9px] text-slate-500">{c.longitude}°</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <button type="submit" disabled={saveDisabled} className="btn btn-primary btn-xs gap-0.5 disabled:opacity-50">
          <span className="icon-check text-[10px]" aria-hidden />
          {isEditing ? '更新' : '保存'}
        </button>
        {canImport && onImportFromText && (
          <button type="button" onClick={onImportFromText} className="btn btn-secondary btn-xs">
            导入文本
          </button>
        )}
      </div>
    </form>
  );
}
