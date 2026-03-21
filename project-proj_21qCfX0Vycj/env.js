/* 本地默认留空，将使用 localhost 与端口探测。
 * Vercel 部署时由 scripts/write_env_js.py 根据环境变量 ANALYSIS_API_BASE 覆盖。
 * 值为完整 HTTPS 根地址，无尾斜杠，例如：https://your-api.onrender.com */
window.ANALYSIS_API_BASE = window.ANALYSIS_API_BASE || "";
