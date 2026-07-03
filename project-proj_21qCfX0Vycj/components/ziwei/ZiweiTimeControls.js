/**
 * 命盘 / 流年 / 流月 / 流日 切换（浅色命盘区专用）
 */
var ZIWEI_PALACE_NAMES = ['命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄', '迁移', '交友', '官禄', '田宅', '福德', '父母'];

function ZiweiTimeControls({
  timeMode,
  onTimeModeChange,
  birthLabel,
  selectedYear,
  selectedMonth,
  selectedDay,
  onYearChange,
  onMonthChange,
  onDayChange,
  onHourChange,
  activePalaceName,
  onPalaceChange,
  theme,
}) {
  var light = theme !== 'dark';

  var modeBtnClass = function (mode) {
    var active = timeMode === mode;
    if (light) {
      return (
        'px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-[11px] rounded-lg font-bold border shrink-0 transition-colors ' +
        (active
          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
          : 'bg-white text-stone-500 border-stone-200 hover:border-indigo-300 hover:text-stone-700')
      );
    }
    return (
      'px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-[11px] rounded-lg font-bold border shrink-0 transition-colors ' +
      (active
        ? 'bg-cyan-600 text-white border-cyan-500'
        : 'bg-slate-900/60 text-slate-400 border-white/10')
    );
  };

  var stepBtnClass = light
    ? 'px-2 py-1 rounded border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 text-[11px]'
    : 'px-2 py-1 rounded border border-white/10 bg-slate-900/60 text-slate-300 text-[11px]';

  var timeTextClass = light ? 'text-stone-700' : 'text-slate-200';
  var metaTextClass = light ? 'text-stone-500' : 'text-slate-400';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <div className="flex flex-wrap gap-1 sm:gap-1.5">
          <button type="button" className={modeBtnClass('natal')} onClick={function () { onTimeModeChange('natal'); }}>
            命盘
          </button>
          <button type="button" className={modeBtnClass('year')} onClick={function () { onTimeModeChange('year'); }}>
            流年
          </button>
          <button type="button" className={modeBtnClass('month')} onClick={function () { onTimeModeChange('month'); }}>
            流月
          </button>
          <button
            type="button"
            className={modeBtnClass('day')}
            onClick={function () {
              onTimeModeChange('day');
              var d = new Date();
              onYearChange(d.getFullYear());
              onMonthChange(d.getMonth() + 1);
              onDayChange(d.getDate());
              if (typeof onHourChange === 'function') onHourChange(d.getHours());
            }}
          >
            流日
          </button>
        </div>

        <div className={'w-full sm:w-auto sm:ml-auto flex flex-wrap items-center gap-1 sm:gap-1.5 text-[10px] sm:text-[11px] font-bold shrink-0 ' + metaTextClass}>
          {timeMode === 'natal' && birthLabel && <span className={timeTextClass}>{birthLabel}</span>}
          {timeMode !== 'natal' && (
            <React.Fragment>
              <div className="flex items-center gap-1">
                <button type="button" className={stepBtnClass} onClick={function () { onYearChange(selectedYear - 1); }}>
                  −
                </button>
                <span className={timeTextClass + ' tabular-nums'}>{selectedYear}年</span>
                <button type="button" className={stepBtnClass} onClick={function () { onYearChange(selectedYear + 1); }}>
                  +
                </button>
              </div>
              {timeMode !== 'year' && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={stepBtnClass}
                    onClick={function () { onMonthChange(selectedMonth > 1 ? selectedMonth - 1 : 12); }}
                  >
                    −
                  </button>
                  <span className={timeTextClass + ' tabular-nums'}>{selectedMonth}月</span>
                  <button
                    type="button"
                    className={stepBtnClass}
                    onClick={function () { onMonthChange(selectedMonth < 12 ? selectedMonth + 1 : 1); }}
                  >
                    +
                  </button>
                </div>
              )}
              {timeMode === 'day' && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={stepBtnClass}
                    onClick={function () { onDayChange(selectedDay > 1 ? selectedDay - 1 : 1); }}
                  >
                    −
                  </button>
                  <span className={timeTextClass + ' tabular-nums'}>{selectedDay}日</span>
                  <button type="button" className={stepBtnClass} onClick={function () { onDayChange(selectedDay + 1); }}>
                    +
                  </button>
                </div>
              )}
            </React.Fragment>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 sm:gap-1.5 justify-center -mx-0.5">
        {ZIWEI_PALACE_NAMES.map(function (n) {
          var active = activePalaceName === n;
          var palaceBtnClass = light
            ? (active
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
              : 'bg-white text-stone-500 border-stone-200 hover:border-indigo-300')
            : (active
              ? 'bg-cyan-600 text-white border-cyan-500'
              : 'bg-slate-900/50 text-slate-400 border-white/10');
          return (
            <button
              key={n}
              type="button"
              onClick={function () { onPalaceChange(n); }}
              className={
                'px-1.5 sm:px-2 py-0.5 sm:py-1 text-[9px] sm:text-[10px] rounded-md sm:rounded-lg border transition-all ' +
                palaceBtnClass
              }
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
