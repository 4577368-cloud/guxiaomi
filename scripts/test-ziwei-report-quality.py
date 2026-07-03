#!/usr/bin/env python3
"""Smoke-test Ziwei report generation against local API (basic + wealth)."""
from __future__ import annotations

import json
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "project-proj_21qCfX0Vycj"
API_BASE = "http://localhost:8123"
MODEL_KEY = "model2"
OUT_DIR = ROOT / "tmp" / "ziwei-report-tests"

NODE_SNIPPET = r"""
const fs = require('fs');
global.window = global;
for (const f of [
  'utils/ziwei/constants.bundle.js',
  'utils/ziwei/astrologyService.bundle.js',
  'utils/ziwei/interpretationService.bundle.js',
  'utils/ziwei/ziweiCore.js',
  'utils/ziwei/profileUtils.js',
  'utils/ziwei/chartTextExport.js',
]) { eval(fs.readFileSync(f, 'utf8')); }
const profile = {
  name: '张三',
  birthDate: '1990-08-27',
  birthTime: '08:00',
  gender: 'male',
  longitude: 120,
};
process.stdout.write(global.ZiweiChartTextExport.exportFromProfile(profile, { refDate: new Date() }));
"""


def build_basic_system_prompt() -> str:
    now = datetime.now()
    y, m, d = now.year, now.month, now.day
    lunar_month = {10: "九月", 11: "十月", 12: "十一月"}.get(m, "七月")
    date_str = f"{y}年{m}月{d}日"
    return f"""你是资深的国学易经术数领域专家，精通三合紫微、飞星紫微、河洛紫微、钦天四化等各流派技法。请根据用户提供的完整命盘文本，生成「紫微斗数基础命盘全析」。

【大限与流年补充】（须写透，但不得替代十二宫逐宫分析）
- 结合生辰与{y}年（基准日{date_str}）推算虚岁
- 当前大限：宫位、干支、起止年龄、四化、对财官迁福的影响（详尽展开）
- 下一大限：起运时间、主题、与当前大限的转折
- {y}年流年及今后1-2年关键窗口
- 禁止「详见命盘」「篇幅从略」；禁止逐段罗列全部十二大限；禁止文末温馨提示/免责声明
- 正文不要用 ** 加粗（小标题用【】）；行业与个股推荐必须用 | 表格，禁止纯文字列表代替表格

输出结构：
【命盘总论】
【十二宫逐宫精析】（命宫、兄弟、夫妻、子女、财帛、疾厄、迁移、交友、官禄、田宅、福德、父母，每宫独立小节）
【大限与流年】
【事业财运综合】
【感情健康提示】
"""


def build_wealth_system_prompt() -> str:
    now = datetime.now()
    y, m, d = now.year, now.month, now.day
    lunar_month = {10: "九月", 11: "十月", 12: "十一月"}.get(m, "七月")
    date_str = f"{y}年{m}月{d}日"
    next_m = 1 if m == 12 else m + 1
    next_y = y + 1 if m == 12 else y
    return f"""你是紫微斗数财富分析专家，请根据命盘文本生成「紫微斗数财富密码」投资策略报告。

基准：{date_str}（农历约{lunar_month}），下月参考 {next_y}年{next_m}月。
禁止模板套话、免责声明、**加粗。小标题用【】。
须结合财帛、福德、田宅、官禄及四化，给出可执行的投资风格、仓位节奏、行业板块（用 | 表格）。

输出结构：
【财富格局总论】
【投资风格与风险偏好】
【行业板块机会】（表格）
【仓位与节奏建议】
【{y}年关键时间窗】
"""


def export_chart_text() -> str:
    proc = subprocess.run(
        ["node", "-e", NODE_SNIPPET],
        cwd=PROJECT,
        capture_output=True,
        text=True,
        check=True,
    )
    text = proc.stdout.strip()
    if not text:
        raise RuntimeError("引擎未生成命盘文本")
    return text


def call_llm(system: str, user: str, label: str) -> str:
    payload = {
        "system": system,
        "user": user,
        "stream": False,
        "max_tokens": 8192,
        "model_key": MODEL_KEY,
    }
    req = urllib.request.Request(
        f"{API_BASE}/api/llm/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    print(f"[{label}] 请求中…（模型 {MODEL_KEY}，命盘 {len(user)} 字）", flush=True)
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{label} HTTP {e.code}: {body}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"{label} 无法连接 {API_BASE}，请先运行 python3 run_web.py") from e

    if not data.get("ok") and data.get("content") is None:
        raise RuntimeError(f"{label} API 异常: {data}")
    content = data.get("content") or ""
    print(f"[{label}] 完成，{len(content)} 字", flush=True)
    return content


def quality_hints(content: str, label: str) -> list[str]:
    issues: list[str] = []
    if len(content) < 800:
        issues.append("篇幅偏短（<800字）")
    if "**" in content:
        issues.append("含 ** 加粗（prompt 要求避免）")
    for phrase in ("详见命盘", "篇幅从略", "免责声明", "温馨提示", "以上分析仅供参考"):
        if phrase in content:
            issues.append(f"含套话：{phrase}")
    if label == "basic" and "【十二宫" not in content and "命宫" not in content:
        issues.append("可能缺少逐宫分析")
    if label == "wealth" and "财" not in content:
        issues.append("财富主题不明显")
    return issues


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    chart_text = export_chart_text()
    (OUT_DIR / f"{stamp}-chart.txt").write_text(chart_text, encoding="utf-8")
    print(f"命盘文本已保存（{len(chart_text)} 字）")

    sections = [
        ("basic", build_basic_system_prompt()),
        ("wealth", build_wealth_system_prompt()),
    ]
    summary_lines = [f"# Ziwei report test {stamp}", ""]

    for key, system in sections:
        content = call_llm(system, chart_text, key)
        out_path = OUT_DIR / f"{stamp}-{key}.md"
        out_path.write_text(content, encoding="utf-8")
        hints = quality_hints(content, key)
        summary_lines.append(f"## {key}")
        summary_lines.append(f"- 文件: `{out_path.relative_to(ROOT)}`")
        summary_lines.append(f"- 字数: {len(content)}")
        if hints:
            summary_lines.append("- 待关注: " + "；".join(hints))
        else:
            summary_lines.append("- 自动检查: 无明显套话/格式问题")
        summary_lines.append("")

    summary_path = OUT_DIR / f"{stamp}-summary.md"
    summary_path.write_text("\n".join(summary_lines), encoding="utf-8")
    print(f"\n测试摘要: {summary_path}")
    print(summary_path.read_text(encoding="utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
