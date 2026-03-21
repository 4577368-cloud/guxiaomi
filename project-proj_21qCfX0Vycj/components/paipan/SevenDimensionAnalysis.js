function SevenDimensionAnalysis({ activePalaceName, activePalace, chartData, virtualAge, daXianAnalysis }) {
    return (
        <div className="animate-fade-in">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
                <span className="text-xl font-black text-slate-800">{activePalaceName}</span>
                <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                    虚岁{virtualAge}
                </span>
            </div>
            
            {chartData && activePalace && (() => {
                const deepAnalysis = getDeepAnalysis(activePalace, chartData.palaces, chartData.yearGan, daXianAnalysis);
                if (deepAnalysis) {
                    return (
                        <div className="space-y-4">
                            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-3 border border-indigo-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-lg">📝</span>
                                    <h4 className="text-sm font-bold text-indigo-900">宫位总评</h4>
                                </div>
                                <div className="text-xs text-indigo-800 leading-relaxed" 
                                     dangerouslySetInnerHTML={{ __html: deepAnalysis.summary }} />
                            </div>
                            
                            {Object.entries(deepAnalysis.dimensions).map(([dimension, items]) => (
                                <div key={dimension} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-slate-800">{dimension}</span>
                                            <span className="text-[10px] text-slate-500">({items.length}项)</span>
                                        </div>
                                    </div>
                                    <div className="p-3">
                                        <div className="space-y-1.5">
                                            {items.map((item, idx) => (
                                                <div key={idx} className="text-xs text-slate-700 leading-relaxed flex items-start gap-1.5">
                                                    <span className="text-slate-400 mt-0.5 flex-shrink-0">•</span>
                                                    <span dangerouslySetInnerHTML={{ __html: item }} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                }
                return <div className="text-center py-8 text-slate-400">分析数据加载中...</div>;
            })()}
        </div>
    );
}
