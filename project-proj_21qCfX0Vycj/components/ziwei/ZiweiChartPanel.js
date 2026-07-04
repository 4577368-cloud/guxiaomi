/**
 * 联动图谱侧栏：图例 + 本宫飞星（飞出）+ 焦点星飞入
 */
function ZiweiLinkagePanel({ chartData, activePalaceName, focusedStar, onClearFocus }) {
  var L = window.ZiweiChartLinkage;
  if (!L || !chartData) return null;
  var meta = L.HUA_META;
  var order = L.HUA_ORDER;
  var flyingOut = activePalaceName ? L.palaceFlying(chartData, activePalaceName) : [];
  var flyingIn = focusedStar ? L.starInbound(chartData, focusedStar) : [];
  var activePalace = L.findPalace(chartData, activePalaceName);

  function huaChip(hua, extraClass) {
    var m = meta[hua] || {};
    return (
      <span
        className={'inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[9px] font-black shrink-0 ' + (extraClass || '')}
        style={{ backgroundColor: m.color || '#6366f1' }}
      >
        {hua}
      </span>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-stone-200 bg-white/90 p-2.5 text-stone-700">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
        <span className="text-[11px] font-bold text-stone-500">四化图例</span>
        {order.map(function (h) {
          var m = meta[h] || {};
          return (
            <span key={h} className="inline-flex items-center gap-1 text-[10px] text-stone-600">
              {huaChip(h)}
              <span>{m.desc}</span>
            </span>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md bg-stone-50 border border-stone-100 p-2">
          <div className="text-[11px] font-bold text-indigo-700 mb-1">
            {activePalace ? activePalace.name + '（' + activePalace.stem + '干）飞出' : '本宫飞出'}
          </div>
          {flyingOut.length === 0 ? (
            <p className="text-[10px] text-stone-400">点击命盘任一宫位，查看其宫干四化飞向何宫。</p>
          ) : (
            <ul className="space-y-1">
              {flyingOut.map(function (f, i) {
                return (
                  <li key={i} className="flex items-center gap-1.5 text-[11px] leading-tight">
                    {huaChip(f.hua)}
                    <span className="font-bold text-stone-800">{f.star}</span>
                    <span className="text-stone-400">化{f.hua}</span>
                    <span className="text-stone-300">→</span>
                    <span className={f.found ? 'text-stone-700 font-semibold' : 'text-stone-300 italic'}>
                      {f.found ? f.toPalaceName : '未落盘'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-md bg-stone-50 border border-stone-100 p-2">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-bold text-purple-700">
              {focusedStar ? '「' + focusedStar + '」被引动' : '焦点星飞入'}
            </div>
            {focusedStar && (
              <button
                type="button"
                onClick={onClearFocus}
                className="text-[10px] text-stone-400 hover:text-stone-700 underline underline-offset-2"
              >
                清除
              </button>
            )}
          </div>
          {!focusedStar ? (
            <p className="text-[10px] text-stone-400">点击命盘中的星曜，查看哪些宫位的宫干在引动它。</p>
          ) : flyingIn.length === 0 ? (
            <p className="text-[10px] text-stone-400">全盘无宫干四化引动此星。</p>
          ) : (
            <ul className="space-y-1">
              {flyingIn.map(function (f, i) {
                return (
                  <li key={i} className="flex items-center gap-1.5 text-[11px] leading-tight">
                    {huaChip(f.hua)}
                    <span className="text-stone-700 font-semibold">{f.fromPalaceName}</span>
                    <span className="text-stone-400">（{f.fromStem}干）</span>
                    <span className="text-stone-300">化{f.hua}引入</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 交互命盘面板：预制解读 + AI 解读（双 Tab）
 */
function ZiweiChartPanel({ birth, birthLabel, apiBase, modelKey, modelLabel }) {
  var now = new Date();
  var _timeMode = React.useState('natal');
  var timeMode = _timeMode[0];
  var setTimeMode = _timeMode[1];

  var _year = React.useState(now.getFullYear());
  var selectedYear = _year[0];
  var setSelectedYear = _year[1];

  var _month = React.useState(now.getMonth() + 1);
  var selectedMonth = _month[0];
  var setSelectedMonth = _month[1];

  var _day = React.useState(now.getDate());
  var selectedDay = _day[0];
  var setSelectedDay = _day[1];

  var _hour = React.useState(now.getHours());
  var selectedHour = _hour[0];
  var setSelectedHour = _hour[1];

  var _palace = React.useState('命宫');
  var activePalaceName = _palace[0];
  var setActivePalaceName = _palace[1];

  var _analysis = React.useState(null);
  var palaceAnalysis = _analysis[0];
  var setPalaceAnalysis = _analysis[1];

  var _linkage = React.useState(false);
  var linkageMode = _linkage[0];
  var setLinkageMode = _linkage[1];

  var _focusStar = React.useState(null);
  var focusedStar = _focusStar[0];
  var setFocusedStar = _focusStar[1];

  var _activeTab = React.useState('rule');
  var analysisTab = _activeTab[0];
  var setAnalysisTab = _activeTab[1];

  var abortRef = React.useRef(null);

  var chartData = React.useMemo(
    function () {
      if (!birth || !window.ZiweiChartFlow) return null;
      return window.ZiweiChartFlow.buildDisplayChart(birth, timeMode, {
        year: selectedYear,
        month: selectedMonth,
        day: selectedDay,
        hour: selectedHour,
      });
    },
    [birth, timeMode, selectedYear, selectedMonth, selectedDay, selectedHour]
  );

  React.useEffect(
    function () {
      if (abortRef.current) abortRef.current.abort();
      setPalaceAnalysis(null);
      setAnalysisTab('rule');
      setFocusedStar(null);
    },
    [timeMode, selectedYear, selectedMonth, selectedDay, selectedHour, birth]
  );

  React.useEffect(function () {
    return function () {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  function getAnalysisOptions() {
    return {
      timeMode: timeMode,
      flow: {
        year: selectedYear,
        month: selectedMonth,
        day: selectedDay,
        hour: selectedHour,
      },
      birth: birth,
    };
  }

  function buildMeta(palaceName) {
    var palace = chartData.palaces.find(function (p) {
      return p.name === palaceName;
    });
    var flow = getAnalysisOptions().flow;
    var mode = window.ZiweiPalaceAnalysis.getModeLabel(timeMode, flow);
    var score = palace ? window.ZiweiPalaceAnalysis.calculateScore(palace, chartData) : null;
    return {
      title: palaceName + ' · ' + mode,
      subtitle: palace ? palace.stem + palace.zhi + (palace.daXian ? ' · ' + palace.daXian + '岁' : '') : '',
      palaceName: palaceName,
      score: score ? score.score : null,
      modelLabel: modelLabel || '',
    };
  }

  function runPalaceAnalysis(palaceName) {
    if (!chartData || !window.ZiweiPalaceAnalysis) return;

    if (abortRef.current) abortRef.current.abort();

    setActivePalaceName(palaceName);
    setAnalysisTab('rule');

    var structured = window.ZiweiPalaceAnalysis.generateStructured(chartData, palaceName, getAnalysisOptions());
    var meta = buildMeta(palaceName);

    setPalaceAnalysis(
      Object.assign({}, meta, {
        ruleHtml: structured.html,
        aiHtml: null,
        aiLoading: false,
        aiError: null,
        aiLoaded: false,
      })
    );
  }

  function loadAiAnalysis(force) {
    if (!palaceAnalysis || !window.ZiweiPalaceAnalysisContext || !window.ZiweiPalaceAnalysisAi) return;
    if (!force && palaceAnalysis.aiLoaded) return;
    if (palaceAnalysis.aiLoading) return;

    if (abortRef.current) abortRef.current.abort();
    var controller = new AbortController();
    abortRef.current = controller;

    var palaceName = palaceAnalysis.palaceName;
    var context = window.ZiweiPalaceAnalysisContext.build(chartData, palaceName, getAnalysisOptions());

    setPalaceAnalysis(function (prev) {
      if (!prev || prev.palaceName !== palaceName) return prev;
      return Object.assign({}, prev, { aiLoading: true, aiError: null });
    });

    window.ZiweiPalaceAnalysisAi.fetch({
      apiBase: apiBase,
      modelKey: modelKey || 'model2',
      context: context,
      signal: controller.signal,
    })
      .then(function (text) {
        if (controller.signal.aborted) return;
        setPalaceAnalysis(function (prev) {
          if (!prev || prev.palaceName !== palaceName) return prev;
          return Object.assign({}, prev, {
            aiLoading: false,
            aiLoaded: true,
            aiHtml: window.ZiweiPalaceAnalysisAi.markdownToHtml(text),
            aiError: null,
          });
        });
      })
      .catch(function (err) {
        if (controller.signal.aborted) return;
        setPalaceAnalysis(function (prev) {
          if (!prev || prev.palaceName !== palaceName) return prev;
          return Object.assign({}, prev, {
            aiLoading: false,
            aiError: (err && err.message) || 'AI 解析失败',
          });
        });
      });
  }

  function handlePalaceClick(palaceName) {
    setActivePalaceName(palaceName);
  }

  function handleStarClick(starName) {
    setFocusedStar(function (prev) {
      return prev === starName ? null : starName;
    });
    if (window.ZiweiChartLinkage && chartData) {
      var idx = window.ZiweiChartLinkage.indexStars(chartData);
      var loc = idx[starName];
      if (loc) setActivePalaceName(loc.palaceName);
    }
  }

  function toggleLinkage() {
    setLinkageMode(function (prev) {
      if (prev) setFocusedStar(null);
      return !prev;
    });
  }

  if (!birth) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-center shadow-sm">
        <div className="icon-compass text-2xl text-stone-400 mb-2" aria-hidden />
        <p className="text-sm text-stone-600">请先在上方填写并保存出生信息</p>
      </div>
    );
  }

  if (!window.ZiweiCore) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600">
        排盘内核未加载，请刷新页面重试
      </div>
    );
  }

  if (!window.ZiweiChartFlow) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600">
        流运模块未加载，请硬刷新页面（Cmd+Shift+R）
      </div>
    );
  }

  var profile = {
    name: birth.name || '命主',
    gender: birth.gender,
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white shadow-lg shadow-stone-900/10 overflow-hidden">
      <div className="border-b border-stone-100 bg-gradient-to-r from-stone-50 to-white px-3 py-2.5">
        <div className="flex items-center gap-2 mb-2">
          <div className="icon-compass text-sm text-indigo-600" aria-hidden />
          <span className="text-sm font-bold text-stone-800">交互命盘</span>
          <span className="text-[10px] text-stone-400 uppercase tracking-wider">玄枢引擎</span>
          <span className="text-[10px] text-stone-400 hidden sm:inline">· 宫名旁「解析」· 可切 AI 解读</span>
          <button
            type="button"
            onClick={toggleLinkage}
            aria-pressed={linkageMode}
            title="宫位联动图谱：宫干四化飞星 + 三方四正连线"
            className={
              'ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' +
              (linkageMode
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200')
            }
          >
            <div className="icon-share-2 text-[11px]" aria-hidden />
            <span>联动图谱</span>
          </button>
        </div>
        <ZiweiTimeControls
          theme="light"
          timeMode={timeMode}
          onTimeModeChange={setTimeMode}
          birthLabel={birthLabel}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          selectedDay={selectedDay}
          onYearChange={setSelectedYear}
          onMonthChange={setSelectedMonth}
          onDayChange={setSelectedDay}
          onHourChange={setSelectedHour}
          activePalaceName={activePalaceName}
          onPalaceChange={setActivePalaceName}
        />
      </div>
      <div className="p-2 sm:p-3 bg-stone-50 relative">
        <ZiweiChartView
          chartData={chartData}
          profile={profile}
          activePalaceName={activePalaceName}
          analysisPalaceName={palaceAnalysis && palaceAnalysis.palaceName}
          onPalaceClick={handlePalaceClick}
          onPalaceAnalyze={runPalaceAnalysis}
          linkageMode={linkageMode}
          focusedStar={focusedStar}
          onStarClick={handleStarClick}
        />
        {linkageMode && (
          <ZiweiLinkagePanel
            chartData={chartData}
            activePalaceName={activePalaceName}
            focusedStar={focusedStar}
            onClearFocus={function () { setFocusedStar(null); }}
          />
        )}
        {palaceAnalysis && (
          <ZiweiPalaceAnalysisModal
            analysis={palaceAnalysis}
            activeTab={analysisTab}
            onTabChange={setAnalysisTab}
            onClose={function () {
              if (abortRef.current) abortRef.current.abort();
              setPalaceAnalysis(null);
              setAnalysisTab('rule');
            }}
            onRequestAi={function () {
              loadAiAnalysis(false);
            }}
            onRetryAi={function () {
              loadAiAnalysis(true);
            }}
          />
        )}
      </div>
    </div>
  );
}
