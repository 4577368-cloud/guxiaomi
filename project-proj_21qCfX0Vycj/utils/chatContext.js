/** 全站 AI 对话：页面上下文注册与 system prompt 构建 */
(function () {
  var listeners = [];
  var currentContext = {
    page: "global",
    scopeKey: "global",
    title: "股小蜜",
    stock: null,
    report: null,
    portfolio: null,
    ziwei: null,
    news: null,
    extras: null,
  };

  function truncate(text, max) {
    var s = text == null ? "" : String(text);
    if (!max || s.length <= max) return s;
    return s.slice(0, max) + "…";
  }

  function notify() {
    var snap = getSnapshot();
    listeners.forEach(function (fn) {
      try {
        fn(snap);
      } catch (e) {
        console.warn("GuxiaomiChat listener error", e);
      }
    });
  }

  function inferScopeKey(ctx) {
    if (ctx.scopeKey) return String(ctx.scopeKey);
    if (ctx.stock && ctx.stock.code) {
      return (
        String(ctx.stock.code).toUpperCase() +
        "|" +
        String(ctx.stock.market || "").trim()
      );
    }
    if (ctx.page) return String(ctx.page) + "|global";
    return "global";
  }

  function getSnapshot() {
    return Object.assign({}, currentContext, {
      scopeKey: inferScopeKey(currentContext),
    });
  }

  function setContext(partial) {
    if (!partial || typeof partial !== "object") return;
    currentContext = Object.assign({}, currentContext, partial);
    currentContext.scopeKey = inferScopeKey(currentContext);
    notify();
  }

  function subscribe(fn) {
    if (typeof fn !== "function") return function () {};
    listeners.push(fn);
    try {
      fn(getSnapshot());
    } catch (_) {}
    return function () {
      listeners = listeners.filter(function (x) {
        return x !== fn;
      });
    };
  }

  function getBucketKey(snapshot) {
    var ctx = snapshot || getSnapshot();
    return String(ctx.page || "global") + "::" + String(ctx.scopeKey || "global");
  }

  function buildPortfolioBlock(portfolio) {
    if (!portfolio) return "";
    var lines = [];
    if (portfolio.summary) {
      lines.push("组合摘要：" + truncate(portfolio.summary, 1500));
    }
    var holdings = Array.isArray(portfolio.holdings) ? portfolio.holdings : [];
    if (holdings.length) {
      lines.push("持仓列表（代码 · 市场 · 现价 · 盈亏%）：");
      holdings.slice(0, 30).forEach(function (h) {
        if (!h) return;
        lines.push(
          "- " +
            [h.symbol, h.market, h.price, h.pnlPercent]
              .filter(function (x) {
                return x != null && x !== "";
              })
              .join(" · "),
        );
      });
    }
    var watchlist = Array.isArray(portfolio.watchlist) ? portfolio.watchlist : [];
    if (watchlist.length) {
      lines.push(
        "关注列表：" +
          watchlist
            .slice(0, 20)
            .map(function (w) {
              return (w && w.symbol) || "";
            })
            .filter(Boolean)
            .join("、"),
      );
    }
  return lines.join("\n");
  }

  function buildZiweiBlock(ziwei) {
    if (!ziwei) return "";
    var lines = [];
    if (ziwei.inputText) {
      lines.push("## 命盘信息\n" + truncate(ziwei.inputText, 2500));
    }
    var reports = ziwei.reports || {};
    var map = [
      ["basic", "命盘全析"],
      ["wealth", "财富密码"],
      ["portfolio", "持仓排盘"],
      ["stock", "技术分析"],
      ["flow", "流月流日"],
    ];
    map.forEach(function (pair) {
      var item = reports[pair[0]];
      if (item && item.content) {
        lines.push("## " + pair[1] + "\n" + truncate(item.content, 2000));
      }
    });
    return lines.join("\n\n");
  }

  function openChat(options) {
    options = options || {};
    if (options.context && typeof options.context === "object") {
      setContext(options.context);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("guxiaomi-chat-open", { detail: options }),
      );
    }
  }

  function buildSystemPrompt(snapshot, historyMessages) {
    var ctx = snapshot || getSnapshot();
    var page = ctx.page || "global";
    var parts = [];
    var isDiagnosis = ctx.focus === "diagnosis";

    parts.push(
      isDiagnosis
        ? "【任务】用户已发起针对特定标的的深度 AI 诊断。你必须严格基于下方载入的行情、持仓/关注、技术指标与（若有）分析报告作答；按诊断框架逐段展开，禁止空泛套话。有报告时须先提炼精华再与现价校准。回复末尾给出 2～3 个可继续深挖的追问方向（完整句子，不用列表符号）。"
        : "【任务】结合下方上下文与用户问题作答；缺少标的数据时提示补充代码或使用「AI诊断」载入。",
    );

    if (isDiagnosis && ctx.source) {
      parts.push("【诊断来源】" + ctx.source);
    }
    if (isDiagnosis && ctx.diagnosisMode) {
      parts.push("【诊断场景】" + ctx.diagnosisMode);
    }

    if (ctx.title) {
      parts.push("【对话主题】" + ctx.title);
    }

    if (ctx.stock && (ctx.stock.notes || ctx.stock.price != null)) {
      parts.push(
        "【重要】以下行情、持仓与技术指标来自用户股小蜜应用内已刷新的本地缓存（与用户当前页面所见同源）。请直接用于分析，不要说无法获取实时行情、无法访问互联网或猜测公司名称；仅根据代码与所给数据作答。",
      );
    }

    if (ctx.stock) {
      var s = ctx.stock;
      var stockLines = ["【股票信息】"];
      if (s.code) stockLines.push("代码：" + s.code);
      if (s.market) stockLines.push("市场：" + s.market);
      if (s.name && s.name !== s.code) stockLines.push("名称：" + s.name);
      if (s.price != null && Number(s.price) > 0) stockLines.push("现价：" + s.price);
      if (s.changePercent != null && !Number.isNaN(Number(s.changePercent))) {
        stockLines.push("涨跌幅：" + Number(s.changePercent).toFixed(2) + "%");
      }
      if (s.notes) {
        stockLines.push(
          "详细数据：\n" + truncate(s.notes, isDiagnosis ? 5200 : 4500),
        );
      }
      parts.push(stockLines.join("\n"));
    }

    if (ctx.report && (ctx.report.excerpt || ctx.report.base_name)) {
      var reportIntro =
        "以下为从多智能体报告中结构化提炼的章节（含摘要、多空论据、风险与建议等）。请深入引用其论点，并与载入现价/涨跌幅/持仓做校准对照，勿复述全文。";
      parts.push(
        "【分析报告摘录】\n" +
          reportIntro +
          "\n" +
          (ctx.report.base_name ? "报告：" + ctx.report.base_name + "\n" : "") +
          truncate(ctx.report.excerpt || "", 7200),
      );
    }

    if (ctx.portfolio) {
      var pf = buildPortfolioBlock(ctx.portfolio);
      if (pf) parts.push("【投资组合】\n" + pf);
    }

    if (ctx.ziwei) {
      var zw = buildZiweiBlock(ctx.ziwei);
      if (zw) parts.push("【紫微排盘上下文】\n" + zw);
    }

    if (ctx.news) {
      var newsLines = ["【新闻页上下文】"];
      if (ctx.news.query) newsLines.push("检索：" + ctx.news.query);
      if (ctx.news.stockCode) newsLines.push("股票：" + ctx.news.stockCode);
      if (Array.isArray(ctx.news.headlines) && ctx.news.headlines.length) {
        newsLines.push("近期标题：");
        ctx.news.headlines.slice(0, 8).forEach(function (h) {
          newsLines.push("- " + truncate(h, 120));
        });
      }
      parts.push(newsLines.join("\n"));
    }

    if (ctx.extras) {
      parts.push("【补充信息】\n" + truncate(ctx.extras, 2000));
    }

    if (Array.isArray(historyMessages) && historyMessages.length) {
      parts.push("【对话历史摘要】仅作衔接，勿重复上一轮全文：");
      historyMessages.slice(-6).forEach(function (m) {
        if (!m || !m.content) return;
        parts.push(
          (m.role === "user" ? "用户" : "助手") + "：" + truncate(m.content, 600),
        );
      });
    }

    var system = parts.join("\n\n");
    var limit =
      isDiagnosis && ctx.report && ctx.report.excerpt ? 16500 : 12000;
    return truncate(system, limit);
  }

  function detectPageFromPath() {
    if (typeof location === "undefined") return "global";
    var path = (location.pathname || "").split("/").pop() || "";
    if (path === "index.html" || path === "" ) return "home";
    if (path.indexOf("analysis") >= 0) return "analysis";
    if (path.indexOf("ziwei") >= 0) return "ziwei";
    if (path.indexOf("stock-detail") >= 0) return "stock-detail";
    if (path.indexOf("news") >= 0) return "news";
    if (path.indexOf("paipan") >= 0) return "paipan";
    return "global";
  }

  currentContext.page = detectPageFromPath();

  window.GuxiaomiChat = {
    setContext: setContext,
    getSnapshot: getSnapshot,
    subscribe: subscribe,
    getBucketKey: getBucketKey,
    buildSystemPrompt: buildSystemPrompt,
    detectPageFromPath: detectPageFromPath,
    openChat: openChat,
  };
})();
