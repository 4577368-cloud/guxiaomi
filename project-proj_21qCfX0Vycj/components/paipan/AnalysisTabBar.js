function AnalysisTabBar({ activeTab, setActiveTab }) {
    const tabs = [
        { id: 'analysis', label: '七维精析', icon: '🔍' },
        { id: 'stars', label: '星曜解析', icon: '⭐' },
        { id: 'wiki', label: '神煞百科', icon: '📚' }
    ];
    
    return (
        <div className="flex bg-white rounded-t-lg shadow-sm overflow-hidden border-b border-slate-200">
            {tabs.map(tab => (
                <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 py-3 text-sm font-bold transition-colors flex items-center justify-center gap-1 ${
                        activeTab === tab.id 
                            ? 'bg-indigo-900 text-white' 
                            : 'bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                </button>
            ))}
        </div>
    );
}