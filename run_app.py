#!/usr/bin/env python3
"""
一键启动股票分析 Web 应用：启动 Streamlit 并自动打开浏览器。
直接运行此文件即可（如 IDE 中点击运行、或终端 python run_app.py）。
"""
import subprocess
import sys
import webbrowser
import time
from pathlib import Path

PORT = 8888
URL = f"http://localhost:{PORT}"

def main():
    app_dir = Path(__file__).resolve().parent
    app_file = app_dir / "stock_analyzer_app.py"
    if not app_file.exists():
        print(f"错误: 未找到 {app_file}")
        sys.exit(1)

    # 先打开浏览器（延迟 2 秒后打开，留时间给 Streamlit 启动）
    def open_browser():
        time.sleep(2)
        webbrowser.open(URL)
        print(f"已打开浏览器: {URL}")

    import threading
    t = threading.Thread(target=open_browser, daemon=True)
    t.start()

    # 启动 Streamlit（会阻塞直到用户停止）
    subprocess.run(
        [
            sys.executable, "-m", "streamlit", "run",
            str(app_file),
            "--server.port", str(PORT),
            "--server.headless", "true",
        ],
        cwd=str(app_dir),
    )

if __name__ == "__main__":
    main()
