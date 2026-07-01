/** AI 诊断：分场景提示词、报告提炼与首轮问题模板 */
(function () {
  var REPORT_FIELDS = [
    ["投资决策摘要", "一、投资决策摘要"],
    ["融合摘要", "二、融合摘要与核心逻辑"],
    ["分析主题", "分析主题"],
    ["对比与异动", "三、对比上次与异动信号"],
    ["看涨论据", "四、看涨论据"],
    ["看跌论据", "五、看跌论据"],
    ["风险提示", "六、风险提示"],
    ["操作建议", "七、操作建议"],
    ["summary", "摘要"],
  ];

  var DIAGNOSIS_DEPTH_RULES =
    "【诊断深度要求 — 必须遵守】\n" +
    "1. 禁止空泛套话（如「建议关注」「需谨慎」而无依据）；每个结论必须挂钩上下文中的数字、报告原句或技术位。\n" +
    "2. 首轮回复须覆盖规定维度（见下方框架），每段有实质内容，单段不少于 2 句有信息量的分析。\n" +
    "3. 有分析报告时：必须先提炼报告精华（结论/多空分歧/风险），再与现价、涨跌幅、持仓成本做「校准对照」，指出报告撰写后行情变化是否强化或削弱原判断。\n" +
    "4. 无报告时：从趋势、关键价位、量价、指标、持仓/关注情境五线展开，给出具体价位区间或百分比阈值。\n" +
    "5. 结尾列出 2～3 个可继续深挖的方向（供用户追问），但不要以 Markdown 列表符号输出。\n" +
    "6. 全程简体中文；禁止 Markdown 标记。";

  function truncate(text, max) {
    var s = text == null ? "" : String(text);
    if (!max || s.length <= max) return s;
    return s.slice(0, max) + "…";
  }

  function extractMarkdownSections(md) {
    if (!md) return [];
    var text = String(md);
    var sections = [];
    var re = /^#{1,3}\s+(.+)$/gm;
    var matches = [];
    var m;
    while ((m = re.exec(text)) !== null) {
      matches.push({ title: m[1].trim(), index: m.index, len: m[0].length });
    }
    for (var i = 0; i < matches.length; i++) {
      var start = matches[i].index + matches[i].len;
      var end = i + 1 < matches.length ? matches[i + 1].index : text.length;
      var body = text.slice(start, end).trim();
      if (body) {
        sections.push({
          title: matches[i].title,
          body: truncate(body, 1200),
        });
      }
    }
    return sections;
  }

  function buildReportExcerpt(report) {
    if (!report) return { excerpt: "", baseName: "", sectionCount: 0 };

    var parts = [];
    var baseName = report.base_name || report.title || "";
    var body = report.body && typeof report.body === "object" ? report.body : report;

    if (body && typeof body === "object") {
      REPORT_FIELDS.forEach(function (pair) {
        var key = pair[0];
        var label = pair[1];
        var val = body[key];
        if (val != null && String(val).trim()) {
          parts.push(label + "：\n" + truncate(String(val), 1500));
        }
      });
    }

    var md =
      (report.markdown && String(report.markdown)) ||
      (body && body.markdown && String(body.markdown)) ||
      "";
    if (md && parts.length < 4) {
      extractMarkdownSections(md)
        .slice(0, 8)
        .forEach(function (sec) {
          parts.push(sec.title + "：\n" + sec.body);
        });
    }
    if (!parts.length && md) {
      parts.push(truncate(md, 6000));
    }
    if (!parts.length && report.excerpt) {
      parts.push(truncate(report.excerpt, 6000));
    }

    return {
      excerpt: truncate(parts.join("\n\n"), 7500),
      baseName: baseName,
      sectionCount: parts.length,
    };
  }

  function inferDiagnosisMode(payload, ctx) {
    if (payload && payload.diagnosisMode) return payload.diagnosisMode;
    if (ctx && ctx.diagnosisMode) return ctx.diagnosisMode;
    if (ctx && ctx.report && (ctx.report.excerpt || ctx.report.base_name)) {
      return "report";
    }
    var src = (payload && payload.source) || (ctx && ctx.source) || "";
    if (src === "holding" || src === "holding-watch") return "holding";
    if (src === "watchlist") return "watchlist";
    if (src === "analysis-report" || src === "analysis") return "report";
    if (src === "stock-detail") return "detail";
    return "general";
  }

  function frameworkForMode(mode, snapshot) {
    var code =
      (snapshot && snapshot.stock && snapshot.stock.code) || "该标的";
    var hasReport =
      snapshot && snapshot.report && snapshot.report.excerpt;

    if (mode === "report" || hasReport) {
      var rname =
        (snapshot && snapshot.report && snapshot.report.base_name) || "已载入报告";
      return (
        "【本轮诊断框架 — 历史/多智能体报告场景】\n" +
        "报告名称：" +
        rname +
        "\n" +
        "请严格按以下顺序展开（用小标题分段，勿用 # 号）：\n" +
        "甲、报告精华提炼：核心投资结论 1 句；看涨方 2～3 条要点；看跌/风险方 2～3 条要点（须引用报告论述，可概括原话）。\n" +
        "乙、报告与现价校准：用载入的现价、涨跌幅、近几日走势对照报告中的关键判断，说明哪些仍成立、哪些需修正、时间差带来的偏差。\n" +
        "丙、持仓/关注情境（若有载入）：成本、盈亏、仓位对执行报告建议的含义。\n" +
        "丁、可执行策略：给出明确动作（加仓/减仓/持有/观望）及触发条件（价位或涨跌幅阈值）。\n" +
        "戊、后续互动：点出 2 个值得继续深挖的报告章节或数据缺口。"
      );
    }

    if (mode === "holding") {
      return (
        "【本轮诊断框架 — 持仓场景】\n" +
        "标的：" +
        code +
        "\n" +
        "请按顺序展开：\n" +
        "一、核心结论：一句话方向 + 信心程度。\n" +
        "二、趋势与技术：均线/RSI/近 5～10 日走势、支撑与阻力区间（用具体价格）。\n" +
        "三、持仓绩效：相对成本盈亏、仓位占比是否合理、加仓/减仓边界。\n" +
        "四、风险清单：2～3 条可量化的风险触发。\n" +
        "五、操作建议：具体动作与条件。\n" +
        "六、可继续追问：2 个方向。"
      );
    }

    if (mode === "watchlist") {
      return (
        "【本轮诊断框架 — 关注列表场景】\n" +
        "标的：" +
        code +
        "\n" +
        "请按顺序展开：\n" +
        "一、关注以来表现评价：相对关注时价盈亏、趋势是否符合预期。\n" +
        "二、技术结构：关键位、指标、量价是否支持介入。\n" +
        "三、建仓时机：若未持仓，什么价位/形态可考虑首仓；若已持仓见持仓框架。\n" +
        "四、风险与失效条件。\n" +
        "五、可继续追问方向。"
      );
    }

    if (mode === "detail") {
      return (
        "【本轮诊断框架 — 详情页场景】\n" +
        "标的：" +
        code +
        "\n" +
        "结合行情快照、历史价格、持仓/关注标签，覆盖：核心结论、技术结构、基本面/催化剂（若有报告则引用）、仓位建议、风险、后续追问点。"
      );
    }

    return (
      "【本轮诊断框架 — 通用】\n" +
      "标的：" +
      code +
      "\n" +
      "覆盖：核心结论、技术与价位、风险、可执行建议、后续可追问方向；所有数字引用载入数据。"
    );
  }

  function initialMessageForMode(mode, snapshot) {
    var code =
      (snapshot && snapshot.stock && snapshot.stock.code) || "";
    var mk = (snapshot && snapshot.stock && snapshot.stock.market) || "";
    var label = code ? code + (mk ? "（" + mk + "）" : "") : "该标的";
    var rname =
      snapshot && snapshot.report && snapshot.report.base_name
        ? "《" + snapshot.report.base_name + "》"
        : "分析报告";

    if (mode === "report") {
      return (
        "请基于已载入的" +
        label +
        "历史" +
        rname +
        "及当前行情，做一次深度诊断。先提炼报告精华并与现价校准，再给可执行策略；各维度按系统框架展开，避免泛泛而谈。"
      );
    }
    if (mode === "holding") {
      return (
        "请对持仓 " +
        label +
        "做深度诊断：结合载入的现价、盈亏、仓位与技术指标，按框架逐段分析，给出具体价位与操作建议。"
      );
    }
    if (mode === "watchlist") {
      return (
        "请对关注标的 " +
        label +
        "做深度诊断：评价关注以来表现、技术结构与是否适合建仓，给出明确条件与风险。"
      );
    }
    if (mode === "detail") {
      return (
        "请对 " +
        label +
        "做全面诊断：综合行情、价格走势与持仓/关注情境，按框架输出有深度的分析与操作建议。"
      );
    }
    return (
      "请对 " +
      label +
      "做深度诊断，严格基于已载入数据，按系统框架逐段展开，给出可执行建议。"
    );
  }

  function buildDiagnosisSystemExtras(snapshot) {
    if (!snapshot || snapshot.focus !== "diagnosis") return "";
    var mode = inferDiagnosisMode(null, snapshot);
    return [DIAGNOSIS_DEPTH_RULES, frameworkForMode(mode, snapshot)]
      .filter(Boolean)
      .join("\n\n");
  }

  window.GuxiaomiChatDiagnosisPrompts = {
    DIAGNOSIS_DEPTH_RULES: DIAGNOSIS_DEPTH_RULES,
    buildReportExcerpt: buildReportExcerpt,
    inferDiagnosisMode: inferDiagnosisMode,
    frameworkForMode: frameworkForMode,
    initialMessageForMode: initialMessageForMode,
    buildDiagnosisSystemExtras: buildDiagnosisSystemExtras,
  };
})();
