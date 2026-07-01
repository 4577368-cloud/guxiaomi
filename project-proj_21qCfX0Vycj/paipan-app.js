const { useState } = React;

function PaipanApp() {
    const [birthInfo, setBirthInfo] = useState({
        year: '',
        month: '',
        day: '',
        hour: '',
        gender: 'male',
        isLeapMonth: false
    });
    
    const [chartData, setChartData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [activePalaceName, setActivePalaceName] = useState('命宫');
    const [activeTab, setActiveTab] = useState('analysis');
    const [expandedStars, setExpandedStars] = useState({});
    const [aiLoading, setAiLoading] = useState(false);
    const [aiAnalysis, setAiAnalysis] = useState(null);
    const [apiKey, setApiKey] = useState('');

    React.useEffect(function () {
        if (!window.GuxiaomiChat) return;
        var virtualAge = birthInfo.year
            ? new Date().getFullYear() - parseInt(birthInfo.year, 10) + 1
            : 0;
        var extras = [];
        if (chartData && activePalaceName) extras.push('当前宫位：' + activePalaceName);
        if (virtualAge) extras.push('虚岁约：' + virtualAge);
        if (aiAnalysis) extras.push('AI 分析摘录：' + String(aiAnalysis).slice(0, 1500));
        window.GuxiaomiChat.setContext({
            page: 'paipan',
            scopeKey: 'paipan|' + (birthInfo.year || 'session'),
            title: chartData ? '紫微排盘 · ' + activePalaceName : '紫微排盘',
            extras: extras.length ? extras.join('\n') : '尚未完成排盘，可先输入生辰并排盘。',
        });
    }, [chartData, activePalaceName, birthInfo.year, aiAnalysis]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        try {
            const chart = await calculateFullChart(birthInfo);
            setChartData(chart);
        } catch (error) {
            console.error('排盘计算错误:', error);
            alert('排盘计算失败，请检查输入信息');
        } finally {
            setLoading(false);
        }
    };

    const callDeepSeekAPI = async () => {
        if (!apiKey) {
            alert('请先输入 DeepSeek API Key');
            setAiLoading(false);
            return;
        }

        try {
            const prompt = generateAIPrompt(chartData, birthInfo);
            const result = await callDeepSeekAI(apiKey, prompt);
            setAiAnalysis(result);
        } catch (error) {
            console.error('AI分析失败:', error);
            alert('AI分析失败，请检查API Key或网络连接');
        } finally {
            setAiLoading(false);
        }
    };

    const toggleStar = (starName) => {
        setExpandedStars(prev => ({
            ...prev,
            [starName]: !prev[starName]
        }));
    };

    const activePalace = chartData?.palaces.find(p => p.name === activePalaceName);
    const activeStars = activePalace ? [...activePalace.stars.major.map(s => s.name), ...activePalace.stars.minor.map(s => s.name)] : [];
    const virtualAge = birthInfo.year ? new Date().getFullYear() - parseInt(birthInfo.year) + 1 : 0;
    const daXianAnalysis = chartData ? calculateDaXianAnalysis(chartData.palaces, virtualAge, birthInfo.gender) : null;

    return (
        <div className="min-h-screen py-4 px-2 md:py-8 md:px-4">
            <div className="max-w-7xl mx-auto">
                <Header />
                
                <div className="mt-4 md:mt-8">
                    <BirthInfoForm 
                        birthInfo={birthInfo}
                        setBirthInfo={setBirthInfo}
                        onSubmit={handleSubmit}
                        loading={loading}
                        apiKey={apiKey}
                        setApiKey={setApiKey}
                    />
                </div>

                {chartData && (
                    <div className="mt-4 md:mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div>
                            <ChartGrid 
                                chartData={chartData}
                                activePalaceName={activePalaceName}
                                setActivePalaceName={setActivePalaceName}
                                setActiveTab={setActiveTab}
                                daXianAnalysis={daXianAnalysis}
                            />
                        </div>
                        <div>
                            <AnalysisPanel 
                                chartData={chartData}
                                activePalaceName={activePalaceName}
                                activeTab={activeTab}
                                setActiveTab={setActiveTab}
                                expandedStars={expandedStars}
                                toggleStar={toggleStar}
                                aiLoading={aiLoading}
                                aiAnalysis={aiAnalysis}
                                setAiAnalysis={setAiAnalysis}
                                callDeepSeekAPI={callDeepSeekAPI}
                                setAiLoading={setAiLoading}
                                virtualAge={virtualAge}
                                daXianAnalysis={daXianAnalysis}
                                activeStars={activeStars}
                                activePalace={activePalace}
                            />
                        </div>
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
            return <div className="text-center py-8">应用出错，请刷新页面</div>;
        }
        return this.props.children;
    }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <ErrorBoundary>
        <PaipanApp />
    </ErrorBoundary>
);
