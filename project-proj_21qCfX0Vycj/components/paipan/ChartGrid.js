function ChartGrid({ chartData, activePalaceName, setActivePalaceName, setActiveTab, daXianAnalysis }) {
    // 紫微斗数标准排盘布局：巳午未申(上行)、辰-中心-酉(中行)、卯寅丑子(下行)
    // 宫位顺序从命宫开始：命宫、父母、福德、田宅、官禄、奴仆、迁移、疾厄、财帛、子女、夫妻、兄弟
    const gridLayout = [4,5,6,7,3,-1,-1,8,2,-1,-1,9,1,0,11,10];
    
    return (
        <div className="bg-white shadow-xl rounded-lg border-2 border-slate-300 p-2 md:p-4">
            {chartData ? (
                <div className="grid grid-cols-4 gap-1 md:gap-2" style={{ aspectRatio: '1/1' }}>
                    {gridLayout.map((palaceIndex, gridIdx) => {
                        if (palaceIndex === -1) {
                            return <CenterInfo key={gridIdx} chartData={chartData} />;
                        }
                        
                        const palace = chartData.palaces[palaceIndex];
                        const isActive = activePalaceName === palace.name;
                        
                        return (
                            <PalaceCell 
                                key={gridIdx}
                                palace={palace}
                                isActive={isActive}
                                onClick={() => { 
                                    setActivePalaceName(palace.name); 
                                    setActiveTab('analysis'); 
                                }}
                                daXianAnalysis={daXianAnalysis}
                                chartData={chartData}
                            />
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-20 text-stone-400">初始化...</div>
            )}
        </div>
    );
}
