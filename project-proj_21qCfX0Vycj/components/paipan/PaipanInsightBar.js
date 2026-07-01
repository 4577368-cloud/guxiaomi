/** 命盘要点条：排盘后展示关键信息 + 投资相关宫位快捷入口 */
function PaipanInsightBar({
  chartData,
  birthInfo,
  virtualAge,
  daXianAnalysis,
  activePalaceName,
  onSelectPalace,
}) {
  if (!chartData || !chartData.basicInfo) return null;
  var basic = chartData.basicInfo;
  var shortcuts = ['财帛', '官禄', '命宫', '福德', '迁移'];
  var daLabel =
    daXianAnalysis && daXianAnalysis.currentDaXian
      ? daXianAnalysis.currentDaXian.name || daXianAnalysis.currentDaXian.palace
      : '';

  return (
    <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 to-purple-50/80 px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-700">
        <span>
          <span className="text-slate-500">命宫</span>{' '}
          <strong className="text-slate-900">{basic.mingGong}</strong>
        </span>
        <span>
          <span className="text-slate-500">五行局</span>{' '}
          <strong>{basic.wuxingJu}</strong>
        </span>
        {basic.shenGong && (
          <span>
            <span className="text-slate-500">身宫</span>{' '}
            <strong>{basic.shenGong}</strong>
          </span>
        )}
        {virtualAge > 0 && (
          <span>
            <span className="text-slate-500">虚岁</span> <strong>{virtualAge}</strong>
          </span>
        )}
        {daLabel && (
          <span>
            <span className="text-slate-500">大限</span> <strong>{daLabel}</strong>
          </span>
        )}
        {birthInfo && birthInfo.year && (
          <span className="text-slate-500">
            {birthInfo.year}/{birthInfo.month}/{birthInfo.day}
            {birthInfo.gender === 'female' ? ' · 女' : ' · 男'}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          投资相关宫位
        </span>
        {shortcuts.map(function (name) {
          var full = chartData.palaces.find(function (p) {
            return p.name === name || p.name === name + '宫';
          });
          var label = full ? full.name : name;
          var active = activePalaceName === label;
          return (
            <button
              key={name}
              type="button"
              onClick={function () {
                onSelectPalace(label);
              }}
              className={
                'rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ' +
                (active
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/80 text-indigo-800 border border-indigo-200 hover:bg-indigo-100')
              }
            >
              {label}
            </button>
          );
        })}
        <a
          href="ziwei.html"
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
        >
          深度命理
          <div className="icon-arrow-right text-[10px]" aria-hidden />
        </a>
      </div>
    </div>
  );
}
