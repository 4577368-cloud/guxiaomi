# 股小蜜 · 行情与基本面数据来源说明

分析报告由 `demo_ulti_analyst.py` 中 `StockDataService.get_stock_info`（**多源并行拉取 + 合并**）、`post_enrich_stock_data`（仅补缺）拉取数据；前端刷新价格见 `project-proj_21qCfX0Vycj/utils/stockAPI.js`。

### 为什么「添加股票有价、生成报告却行情/行业不可用」？

- **添加股票 / 持仓卡片**：在**用户浏览器**里请求腾讯 `qt.gtimg`（可走 Trickle 等代理），走的是**你的网络**。
- **生成报告**：在**服务器**（如 Vercel）上跑 `get_stock_info`，走的是**机房出口**，常被墙或超时，与浏览器不是同一条链路。

**已做桥接**：分析页 `analysis.html` 已加载 `utils/stockAPI.js`，点击分析前会先 `getStockPrice`，把**非 mock** 的现价与涨跌幅随 `POST /api/analyze` 的 **`client_quote`** 发给后端；`get_stock_info` 将其作为 **`浏览器行情`** 插入多源链**最前**，主定价优先，并与服务端各源合并补简介/板块。若仍缺板块，港股/美股会额外尝试 yfinance `info` 补 **sector/industry**。

**补充栏（`user_data_notes`）**：分析页多行输入对应 `POST /api/analyze` 的该字段。服务端在 `get_stock_info` 之后执行 **`_apply_user_data_notes`**：保存原文至 `StockData.用户备注原文`（内部字段名），用正则提取规整「键：值」类中文，若开启真实 LLM 则再整理杂乱/OCR 文本；合并写入标准字段时**以接口与浏览器已有有效行情为准**，仅补缺。`数据溯源` 仅简短标注「补充字段（规则/模型归并）」；`风险信号` 用中性表述提示注意时效与口径，**报告正文不强调数据来源标签**，以保持阅读连贯。

**报告标题与证券名称**：从备注解析出的 `stock_name` 会经 **`_is_plausible_stock_display_name`** 校验（排除含 `%`、`已收盘/盘后/美东`、量额换手等行情碎片、数字占比过高等）；不通过则**不会写入 `股票名称`**。报告一级标题由 **`_analysis_report_title`** 生成：有合法公司/简称时为「公司（代码）投资价值分析」，否则退化为「代码 投资价值分析」，避免标题被 OCR 整段污染。

**备注清洗（十段式）**：开启真实 LLM 时，**`_clean_user_notes_structured_llm`** 按固定提示词将粘贴整理为 10 条（名称代码、收盘涨跌、开高低、换手振幅量额、52 周、市值、股本、PE/PB、EPS/BPS、股息率）；缺项写「无」、亏损写「亏损」、禁止编造。**`_parse_structured_cleaned_notes_to_dict`** 再解析入标准字段；`用户补充指标` 存清洗全文供分析师阅读。未达三段序号或失败时回退 **正则 `try_parse_user_notes_regex`** 与原有 bullet 合并。

## 多源合并与校验（`get_stock_info`）

同一标的会按下面顺序**尽量拉全各源**，再合并为一条 `StockData`：

- **主定价源**：优先级中第一个「非占位且最新价 &gt; 0」的源；现价、涨跌幅等以主源为准。
- **互补**：其余成功源用于补齐公司简介、所属板块、总市值、市盈率/市净率、估值分位；若主源 90 日 K 线统计**退化**（如高低点异常），则用非退化的次源替换区间与波动率。
- **交叉校验**：多源现价相对差异 &gt; 3%，或两源 90 日高点偏离 &gt; 8% 时，在 `风险信号` 中追加提示（不自动改价）。
- **溯源**：合并后的 `数据溯源` 字段记录「尝试链路｜主定价源｜合并策略」，并写入分析师提示词中的【数据溯源】。

## 按市场的拉取顺序（多源链路）

| 市场 | 拉取顺序（均成功则全部参与合并） | 分析前补强 `post_enrich` |
|------|----------------------------------|-------------------------|
| **A 股** | **腾讯财经** → **yfinance**（`.SS` / `.SZ`）→ **akshare** → **Baostock** | 合并后若仍缺简介/板块或 K 线退化，再按需调 yfinance 补强 |
| **港股** | **腾讯财经** → **yfinance**（`.HK`）→ 有 Key 时 **Alpha Vantage**（补 OVERVIEW/板块） | 缺简介时补 yfinance 简介 |
| **美股** | 有 Key：**Alpha Vantage** → **yfinance**；无 Key 时仅 yfinance | 缺简介时补 yfinance 简介 |

## 按市场的大致优先级（与上表一致，速查）

| 市场 | 主路径 | 兜底 / 补强 |
|------|--------|-------------|
| **A 股** | 多源：**腾讯** → **yfinance** → **akshare** → **Baostock**（优先易通达源，后者补估值/简介） | `post_enrich` 仅在合并后仍有缺项或退化区间时补强 yfinance |
| **港股** | 多源：**腾讯** → **yfinance** → **Alpha Vantage**（有 Key；避免 AV 报价占位抢占主价） | 简介/板块由合并与 AV 补强 |
| **美股** | 多源：**Alpha Vantage**（有 Key）→ **yfinance** | 同上 |

## 常用免费 / 低门槛数据源

| 来源 | 适用 | 说明 |
|------|------|------|
| **yfinance** | 美、港、A（`.SS` / `.SZ`） | 无需 API Key；有频率与稳定性限制，部分标的 `info` 可能为空。 |
| **腾讯财经** `qt.gtimg.cn` / `web.ifzq.gtimg.cn` | A 股、港股 | 无需 Key；与前端刷新同源。 |
| **Alpha Vantage** | 美股、港股（含 OVERVIEW 公司描述） | 需 Key；免费档每日调用次数有限。 |
| **akshare / Baostock** | 主要 A 股 | 依赖国内数据源；海外机房常慢或失败，链路中排在 **腾讯 / yfinance** 之后作补强。 |
| **Finnhub / Twelve Data / Polygon** 等 | 多市场 | 一般需注册 Free Tier Key，可后续在 `StockDataService` 中扩展。 |

## 环境变量（`.env` 或 Vercel 项目设置）

| 变量 | 作用 |
|------|------|
| `ALPHA_VANTAGE_API_KEY` 或 `ALPHAVANTAGE_API_KEY` | 启用 Alpha Vantage 行情与 OVERVIEW（公司简介等）。 |
| `GTIMG_HTTP_PROXY_TEMPLATE` | 可选。形如 `https://your-proxy/?url={url}`，服务端请求腾讯接口时走代理（海外机房常用）。 |
| `VLLM_BASE_URL` / `VLLM_API_KEY` / `VLLM_MODEL_ID` | 分析报告所用 LLM，与行情无关。 |

## 部署注意（Vercel）

- 无持久磁盘时报告与任务状态在 **`/tmp`**，多实例下行为见 `api_server.py` 注释。  
- 若腾讯/yfinance 访问不稳定，优先配置 **`GTIMG_HTTP_PROXY_TEMPLATE`** 或把分析 API 部署在能直连数据源的区域。

## 股票预测（Intellectia 快照）与服务端 / 浏览器缓存

- **服务端**：点击「获取预测」会请求 Intellectia 并把结果写入 `predictions/*.json`（本地为项目目录下 `predictions/`；Serverless 上多为 **`/tmp/guxiaomi_data/predictions`**），列表接口为 `/api/screener/list`，详情为 `/api/screener/get`。
- **与历史报告的差异（已补齐）**：分析页对**历史报告**一直用 `localStorage` 合并列表并缓存正文，避免 Vercel 列表为空或换实例后「像没保存」。**股票预测**侧现已采用相同思路：`analysis-app.js` 会合并服务端与本地的预测**列表元数据**，并把打开过的快照**正文**缓存在本地（最多约 12 条、单条体积与报告类似有上限）；服务端 404 或网络失败时仍可先看本机缓存，并提示「已显示本机缓存」。删除某条快照会写墓碑并清除对应正文缓存，避免已删条目再从本地冒回列表。

## 相关文件

- `demo_ulti_analyst.py`：`StockDataService`、`post_enrich_stock_data`、腾讯/yfinance/AV 实现。  
- `api_server.py`：分析任务 HTTP 入口。  
- `project-proj_21qCfX0Vycj/utils/stockAPI.js`：浏览器端刷新价格（腾讯）。
- `project-proj_21qCfX0Vycj/analysis-app.js`：历史报告与股票预测的列表/正文本地缓存逻辑。
