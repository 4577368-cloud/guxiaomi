function Header() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
      <div className="min-w-0">
        <h1 className="font-display text-xl font-bold text-slate-900 md:text-2xl">
          紫微斗数排盘
        </h1>
        <p className="mt-0.5 text-xs text-slate-500">
          快速命盘 · 七维宫位 · 投资性格参考
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href="ziwei.html" className="btn btn-primary btn-sm gap-1">
          <div className="icon-stars text-sm" aria-hidden />
          深度命理
        </a>
        <a href="index.html" className="btn btn-secondary btn-sm gap-1">
          <div className="icon-arrow-left text-sm" aria-hidden />
          首页
        </a>
      </div>
    </div>
  );
}
