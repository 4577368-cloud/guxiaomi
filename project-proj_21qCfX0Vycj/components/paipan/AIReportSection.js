function AIReportSection({ aiLoading, aiAnalysis, setAiAnalysis, activePalaceName }) {
    return (
        <div className="bg-white shadow-lg rounded-sm border border-slate-300 p-6 animate-fade-in scroll-mt-4" id="ai-report-section">
            {aiLoading ? (
                <AILoading />
            ) : (
                <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">🤖</span>
                            <div>
                                <h2 className="text-xl font-bold text-indigo-900">AI 深度命理报告</h2>
                                <p className="text-sm text-slate-500">基于 DeepSeek V3 模型的全盘智能推演</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => setAiAnalysis(null)}
                            className="text-sm text-slate-400 hover:text-slate-600 px-3 py-1 rounded hover:bg-slate-100 transition-colors"
                        >
                            关闭报告
                        </button>
                    </div>

                    <AIReportContent aiAnalysis={aiAnalysis} activePalaceName={activePalaceName} />
                </div>
            )}
        </div>
    );
}