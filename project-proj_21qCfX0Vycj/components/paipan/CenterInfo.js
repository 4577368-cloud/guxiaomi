function CenterInfo({ chartData }) {
    const { basicInfo } = chartData;
    
    return (
        <div className="col-span-2 row-span-2 bg-gradient-to-br from-slate-50 to-slate-100 rounded flex flex-col items-center justify-center p-2 border border-slate-200">
            <div className="text-center space-y-1">
                <div className="text-lg md:text-2xl font-black text-slate-800">
                    {basicInfo.name || '命盘'}
                </div>
                <div className="text-xs text-slate-600 space-y-0.5">
                    <div>{basicInfo.mingGong}宫安命</div>
                    <div>{basicInfo.wuxingJu}</div>
                    <div className="text-[10px] text-slate-400">{basicInfo.nayin}</div>
                </div>
            </div>
        </div>
    );
}