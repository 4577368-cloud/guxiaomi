function AILoading() {
    return (
        <div className="flex flex-col items-center justify-center py-12">
            <div className="relative">
                <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl">🔮</span>
                </div>
            </div>
            <p className="mt-4 text-sm text-slate-600 font-medium">AI 正在深度推演命盘...</p>
            <p className="text-xs text-slate-400 mt-1">这可能需要几秒钟</p>
        </div>
    );
}