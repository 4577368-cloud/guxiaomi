/**
 * 紧凑出生信息表单
 */
function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseDateParts(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return { y: 1990, m: 1, d: 1 };
  var parts = dateStr.split('-');
  return {
    y: parseInt(parts[0], 10) || 1990,
    m: parseInt(parts[1], 10) || 1,
    d: parseInt(parts[2], 10) || 1,
  };
}

function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

function CompactWheelPicker({ options, value, onChange }) {
  var containerRef = React.useRef(null);
  var itemHeight = 32;
  var visibleCount = 3;
  var edgePadding = Math.floor((visibleCount - 1) / 2) * itemHeight;
  var centerItemRef = React.useRef(value);
  var observerRef = React.useRef(null);
  var ignoreObserverRef = React.useRef(false);

  function select(v) {
    if (ignoreObserverRef.current) return;
    if (v !== centerItemRef.current) {
      centerItemRef.current = v;
      onChange(v);
    }
  }

  React.useEffect(function () {
    var container = containerRef.current;
    if (!container) return;

    var idx = options.findIndex(function (o) { return o.value === value; });
    centerItemRef.current = value;
    ignoreObserverRef.current = true;

    var obs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            var v = Number(entry.target.dataset.value);
            select(v);
          }
        });
      },
      {
        root: container,
        rootMargin: '-' + edgePadding + 'px 0px',
        threshold: 0.5,
      }
    );

    Array.from(container.children).forEach(function (child) {
      obs.observe(child);
    });
    observerRef.current = obs;

    if (idx >= 0) {
      window.requestAnimationFrame(function () {
        container.scrollTop = idx * itemHeight;
        window.setTimeout(function () {
          ignoreObserverRef.current = false;
        }, 250);
      });
    } else {
      ignoreObserverRef.current = false;
    }

    return function () {
      obs.disconnect();
      observerRef.current = null;
    };
  }, [options, value]);

  return (
    <div className="relative h-24 overflow-hidden rounded-lg border border-white/10 bg-slate-950/40">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide"
        style={{ paddingTop: edgePadding + 'px', paddingBottom: edgePadding + 'px' }}
      >
        {options.map(function (opt) {
          var active = opt.value === value;
          return (
            <div
            key={opt.value}
            data-value={opt.value}
            onClick={function () {
              var container = containerRef.current;
              if (container) {
                var idx = options.findIndex(function (o) { return o.value === opt.value; });
                if (idx >= 0) container.scrollTop = idx * itemHeight;
              }
              select(opt.value);
            }}
            className={
              'h-8 flex items-center justify-center snap-center text-xs cursor-pointer transition-colors ' +
              (active ? 'text-cyan-100 font-bold bg-cyan-600/20' : 'text-slate-400 hover:text-slate-200')
            }
          >
            {opt.label}
          </div>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/70 via-transparent to-slate-950/70" />
    </div>
  );
}

function useClickOutside(ref, onOutside) {
  React.useEffect(function () {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onOutside();
      }
    }
    document.addEventListener('click', handle);
    return function () {
      document.removeEventListener('click', handle);
    };
  }, [onOutside]);
}

function FieldTrigger({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'input-field input-field-compact flex h-8 w-full items-center justify-between px-2 text-xs ' +
        (active ? 'border-cyan-500/50 bg-cyan-950/30 text-cyan-100' : '')
      }
    >
      <span>{label}</span>
      <span className={'icon-chevron-down text-[10px] transition-transform ' + (active ? 'rotate-180' : '')} />
    </button>
  );
}

function ExpandableDatePicker({ dateStr, onDateChange }) {
  var _active = React.useState(null);
  var activeField = _active[0];
  var setActiveField = _active[1];
  var wrapperRef = React.useRef(null);
  useClickOutside(wrapperRef, function () { setActiveField(null); });

  var dp = parseDateParts(dateStr);
  var maxDay = daysInMonth(dp.y, dp.m);
  var safeD = Math.min(dp.d, maxDay);
  var years = React.useMemo(function () { return Array.from({ length: 201 }, function (_, i) { return 1900 + i; }); }, []);
  var months = React.useMemo(function () { return Array.from({ length: 12 }, function (_, i) { return i + 1; }); }, []);
  var days = React.useMemo(function () { return Array.from({ length: maxDay }, function (_, i) { return i + 1; }); }, [maxDay]);

  function updateDate(y, m, d) {
    var md = daysInMonth(y, m);
    var dd = Math.min(d, md);
    onDateChange(y + '-' + pad2(m) + '-' + pad2(dd));
  }

  function toggle(field) {
    setActiveField(activeField === field ? null : field);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="grid grid-cols-3 gap-1.5">
        <div className="relative">
          <FieldTrigger label={dp.y + '年'} active={activeField === 'y'} onClick={function () { toggle('y'); }} />
          {activeField === 'y' && (
            <div className="absolute left-0 top-full z-50 mt-1 w-max min-w-[4rem] rounded-lg border border-white/10 bg-slate-900/95 p-1 shadow-xl backdrop-blur-sm">
              <CompactWheelPicker
                options={years.map(function (y) { return { value: y, label: y + '年' }; })}
                value={dp.y}
                onChange={function (v) { updateDate(v, dp.m, safeD); }}
              />
            </div>
          )}
        </div>
        <div className="relative">
          <FieldTrigger label={pad2(dp.m) + '月'} active={activeField === 'm'} onClick={function () { toggle('m'); }} />
          {activeField === 'm' && (
            <div className="absolute left-0 top-full z-50 mt-1 w-max min-w-[4rem] rounded-lg border border-white/10 bg-slate-900/95 p-1 shadow-xl backdrop-blur-sm">
              <CompactWheelPicker
                options={months.map(function (m) { return { value: m, label: pad2(m) + '月' }; })}
                value={dp.m}
                onChange={function (v) { updateDate(dp.y, v, safeD); }}
              />
            </div>
          )}
        </div>
        <div className="relative">
          <FieldTrigger label={pad2(safeD) + '日'} active={activeField === 'd'} onClick={function () { toggle('d'); }} />
          {activeField === 'd' && (
            <div className="absolute left-0 top-full z-50 mt-1 w-max min-w-[4rem] rounded-lg border border-white/10 bg-slate-900/95 p-1 shadow-xl backdrop-blur-sm">
              <CompactWheelPicker
                options={days.map(function (d) { return { value: d, label: pad2(d) + '日' }; })}
                value={safeD}
                onChange={function (v) { updateDate(dp.y, dp.m, v); }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExpandableTimePicker({ timeStr, onTimeChange }) {
  var _active = React.useState(null);
  var activeField = _active[0];
  var setActiveField = _active[1];
  var wrapperRef = React.useRef(null);
  useClickOutside(wrapperRef, function () { setActiveField(null); });

  var parts = (timeStr || '12:00').split(':');
  var hour = parseInt(parts[0], 10) || 0;
  var minute = parseInt(parts[1], 10) || 0;
  var hours = React.useMemo(function () { return Array.from({ length: 24 }, function (_, i) { return i; }); }, []);
  var minutes = React.useMemo(function () { return Array.from({ length: 60 }, function (_, i) { return i; }); }, []);

  function updateTime(h, m) {
    onTimeChange(pad2(h) + ':' + pad2(m));
  }

  function toggle(field) {
    setActiveField(activeField === field ? null : field);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="grid grid-cols-2 gap-1.5">
        <div className="relative">
          <FieldTrigger label={pad2(hour) + '时'} active={activeField === 'h'} onClick={function () { toggle('h'); }} />
          {activeField === 'h' && (
            <div className="absolute left-0 top-full z-50 mt-1 w-max min-w-[4rem] rounded-lg border border-white/10 bg-slate-900/95 p-1 shadow-xl backdrop-blur-sm">
              <CompactWheelPicker
                options={hours.map(function (h) { return { value: h, label: pad2(h) + '时' }; })}
                value={hour}
                onChange={function (v) { updateTime(v, minute); }}
              />
            </div>
          )}
        </div>
        <div className="relative">
          <FieldTrigger label={pad2(minute) + '分'} active={activeField === 'min'} onClick={function () { toggle('min'); }} />
          {activeField === 'min' && (
            <div className="absolute left-0 top-full z-50 mt-1 w-max min-w-[4rem] rounded-lg border border-white/10 bg-slate-900/95 p-1 shadow-xl backdrop-blur-sm">
              <CompactWheelPicker
                options={minutes.map(function (m) { return { value: m, label: pad2(m) + '分' }; })}
                value={minute}
                onChange={function (v) { updateTime(hour, v); }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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

        <label className="block col-span-2 sm:col-span-1">
          <span className="mb-0.5 block text-[10px] font-medium text-slate-500">出生日期</span>
          <ExpandableDatePicker
            dateStr={draft.birthDate}
            onDateChange={function (v) { patch({ birthDate: v }); }}
          />
        </label>

        <label className="block col-span-2 sm:col-span-1">
          <span className="mb-0.5 block text-[10px] font-medium text-slate-500">出生时间</span>
          <ExpandableTimePicker
            timeStr={draft.birthTime}
            onTimeChange={function (v) { patch({ birthTime: v }); }}
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
