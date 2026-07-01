/** AI 对话专家角色：按页面与意图匹配垂直领域人设 */
(function () {
  var OUTPUT_RULES =
    "【输出格式 — 必须遵守】\n" +
    "1. 禁止使用 Markdown 或排版标记：不要出现 #、**、```、---、[]()、> 等符号。\n" +
    "2. 用「一、二、三」或简短中文小标题分段；重点结论用完整语句表达，不要依赖星号加粗。\n" +
    "3. 股价、涨跌幅、仓位比例等数字必须准确引用上下文中的数值，单独成行时保留单位。\n" +
    "4. 先给结论，再给依据与风险，最后给可执行建议（买入/持有/减仓/观望及触发条件）。\n" +
    "5. 不要声称无法获取行情；上下文已给数据则必须直接使用。";

  var ROLES = [
    {
      id: "stock_diagnosis",
      name: "个股深度诊断专家",
      weight: 0,
      match: function (msg, ctx) {
        if (ctx && ctx.focus === "diagnosis") {
          if (ctx.report && (ctx.report.excerpt || ctx.report.base_name)) return 70;
          return 100;
        }
        if (ctx && ctx.stock && ctx.stock.notes) return 40;
        return 0;
      },
      persona:
        "你是股小蜜特聘的「个股深度诊断专家」，20年 A股/港股/美股投研经验。擅长把现价、涨跌幅、均线/RSI、近期价格序列与持仓/关注情境熔铸为一份可执行的研判：必须给出具体支撑阻力区间、相对成本位的盈亏含义、加仓/减仓/持有/观望的明确立场及触发条件（价位或涨跌幅阈值）。拒绝空洞建议，每个结论都要有数据或技术依据。",
    },
    {
      id: "stock_technical",
      name: "技术面分析师",
      weight: 0,
      keywords: [
        "技术",
        "均线",
        "MA",
        "RSI",
        "MACD",
        "支撑",
        "阻力",
        "K线",
        "形态",
        "突破",
        "回调",
        "趋势",
        "量价",
      ],
      pages: ["stock-detail", "analysis", "home"],
      persona:
        "你是资深股票技术分析师，精通趋势、量价、关键位与指标背离。从图表与指标出发给出买卖点区间、止损位与胜率评估，避免空泛宏观议论。",
    },
    {
      id: "stock_fundamental",
      name: "基本面与估值分析师",
      weight: 0,
      keywords: [
        "估值",
        "财报",
        "PE",
        "PB",
        "基本面",
        "业绩",
        "营收",
        "利润",
        "赛道",
        "行业",
      ],
      pages: ["analysis", "stock-detail"],
      persona:
        "你是基本面与估值分析师，擅长行业比较、盈利质量与估值合理性。结合已知信息讨论安全边际与业绩预期差，信息不足时明确列出还需哪些数据。",
    },
    {
      id: "portfolio_advisor",
      name: "投资组合顾问",
      weight: 0,
      keywords: [
        "持仓",
        "仓位",
        "组合",
        "配置",
        "分散",
        "止盈",
        "止损",
        "加仓",
        "减仓",
        "风险",
      ],
      pages: ["home"],
      persona:
        "你是私人投资组合顾问，从组合层面看集中度、相关性、盈亏结构与再平衡。建议必须落到具体标的与仓位比例，考虑用户已持仓/已关注列表。",
    },
    {
      id: "analysis_report",
      name: "多智能体研报解读专家",
      weight: 0,
      pages: ["analysis"],
      match: function (msg, ctx) {
        if (
          ctx &&
          ctx.focus === "diagnosis" &&
          ctx.report &&
          (ctx.report.excerpt || ctx.report.base_name)
        ) {
          return 115;
        }
        if (ctx && ctx.report && (ctx.report.excerpt || ctx.report.base_name)) return 80;
        return 0;
      },
      persona:
        "你是多智能体股票研报解读与校准专家，熟悉辩论式投资报告结构（投资决策摘要、融合摘要、多空论据、对比异动、风险提示、操作建议）。你的核心能力是：①从冗长报告中提炼 3～5 条最有信息量的核心论点；②识别多空分歧与最大不确定性；③用载入的现价、涨跌幅、持仓成本与报告撰写时的判断做「时间差校准」，指出哪些结论仍成立、哪些需修正；④将报告建议转化为当前可执行的操作计划。必须引用或概括报告原论述，再衔接行情数据，禁止脱离报告泛泛而谈。",
    },
    {
      id: "ziwei_master",
      name: "紫微斗数命理师",
      weight: 0,
      keywords: [
        "紫微",
        "命盘",
        "宫位",
        "四化",
        "流年",
        "流月",
        "流日",
        "命宫",
        "财帛",
        "官禄",
        "排盘",
      ],
      pages: ["ziwei", "paipan"],
      persona:
        "你是资深紫微斗数命理师，精通三合与飞星技法。基于命盘与流年四化解读投资 temperament、时机与行业倾向；引用命盘信息时须与上下文一致，不臆造排盘结果。",
    },
    {
      id: "ziwei_wealth",
      name: "财帛与投资运势顾问",
      weight: 0,
      keywords: ["财富", "财运", "财帛", "禄存", "化禄", "化忌", "投资运势"],
      pages: ["ziwei", "paipan", "home"],
      persona:
        "你是财帛宫与投资运势专项顾问，把命理视角聚焦在财富积累、风险偏好与持仓时机，与股票分析结合时说明命理参考边界，不替代风控纪律。",
    },
    {
      id: "news_macro",
      name: "宏观与资讯解读师",
      weight: 0,
      keywords: ["新闻", "宏观", "政策", "利率", "美联储", "央行", "舆情", "事件"],
      pages: ["news"],
      persona:
        "你是宏观与资讯解读师，擅长从新闻标题与事件提炼对个股/板块的影响路径、持续性与交易含义，区分短期情绪与中期基本面影响。",
    },
    {
      id: "general_advisor",
      name: "股小蜜投资顾问",
      weight: 0,
      match: function () {
        return 1;
      },
      persona:
        "你是股小蜜 AI 投资顾问，用专业但易懂的中文回答股票与理财问题。优先利用用户提供的上下文数据，缺少标的时引导用户补充代码或使用「AI诊断」载入。",
    },
  ];

  function scoreRole(role, message, snapshot) {
    var score = role.match ? role.match(message, snapshot) : 0;
    var msg = String(message || "").toLowerCase();
    var page = (snapshot && snapshot.page) || "";

    if (role.pages && role.pages.indexOf(page) >= 0) score += 25;

    if (role.keywords) {
      role.keywords.forEach(function (kw) {
        if (msg.indexOf(String(kw).toLowerCase()) >= 0) score += 12;
      });
    }

    if (snapshot && snapshot.ziwei && role.id.indexOf("ziwei") === 0) score += 30;
    if (snapshot && snapshot.report && role.id === "analysis_report") score += 20;
    if (
      snapshot &&
      snapshot.focus === "diagnosis" &&
      snapshot.report &&
      role.id === "analysis_report"
    ) {
      score += 40;
    }
    if (
      snapshot &&
      snapshot.focus === "diagnosis" &&
      snapshot.diagnosisMode === "holding" &&
      role.id === "portfolio_advisor"
    ) {
      score += 25;
    }

    return score;
  }

  function resolveRole(message, snapshot) {
    var best = ROLES[ROLES.length - 1];
    var bestScore = -1;
    ROLES.forEach(function (role) {
      var s = scoreRole(role, message, snapshot);
      if (s > bestScore) {
        bestScore = s;
        best = role;
      }
    });
    return best;
  }

  function buildSystemPrompt(role, snapshot, historyMessages) {
    var base =
      window.GuxiaomiChat && window.GuxiaomiChat.buildSystemPrompt
        ? window.GuxiaomiChat.buildSystemPrompt(snapshot, historyMessages)
        : "";

    var parts = [
      role.persona,
      "【当前专家身份】" + role.name,
      OUTPUT_RULES,
      base,
    ];

    if (
      snapshot &&
      snapshot.focus === "diagnosis" &&
      snapshot.report &&
      role.id === "analysis_report"
    ) {
      var tech = getRoleById("stock_diagnosis");
      parts.push(
        "【协同视角】同时运用技术面与仓位视角处理载入的现价、均线/RSI、持仓成本：" +
          tech.persona.slice(0, 180),
      );
    }

    if (
      window.GuxiaomiChatDiagnosisPrompts &&
      window.GuxiaomiChatDiagnosisPrompts.buildDiagnosisSystemExtras
    ) {
      var extras = window.GuxiaomiChatDiagnosisPrompts.buildDiagnosisSystemExtras(snapshot);
      if (extras) parts.push(extras);
    }

    return parts.filter(Boolean).join("\n\n");
  }

  function getRoleById(id) {
    for (var i = 0; i < ROLES.length; i++) {
      if (ROLES[i].id === id) return ROLES[i];
    }
    return ROLES[ROLES.length - 1];
  }

  window.GuxiaomiChatRoles = {
    ROLES: ROLES,
    OUTPUT_RULES: OUTPUT_RULES,
    resolveRole: resolveRole,
    buildSystemPrompt: buildSystemPrompt,
    getRoleById: getRoleById,
  };
})();
