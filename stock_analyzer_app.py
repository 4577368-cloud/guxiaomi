#!/usr/bin/env python3
"""
股票分析可视化应用
基于 demo_ulti_analyst.py 创建的 Streamlit 应用
"""

import streamlit as st
import os
import sys
from pathlib import Path

# 应用根目录（便于从任意位置启动）
_APP_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_APP_DIR))

# 导入分析器模块
try:
    from demo_ulti_analyst import (
        MultiAgentStockAnalyst, ReportExporter, StockDataService, LLMClient,
        StockData, AnalystReport, DebateRound, FinalReport,
        ANALYST_PROMPTS, DEBATE_PROMPTS, CONFIG,
        report_base_name, get_recent_report_summaries,
    )
    HAS_MODULES = True
except ImportError as e:
    st.error(f"无法导入分析器模块: {e}")
    HAS_MODULES = False

# 页面配置
st.set_page_config(
    page_title="多智能体股票分析师",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded"
)

# 应用标题
st.title("📈 多智能体股票分析师")
st.markdown("---")

# 从模拟持仓「分析该股」跳转时，在 radio 创建前设置 main_mode（否则 Streamlit 不允许在 widget 创建后改其 key）
if st.session_state.pop("switch_to_analysis", None):
    st.session_state["main_mode"] = "📈 股票分析"

# 功能切换：股票分析 | 模拟持仓（整合自 project 模拟购买+盈亏）
main_mode = st.radio("", ["📈 股票分析", "📋 模拟持仓"], horizontal=True, key="main_mode")

# 侧边栏（股票分析时预填可从模拟持仓「分析该股」带入）
with st.sidebar:
    st.header("⚙️ 分析设置")
    
    # 股票输入（支持从模拟持仓「分析该股」预填）
    _prefill_code = st.session_state.get("prefill_stock_code")
    _prefill_market = st.session_state.get("prefill_market")
    if _prefill_code:
        st.session_state["sidebar_stock_code"] = _prefill_code
        if _prefill_market:
            st.session_state["sidebar_market"] = _prefill_market
        del st.session_state["prefill_stock_code"]
        if "prefill_market" in st.session_state:
            del st.session_state["prefill_market"]
    stock_code = st.text_input(
        "股票代码",
        value=st.session_state.get("sidebar_stock_code", "600519.SH"),
        key="sidebar_stock_code",
        help="例如: 600519.SH (贵州茅台), AAPL (苹果), 00700.HK (腾讯)"
    )
    stock_name = st.text_input(
        "股票名称 (可选)",
        value=st.session_state.get("sidebar_stock_name", ""),
        key="sidebar_stock_name",
        help="如果留空，将使用股票代码作为名称"
    )
    _market_options = ["A 股", "港股", "美股"]
    market = st.selectbox(
        "市场类型",
        options=_market_options,
        index=_market_options.index(st.session_state.get("sidebar_market", "A 股")) if st.session_state.get("sidebar_market") in _market_options else 0,
        key="sidebar_market"
    )
    
    # 历史天数
    days = st.slider(
        "历史数据天数",
        min_value=30,
        max_value=365,
        value=90,
        step=30
    )
    
    # 分析师选择
    st.subheader("👥 选择分析师")
    available_analysts = list(ANALYST_PROMPTS.keys()) if HAS_MODULES else ["市场专家", "成长投资者", "风险分析师", "技术专家"]
    selected_analysts = st.multiselect(
        "选择分析师角色",
        options=available_analysts,
        default=available_analysts[:4] if len(available_analysts) >= 4 else available_analysts
    )
    
    # 辩论轮次
    debate_rounds = st.slider(
        "辩论轮次",
        min_value=1,
        max_value=5,
        value=1,
        step=1
    )
    
    # 模拟数据选项
    use_mock = st.checkbox(
        "使用模拟数据 (测试用)",
        value=False,
        help="如果没有配置有效的 API 密钥，请勾选此选项"
    )
    
    # 分析按钮
    analyze_button = st.button(
        "🚀 开始分析",
        type="primary",
        use_container_width=True
    )

# 主内容区域
if HAS_MODULES:
    output_dir = _APP_DIR / "reports"
    output_dir.mkdir(exist_ok=True)

    # ---------- 模拟持仓（整合自 project 的模拟购买+盈亏，复用 StockDataService 取当前价）----------
    if main_mode == "📋 模拟持仓":
        st.subheader("📋 模拟持仓")
        st.session_state.setdefault("sim_positions", [])
        with st.form("添加持仓"):
            c1, c2, c3, c4 = st.columns(4)
            with c1:
                add_code = st.text_input("股票代码", placeholder="如 AAPL, 3690.HK", key="add_code")
            with c2:
                add_market = st.selectbox("市场", ["A 股", "港股", "美股"], key="add_market")
            with c3:
                add_shares = st.number_input("持仓数量", min_value=1, value=100, key="add_shares")
            with c4:
                add_price = st.number_input("买入均价", min_value=0.0, value=0.0, step=0.01, key="add_price")
            if st.form_submit_button("添加"):
                if add_code and add_price > 0:
                    st.session_state["sim_positions"].append({"code": add_code.strip(), "market": add_market, "shares": int(add_shares), "buy_price": add_price})
                    st.rerun()

        positions = st.session_state.get("sim_positions", [])
        if not positions:
            st.info("请在上方添加持仓（代码、市场、数量、买入价），将根据当前价估算浮动盈亏；可点击「分析该股」或「查看新闻」。")
        else:
            svc = StockDataService()
            rows = []
            for i, pos in enumerate(positions):
                try:
                    info = svc.get_stock_info(pos["code"], pos["market"], 1)
                    cur = info.最新价
                except Exception:
                    cur = pos["buy_price"]
                cost = pos["buy_price"] * pos["shares"]
                value = cur * pos["shares"]
                profit = value - cost
                pct = (profit / cost * 100) if cost else 0
                rows.append({
                    "code": pos["code"],
                    "market": pos["market"],
                    "shares": pos["shares"],
                    "buy_price": pos["buy_price"],
                    "current": cur,
                    "cost": cost,
                    "value": value,
                    "profit": profit,
                    "pct": pct,
                    "index": i,
                })
            for r in rows:
                col1, col2, col3, col4, col5, col6, col7 = st.columns([1, 0.8, 0.8, 0.8, 1, 1, 1.2])
                with col1:
                    st.write(f"**{r['code']}**")
                with col2:
                    st.write(r["market"])
                with col3:
                    st.write(f"{r['shares']} 股")
                with col4:
                    st.write(f"买入 {r['buy_price']:.2f}")
                with col5:
                    st.write(f"现价 {r['current']:.2f}")
                with col6:
                    st.write(f"盈亏 {r['profit']:+.2f} ({r['pct']:+.1f}%)")
                with col7:
                    if st.button("分析该股", key=f"ana_{r['index']}"):
                        st.session_state["prefill_stock_code"] = r["code"]
                        st.session_state["prefill_market"] = r["market"]
                        st.session_state["switch_to_analysis"] = True
                        st.rerun()
                    if st.button("新闻", key=f"news_{r['index']}"):
                        st.session_state["news_for_code"] = r["code"]
                        st.session_state["news_for_market"] = r["market"]
                        st.rerun()
            if st.session_state.get("news_for_code"):
                with st.expander(f"📰 相关新闻：{st.session_state['news_for_code']}", expanded=True):
                    try:
                        from news_feeds import get_news_for_report
                        news_text = get_news_for_report("", st.session_state["news_for_code"], st.session_state.get("news_for_market", "A 股"), 15)
                        st.markdown(news_text or "暂无相关新闻")
                    except Exception as e:
                        st.caption(str(e))
                if st.button("关闭新闻", key="close_news"):
                    del st.session_state["news_for_code"]
                    if "news_for_market" in st.session_state:
                        del st.session_state["news_for_market"]
                    st.rerun()
            to_remove = st.selectbox("删除持仓", options=["（选择要删除的持仓）"] + [f"{p['code']} ({p['market']})" for p in positions], key="del_pos")
            if st.button("删除所选", key="do_del") and to_remove and to_remove != "（选择要删除的持仓）":
                idx = [f"{p['code']} ({p['market']})" for p in positions].index(to_remove)
                st.session_state["sim_positions"].pop(idx)
                st.rerun()
        st.stop()

    # ---------- 股票分析 ----------
    if analyze_button and stock_code:
        with st.spinner("正在进行多智能体深度分析..."):
            try:
                # 初始化分析器
                use_real_llm = not use_mock  # 简化处理，实际应检查 API 配置
                analyst = MultiAgentStockAnalyst(
                    use_real_llm=use_real_llm,
                    debate_rounds=debate_rounds
                )
                
                # 执行分析（传入 reports_dir 以便结合最近 3 份历史报告生成「对比与异动」）
                report = analyst.analyze(
                    stock_code=stock_code,
                    stock_name=stock_name if stock_name else None,
                    market=market,
                    days=days,
                    selected_analysts=selected_analysts if selected_analysts else None,
                    reports_dir=output_dir,
                )
                
                # 导出报告：命名 市场_股票代码_时间
                base_name = report_base_name(market, stock_code, with_time=True)
                md_path = output_dir / f"{base_name}.md"
                html_path = output_dir / f"{base_name}.html"
                
                ReportExporter.to_markdown(report, str(md_path))
                ReportExporter.to_html(report, str(html_path))
                
                # 显示结果
                st.success("✅ 分析完成！")
                
                # 显示报告摘要
                st.subheader("📊 分析报告摘要")
                st.info(report.融合摘要)
                
                # 显示最终建议
                st.subheader("🎯 投资建议")
                if "积极" in report.最终建议:
                    st.success(report.最终建议)
                elif "谨慎" in report.最终建议:
                    st.warning(report.最终建议)
                else:
                    st.info(report.最终建议)
                
                # 显示详细报告选项卡
                tab1, tab2, tab3, tab4 = st.tabs(["📋 完整报告", "👥 分析师观点", "💬 多空辩论", "📈 数据快照"])
                
                with tab1:
                    # 显示 markdown 报告
                    with open(md_path, "r", encoding="utf-8") as f:
                        markdown_content = f.read()
                    st.markdown(markdown_content)
                
                with tab2:
                    st.subheader("分析师观点详情")
                    for i, analyst_report in enumerate(report.分析师报告):
                        with st.expander(f"{analyst_report.分析师姓名} ({analyst_report.角色定位})"):
                            st.write(f"**投资建议**: {analyst_report.投资建议}")
                            st.write(f"**置信程度**: {analyst_report.置信程度*100:.0f}%")
                            st.write(f"**角色权重**: {analyst_report.角色权重}")
                            st.write("**核心分析**:")
                            st.write(analyst_report.核心分析)
                            if analyst_report.核心要点:
                                st.write("**核心要点**:")
                                for point in analyst_report.核心要点:
                                    st.write(f"- {point}")
                
                with tab3:
                    st.subheader("多空辩论记录")
                    for debate_round in report.辩论轮次:
                        with st.expander(f"第 {debate_round.轮次编号} 轮辩论"):
                            st.write("**🟢 多头观点**:")
                            st.write(debate_round.多头观点)
                            st.write("**🔴 空头观点**:")
                            st.write(debate_round.空头观点)
                            st.write("**⚖️ 裁判结论**:")
                            st.write(debate_round.裁判结论)
                            if debate_round.共识点:
                                st.write("**共识点**:")
                                for point in debate_round.共识点:
                                    st.write(f"- {point}")
                            if debate_round.分歧点:
                                st.write("**分歧点**:")
                                for point in debate_round.分歧点:
                                    st.write(f"- {point}")
                
                with tab4:
                    st.subheader("数据快照")
                    col1, col2, col3, col4 = st.columns(4)
                    data_parts = report.数据基准.split('｜')
                    with col1:
                        st.metric("最新价格", data_parts[0] if len(data_parts) > 0 else "N/A")
                    with col2:
                        st.metric("今日涨跌", data_parts[1] if len(data_parts) > 1 else "N/A")
                    with col3:
                        st.metric("市盈率", data_parts[2] if len(data_parts) > 2 else "N/A")
                    with col4:
                        st.metric("共识程度", f"{report.共识程度*100:.0f}%")
                    
                    st.write(f"**加权得分**: {report.加权得分:+.2f}")
                    st.write("**风险提示**:")
                    for risk in report.风险提示:
                        st.write(f"- {risk}")
                    
                    if report.操作建议:
                        st.write("**操作建议**:")
                        for key, value in report.操作建议.items():
                            st.write(f"- {key}: {value}")
                
                # 提供下载链接
                st.subheader("💾 报告下载")
                col1, col2 = st.columns(2)
                with col1:
                    with open(md_path, "r", encoding="utf-8") as f:
                        st.download_button(
                            label="下载 Markdown 报告",
                            data=f.read(),
                            file_name=md_path.name,
                            mime="text/markdown"
                        )
                with col2:
                    with open(html_path, "r", encoding="utf-8") as f:
                        st.download_button(
                            label="下载 HTML 报告",
                            data=f.read(),
                            file_name=html_path.name,
                            mime="text/html"
                        )
                        
            except Exception as e:
                st.error(f"分析过程中发生错误: {e}")
                st.exception(e)
    elif analyze_button and not stock_code:
        st.warning("请输入股票代码")
else:
    st.error("无法加载分析器模块，请检查 demo_ulti_analyst.py 是否存在且无语法错误")

# 底部信息
st.markdown("---")
st.markdown(
    """
    <div style='text-align: center; color: #666;'>
        <p>多智能体股票分析师 v1.0 | 基于 AI 多角色辩论框架</p>
        <p>免责声明：本报告仅供参考，不构成投资建议。投资有风险，决策需谨慎。</p>
    </div>
    """,
    unsafe_allow_html=True
)