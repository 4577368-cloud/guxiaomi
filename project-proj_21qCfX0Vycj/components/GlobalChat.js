function GlobalChatMarkdown(props) {
  if (window.GlobalChatRichText) {
    return React.createElement(window.GlobalChatRichText, { text: props.text });
  }
  return null;
}

function GlobalChatTyping() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5" aria-label="思考中">
      {[0, 150, 300].map(function (delay) {
        return (
          <span
            key={delay}
            className="h-1.5 w-1.5 rounded-full bg-slate-400"
            style={{
              animation: "guxiaomi-chat-bounce 1s ease-in-out infinite",
              animationDelay: delay + "ms",
            }}
          />
        );
      })}
    </span>
  );
}

var CHAT_PANEL_WIDTH_KEY = "guxiaomi_chat_panel_width";
var CHAT_PANEL_MIN_W = 320;
var CHAT_PANEL_MAX_W = 880;
var CHAT_PANEL_DEFAULT_W = 440;

function readPanelWidth() {
  try {
    var w = parseInt(localStorage.getItem(CHAT_PANEL_WIDTH_KEY), 10);
    if (w >= CHAT_PANEL_MIN_W && w <= CHAT_PANEL_MAX_W) return w;
  } catch (_) {}
  return CHAT_PANEL_DEFAULT_W;
}

function GlobalChat() {
  var _open = React.useState(false);
  var open = _open[0];
  var setOpen = _open[1];

  var _ctx = React.useState(function () {
    return window.GuxiaomiChat ? window.GuxiaomiChat.getSnapshot() : { title: "股小蜜" };
  });
  var context = _ctx[0];
  var setContext = _ctx[1];

  var _msgs = React.useState([]);
  var messages = _msgs[0];
  var setMessages = _msgs[1];

  var _input = React.useState("");
  var input = _input[0];
  var setInput = _input[1];

  var _loading = React.useState(false);
  var loading = _loading[0];
  var setLoading = _loading[1];

  var _stream = React.useState("");
  var streaming = _stream[0];
  var setStreaming = _stream[1];

  var _suggestions = React.useState([]);
  var suggestions = _suggestions[0];
  var setSuggestions = _suggestions[1];

  var _model = React.useState(function () {
    return window.GuxiaomiChatStorage
      ? window.GuxiaomiChatStorage.getModelKey()
      : "model2";
  });
  var modelKey = _model[0];
  var setModelKey = _model[1];

  var _userScroll = React.useState(false);
  var isUserScrolling = _userScroll[0];
  var setIsUserScrolling = _userScroll[1];

  var _readUpTo = React.useState(0);
  var readUpTo = _readUpTo[0];
  var setReadUpTo = _readUpTo[1];

  var _activeRole = React.useState(null);
  var activeRole = _activeRole[0];
  var setActiveRole = _activeRole[1];

  var _panelWidth = React.useState(readPanelWidth);
  var panelWidth = _panelWidth[0];
  var setPanelWidth = _panelWidth[1];
  var panelWidthRef = React.useRef(panelWidth);
  React.useEffect(function () {
    panelWidthRef.current = panelWidth;
  }, [panelWidth]);

  var bucketRef = React.useRef("");
  var listRef = React.useRef(null);
  var endRef = React.useRef(null);
  var inputRef = React.useRef(null);

  var apiBase =
    window.GUXIAOMI_CHAT_API_BASE ||
    window.ANALYSIS_API_BASE ||
    (function () {
      var h = typeof location !== "undefined" ? location.hostname : "";
      if (h === "localhost" || h === "127.0.0.1") return "http://localhost:8123";
      return typeof location !== "undefined" && location.origin
        ? location.origin
        : "";
    })();

  var loadBucket = React.useCallback(function (snap) {
    if (!window.GuxiaomiChat || !window.GuxiaomiChatStorage) return;
    var key = window.GuxiaomiChat.getBucketKey(snap);
    if (bucketRef.current === key) return;
    bucketRef.current = key;
    var stored = window.GuxiaomiChatStorage.getBucketMessages(key);
    if (!stored.length) {
      stored = window.GuxiaomiChatStorage.runLegacyMigration(key, snap);
    }
    setMessages(stored);
    setStreaming("");
    setSuggestions([]);
    var read =
      window.GuxiaomiChatStorage.getBucketReadUpTo
        ? window.GuxiaomiChatStorage.getBucketReadUpTo(key)
        : 0;
    setReadUpTo(read);
  }, []);

  React.useEffect(function () {
    if (!window.GuxiaomiChat) return;
    return window.GuxiaomiChat.subscribe(function (snap) {
      setContext(snap);
      loadBucket(snap);
    });
  }, [loadBucket]);

  React.useEffect(function () {
    function onOpenChat(e) {
      var detail = (e && e.detail) || {};
      if (detail.context && window.GuxiaomiChat) {
        window.GuxiaomiChat.setContext(detail.context);
      }
      setOpen(true);
      if (detail.message) setInput(detail.message);
      window.setTimeout(function () {
        if (inputRef.current) inputRef.current.focus();
      }, 120);
    }
    window.addEventListener("guxiaomi-chat-open", onOpenChat);
    return function () {
      window.removeEventListener("guxiaomi-chat-open", onOpenChat);
    };
  }, []);

  React.useEffect(function () {
    if (!open || !bucketRef.current || !window.GuxiaomiChatStorage) return;
    var len = messages.length;
    setReadUpTo(len);
    window.GuxiaomiChatStorage.setBucketReadUpTo(bucketRef.current, len);
  }, [open, messages]);

  React.useEffect(function () {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return function () {
      document.body.style.overflow = "";
    };
  }, [open]);

  React.useEffect(function () {
    function onKey(e) {
      if (e.key === "Escape" && open) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return function () {
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  React.useEffect(function () {
    if (!open || isUserScrolling) return;
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streaming, open, isUserScrolling]);

  React.useEffect(function () {
    var el = listRef.current;
    if (!el) return;
    var scrollTimeout;
    function onScroll() {
      var atBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      if (!atBottom) {
        setIsUserScrolling(true);
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(function () {
          setIsUserScrolling(false);
        }, 2000);
      } else {
        setIsUserScrolling(false);
      }
    }
    el.addEventListener("scroll", onScroll);
    return function () {
      el.removeEventListener("scroll", onScroll);
      clearTimeout(scrollTimeout);
    };
  }, [open]);

  function persistMessages(next) {
    if (!window.GuxiaomiChatStorage || !bucketRef.current) return;
    window.GuxiaomiChatStorage.saveBucketMessages(bucketRef.current, next);
  }

  function handleClear() {
    if (!window.confirm("确定清空当前对话吗？")) return;
    setMessages([]);
    setStreaming("");
    setSuggestions([]);
    if (window.GuxiaomiChatStorage && bucketRef.current) {
      window.GuxiaomiChatStorage.clearBucketMessages(bucketRef.current);
      setReadUpTo(0);
    }
  }

  async function handleSend(textOverride) {
    var text = (textOverride != null ? textOverride : input).trim();
    if (!text || loading) return;
    if (!apiBase) {
      alert("未配置 API：请启动后端或设置 ANALYSIS_API_BASE");
      return;
    }

    setInput("");
    setSuggestions([]);
    setIsUserScrolling(false);

    var userMsg = {
      role: "user",
      content: text,
      time: new Date().toISOString(),
    };
    var nextMessages = messages.concat([userMsg]);
    setMessages(nextMessages);
    setLoading(true);
    setStreaming("");

    try {
      var snap = window.GuxiaomiChat
        ? window.GuxiaomiChat.getSnapshot()
        : context;
      var answer = await window.GuxiaomiChatService.sendMessage({
        apiBase: apiBase,
        message: text,
        history: messages,
        snapshot: snap,
        modelKey: modelKey,
        stream: true,
        onChunk: function (_chunk, full) {
          setStreaming(full);
        },
      });
      if (window.GuxiaomiChatRoles && window.GuxiaomiChat) {
        setActiveRole(
          window.GuxiaomiChatRoles.resolveRole(
            text,
            window.GuxiaomiChat.getSnapshot(),
          ),
        );
      }

      var assistantMsg = {
        role: "assistant",
        content: answer || "（无回复）",
        time: new Date().toISOString(),
      };
      var saved = nextMessages.concat([assistantMsg]);
      setMessages(saved);
      setStreaming("");
      persistMessages(saved);

      if (window.GuxiaomiChatStorage) {
        window.GuxiaomiChatStorage.markMigrationDone();
      }

      var qs = await window.GuxiaomiChatService.fetchSuggestedQuestions({
        apiBase: apiBase,
        userMessage: text,
        assistantReply: answer,
        modelKey: modelKey,
        snapshot: snap,
      });
      setSuggestions(qs);
    } catch (e) {
      console.error("GlobalChat send failed", e);
      var errMsg = {
        role: "assistant",
        content: "抱歉，对话失败：" + (e.message || "请稍后重试"),
        time: new Date().toISOString(),
        isError: true,
      };
      var withErr = nextMessages.concat([errMsg]);
      setMessages(withErr);
      setStreaming("");
      persistMessages(withErr);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.focus();
    }
  }

  function onModelChange(e) {
    var k = e.target.value;
    setModelKey(k);
    if (window.GuxiaomiChatStorage) window.GuxiaomiChatStorage.setModelKey(k);
  }

  function onInputKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function applySuggestion(q) {
    setInput(q);
    setSuggestions([]);
    window.setTimeout(function () {
      if (!inputRef.current) return;
      inputRef.current.focus();
      var placeholders = ["【股票代码】", "【标的名称】", "【代码】"];
      for (var i = 0; i < placeholders.length; i++) {
        var ph = placeholders[i];
        var idx = q.indexOf(ph);
        if (idx >= 0) {
          inputRef.current.setSelectionRange(idx, idx + ph.length);
          return;
        }
      }
    }, 0);
  }

  function onResizeStart(e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    var startX = e.clientX;
    var startW = panelWidthRef.current;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev) {
      var delta = startX - ev.clientX;
      var next = Math.min(CHAT_PANEL_MAX_W, Math.max(CHAT_PANEL_MIN_W, startW + delta));
      setPanelWidth(next);
    }

    function onUp() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      try {
        localStorage.setItem(CHAT_PANEL_WIDTH_KEY, String(panelWidthRef.current));
      } catch (_) {}
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  var contextTitle = (context && context.title) || "股小蜜";
  var isDiagnosis = context && context.focus === "diagnosis";

  function countUnread(msgs, fromIndex) {
    var n = 0;
    for (var i = fromIndex; i < msgs.length; i++) {
      if (msgs[i].role === "assistant") n++;
    }
    return n;
  }

  var unreadCount = open ? 0 : countUnread(messages, readUpTo);

  return (
    <>
      <style>{`
        @keyframes guxiaomi-chat-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
      {!open && (
        <button
          type="button"
          onClick={function () {
            setOpen(true);
            loadBucket(context);
          }}
          className="fixed bottom-5 right-4 z-[100] flex h-12 w-12 items-center justify-center rounded-full bg-[#0e9aa7] text-white shadow-[0_4px_24px_rgba(14,154,167,0.45)] transition hover:bg-[#10b3c2] hover:shadow-[0_6px_28px_rgba(14,154,167,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 md:bottom-6 md:right-6"
          title="打开股小蜜 AI 对话"
          aria-label="打开股小蜜 AI 对话"
        >
          <div className="icon-message-circle text-[22px]" aria-hidden />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-[1px]"
            aria-label="关闭对话"
            onClick={function () {
              setOpen(false);
            }}
          />
          <aside
            className="relative flex h-full flex-col border-l border-slate-200 bg-white shadow-[-4px_0_32px_rgba(15,23,42,0.12)]"
            style={{ width: panelWidth, maxWidth: "92vw", minWidth: CHAT_PANEL_MIN_W }}
            role="dialog"
            aria-label="股小蜜 AI 对话"
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="拖拽调整对话宽度"
              title="拖拽调整宽度"
              className="absolute left-0 top-0 z-10 h-full w-2 -translate-x-1/2 cursor-col-resize touch-none hover:bg-cyan-500/15 active:bg-cyan-500/25"
              onMouseDown={onResizeStart}
            />
            <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-50 ring-1 ring-cyan-200/80">
                  <div className="icon-sparkles text-base text-cyan-600" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">股小蜜 AI</h2>
                  {activeRole && activeRole.name && (
                    <p className="truncate text-[11px] text-teal-700">{activeRole.name}</p>
                  )}
                  {!activeRole && contextTitle !== "股小蜜" && (
                    <p className={"truncate text-xs " + (isDiagnosis ? "text-cyan-700" : "text-slate-500")}>
                      {contextTitle}
                    </p>
                  )}
                  {activeRole && contextTitle !== "股小蜜" && isDiagnosis && (
                    <p className="truncate text-[11px] text-slate-500">{contextTitle}</p>
                  )}
                </div>
                <select
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                  value={modelKey}
                  onChange={onModelChange}
                  title="模型槽位"
                >
                  <option value="model1">模型1</option>
                  <option value="model2">模型2</option>
                  <option value="model3">模型3</option>
                </select>
                <button
                  type="button"
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  onClick={handleClear}
                  title="清空对话"
                  aria-label="清空对话"
                >
                  <div className="icon-trash-2 text-[15px]" aria-hidden />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  onClick={function () {
                    setOpen(false);
                  }}
                  title="关闭"
                  aria-label="关闭对话"
                >
                  <div className="icon-x text-[15px]" aria-hidden />
                </button>
              </div>
            </header>

            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-5">
              <div className="space-y-4">
                {messages.map(function (msg, i) {
                  var isUser = msg.role === "user";
                  return (
                    <div
                      key={(msg.time || "") + "-" + i}
                      className={"flex " + (isUser ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={
                          "max-w-[88%] px-4 py-3 shadow-sm " +
                          (isUser
                            ? "rounded-2xl rounded-br-md bg-teal-600 text-white"
                            : msg.isError
                              ? "rounded-2xl rounded-bl-md border border-rose-200 bg-rose-50 text-rose-900"
                              : "rounded-2xl rounded-bl-md border border-slate-200 bg-white text-slate-800")
                        }
                      >
                        {isUser ? (
                          <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-white">{msg.content}</p>
                        ) : (
                          <GlobalChatMarkdown text={msg.content} />
                        )}
                      </div>
                    </div>
                  );
                })}
                {streaming && (
                  <div className="flex justify-start">
                    <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-slate-800 shadow-sm">
                      <GlobalChatMarkdown text={streaming} />
                      <span className="ml-0.5 inline-block h-2 w-0.5 animate-pulse bg-cyan-500" />
                    </div>
                  </div>
                )}
                {loading && !streaming && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <GlobalChatTyping />
                    </div>
                  </div>
                )}
              </div>
              <div ref={endRef} className="h-2" />
            </div>

            {suggestions.length > 0 && (
              <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-2.5">
                <div className="flex flex-wrap gap-2">
                  {suggestions.map(function (q, idx) {
                    return (
                      <button
                        key={idx}
                        type="button"
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs text-slate-600 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800"
                        onClick={function () {
                          applySuggestion(q);
                        }}
                        disabled={loading}
                      >
                        {q}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <footer className="shrink-0 border-t border-slate-200 bg-white p-3">
              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-inner">
                <textarea
                  ref={inputRef}
                  className="min-h-[2.5rem] max-h-28 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-snug text-slate-800 placeholder:text-slate-400 focus:outline-none"
                  rows={1}
                  placeholder="输入问题…"
                  value={input}
                  onChange={function (e) {
                    setInput(e.target.value);
                  }}
                  onKeyDown={onInputKeyDown}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white transition hover:bg-teal-500 disabled:opacity-40"
                  onClick={function () {
                    handleSend();
                  }}
                  disabled={loading || !input.trim()}
                  title="发送"
                  aria-label="发送"
                >
                  <div className="icon-send text-[15px]" aria-hidden />
                </button>
              </div>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}

window.GlobalChat = GlobalChat;
