(function () {
  var params = new URLSearchParams(window.location.search);
  var api = params.get("api");
  if (!api) return;
  if (/^https?:\/\//i.test(api)) {
    window.ANALYSIS_API_BASE = api;
    return;
  }
  var h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") {
    window.ANALYSIS_API_BASE = "http://localhost:" + api;
  }
})();
/** 默认 API：本地 8123；线上未注入 ANALYSIS_API_BASE 时用当前站点同源（Vercel FastAPI 同域） */
const API_BASE_FALLBACK =
  window.ANALYSIS_API_BASE ||
  (typeof location !== "undefined" &&
  (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://localhost:8123"
    : typeof location !== "undefined" && location.origin
      ? location.origin
      : "");
const JOB_STORAGE_KEY = "analysis_job_id";
const FRONTEND_VERSION =
  window.ANALYSIS_FRONTEND_VERSION || "";
const JOB_STORAGE_VERSION_KEY =
  "analysis_job_id_frontend_version";
const POLL_INTERVAL_MS = 3000;
/** 历史报告每页条数；预测列表 API 每页条数见 PRED_TABLE_VISIBLE_ROWS */
const HISTORY_PAGE_SIZE = 10;
const MODEL_STORAGE_KEY = "analysis_selected_model_key";
const DEFAULT_MODEL_KEY = "model2";

function getCurrentReturnPath() {
  if (typeof window === "undefined") return "index.html";
  return `${window.location.pathname.split("/").pop() || "index.html"}${window.location.search || ""}${window.location.hash || ""}`;
}

function withCurrentSource(path) {
  const separator = path.indexOf("?") >= 0 ? "&" : "?";
  return `${path}${separator}from=${encodeURIComponent(getCurrentReturnPath())}`;
}

function getSourceReturnTarget(fallback) {
  const params = new URLSearchParams(window.location.search);
  const from = params.get("from") || "";
  if (from) {
    try {
      const target = new URL(from, window.location.href);
      if (target.origin === window.location.origin) {
        return `${target.pathname.split("/").pop() || fallback}${target.search || ""}${target.hash || ""}`;
      }
    } catch (_) {}
  }
  return fallback;
}

function goBackToSource() {
  const hasExplicitSource = new URLSearchParams(window.location.search).has("from");
  const target = getSourceReturnTarget("index.html");
  if (hasExplicitSource && target) {
    window.location.href = target;
    return;
  }
  if (window.history && window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = "index.html";
}

const FALLBACK_MODEL_OPTIONS = [
  { key: "model1", label: "MiniMax", configured: false, default: false },
  { key: "model2", label: "Gemma", configured: false, default: true },
  { key: "model3", label: "Deepseek", configured: false, default: false },
];

function normalizeModelKey(key) {
  var k = String(key || "").trim().toLowerCase();
  return ["model1", "model2", "model3"].includes(k) ? k : DEFAULT_MODEL_KEY;
}

/** 预测表默认可见行数（超出在表内滚动；列表翻页仍走 API page/size） */
const PRED_TABLE_VISIBLE_ROWS = 7;
const PRED_TABLE_BODY_MIN_HEIGHT = "calc(2.25rem * " + PRED_TABLE_VISIBLE_ROWS + " + 0.25rem)";

function formatAnalysisNoteNumber(value, digits) {
  var n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits != null ? digits : 2);
}

function formatAnalysisSignedNumber(value, digits) {
  var n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return (n >= 0 ? "+" : "") + n.toFixed(digits != null ? digits : 2);
}

/** 从行情 + 技术指标 + 预测行拼备注，供分析模型参考 */
function buildStockAnalysisNotes(opts) {
  var lines = [];
  var symbol = String((opts && opts.symbol) || "").trim().toUpperCase();
  var name = String((opts && opts.name) || "").trim();
  var market = String((opts && opts.market) || "").trim();
  var quote = opts && opts.quote;
  var indicators = opts && opts.indicators;
  var predRow = opts && opts.predRow;
  var priceDigits = market === "美股" ? 3 : 2;

  if (name && name !== symbol) {
    lines.push("【标的】" + symbol + " · " + name + (market ? "（" + market + "）" : ""));
  } else {
    lines.push("【标的】" + symbol + (market ? "（" + market + "）" : ""));
  }

  if (quote && Number(quote.price) > 0) {
    lines.push("【实时行情】" + (quote.isMock ? "（接口不可用，模拟数据）" : ""));
    var changePct =
      quote.changePercent != null && !Number.isNaN(Number(quote.changePercent))
        ? formatAnalysisSignedNumber(quote.changePercent, 2) + "%"
        : "";
    lines.push(
      "现价 " +
        formatAnalysisNoteNumber(quote.price, priceDigits) +
        (changePct ? "（" + changePct + "）" : ""),
    );
    if (quote.open || quote.high || quote.low) {
      lines.push(
        "今开 " +
          formatAnalysisNoteNumber(quote.open, priceDigits) +
          " · 最高 " +
          formatAnalysisNoteNumber(quote.high, priceDigits) +
          " · 最低 " +
          formatAnalysisNoteNumber(quote.low, priceDigits),
      );
    }
    if (quote.previousClose) {
      lines.push("昨收 " + formatAnalysisNoteNumber(quote.previousClose, priceDigits));
    }
    if (quote.change != null && !Number.isNaN(Number(quote.change))) {
      lines.push("涨跌额 " + formatAnalysisSignedNumber(quote.change, priceDigits));
    }
    if (quote.volume != null && Number(quote.volume) > 0) {
      lines.push(
        "成交量 " +
          (typeof formatVolume === "function"
            ? formatVolume(quote.volume)
            : String(quote.volume)),
      );
    }
  }

  if (indicators) {
    if (indicators.ma5 || indicators.ma10 || indicators.rsi) {
      lines.push(
        "【技术指标】MA5 " +
          formatAnalysisNoteNumber(indicators.ma5, priceDigits) +
          " · MA10 " +
          formatAnalysisNoteNumber(indicators.ma10, priceDigits) +
          " · RSI(14) " +
          formatAnalysisNoteNumber(indicators.rsi, 2),
      );
    }
    var history = Array.isArray(indicators.history) ? indicators.history : [];
    if (history.length > 0) {
      lines.push("【近5日收盘】");
      history
        .slice(-5)
        .reverse()
        .forEach(function (item) {
          if (!item) return;
          lines.push(
            String(item.date || "—") +
              " 收 " +
              formatAnalysisNoteNumber(item.close != null ? item.close : item.price, priceDigits),
          );
        });
    }
  }

  if (predRow) {
    var predParts = [];
    if (predRow.probability != null && predRow.probability !== "") {
      predParts.push("预测概率 " + predRow.probability);
    }
    if (predRow.profit != null && predRow.profit !== "") {
      predParts.push("profit " + predRow.profit);
    }
    if (predRow.change_ratio != null && predRow.change_ratio !== "") {
      predParts.push("涨跌% " + predRow.change_ratio);
    }
    if (predRow.price != null && predRow.price !== "") {
      predParts.push("快照价 " + predRow.price);
    }
    if (predParts.length) {
      lines.push("【预测快照】" + predParts.join(" · "));
    }
  }

  lines.push(
    "【摘录时间】" +
      new Date().toLocaleString("zh-CN", { hour12: false }) +
      " · 浏览器行情接口",
  );
  return lines.join("\n");
}

/** 预测列表行 → 市场/代码（与 analyze 逻辑一致） */
function resolvePredRowMarket(row) {
  var symbol = String((row && row.symbol) || "").trim().toUpperCase();
  var code = String((row && row.code) || "").trim();
  var market = "US";
  if (/^\d{6}$/.test(symbol) || /^\d{6}$/.test(code) || /^(0|3|6)\d{5}$/.test(code)) {
    market = "CN";
  } else if (/^\d{5}$/.test(symbol) || /^\d{5}$/.test(code) || /^HK/i.test(code)) {
    market = "HK";
  }
  if (market === "HK" && /^\d+$/.test(symbol)) {
    symbol = String(parseInt(symbol, 10)).padStart(5, "0");
  } else if (market === "CN" && /^\d+$/.test(symbol)) {
    symbol = String(parseInt(symbol, 10)).padStart(6, "0");
  }
  return { symbol: symbol, market: market };
}

function predWatchlistKey(symbol, market) {
  var m = String(market || "US").toUpperCase();
  var s = String(symbol || "").trim().toUpperCase();
  if (m === "HK" && /^\d+$/.test(s)) {
    s = String(parseInt(s, 10)).padStart(5, "0");
  } else if (m === "CN" && /^\d+$/.test(s)) {
    s = String(parseInt(s, 10)).padStart(6, "0");
  }
  return m + "_" + s;
}

/** 浏览器端历史列表缓存（Vercel 无持久盘时服务端列表常为空；且勿在 report 变化时整表重拉以免被空结果覆盖） */
const HISTORY_LIST_CACHE_KEY = "analysis_reports_list_cache_v1";
/** 用户已删除的 base_name（Vercel 多实例 /tmp 上文件可能仍在其他实例；合并列表时过滤，避免「删了又出现」） */
const REPORT_DELETE_TOMBSTONE_KEY = "analysis_reports_deleted_base_names_v1";
const MAX_REPORT_TOMBSTONES = 500;
const REPORT_BODY_PREFIX = "analysis_report_body_v1:";
const REPORT_BODY_INDEX_KEY = "analysis_report_body_index_v1";
const MAX_CACHED_REPORT_BODIES = 20;
const MAX_LIST_CACHE = 200;

function loadHistoryListCache() {
  try {
    var raw = localStorage.getItem(HISTORY_LIST_CACHE_KEY);
    if (!raw) return [];
    var j = JSON.parse(raw);
    return Array.isArray(j) ? j : [];
  } catch (_) {
    return [];
  }
}

function saveHistoryListCache(items) {
  try {
    localStorage.setItem(
      HISTORY_LIST_CACHE_KEY,
      JSON.stringify((items || []).slice(0, MAX_LIST_CACHE)),
    );
  } catch (_) {}
}

function loadDeletedReportBaseNameSet() {
  try {
    var raw = localStorage.getItem(REPORT_DELETE_TOMBSTONE_KEY);
    if (!raw) return {};
    var j = JSON.parse(raw);
    if (!Array.isArray(j)) return {};
    var o = {};
    var i;
    for (i = 0; i < j.length; i++) {
      if (j[i]) o[String(j[i])] = true;
    }
    return o;
  } catch (_) {
    return {};
  }
}

function addDeletedReportBaseName(baseName) {
  if (!baseName) return;
  try {
    var raw = localStorage.getItem(REPORT_DELETE_TOMBSTONE_KEY);
    var arr = [];
    if (raw) {
      var j = JSON.parse(raw);
      if (Array.isArray(j)) arr = j.slice();
    }
    var s = String(baseName);
    arr = arr.filter(function (x) {
      return x !== s;
    });
    arr.unshift(s);
    while (arr.length > MAX_REPORT_TOMBSTONES) arr.pop();
    localStorage.setItem(REPORT_DELETE_TOMBSTONE_KEY, JSON.stringify(arr));
  } catch (_) {}
}

function filterOutDeletedReportItems(items) {
  var tomb = loadDeletedReportBaseNameSet();
  return (items || []).filter(function (it) {
    return it && it.base_name && !tomb[it.base_name];
  });
}

/** 合并服务端与本地缓存；服务端为空时仍保留本地条目（解决刷新/切实例后列表被清空） */
function mergeHistoryListItems(serverItems, cachedItems) {
  var map = {};
  var i;
  var k;
  for (i = 0; i < (cachedItems || []).length; i++) {
    var c = cachedItems[i];
    k = c && c.base_name;
    if (k) map[k] = Object.assign({}, c);
  }
  for (i = 0; i < (serverItems || []).length; i++) {
    var s = serverItems[i];
    k = s && s.base_name;
    if (k) map[k] = Object.assign({}, map[k] || {}, s);
  }
  var out = Object.keys(map).map(function (key) {
    return map[key];
  });
  out.sort(function (a, b) {
    return String(b.generated_at || "").localeCompare(
      String(a.generated_at || ""),
    );
  });
  return out;
}

/** 与 api_server._infer_stock_from_base_name 一致，用于列表项缺 stock_code 时补全 */
function inferStockFromReportBaseName(baseName) {
  var m = String(baseName || "").match(/^(A股|港股|美股)_([^_]+)_/);
  if (!m) return { stock_code: "", market: "" };
  var mm = { A股: "A 股", 港股: "港股", 美股: "美股" };
  return {
    stock_code: (m[2] || "").trim().toUpperCase(),
    market: mm[m[1]] || "",
  };
}

/**
 * 历史报告筛选用：港股 03690 / 3690 / 03690.HK 视为同一代码；A 股 6 位补齐。
 */
function normalizeReportStockCode(code, market) {
  var c = String(code || "").trim().toUpperCase();
  if (!c) return "";
  var mk = String(market || "").trim();
  var isHK = mk.indexOf("港") >= 0 || mk === "HK";
  var isCN = mk.indexOf("A") >= 0 || mk.indexOf("CN") >= 0 || mk === "A 股";
  c = c.replace(/\.HK$/i, "");
  if (/^\d+$/.test(c)) {
    var n = parseInt(c, 10);
    if (!Number.isFinite(n)) return c;
    if (isCN) return String(n).padStart(6, "0");
    if (isHK) return String(n).padStart(5, "0");
    if (c.length >= 6) return String(n).padStart(6, "0");
    return String(n).padStart(5, "0");
  }
  return c;
}

function enrichHistoryListItem(it) {
  if (!it) return it;
  var inf = inferStockFromReportBaseName(it.base_name);
  var sc = String(it.stock_code || "").trim();
  var mk = String(it.market || "").trim();
  if (!sc && inf.stock_code) sc = inf.stock_code;
  if (!mk && inf.market) mk = inf.market;
  return Object.assign({}, it, {
    stock_code: sc.toUpperCase(),
    market: mk,
  });
}

function listItemFromReportPayload(r) {
  if (!r || !r.base_name) return null;
  var ga = (r.生成时间 && String(r.生成时间).trim()) || "";
  if (!ga) {
    ga = new Date().toISOString().slice(0, 16).replace("T", " ");
  }
  return {
    base_name: r.base_name,
    generated_at: ga,
    stock_code: (r.stock_code || "").toUpperCase(),
    market: r.market || "",
  };
}

function cacheReportBody(baseName, payload) {
  if (!baseName || !payload) return;
  try {
    var json = JSON.stringify(payload);
    if (json.length > 3.5 * 1024 * 1024) return;
    localStorage.setItem(REPORT_BODY_PREFIX + baseName, json);
    var idx = JSON.parse(localStorage.getItem(REPORT_BODY_INDEX_KEY) || "[]");
    if (!Array.isArray(idx)) idx = [];
    idx = idx.filter(function (x) {
      return x !== baseName;
    });
    idx.unshift(baseName);
    while (idx.length > MAX_CACHED_REPORT_BODIES) {
      var rem = idx.pop();
      try {
        localStorage.removeItem(REPORT_BODY_PREFIX + rem);
      } catch (_) {}
    }
    localStorage.setItem(REPORT_BODY_INDEX_KEY, JSON.stringify(idx));
  } catch (_) {
    try {
      var idx2 = JSON.parse(localStorage.getItem(REPORT_BODY_INDEX_KEY) || "[]");
      if (Array.isArray(idx2) && idx2.length > 1) {
        var drop = idx2.pop();
        localStorage.removeItem(REPORT_BODY_PREFIX + drop);
        localStorage.setItem(REPORT_BODY_INDEX_KEY, JSON.stringify(idx2));
      }
    } catch (_) {}
  }
}

function getCachedReportBody(baseName) {
  if (!baseName) return null;
  try {
    var raw = localStorage.getItem(REPORT_BODY_PREFIX + baseName);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function removeCachedReportBody(baseName) {
  if (!baseName) return;
  try {
    localStorage.removeItem(REPORT_BODY_PREFIX + baseName);
    var idx = JSON.parse(localStorage.getItem(REPORT_BODY_INDEX_KEY) || "[]");
    if (Array.isArray(idx)) {
      idx = idx.filter(function (x) {
        return x !== baseName;
      });
      localStorage.setItem(REPORT_BODY_INDEX_KEY, JSON.stringify(idx));
    }
  } catch (_) {}
}

function upsertHistoryFromPayload(payload) {
  var item = listItemFromReportPayload(payload);
  if (!item) return;
  var merged = mergeHistoryListItems([item], loadHistoryListCache());
  merged = filterOutDeletedReportItems(merged);
  merged = merged.map(enrichHistoryListItem);
  saveHistoryListCache(merged);
  return merged;
}

/** 股票预测：服务端快照在 Vercel /tmp 或多实例下列表常空；合并本地列表并缓存详情 JSON，行为对齐「历史报告」 */
const SCREENER_LIST_CACHE_KEY = "analysis_screener_list_cache_v1";
const SCREENER_DELETE_TOMBSTONE_KEY = "analysis_screener_deleted_base_names_v1";
const MAX_SCREENER_TOMBSTONES = 500;
const SCREENER_BODY_PREFIX = "analysis_screener_body_v1:";
const SCREENER_BODY_INDEX_KEY = "analysis_screener_body_index_v1";
const MAX_CACHED_SCREENER_BODIES = 12;
const MAX_SCREENER_LIST_CACHE = 100;

function loadScreenerListCache() {
  try {
    var raw = localStorage.getItem(SCREENER_LIST_CACHE_KEY);
    if (!raw) return [];
    var j = JSON.parse(raw);
    return Array.isArray(j) ? j : [];
  } catch (_) {
    return [];
  }
}

function saveScreenerListCache(items) {
  try {
    localStorage.setItem(
      SCREENER_LIST_CACHE_KEY,
      JSON.stringify((items || []).slice(0, MAX_SCREENER_LIST_CACHE)),
    );
  } catch (_) {}
}

function loadDeletedScreenerBaseNameSet() {
  try {
    var raw = localStorage.getItem(SCREENER_DELETE_TOMBSTONE_KEY);
    if (!raw) return {};
    var j = JSON.parse(raw);
    if (!Array.isArray(j)) return {};
    var o = {};
    var i;
    for (i = 0; i < j.length; i++) {
      if (j[i]) o[String(j[i])] = true;
    }
    return o;
  } catch (_) {
    return {};
  }
}

function addDeletedScreenerBaseName(baseName) {
  if (!baseName) return;
  try {
    var raw = localStorage.getItem(SCREENER_DELETE_TOMBSTONE_KEY);
    var arr = [];
    if (raw) {
      var j = JSON.parse(raw);
      if (Array.isArray(j)) arr = j.slice();
    }
    var s = String(baseName);
    arr = arr.filter(function (x) {
      return x !== s;
    });
    arr.unshift(s);
    while (arr.length > MAX_SCREENER_TOMBSTONES) arr.pop();
    localStorage.setItem(SCREENER_DELETE_TOMBSTONE_KEY, JSON.stringify(arr));
  } catch (_) {}
}

function filterOutDeletedScreenerItems(items) {
  var tomb = loadDeletedScreenerBaseNameSet();
  return (items || []).filter(function (it) {
    return it && it.base_name && !tomb[it.base_name];
  });
}

/** 合并服务端与本地预测列表（元数据小，可安全存 localStorage） */
function mergeScreenerListItems(serverItems, cachedItems) {
  var map = {};
  var i;
  var k;
  for (i = 0; i < (cachedItems || []).length; i++) {
    var c = cachedItems[i];
    k = c && c.base_name;
    if (k) map[k] = Object.assign({}, c);
  }
  for (i = 0; i < (serverItems || []).length; i++) {
    var s = serverItems[i];
    k = s && s.base_name;
    if (k) map[k] = Object.assign({}, map[k] || {}, s);
  }
  var out = Object.keys(map).map(function (key) {
    return map[key];
  });
  out.sort(function (a, b) {
    return String(b.saved_at || "").localeCompare(String(a.saved_at || ""));
  });
  return out;
}

function cacheScreenerBody(baseName, payload) {
  if (!baseName || !payload) return;
  try {
    var json = JSON.stringify(payload);
    if (json.length > 3.5 * 1024 * 1024) return;
    localStorage.setItem(SCREENER_BODY_PREFIX + baseName, json);
    var idx = JSON.parse(localStorage.getItem(SCREENER_BODY_INDEX_KEY) || "[]");
    if (!Array.isArray(idx)) idx = [];
    idx = idx.filter(function (x) {
      return x !== baseName;
    });
    idx.unshift(baseName);
    while (idx.length > MAX_CACHED_SCREENER_BODIES) {
      var rem = idx.pop();
      try {
        localStorage.removeItem(SCREENER_BODY_PREFIX + rem);
      } catch (_) {}
    }
    localStorage.setItem(SCREENER_BODY_INDEX_KEY, JSON.stringify(idx));
  } catch (_) {
    try {
      var idx2 = JSON.parse(localStorage.getItem(SCREENER_BODY_INDEX_KEY) || "[]");
      if (Array.isArray(idx2) && idx2.length > 1) {
        var drop = idx2.pop();
        localStorage.removeItem(SCREENER_BODY_PREFIX + drop);
        localStorage.setItem(SCREENER_BODY_INDEX_KEY, JSON.stringify(idx2));
      }
    } catch (_) {}
  }
}

function getCachedScreenerBody(baseName) {
  if (!baseName) return null;
  try {
    var raw = localStorage.getItem(SCREENER_BODY_PREFIX + baseName);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function removeCachedScreenerBody(baseName) {
  if (!baseName) return;
  try {
    localStorage.removeItem(SCREENER_BODY_PREFIX + baseName);
    var idx = JSON.parse(localStorage.getItem(SCREENER_BODY_INDEX_KEY) || "[]");
    if (Array.isArray(idx)) {
      idx = idx.filter(function (x) {
        return x !== baseName;
      });
      localStorage.setItem(SCREENER_BODY_INDEX_KEY, JSON.stringify(idx));
    }
  } catch (_) {}
}

/** 解析快照文件名 scr_p{pt}_t{tt}_s{st}_p{page}_{时间戳}（page 为 Intellectia 列表页码） */
function parseScreenerBaseName(baseName) {
  if (!baseName || typeof baseName !== "string") return null;
  var m = /^scr_p(\d+)_t(\d+)_s(\d+)_p(\d+)_/.exec(baseName);
  if (m) {
    return {
      pt: parseInt(m[1], 10),
      tt: parseInt(m[2], 10),
      st: parseInt(m[3], 10),
      page: parseInt(m[4], 10),
    };
  }
  m = /^scr_p(\d+)_t(\d+)_s(\d+)_/.exec(baseName);
  if (!m) return null;
  return {
    pt: parseInt(m[1], 10),
    tt: parseInt(m[2], 10),
    st: parseInt(m[3], 10),
    page: 1,
  };
}

/** 在已拉取的列表中找与当前日期、方向、资产、日周月、列表页码一致的快照（取同条件下最新一条） */
function findScreenerSnapshotName(
  items,
  dateKey,
  trendType,
  symbolType,
  periodTab,
  page,
) {
  var best = null;
  var bestAt = "";
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var parsed = parseScreenerBaseName(item.base_name);
    if (!parsed || parsed.tt !== trendType || parsed.st !== symbolType) continue;
    if (parsed.pt !== periodTab) continue;
    if (parsed.page !== page) continue;
    if (savedAtToDateKey(item.saved_at) !== dateKey) continue;
    var sa = String(item.saved_at || "");
    if (!best || sa > bestAt) {
      best = item.base_name;
      bestAt = sa;
    }
  }
  return best;
}

function hasScreenerSnapshotForPeriod(
  items,
  dateKey,
  trendType,
  symbolType,
  periodTab,
) {
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var parsed = parseScreenerBaseName(item.base_name);
    if (!parsed || parsed.tt !== trendType || parsed.st !== symbolType) continue;
    if (parsed.pt !== periodTab) continue;
    if (savedAtToDateKey(item.saved_at) === dateKey) return true;
  }
  return false;
}

function savedAtToDateKey(savedAt) {
  if (!savedAt || typeof savedAt !== "string") return null;
  var part = savedAt.trim().split(/\s+/)[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return null;
  return part;
}

/** 展示为「3月12」；非当年则带年份 */
function formatPredDateChip(dateKey) {
  if (!dateKey) return "";
  var p = dateKey.split("-");
  if (p.length !== 3) return dateKey;
  var y = parseInt(p[0], 10);
  var m = parseInt(p[1], 10);
  var d = parseInt(p[2], 10);
  var cy = new Date().getFullYear();
  if (y !== cy) return y + "年" + m + "月" + d;
  return m + "月" + d;
}

/** Date → "YYYY-MM-DD" */
function dateToDateKey(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

/** 预测保存日历：高亮有快照的日期，点击某天切换到那天生成的预测 */
function PredictionDateCalendar(props) {
  var available =
    props.availableKeys instanceof Set
      ? props.availableKeys
      : new Set(props.availableKeys || []);
  var selectedKey = props.selectedKey;
  var anchor =
    selectedKey ||
    (available.size ? Array.from(available).sort().reverse()[0] : null);
  var anchorDate = anchor ? new Date(anchor + "T00:00:00") : new Date();
  var ymState = React.useState({
    y: anchorDate.getFullYear(),
    m: anchorDate.getMonth(),
  });
  var ym = ymState[0];
  var setYm = ymState[1];

  var first = new Date(ym.y, ym.m, 1);
  var startOffset = first.getDay();
  var daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  var cells = [];
  for (var i = 0; i < startOffset; i++) cells.push(null);
  for (var dd = 1; dd <= daysInMonth; dd++) cells.push(new Date(ym.y, ym.m, dd));

  function shiftMonth(delta) {
    setYm(function (prev) {
      var nm = prev.m + delta;
      var ny = prev.y + Math.floor(nm / 12);
      nm = ((nm % 12) + 12) % 12;
      return { y: ny, m: nm };
    });
  }

  var weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];
  var todayKey = dateToDateKey(new Date());

  return (
    <div className="w-[17rem] rounded-xl border border-white/15 bg-slate-900/95 p-3 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="btn btn-secondary btn-sm !px-2"
          onClick={() => shiftMonth(-1)}
          aria-label="上个月"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-slate-100">
          {ym.y} 年 {ym.m + 1} 月
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm !px-2"
          onClick={() => shiftMonth(1)}
          aria-label="下个月"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-slate-500">
        {weekdayLabels.map((w) => (
          <div key={w} className="py-0.5">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, idx) => {
          if (!cell) return <div key={"e" + idx} />;
          var key = dateToDateKey(cell);
          var has = available.has(key);
          var isSel = key === selectedKey;
          var isToday = key === todayKey;
          var cls =
            "flex h-8 items-center justify-center rounded-md text-xs tabular-nums transition ";
          if (isSel)
            cls +=
              "bg-cyan-400/30 text-cyan-50 font-bold ring-1 ring-cyan-300/60";
          else if (has)
            cls +=
              "bg-emerald-500/15 text-emerald-200 font-semibold hover:bg-emerald-500/25 cursor-pointer";
          else cls += "text-slate-600";
          if (isToday && !isSel) cls += " ring-1 ring-white/25";
          return (
            <button
              key={key}
              type="button"
              disabled={!has}
              onClick={() => has && props.onSelect(key)}
              className={cls}
              title={has ? key + "（有快照）" : key}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
        <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/40"></span>
        有快照
        <span className="ml-1 inline-block h-2 w-2 rounded-sm bg-cyan-400/50"></span>
        当前
      </div>
    </div>
  );
}

function localDateKey() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

/** 按日期汇总有哪些日/周/月快照（任一页即可）；cell 用 true 表示该周期已有数据 */
function groupPredictionsByDate(items, trendType, symbolType) {
  var grouped = {};
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var parsed = parseScreenerBaseName(item.base_name);
    if (!parsed || parsed.tt !== trendType || parsed.st !== symbolType) continue;
    var dk = savedAtToDateKey(item.saved_at);
    if (!dk) continue;
    if (!grouped[dk]) grouped[dk] = { 0: null, 1: null, 2: null };
    var pt = parsed.pt;
    if (pt >= 0 && pt <= 2) grouped[dk][pt] = true;
  }
  var keys = Object.keys(grouped).sort(function (a, b) {
    return b.localeCompare(a);
  });
  return { grouped: grouped, keys: keys };
}

/** 按日期汇总有哪些日/周/月快照，忽略趋势方向（用于同时展示看涨/看跌） */
function groupPredictionsByDateAllTrends(items, symbolType) {
  var grouped = {};
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var parsed = parseScreenerBaseName(item.base_name);
    if (!parsed || parsed.st !== symbolType) continue;
    var dk = savedAtToDateKey(item.saved_at);
    if (!dk) continue;
    if (!grouped[dk]) grouped[dk] = { 0: null, 1: null, 2: null };
    var pt = parsed.pt;
    if (pt >= 0 && pt <= 2) grouped[dk][pt] = true;
  }
  var keys = Object.keys(grouped).sort(function (a, b) {
    return b.localeCompare(a);
  });
  return { grouped: grouped, keys: keys };
}

/** 判断指定日期、资产、周期是否至少有一个趋势方向存在快照 */
function hasScreenerSnapshotForPeriodAnyTrend(
  items,
  dateKey,
  symbolType,
  periodTab,
) {
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var parsed = parseScreenerBaseName(item.base_name);
    if (!parsed || parsed.st !== symbolType) continue;
    if (parsed.pt !== periodTab) continue;
    if (savedAtToDateKey(item.saved_at) === dateKey) return true;
  }
  return false;
}

function formatReportValue(val) {
  if (val == null) return "";
  if (typeof val !== "object") return String(val);
  if (Array.isArray(val)) return val.join("；");
  return Object.entries(val)
    .map(function (e) {
      return e[0] + "：" + (e[1] == null ? "" : String(e[1]));
    })
    .join("\n");
}

function stripMarkdown(s) {
  if (typeof s !== "string") return s;
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^>\s*/gm, "")
    .trim();
}

function scrollToReportAnchor(anchorId) {
  if (!anchorId) return;
  try {
    var el = document.getElementById(anchorId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (_) {}
}

/** 对比与异动：模板/页面已有「📌 对比上次变化…」，去掉模型重复输出的 # 标题 */
function stripDuplicateDiffMarkdownHeadings(text) {
  if (text == null || typeof text !== "string") return text;
  var t = text.trim();
  var kw = /对比上次|对比与异动|异动信号/;
  for (var i = 0; i < 8; i++) {
    var m = t.match(/^(#{1,3}\s*[^\n]+)\n*/);
    if (!m) break;
    var title = m[1].replace(/^#+\s*/, "");
    if (kw.test(title)) t = t.slice(m[0].length).trim();
    else break;
  }
  return t;
}

/** 分析师卡片顶栏已有角色与投资建议，去掉正文开头的「## 核心结论」 */
function stripCoreConclusionHeading(text) {
  if (text == null || typeof text !== "string") return text;
  var t = text.trim();
  for (var j = 0; j < 3; j++) {
    var m2 = t.match(/^#{1,3}\s*核心结论\s*[^\n]*\n+/i);
    if (!m2) break;
    t = t.slice(m2[0].length).trim();
  }
  return t;
}

/** 深度诊断回复：去掉思考标签与常见元叙述前缀（与后端 api 清洗互补） */
function sanitizeDiagnosisReply(text) {
  if (text == null || typeof text !== "string") return text;
  var s = text.trim();
  var _thinkRe = new RegExp("<think>[\\s\\S]*?</think>", "gi");
  s = s.replace(_thinkRe, "");
  s = s.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  s = s.replace(/^(?:think|思考)[：:]\s*/gim, "");
  s = s.replace(
    /^(?:(?:用户(?:询问|问|提到|希望)|让我(?:先)?(?:分析|梳理|整理)|我需要(?:先)?)[^。\n]{0,100}[。\n]\s*)+/m,
    "",
  );
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

/** 表格行拆单元格：| a | b | */
function splitTableCells(row) {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(function (c) {
      return c.trim();
    });
}

function isTableSeparatorRow(line) {
  var t = (line || "").trim().replace(/\s/g, "");
  return /^\|?[\-:|]+\|?$/.test(t) && t.indexOf("-") >= 0;
}

/**
 * 将 Markdown 渲染为 React（目录链接、锚点、引用、简单表格、遗留的 <details>）
 */
function renderMarkdown(text) {
  if (text == null || typeof text !== "string") return null;
  var raw = text.trim();
  if (!raw) return null;

  var chunks = [];
  var detRe =
    /<details>\s*[\r\n]*\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi;
  var last = 0;
  var m;
  while ((m = detRe.exec(raw)) !== null) {
    if (m.index > last) chunks.push({ t: "md", s: raw.slice(last, m.index) });
    chunks.push({ t: "det", sum: m[1].trim(), body: m[2].trim() });
    last = detRe.lastIndex;
  }
  if (last < raw.length) chunks.push({ t: "md", s: raw.slice(last) });
  if (!chunks.length) chunks.push({ t: "md", s: raw });

  var partKey = 0;
  function nextPartKey() {
    return "mdpart-" + partKey++;
  }
  var children = [];
  for (var ci = 0; ci < chunks.length; ci++) {
    var ch = chunks[ci];
    if (ch.t === "det") {
      children.push(
        React.createElement(
          "details",
          {
            key: nextPartKey(),
            className:
              "my-4 overflow-hidden rounded-2xl border border-white/12 bg-slate-950/36 shadow-sm",
          },
          React.createElement(
            "summary",
            {
            className:
                "cursor-pointer select-none px-4 py-3 font-semibold text-slate-50 bg-white/[0.06] hover:bg-white/[0.10] list-none",
            },
            ch.sum,
          ),
          React.createElement(
            "div",
            { className: "border-t border-white/10 px-4 py-4 text-slate-300" },
            renderMarkdown(ch.body),
          ),
        ),
      );
      continue;
    }
    var innerNodes = renderMarkdownPlain(ch.s);
    if (innerNodes && innerNodes.length) {
      for (var ni = 0; ni < innerNodes.length; ni++) {
        children.push(
          React.cloneElement(innerNodes[ni], { key: nextPartKey() }),
        );
      }
    }
  }
  return React.createElement(
    "div",
    { className: "report-markdown space-y-0" },
    children,
  );
}

function renderMarkdownPlain(raw) {
  var lines = raw.split(/\r?\n/);
  var out = [];
  var key = 0;
  function nextKey() {
    return "md-" + key++;
  }
  function parseInline(line) {
    var segs = [];
    var rest = String(line);
    /** 防止 * / ** 未闭合时 indexOf 为 0 且 slice(0) 不前进导致死循环卡死浏览器 */
    var guard = 0;
    var maxGuard = Math.max(5000, rest.length * 4);
    while (rest.length) {
      if (++guard > maxGuard) {
        segs.push(rest);
        break;
      }
      var mlink = /^\[([^\]]*)\]\(([^)]+)\)/.exec(rest);
      if (mlink) {
        var lab = mlink[1];
        var href = (mlink[2] || "").trim();
        if (/^#/.test(href)) {
          var id = href.slice(1);
          try {
            id = decodeURIComponent(id);
          } catch (_) {}
          segs.push(
            React.createElement(
              "a",
              {
                key: nextKey(),
                href: href,
                className:
                  "cursor-pointer text-cyan-300 underline underline-offset-2 hover:text-cyan-100",
                onClick: function (e) {
                  e.preventDefault();
                  scrollToReportAnchor(id);
                },
              },
              lab || id,
            ),
          );
        } else if (/^https?:\/\//i.test(href)) {
          segs.push(
            React.createElement(
              "a",
              {
                key: nextKey(),
                href: href,
                target: "_blank",
                rel: "noopener noreferrer",
                className: "text-cyan-300 hover:text-cyan-100 hover:underline",
              },
              lab || href,
            ),
          );
        } else {
          segs.push(mlink[0]);
        }
        rest = rest.slice(mlink[0].length);
        continue;
      }
      var bold = /^\*\*([^*]+)\*\*/.exec(rest);
      if (bold) {
        segs.push(
          React.createElement(
            "strong",
            { key: nextKey(), className: "font-semibold text-slate-50" },
            bold[1],
          ),
        );
        rest = rest.slice(bold[0].length);
        continue;
      }
      var single = /^\*([^*]+)\*/.exec(rest);
      if (single) {
        segs.push(
          React.createElement(
            "em",
            { key: nextKey(), className: "text-sky-100" },
            single[1],
          ),
        );
        rest = rest.slice(single[0].length);
        continue;
      }
      var num =
        /^(\+?-?\d+\.?\d*%?|[一二三四五六七八九十百千万\d]+[%倍元]?)/.exec(
          rest,
        );
      if (num) {
        segs.push(
          React.createElement(
            "span",
            { key: nextKey(), className: "text-cyan-300 font-semibold" },
            num[1],
          ),
        );
        rest = rest.slice(num[0].length);
        continue;
      }
      var idx = rest.indexOf("**");
      if (idx === -1) idx = rest.indexOf("*");
      if (idx === -1)
        idx = rest.search(
          /[+-]?\d+\.?\d*%?|[一二三四五六七八九十百千万\d]+[%倍元]/,
        );
      if (idx < 0) {
        segs.push(rest);
        rest = "";
      } else if (idx === 0) {
        segs.push(rest.charAt(0));
        rest = rest.slice(1);
      } else {
        segs.push(rest.slice(0, idx));
        rest = rest.slice(idx);
      }
    }
    return segs.length === 1
      ? segs[0]
      : React.createElement(React.Fragment, null, segs);
  }
  var inList = false;
  var listItems = [];
  function flushList() {
    if (listItems.length) {
      var copy = listItems.slice();
      listItems = [];
      out.push(
        React.createElement(
          "ul",
          {
            key: nextKey(),
            className: "my-3 list-disc space-y-1.5 pl-6 text-slate-300",
          },
          copy.map(function (li) {
            return React.createElement(
              "li",
              { key: nextKey() },
              parseInline(li),
            );
          }),
        ),
      );
    }
    inList = false;
  }

  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    var trimmed = line.trim();
    var spanM = /^<span\s+id=(["'])([^"']+)\1[^>]*>\s*<\/span>\s*$/i.exec(
      trimmed,
    );
    if (spanM) {
      flushList();
      out.push(
        React.createElement("span", {
          key: nextKey(),
          id: spanM[2],
          className: "block h-0 scroll-mt-32",
          "aria-hidden": true,
        }),
      );
      i++;
      continue;
    }
    if (/^##\s+/.test(line)) {
      flushList();
      out.push(
        React.createElement(
          "h2",
          {
            key: nextKey(),
            className:
              "mt-7 mb-3 scroll-mt-20 border-b border-white/10 pb-2 text-xl font-black text-slate-50",
          },
          trimmed.replace(/^##\s+/, ""),
        ),
      );
      i++;
      continue;
    }
    if (/^###\s+/.test(line)) {
      flushList();
      out.push(
        React.createElement(
          "h3",
          {
            key: nextKey(),
            className:
              "mt-5 mb-2 scroll-mt-20 text-lg font-bold text-sky-100",
          },
          trimmed.replace(/^###\s+/, ""),
        ),
      );
      i++;
      continue;
    }
    if (/^---+$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      flushList();
      out.push(
        React.createElement("hr", {
          key: nextKey(),
          className: "my-5 border-white/12",
        }),
      );
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushList();
      out.push(
        React.createElement(
          "blockquote",
          {
            key: nextKey(),
            className:
              "my-4 rounded-r-xl border-l-4 border-cyan-300 bg-cyan-400/10 py-3 pl-4 pr-3 text-slate-200",
          },
          parseInline(trimmed.replace(/^>\s?/, "")),
        ),
      );
      i++;
      continue;
    }
    if (/^\|/.test(trimmed) && trimmed.indexOf("|", 1) >= 0) {
      var nextL = i + 1 < lines.length ? lines[i + 1].trim() : "";
      if (nextL && isTableSeparatorRow(nextL)) {
        flushList();
        var headerCells = splitTableCells(trimmed);
        i += 2;
        var body = [];
        while (i < lines.length) {
          var tl = lines[i].trim();
          if (!/^\|/.test(tl) || tl.indexOf("|", 1) < 0) break;
          if (isTableSeparatorRow(tl)) {
            i++;
            continue;
          }
          body.push(splitTableCells(tl));
          i++;
        }
        out.push(
          React.createElement(
            "div",
            { key: nextKey(), className: "my-3 overflow-x-auto" },
            React.createElement(
              "table",
              {
                className:
                  "min-w-full overflow-hidden rounded-xl border border-white/12 text-sm",
              },
              React.createElement(
                "thead",
                { className: "bg-slate-800/80" },
                React.createElement(
                  "tr",
                  null,
                  headerCells.map(function (h, hi) {
                    return React.createElement(
                      "th",
                      {
                        key: nextKey(),
                        className:
                          "border-b border-white/12 px-3 py-2 text-left font-semibold text-sky-100",
                      },
                      parseInline(h),
                    );
                  }),
                ),
              ),
              React.createElement(
                "tbody",
                null,
                body.map(function (row) {
                  return React.createElement(
                    "tr",
                    { key: nextKey(), className: "border-b border-white/[0.08]" },
                    row.map(function (cell) {
                      return React.createElement(
                        "td",
                        {
                          key: nextKey(),
                          className: "px-3 py-2 align-top text-slate-300",
                        },
                        parseInline(cell),
                      );
                    }),
                  );
                }),
              ),
            ),
          ),
        );
        continue;
      }
    }
    if (/^[-*•]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      inList = true;
      listItems.push(
        trimmed.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, ""),
      );
      i++;
      continue;
    }
    if (trimmed) {
      flushList();
      out.push(
        React.createElement(
          "p",
          { key: nextKey(), className: "my-2.5 leading-relaxed text-slate-300" },
          parseInline(trimmed),
        ),
      );
    } else {
      flushList();
    }
    i++;
  }
  flushList();
  return out;
}
const REPORT_FETCH_TIMEOUT_MS = 15000; // 加载报告 15 秒

function fetchWithTimeout(url, options, timeoutMs) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  return fetch(url, { ...options, signal: c.signal }).finally(() =>
    clearTimeout(t),
  );
}

function fetchWithTimeoutNoAbort(url, options, timeoutMs) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("请求超时，请检查网络或后端是否启动")),
        timeoutMs,
      ),
    ),
  ]);
}

/** 分析完成时广播（同步直出结果时未写入 job_id，analysis-notify 轮询收不到；其它页也可监听） */
function dispatchStockAnalysisComplete(detail) {
  try {
    window.dispatchEvent(
      new CustomEvent("stock-analysis-complete", { detail: detail || {} }),
    );
  } catch (_) {}
}

function AnalysisApp() {
  const [apiBase, setApiBase] = React.useState(function () {
    try {
      var injected = (window.ANALYSIS_API_BASE || "").trim().replace(/\/+$/, "");
      if (injected) return injected;
      var saved = (localStorage.getItem("analysis_api_base") || "").trim().replace(
        /\/+$/,
        "",
      );
      /* 线上站点勿沿用本地开发时写入的 localhost，否则会 404 或混合内容失败 */
      var onDeployed =
        typeof location !== "undefined" &&
        location.hostname !== "localhost" &&
        location.hostname !== "127.0.0.1";
      if (
        saved &&
        onDeployed &&
        /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(saved)
      ) {
        saved = "";
        try {
          localStorage.removeItem("analysis_api_base");
        } catch (_) {}
      }
      if (saved) return saved;
    } catch (_) {}
    return API_BASE_FALLBACK;
  });

  React.useEffect(function () {
    if (window.ANALYSIS_API_BASE) return;
    var h = window.location.hostname;
    if (h !== "localhost" && h !== "127.0.0.1") return;
    var cancelled = false;
    var ports = [8123, 8124, 8125];
    (async function () {
      for (var i = 0; i < ports.length; i++) {
        var p = ports[i];
        try {
          var r = await fetch("http://localhost:" + p + "/api/health", {
            method: "GET",
          });
          if (r.ok && !cancelled) {
            var u = "http://localhost:" + p;
            setApiBase(u);
            try {
              localStorage.setItem("analysis_api_base", u);
            } catch (_) {}
            return;
          }
        } catch (_) {}
      }
    })();
    return function () {
      cancelled = true;
    };
  }, []);

  const [form, setForm] = React.useState(function () {
    var p = new URLSearchParams(window.location.search);
    var market = p.get("market") || "A股";
    if (market !== "港股" && market !== "美股") market = "A股";
    return {
      stock_code: p.get("code") || "",
      market: market,
      days: 90,
      user_data_notes: p.get("name") || "",
      use_mock: false,
    };
  });
  const formRef = React.useRef(form);
  React.useEffect(function () {
    formRef.current = form;
  }, [form]);
  const [modelOptions, setModelOptions] = React.useState(FALLBACK_MODEL_OPTIONS);
  const [selectedModelKey, setSelectedModelKey] = React.useState(function () {
    try {
      return normalizeModelKey(localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL_KEY);
    } catch (_) {
      return DEFAULT_MODEL_KEY;
    }
  });
  React.useEffect(function () {
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, selectedModelKey);
    } catch (_) {}
  }, [selectedModelKey]);
  React.useEffect(function () {
    if (!apiBase) return;
    fetch(apiBase + "/api/llm/meta")
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (d && Array.isArray(d.models) && d.models.length) {
          setModelOptions(d.models);
        }
        if (!localStorage.getItem(MODEL_STORAGE_KEY) && d && d.default_model_key) {
          setSelectedModelKey(normalizeModelKey(d.default_model_key));
        }
      })
      .catch(function () {});
  }, [apiBase]);
  React.useEffect(
    function () {
      if (!apiBase || typeof window.fetchCronRefreshStatus !== "function") return;
      var cancelled = false;
      function load() {
        window
          .fetchCronRefreshStatus(apiBase)
          .then(function (data) {
            if (!cancelled && data) setCronRefresh(data);
          })
          .catch(function () {});
      }
      load();
      var timer = setInterval(load, 5 * 60 * 1000);
      return function () {
        cancelled = true;
        clearInterval(timer);
      };
    },
    [apiBase],
  );
  const [jobId, setJobId] = React.useState(() => {
    try {
      var stored = localStorage.getItem(JOB_STORAGE_KEY) || "";
      var storedV = localStorage.getItem(JOB_STORAGE_VERSION_KEY) || "";
      if (!stored) return "";
      if (FRONTEND_VERSION) {
        if (storedV !== FRONTEND_VERSION) {
          try {
            localStorage.removeItem(JOB_STORAGE_KEY);
          } catch (_) {}
          return "";
        }
      } else {
        // 如果前端版本未注入，保守起见也要求本地有匹配版本
        if (storedV) {
          // no-op
        } else {
          try {
            localStorage.removeItem(JOB_STORAGE_KEY);
          } catch (_) {}
          return "";
        }
      }
      return stored;
    } catch (_) {
      return "";
    }
  });
  /** POST /api/analyze 进行中（含 Vercel 同步分析可能数分钟），避免界面像「点了没反应」 */
  const [analysisSubmitting, setAnalysisSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [report, setReport] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState("summary");
  const [historyList, setHistoryList] = React.useState([]);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [selectedStockCode, setSelectedStockCode] = React.useState("");
  /** 历史报告分页（多出的条目翻页查看） */
  const [historyPage, setHistoryPage] = React.useState(1);
  const [showUsageModal, setShowUsageModal] = React.useState(false);
  const [apiUsage, setApiUsage] = React.useState({ apis: [], loading: false });

  /** Intellectia 选股器 / 股票预测快照 */
  const [predList, setPredList] = React.useState([]);
  const [predListLoading, setPredListLoading] = React.useState(true);
  const [predBullDetail, setPredBullDetail] = React.useState(null);
  const [predBearDetail, setPredBearDetail] = React.useState(null);
  const [predFetchLoading, setPredFetchLoading] = React.useState(false);
  const [predError, setPredError] = React.useState("");
  const [predWatchlist, setPredWatchlist] = React.useState(function () {
    try {
      return window.loadWatchlist ? window.loadWatchlist() : [];
    } catch (_) {
      return [];
    }
  });
  const [predParams, setPredParams] = React.useState({
    period_type: 0,
    trend_type: 0,
    symbol_type: 0,
    page: 1,
    size: PRED_TABLE_VISIBLE_ROWS,
  });
  /** 最近一次拉取或当前快照对应的接口 total，用于禁用「下一页」 */
  const [predRemoteTotal, setPredRemoteTotal] = React.useState(null);
  /** 日/周/月 Tab：0 日 1 周 2 月 */
  const [predPeriodTab, setPredPeriodTab] = React.useState(0);
  /** 当前选中的预测快照日期（保存日 YYYY-MM-DD，用于切换不同批次） */
  const [selectedPredDateKey, setSelectedPredDateKey] = React.useState(null);
  /** 日历弹层：查看/切换更早的预测日期 */
  const [showPredCalendar, setShowPredCalendar] = React.useState(false);
  /** 定时刷新状态（行情 / 预测上次自动刷新时间） */
  const [cronRefresh, setCronRefresh] = React.useState(null);
  const predPeriodTabRef = React.useRef(0);
  React.useEffect(() => {
    predPeriodTabRef.current = predPeriodTab;
  }, [predPeriodTab]);

  const isPredRowWatched = React.useCallback(
    function (row) {
      if (!row || !row.symbol) return false;
      var resolved = resolvePredRowMarket(row);
      var key = predWatchlistKey(resolved.symbol, resolved.market);
      return (predWatchlist || []).some(function (w) {
        if (!w || !w.symbol) return false;
        return predWatchlistKey(w.symbol, w.market) === key;
      });
    },
    [predWatchlist],
  );

  React.useEffect(function () {
    function applyWorkbenchContext() {
      if (!window.GuxiaomiChat) return false;
      if (report && window.GuxiaomiChatDiagnosis) {
        var ctx = window.GuxiaomiChatDiagnosis.buildDiagnosisContext({
          page: "analysis",
          source: "analysis-report",
          diagnosisMode: "report",
          sourceLabel: "当前报告",
          scopeSuffix: report.base_name || "current",
          code: report.stock_code,
          market: report.market,
          report: report,
          notes: form.user_data_notes || "",
        });
        window.GuxiaomiChat.setContext(ctx);
        return true;
      }
      window.GuxiaomiChat.setContext({
        page: "analysis",
        scopeKey: "analysis|workbench",
        title: "股票分析工作台",
        stock: null,
        report: null,
        focus: null,
      });
      return true;
    }
    if (!applyWorkbenchContext()) {
      var tries = 0;
      var timer = window.setInterval(function () {
        tries += 1;
        if (applyWorkbenchContext() || tries > 60) window.clearInterval(timer);
      }, 50);
      return function () {
        window.clearInterval(timer);
      };
    }
  }, [report, form.user_data_notes]);

  const openCurrentReportDiagnosis = React.useCallback(function () {
    if (!report || !window.GuxiaomiChatDiagnosis) return;
    window.GuxiaomiChatDiagnosis.openFromAnalysisReport(report, {
      sourceLabel: "当前报告",
      scopeSuffix: report.base_name || "current",
      notes: form.user_data_notes || "",
    });
  }, [report, form.user_data_notes]);

  const openHistoryReportDiagnosis = React.useCallback(
    async function (item, ev) {
      if (ev) ev.stopPropagation();
      if (!item || !window.GuxiaomiChatDiagnosis) return;
      var body = getCachedReportBody(item.base_name);
      if (!body) {
        try {
          const res = await fetchWithTimeout(
            `${apiBase}/api/reports/get?name=${encodeURIComponent(item.base_name)}`,
            {},
            REPORT_FETCH_TIMEOUT_MS,
          );
          if (res.ok) {
            body = await res.json();
            try {
              cacheReportBody(body.base_name || item.base_name, body);
            } catch (_) {}
          }
        } catch (_) {}
      }
      if (!body) {
        alert("请先点击报告标题加载完整内容，再使用 AI 诊断。");
        return;
      }
      window.GuxiaomiChatDiagnosis.openFromAnalysisReport(body, {
        sourceLabel: "历史报告",
        scopeSuffix: item.base_name,
      });
    },
    [apiBase],
  );

  const getStockTagClass = (code) => {
    const palette = [
      "bg-slate-200/55 text-slate-800 border border-white/50 hover:bg-slate-300/50",
      "bg-slate-300/40 text-slate-800 border border-white/50 hover:bg-slate-300/60",
      "bg-sky-100/55 text-sky-950 border border-sky-200/60 hover:bg-sky-100/85",
      "bg-cyan-100/45 text-cyan-900 border border-white/50 hover:bg-cyan-100/75",
      "bg-emerald-100/45 text-emerald-900 border border-white/50 hover:bg-emerald-100/75",
      "bg-teal-100/45 text-teal-900 border border-white/50 hover:bg-teal-100/75",
    ];
    const hash = [...code].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const pick = palette[hash % palette.length];
    return `${selectedStockCode === code ? "bg-blue-600 text-white border-blue-500" : pick} btn btn-sm`;
  };

  // 放弃当前任务（停止轮询、清除 job_id，可重新发起分析）
  const stopAnalysis = () => {
    setJobId("");
    setAnalysisSubmitting(false);
    setError("");
    try {
      localStorage.removeItem(JOB_STORAGE_KEY);
      localStorage.removeItem(JOB_STORAGE_VERSION_KEY);
    } catch (_) {}
  };

  /** 与 jobId state 同步，供可见性/缓存恢复时轮询（避免闭包读到旧 id） */
  const jobIdRef = React.useRef(jobId);
  React.useEffect(function () {
    jobIdRef.current = jobId;
  }, [jobId]);
  /** 连续 404 计数（多实例/切页时轮询可能短暂失败，用 ref 跨次轮询累计） */
  const analyzeStatus404Ref = React.useRef(0);

  /** 拉取服务端列表并与 localStorage 合并；勿依赖 report，避免点开报告时整表重拉被空列表覆盖 */
  const refreshHistoryList = React.useCallback(
    async function (opts) {
      var initial = opts && opts.initial;
      if (initial) setHistoryLoading(true);
      try {
        var cached = loadHistoryListCache();
        var res = await fetch(`${apiBase}/api/reports/list`);
        var data = await res.json().catch(function () {
          return {};
        });
        var serverItems =
          data.ok && Array.isArray(data.items) ? data.items : [];
        var merged = mergeHistoryListItems(serverItems, cached);
        merged = filterOutDeletedReportItems(merged);
        merged = merged.map(enrichHistoryListItem);
        saveHistoryListCache(merged);
        setHistoryList(merged);
      } catch (_) {
        var fallback = filterOutDeletedReportItems(loadHistoryListCache()).map(
          enrichHistoryListItem,
        );
        setHistoryList(fallback);
      } finally {
        if (initial) setHistoryLoading(false);
      }
    },
    [apiBase],
  );

  React.useEffect(
    function () {
      refreshHistoryList({ initial: true });
    },
    [apiBase, refreshHistoryList],
  );

  /** 单次查询分析任务状态（后台线程/同步跑完后写入 _jobs；与页面是否在前台无关） */
  const pollAnalyzeJobOnce = React.useCallback(
    async function () {
      var jid = jobIdRef.current;
      if (!jid) return;
      var isLocal =
        (apiBase || "").indexOf("localhost") >= 0 ||
        (apiBase || "").indexOf("127.0.0.1") >= 0;
      var max404BeforeClear = isLocal ? 15 : 4;
      try {
        const res = await fetch(`${apiBase}/api/analyze/status/${jid}`);
        if (res.status === 404) {
          analyzeStatus404Ref.current++;
          if (analyzeStatus404Ref.current >= max404BeforeClear) {
            analyzeStatus404Ref.current = 0;
            setJobId("");
            try {
              localStorage.removeItem(JOB_STORAGE_KEY);
              localStorage.removeItem(JOB_STORAGE_VERSION_KEY);
            } catch (_) {}
            if (!isLocal) {
              setError(
                "云端未找到该分析任务（Vercel 轮询可能打到另一台实例）。请重新点击「开始分析」；推荐已部署「POST 同步返回结果」的后端，无需轮询。",
              );
            }
          }
          return;
        }
        analyzeStatus404Ref.current = 0;
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "done" && data.result) {
          setReport(data.result);
          setActiveTab("summary");
          setJobId("");
          try {
            localStorage.removeItem(JOB_STORAGE_KEY);
            localStorage.removeItem(JOB_STORAGE_VERSION_KEY);
          } catch (_) {}
          try {
            cacheReportBody(data.result.base_name, data.result);
            var mergedDone = upsertHistoryFromPayload(data.result);
            if (mergedDone) setHistoryList(mergedDone);
          } catch (_) {}
          void refreshHistoryList();
          dispatchStockAnalysisComplete({
            success: true,
            base_name: data.result.base_name,
            分析主题: data.result.分析主题,
          });
        } else if (data.status === "failed") {
          setError(data.error || "分析失败");
          setJobId("");
          try {
            localStorage.removeItem(JOB_STORAGE_KEY);
            localStorage.removeItem(JOB_STORAGE_VERSION_KEY);
          } catch (_) {}
        }
      } catch (_) {}
    },
    [apiBase, refreshHistoryList],
  );

  // 有 job_id 时定时轮询；切走标签页/别的页面后回来时立刻补一轮（后台分析不会停，只是前端曾暂停问进度）
  React.useEffect(() => {
    if (!jobId) return;
    analyzeStatus404Ref.current = 0;
    void pollAnalyzeJobOnce();
    const timer = setInterval(function () {
      void pollAnalyzeJobOnce();
    }, POLL_INTERVAL_MS);
    var onVisible = function () {
      if (document.visibilityState === "visible") void pollAnalyzeJobOnce();
    };
    var onPageShow = function (e) {
      if (e && e.persisted) void pollAnalyzeJobOnce();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return function () {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [jobId, pollAnalyzeJobOnce]);

  const loadPredList = React.useCallback(async (opts) => {
    var initial = opts && opts.initial;
    if (initial) setPredListLoading(true);
    var items = [];
    try {
      var cached = loadScreenerListCache();
      const res = await fetch(`${apiBase}/api/screener/list`);
      const data = await res.json().catch(function () {
        return {};
      });
      var serverItems =
        data.ok && Array.isArray(data.items) ? data.items : [];
      var merged = mergeScreenerListItems(serverItems, cached);
      merged = filterOutDeletedScreenerItems(merged);
      saveScreenerListCache(merged);
      items = merged;
      setPredList(merged);
    } catch (_) {
      var fallback = filterOutDeletedScreenerItems(loadScreenerListCache());
      items = fallback;
      setPredList(fallback);
    } finally {
      if (initial) setPredListLoading(false);
    }
    return items;
  }, [apiBase]);

  React.useEffect(() => {
    loadPredList({ initial: true });
  }, [loadPredList]);

  const applyScreenerDetailPayload = React.useCallback(function (j, trendType) {
    if (!j || !j.base_name) return;
    var tt = trendType != null ? Number(trendType) : null;
    if (tt === 0) setPredBullDetail(j);
    else if (tt === 1) setPredBearDetail(j);
    else {
      // 未指定趋势时按当前选择回写（兼容旧缓存）
      if (predParams.trend_type === 1) setPredBearDetail(j);
      else setPredBullDetail(j);
    }
    var pt =
      j.period_type != null && !Number.isNaN(Number(j.period_type))
        ? Math.min(2, Math.max(0, parseInt(String(j.period_type), 10)))
        : null;
    if (pt != null) setPredPeriodTab(pt);
    setPredParams(function (p) {
      var next = { ...p };
      if (pt != null) next.period_type = pt;
      if (j.page != null && !Number.isNaN(Number(j.page))) {
        next.page = Math.max(1, parseInt(String(j.page), 10) || 1);
      }
      if (j.page_size != null && !Number.isNaN(Number(j.page_size))) {
        next.size = Math.min(
          10,
          Math.max(1, parseInt(String(j.page_size), 10) || PRED_TABLE_VISIBLE_ROWS),
        );
      }
      return next;
    });
    var tot =
      j.data && j.data.total != null && j.data.total !== ""
        ? Number(j.data.total)
        : null;
    setPredRemoteTotal(tot != null && !Number.isNaN(tot) ? tot : null);
  }, [predParams.trend_type]);

  const loadScreenerDetail = async (baseName, trendType) => {
    setPredError("");
    var tt = trendType != null ? Number(trendType) : null;
    if (!baseName) {
      if (tt === 0) setPredBullDetail(null);
      else if (tt === 1) setPredBearDetail(null);
      else {
        setPredBullDetail(null);
        setPredBearDetail(null);
      }
      return;
    }
    var cached = getCachedScreenerBody(baseName);
    if (cached && cached.base_name) {
      applyScreenerDetailPayload(cached, tt);
    }
    try {
      const res = await fetch(
        `${apiBase}/api/screener/get?name=${encodeURIComponent(baseName)}`,
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (cached && cached.base_name) {
          setPredError("");
          return;
        }
        const d = j.detail;
        throw new Error(
          typeof d === "string" ? d : d ? JSON.stringify(d) : "加载失败",
        );
      }
      applyScreenerDetailPayload(j, tt);
      cacheScreenerBody(baseName, j);
    } catch (e) {
      if (cached && cached.base_name) {
        setPredError("");
        return;
      }
      setPredError(e.message || "加载预测快照失败");
      if (tt === 0) setPredBullDetail(null);
      else if (tt === 1) setPredBearDetail(null);
      else {
        setPredBullDetail(null);
        setPredBearDetail(null);
      }
    }
  };

  const fetchScreener = async () => {
    setPredError("");
    setPredFetchLoading(true);
    try {
      // 同时获取看涨（0）与看跌（1）两个趋势，用于下方分表展示
      await Promise.all(
        [0, 1].map(async function (tt) {
          for (var pi = 0; pi < 3; pi++) {
            const res = await fetch(`${apiBase}/api/screener/fetch`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                period_type: pi,
                trend_type: tt,
                symbol_type: predParams.symbol_type,
                page: predParams.page,
                size: predParams.size,
              }),
            });
            await res.json().catch(() => ({}));
            /* 某一周期未取到数据时不提示报错 */
          }
        }),
      );
      var items = await loadPredList();
      var st = predParams.symbol_type;
      var g = groupPredictionsByDateAllTrends(items, st);
      var keys = g.keys;
      var grouped = g.grouped;
      var tk = localDateKey();
      var pickDate =
        keys.indexOf(tk) >= 0 ? tk : keys.length ? keys[0] : null;
      if (pickDate) {
        setSelectedPredDateKey(pickDate);
        var pi0 = predPeriodTabRef.current;
        if (!grouped[pickDate][pi0]) {
          var fq = [0, 1, 2].find(function (p) {
            return grouped[pickDate][p];
          });
          if (fq !== undefined) setPredPeriodTab(fq);
        }
      } else {
        setSelectedPredDateKey(null);
        setPredBullDetail(null);
        setPredBearDetail(null);
        setPredRemoteTotal(null);
      }
      setPredError("");
    } catch (e) {
      setPredError(e.message || "获取预测失败");
    } finally {
      setPredFetchLoading(false);
    }
  };

  const switchPredPeriodTab = (pt) => {
    if (pt === predPeriodTab) return;
    setPredPeriodTab(pt);
    setPredParams(function (p) {
      return { ...p, period_type: pt };
    });
  };

  const predMaxPage = React.useMemo(
    function () {
      var t = predRemoteTotal;
      var s = predParams.size;
      if (t == null || !s || Number.isNaN(Number(t))) return null;
      return Math.max(1, Math.ceil(Number(t) / s));
    },
    [predRemoteTotal, predParams.size],
  );

  const deleteScreenerSnapshot = async (baseName, ev) => {
    if (ev) ev.stopPropagation();
    if (!baseName) return;
    if (!window.confirm("确定删除该条预测快照吗？")) return;
    setPredError("");
    try {
      var res = await fetch(`${apiBase}/api/screener/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: baseName }),
      });
      if (res.status === 404) {
        res = await fetch(
          `${apiBase}/api/screener/delete?name=${encodeURIComponent(baseName)}`,
          { method: "DELETE", headers: { Accept: "application/json" } },
        );
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 404) {
        const d = j.detail;
        throw new Error(typeof d === "string" ? d : "删除失败");
      }
      addDeletedScreenerBaseName(baseName);
      removeCachedScreenerBody(baseName);
      setPredList((prev) => {
        var next = prev.filter((it) => it.base_name !== baseName);
        saveScreenerListCache(next);
        return next;
      });
      if (predBullDetail && predBullDetail.base_name === baseName) setPredBullDetail(null);
      if (predBearDetail && predBearDetail.base_name === baseName) setPredBearDetail(null);
    } catch (e) {
      setPredError(e.message || "删除失败");
    }
  };

  /** 同时汇总看涨/看跌两个方向的日期，避免只展示单方向快照 */
  const { grouped: predGrouped, keys: predDateKeys } = React.useMemo(
    function () {
      return groupPredictionsByDateAllTrends(
        predList,
        predParams.symbol_type,
      );
    },
    [predList, predParams.symbol_type],
  );

  React.useEffect(
    function () {
      if (predDateKeys.length === 0) {
        setSelectedPredDateKey(null);
        return;
      }
      setSelectedPredDateKey(function (prev) {
        if (prev && predDateKeys.indexOf(prev) >= 0) return prev;
        return predDateKeys[0];
      });
    },
    [predDateKeys],
  );

  /** 所有有快照的日期集合，供日历高亮 */
  const predAvailableSet = React.useMemo(
    function () {
      return new Set(predDateKeys);
    },
    [predDateKeys],
  );

  /** 默认只展示近 5 天日期条；当前选中若更早则额外补一枚，其余走日历 */
  const visiblePredDateKeys = React.useMemo(
    function () {
      var top = predDateKeys.slice(0, 5);
      if (selectedPredDateKey && top.indexOf(selectedPredDateKey) < 0) {
        top = top.concat([selectedPredDateKey]);
      }
      return top;
    },
    [predDateKeys, selectedPredDateKey],
  );

  const currentBullSnapshotName = React.useMemo(
    function () {
      if (!selectedPredDateKey) return null;
      return findScreenerSnapshotName(
        predList,
        selectedPredDateKey,
        0,
        predParams.symbol_type,
        predPeriodTab,
        predParams.page,
      );
    },
    [
      predList,
      selectedPredDateKey,
      predParams.symbol_type,
      predParams.page,
      predPeriodTab,
    ],
  );

  const currentBearSnapshotName = React.useMemo(
    function () {
      if (!selectedPredDateKey) return null;
      return findScreenerSnapshotName(
        predList,
        selectedPredDateKey,
        1,
        predParams.symbol_type,
        predPeriodTab,
        predParams.page,
      );
    },
    [
      predList,
      selectedPredDateKey,
      predParams.symbol_type,
      predParams.page,
      predPeriodTab,
    ],
  );

  React.useEffect(
    function () {
      loadScreenerDetail(currentBullSnapshotName, 0);
    },
    [currentBullSnapshotName],
  );

  React.useEffect(
    function () {
      loadScreenerDetail(currentBearSnapshotName, 1);
    },
    [currentBearSnapshotName],
  );

  const stockTags = React.useMemo(() => {
    const codes = new Set();
    historyList.forEach((item) => {
      const row = enrichHistoryListItem(item);
      const norm = normalizeReportStockCode(row.stock_code, row.market);
      if (norm) codes.add(norm);
    });
    return Array.from(codes).sort();
  }, [historyList]);

  const filteredHistoryList = React.useMemo(() => {
    if (!selectedStockCode) return historyList;
    return historyList.filter((item) => {
      const row = enrichHistoryListItem(item);
      const norm = normalizeReportStockCode(row.stock_code, row.market);
      return norm === selectedStockCode;
    });
  }, [historyList, selectedStockCode]);

  React.useEffect(() => {
    setHistoryPage(1);
  }, [selectedStockCode, historyList]);

  const historyTotalPages = Math.max(
    1,
    Math.ceil(filteredHistoryList.length / HISTORY_PAGE_SIZE),
  );
  const historyPageClamped = Math.min(historyPage, historyTotalPages);

  React.useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages);
  }, [historyPage, historyTotalPages]);

  const pagedHistoryList = React.useMemo(
    function () {
      var p = Math.min(historyPage, historyTotalPages);
      var start = (p - 1) * HISTORY_PAGE_SIZE;
      return filteredHistoryList.slice(start, start + HISTORY_PAGE_SIZE);
    },
    [filteredHistoryList, historyPage, historyTotalPages],
  );

  const runAnalysis = async (opts) => {
    const f = (opts && opts.overrideForm) || formRef.current || form;
    if (!f.stock_code.trim()) {
      setError("请输入股票代码");
      return;
    }
    if (analysisSubmitting) return;
    setError("");
    setReport(null);
    setAnalysisSubmitting(true);
    const marketMap = { A股: "A 股", 港股: "港股", 美股: "美股" };
    try {
      var h = typeof location !== "undefined" ? location.hostname || "" : "";
      var isLanOrLocal =
        h === "localhost" ||
        h === "127.0.0.1" ||
        /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) ||
        /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
      /* 公网域名（含 vercel.app）：同步分析可能极久；本机 POST 也应留足余量（询价/网络慢时不应误判超时） */
      var analyzePostTimeoutMs = isLanOrLocal ? 120000 : 360000;
      /** 与「添加股票」同源：在用户网络下拉腾讯/AlphaVantage，随 POST 带给服务端作合并首层（服务端常连不通行情） */
      var clientQuote = null;
      var noteFirstLine = (function (t) {
        if (!t || !String(t).trim()) return "";
        var line = String(t).split(/\r?\n/)[0].trim();
        return line.length > 80 ? line.slice(0, 80) : line;
      })(f.user_data_notes);
      try {
        if (typeof getStockPrice === "function") {
          var stockApiMkt =
            f.market === "港股"
              ? "HK"
              : f.market === "美股"
                ? "US"
                : "CN";
          var pq = await getStockPrice(f.stock_code.trim(), stockApiMkt);
          if (pq && pq.isMock !== true && Number(pq.price) > 0) {
            clientQuote = {
              price: Number(pq.price),
              change_percent:
                pq.changePercent != null && !Number.isNaN(Number(pq.changePercent))
                  ? Number(pq.changePercent)
                  : undefined,
              name: noteFirstLine || undefined,
              is_mock: false,
            };
          }
        }
      } catch (eq) {
        console.warn("分析前浏览器询价失败（将依赖服务端拉数）", eq);
      }
      var analyzeBody = JSON.stringify({
        stock_code: f.stock_code.trim(),
        market: marketMap[f.market] || f.market,
        user_data_notes: f.user_data_notes.trim() || null,
        days: f.days,
        use_mock: f.use_mock,
        client_quote: clientQuote,
        model_key: selectedModelKey,
      });
      var analyzeFetchOpts = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: analyzeBody,
      };
      /* 体积极小时允许 keepalive，降低用户立刻跳转导致 POST 被浏览器中断、拿不到 job_id 的概率（有 64KB 量级限制） */
      if (analyzeBody.length < 55000) analyzeFetchOpts.keepalive = true;
      const res = await fetchWithTimeoutNoAbort(
        `${apiBase}/api/analyze`,
        analyzeFetchOpts,
        analyzePostTimeoutMs,
      );
      if (!res.ok) {
        const t = await res.text();
        if (res.status === 404) {
          setError(
            "分析接口 404：请用 run_web.py 启动后端；若 8123 被占用会用 8124/8125，页面会自动探测，也可在地址栏加 ?api=端口",
          );
          return;
        }
        try {
          const j = JSON.parse(t);
          throw new Error(j.detail || t || res.statusText);
        } catch (parseErr) {
          if (parseErr instanceof SyntaxError)
            throw new Error(t || res.statusText);
          throw parseErr;
        }
      }
      const data = await res.json();
      if (!data.job_id) throw new Error("未返回任务 ID");
      /* Vercel：后端 sync 一次返回结果，避免 Serverless 后台线程 + 跨实例轮询 404 */
      if (data.sync) {
        if (data.status === "done" && data.result) {
          setReport(data.result);
          setActiveTab("summary");
          setJobId("");
          try {
            localStorage.removeItem(JOB_STORAGE_KEY);
            localStorage.removeItem(JOB_STORAGE_VERSION_KEY);
          } catch (_) {}
          try {
            cacheReportBody(data.result.base_name, data.result);
            var mergedSync = upsertHistoryFromPayload(data.result);
            if (mergedSync) setHistoryList(mergedSync);
          } catch (_) {}
          void refreshHistoryList();
          dispatchStockAnalysisComplete({
            success: true,
            base_name: data.result.base_name,
            分析主题: data.result.分析主题,
          });
          return;
        }
        if (data.status === "failed") {
          setError(data.error || "分析失败");
          return;
        }
        if (data.error) {
          setError(data.error);
          return;
        }
        setError(
          "分析未正常完成（状态：" +
            (data.status || "?") +
            "）。请重试或查看 Vercel 函数日志。",
        );
        return;
      }
      setJobId(data.job_id);
      try {
        localStorage.setItem(JOB_STORAGE_KEY, data.job_id);
        localStorage.setItem(
          JOB_STORAGE_VERSION_KEY,
          FRONTEND_VERSION || "",
        );
      } catch (_) {}
    } catch (e) {
      var raw = e.message || String(e) || "提交失败";
      var msg =
        e.name === "AbortError" ||
        (typeof raw === "string" && raw.indexOf("请求超时") >= 0)
          ? "请求超时：云端一次分析可能需数分钟，请在 Vercel → Settings → Functions 调高 Max Duration；本地请确认已运行 python3 run_web.py"
          : raw;
      setError(msg);
    } finally {
      setAnalysisSubmitting(false);
    }
  };

  const loadHistoryReport = async (baseName) => {
    setError("");
    setReport(null);
    try {
      const res = await fetchWithTimeout(
        `${apiBase}/api/reports/get?name=${encodeURIComponent(baseName)}`,
        {},
        REPORT_FETCH_TIMEOUT_MS,
      );
      if (!res.ok) {
        if (res.status === 404) {
          var fromCache = getCachedReportBody(baseName);
          if (fromCache) {
            setReport(fromCache);
            setActiveTab("summary");
            setSelectedStockCode(
              normalizeReportStockCode(
                enrichHistoryListItem({
                  base_name: fromCache.base_name,
                  stock_code: fromCache.stock_code,
                  market: fromCache.market,
                }).stock_code,
                fromCache.market,
              ) || "",
            );
            window.setTimeout(function () {
              var el = document.getElementById("report-reading-panel");
              if (el)
                el.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 80);
            return;
          }
        }
        throw new Error(res.status === 404 ? "报告不存在" : "加载失败");
      }
      const data = await res.json();
      try {
        cacheReportBody(data.base_name || baseName, data);
        var mergedLoad = upsertHistoryFromPayload(data);
        if (mergedLoad) setHistoryList(mergedLoad);
      } catch (_) {}
      setReport(data);
      setActiveTab("summary");
      setSelectedStockCode(
        normalizeReportStockCode(
          enrichHistoryListItem({
            base_name: data.base_name || baseName,
            stock_code: data.stock_code,
            market: data.market,
          }).stock_code,
          data.market,
        ) || "",
      );
      window.setTimeout(function () {
        var el = document.getElementById("report-reading-panel");
        if (el)
          el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch (e) {
      setError(
        e.name === "AbortError"
          ? "加载报告超时，请重试"
          : e.message || "加载报告失败",
      );
    }
  };

  const deleteHistoryReport = async (baseName, ev) => {
    if (ev) ev.stopPropagation();
    if (!baseName) return;
    if (
      !window.confirm(
        "确定删除该条历史报告吗？将同时删除已保存的 JSON / MD / HTML 文件，且不可恢复。",
      )
    ) {
      return;
    }
    setError("");
    try {
      // Vercel 等对 DELETE 常返回 404；改用 POST + JSON，base_name 含中文（如 A股_xxx）更可靠
      var res = await fetch(`${apiBase}/api/reports/delete`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: baseName }),
      });
      if (res.status === 404) {
        res = await fetch(
          `${apiBase}/api/reports/delete?name=${encodeURIComponent(baseName)}`,
          { method: "DELETE", headers: { Accept: "application/json" } },
        );
      }
      const j = await res.json().catch(function () {
        return {};
      });
      // 404：极旧后端或路由缺失；仍从本机列表移除（tombstone）
      if (!res.ok && res.status !== 404) {
        setError(j.detail || "删除失败");
        return;
      }
      addDeletedReportBaseName(baseName);
      removeCachedReportBody(baseName);
      setHistoryList(function (prev) {
        var filtered = filterOutDeletedReportItems(prev).filter(function (it) {
          return it.base_name !== baseName;
        });
        saveHistoryListCache(filtered);
        return filtered;
      });
      if (report && (report.base_name || "") === baseName) {
        setReport(null);
      }
    } catch (e) {
      setError(e.message || "删除失败");
    }
  };

  const deleteAllHistoryReports = async () => {
    if (
      !window.confirm(
        "确定删除全部历史报告吗？将同时删除已保存的 JSON / MD / HTML 文件，且不可恢复。",
      )
    ) {
      return;
    }
    setError("");
    try {
      var itemsToDelete = historyList.slice();
      itemsToDelete.forEach(function (item) {
        if (item && item.base_name) {
          addDeletedReportBaseName(item.base_name);
          removeCachedReportBody(item.base_name);
        }
      });
      setHistoryList([]);
      saveHistoryListCache([]);
      await Promise.allSettled(
        itemsToDelete.map(function (item) {
          if (!item || !item.base_name) return Promise.resolve();
          return fetch(`${apiBase}/api/reports/delete`, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: item.base_name }),
          }).catch(function () {});
        }),
      );
      if (report) {
        setReport(null);
      }
    } catch (e) {
      setError(e.message || "删除全部报告失败");
    }
  };

  const download = (suffix, contentType, content) => {
    const name = report && report.base_name ? report.base_name : `report`;
    const blob = new Blob([content], { type: contentType });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.${suffix}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** 报告标签：毛玻璃底 + 霓虹柔光呼吸下划线（Active） */
  const reportTabs = [
    {
      id: "summary",
      label: "摘要",
      off: "bg-white/10 text-slate-200 border-white/20 hover:bg-white/16",
      on: "bg-sky-400/18 text-slate-50 border-sky-300/45 shadow-[inset_0_-2px_0_rgba(34,211,238,0.85),0_0_28px_rgba(34,211,238,0.22)] ring-2 ring-cyan-300/25",
    },
    {
      id: "report",
      label: "完整报告",
      off: "bg-white/10 text-slate-200 border-white/20 hover:bg-white/16",
      on: "bg-indigo-400/18 text-slate-50 border-indigo-300/45 shadow-[inset_0_-2px_0_rgba(99,102,241,0.85),0_0_28px_rgba(99,102,241,0.22)] ring-2 ring-indigo-300/25",
    },
    {
      id: "analysts",
      label: "分析师观点",
      off: "bg-white/10 text-slate-200 border-white/20 hover:bg-white/16",
      on: "bg-amber-400/18 text-slate-50 border-amber-300/45 shadow-[inset_0_-2px_0_rgba(245,158,11,0.90),0_0_28px_rgba(245,158,11,0.20)] ring-2 ring-amber-300/25",
    },
    {
      id: "debate",
      label: "多空辩论",
      off: "bg-white/10 text-slate-200 border-white/20 hover:bg-white/16",
      on: "bg-rose-400/18 text-slate-50 border-rose-300/45 shadow-[inset_0_-2px_0_rgba(244,63,94,0.85),0_0_28px_rgba(244,63,94,0.20)] ring-2 ring-rose-300/25",
    },
    {
      id: "data",
      label: "数据快照",
      off: "bg-white/10 text-slate-200 border-white/20 hover:bg-white/16",
      on: "bg-teal-400/18 text-slate-50 border-teal-300/45 shadow-[inset_0_-2px_0_rgba(45,212,191,0.85),0_0_28px_rgba(45,212,191,0.20)] ring-2 ring-teal-300/25",
    },
    {
      id: "diff",
      label: "对比与异动",
      off: "bg-white/10 text-slate-200 border-white/20 hover:bg-white/16",
      on: "bg-emerald-400/18 text-slate-50 border-emerald-300/45 shadow-[inset_0_-2px_0_rgba(16,185,129,0.85),0_0_28px_rgba(16,185,129,0.18)] ring-2 ring-emerald-300/25",
    },
  ];

  const exportTabMd =
    "bg-white/10 text-slate-200 border-white/20 hover:bg-white/16";
  const exportTabHtml =
    "bg-white/10 text-slate-200 border-white/20 hover:bg-white/16";
  const reportTabBase =
    "inline-flex items-center justify-center rounded-xl px-3.5 py-2 text-sm md:text-[15px] font-medium border transition-all backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-cyan-200/50";

  const analyzing = !!jobId || analysisSubmitting;

  const fetchApiUsage = async () => {
    setApiUsage(function (prev) {
      return { ...prev, loading: true };
    });
    try {
      const res = await fetch(apiBase + "/api/stock-api-usage");
      const data = await res.json().catch(function () {
        return { ok: false, apis: [] };
      });
      setApiUsage({ apis: data.apis || [], loading: false });
    } catch (e) {
      setApiUsage({ apis: [], loading: false });
    }
  };

  const openUsageModal = function () {
    setShowUsageModal(true);
    if (apiUsage.apis.length === 0 && !apiUsage.loading) fetchApiUsage();
  };

  /** 加入关注列表 */
  const handleAddToWatchlistFromPred = function (row) {
    if (!row || !row.symbol) {
      alert("股票代码无效");
      return;
    }
    if (isPredRowWatched(row)) return;

    var resolved = resolvePredRowMarket(row);
    var stockData = {
      symbol: resolved.symbol,
      market: resolved.market,
      name: row.name || resolved.symbol,
      currentPrice: row.price != null ? Number(row.price) : 0,
      change: row.change_ratio != null ? Number(row.change_ratio) : 0,
      changePercent: row.change_ratio != null ? Number(row.change_ratio) : 0,
    };
    if (window.addToWatchlist) {
      var result = window.addToWatchlist(stockData);
      if (result.success) {
        setPredWatchlist(
          result.watchlist ||
            (window.loadWatchlist ? window.loadWatchlist() : []),
        );
      } else {
        if (result.watchlist) setPredWatchlist(result.watchlist);
        alert(result.message || "该股票已在关注列表中");
      }
    } else {
      alert("关注功能不可用，请确保已正确加载");
    }
  };

  /** 从预测列表直接分析：获取行情后填充表单并触发分析 */
  const handleAnalyzeFromPred = async function (row) {
    if (!row || !row.symbol) {
      alert('股票代码无效');
      return;
    }
    if (analysisSubmitting) return;

    var symbol = String(row.symbol || '').trim().toUpperCase();
    var code = String(row.code || '').trim();
    var name = String(row.name || '').trim();

    // 判断市场：优先根据 symbol / code 规则，兜底美股
    var market = '美股';
    if (/^\d{6}$/.test(symbol) || /^\d{6}$/.test(code) || /^(0|3|6)\d{5}$/.test(code)) {
      market = 'A股';
    } else if (/^\d{5}$/.test(symbol) || /^\d{5}$/.test(code) || /^HK/i.test(code)) {
      market = '港股';
    }

    // 回到分析工作台并预填表单
    scrollToAnalysisWorkbench();
    var nextForm = {
      ...form,
      stock_code: symbol,
      market: market,
      user_data_notes: name || "",
    };
    setForm(nextForm);

    // 拉取行情 + 技术指标，拼入备注后再自动分析
    setPredFetchLoading(true);
    try {
      var stockApiMkt = market === "港股" ? "HK" : market === "美股" ? "US" : "CN";
      var priceData = null;
      var indicators = null;
      if (typeof getStockPrice === "function") {
        priceData = await getStockPrice(symbol, stockApiMkt);
      }
      if (typeof getHistoricalDataAndIndicators === "function") {
        try {
          indicators = await getHistoricalDataAndIndicators(symbol, stockApiMkt);
        } catch (indErr) {
          console.warn("预测列表分析前技术指标失败:", indErr);
        }
      }
      nextForm = {
        ...nextForm,
        user_data_notes: buildStockAnalysisNotes({
          symbol: symbol,
          name: name,
          market: market,
          predRow: row,
          quote: priceData,
          indicators: indicators,
        }),
      };
      setForm(nextForm);
    } catch (err) {
      console.warn("预测列表分析前询价失败:", err);
      nextForm = {
        ...nextForm,
        user_data_notes: buildStockAnalysisNotes({
          symbol: symbol,
          name: name,
          market: market,
          predRow: row,
        }),
      };
      setForm(nextForm);
      alert("未能获取完整行情，将使用已有信息与服务器数据继续分析");
    } finally {
      setPredFetchLoading(false);
    }
    runAnalysis({ overrideForm: nextForm });
  };

  /** 从报告区回到上方：分析表单 / 历史 / 预测 */
  const scrollToAnalysisWorkbench = React.useCallback(function () {
    var el = document.getElementById("analysis-workbench");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  /** 渲染看涨/看跌单张预测表 */
  function renderPredictionTable(detail, title, titleClass) {
    if (
      !detail ||
      (detail.period_type != null &&
        Number(detail.period_type) !== predPeriodTab)
    ) {
      return null;
    }
    var rows = (detail.data && detail.data.list) || [];
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/12 bg-slate-950/22">
        <div className={`shrink-0 px-2.5 py-1.5 text-xs font-semibold border-b border-white/8 ${titleClass}`}>
          {title}
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto overflow-x-auto"
          style={{ minHeight: PRED_TABLE_BODY_MIN_HEIGHT }}
        >
          <table className="w-full text-xs md:text-sm">
            <thead className="sticky top-0 bg-slate-950/95 text-left text-slate-300 backdrop-blur-md">
              <tr>
                <th className="p-1.5 font-medium">代码</th>
                <th className="p-1.5 font-medium">标的</th>
                <th className="p-1.5 font-medium">名称</th>
                <th className="p-1.5 font-medium">价格</th>
                <th className="p-1.5 font-medium">涨跌%</th>
                <th className="p-1.5 font-medium">概率</th>
                <th className="p-1.5 font-medium">profit</th>
                <th className="p-1.5 font-medium">操作</th>
                <th className="p-1.5 font-medium">分析</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr
                  key={ri}
                  className="border-t border-white/8 text-slate-200 hover:bg-white/[0.06]"
                >
                  <td className="p-1.5 font-mono text-[11px] text-slate-300 md:text-xs">
                    {row.code || "—"}
                  </td>
                  <td className="p-1.5 font-semibold text-slate-50">{row.symbol || "—"}</td>
                  <td className="max-w-[200px] truncate p-1.5 text-slate-300" title={row.name}>
                    {row.name || "—"}
                  </td>
                  <td className="gx-num p-1.5 tabular-nums text-amber-100">{row.price != null ? row.price : "—"}</td>
                  <td className="gx-num p-1.5 tabular-nums text-slate-200">
                    {row.change_ratio != null ? row.change_ratio : "—"}
                  </td>
                  <td className="gx-num p-1.5 tabular-nums text-cyan-200">
                    {row.probability != null ? row.probability : "—"}
                  </td>
                  <td className="gx-num p-1.5 tabular-nums text-emerald-200">
                    {row.profit != null ? row.profit : "—"}
                  </td>
                  <td className="p-1.5">
                    {isPredRowWatched(row) ? (
                      <span
                        className="btn btn-sm shrink-0 border border-emerald-400/30 bg-emerald-500/15 font-semibold text-emerald-200 min-w-[3.5rem]"
                        title="已在关注列表"
                      >
                        已关注
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddToWatchlistFromPred(row)}
                        className="btn btn-sm bg-cyan-500 text-white hover:bg-cyan-600 border-0 shrink-0 min-w-[3.5rem]"
                        title="加入关注列表"
                      >
                        +关注
                      </button>
                    )}
                  </td>
                  <td className="p-1.5">
                    <button
                      type="button"
                      onClick={() => handleAnalyzeFromPred(row)}
                      disabled={analyzing || predFetchLoading}
                      className="btn btn-sm bg-emerald-500 text-white hover:bg-emerald-600 border-0 shrink-0 min-w-[3.5rem] disabled:opacity-50"
                      title="获取股票信息并生成分析报告"
                    >
                      分析
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="p-4 text-sm text-slate-400">本快照无列表数据</p>
          )}
        </div>
        {detail.intellectia_ret != null &&
          detail.intellectia_ret !== 0 && (
            <p className="border-t border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
              API ret={String(detail.intellectia_ret)}{" "}
              {detail.intellectia_msg
                ? `· ${detail.intellectia_msg}`
                : ""}
            </p>
          )}
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-none mx-auto">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/72 backdrop-blur-xl shadow-lg shadow-slate-950/25">
        <div className="mx-auto flex max-w-none items-center gap-2 px-3 py-2 md:px-6">
          <a href="index.html" className="flex min-w-0 items-center gap-2">
            <img
              src="images/logo.png"
              alt="股小蜜 Logo"
              className="h-8 w-8 shrink-0 rounded-full object-contain bg-transparent md:h-9 md:w-9"
            />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                股小蜜
              </p>
              <h1 className="truncate font-display text-base font-bold text-slate-50 md:text-lg">
                股票分析
              </h1>
            </div>
          </a>
          <div className="ml-auto flex items-center gap-1 overflow-x-auto">
            <a href="index.html" className="btn btn-secondary nav-chip gap-1 shrink-0">
              <div className="icon-home"></div>
              <span>首页</span>
            </a>
            <a href={withCurrentSource("ziwei.html")} className="btn btn-secondary nav-chip gap-1 shrink-0">
              <div className="icon-sparkles"></div>
              <span>排盘</span>
            </a>
            <a href={withCurrentSource("news.html")} className="btn btn-secondary nav-chip gap-1 shrink-0">
              <div className="icon-newspaper"></div>
              <span>新闻</span>
            </a>
            <button type="button" onClick={goBackToSource} className="btn btn-secondary nav-chip gap-1 shrink-0">
              <div className="icon-arrow-left"></div>
              <span>返回</span>
            </button>
          </div>
        </div>
      </header>
      {showUsageModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={function () {
            setShowUsageModal(false);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden"
            onClick={function (e) {
              e.stopPropagation();
            }}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                股票接口 · 当天调用次数与限额
              </h2>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700"
                onClick={function () {
                  setShowUsageModal(false);
                }}
              >
                ×
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {apiUsage.loading && (
                <p className="text-gray-500 text-sm">加载中…</p>
              )}
              {!apiUsage.loading && apiUsage.apis.length === 0 && (
                <p className="text-gray-500 text-sm">暂无数据</p>
              )}
              {!apiUsage.loading && apiUsage.apis.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-2">接口</th>
                      <th className="text-left py-2 pr-2">每日限额</th>
                      <th className="text-left py-2 pr-2">已用/剩余</th>
                      <th className="text-left py-2">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiUsage.apis.map(function (api, i) {
                      return (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-2 pr-2 font-medium">{api.name}</td>
                          <td className="py-2 pr-2">
                            {api.limit_per_day == null
                              ? "—"
                              : api.limit_per_day + " 次/天"}
                          </td>
                          <td className="py-2 pr-2">
                            {api.used_today != null && api.remaining != null
                              ? api.used_today + " / " + api.remaining
                              : "—"}
                          </td>
                          <td className="py-2 text-gray-600">
                            {api.note || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="px-3 py-4 md:px-6 md:py-5">
      <div
        id="analysis-workbench"
        className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5 xl:gap-6 items-stretch lg:min-h-[min(64vh,720px)] scroll-mt-20"
      >
        <div className="order-2 flex flex-col gap-4 w-full lg:col-span-4 min-h-0 h-full lg:min-h-[min(64vh,720px)]">
        <div className="glass-card w-full mb-0 p-4 md:p-5 shrink-0">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-slate-50 tracking-tight">
              分析参数
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-300 mb-1.5">
              股票代码 *
            </label>
            <input
              className="input-field"
              value={form.stock_code}
              onChange={(e) =>
                setForm((f) => ({ ...f, stock_code: e.target.value }))
              }
              placeholder="如 000001、00700、AAPL"
              disabled={analyzing}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-300 mb-1.5">
              市场
            </label>
            <select
              className="input-field"
              value={form.market}
              onChange={(e) =>
                setForm((f) => ({ ...f, market: e.target.value }))
              }
              disabled={analyzing}
            >
              <option value="A股">A股</option>
              <option value="港股">港股</option>
              <option value="美股">美股</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-300 mb-1.5">
              模型
            </label>
            <select
              className="input-field input-field-compact"
              value={selectedModelKey}
              onChange={(e) => setSelectedModelKey(normalizeModelKey(e.target.value))}
              disabled={analyzing}
            >
              {modelOptions.map(function (m) {
                return (
                  <option key={m.key} value={m.key}>
                    {m.label}{m.default ? "（默认）" : ""}{m.configured === false ? "（未配置）" : ""}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-300 mb-1.5">
              备注（可选）
            </label>
            <textarea
              className="input-field input-field-notes min-h-[5.5rem] resize-y overflow-y-auto max-h-72 py-2 leading-normal"
              rows={4}
              value={form.user_data_notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, user_data_notes: e.target.value }))
              }
              placeholder="行情/市值等摘录，可长文粘贴；与接口行情合并补缺"
              disabled={analyzing}
              title="支持大量文字；框内可滚动，也可向下拖拽拉高"
            />
          </div>
        </div>
        {error && <p className="mt-2 text-lime-300 text-sm">{error}</p>}
        <div className="mt-4 flex flex-col gap-2 items-start">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={
                "btn btn-primary shrink-0 w-auto min-w-[7.5rem] max-w-full " +
                (analyzing ? "btn-analyze-busy" : "")
              }
              onClick={runAnalysis}
              disabled={analyzing}
              title={
                analyzing
                  ? "云端分析可能需数分钟，可切换页面后再回来查看历史列表"
                  : undefined
              }
            >
              {jobId || analysisSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white/35 border-t-white animate-spin"
                    aria-hidden
                  />
                  <span>{jobId ? "分析进行中…" : "分析中…"}</span>
                </span>
              ) : (
                "开始分析"
              )}
            </button>
            {analyzing && (
              <button
                type="button"
                onClick={stopAnalysis}
                className="btn btn-secondary btn-sm shrink-0"
              >
                停止
              </button>
            )}
          </div>
          {analyzing && (
            <p className="text-[11px] md:text-xs text-slate-400 leading-snug max-w-md pl-0.5">
              云端可能较慢；可先去其他页面，完成后在历史报告里查看。
            </p>
          )}
        </div>
        </div>

        <div className="glass-card w-full mb-0 p-4 md:p-5 flex flex-col shrink-0">
        <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
          <h2 className="text-base md:text-lg font-semibold text-slate-50 tracking-tight">
            历史报告
          </h2>
          {!historyLoading && historyList.length > 0 && (
            <button
              type="button"
              className="btn btn-sm bg-rose-500 text-white hover:bg-rose-600 border-0 shrink-0"
              onClick={deleteAllHistoryReports}
              title="删除全部历史报告"
              aria-label="删除全部历史报告"
            >
              <div className="icon-trash-2 text-sm" aria-hidden />
            </button>
          )}
        </div>

        {stockTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mb-4 shrink-0">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSelectedStockCode("")}
            >
              全部
            </button>
            {stockTags.map((code) => (
              <button
                key={code}
                type="button"
                className={getStockTagClass(code)}
                onClick={() => setSelectedStockCode(code)}
              >
                {code}
              </button>
            ))}
          </div>
        )}

        <div
          className="shrink-0 h-[min(48vh,480px)] rounded-xl border border-white/20 bg-slate-950/20 overflow-hidden flex flex-col"
          aria-label="历史报告列表区域"
        >
          {historyLoading && (
            <div className="flex-1 min-h-[8rem] flex items-center justify-center text-slate-400 text-sm">
              加载中…
            </div>
          )}
          {!historyLoading && filteredHistoryList.length === 0 && (
            <div className="flex-1 min-h-[8rem] flex items-center justify-center text-slate-400 text-sm px-3 text-center">
              暂无历史报告
            </div>
          )}
          {!historyLoading && filteredHistoryList.length > 0 && (
            <ul
              className="flex-1 min-h-0 overflow-y-auto space-y-2 p-2 pr-1"
              aria-label="历史报告列表"
            >
              {pagedHistoryList.map((item, i) => {
                const row = enrichHistoryListItem(item);
                const codeLabel =
                  normalizeReportStockCode(row.stock_code, row.market) ||
                  row.stock_code ||
                  "";
                const titleLine = `${codeLabel ? codeLabel + " · " : ""}${item.base_name}`;
                const rowKey =
                  (item.base_name || "") +
                  "|" +
                  (item.generated_at || "") +
                  "|" +
                  ((historyPageClamped - 1) * HISTORY_PAGE_SIZE + i);
                return (
                  <li
                    key={rowKey}
                    className="flex items-stretch gap-2 rounded-xl border border-white/18 bg-white/10 hover:bg-white/16 transition-colors"
                  >
                    <button
                      type="button"
                      className="text-left flex-1 min-w-0 px-3 py-2 rounded-l-xl text-[var(--primary-color)]"
                      title={titleLine}
                      onClick={() => loadHistoryReport(item.base_name)}
                    >
                      <span className="font-semibold text-slate-50 text-sm leading-snug block truncate">
                        {codeLabel ? `${codeLabel} · ` : ""}
                        {item.base_name}
                      </span>
                      <span className="text-slate-400 text-xs mt-0.5 block tabular-nums">
                        {item.generated_at}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 self-center min-w-[3.4rem] rounded-lg border border-cyan-400/35 bg-cyan-400/15 px-2 py-1 text-xs font-bold text-cyan-100 transition-colors hover:bg-cyan-400/25 hover:text-white"
                      title="载入该报告并打开 AI 诊断"
                      onClick={(e) => openHistoryReportDiagnosis(item, e)}
                    >
                      AI
                    </button>
                    <button
                      type="button"
                      className="shrink-0 self-center mr-2 px-2 py-1 text-xs rounded-lg text-slate-400 hover:text-lime-200 hover:bg-lime-400/10 transition-colors"
                      title="删除此报告"
                      onClick={(e) => deleteHistoryReport(item.base_name, e)}
                    >
                      删除
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {!historyLoading && filteredHistoryList.length > 0 && (
          <>
            {historyTotalPages > 1 && (
              <div className="mt-3 pt-3 border-t border-white/15 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <span className="text-xs text-slate-400 tabular-nums">
                  共 {filteredHistoryList.length} 条 · 每页 {HISTORY_PAGE_SIZE}{" "}
                  条
                </span>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm disabled:opacity-40"
                    disabled={historyPageClamped <= 1}
                    onClick={() =>
                      setHistoryPage(function (p) {
                        return Math.max(1, p - 1);
                      })
                    }
                  >
                    上一页
                  </button>
                  <span className="text-xs text-slate-300 tabular-nums px-1">
                    {historyPageClamped} / {historyTotalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm disabled:opacity-40"
                    disabled={historyPageClamped >= historyTotalPages}
                    onClick={() =>
                      setHistoryPage(function (p) {
                        return Math.min(historyTotalPages, p + 1);
                      })
                    }
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
            {historyTotalPages <= 1 && (
              <p className="mt-2 text-xs text-slate-400 shrink-0 tabular-nums">
                共 {filteredHistoryList.length} 条
              </p>
            )}
          </>
        )}
        </div>
        </div>


        <div className="glass-card order-1 w-full lg:col-span-8 mb-0 p-4 md:p-5 flex flex-col min-h-0 h-full">
        <div className="shrink-0">
        <div className="mb-1.5">
          <h2 className="text-sm md:text-base font-semibold text-slate-50 tracking-tight">
            股票预测
          </h2>
          {(() => {
            var fmt = window.formatCronRefreshAt;
            var stale = window.isCronRefreshStale;
            var prices = cronRefresh && cronRefresh.prices;
            var preds = cronRefresh && cronRefresh.predictions;
            if (!prices && !preds) return null;
            return (
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                {prices && prices.at ? (
                  <span className={stale && stale(prices.at, 26) ? "text-amber-300" : "text-emerald-300/85"}>
                    行情自动刷新 {fmt ? fmt(prices.at) : prices.at}
                  </span>
                ) : null}
                {preds && preds.at ? (
                  <span className={stale && stale(preds.at, 30) ? "text-amber-300/90" : "text-slate-400"}>
                    预测自动刷新 {fmt ? fmt(preds.at) : preds.at}
                  </span>
                ) : (
                  <span>预测尚未自动刷新</span>
                )}
              </p>
            );
          })()}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-semibold text-slate-300 shrink-0">
              资产
            </span>
            <div className="segmented-shell p-0.5">
            {[
              { v: 0, l: "股票" },
              { v: 1, l: "ETF" },
              { v: 2, l: "加密货币" },
            ].map((x) => (
              <button
                key={x.v}
                type="button"
                className={`seg-btn !py-1 !px-2.5 text-xs ${
                  predParams.symbol_type === x.v ? "on" : ""
                } first:rounded-l-lg last:rounded-r-lg`}
                onClick={() => {
                  setPredRemoteTotal(null);
                  setPredBullDetail(null);
                  setPredBearDetail(null);
                  setPredParams((p) => ({
                    ...p,
                    symbol_type: x.v,
                    page: 1,
                  }));
                }}
              >
                {x.l}
              </button>
            ))}
          </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            <a
              href="backtest.html"
              className="btn btn-secondary btn-sm shrink-0 gap-1"
              title="预测 + 研报命中率 / 胜率回测看板"
            >
              <span className="icon-target" aria-hidden="true"></span>
              回测胜率
            </a>
            <button
              type="button"
              className="btn btn-primary btn-sm shrink-0"
              disabled={predFetchLoading}
              onClick={fetchScreener}
            >
              {predFetchLoading ? "获取中…" : "获取"}
            </button>
          </div>
        </div>
        {predError && (
          <p className="mb-1.5 rounded-lg border border-lime-300/25 bg-lime-400/10 px-2 py-1 text-xs text-lime-200">{predError}</p>
        )}
        </div>

        <div className="mt-2 flex min-h-0 flex-1 flex-col border-t border-white/15 pt-2">
          <div className="mb-1 flex shrink-0 items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
              按保存日期
            </span>
            {predDateKeys.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  className={`btn btn-sm gap-1 ${
                    showPredCalendar ? "btn-primary" : "btn-secondary"
                  }`}
                  onClick={() => setShowPredCalendar((v) => !v)}
                  title="用日历查看/切换更早的预测日期"
                >
                  <span aria-hidden="true">🗓</span>
                  日历
                  <span className="text-[10px] opacity-70">
                    共 {predDateKeys.length} 天
                  </span>
                </button>
                {showPredCalendar && (
                  <React.Fragment>
                    <button
                      type="button"
                      aria-hidden="true"
                      tabIndex={-1}
                      className="fixed inset-0 z-20 cursor-default"
                      onClick={() => setShowPredCalendar(false)}
                    />
                    <div className="absolute right-0 z-30 mt-1">
                      <PredictionDateCalendar
                        availableKeys={predAvailableSet}
                        selectedKey={selectedPredDateKey}
                        onSelect={(key) => {
                          setSelectedPredDateKey(key);
                          setShowPredCalendar(false);
                        }}
                      />
                    </div>
                  </React.Fragment>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2 shrink-0">
            {predDateKeys.length === 0 && (
              <span className="text-sm text-slate-400">暂无预测快照</span>
            )}
            {visiblePredDateKeys.map((dk) => (
              <button
                key={dk}
                type="button"
                className={`btn btn-sm font-medium transition-colors ${
                  selectedPredDateKey === dk
                    ? "border border-cyan-300/45 bg-cyan-400/20 text-cyan-50 shadow-sm"
                    : "btn-secondary"
                }`}
                onClick={() => setSelectedPredDateKey(dk)}
                title={dk}
              >
                {formatPredDateChip(dk)}
              </button>
            ))}
            {predDateKeys.length > visiblePredDateKeys.length && (
              <button
                type="button"
                className="btn btn-secondary btn-sm text-slate-300"
                onClick={() => setShowPredCalendar(true)}
                title="更多历史日期（日历）"
              >
                更多…
              </button>
            )}
          </div>
          <div className="mb-1 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            预测结果（日 / 周 / 月）
          </div>
          <div className="segmented-shell w-full flex flex-wrap p-0.5 mb-2 shrink-0">
            {[
              { v: 0, l: "日" },
              { v: 1, l: "周" },
              { v: 2, l: "月" },
            ].map((x) => (
              <button
                key={x.v}
                type="button"
                className={`seg-btn flex-1 min-w-[4.5rem] !py-1.5 !px-2 text-xs ${
                  predPeriodTab === x.v ? "on" : ""
                } first:rounded-l-lg last:rounded-r-lg`}
                onClick={() => switchPredPeriodTab(x.v)}
              >
                {x.l}
                {selectedPredDateKey &&
                  !hasScreenerSnapshotForPeriodAnyTrend(
                    predList,
                    selectedPredDateKey,
                    predParams.symbol_type,
                    x.v,
                  ) && (
                  <span className="block text-[10px] font-normal opacity-70 mt-0.5">
                    未获取
                  </span>
                )}
              </button>
            ))}
          </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6">
          {renderPredictionTable(predBullDetail, "看涨股票", "text-emerald-200 bg-emerald-500/10")}
          {renderPredictionTable(predBearDetail, "看跌股票", "text-rose-200 bg-rose-500/10")}
        </div>
        {((!predBullDetail ||
          (predBullDetail.period_type != null &&
            Number(predBullDetail.period_type) !== predPeriodTab)) &&
         (!predBearDetail ||
          (predBearDetail.period_type != null &&
            Number(predBearDetail.period_type) !== predPeriodTab))) && (
          <p className="shrink-0 rounded-xl border border-dashed border-white/18 bg-white/[0.05] py-5 text-center text-xs text-slate-400">
            {currentBullSnapshotName || currentBearSnapshotName
              ? "正在加载该周期…"
              : "该日期下暂无此周期快照，可切换日期或点击「获取」。"}
          </p>
        )}
        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2 border-t border-white/15 pt-2">
          <span className="shrink-0 text-[11px] text-slate-400">列表翻页</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm disabled:opacity-40"
            disabled={predParams.page <= 1}
            onClick={() =>
              setPredParams((p) => ({
                ...p,
                page: Math.max(1, p.page - 1),
              }))
            }
          >
            上一页
          </button>
          <label className="flex items-center gap-0.5 text-[11px] text-slate-300">
            第
            <input
              type="number"
              className="input-field input-field-compact w-11 text-center text-xs"
              min={1}
              value={predParams.page}
              onChange={(e) => {
                var n = parseInt(e.target.value, 10);
                if (Number.isNaN(n) || n < 1) n = 1;
                setPredParams((p) => ({ ...p, page: n }));
              }}
              onBlur={() => {
                setPredParams((p) => {
                  var n = p.page;
                  if (predMaxPage != null && n > predMaxPage) n = predMaxPage;
                  return { ...p, page: Math.max(1, n) };
                });
              }}
            />
            页
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm disabled:opacity-40"
            disabled={
              predMaxPage != null && predParams.page >= predMaxPage
            }
            onClick={() =>
              setPredParams((p) => ({
                ...p,
                page:
                  predMaxPage != null
                    ? Math.min(predMaxPage, p.page + 1)
                    : p.page + 1,
              }))
            }
          >
            下一页
          </button>
          {predRemoteTotal != null && predMaxPage != null ? (
            <span className="text-[11px] text-slate-300 tabular-nums">
              约 {predRemoteTotal} 条 · 共 {predMaxPage} 页
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">
              获取数据后显示总条数与总页数
            </span>
          )}
        </div>
        </div>
        </div>

      </div>

      <div
        id="report-reading-panel"
        className="w-full mt-8 sm:mt-10 scroll-mt-24 md:scroll-mt-28"
      >
        {report && (
        <>
          <div className="flex flex-col w-full pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2 shrink-0">
              <h2 className="text-base md:text-lg font-semibold text-slate-50 tracking-tight">
                当前报告
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm shrink-0 border border-cyan-400/35 bg-cyan-400/15 font-bold text-cyan-100 hover:bg-cyan-400/25 hover:text-white min-w-[3.4rem]"
                  title="AI 诊断"
                  onClick={openCurrentReportDiagnosis}
                >
                  AI
                </button>
              </div>
            </div>
            <div className="sticky top-14 z-30 -mx-2 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/82 px-2 py-2 shadow-lg shadow-slate-950/20 backdrop-blur-xl md:top-16">
              {reportTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`${reportTabBase} ${activeTab === t.id ? t.on : t.off}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
              <button
                type="button"
                className={`${reportTabBase} ${exportTabMd}`}
                onClick={() => download("md", "text/markdown", report.markdown)}
                title="下载 Markdown"
              >
                📄 MD
              </button>
              <button
                type="button"
                className={`${reportTabBase} ${exportTabHtml}`}
                onClick={() => download("html", "text/html", report.html)}
                title="下载 HTML"
              >
                🌐 HTML
              </button>
            </div>

            <div className="glass-card mb-0 report-card w-full p-4 md:p-6 lg:p-8">
              {activeTab === "summary" && (
                <div className="space-y-4 report-summary">
                  <div className="border-b border-white/10 pb-4">
                    <div className="report-section-label">
                      分析主题
                    </div>
                    <div className="text-xl font-black tracking-tight text-slate-50 md:text-2xl">
                      {stripMarkdown(formatReportValue(report.分析主题))}
                    </div>
                  </div>
                  <div className="report-section">
                    <div className="report-section-label">
                      数据基准
                    </div>
                    <pre className="whitespace-pre-wrap rounded-xl border p-3 text-sm">
                      {formatReportValue(report.数据基准)}
                    </pre>
                  </div>
                  <div className="report-section">
                    <div className="report-section-label">
                      融合摘要
                    </div>
                    <div className="report-markdown-block">
                      {renderMarkdown(formatReportValue(report.融合摘要))}
                    </div>
                  </div>
                  <div className="report-callout">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.20em] text-emerald-200">
                      最终建议
                    </div>
                    <div className="report-markdown-block text-base font-semibold text-slate-50">
                      {renderMarkdown(formatReportValue(report.最终建议))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <span className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 font-medium text-slate-300">
                      共识程度：
                      <span className="gx-num text-cyan-300 font-bold">
                        {formatReportValue(report.共识程度)}
                      </span>
                    </span>
                    <span className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 font-medium text-slate-300">
                      加权得分：
                      <span className="gx-num text-cyan-300 font-bold">
                        {formatReportValue(report.加权得分)}
                      </span>
                    </span>
                  </div>
                  <div className="report-section">
                    <div className="report-section-label">
                      风险提示
                    </div>
                    <div className="report-markdown-block">
                      {renderMarkdown(formatReportValue(report.风险提示))}
                    </div>
                  </div>
                  <div className="report-warning">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.20em] text-amber-200">
                      操作建议
                    </div>
                    <pre className="whitespace-pre-wrap rounded-xl border p-3 text-sm">
                      {formatReportValue(report.操作建议)}
                    </pre>
                  </div>
                  <div className="text-xs text-slate-500">
                    生成时间：{formatReportValue(report.生成时间)}
                  </div>
                </div>
              )}
              {activeTab === "report" && (
                <div className="prose prose-sm max-w-none report-markdown-block">
                  {renderMarkdown(report.markdown || "")}
                </div>
              )}
              {activeTab === "analysts" && (
                <div className="space-y-6">
                  {(report.分析师报告 || []).map((r, i) => (
                    <div
                      key={i}
                      className="report-section"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
                        <span className="text-lg font-bold text-slate-50">
                          {formatReportValue(r.分析师姓名)}
                        </span>
                        <span className="text-sm text-slate-400">
                          （{formatReportValue(r.角色定位)}）
                        </span>
                        <span className="rounded-full bg-emerald-400/12 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                          投资建议：{formatReportValue(r.投资建议)}
                        </span>
                        <span className="rounded-full bg-cyan-400/12 px-2.5 py-1 text-xs font-semibold text-cyan-200">
                          置信度：{formatReportValue(r.置信程度)}
                        </span>
                      </div>
                      <div className="report-markdown-block">
                        {renderMarkdown(
                          stripCoreConclusionHeading(
                            formatReportValue(r.核心分析),
                          ),
                        )}
                      </div>
                      {r.核心要点 && r.核心要点.length > 0 && (
                        <ul className="mt-3 list-disc space-y-1.5 pl-6 font-medium text-slate-300">
                          {r.核心要点.map((x, j) => (
                            <li key={j}>
                              {renderMarkdown(formatReportValue(x))}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {activeTab === "debate" && (
                <div className="space-y-6">
                  {(report.辩论轮次 || []).map((d, i) => (
                    <div
                      key={i}
                      className="report-section space-y-4"
                    >
                      <h3 className="border-b border-white/10 pb-2 text-base font-bold text-slate-50">
                        第 {formatReportValue(d.轮次编号)} 轮
                      </h3>
                      <div>
                        <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
                          多头观点
                        </div>
                        <div className="rounded-2xl border border-emerald-300/18 bg-emerald-400/10 p-4 report-markdown-block">
                          {renderMarkdown(formatReportValue(d.多头观点))}
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-rose-200">
                          空头观点
                        </div>
                        <div className="rounded-2xl border border-rose-300/18 bg-rose-400/10 p-4 report-markdown-block">
                          {renderMarkdown(formatReportValue(d.空头观点))}
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
                          裁判结论
                        </div>
                        <div className="rounded-2xl border border-cyan-300/18 bg-cyan-400/10 p-4 report-markdown-block font-medium">
                          {renderMarkdown(formatReportValue(d.裁判结论))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {activeTab === "data" && (
                <pre className="whitespace-pre-wrap rounded-2xl border p-4 text-sm">
                  {formatReportValue(report.数据基准)}
                </pre>
              )}
              {activeTab === "diff" && (
                <div className="report-markdown-block">
                  {renderMarkdown(
                    stripDuplicateDiffMarkdownHeadings(
                      formatReportValue(report.对比与异动) || "暂无",
                    ),
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            aria-label="回到上方分析区"
            className="fixed bottom-24 right-6 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/[0.12] text-xl font-bold leading-none text-slate-100 shadow-lg shadow-slate-950/30 backdrop-blur-xl transition-colors hover:bg-white/[0.18] md:bottom-28 md:right-8"
            onClick={scrollToAnalysisWorkbench}
            title="回到分析表单、历史报告与股票预测"
          >
            ↑
          </button>
        </>
        )}
      </div>
      </main>

    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<AnalysisApp />);
