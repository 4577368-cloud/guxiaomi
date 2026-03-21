function StarAnalysis({ activeStars, expandedStars, toggleStar }) {
    return (
        <div className="animate-fade-in">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
                <span>⭐</span>星曜深度解析
            </h3>
            
            {activeStars.length > 0 ? (
                <div className="space-y-3">
                    {activeStars.map(star => (
                        <div key={star} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                            <button 
                                onClick={() => toggleStar(star)} 
                                className="w-full flex justify-between items-center px-3 py-3 text-left hover:bg-slate-50 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col items-center">
                                        <span className="text-lg font-black text-indigo-900">{star}</span>
                                        {SHEN_SHA_DB[star] && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded text-white ${
                                                SHEN_SHA_DB[star].type === '吉' ? 'bg-green-600' : 
                                                SHEN_SHA_DB[star].type === '凶' ? 'bg-red-600' : 'bg-slate-500'
                                            }`}>
                                                {SHEN_SHA_DB[star].category}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <span className="text-sm text-slate-400">{expandedStars[star] ? '▲' : '▼'}</span>
                            </button>
                            
                            {expandedStars[star] && (
                                <div className="px-4 pb-4 pt-2 text-sm leading-relaxed border-t border-dashed border-slate-100 bg-slate-50/50">
                                    {STAR_INFO[star] ? (
                                        <div className="space-y-2">
                                            <div className="text-indigo-800 font-bold">星曜详解：</div>
                                            <div dangerouslySetInnerHTML={{ 
                                                __html: STAR_INFO[star].replace(/\n/g, '<br/>').replace(/\*/g, '•')
                                            }} />
                                        </div>
                                    ) : SHEN_SHA_DB[star] ? (
                                        <div className="space-y-2">
                                            <div><span className="font-bold text-indigo-800">应事领域：</span> {SHEN_SHA_DB[star].field}</div>
                                            <div><span className="font-bold text-indigo-800">解读规则：</span> {SHEN_SHA_DB[star].rule}</div>
                                            <div><span className="font-bold text-indigo-800">星曜性质：</span> {SHEN_SHA_DB[star].type}星</div>
                                        </div>
                                    ) : (
                                        <span className="text-slate-400 italic">暂无详细断语</span>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-8 text-slate-400 italic">
                    请先点击一个宫位以查看其星曜
                </div>
            )}
        </div>
    );
}