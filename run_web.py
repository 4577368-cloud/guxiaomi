#!/usr/bin/env python3
"""
一键启动「股小蜜网页 + 股票分析 API」：
  - 后端 API：8123 起，若被占用则自动试 8124、8125
  - 前端静态页：8888 起，若被占用则自动试 8889、8890…（见 WEB_PORTS）
直接运行此文件即可；控制台会打印实际端口，请用该地址打开（勿混用旧端口）。
"""
import os
import socket
import sys
import webbrowser
import time
import threading
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler

APP_DIR = Path(__file__).resolve().parent
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

WEB_PORT = 8888  # 首选前端端口
WEB_PORTS = [8888, 8889, 8890, 9000, 9001]  # 8888 被占用时依次尝试
web_port_used = [None]  # 实际绑定的前端端口，由 run_http_server 设置

API_PORT = 8123  # 股票分析后端 API 首选端口
API_PORTS = [8123, 8124, 8125]  # 8123 被占用时依次尝试
api_port_used = [None]  # 实际绑定的端口，由 run_api 设置


def is_port_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("", port))
            return True
        except OSError:
            return False


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def run_api():
    import uvicorn
    from api_server import app
    port = None
    for p in API_PORTS:
        if is_port_free(p):
            port = p
            break
    if port is None:
        print(
            f"\n未找到可用 API 端口（已尝试 {API_PORTS}），请先关闭占用进程或扩大 API_PORTS。\n"
        )
        return
    api_port_used[0] = port
    if port != API_PORT:
        print(f"\n端口 {API_PORT} 已被占用，API 使用端口 {port}")
        print(
            f"  分析页需带参数 ?api={port}，或依赖 analysis.html 自动探测本机 API 端口。\n"
        )
    uvicorn.run(app, host="0.0.0.0", port=port)


def run_http_server():
    os.chdir(APP_DIR / "project-proj_21qCfX0Vycj")
    server = None
    chosen = None
    for p in WEB_PORTS:
        if not is_port_free(p):
            continue
        try:
            server = HTTPServer(("", p), QuietHandler)
            chosen = p
            web_port_used[0] = p
            break
        except OSError:
            continue
    if server is None:
        print(
            f"\n错误：前端静态服务无法绑定端口（已尝试 {WEB_PORTS}）。"
            f"\n请结束占用进程（常见：之前未退出的 run_web.py）或修改 WEB_PORTS。\n"
        )
        return
    if chosen != WEB_PORT:
        print(f"\n端口 {WEB_PORT} 已被占用，前端使用端口 {chosen}\n")
    server.serve_forever()


def main():
    if not (APP_DIR / "api_server.py").is_file() or not (APP_DIR / "project-proj_21qCfX0Vycj").is_dir():
        print("错误：请在 guxiaomi 目录下运行 run_web.py（或从 stock_analyzer/guxiaomi 进入）")
        sys.exit(1)

    # 先起前端，保证网页能打开（多端口回退，避免 8888 占用导致整页无法访问）
    t_web = threading.Thread(target=run_http_server, daemon=True)
    t_web.start()
    for _ in range(50):
        time.sleep(0.1)
        if web_port_used[0] is not None:
            break

    web_port = web_port_used[0]

    def open_browser():
        time.sleep(1.8)
        wp = web_port_used[0]
        if wp is None:
            print("未打开浏览器：前端端口未就绪，请根据下方地址手动访问。")
            return
        url = f"http://localhost:{wp}/index.html"
        try:
            webbrowser.open(url)
            print(f"已打开预览: {url}")
        except Exception:
            pass

    # 启动 API 线程，等其选定端口后再打印
    t_api = threading.Thread(target=run_api, daemon=True)
    t_api.start()
    for _ in range(25):
        time.sleep(0.2)
        if api_port_used[0] is not None:
            break

    threading.Thread(target=open_browser, daemon=True).start()

    api_port = api_port_used[0]
    api_url = f"http://localhost:{api_port}" if api_port else "未启动"
    wp = web_port if web_port is not None else WEB_PORT
    preview_url = f"http://localhost:{wp}/index.html"
    analysis_url = f"http://localhost:{wp}/analysis.html"
    if api_port and api_port != API_PORT:
        analysis_url += f"?api={api_port}"

    print("=" * 60)
    if web_port is None:
        print("股小蜜：前端静态服务未启动（见上方错误）")
    else:
        print("股小蜜网页已启动")
    print(f"  前端（股小蜜）: {preview_url}")
    print(f"  股票分析页:     {analysis_url}")
    print(f"  后端 API:       {api_url}")
    if web_port and api_port:
        print("  请用浏览器打开上面任一前端地址（须与控制台端口一致）")
    elif web_port:
        print("  警告: 后端 API 未就绪，请检查端口占用")
    else:
        print("  警告: 前端未就绪；释放端口后重新运行 run_web.py")
    print("=" * 60)
    print("按 Ctrl+C 停止服务\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n已停止服务")
        sys.exit(0)


if __name__ == "__main__":
    main()
