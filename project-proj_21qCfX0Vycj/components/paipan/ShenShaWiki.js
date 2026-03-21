function ShenShaWiki() {
    return (
        <div className="animate-fade-in space-y-4">
            <div className="bg-indigo-50 p-3 rounded border border-indigo-100">
                <h3 className="text-sm font-bold text-indigo-900 mb-1 flex items-center gap-2">
                    <span>📖</span>神煞速查百科
                </h3>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                {Object.entries(SHEN_SHA_DB).map(([name, info]) => (
                    <div key={name} className="flex flex-col bg-white border border-slate-200 rounded p-2 hover:border-indigo-300 transition-colors">
                        <div className="flex justify-between items-center mb-1">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-indigo-900">{name}</span>
                                <span className={`text-[10px] px-1.5 rounded text-white ${
                                    info.type === '吉' ? 'bg-green-600' : 
                                    info.type === '凶' ? 'bg-red-600' : 'bg-slate-400'
                                }`}>
                                    {info.type}
                                </span>
                            </div>
                        </div>
                        <div className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-1 rounded">
                            {info.rule}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}