# 分离部署：API 在 Render / Railway / VPS，Vercel 只托管静态页

目标：**浏览器只访问 Vercel 上的 HTML/JS/CSS**；所有 `/api/*` 请求打到 **另一台 HTTPS 上的 FastAPI**。通过构建时写入的 **`ANALYSIS_API_BASE`** 告诉前端 API 根地址。

```
用户浏览器
    ├─ https://你的站点.vercel.app/analysis.html  （静态，Vercel）
    └─ fetch https://你的API.onrender.com/api/...  （由 env.js 里的 ANALYSIS_API_BASE 决定）
```

建议顺序：**先把 API 部署好并记下公网 HTTPS 根 URL** → 再在 Vercel 配 **`ANALYSIS_API_BASE`** 并重新部署。

---

## 一、在 API 机器上跑什么命令？

项目根目录为 **`guxiaomi`**（含 `api_server.py`、`app.py` 的目录）。生产与本地一致，用 **Uvicorn** 挂 `api_server:app`：

```bash
cd guxiaomi
pip install -r requirements-dev.txt   # 推荐：含 akshare；若只要最小依赖可用 requirements.txt
uvicorn api_server:app --host 0.0.0.0 --port 8123
```

各托管平台会把 **端口** 写进环境变量 **`PORT`**，启动命令里要用 **`$PORT`**，不能用死写 8123。

本仓库根目录下的 **`Procfile`** 已写好（Render / Railway 等可直接识别）：

```procfile
web: uvicorn api_server:app --host 0.0.0.0 --port $PORT
```

自检：浏览器或 curl 访问 **`https://你的API域名/api/health`** 应返回 JSON（非 404）。

---

## 二、Render 上部署 API（逐步操作）

1. 打开 [render.com](https://render.com) 登录，**New +** → **Web Service**。
2. 连接你的 **Git 仓库**，选中包含 `guxiaomi` 的仓库。
3. **Root Directory**（重要）  
   - 若仓库根目录就是 `guxiaomi`：**留空**。  
   - 若在 monorepo 里路径是 `stock_analyzer/guxiaomi`：**填 `stock_analyzer/guxiaomi`**（按你实际路径改）。
4. **Runtime**：Python 3；**Build Command** 示例：  
   `pip install -r requirements-dev.txt`  
   （磁盘不限 250MB 时建议 dev 全量；否则用 `requirements.txt`。）
5. **Start Command**：若已提交本仓库的 `Procfile`，Render 会自动用其中的 `web:`；否则手动填：  
   `uvicorn api_server:app --host 0.0.0.0 --port $PORT`
6. **Instance type**：免费档即可试跑；长耗时分析建议付费档并适当加大 **Request timeout**（Dashboard → Service → Settings）。
7. 在 **Environment** 里配置（与本地 `.env` 同理，**配在 Render 上**，不是 Vercel）：
   - 大模型、`ALPHA_VANTAGE_API_KEY`、`GNEWS_API_KEY` 等 **全部在 API 这边配置**。
   - **CORS（必做）**：增加  
     `ALLOWED_ORIGINS=https://你的项目.vercel.app,https://你的自定义域名.com`  
     多个用英文逗号，**不要**尾斜杠。与前端真实访问的页面域名一致。
8. **Create Web Service**，等待部署完成，复制服务的 **HTTPS URL**，例如：  
   `https://guxiaomi-api-xxxx.onrender.com`  
   这就是 **`ANALYSIS_API_BASE`** 的值（**不要**末尾 `/`）。

可选：仓库里提供了 **`render.yaml`** 时，也可用 Render **Blueprint** 一键创建服务（按需改 `rootDir`）。

---

## 三、Railway 上部署 API（简要）

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**。
2. 选中仓库，**Root Directory** 设为 **`guxiaomi`**（或你的 monorepo 子路径）。
3. **Variables**：同上，把 API 密钥、LLM 地址、`ALLOWED_ORIGINS` 配在 Railway **该服务**里。
4. **Settings → Deploy → Custom Start Command**：  
   `uvicorn api_server:app --host 0.0.0.0 --port $PORT`  
   或依赖根目录 **`Procfile`**（若平台识别）。
5. 部署完成后，在 **Networking** 里生成 **HTTPS 公网域名**，同样作为 **`ANALYSIS_API_BASE`**（无尾斜杠）。

---

## 四、自有 VPS（简要）

1. 安装 Python 3.10+，克隆代码到服务器，`cd guxiaomi`。
2. `python3 -m venv .venv && source .venv/bin/activate`  
   `pip install -r requirements-dev.txt`
3. **systemd** 示例（端口按你反向代理约定，对内可固定 8123；对外只暴露 443）：

```ini
[Service]
WorkingDirectory=/path/to/guxiaomi
ExecStart=/path/to/guxiaomi/.venv/bin/uvicorn api_server:app --host 127.0.0.1 --port 8123
Environment=ALLOWED_ORIGINS=https://你的vercel域名.vercel.app
```

4. **Nginx** 反代 `https://api.你的域名` → `http://127.0.0.1:8123`，证书用 **Let’s Encrypt（certbot）**。  
   **`ANALYSIS_API_BASE`** = `https://api.你的域名`（无尾斜杠）。

---

## 五、Vercel：只托管静态页 + 注入 `ANALYSIS_API_BASE`

### 1. 改 `vercel.json`（不要再用 FastAPI 框架）

若 API 已迁走，Vercel **不应再打包 Python Serverless**，否则仍受体积与超时限制。请把根目录 **`vercel.json`** 改成类似下面（保留你现有的 `buildCommand` 里 `tar` 复制逻辑即可）：

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "python3 scripts/write_env_js.py && rm -rf web_public && mkdir -p web_public && (cd project-proj_21qCfX0Vycj && tar --exclude=node_modules -cf - .) | (cd web_public && tar -xf -)",
  "outputDirectory": "web_public"
}
```

要点：

- **删除** `"framework": "fastapi"`（整行不要）。
- **增加** `"outputDirectory": "web_public"`，让 Vercel 只发布静态资源。

构建机仍需 **Python 3** 跑 `scripts/write_env_js.py`（一般默认有）。

### 2. 在 Vercel 项目里设置环境变量

1. 打开 Vercel 项目 → **Settings** → **Environment Variables**。
2. 新增 **`ANALYSIS_API_BASE`**（Production / Preview 按需勾选），值为上一步 API 的 **HTTPS 根地址**，例如：  
   `https://guxiaomi-api-xxxx.onrender.com`  
   **不要**末尾 `/`。
3. **保存后必须重新 Deploy 一次**，构建日志里应看到 `write_env_js` 打印的 `ANALYSIS_API_BASE='https://...'`。

构建产物里的 `web_public/env.js` 会包含：

`window.ANALYSIS_API_BASE = "https://……";`

前端 `analysis.html` 会先加载 `env.js`，再请求该域名下的 `/api/...`。

### 3. Framework Preset

在 Vercel **Settings → General** 里，Framework 可选 **Other**（静态输出），与上面 `vercel.json` 一致即可。

---

## 六、部署完成后自检

| 步骤 | 操作 |
|------|------|
| 1 | 浏览器打开 **`https://API域名/api/health`** → 应 200。 |
| 2 | 打开 **`https://Vercel域名/analysis.html`** → F12 → **Network**，点「开始分析」或加载历史，请求域名应为 **API 域名**，不是 `vercel.app/api`。 |
| 3 | 若控制台报 CORS：检查 API 上的 **`ALLOWED_ORIGINS`** 是否包含当前 Vercel 页面来源（协议+主机，无路径）。 |
| 4 | 若仍请求 localhost：执行 `localStorage.removeItem('analysis_api_base')` 后硬刷新；或用 `analysis.html?api=https%3A%2F%2F你的API域名` 临时验证。 |

---

## 七、变量分工小结（避免配错地方）

| 变量 | 配在哪里 | 作用 |
|------|----------|------|
| `ANALYSIS_API_BASE` | **Vercel**（构建时） | 写入 `env.js`，浏览器知道 API 根 URL |
| `ALLOWED_ORIGINS` | **Render / Railway / VPS**（API 进程） | CORS，允许 Vercel 页面跨域调 API |
| `ALPHA_VANTAGE_API_KEY`、LLM、`.env` 里其它密钥 | **仅 API 所在平台** | Python 拉行情、调模型；**不要**写进 `env.js` |

更细的 Vercel 说明见同目录 **[VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md)**。
