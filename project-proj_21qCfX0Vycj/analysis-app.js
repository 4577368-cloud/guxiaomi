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
/** 历史报告每页条数，与预测表「每页 10 条」一致；列表区最大高度对齐右侧表体 */
const HISTORY_PAGE_SIZE = 10;

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
              "my-3 rounded-lg border border-slate-200 bg-white shadow-sm",
          },
          React.createElement(
            "summary",
            {
              className:
                "cursor-pointer select-none px-3 py-2 font-semibold text-gray-900 bg-slate-50 rounded-lg hover:bg-slate-100 list-none",
            },
            ch.sum,
          ),
          React.createElement(
            "div",
            { className: "px-3 py-3 text-gray-700 border-t border-slate-100" },
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
                  "text-blue-600 hover:text-blue-800 underline underline-offset-2 cursor-pointer",
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
                className: "text-blue-600 hover:underline",
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
            { key: nextKey(), className: "font-semibold text-gray-900" },
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
            { key: nextKey(), className: "text-gray-800" },
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
            { key: nextKey(), className: "text-blue-600 font-semibold" },
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
            className: "list-disc pl-6 my-2 space-y-1 text-gray-700",
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
          className: "block h-0 scroll-mt-24",
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
              "text-xl font-bold text-gray-900 mt-4 mb-2 pb-1 border-b border-gray-200 scroll-mt-20",
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
              "text-lg font-semibold text-gray-800 mt-3 mb-1 scroll-mt-20",
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
          className: "my-4 border-slate-200",
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
              "border-l-4 border-blue-300 pl-3 my-2 text-gray-700 bg-slate-50/90 py-2 pr-2 rounded-r",
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
                  "min-w-full text-sm border border-slate-200 rounded-lg overflow-hidden",
              },
              React.createElement(
                "thead",
                { className: "bg-slate-100" },
                React.createElement(
                  "tr",
                  null,
                  headerCells.map(function (h, hi) {
                    return React.createElement(
                      "th",
                      {
                        key: nextKey(),
                        className:
                          "text-left px-3 py-2 font-semibold text-gray-800 border-b border-slate-200",
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
                    { key: nextKey(), className: "border-b border-slate-100" },
                    row.map(function (cell) {
                      return React.createElement(
                        "td",
                        {
                          key: nextKey(),
                          className: "px-3 py-2 text-gray-700 align-top",
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
          { key: nextKey(), className: "my-1.5 text-gray-700 leading-relaxed" },
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
  /** 历史报告分页（与预测表 10 条视觉高度对齐，多出的条目翻页查看） */
  const [historyPage, setHistoryPage] = React.useState(1);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [chatMinimized, setChatMinimized] = React.useState(false);
  const [chatMessages, setChatMessages] = React.useState([]);
  const [chatInput, setChatInput] = React.useState("");
  const [chatLoading, setChatLoading] = React.useState(false);
  const [showUsageModal, setShowUsageModal] = React.useState(false);
  const [apiUsage, setApiUsage] = React.useState({ apis: [], loading: false });

  /** Intellectia 选股器 / 股票预测快照 */
  const [predList, setPredList] = React.useState([]);
  const [predListLoading, setPredListLoading] = React.useState(true);
  const [predDetail, setPredDetail] = React.useState(null);
  const [predFetchLoading, setPredFetchLoading] = React.useState(false);
  const [predError, setPredError] = React.useState("");
  const [predParams, setPredParams] = React.useState({
    period_type: 0,
    trend_type: 0,
    symbol_type: 0,
    page: 1,
    size: 10,
  });
  /** 最近一次拉取或当前快照对应的接口 total，用于禁用「下一页」 */
  const [predRemoteTotal, setPredRemoteTotal] = React.useState(null);
  /** 日/周/月 Tab：0 日 1 周 2 月 */
  const [predPeriodTab, setPredPeriodTab] = React.useState(0);
  /** 当前选中的预测快照日期（保存日 YYYY-MM-DD，用于切换不同批次） */
  const [selectedPredDateKey, setSelectedPredDateKey] = React.useState(null);
  const predPeriodTabRef = React.useRef(0);
  React.useEffect(() => {
    predPeriodTabRef.current = predPeriodTab;
  }, [predPeriodTab]);

  const getStockTagClass = (code) => {
    const palette = [
      "bg-slate-200/55 text-slate-800 border border-white/50 hover:bg-slate-300/50",
      "bg-slate-300/40 text-slate-800 border border-white/50 hover:bg-slate-300/60",
      "bg-blue-100/50 text-blue-900 border border-white/50 hover:bg-blue-100/80",
      "bg-cyan-100/45 text-cyan-900 border border-white/50 hover:bg-cyan-100/75",
      "bg-violet-100/45 text-violet-900 border border-white/50 hover:bg-violet-100/75",
      "bg-teal-100/45 text-teal-900 border border-white/50 hover:bg-teal-100/75",
    ];
    const hash = [...code].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const pick = palette[hash % palette.length];
    return `${selectedStockCode === code ? "bg-blue-600 text-white border-blue-500" : pick} btn btn-xs`;
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
        saveHistoryListCache(merged);
        setHistoryList(merged);
      } catch (_) {
        var fallback = filterOutDeletedReportItems(loadHistoryListCache());
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

  const applyScreenerDetailPayload = React.useCallback(function (j) {
    if (!j || !j.base_name) return;
    setPredDetail(j);
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
          Math.max(1, parseInt(String(j.page_size), 10) || 10),
        );
      }
      return next;
    });
    var tot =
      j.data && j.data.total != null && j.data.total !== ""
        ? Number(j.data.total)
        : null;
    setPredRemoteTotal(tot != null && !Number.isNaN(tot) ? tot : null);
  }, []);

  const loadScreenerDetail = async (baseName) => {
    setPredError("");
    if (!baseName) {
      setPredDetail(null);
      return;
    }
    var cached = getCachedScreenerBody(baseName);
    if (cached && cached.base_name) {
      applyScreenerDetailPayload(cached);
    } else {
      setPredDetail(null);
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
      applyScreenerDetailPayload(j);
      cacheScreenerBody(baseName, j);
    } catch (e) {
      if (cached && cached.base_name) {
        setPredError("");
        return;
      }
      setPredError(e.message || "加载预测快照失败");
      setPredDetail(null);
    }
  };

  const fetchScreener = async () => {
    setPredError("");
    setPredFetchLoading(true);
    try {
      for (var pi = 0; pi < 3; pi++) {
        const res = await fetch(`${apiBase}/api/screener/fetch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            period_type: pi,
            trend_type: predParams.trend_type,
            symbol_type: predParams.symbol_type,
            page: predParams.page,
            size: predParams.size,
          }),
        });
        await res.json().catch(() => ({}));
        /* 某一周期未取到数据时不提示报错 */
      }
      var items = await loadPredList();
      var tt = predParams.trend_type;
      var st = predParams.symbol_type;
      var g = groupPredictionsByDate(items, tt, st);
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
        setPredDetail(null);
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
      if (predDetail && predDetail.base_name === baseName) setPredDetail(null);
    } catch (e) {
      setPredError(e.message || "删除失败");
    }
  };

  /** groupPredictionsByDate 返回 { grouped, keys }，勿写成 predGrouped/predDateKeys 以免白屏 */
  const { grouped: predGrouped, keys: predDateKeys } = React.useMemo(
    function () {
      return groupPredictionsByDate(
        predList,
        predParams.trend_type,
        predParams.symbol_type,
      );
    },
    [predList, predParams.trend_type, predParams.symbol_type],
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

  const currentPredSnapshotName = React.useMemo(
    function () {
      if (!selectedPredDateKey) return null;
      return findScreenerSnapshotName(
        predList,
        selectedPredDateKey,
        predParams.trend_type,
        predParams.symbol_type,
        predPeriodTab,
        predParams.page,
      );
    },
    [
      predList,
      selectedPredDateKey,
      predParams.trend_type,
      predParams.symbol_type,
      predParams.page,
      predPeriodTab,
    ],
  );

  React.useEffect(
    function () {
      if (!currentPredSnapshotName) {
        setPredDetail(null);
        return;
      }
      loadScreenerDetail(currentPredSnapshotName);
    },
    [currentPredSnapshotName],
  );

  const stockTags = React.useMemo(() => {
    const codes = new Set();
    historyList.forEach((item) => {
      const code = (item.stock_code || "") + "";
      if (code && code.trim()) codes.add(code.trim().toUpperCase());
    });
    return Array.from(codes).sort();
  }, [historyList]);

  const filteredHistoryList = React.useMemo(() => {
    if (!selectedStockCode) return historyList;
    return historyList.filter(
      (item) => (item.stock_code || "").toUpperCase() === selectedStockCode,
    );
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

  const getChatStorageKey = (stockCode, market) => {
    const code = (stockCode || "").toUpperCase().trim();
    const m = (market || "").replace(/\s+/g, "").toUpperCase().trim();
    return `analysis_chat_history_${code}_${m}`;
  };

  const loadChatHistoryFromStorage = (stockCode, market) => {
    try {
      const key = getChatStorageKey(stockCode, market);
      const saved = localStorage.getItem(key);
      if (!saved) return [];
      return JSON.parse(saved) || [];
    } catch (e) {
      console.error("读取深度诊断聊天历史失败", e);
      return [];
    }
  };

  const saveChatHistoryToStorage = (stockCode, market, messages) => {
    try {
      const key = getChatStorageKey(stockCode, market);
      localStorage.setItem(key, JSON.stringify(messages || []));
    } catch (e) {
      console.error("保存深度诊断聊天历史失败", e);
    }
  };

  const runAnalysis = async () => {
    if (!form.stock_code.trim()) {
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
      })(form.user_data_notes);
      try {
        if (typeof getStockPrice === "function") {
          var stockApiMkt =
            form.market === "港股"
              ? "HK"
              : form.market === "美股"
                ? "US"
                : "CN";
          var pq = await getStockPrice(form.stock_code.trim(), stockApiMkt);
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
        stock_code: form.stock_code.trim(),
        market: marketMap[form.market] || form.market,
        user_data_notes: form.user_data_notes.trim() || null,
        days: form.days,
        use_mock: form.use_mock,
        client_quote: clientQuote,
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
              fromCache.stock_code
                ? String(fromCache.stock_code).toUpperCase()
                : "",
            );
            setChatMessages(
              loadChatHistoryFromStorage(
                fromCache.stock_code || "",
                fromCache.market || "",
              ),
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
        data.stock_code ? data.stock_code.toUpperCase() : "",
      );
      setChatMessages(
        loadChatHistoryFromStorage(data.stock_code || "", data.market || ""),
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
        setChatOpen(false);
      }
    } catch (e) {
      setError(e.message || "删除失败");
    }
  };

  const openDeepDiagnosis = () => {
    if (!report) return;
    if (chatOpen) {
      closeDeepDiagnosis();
      return;
    }
    const stockCode = report.stock_code || form.stock_code || "";
    const marketVal = report.market || form.market || "";
    const persisted = loadChatHistoryFromStorage(stockCode, marketVal);
    setChatMessages(persisted);
    setChatOpen(true);
  };

  const closeDeepDiagnosis = () => {
    setChatOpen(false);
    setChatInput("");
  };

  const sendDeepDiagnosis = async () => {
    if (!report || !chatInput.trim()) return;

    const question = chatInput.trim();
    const nextMessages = [
      ...chatMessages,
      { role: "user", content: question, time: new Date().toISOString() },
    ];
    setChatMessages(nextMessages);
    setChatLoading(true);
    setChatInput("");

    try {
      const res = await fetch(`${apiBase}/api/analyze/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stock_code: report.stock_code || form.stock_code,
          market: report.market || form.market,
          report_base_name: report.base_name || "",
          report_text:
            report.markdown || report.分析主题 || report.融合摘要 || "",
          message: question,
          use_mock: form.use_mock,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = (err && err.detail) || `状态 ${res.status}`;
        if (res.status === 404) {
          throw new Error(
            `接口未找到，请确认后端服务已启动且 ${apiBase}/api/analyze/chat 可用（${detail}）`,
          );
        }
        throw new Error(detail);
      }
      const data = await res.json();
      const answer = data.answer || "未返回回答，请重试";

      const saved = [
        ...nextMessages,
        { role: "assistant", content: answer, time: new Date().toISOString() },
      ];
      setChatMessages(saved);

      const stockCode = report.stock_code || form.stock_code || "";
      const marketVal = report.market || form.market || "";
      saveChatHistoryToStorage(stockCode, marketVal, saved);
    } catch (e) {
      console.error("深度诊断 API 失败", e);
      setError("深度诊断失败：" + (e.message || "请稍后重试"));
    } finally {
      setChatLoading(false);
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
      off: "bg-white/35 text-slate-900 border-white/45 hover:bg-white/55",
      on: "bg-white/60 text-slate-900 border-white/65 shadow-[inset_0_-2px_0_rgba(34,211,238,0.85),0_0_28px_rgba(34,211,238,0.22)] ring-2 ring-cyan-200/40 animate-pulse",
    },
    {
      id: "report",
      label: "完整报告",
      off: "bg-white/35 text-slate-900 border-white/45 hover:bg-white/55",
      on: "bg-white/60 text-slate-900 border-white/65 shadow-[inset_0_-2px_0_rgba(99,102,241,0.85),0_0_28px_rgba(99,102,241,0.22)] ring-2 ring-indigo-200/40 animate-pulse",
    },
    {
      id: "analysts",
      label: "分析师观点",
      off: "bg-white/35 text-slate-900 border-white/45 hover:bg-white/55",
      on: "bg-white/60 text-slate-900 border-white/65 shadow-[inset_0_-2px_0_rgba(245,158,11,0.90),0_0_28px_rgba(245,158,11,0.20)] ring-2 ring-amber-200/40 animate-pulse",
    },
    {
      id: "debate",
      label: "多空辩论",
      off: "bg-white/35 text-slate-900 border-white/45 hover:bg-white/55",
      on: "bg-white/60 text-slate-900 border-white/65 shadow-[inset_0_-2px_0_rgba(244,63,94,0.85),0_0_28px_rgba(244,63,94,0.20)] ring-2 ring-rose-200/40 animate-pulse",
    },
    {
      id: "data",
      label: "数据快照",
      off: "bg-white/35 text-slate-900 border-white/45 hover:bg-white/55",
      on: "bg-white/60 text-slate-900 border-white/65 shadow-[inset_0_-2px_0_rgba(45,212,191,0.85),0_0_28px_rgba(45,212,191,0.20)] ring-2 ring-teal-200/40 animate-pulse",
    },
    {
      id: "diff",
      label: "对比与异动",
      off: "bg-white/35 text-slate-900 border-white/45 hover:bg-white/55",
      on: "bg-white/60 text-slate-900 border-white/65 shadow-[inset_0_-2px_0_rgba(16,185,129,0.85),0_0_28px_rgba(16,185,129,0.18)] ring-2 ring-emerald-200/40 animate-pulse",
    },
  ];

  const deepTabOff =
    "bg-white/35 text-slate-900 border-white/45 hover:bg-white/55";
  const deepTabOn =
    "bg-white/60 text-slate-900 border-white/65 shadow-[inset_0_-2px_0_rgba(139,92,246,0.85),0_0_28px_rgba(139,92,246,0.20)] ring-2 ring-violet-200/40 animate-pulse";
  const exportTabMd =
    "bg-white/35 text-slate-900 border-white/45 hover:bg-white/55";
  const exportTabHtml =
    "bg-white/35 text-slate-900 border-white/45 hover:bg-white/55";
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

  /** 从报告区回到上方：分析表单 / 历史 / 预测 */
  const scrollToAnalysisWorkbench = React.useCallback(function () {
    var el = document.getElementById("analysis-workbench");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  return (
    <div className="min-h-screen p-4 md:p-6 w-full max-w-none mx-auto">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-xl md:text-2xl font-bold text-[var(--text-primary)]">
          股票分析
        </h1>
        <a
          href="index.html"
          className="btn px-3 py-2 bg-slate-100 text-slate-900 rounded-lg shadow-sm border border-white/40 hover:bg-slate-200 ml-auto"
        >
          ← 返回
        </a>
      </div>
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

      <div
        id="analysis-workbench"
        className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-5 xl:gap-6 items-stretch lg:min-h-[min(64vh,720px)] scroll-mt-4"
      >
        <div className="order-1 flex flex-col gap-4 w-full lg:col-span-3 min-h-0 h-full lg:min-h-[min(64vh,720px)]">
        <div className="glass-card w-full mb-0 p-5 md:p-6 shrink-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
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
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
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
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
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
        {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
        <div className="mt-5 flex flex-col gap-2 items-start">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={
                "btn btn-primary shrink-0 w-auto max-w-full " +
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
                className="btn btn-secondary btn-xs shrink-0"
              >
                停止
              </button>
            )}
          </div>
          {analyzing && (
            <p className="text-[11px] md:text-xs text-slate-500 leading-snug max-w-md pl-0.5">
              云端可能较慢；可先去其他页面，完成后在历史报告里查看。
            </p>
          )}
        </div>
        </div>

        <div className="glass-card w-full mb-0 p-5 md:p-6 flex flex-col shrink-0">
        <h2 className="text-base md:text-lg font-semibold text-slate-900 tracking-tight mb-3 shrink-0">
          历史报告
        </h2>

        {stockTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
            <span className="text-slate-500 text-sm font-medium shrink-0">
              按代码过滤
            </span>
            <button
              type="button"
              className="btn btn-xs bg-stone-100 text-stone-700 hover:bg-stone-200"
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
          className="shrink-0 h-[min(48vh,480px)] rounded-xl border border-white/40 bg-white/20 overflow-hidden flex flex-col"
          aria-label="历史报告列表区域"
        >
          {historyLoading && (
            <div className="flex-1 min-h-[8rem] flex items-center justify-center text-gray-500 text-sm">
              加载中…
            </div>
          )}
          {!historyLoading && filteredHistoryList.length === 0 && (
            <div className="flex-1 min-h-[8rem] flex items-center justify-center text-gray-500 text-sm px-3 text-center">
              暂无历史报告
            </div>
          )}
          {!historyLoading && filteredHistoryList.length > 0 && (
            <ul
              className="flex-1 min-h-0 overflow-y-auto space-y-2 p-2 pr-1"
              aria-label="历史报告列表"
            >
              {pagedHistoryList.map((item, i) => {
                const titleLine = `${item.stock_code ? item.stock_code + " · " : ""}${item.base_name}`;
                const rowKey =
                  (item.base_name || "") +
                  "|" +
                  (item.generated_at || "") +
                  "|" +
                  ((historyPageClamped - 1) * HISTORY_PAGE_SIZE + i);
                return (
                  <li
                    key={rowKey}
                    className="flex items-stretch gap-2 rounded-xl border border-white/40 bg-white/25 hover:bg-white/45 transition-colors"
                  >
                    <button
                      type="button"
                      className="text-left flex-1 min-w-0 px-3 py-2 rounded-l-xl text-[var(--primary-color)]"
                      title={titleLine}
                      onClick={() => loadHistoryReport(item.base_name)}
                    >
                      <span className="font-semibold text-slate-900 text-sm leading-snug block truncate">
                        {item.stock_code ? `${item.stock_code} · ` : ""}
                        {item.base_name}
                      </span>
                      <span className="text-slate-500 text-xs mt-0.5 block tabular-nums">
                        {item.generated_at}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 self-center mr-2 px-2 py-1 text-xs rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50/80 transition-colors"
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
              <div className="mt-3 pt-3 border-t border-white/50 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <span className="text-xs text-slate-500 tabular-nums">
                  共 {filteredHistoryList.length} 条 · 每页 {HISTORY_PAGE_SIZE}{" "}
                  条
                </span>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <button
                    type="button"
                    className="btn btn-xs bg-white/80 border border-slate-200/90 text-slate-700 disabled:opacity-40"
                    disabled={historyPageClamped <= 1}
                    onClick={() =>
                      setHistoryPage(function (p) {
                        return Math.max(1, p - 1);
                      })
                    }
                  >
                    上一页
                  </button>
                  <span className="text-xs text-slate-600 tabular-nums px-1">
                    {historyPageClamped} / {historyTotalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn-xs bg-white/80 border border-slate-200/90 text-slate-700 disabled:opacity-40"
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


        <div className="glass-card order-2 w-full lg:col-span-9 mb-0 p-4 md:p-5 border-0 bg-white/55 flex flex-col min-h-0 h-full">
        <div className="shrink-0">
        <div className="mb-1.5">
          <h2 className="text-sm md:text-base font-semibold text-slate-900 tracking-tight">
            股票预测
          </h2>
        </div>
        <p className="text-[11px] text-slate-500 mb-2 leading-snug">
          「获取」静默拉取<strong className="text-slate-600">日/周/月</strong>；按
          <strong className="text-slate-600">日期</strong>换批次，再选日/周/月看表。
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-semibold text-slate-500 shrink-0">
              方向
            </span>
            <div className="segmented-shell p-0.5">
            {[
              { v: 0, l: "看涨" },
              { v: 1, l: "看跌" },
            ].map((x) => (
              <button
                key={x.v}
                type="button"
                className={`seg-btn !py-1 !px-2.5 text-xs ${
                  predParams.trend_type === x.v ? "on" : ""
                } first:rounded-l-lg last:rounded-r-lg`}
                onClick={() => {
                  setPredRemoteTotal(null);
                  setPredDetail(null);
                  setPredParams((p) => ({
                    ...p,
                    trend_type: x.v,
                    page: 1,
                  }));
                }}
              >
                {x.l}
              </button>
            ))}
          </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-semibold text-slate-500 shrink-0">
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
                  setPredDetail(null);
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
            <button
              type="button"
              className="btn btn-primary btn-xs shrink-0 !min-h-8 !px-3 !py-1 text-xs"
              disabled={predFetchLoading}
              onClick={fetchScreener}
            >
              {predFetchLoading ? "获取中…" : "获取"}
            </button>
          </div>
        </div>
        {predError && (
          <p className="text-xs text-red-600 mb-1.5">{predError}</p>
        )}
        </div>

        <div className="mt-2 pt-2 border-t border-white/50 flex-1 min-h-0 flex flex-col">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 shrink-0">
            按保存日期
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2 shrink-0">
            {predDateKeys.length === 0 && (
              <span className="text-sm text-slate-400">暂无预测快照</span>
            )}
            {predDateKeys.map((dk) => (
              <button
                key={dk}
                type="button"
                className={`btn btn-xs rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedPredDateKey === dk
                    ? "bg-blue-600 text-white border border-blue-500 shadow-sm"
                    : "bg-white/55 text-slate-700 border border-white/60 hover:bg-white/80"
                }`}
                onClick={() => setSelectedPredDateKey(dk)}
                title={dk}
              >
                {formatPredDateChip(dk)}
              </button>
            ))}
          </div>
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 shrink-0">
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
                  !hasScreenerSnapshotForPeriod(
                    predList,
                    selectedPredDateKey,
                    predParams.trend_type,
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

        {predDetail &&
          (predDetail.period_type == null ||
            Number(predDetail.period_type) === predPeriodTab) && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden shrink-0">
            <div className="overflow-x-auto flex-1 min-h-[200px] max-h-[min(48vh,480px)] overflow-y-auto">
              <table className="w-full text-xs md:text-sm">
                <thead className="sticky top-0 bg-gray-100 text-left">
                  <tr>
                    <th className="p-1.5 font-medium">代码</th>
                    <th className="p-1.5 font-medium">标的</th>
                    <th className="p-1.5 font-medium">名称</th>
                    <th className="p-1.5 font-medium">价格</th>
                    <th className="p-1.5 font-medium">涨跌%</th>
                    <th className="p-1.5 font-medium">概率</th>
                    <th className="p-1.5 font-medium">profit</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    (predDetail.data && predDetail.data.list) ||
                    []
                  ).map((row, ri) => (
                    <tr
                      key={ri}
                      className="border-t border-gray-100 hover:bg-gray-50/80"
                    >
                      <td className="p-1.5 font-mono text-[11px] md:text-xs">
                        {row.code || "—"}
                      </td>
                      <td className="p-1.5 font-medium">{row.symbol || "—"}</td>
                      <td className="p-1.5 text-gray-700 max-w-[200px] truncate" title={row.name}>
                        {row.name || "—"}
                      </td>
                      <td className="p-1.5">{row.price != null ? row.price : "—"}</td>
                      <td className="p-1.5">
                        {row.change_ratio != null ? row.change_ratio : "—"}
                      </td>
                      <td className="p-1.5">
                        {row.probability != null ? row.probability : "—"}
                      </td>
                      <td className="p-1.5">
                        {row.profit != null ? row.profit : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!(predDetail.data && predDetail.data.list) ||
                predDetail.data.list.length === 0) && (
                <p className="p-4 text-gray-500 text-sm">本快照无列表数据</p>
              )}
            </div>
            {predDetail.intellectia_ret != null &&
              predDetail.intellectia_ret !== 0 && (
                <p className="text-xs text-amber-700 px-3 py-2 bg-amber-50 border-t border-amber-100">
                  API ret={String(predDetail.intellectia_ret)}{" "}
                  {predDetail.intellectia_msg
                    ? `· ${predDetail.intellectia_msg}`
                    : ""}
                </p>
              )}
          </div>
        )}
        {(!predDetail ||
          (predDetail.period_type != null &&
            Number(predDetail.period_type) !== predPeriodTab)) && (
          <p className="text-xs text-slate-500 py-5 text-center rounded-lg border border-dashed border-slate-200/80 bg-white/30 shrink-0">
            {currentPredSnapshotName
              ? "正在加载该周期…"
              : "该日期下暂无此周期快照，可切换日期或点击「获取」。"}
          </p>
        )}
        <div className="mt-2 pt-2 border-t border-white/40 flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-[11px] text-slate-500 shrink-0">列表翻页</span>
          <button
            type="button"
            className="btn btn-xs bg-white border border-gray-300 rounded-md disabled:opacity-40 !min-h-7 !py-0.5 text-xs"
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
          <label className="text-[11px] text-slate-600 flex items-center gap-0.5">
            第
            <input
              type="number"
              className="input-field input-field-compact w-11 text-center text-xs py-0.5 min-h-7"
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
            className="btn btn-xs bg-white border border-gray-300 rounded-md disabled:opacity-40 !min-h-7 !py-0.5 text-xs"
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
            <span className="text-[11px] text-slate-500 tabular-nums">
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
        className="w-full mt-8 sm:mt-10 scroll-mt-4"
      >
        {report && (
        <>
          <div className="flex flex-col w-full pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2 shrink-0">
              <h2 className="text-base md:text-lg font-semibold text-slate-900 tracking-tight">
                当前报告
              </h2>
              <button
                type="button"
                className="btn btn-xs bg-white/80 text-slate-700 border border-slate-200/90 shadow-sm hover:bg-slate-50 shrink-0 self-start sm:self-auto"
                onClick={scrollToAnalysisWorkbench}
                title="回到分析表单、历史报告与股票预测"
              >
                ↑ 回到上方
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3 items-center shrink-0">
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
                style={{ minWidth: "130px" }}
                className={`${reportTabBase} ${chatOpen ? deepTabOn : deepTabOff}`}
                onClick={openDeepDiagnosis}
              >
                {chatOpen ? "关闭深度诊断" : "深度诊断"}
              </button>
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
                  <div className="border-b border-white/50 pb-3">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">
                      分析主题
                    </div>
                    <div className="text-lg font-bold text-gray-900">
                      {stripMarkdown(formatReportValue(report.分析主题))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                      数据基准
                    </div>
                    <pre className="whitespace-pre-wrap text-sm bg-blue-50 text-gray-800 p-3 rounded-lg border border-blue-100">
                      {formatReportValue(report.数据基准)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                      融合摘要
                    </div>
                    <div className="report-markdown-block">
                      {renderMarkdown(formatReportValue(report.融合摘要))}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                    <div className="text-xs font-medium text-green-800 uppercase tracking-wide mb-1">
                      最终建议
                    </div>
                    <div className="text-base font-semibold text-gray-900">
                      {renderMarkdown(formatReportValue(report.最终建议))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="font-medium text-gray-600">
                      共识程度：
                      <span className="text-blue-600 font-bold">
                        {formatReportValue(report.共识程度)}
                      </span>
                    </span>
                    <span className="font-medium text-gray-600">
                      加权得分：
                      <span className="text-blue-600 font-bold">
                        {formatReportValue(report.加权得分)}
                      </span>
                    </span>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                      风险提示
                    </div>
                    <div className="report-markdown-block">
                      {renderMarkdown(formatReportValue(report.风险提示))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                      操作建议
                    </div>
                    <pre className="whitespace-pre-wrap text-sm bg-amber-50 text-gray-800 p-3 rounded-lg border border-amber-100">
                      {formatReportValue(report.操作建议)}
                    </pre>
                  </div>
                  <div className="text-xs text-gray-500">
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
                      className="border border-gray-200 rounded-xl p-4 bg-gray-50/50"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-2 pb-2 border-b border-gray-200">
                        <span className="text-lg font-bold text-gray-900">
                          {formatReportValue(r.分析师姓名)}
                        </span>
                        <span className="text-sm text-gray-500">
                          （{formatReportValue(r.角色定位)}）
                        </span>
                        <span className="text-sm font-semibold text-green-700">
                          投资建议：{formatReportValue(r.投资建议)}
                        </span>
                        <span className="text-sm text-blue-600 font-medium">
                          置信度：{formatReportValue(r.置信程度)}
                        </span>
                      </div>
                      <div className="report-markdown-block text-gray-700">
                        {renderMarkdown(
                          stripCoreConclusionHeading(
                            formatReportValue(r.核心分析),
                          ),
                        )}
                      </div>
                      {r.核心要点 && r.核心要点.length > 0 && (
                        <ul className="list-disc pl-6 mt-2 space-y-1 text-gray-700 font-medium">
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
                      className="border border-gray-200 rounded-xl p-4 space-y-4"
                    >
                      <h3 className="text-base font-bold text-gray-900 pb-2 border-b border-gray-200">
                        第 {formatReportValue(d.轮次编号)} 轮
                      </h3>
                      <div>
                        <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">
                          多头观点
                        </div>
                        <div className="p-3 rounded-lg bg-green-50/80 border border-green-100 report-markdown-block text-gray-800">
                          {renderMarkdown(formatReportValue(d.多头观点))}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">
                          空头观点
                        </div>
                        <div className="p-3 rounded-lg bg-red-50/80 border border-red-100 report-markdown-block text-gray-800">
                          {renderMarkdown(formatReportValue(d.空头观点))}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
                          裁判结论
                        </div>
                        <div className="p-3 rounded-lg bg-blue-50/80 border border-blue-100 report-markdown-block text-gray-800 font-medium">
                          {renderMarkdown(formatReportValue(d.裁判结论))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {activeTab === "data" && (
                <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded-lg border border-gray-200">
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

          {chatOpen && (
            <div className="fixed top-10 left-4 right-4 bottom-10 md:left-auto md:right-4 mx-auto max-w-[calc(100vw-2rem)] md:max-w-[820px] w-full bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-50 flex flex-col border border-gray-300 h-[75vh] max-h-[82vh]">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div className="text-base font-bold">深度诊断</div>
                <button
                  type="button"
                  className="text-gray-500 hover:text-gray-700 text-xl leading-none"
                  onClick={() => setChatOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {(chatMessages || []).length === 0 ? (
                  <p className="text-xs text-gray-500">
                    输入问题，助手将基于当前报告给出诊断。
                  </p>
                ) : (
                  (chatMessages || []).map((msg, i) => (
                    <div
                      key={i}
                      className={`text-xs p-2 rounded-lg ${
                        msg.role === "user"
                          ? "bg-blue-100 text-blue-900 ml-6 text-right"
                          : "bg-gray-100 text-gray-800 mr-6"
                      }`}
                    >
                      <div className="font-semibold text-sm mb-1">
                        {msg.role === "user" ? "我" : "助手"}
                      </div>
                      <div className="text-sm leading-relaxed report-markdown-block">
                        {renderMarkdown(msg.content)}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t p-2 flex items-center gap-1">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="输入问题..."
                  className="input-field flex-1 text-sm py-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendDeepDiagnosis();
                    }
                  }}
                  disabled={chatLoading}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={sendDeepDiagnosis}
                  disabled={chatLoading || !chatInput.trim()}
                >
                  {chatLoading ? "…" : "发"}
                </button>
              </div>
            </div>
          )}
          {/* 长报告滚动后仍可一键回到分析 / 历史 / 预测区（低于深度诊断 z-50） */}
          <button
            type="button"
            aria-label="回到上方分析区"
            className="fixed bottom-6 right-6 z-40 flex items-center gap-1.5 rounded-full border border-white/70 bg-white/90 px-4 py-2.5 text-sm font-medium text-slate-800 shadow-[0_8px_30px_rgba(15,23,42,0.12)] backdrop-blur-md hover:bg-white hover:shadow-lg transition-all md:bottom-8 md:right-8"
            onClick={scrollToAnalysisWorkbench}
            title="回到分析表单、历史报告与股票预测"
          >
            <span className="text-base leading-none">↑</span>
            回到上方
          </button>
        </>
        )}
      </div>

    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<AnalysisApp />);
