function AIReportSection({ aiLoading, aiAnalysis, setAiAnalysis, activePalaceName }) {
    return (
        <div className="scroll-mt-4 animate-fade-in rounded-xl border border-purple-200 bg-white shadow-lg" id="ai-report-section">
            <div className="flex items-center justify-between border-b border-purple-100 bg-gradient-to-r from-purple-50 to-indigo-50 px-4 py-3">
                <div className="flex items-center gap-2">
                    <div className="icon-sparkles text-lg text-purple-600" aria-hidden />
                    <div>
                        <h2 className="text-base font-bold text-indigo-900">AI 深度命理报告</h2>
                        <p className="text-xs text-slate-500">基于当前命盘与所选宫位的智能推演</p>
                    </div>
                </div>
                {!aiLoading && aiAnalysis && (
                    <button
                        type="button"
                        onClick={function () { setAiAnalysis(null); }}
                        className="rounded-lg px-2 py-1 text-xs text-slate-500 transition hover:bg-white hover:text-slate-700"
                    >
                        关闭
                    </button>
                )}
            </div>
            <div className="p-4">
                {aiLoading ? (
                    <AILoading />
                ) : (
                    <AIReportContent aiAnalysis={aiAnalysis} activePalaceName={activePalaceName} />
                )}
            </div>
        </div>
    );
}