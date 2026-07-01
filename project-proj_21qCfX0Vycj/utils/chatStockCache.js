/** 从本地持仓/关注/价格缓存解析标的，供 AI 对话自动载入行情 */
(function () {
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

  function loadPortfolio() {
    if (typeof window.loadPortfolio === "function") {
      return window.loadPortfolio() || [];
    }
    try {
      var raw = localStorage.getItem("stock_portfolio_data");
      if (!raw) return [];
      var data = JSON.parse(raw);
      return (data && data.portfolio) || [];
    } catch (_) {
      return [];
    }
  }

  function loadWatchlist() {
    if (typeof window.loadWatchlist === "function") {
      return window.loadWatchlist() || [];
    }
    try {
      var raw = localStorage.getItem("stock_watchlist_data");
      if (!raw) return [];
      var data = JSON.parse(raw);
      return (data && data.watchlist) || [];
    } catch (_) {
      return [];
    }
  }

  function loadPriceHistory(symbol, market) {
    var itemHistory = [];
    if (typeof window.loadStockPriceHistory === "function") {
      itemHistory = window.loadStockPriceHistory(symbol, market) || [];
    }
    return Array.isArray(itemHistory) ? itemHistory : [];
  }

  function mergeHistory(item) {
    var embedded = Array.isArray(item.priceHistory) ? item.priceHistory : [];
    var stored = loadPriceHistory(item.symbol, item.market);
    if (!stored.length) return embedded;
    if (!embedded.length) return stored;
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

  function indexRecords() {
    var map = {};
    loadPortfolio().forEach(function (stock) {
      if (!stock || !stock.symbol) return;
      var sym = String(stock.symbol).toUpperCase();
      map[sym] = {
        type: "holding",
        priority: 3,
        item: stock,
        market: stock.market,
        marketLabel: marketLabel(stock.market),
      };
    });
    loadWatchlist().forEach(function (item) {
      if (!item || !item.symbol) return;
      var sym = String(item.symbol).toUpperCase();
      if (map[sym]) {
        map[sym].watchItem = item;
        map[sym].type = "holding-watch";
        map[sym].priority = 4;
      } else {
        map[sym] = {
          type: "watchlist",
          priority: 2,
          item: item,
          market: item.market,
          marketLabel: marketLabel(item.market),
        };
      }
    });
    return map;
  }

  function findBySymbol(symbol) {
    if (!symbol) return null;
    var map = indexRecords();
    return map[String(symbol).toUpperCase()] || null;
  }

  function matchSymbolsInMessage(text) {
    if (!text) return [];
    var map = indexRecords();
    var symbols = Object.keys(map);
    if (!symbols.length) return [];
    var msg = String(text).toUpperCase();
    var hits = [];
    symbols.forEach(function (sym) {
      var re = new RegExp("(^|[^A-Z0-9])" + sym + "([^A-Z0-9]|$)", "i");
      if (re.test(msg) || msg.indexOf(sym) >= 0) {
        hits.push({ symbol: sym, record: map[sym] });
      }
    });
    hits.sort(function (a, b) {
      return (b.record.priority || 0) - (a.record.priority || 0);
    });
    return hits;
  }

  function formatIndicators(ti, market) {
    if (!ti || typeof ti !== "object") return "";
    var lines = [];
    var digits = marketLabel(market) === "美股" ? 3 : 2;
    function n(v) {
      var x = Number(v);
      return Number.isFinite(x) ? x.toFixed(digits) : null;
    }
    if (ti.ma5 || ti.ma10 || ti.rsi) {
      lines.push(
        "MA5 " +
          (n(ti.ma5) || "—") +
          " · MA10 " +
          (n(ti.ma10) || "—") +
          " · RSI(14) " +
          (ti.rsi != null ? Number(ti.rsi).toFixed(2) : "—"),
      );
    }
    var hist = Array.isArray(ti.history) ? ti.history : [];
    if (hist.length) {
      lines.push("近5日收盘：");
      hist
        .slice(-5)
        .reverse()
        .forEach(function (row) {
          if (!row) return;
          lines.push(
            String(row.date || "—") +
              " " +
              (n(row.close != null ? row.close : row.price) || "—"),
          );
        });
    }
    return lines.length ? "【技术指标】\n" + lines.join("\n") : "";
  }

  function buildNotesFromRecord(record) {
    if (!record || !record.item) return "";
    var item = record.item;
    var mk = record.marketLabel || marketLabel(item.market);
    var md = item.marketData || {};
    var parts = [];
    parts.push("【数据来源】股小蜜应用内已刷新本地缓存（与页面展示同源）");

    if (window.GuxiaomiChatDiagnosis && window.GuxiaomiChatDiagnosis.formatQuoteBlock) {
      var quote = window.GuxiaomiChatDiagnosis.formatQuoteBlock(md, mk);
      if (quote) parts.push(quote);
    } else if (Number(md.price) > 0) {
      parts.push("【实时行情】现价 " + md.price);
    }

    var history = mergeHistory(item);
    if (window.GuxiaomiChatDiagnosis && window.GuxiaomiChatDiagnosis.formatPriceHistory) {
      var histBlock = window.GuxiaomiChatDiagnosis.formatPriceHistory(history, mk);
      if (histBlock) parts.push(histBlock);
    }

    var ti = item.technicalIndicators || {};
    var tiBlock = formatIndicators(ti, mk);
    if (tiBlock) parts.push(tiBlock);

    if (record.type === "watchlist" || record.watchItem) {
      var w = record.watchItem || item;
      var added = w.addedAt ? new Date(w.addedAt) : null;
      var days = added
        ? Math.max(0, Math.floor((Date.now() - added.getTime()) / 86400000))
        : 0;
      var start = Number(w.watchStartPrice) || 0;
      var cur = Number(item.currentPrice) || Number(md.price) || 0;
      var watchPct = start > 0 && cur > 0 ? ((cur - start) / start) * 100 : 0;
      parts.push(
        "【关注】关注 " +
          days +
          " 天 · 关注时价 " +
          (start || "—") +
          " · 关注盈亏 " +
          watchPct.toFixed(2) +
          "%",
      );
    }

    if (record.type === "holding" || record.type === "holding-watch") {
      if (typeof calculateStockAnalysis === "function") {
        try {
          var analysis = calculateStockAnalysis(item, item.brokerChannel || "futu");
          parts.push(
            "【持仓】股数 " +
              (analysis.totalShares || 0) +
              " · 均价 " +
              (analysis.avgCost || 0) +
              " · 浮动盈亏 " +
              (analysis.profit || 0) +
              "（" +
              (Number(analysis.profitPercent) || 0).toFixed(2) +
              "%）",
          );
        } catch (_) {}
      }
    }

    if (Array.isArray(item.keywords) && item.keywords.length) {
      parts.push("【关键词】" + item.keywords.join("、"));
    }

    parts.push(
      "【缓存时间】" +
        new Date().toLocaleString("zh-CN", { hour12: false }),
    );
    return parts.filter(Boolean).join("\n\n");
  }

  function buildSnapshotFromRecord(record, symbol) {
    var item = record.item;
    var mk = record.marketLabel || marketLabel(item.market);
    var md = item.marketData || {};
    var cur = Number(item.currentPrice) || Number(md.price) || 0;
    var pct = item.changePercent != null ? item.changePercent : md.changePercent;
    var notes = buildNotesFromRecord(record);

    return {
      scopeKey: symbol + "|" + mk + "|local-cache",
      title: symbol + " · " + mk + " · AI诊断",
      focus: "diagnosis",
      source: record.type || "local-cache",
      stock: {
        code: symbol,
        market: mk,
        name: item.name || "",
        price: cur,
        changePercent: pct,
        notes: notes,
      },
      report: null,
      extras: "",
    };
  }

  function hasRichStockData(snapshot) {
    if (!snapshot || !snapshot.stock) return false;
    var notes = snapshot.stock.notes || "";
    if (snapshot.focus === "diagnosis" && notes.indexOf("【实时行情】") >= 0) return true;
    if (notes.indexOf("【数据来源】") >= 0 && notes.length > 60) return true;
    return false;
  }

  function enrichSnapshot(message, snapshot) {
    snapshot = snapshot || {};
    if (hasRichStockData(snapshot)) return snapshot;

    var hits = matchSymbolsInMessage(message);
    if (!hits.length) return snapshot;

    var pick = hits[0];
    var built = buildSnapshotFromRecord(pick.record, pick.symbol);
    return Object.assign({}, snapshot, built, {
      page: snapshot.page || (window.GuxiaomiChat && window.GuxiaomiChat.detectPageFromPath()) || "home",
    });
  }

  window.GuxiaomiChatStockCache = {
    findBySymbol: findBySymbol,
    matchSymbolsInMessage: matchSymbolsInMessage,
    buildSnapshotFromRecord: buildSnapshotFromRecord,
    enrichSnapshot: enrichSnapshot,
    buildNotesFromRecord: buildNotesFromRecord,
    indexRecords: indexRecords,
  };
})();
