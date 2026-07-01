/** 未排盘时的引导与功能说明 */
function PaipanWelcome() {
  var cards = [
    {
      icon: 'icon-compass',
      title: '快速排盘',
      desc: '输入生辰即可生成十二宫命盘，点击宫位查看七维精析与星曜含义。',
    },
    {
      icon: 'icon-trending-up',
      title: '投资视角',
      desc: '重点关注财帛、官禄、福德、迁移等宫位，结合股小蜜持仓做性格与节奏参考。',
    },
    {
      icon: 'icon-sparkles',
      title: 'AI 与深度报告',
      desc: '本页支持 AI 宫位推演；完整命盘报告、财富密码、持仓排盘请前往「紫微深度」页。',
    },
    {
      icon: 'icon-book-open',
      title: '历史排盘',
      desc: '每次排盘可保存到本地历史，一键恢复生辰、命盘与 AI 分析，无需重复输入。',
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map(function (card) {
        return (
          <div
            key={card.title}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-2 flex items-center gap-2">
              <div className={'text-lg text-indigo-600 ' + card.icon} aria-hidden />
              <h4 className="text-sm font-bold text-slate-800">{card.title}</h4>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">{card.desc}</p>
          </div>
        );
      })}
      <div className="sm:col-span-2 flex flex-wrap gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
        <a href="ziwei.html" className="btn btn-primary btn-sm gap-1">
          <div className="icon-stars text-sm" aria-hidden />
          紫微深度分析
        </a>
        <a href="index.html" className="btn btn-secondary btn-sm gap-1">
          <div className="icon-pie-chart text-sm" aria-hidden />
          返回投资工作台
        </a>
      </div>
    </div>
  );
}
