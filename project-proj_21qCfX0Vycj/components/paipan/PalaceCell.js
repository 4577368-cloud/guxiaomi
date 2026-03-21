function PalaceCell({ palace, isActive, onClick, daXianAnalysis, chartData }) {
    if (!palace) {
        return <div className="aspect-square bg-gray-100 rounded"></div>;
    }

    const isDaXianPalace = daXianAnalysis?.currentDaXian?.palace?.name === palace.name;
    const transformations = getPalaceTransformations(palace);

    return (
        <div 
            onClick={onClick}
            className={`aspect-square border-2 rounded p-1 md:p-2 text-xs cursor-pointer transition-all ${
                isActive 
                    ? 'border-indigo-600 bg-indigo-50 shadow-lg scale-105' 
                    : isDaXianPalace
                    ? 'border-purple-400 bg-purple-50/30 pulse-glow'
                    : 'border-slate-300 bg-white hover:border-indigo-400 hover:bg-indigo-50/30'
            }`}
        >
            <div className="flex flex-col h-full text-[10px] md:text-xs">
                <div className="flex items-start justify-between mb-1">
                    <div className="font-black text-slate-800">{palace.name}</div>
                    {isDaXianPalace && (
                        <span className="text-[8px] bg-purple-600 text-white px-1 rounded">大限</span>
                    )}
                </div>
                
                <div className="text-[9px] text-slate-500 mb-1">
                    {palace.stem}{palace.zhi}
                </div>
                
                <div className="flex-grow overflow-hidden">
                    <div className="space-y-0.5">
                        {palace.stars.major.slice(0, 3).map((star, i) => (
                            <div key={i} className="flex items-center gap-1">
                                <span className={`w-1 h-1 rounded-full ${getBrightnessColor(star.brightness)}`}></span>
                                <span className="font-bold text-indigo-900 truncate">{star.name}</span>
                            </div>
                        ))}
                        {palace.stars.minor.slice(0, 2).map((star, i) => (
                            <div key={i} className="text-slate-600 truncate text-[9px]">{star.name}</div>
                        ))}
                    </div>
                </div>
                
                {transformations.length > 0 && (
                    <div className="flex gap-0.5 mt-1">
                        {transformations.map((trans, i) => {
                            const style = getSiHuaStyle(trans.type);
                            return (
                                <span 
                                    key={i}
                                    className={`text-[8px] px-1 rounded text-white ${style.bg}`}
                                >
                                    {trans.type}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
