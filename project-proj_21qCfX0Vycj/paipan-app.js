const { useState, useEffect, useCallback } = React;

function PaipanApp() {
    var storage = window.PaipanStorage;

    var [birthInfo, setBirthInfo] = useState({
        year: '',
        month: '',
        day: '',
        hour: '',
        gender: 'male',
        isLeapMonth: false,
    });

    var [chartData, setChartData] = useState(null);
    var [loading, setLoading] = useState(false);
    var [activePalaceName, setActivePalaceName] = useState('命宫');
    var [activeTab, setActiveTab] = useState('analysis');
    var [expandedStars, setExpandedStars] = useState({});
    var [aiLoading, setAiLoading] = useState(false);
    var [aiAnalysis, setAiAnalysis] = useState(null);
    var [apiKey, setApiKey] = useState(function () {
        try {
            return localStorage.getItem('paipan_deepseek_key') || '';
        } catch (_) {
            return '';
        }
    });
    var [formCollapsed, setFormCollapsed] = useState(false);
    var [history, setHistory] = useState(function () {
        return storage ? storage.loadPaipanHistory() : [];
    });
    var [activeHistoryId, setActiveHistoryId] = useState(null);
    var [saving, setSaving] = useState(false);

    useEffect(function () {
        try {
            if (apiKey) localStorage.setItem('paipan_deepseek_key', apiKey);
        } catch (_) {}
    }, [apiKey]);

    useEffect(function () {
        if (!window.GuxiaomiChat) return;
        var virtualAge = birthInfo.year
            ? new Date().getFullYear() - parseInt(birthInfo.year, 10) + 1
            : 0;
        var extras = [];
        if (chartData && activePalaceName) extras.push('当前宫位：' + activePalaceName);
        if (virtualAge) extras.push('虚岁约：' + virtualAge);
        if (aiAnalysis) {
            var excerpt = typeof aiAnalysis === 'string'
                ? aiAnalysis
                : JSON.stringify(aiAnalysis);
            extras.push('AI 分析摘录：' + String(excerpt).slice(0, 1500));
        }
        window.GuxiaomiChat.setContext({
            page: 'paipan',
            scopeKey: 'paipan|' + (birthInfo.year || 'session'),
            title: chartData ? '紫微排盘 · ' + activePalaceName : '紫微排盘',
            extras: extras.length ? extras.join('\n') : '尚未完成排盘，可先输入生辰并排盘。',
        });
    }, [chartData, activePalaceName, birthInfo.year, aiAnalysis]);

    var persistRecord = useCallback(function (overrides) {
        if (!storage || !chartData) return null;
        var record = storage.buildRecord(Object.assign({
            id: activeHistoryId || undefined,
            birthInfo: birthInfo,
            chartData: chartData,
            aiAnalysis: aiAnalysis,
        }, overrides || {}));
        var list = storage.upsertPaipanRecord(record);
        setHistory(list);
        setActiveHistoryId(record.id);
        return record;
    }, [birthInfo, chartData, aiAnalysis, activeHistoryId]);

    var handleSubmit = async function (e) {
        e.preventDefault();
        setLoading(true);
        try {
            var chart = await calculateFullChart(birthInfo);
            setChartData(chart);
            setFormCollapsed(true);
            setActivePalaceName('命宫');
            setActiveTab('analysis');
            if (storage) {
                var rec = storage.buildRecord({
                    birthInfo: birthInfo,
                    chartData: chart,
                    aiAnalysis: null,
                });
                var list = storage.upsertPaipanRecord(rec);
                setHistory(list);
                setActiveHistoryId(rec.id);
            }
        } catch (error) {
            console.error('排盘计算错误:', error);
            alert('排盘计算失败，请检查输入信息');
        } finally {
            setLoading(false);
        }
    };

    var callDeepSeekAPI = async function () {
        if (!apiKey) {
            alert('请先输入 DeepSeek API Key');
            setAiLoading(false);
            return;
        }
        try {
            var prompt = generateAIPrompt(chartData, birthInfo);
            var result = await callDeepSeekAI(apiKey, prompt);
            setAiAnalysis(result);
            if (storage) {
                persistRecord({ aiAnalysis: result });
            }
        } catch (error) {
            console.error('AI分析失败:', error);
            alert('AI分析失败，请检查 API Key 或网络连接');
        } finally {
            setAiLoading(false);
        }
    };

    var toggleStar = function (starName) {
        setExpandedStars(function (prev) {
            var next = Object.assign({}, prev);
            next[starName] = !prev[starName];
            return next;
        });
    };

    var loadHistoryItem = function (item) {
        if (!item) return;
        setBirthInfo(item.birthInfo || birthInfo);
        setChartData(item.chartData || null);
        setAiAnalysis(item.aiAnalysis || null);
        setActiveHistoryId(item.id);
        setFormCollapsed(!!item.chartData);
        setActivePalaceName('命宫');
        setActiveTab('analysis');
    };

    var deleteHistoryItem = function (id) {
        if (!storage) return;
        var list = storage.deletePaipanRecord(id);
        setHistory(list);
        if (activeHistoryId === id) {
            setActiveHistoryId(null);
            if (!list.length) {
                setChartData(null);
                setAiAnalysis(null);
                setFormCollapsed(false);
            }
        }
    };

    var saveCurrent = function () {
        if (!chartData || !storage) return;
        setSaving(true);
        try {
            persistRecord();
        } finally {
            setTimeout(function () { setSaving(false); }, 300);
        }
    };

    var activePalace = chartData
        ? chartData.palaces.find(function (p) { return p.name === activePalaceName; })
        : null;
    var activeStars = activePalace
        ? activePalace.stars.major.map(function (s) { return s.name; })
            .concat(activePalace.stars.minor.map(function (s) { return s.name; }))
        : [];
    var virtualAge = birthInfo.year
        ? new Date().getFullYear() - parseInt(birthInfo.year, 10) + 1
        : 0;
    var daXianAnalysis = chartData
        ? calculateDaXianAnalysis(chartData.palaces, virtualAge, birthInfo.gender)
        : null;
    var summaryLabel = storage
        ? storage.formatBirthLabel(birthInfo)
        : '';

    return (
        <div className="min-h-screen px-2 py-4 md:px-4 md:py-6">
            <div className="mx-auto max-w-7xl space-y-3">
                <Header />

                <PaipanHistoryBar
                    history={history}
                    activeId={activeHistoryId}
                    onLoad={loadHistoryItem}
                    onDelete={deleteHistoryItem}
                    onSaveCurrent={saveCurrent}
                    canSave={!!chartData}
                    saving={saving}
                />

                <BirthInfoForm
                    birthInfo={birthInfo}
                    setBirthInfo={setBirthInfo}
                    onSubmit={handleSubmit}
                    loading={loading}
                    compact={true}
                    collapsed={formCollapsed && !!chartData}
                    onToggleCollapse={function () { setFormCollapsed(function (v) { return !v; }); }}
                    summaryLabel={summaryLabel}
                />

                {!chartData && <PaipanWelcome />}

                {chartData && (
                    <div className="animate-fade-in space-y-3">
                        <PaipanInsightBar
                            chartData={chartData}
                            birthInfo={birthInfo}
                            virtualAge={virtualAge}
                            daXianAnalysis={daXianAnalysis}
                            activePalaceName={activePalaceName}
                            onSelectPalace={function (name) {
                                setActivePalaceName(name);
                                setActiveTab('analysis');
                            }}
                        />

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <ChartGrid
                                chartData={chartData}
                                activePalaceName={activePalaceName}
                                setActivePalaceName={setActivePalaceName}
                                setActiveTab={setActiveTab}
                                daXianAnalysis={daXianAnalysis}
                            />
                            <AnalysisPanel
                                chartData={chartData}
                                activePalaceName={activePalaceName}
                                activeTab={activeTab}
                                setActiveTab={setActiveTab}
                                expandedStars={expandedStars}
                                toggleStar={toggleStar}
                                aiLoading={aiLoading}
                                apiKey={apiKey}
                                setApiKey={setApiKey}
                                callDeepSeekAPI={callDeepSeekAPI}
                                setAiLoading={setAiLoading}
                                virtualAge={virtualAge}
                                daXianAnalysis={daXianAnalysis}
                                activeStars={activeStars}
                                activePalace={activePalace}
                            />
                        </div>

                        {(aiLoading || aiAnalysis) && (
                            <AIReportSection
                                aiLoading={aiLoading}
                                aiAnalysis={aiAnalysis}
                                setAiAnalysis={function (v) {
                                    setAiAnalysis(v);
                                    if (!v && storage && activeHistoryId) {
                                        persistRecord({ aiAnalysis: null });
                                    }
                                }}
                                activePalaceName={activePalaceName}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Paipan App Error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return <div className="py-8 text-center">应用出错，请刷新页面</div>;
        }
        return this.props.children;
    }
}

var root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <ErrorBoundary>
        <PaipanApp />
    </ErrorBoundary>
);
