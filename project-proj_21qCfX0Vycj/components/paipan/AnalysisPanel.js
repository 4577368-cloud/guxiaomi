function AnalysisPanel({ 
    activeTab, activePalaceName, activePalace, chartData, virtualAge, daXianAnalysis,
    activeStars, expandedStars, toggleStar, callDeepSeekAPI, setAiLoading
}) {
    return (
        <div className="bg-white rounded-b-lg shadow-xl border border-slate-200 p-4 min-h-[500px] flex flex-col">
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
            
            <div className="mt-4 pt-4 border-t border-slate-100 flex-shrink-0">
                <button 
                    onClick={() => {
                        setAiLoading(true);
                        callDeepSeekAPI();
                        setTimeout(() => document.getElementById('ai-report-section')?.scrollIntoView({ behavior: 'smooth' }), 100);
                    }}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm font-medium py-2.5 rounded shadow-sm transition-all flex items-center justify-center gap-2"
                >
                    <span className="text-base">🔮</span>
                    <span>AI深度推演</span>
                </button>
                <div className="text-[10px] text-slate-400 mt-2 text-center opacity-70">
                    需填写 API Key · 生成结果显示在命盘下方
                </div>
            </div>
        </div>
    );
}