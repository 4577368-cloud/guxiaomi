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
        />
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
