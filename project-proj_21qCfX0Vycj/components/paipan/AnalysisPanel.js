function AnalysisPanel({ 
    activeTab, setActiveTab, activePalaceName, activePalace, chartData, virtualAge, daXianAnalysis,
    activeStars, expandedStars, toggleStar, callDeepSeekAPI, setAiLoading,
    apiKey, setApiKey, aiLoading,
}) {
    return (
        <div className="bg-white rounded-b-lg shadow-xl border border-slate-200 min-h-[420px] flex flex-col overflow-hidden">
            <AnalysisTabBar activeTab={activeTab} setActiveTab={setActiveTab} />
            <div className="flex-grow overflow-y-auto custom-scrollbar">
                {activeTab === 'analysis' && (
                    <SevenDimensionAnalysis 
                        activePalaceName={activePalaceName}
                        activePalace={activePalace}
                        chartData={chartData}
                        virtualAge={virtualAge}
                        daXianAnalysis={daXianAnalysis}
                    />
                )}
                
                {activeTab === 'stars' && (
                    <StarAnalysis 
                        activeStars={activeStars}
                        expandedStars={expandedStars}
                        toggleStar={toggleStar}
                    />
                )}
                
                {activeTab === 'wiki' && <ShenShaWiki />}
            </div>
            
            <div className="flex-shrink-0 border-t border-slate-100 px-3 py-3">
                <div className="mb-2 flex items-center gap-2">
                    <input
                        type="password"
                        value={apiKey || ''}
                        onChange={function (e) { setApiKey(e.target.value); }}
                        placeholder="DeepSeek API Key"
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                        autoComplete="off"
                    />
                    <button
                        type="button"
                        disabled={aiLoading}
                        onClick={function () {
                            setAiLoading(true);
                            callDeepSeekAPI();
                            setTimeout(function () {
                                var el = document.getElementById('ai-report-section');
                                if (el) el.scrollIntoView({ behavior: 'smooth' });
                            }, 100);
                        }}
                        className="shrink-0 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
                    >
                        {aiLoading ? '推演中…' : 'AI 推演'}
                    </button>
                </div>
                <p className="text-center text-[10px] text-slate-400">
                    报告生成后显示在命盘下方，并随历史排盘一并保存
                </p>
            </div>
        </div>
    );
}