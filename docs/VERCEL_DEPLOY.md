# 部署到 Vercel + 远程 API（股小蜜 / 股票分析）

## 架构说明（重要）

| 部分 | 适合放 Vercel？ | 说明 |
|------|----------------|------|
| **静态前端**（源码在 `project-proj_21qCfX0Vycj`，构建复制到 **`web_public/`**） | ✅ 是 | Vercel 打 Python 包时会**排除** `**/public/**`，故不能用目录名 `public` 作为进包静态资源；改用 `web_public/` 并由 `api_server` 挂载 `StaticFiles`（在全部 `/api` 之后）。 |
| **Python `api_server.py`** | ⚠️ 可探测到但有限制 | 根目录已提供 **`app.py`**，将 `api_server.app` 暴露给 Vercel FastAPI 检测；但 Serverless **超时短**、**磁盘非持久**、**后台线程/长分析** 仍可能失败或不符合预期。 |

**推荐：** 生产环境 **API** 仍优先部署在 Render / Railway / VPS 等；Vercel 以静态页 + `ANALYSIS_API_BASE` 指过去为主。

**异步分析任务（job 轮询）在 Vercel 上的限制：** 任务状态会写入 **`/tmp`**（与报告目录一致），**同一 Serverless 实例**内可轮询成功；若负载均衡把轮询打到**另一实例**，仍可能短暂 **404**（前端已对连续多次 404 再放弃）。**旧部署留下的 `localStorage` job_id** 在新实例上也会失效。长时间、强一致任务请使用**常驻进程**的 API 主机。

若坚持在 Vercel 上跑 FastAPI，需知：

- **不要**在 `vercel.json` 里写 `installCommand: pip install -r requirements.txt`。Vercel 构建机的 Python 由 **`uv` 管理**（PEP 668），直接 `pip install` 会报错「外部管理环境」。应 **省略 `installCommand`**，由平台用 **`uv` 自动根据 `requirements.txt` 安装依赖**。
- 若必须自定义安装，可尝试：`uv pip install -r requirements.txt`（以 Vercel 当前文档为准）。
- 入口文件：根目录 **`app.py`**（`from api_server import app`），满足官方要求的 `app` 变量名。
- **构建**：`buildCommand` 会先写 `env.js` 到 `project-proj_*`，再复制到 **`web_public/`**（已 `.gitignore`）。**勿**用 `public/` 作打包目录名。

**结论（理想架构）：** Vercel 托管 **页面**；**同一套 API** 更稳妥地放在支持常驻进程 + 持久盘（或对象存储）的平台，例如：

- [Render](https://render.com) Web Service + 磁盘  
- [Railway](https://railway.app)  
- [Fly.io](https://fly.io)  
- 自有 VPS + `uvicorn` + `nginx`

在 Vercel 里配置的 **API 相关环境变量**，应写成 **`ANALYSIS_API_BASE`**（见下），供构建时写入 `env.js`，让浏览器访问 **你的 HTTPS API 根地址**。

---

## 一、Vercel 项目设置

1. **Root Directory**（若从 monorepo 导入）：设为 `stock_analyzer/guxiaomi`（或你仓库中 `guxiaomi` 所在路径）。
2. **Framework Preset**：**务必选 FastAPI**，或 `vercel.json` 里 `"framework": "fastapi"`。若选 **Other**，往往只出静态、不出 Python 函数，`/api/*` 会 **`NOT_FOUND`**。
3. **环境变量**（Production / Preview 按需）：

| 变量名 | 必填 | 示例 | 含义 |
|--------|------|------|------|
| `ANALYSIS_API_BASE` | **API 与站点不同域时必填** | `https://api.example.com` | 浏览器请求的 API 根 URL，**不要**尾斜杠。同一 Vercel 部署上跑 FastAPI 时，前端会默认用 **`location.origin`**，可不配；API 单独部署时 **必须**配置。 |

构建会执行 `write_env_js.py` 并复制到 `web_public/`。典型 `env.js` 为：

`window.ANALYSIS_API_BASE = "https://api.example.com";`

4. 确保 Vercel 使用 **Python 3** 执行构建（默认镜像通常自带 `python3`；若构建失败，在 Project → Settings → General 查看 Build 日志，必要时用 `vercel.json` 的 `buildCommand` 改为绝对路径或 `python`）。

---

## 二、远程 API 服务必须满足

1. **HTTPS**  
   页面在 `https://xxx.vercel.app` 时，浏览器会拦截对 `http://` API 的混合内容请求，API 必须是 **HTTPS**。

2. **CORS**  
   默认允许任意来源（`allow_origins=["*"]`）。生产可收紧：在 **API 服务器** 设置环境变量  
   `ALLOWED_ORIGINS=https://你的应用.vercel.app,https://自定义域名.com`  
   （逗号分隔，勿用 `*` 与 `allow_credentials` 混用——代码已按此处理）。

3. **环境变量在「API 所在机器」上配置**  
   `ALPHA_VANTAGE_API_KEY`、`GNEWS_API_KEY`、vLLM 地址等应在 **跑 FastAPI 的那台服务** 的环境变量 / 密钥管理里配置，而不是只在 Vercel 里配（Vercel 的变量只参与 **写 env.js**，不会自动进你的 Python 进程）。

4. **持久化**  
   历史报告、预测快照写在服务器本地目录时，PaaS 实例重启可能丢失；生产建议挂盘或使用对象存储 / 数据库（需自行改后端）。

---

## 三、本地开发（不变）

在 `guxiaomi` 下：

```bash
python3 run_web.py
```

`env.js` 里 `ANALYSIS_API_BASE` 为空时，仍使用 `localhost` + 端口探测。

---

## 四、可选：URL 覆盖

- 本地：`?api=8124` 仍表示 `http://localhost:8124`。  
- 任意环境：`?api=https%3A%2F%2Fapi.example.com`（完整 URL）可临时指定 API（会覆盖 `env.js` 中的默认值）。

---

## 五、部署后自检

1. 打开 `https://你的项目.vercel.app/analysis.html`。  
2. 开发者工具 → Network：请求应指向 **`ANALYSIS_API_BASE` 的域名**，且状态 200。  
3. 若仍请求 `localhost:8123`：说明 `env.js` 未生成或未加载——检查构建日志、`analysis.html` 是否先加载 `env.js`。

---

## 六、与「仅在 Vercel 配了 API 变量」的对应关系

- **只配在 Vercel、且变量名不是 `ANALYSIS_API_BASE`**：前端 **不会**自动读到，请在 Vercel 增加 **`ANALYSIS_API_BASE`**（或改 `write_env_js.py` 去读你现有的变量名）。  
- **Python API 的密钥**：必须在 **API 托管平台** 再配置一遍；Vercel 上的变量仅用于 **构建静态站时注入浏览器可见的 API 根地址**（`env.js`），不要把私钥写进 `env.js`。
