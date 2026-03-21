(function () {
  var params = new URLSearchParams(window.location.search);
  var apiPort = params.get("api");
  if (apiPort) window.ANALYSIS_API_BASE = "http://localhost:" + apiPort;
})();
/** 默认 API 地址；组件内会用 apiBase 状态并自动探测 8123/8124/8125 */
const API_BASE_FALLBACK = window.ANALYSIS_API_BASE || "http://localhost:8123";
const JOB_STORAGE_KEY = "analysis_job_id";
const POLL_INTERVAL_MS = 3000;

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

// 将 Markdown 渲染为带样式的 React 节点（标题、加粗、列表、重点数字）
function renderMarkdown(text) {
  if (text == null || typeof text !== "string") return null;
  var raw = text.trim();
  if (!raw) return null;
  var lines = raw.split(/\r?\n/);
  var out = [];
  var key = 0;
  function nextKey() {
    return "md-" + key++;
  }
  function parseInline(line) {
    var segs = [];
    var rest = line;
    while (rest.length) {
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
      out.push(
        React.createElement(
          "ul",
          {
            key: nextKey(),
            className: "list-disc pl-6 my-2 space-y-1 text-gray-700",
          },
          listItems.map(function (li, i) {
            return React.createElement(
              "li",
              { key: nextKey() },
              parseInline(li),
            );
          }),
        ),
      );
      listItems = [];
    }
    inList = false;
  }
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();
    if (/^##\s+/.test(line)) {
      flushList();
      out.push(
        React.createElement(
          "h2",
          {
            key: nextKey(),
            className:
              "text-xl font-bold text-gray-900 mt-4 mb-2 pb-1 border-b border-gray-200",
          },
          trimmed.replace(/^##\s+/, ""),
        ),
      );
    } else if (/^###\s+/.test(line)) {
      flushList();
      out.push(
        React.createElement(
          "h3",
          {
            key: nextKey(),
            className: "text-lg font-semibold text-gray-800 mt-3 mb-1",
          },
          trimmed.replace(/^###\s+/, ""),
        ),
      );
    } else if (/^[-*•]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      inList = true;
      listItems.push(trimmed.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, ""));
    } else if (trimmed) {
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
  }
  flushList();
  return React.createElement(
    "div",
    { className: "report-markdown space-y-0" },
    out,
  );
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

function AnalysisApp() {
  const [apiBase, setApiBase] = React.useState(function () {
    try {
      if (window.ANALYSIS_API_BASE) return window.ANALYSIS_API_BASE;
      var saved = localStorage.getItem("analysis_api_base");
      if (saved) return saved;
    } catch (_) {}
    return API_BASE_FALLBACK;
  });

  React.useEffect(function () {
    if (window.ANALYSIS_API_BASE) return;
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
      stock_name: p.get("name") || "",
      use_mock: false,
    };
  });
  const [jobId, setJobId] = React.useState(() => {
    try {
      return localStorage.getItem(JOB_STORAGE_KEY) || "";
    } catch (_) {
      return "";
    }
  });
  const [error, setError] = React.useState("");
  const [report, setReport] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState("summary");
  const [historyList, setHistoryList] = React.useState([]);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [selectedStockCode, setSelectedStockCode] = React.useState("");
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

  const getStockTagClass = (code) => {
    const palette = [
      "bg-sky-100 text-sky-800 hover:bg-sky-200",
      "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
      "bg-amber-100 text-amber-800 hover:bg-amber-200",
      "bg-purple-100 text-purple-800 hover:bg-purple-200",
      "bg-pink-100 text-pink-800 hover:bg-pink-200",
      "bg-indigo-100 text-indigo-800 hover:bg-indigo-200",
      "bg-rose-100 text-rose-800 hover:bg-rose-200",
      "bg-lime-100 text-lime-800 hover:bg-lime-200",
    ];
    const hash = [...code].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const pick = palette[hash % palette.length];
    return `${selectedStockCode === code ? "bg-blue-600 text-white" : pick} btn btn-xs`;
  };

  // 放弃当前任务（停止轮询、清除 job_id，可重新发起分析）
  const stopAnalysis = () => {
    setJobId("");
    setError("");
    try {
      localStorage.removeItem(JOB_STORAGE_KEY);
    } catch (_) {}
  };

  // 恢复未完成的任务：有 job_id 时轮询状态；若后端返回 404（如重启后）则清除 job_id 恢复为可重新分析
  React.useEffect(() => {
    if (!jobId) return;
    const poll = async () => {
      try {
        const res = await fetch(`${apiBase}/api/analyze/status/${jobId}`);
        if (res.status === 404) {
          setJobId("");
          try {
            localStorage.removeItem(JOB_STORAGE_KEY);
          } catch (_) {}
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "done" && data.result) {
          setReport(data.result);
          setActiveTab("summary");
          setJobId("");
          try {
            localStorage.removeItem(JOB_STORAGE_KEY);
          } catch (_) {}
        } else if (data.status === "failed") {
          setError(data.error || "分析失败");
          setJobId("");
          try {
            localStorage.removeItem(JOB_STORAGE_KEY);
          } catch (_) {}
        }
      } catch (_) {}
    };
    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [jobId, apiBase]);

  // 加载历史报告列表
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/reports/list`);
        const data = await res.json();
        if (data.ok && Array.isArray(data.items)) setHistoryList(data.items);
      } catch (_) {}
      setHistoryLoading(false);
    })();
  }, [report, apiBase]); // 新报告产生后刷新列表

  const loadPredList = React.useCallback(async () => {
    setPredListLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/screener/list`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.items)) setPredList(data.items);
      else setPredList([]);
    } catch (_) {
      setPredList([]);
    }
    setPredListLoading(false);
  }, [apiBase]);

  React.useEffect(() => {
    loadPredList();
  }, [loadPredList]);

  const loadScreenerDetail = async (baseName) => {
    setPredError("");
    try {
      const res = await fetch(
        `${apiBase}/api/screener/get?name=${encodeURIComponent(baseName)}`,
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = j.detail;
        throw new Error(
          typeof d === "string" ? d : d ? JSON.stringify(d) : "加载失败",
        );
      }
      setPredDetail(j);
      setPredParams(function (p) {
        var next = { ...p };
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
      setPredRemoteTotal(
        tot != null && !Number.isNaN(tot) ? tot : null,
      );
    } catch (e) {
      setPredError(e.message || "加载预测快照失败");
      setPredDetail(null);
    }
  };

  const fetchScreener = async () => {
    setPredError("");
    setPredFetchLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/screener/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_type: predParams.period_type,
          trend_type: predParams.trend_type,
          symbol_type: predParams.symbol_type,
          page: predParams.page,
          size: predParams.size,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = j.detail;
        throw new Error(
          typeof d === "string" ? d : d ? JSON.stringify(d) : "拉取失败",
        );
      }
      var t =
        j.total != null && j.total !== "" ? Number(j.total) : null;
      setPredRemoteTotal(t != null && !Number.isNaN(t) ? t : null);
      await loadPredList();
      if (j.base_name) await loadScreenerDetail(j.base_name);
    } catch (e) {
      setPredError(e.message || "拉取预测失败");
    } finally {
      setPredFetchLoading(false);
    }
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
      const res = await fetch(
        `${apiBase}/api/screener/delete?name=${encodeURIComponent(baseName)}`,
        { method: "DELETE" },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = j.detail;
        throw new Error(typeof d === "string" ? d : "删除失败");
      }
      setPredList((prev) => prev.filter((it) => it.base_name !== baseName));
      if (predDetail && predDetail.base_name === baseName) setPredDetail(null);
    } catch (e) {
      setPredError(e.message || "删除失败");
    }
  };

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
    setError("");
    setReport(null);
    const marketMap = { A股: "A 股", 港股: "港股", 美股: "美股" };
    try {
      const res = await fetchWithTimeoutNoAbort(
        `${apiBase}/api/analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stock_code: form.stock_code.trim(),
            market: marketMap[form.market] || form.market,
            stock_name: form.stock_name.trim() || null,
            days: form.days,
            use_mock: form.use_mock,
          }),
        },
        20000,
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
      setJobId(data.job_id);
      try {
        localStorage.setItem(JOB_STORAGE_KEY, data.job_id);
      } catch (_) {}
    } catch (e) {
      const msg =
        e.name === "AbortError"
          ? "请求被取消或超时，请确认后端已启动（python3 run_web.py）"
          : e.message || "提交失败";
      setError(msg);
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
      if (!res.ok)
        throw new Error(res.status === 404 ? "报告不存在" : "加载失败");
      const data = await res.json();
      setReport(data);
      setActiveTab("summary");
      setSelectedStockCode(
        data.stock_code ? data.stock_code.toUpperCase() : "",
      );
      setChatMessages(
        loadChatHistoryFromStorage(data.stock_code || "", data.market || ""),
      );
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
      const res = await fetch(
        `${apiBase}/api/reports/delete?name=${encodeURIComponent(baseName)}`,
        { method: "DELETE" },
      );
      const j = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        setError(j.detail || "删除失败");
        return;
      }
      setHistoryList(function (prev) {
        return prev.filter(function (it) {
          return it.base_name !== baseName;
        });
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

  /** 报告标签：未选/选中 两套配色，避免与 btn-primary 混用导致突兀 */
  const reportTabs = [
    {
      id: "summary",
      label: "摘要",
      off: "bg-sky-100 text-sky-900 border-sky-200/90 hover:bg-sky-200",
      on: "bg-sky-600 text-white border-sky-700 shadow-sm ring-2 ring-sky-300/60",
    },
    {
      id: "report",
      label: "完整报告",
      off: "bg-indigo-100 text-indigo-900 border-indigo-200/90 hover:bg-indigo-200",
      on: "bg-indigo-600 text-white border-indigo-700 shadow-sm ring-2 ring-indigo-300/60",
    },
    {
      id: "analysts",
      label: "分析师观点",
      off: "bg-amber-100 text-amber-950 border-amber-200/90 hover:bg-amber-200",
      on: "bg-amber-600 text-white border-amber-700 shadow-sm ring-2 ring-amber-300/60",
    },
    {
      id: "debate",
      label: "多空辩论",
      off: "bg-rose-100 text-rose-900 border-rose-200/90 hover:bg-rose-200",
      on: "bg-rose-600 text-white border-rose-700 shadow-sm ring-2 ring-rose-300/60",
    },
    {
      id: "data",
      label: "数据快照",
      off: "bg-cyan-100 text-cyan-900 border-cyan-200/90 hover:bg-cyan-200",
      on: "bg-cyan-600 text-white border-cyan-700 shadow-sm ring-2 ring-cyan-300/60",
    },
    {
      id: "diff",
      label: "对比与异动",
      off: "bg-emerald-100 text-emerald-900 border-emerald-200/90 hover:bg-emerald-200",
      on: "bg-emerald-600 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-300/60",
    },
  ];
  const deepTabOff =
    "bg-violet-100 text-violet-900 border-violet-200/90 hover:bg-violet-200";
  const deepTabOn =
    "bg-violet-600 text-white border-violet-700 shadow-sm ring-2 ring-violet-300/60";
  const exportTabMd =
    "bg-slate-200 text-slate-800 border-slate-300 hover:bg-slate-300";
  const exportTabHtml =
    "bg-teal-100 text-teal-900 border-teal-200/90 hover:bg-teal-200";
  const reportTabBase =
    "inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400";

  const analyzing = !!jobId;

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

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-5xl mx-auto">
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

      <div className="card mb-6 bg-white/60 backdrop-blur-md border border-white/30 shadow-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-500 mb-1">
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
            <label className="block text-sm text-gray-600 mb-1">市场</label>
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
          <div>
            <label className="block text-sm text-gray-600 mb-1">历史天数</label>
            <input
              type="number"
              className="input-field"
              value={form.days}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  days: parseInt(e.target.value, 10) || 90,
                }))
              }
              min={30}
              max={365}
              disabled={analyzing}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              股票名称（可选）
            </label>
            <input
              className="input-field"
              value={form.stock_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, stock_name: e.target.value }))
              }
              placeholder="公司/证券简称（可选）"
              disabled={analyzing}
            />
          </div>
        </div>
        {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            className="btn btn-primary"
            onClick={runAnalysis}
            disabled={analyzing}
          >
            {analyzing ? "分析进行中…" : "开始分析"}
          </button>
          {analyzing && (
            <button
              type="button"
              onClick={stopAnalysis}
              className="btn btn-secondary"
            >
              停止分析
            </button>
          )}
          {analyzing && (
            <span className="text-sm text-amber-700">
              您可先浏览其他页面，稍后返回本页查看结果。报告将自动保存到历史列表。
            </span>
          )}
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-3">历史报告</h2>

        {stockTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-gray-500 text-sm">按股票代码过滤：</span>
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

        {historyLoading && <p className="text-gray-500 text-sm">加载中…</p>}
        {!historyLoading && filteredHistoryList.length === 0 && (
          <p className="text-gray-500 text-sm">暂无历史报告</p>
        )}
        {!historyLoading && filteredHistoryList.length > 0 && (
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {filteredHistoryList.map((item, i) => (
              <li key={i} className="flex items-stretch gap-1">
                <button
                  type="button"
                  className="text-left flex-1 min-w-0 px-2 py-1.5 rounded hover:bg-gray-100 text-sm text-[var(--primary-color)]"
                  onClick={() => loadHistoryReport(item.base_name)}
                >
                  {item.stock_code ? `${item.stock_code} · ` : ""}
                  {item.base_name}
                  <span className="text-gray-400 ml-2">
                    {item.generated_at}
                  </span>
                </button>
                <button
                  type="button"
                  className="shrink-0 px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50"
                  title="删除此报告"
                  onClick={(e) => deleteHistoryReport(item.base_name, e)}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card mb-6 border border-indigo-100/80 bg-gradient-to-br from-white to-indigo-50/40">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <h2 className="text-lg font-semibold text-gray-900">股票预测</h2>
          <a
            className="text-xs text-indigo-600 hover:underline shrink-0"
            href="https://github.com/openclaw/skills/blob/2b3dcaccedd55355927e013e78b38b9be74290eb/skills/xanxustan/ai-screener/SKILL.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            Intellectia 技能说明
          </a>
        </div>
        <div className="flex flex-wrap gap-2 items-center mb-2">
          <span className="text-sm text-gray-600">周期：</span>
          {[
            { v: 0, l: "日（明日）" },
            { v: 1, l: "周" },
            { v: 2, l: "月" },
          ].map((x) => (
            <button
              key={x.v}
              type="button"
              className={`btn btn-xs rounded-lg border ${
                predParams.period_type === x.v
                  ? "bg-indigo-600 text-white border-indigo-700"
                  : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50"
              }`}
              onClick={() => {
                setPredRemoteTotal(null);
                setPredParams((p) => ({
                  ...p,
                  period_type: x.v,
                  page: 1,
                }));
              }}
            >
              {x.l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center mb-2">
          <span className="text-sm text-gray-600">方向：</span>
          {[
            { v: 0, l: "看涨" },
            { v: 1, l: "看跌" },
          ].map((x) => (
            <button
              key={x.v}
              type="button"
              className={`btn btn-xs rounded-lg border ${
                predParams.trend_type === x.v
                  ? "bg-emerald-600 text-white border-emerald-700"
                  : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50"
              }`}
              onClick={() => {
                setPredRemoteTotal(null);
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
        <div className="flex flex-wrap gap-2 items-center mb-2">
          <span className="text-sm text-gray-600">资产：</span>
          {[
            { v: 0, l: "股票" },
            { v: 1, l: "ETF" },
            { v: 2, l: "加密货币" },
          ].map((x) => (
            <button
              key={x.v}
              type="button"
              className={`btn btn-xs rounded-lg border ${
                predParams.symbol_type === x.v
                  ? "bg-violet-600 text-white border-violet-700"
                  : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50"
              }`}
              onClick={() => {
                setPredRemoteTotal(null);
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
        <div className="flex flex-wrap gap-2 items-center mb-2">
          <span className="text-sm text-gray-600 shrink-0">翻页：</span>
          <button
            type="button"
            className="btn btn-xs bg-white border border-gray-300 rounded-lg disabled:opacity-40"
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
          <label className="text-sm text-gray-600 flex items-center gap-1">
            第
            <input
              type="number"
              className="input-field w-14 py-1 text-sm text-center"
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
            className="btn btn-xs bg-white border border-gray-300 rounded-lg disabled:opacity-40"
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
          {predRemoteTotal != null && predMaxPage != null && (
            <span className="text-xs text-gray-500">
              约 {predRemoteTotal} 条 · 共 {predMaxPage} 页
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <span className="text-sm text-gray-600 shrink-0">每页条数：</span>
          <input
            type="number"
            className="input-field w-16 py-1 text-sm"
            min={1}
            max={10}
            title="每页最多 10 条"
            value={predParams.size}
            onChange={(e) => {
              var sz = Math.min(
                10,
                Math.max(1, parseInt(e.target.value, 10) || 10),
              );
              setPredParams((p) => ({ ...p, size: sz, page: 1 }));
            }}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm ml-auto"
            disabled={predFetchLoading}
            onClick={fetchScreener}
          >
            {predFetchLoading ? "拉取中…" : "拉取并保存快照"}
          </button>
        </div>
        {predError && (
          <p className="text-sm text-red-600 mb-2">{predError}</p>
        )}

        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          预测历史（点击打开）
        </h3>
        {predListLoading && (
          <p className="text-gray-500 text-sm">加载中…</p>
        )}
        {!predListLoading && predList.length === 0 && (
          <p className="text-gray-500 text-sm">暂无快照，请先拉取。</p>
        )}
        {!predListLoading && predList.length > 0 && (
          <ul className="space-y-1 max-h-44 overflow-y-auto mb-4">
            {predList.map((item, i) => (
              <li key={i} className="flex items-stretch gap-1">
                <button
                  type="button"
                  className={`text-left flex-1 min-w-0 px-2 py-1.5 rounded text-sm border transition-colors ${
                    predDetail && predDetail.base_name === item.base_name
                      ? "bg-indigo-100 border-indigo-300 text-indigo-900"
                      : "hover:bg-gray-100 border-transparent text-[var(--primary-color)]"
                  }`}
                  onClick={() => loadScreenerDetail(item.base_name)}
                >
                  <span className="font-medium">
                    {item.symbol_kind || "—"} · {item.period_label || "—"} ·{" "}
                    {item.trend_label || "—"}
                    {item.page != null ? ` · 第${item.page}页` : ""}
                  </span>
                  <span className="text-gray-500 text-xs ml-2">
                    {item.list_count != null ? `${item.list_count} 条` : ""}
                    {item.saved_at ? ` · ${item.saved_at}` : ""}
                  </span>
                </button>
                <button
                  type="button"
                  className="shrink-0 px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50"
                  title="删除快照"
                  onClick={(e) => deleteScreenerSnapshot(item.base_name, e)}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}

        {predDetail && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-sm">
              <span className="font-semibold text-gray-800">
                {predDetail.symbol_kind} · {predDetail.period_label} ·{" "}
                {predDetail.trend_label}
              </span>
              <span className="text-gray-500 ml-2">
                {[
                  predDetail.page != null ? `第 ${predDetail.page} 页` : null,
                  predDetail.page_size != null
                    ? `每页 ${predDetail.page_size} 条`
                    : null,
                  predDetail.data && predDetail.data.total != null
                    ? `约 ${predDetail.data.total} 条`
                    : null,
                  predDetail.saved_at ? `保存 ${predDetail.saved_at}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {predDetail.data &&
                predDetail.data.detail &&
                predDetail.data.detail.name && (
                  <div className="text-xs text-gray-600 mt-1">
                    {predDetail.data.detail.name}
                  </div>
                )}
            </div>
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-100 text-left">
                  <tr>
                    <th className="p-2 font-medium">代码</th>
                    <th className="p-2 font-medium">标的</th>
                    <th className="p-2 font-medium">名称</th>
                    <th className="p-2 font-medium">价格</th>
                    <th className="p-2 font-medium">涨跌%</th>
                    <th className="p-2 font-medium">概率</th>
                    <th className="p-2 font-medium">profit</th>
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
                      <td className="p-2 font-mono text-xs">
                        {row.code || "—"}
                      </td>
                      <td className="p-2 font-medium">{row.symbol || "—"}</td>
                      <td className="p-2 text-gray-700 max-w-[200px] truncate" title={row.name}>
                        {row.name || "—"}
                      </td>
                      <td className="p-2">{row.price != null ? row.price : "—"}</td>
                      <td className="p-2">
                        {row.change_ratio != null ? row.change_ratio : "—"}
                      </td>
                      <td className="p-2">
                        {row.probability != null ? row.probability : "—"}
                      </td>
                      <td className="p-2">
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
      </div>

      {report && (
        <>
          <div>
            <div className="flex flex-wrap gap-2 mb-3 items-center">
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

            <div className="card mb-6 report-card">
              {activeTab === "summary" && (
                <div className="space-y-4 report-summary">
                  <div className="border-b border-gray-200 pb-3">
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
                        {renderMarkdown(formatReportValue(r.核心分析))}
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
                    formatReportValue(report.对比与异动) || "暂无",
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
        </>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<AnalysisApp />);
