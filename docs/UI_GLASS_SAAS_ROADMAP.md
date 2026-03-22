# Glass / 现代 SaaS 视觉 — 改造进度

## ⚠️ 样式编译注意

- **不要使用 `@layer theme`**：当前使用的 Tailwind Play CDN（`type="text/tailwindcss"`）多为 v3 行为，不识别 `theme` 层会导致**整段 Tailwind 编译失败、全页无 utility**。设计变量放在顶层的 `:root { }` 即可。
- `@apply` 内避免过于生僻的组合（如极低透明度的 `shadow-*/*`）；复杂阴影可改用普通 `box-shadow`。

## ✅ 第一阶段（已完成）

- `project-proj_21qCfX0Vycj/index.html`：Inter + Plus Jakarta Sans、**加强版页面渐变**、`html { scroll-padding-top }`（锚点不被顶栏挡住）、`prefers-reduced-motion`、设计 token（`:root`）、`.glass-nav`、`.glass-quick-nav` / `.glass-quick-nav-inner`、`.modal-*`、玻璃 `.card`、`.input-field` / `.btn-*`、`.hint-glass`、`.tabular-nums`。
- `app.js`：顶栏 `sticky` + 玻璃；**快速导航（`StockNavigation`）并入顶栏、与主操作区同列置顶**；标题 `font-display`；新闻/分析 token 按钮；`<main>` 布局；空状态玻璃卡片；错误边界玻璃面板。
- `StockNavigation.js`：**玻璃渐变条 + 圆角胶囊股码**、图标徽标、hover 微抬起；仍仅在持仓 **多于 1 只** 时显示。
- `AddStockModal.js` / `PositionForm.js`：统一 `modal-overlay` + `modal-panel`。

## 🔜 第二阶段（建议下一步）

1. **子页面统一**：`analysis.html`、`news.html` 引入相同字体链接 + 复制 `index.html` 中 `@layer theme` / `base` / `components` 样式块（或抽成 `theme-glass.css` 三页共用）。
2. **组件级**：`PortfolioSummary`、`HoldingsSummaryTable`、`StockNavigation`、`PositionAllocationCard` — 区块标题统一 `font-display`，表格表头 `sticky` + `tabular-nums`。
3. **StockCard**：折叠条使用 `bg-white/40 backdrop-blur-sm` 与内容区层次区分。
4. **Chart.js**：`StockCharts.js` 中默认色与 `--primary-color` / 盈亏色对齐，tooltip 圆角与阴影。

## 🔜 第三阶段（可选）

- 暗色模式：`data-theme="dark"` + 一套 `:root` 深色 token。
- 微动效：折叠 `transition-[grid-template-rows]` 或 `max-height`（在尊重 `reduced-motion` 前提下）。
