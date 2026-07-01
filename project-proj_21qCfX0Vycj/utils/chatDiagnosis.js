/** 针对性 AI 诊断：组装上下文并打开对话 */
(function () {
  function truncate(text, max) {
    var s = text == null ? "" : String(text);
    if (!max || s.length <= max) return s;
    return s.slice(0, max) + "…";
  }

  function marketLabel(market) {
    if (!market) return "";
    var m = String(market).toUpperCase();
    if (m === "US") return "美股";
    if (m === "HK") return "港股";
    if (m === "CN") return "A股";
    var s = String(market).trim();
    if (s === "A 股") return "A股";
    return s;
  }

  function priceDigits(market) {
    var m = marketLabel(market);
    return m === "美股" ? 3 : 2;
  }

  function fmtNum(v, market) {
    var n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return n.toFixed(priceDigits(market));
  }

  function formatQuoteBlock(md, market) {
    if (!md || typeof md !== "object") return "";
    var lines = [];
    if (Number(md.price) > 0) lines.push("现价 " + fmtNum(md.price, market));
    if (md.changePercent != null && !Number.isNaN(Number(md.changePercent))) {
      lines.push("涨跌幅 " + Number(md.changePercent).toFixed(2) + "%");
    }
    if (md.change != null && !Number.isNaN(Number(md.change))) {
      var sign = Number(md.change) >= 0 ? "+" : "";
      lines.push("涨跌额 " + sign + fmtNum(md.change, market));
    }
    if (Number(md.open) > 0) lines.push("今开 " + fmtNum(md.open, market));
    if (Number(md.high) > 0) lines.push("最高 " + fmtNum(md.high, market));
    if (Number(md.low) > 0) lines.push("最低 " + fmtNum(md.low, market));
    if (Number(md.previousClose) > 0) lines.push("昨收 " + fmtNum(md.previousClose, market));
    if (md.volume != null && Number(md.volume) > 0) {
      lines.push(
        "成交量 " +
          (typeof formatVolume === "function"
            ? formatVolume(md.volume)
            : String(md.volume)),
      );
    }
    return lines.length ? "【实时行情】\n" + lines.join("\n") : "";
  }

  function formatPriceHistory(rows, market) {
    var list = Array.isArray(rows) ? rows : [];
    if (!list.length) return "";
    var lines = ["【近期价格】"];
    list
      .slice(-10)
      .forEach(function (row) {
        if (!row) return;
        lines.push(
          String(row.date || "—") +
            " 收 " +
            fmtNum(row.close != null ? row.close : row.price, market),
        );
      });
    return lines.join("\n");
  }

  function reportExcerpt(report) {
    if (
      window.GuxiaomiChatDiagnosisPrompts &&
      window.GuxiaomiChatDiagnosisPrompts.buildReportExcerpt
    ) {
      return window.GuxiaomiChatDiagnosisPrompts.buildReportExcerpt(report).excerpt;
    }
    if (!report) return "";
    if (report.markdown) return truncate(report.markdown, 7500);
    if (report.excerpt) return truncate(report.excerpt, 7500);
    var body = report.body || report;
    if (typeof body === "string") return truncate(body, 7500);
    var parts = [];
    [
      "投资决策摘要",
      "融合摘要",
      "分析主题",
      "对比与异动",
      "看涨论据",
      "看跌论据",
      "风险提示",
      "操作建议",
      "摘要",
      "summary",
    ].forEach(function (k) {
      if (body[k]) parts.push(String(body[k]));
    });
    return truncate(parts.join("\n\n"), 7500);
  }

  function buildDiagnosisContext(payload) {
    payload = payload || {};
    var code = String(payload.code || payload.symbol || "")
      .trim()
      .toUpperCase();
    var mk = marketLabel(payload.market);
    var source = payload.source || "diagnosis";
    var title = [code, mk, "AI诊断"].filter(Boolean).join(" · ");

    var noteParts = [];
    if (payload.sourceLabel) noteParts.push("【来源】" + payload.sourceLabel);
    if (payload.notes) noteParts.push(payload.notes);
    if (payload.quoteBlock) noteParts.push(payload.quoteBlock);
    if (payload.holdingBlock) noteParts.push(payload.holdingBlock);
    if (payload.watchBlock) noteParts.push(payload.watchBlock);
    if (payload.priceHistoryBlock) noteParts.push(payload.priceHistoryBlock);
    if (payload.extras) noteParts.push(payload.extras);

    var report = null;
    if (payload.report) {
      var built =
        window.GuxiaomiChatDiagnosisPrompts &&
        window.GuxiaomiChatDiagnosisPrompts.buildReportExcerpt
          ? window.GuxiaomiChatDiagnosisPrompts.buildReportExcerpt(payload.report)
          : null;
      var excerpt = built ? built.excerpt : reportExcerpt(payload.report);
      report = {
        base_name:
          (built && built.baseName) ||
          payload.report.base_name ||
          payload.report.title ||
          payload.reportBaseName ||
          "",
        excerpt: excerpt,
        sectionCount: built ? built.sectionCount : 0,
      };
    }

    var ctx = {
      page:
        payload.page ||
        (window.GuxiaomiChat && window.GuxiaomiChat.detectPageFromPath()) ||
        "global",
      scopeKey: code + "|" + mk + "|diagnosis|" + (payload.scopeSuffix || source),
      title: title,
      focus: "diagnosis",
      source: source,
      diagnosisMode:
        payload.diagnosisMode ||
        (window.GuxiaomiChatDiagnosisPrompts &&
        window.GuxiaomiChatDiagnosisPrompts.inferDiagnosisMode
          ? window.GuxiaomiChatDiagnosisPrompts.inferDiagnosisMode(payload, {
              source: source,
              report: report,
            })
          : "general"),
      stock: {
        code: code,
        market: mk,
        name: payload.name || "",
        price: payload.price,
        changePercent: payload.changePercent,
        notes: noteParts.filter(Boolean).join("\n\n"),
      },
      report: report,
      extras: payload.extras ? truncate(payload.extras, 3000) : "",
    };
    return ctx;
  }

  function openDiagnosis(payload) {
    if (!window.GuxiaomiChat || !window.GuxiaomiChat.openChat) {
      console.warn("AI 对话未就绪");
      return false;
    }
    var ctx = buildDiagnosisContext(payload);
    var initialMessage = payload.initialMessage;
    if (
      !initialMessage &&
      window.GuxiaomiChatDiagnosisPrompts &&
      window.GuxiaomiChatDiagnosisPrompts.initialMessageForMode
    ) {
      initialMessage = window.GuxiaomiChatDiagnosisPrompts.initialMessageForMode(
        ctx.diagnosisMode || "general",
        ctx,
      );
    }
    window.GuxiaomiChat.openChat({
      context: ctx,
      message:
        initialMessage ||
        "请严格基于已载入数据做深度诊断，按系统框架逐段展开，给出可执行建议。",
    });
    return true;
  }

  function openFromHoldingRow(row) {
    if (!row || !row.stock) return false;
    var stock = row.stock;
    var analysis = row.analysis || {};
    var md = stock.marketData || {};
    var holdingLines = [
      "【持仓】股数 " + (row.totalShares || 0),
      "均价 " + fmtNum(row.avgCost, row.marketLabel),
      "持仓盈亏 " +
        fmtNum(analysis.profit, row.marketLabel) +
        "（" +
        (Number(analysis.profitPercent) || 0).toFixed(2) +
        "%）",
      "仓位占比 " + (Number(row.allocation) || 0).toFixed(1) + "%",
    ];
    return openDiagnosis({
      page: "home",
      source: "holding",
      diagnosisMode: "holding",
      sourceLabel: "组合持仓列表",
      scopeSuffix: "holding",
      code: stock.symbol,
      market: row.marketLabel,
      name: stock.name,
      price: row.currentPrice,
      changePercent: row.changePct,
      quoteBlock: formatQuoteBlock(md, row.marketLabel),
      holdingBlock: holdingLines.join("\n"),
      priceHistoryBlock: formatPriceHistory(mergeHistoryForItem(stock), row.marketLabel),
      extras: formatIndicatorsBlock(stock),
    });
  }

  function openFromWatchlistRow(row) {
    if (!row || !row.item) return false;
    var item = row.item;
    var md = item.marketData || {};
    var watchLines = [
      "【关注】关注天数 " + (row.daysWatched || 0) + " 天",
      "关注时价 " + fmtNum(row.addedPrice, row.marketLabel),
      "关注盈亏 " +
        fmtNum(row.watchProfit, row.marketLabel) +
        "（" +
        (Number(row.watchProfitPercent) || 0).toFixed(2) +
        "%）",
    ];
    return openDiagnosis({
      page: "home",
      source: "watchlist",
      diagnosisMode: "watchlist",
      sourceLabel: "关注列表",
      scopeSuffix: "watchlist",
      code: item.symbol,
      market: row.marketLabel,
      name: item.name,
      price: row.currentPrice,
      changePercent: row.changePct,
      quoteBlock: formatQuoteBlock(md, row.marketLabel),
      watchBlock: watchLines.join("\n"),
      priceHistoryBlock: formatPriceHistory(
        mergeHistoryForItem(item),
        row.marketLabel,
      ),
      extras: formatIndicatorsBlock(item),
    });
  }

  function mergeHistoryForItem(item) {
    var embedded = Array.isArray(item.priceHistory) ? item.priceHistory : [];
    if (typeof window.loadStockPriceHistory === "function") {
      var stored = window.loadStockPriceHistory(item.symbol, item.market) || [];
      if (stored.length && !embedded.length) return stored;
      if (stored.length) {
        var map = {};
        embedded.concat(stored).forEach(function (row) {
          if (row && row.date) map[row.date] = row;
        });
        return Object.keys(map)
          .sort()
          .map(function (d) {
            return map[d];
          });
      }
    }
    return embedded;
  }

  function formatIndicatorsBlock(item) {
    var ti = item && item.technicalIndicators;
    if (!ti || typeof ti !== "object") return "";
    var lines = [];
    if (ti.ma5 || ti.ma10 || ti.rsi) {
      lines.push(
        "MA5 " +
          (ti.ma5 || "—") +
          " · MA10 " +
          (ti.ma10 || "—") +
          " · RSI " +
          (ti.rsi || "—"),
      );
    }
    var hist = Array.isArray(ti.history) ? ti.history : [];
    if (hist.length) {
      hist.slice(-5).reverse().forEach(function (row) {
        if (!row) return;
        lines.push(String(row.date || "—") + " 收 " + (row.close != null ? row.close : row.price));
      });
    }
    return lines.length ? "【技术指标】\n" + lines.join("\n") : "";
  }

  function openFromStockDetail(stock, opts) {
    opts = opts || {};
    if (!stock) return false;
    var mk =
      stock.market === "US"
        ? "美股"
        : stock.market === "HK"
          ? "港股"
          : stock.market === "CN"
            ? "A股"
            : marketLabel(stock.market);
    var md = stock.marketData || {};
    var analysis = opts.analysis || {};
    var extraLines = [];
    if (opts.hasHolding) {
      extraLines.push(
        "【持仓】市值 " +
          fmtNum(analysis.currentValue, mk) +
          " · 浮动盈亏 " +
          fmtNum(analysis.profit, mk) +
          "（" +
          (Number(analysis.profitPercent) || 0).toFixed(2) +
          "%）",
      );
      extraLines.push(
        "平均成本 " +
          fmtNum(analysis.avgCost, mk) +
          " · 持股 " +
          (analysis.totalShares || 0) +
          " 股",
      );
    }
    if (opts.watchItem) {
      extraLines.push("【关注】已关注 " + (opts.watchDays || 0) + " 天");
    }
    return openDiagnosis({
      page: "stock-detail",
      source: "stock-detail",
      diagnosisMode: opts.report ? "report" : "detail",
      sourceLabel: "股票详情页",
      scopeSuffix: opts.reportBaseName || "detail",
      code: stock.symbol,
      market: mk,
      name: stock.name || stock.nameCn,
      price: opts.currentPrice || stock.currentPrice || md.price,
      changePercent:
        opts.changePercent != null ? opts.changePercent : md.changePercent,
      quoteBlock: formatQuoteBlock(md, mk),
      priceHistoryBlock: formatPriceHistory(opts.priceHistory, mk),
      holdingBlock: extraLines.join("\n"),
      extras: formatIndicatorsBlock(stock),
      report: opts.report
        ? Object.assign({ base_name: opts.reportBaseName || "" }, opts.report)
        : null,
    });
  }

  function enrichPayloadFromCache(payload) {
    if (!payload || !payload.code || !window.GuxiaomiChatStockCache) return payload;
    var hit = window.GuxiaomiChatStockCache.findBySymbol(payload.code);
    if (!hit || !hit.item) return payload;
    var item = hit.item;
    var mk = payload.market || hit.marketLabel || marketLabel(hit.market);
    var md = item.marketData || {};
    if (!payload.quoteBlock) {
      payload.quoteBlock = formatQuoteBlock(md, mk);
    }
    if (!payload.priceHistoryBlock) {
      payload.priceHistoryBlock = formatPriceHistory(mergeHistoryForItem(item), mk);
    }
    if (!payload.extras) {
      payload.extras = formatIndicatorsBlock(item);
    }
    if (payload.price == null) payload.price = md.price || item.currentPrice;
    if (payload.changePercent == null) payload.changePercent = md.changePercent;
    if (!payload.name) payload.name = item.name || "";
    return payload;
  }

  function openFromAnalysisReport(report, opts) {
    opts = opts || {};
    if (!report) return false;
    var code = String(report.stock_code || opts.code || "")
      .trim()
      .toUpperCase();
    var mk = marketLabel(report.market || opts.market);
    var built =
      window.GuxiaomiChatDiagnosisPrompts &&
      window.GuxiaomiChatDiagnosisPrompts.buildReportExcerpt
        ? window.GuxiaomiChatDiagnosisPrompts.buildReportExcerpt(report)
        : { excerpt: reportExcerpt(report), baseName: report.base_name || "" };
    var notes = opts.notes || "";
    return openDiagnosis(
      enrichPayloadFromCache({
        page: "analysis",
        source: opts.source || "analysis-report",
        diagnosisMode: "report",
        sourceLabel: opts.sourceLabel || "分析报告",
        scopeSuffix: opts.scopeSuffix || report.base_name || "report",
        code: code,
        market: mk,
        name: opts.name || "",
        notes: notes,
        report: report,
        quoteBlock: opts.quoteBlock || "",
      }),
    );
  }

  window.GuxiaomiChatDiagnosis = {
    buildDiagnosisContext: buildDiagnosisContext,
    openDiagnosis: openDiagnosis,
    openFromHoldingRow: openFromHoldingRow,
    openFromWatchlistRow: openFromWatchlistRow,
    openFromStockDetail: openFromStockDetail,
    openFromAnalysisReport: openFromAnalysisReport,
    formatQuoteBlock: formatQuoteBlock,
    reportExcerpt: reportExcerpt,
  };
})();
