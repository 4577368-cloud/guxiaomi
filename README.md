# 多智能体股票分析师 Web 应用

基于 Streamlit 的股票分析界面，支持 A 股、港股、美股实时数据；港股/美股优先使用 Alpha Vantage，失败则用 yfinance 兜底；支持结合最近 3 份历史报告生成「对比上次变化与异动信号」。

## 运行程序的步骤（推荐）

**每次使用：运行 `run_app.py`，自动打开浏览器并启动应用。**

1. 在 IDE 中打开项目，**直接运行 `run_app.py`**（点击运行按钮或右键 Run）。
2. 或在终端执行：
   ```bash
   cd guxiaomi
   python run_app.py
   ```
3. 约 2 秒后会自动打开默认浏览器，访问 **http://localhost:8888**，无需再手动输入地址。
4. 在页面侧边栏输入股票代码、选择市场，点击「开始分析」即可。

## 环境要求与安装

- Python 3.9+
- **本地完整能力**（Streamlit、`akshare` 等）：`requirements-dev.txt`（内含对 `requirements.txt` 的引用）
- **仅 API / 与 Vercel 对齐的最小依赖**：`requirements.txt`（不含 Streamlit、不含 akshare，体积适合 Serverless）

```bash
cd guxiaomi
pip install -r requirements-dev.txt
```

## 部署（API 与静态站分离）

生产推荐：**API** 部署在 [Render](https://render.com) / [Railway](https://railway.app) / 自有 VPS；**页面**部署在 Vercel，并在 Vercel 环境变量中设置 **`ANALYSIS_API_BASE`** 指向 API 的 HTTPS 根地址。逐步说明见 **`docs/SPLIT_DEPLOY.md`**。

## 数据源说明

- **A 股**：本地推荐 **akshare**（`requirements-dev.txt`）；仅装 `requirements.txt` 时走 **腾讯财经 + yfinance** 等多源合并。
- **港股 / 美股**：优先使用 **Alpha Vantage**（若已配置 API Key），信息更丰富；失败或未配置时自动用 **yfinance** 兜底。
- 配置 Alpha Vantage / GNews / vLLM 等：复制 **`.env.example` 为 `.env`** 并按注释填写（`run_web.py` 拉起的 `api_server` 与 `demo_ulti_analyst` 会自动加载同目录 `.env`）。变量说明以 `.env.example` 为准。

## 报告命名与历史对比

- **报告文件名**：`市场_股票代码_时间.md` / `.html`，例如 `港股_3690_20260314_143052.md`，便于按市场、代码、时间查找。
- **历史报告参与分析**：同一只股票（同一市场+代码）若已有历史报告，分析时会自动加载**最近 3 份**报告摘要，并在本次报告中增加 **「对比上次变化与异动信号」** 板块，解读相对上次的数据与结论变化、异动信号。

## 功能概览

- **股票分析**：多角色分析 + 辩论 + 报告导出；生成报告时自动拉取 **GNews + 多 RSS 源** 的相关新闻，供分析师引用并解读利好/利空。
- **模拟持仓**：添加持仓（代码、市场、数量、买入价）后，按当前价估算浮动盈亏；支持「分析该股」「查看新闻」跳转。

## 新闻源（报告内引用）

生成报告时会通过 **GNews API**（需配置 `GNEWS_API_KEY`）及以下 **RSS 订阅源** 拉取与该公司/股票相关的新闻，供分析师在报告中引用解读：

- Reuters Top / Business / Technology、WSJ、FT、MIT Tech Review、TechCrunch、Wired、OpenAI 等（见 `news_feeds.py` 中 `DEFAULT_RSS_URLS`）。
- 在 `.env` 中配置 `GNEWS_API_KEY` 后，报告分析将同时使用 GNews 搜索结果与 RSS 结果。

## 使用说明

1. 顶部可选择 **「股票分析」** 或 **「模拟持仓」**。
2. **股票分析**：在侧边栏输入股票代码、市场、历史天数等，点击「开始分析」；报告会自动包含相关新闻并供分析师引用利好/利空。
3. **模拟持仓**：添加持仓后查看当前价与浮动盈亏；可点击「分析该股」预填侧边栏并跳转分析，或「新闻」查看该股相关新闻。
4. 若无可用 LLM API，可勾选「使用模拟数据」进行测试。

## 报告输出目录

报告保存在本目录下的 `reports/` 中，命名格式：`A股|港股|美股_代码_年月日_时分秒`。

## 部署到 Vercel

静态前端可部署在 Vercel；Python API 需单独托管（HTTPS）。步骤与变量说明见 **[docs/VERCEL_DEPLOY.md](docs/VERCEL_DEPLOY.md)**。

## 免责声明

本工具仅供学习与研究，不构成任何投资建议。投资有风险，决策需谨慎。
