function AIReportContent({ aiAnalysis, activePalaceName }) {
    return (
        <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-100">
                    <h3 className="text-base font-bold text-purple-900 mb-3 flex items-center gap-2">
                        <span className="text-lg">📍</span> {activePalaceName} · 深度精批
                    </h3>
                    <div className="text-sm text-slate-700 leading-relaxed text-justify bg-white p-3 rounded border border-indigo-50/50 shadow-sm">
                        {aiAnalysis.palaces && aiAnalysis.palaces[activePalaceName]?.content ? (
                            <div dangerouslySetInnerHTML={{ __html: aiAnalysis.palaces[activePalaceName].content.replace(/\n/g, '<br/>') }} />
                        ) : (
                            <span className="text-slate-400 italic">点击上方宫位以查看该宫位的AI详细分析...</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {aiAnalysis.siHua && (
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-2 text-sm">✨ 生年四化影响</h3>
                        <div className="space-y-2">
                            {aiAnalysis.siHua.map((item, idx) => (
                                <div key={idx} className="text-xs bg-white p-2 rounded border border-slate-100">
                                    <div className="font-bold text-indigo-700 mb-0.5">{item.title}：{item.content}</div>
                                    <div className="text-slate-600">{item.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {aiAnalysis.daXian && (
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-2 text-sm">📅 运势起伏综述</h3>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                            {aiAnalysis.daXian.map((item, idx) => (
                                <div key={idx} className="text-xs bg-white p-2 rounded border border-slate-100">
                                    <div className="flex justify-between font-bold text-slate-700 mb-0.5">
                                        <span>{item.range} ({item.palace})</span>
                                    </div>
                                    <div className="text-slate-600">{item.note}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}