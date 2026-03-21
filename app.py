"""
Vercel Python / ASGI 入口（需名为 `app` 的 FastAPI 实例）。

本地开发可继续：
  uvicorn api_server:app --host 0.0.0.0 --port 8123
  或 python run_web.py
"""
from api_server import app

__all__ = ["app"]
