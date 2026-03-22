# Glass / 现代 SaaS 视觉 — 改造进度

## ⚠️ 样式编译注意

- **不要使用 `@layer theme`**：当前使用的 Tailwind Play CDN（`type="text/tailwindcss"`）多为 v3 行为，不识别 `theme` 层会导致**整段 Tailwind 编译失败、全页无 utility**。设计变量放在顶层的 `:root { }` 即可。
- `@apply` 内避免过于生僻的组合（如极低透明度的 `shadow-*/*`）；复杂阴影可改用普通 `box-shadow`。

## ✅ 深色 + 玻璃 + 动效 + 响应式（当前）

- **页面**：背景渐变 `#0F172A → #1E293B`，主文字 `#F1F5F9`（`:root` token）。
- **玻璃**：顶栏 / 卡片 / 模态 / 输入框等统一 `backdrop-blur-md`（顶栏 `blur` 更强）+ `bg-white/10` 量级 + `border-white/20`。
- **按钮**：悬停 `scale(1.03)`、点击 `scale(0.97)` + `::after` 涟漪动画（`prefers-reduced-motion` 下关闭）。
- **数据刷新**：批量「刷新价格」完成后 `body` 短暂加 `gx-data-flash`，`.card` 蓝色描边脉冲（`gx-data-pulse`）。
- **布局**：`tailwind.config` 显式断点 `640 / 768 / 1024 / 1280`；`main` 使用 `.app-shell`（Flex 纵排）；持仓列表 `.app-stock-grid` 在 **≥1024px** 为 **2 列 CSS Grid**，`&lt;1024` 为单列。
- **#root 映射**：第二段 `<style>` 将大量 `bg-gray-50`、`text-gray-*`、`border-gray-*` 等浅色类映射为深色玻璃可读色；**文案灰阶已整体提亮**（`text-gray-500/600` 等）便于辨认。
- **仓位分配**：`PositionAllocationCard` 改为 **环形图（doughnut）+ 右侧紧凑图例**，去掉大块双卡片与长进度条区；配色与主图例色点一致。
- **数字**：`.gx-num`（等宽数字 + 略增字距）+ 全局 token 提亮（主字 `#f8fafc`、涨跌 `#4ade80` / `#fb7185`）。

## ✅ 第一阶段（历史）

- 顶栏 sticky、快速导航、`scroll-padding-top`、`StockNavigation` 等仍保留。
- `AddStockModal.js` / `PositionForm.js`：统一 `modal-overlay` + `modal-panel`。

## 🔜 第二阶段（建议下一步）

1. **子页面统一**：`analysis.html`、`news.html` 引入相同字体链接 + 复制 `index.html` 中 `@layer theme` / `base` / `components` 样式块（或抽成 `theme-glass.css` 三页共用）。
2. **组件级**：`PortfolioSummary`、`HoldingsSummaryTable`、`StockNavigation`、`PositionAllocationCard` — 区块标题统一 `font-display`，表格表头 `sticky` + `tabular-nums`。
3. **StockCard**：折叠条使用 `bg-white/40 backdrop-blur-sm` 与内容区层次区分。
4. **Chart.js**：`StockCharts.js` 中默认色与 `--primary-color` / 盈亏色对齐，tooltip 圆角与阴影。

## 🔜 第三阶段（可选）

- 暗色模式：`data-theme="dark"` + 一套 `:root` 深色 token。
- 微动效：折叠 `transition-[grid-template-rows]` 或 `max-height`（在尊重 `reduced-motion` 前提下）。
