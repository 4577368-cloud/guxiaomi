function Header() {
    return (
        <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)]">
                紫微斗数排盘
            </h1>
            <p className="mt-2 text-[var(--text-secondary)]">
                专业的命理分析工具
            </p>
            
            <div className="mt-6 flex justify-center gap-4">
                <a href="index.html" className="btn btn-secondary">
                    <div className="icon-arrow-left inline-block mr-2"></div>
                    返回首页
                </a>
            </div>
        </div>
    );
}