/** 全站 AI 对话：统一发送（流式 / 非流式）与 API 路由 */
(function () {
  function sanitizeReply(text) {
    if (text == null || typeof text !== "string") return "";
    var s = text.trim();
    var thinkRe = new RegExp("<think>[\\s\\S]*?</think>", "gi");
    s = s.replace(thinkRe, "");
    s = s.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
    return s.replace(/\n{3,}/g, "\n\n").trim();
  }

  function parseSseStream(reader, decoder, onChunk) {
    var sseBuf = "";
    var fullContent = "";

    function processLine(line) {
      var trimmed = (line || "").trim();
      if (!trimmed.startsWith("data: ")) return;
      var data = trimmed.slice(6);
      if (data === "[DONE]") return;
      try {
        var parsed = JSON.parse(data);
        var errMsg = parsed.error && (parsed.error.message || parsed.error);
        if (errMsg) throw new Error(String(errMsg));
        var content = (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) || parsed.content || "";
        if (content) {
          fullContent += content;
          if (onChunk) onChunk(content, fullContent);
        }
      } catch (e) {
        if (e instanceof SyntaxError) return;
        throw e;
      }
    }

    return reader.read().then(function pump(result) {
      if (result.done) {
        if (sseBuf) processLine(sseBuf);
        return fullContent;
      }
      sseBuf += decoder.decode(result.value, { stream: true });
      var parts = sseBuf.split("\n");
      sseBuf = parts.pop() || "";
      parts.forEach(processLine);
      return reader.read().then(pump);
    });
  }

  function shouldUseAnalyzeChat(snapshot) {
    return (
      snapshot &&
      snapshot.page === "analysis" &&
      snapshot.report &&
      (snapshot.report.excerpt || snapshot.report.base_name)
    );
  }

  async function sendAnalyzeChat(opts) {
    var apiBase = opts.apiBase;
    var snapshot = opts.snapshot || {};
    var stock = snapshot.stock || {};
    var report = snapshot.report || {};
    var history = (opts.history || []).map(function (m) {
      return { role: m.role, content: m.content || "" };
    });

    var body = {
      stock_code: stock.code || "",
      market: stock.market || "A 股",
      report_base_name: report.base_name || "",
      report_text: report.excerpt || "",
      message: opts.message,
      use_mock: !!opts.useMock,
      model_key: opts.modelKey || "model2",
      history: history,
      stream: !!opts.stream,
    };

    var controller = new AbortController();
    var timeoutId = setTimeout(function () {
      controller.abort();
    }, opts.timeoutMs || 300000);

    try {
      var res = await fetch(apiBase + "/api/analyze/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        var errJson = await res.json().catch(function () {
          return {};
        });
        throw new Error((errJson && errJson.detail) || "深度诊断请求失败 " + res.status);
      }

      if (opts.stream && res.body) {
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var full = await parseSseStream(reader, decoder, opts.onChunk);
        return sanitizeReply(full);
      }

      var data = await res.json();
      return sanitizeReply(data.answer || data.content || "");
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") throw new Error("请求超时，请稍后重试");
      throw e;
    }
  }

  async function sendLlmChat(opts) {
    var apiBase = opts.apiBase;
    var system = opts.system || "";
    var user = opts.message || "";
    var history = opts.history || [];

    var body = {
      system: system,
      user: user,
      history: history.map(function (m) {
        return { role: m.role, content: m.content || "" };
      }),
      stream: opts.stream !== false,
      max_tokens: opts.maxTokens || 8192,
      temperature: opts.temperature != null ? opts.temperature : 0.7,
      model_key: opts.modelKey || "model2",
      use_mock: !!opts.useMock,
    };

    var controller = new AbortController();
    var timeoutId = setTimeout(function () {
      controller.abort();
    }, opts.timeoutMs || 300000);

    try {
      var res = await fetch(apiBase + "/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        var errJson = await res.json().catch(function () {
          return {};
        });
        throw new Error((errJson && errJson.detail) || "对话请求失败 " + res.status);
      }

      if (body.stream && res.body) {
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var full = await parseSseStream(reader, decoder, opts.onChunk);
        return sanitizeReply(full);
      }

      var data = await res.json();
      return sanitizeReply(data.content || data.answer || "");
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") throw new Error("请求超时，请稍后重试");
      throw e;
    }
  }

  async function sendMessage(opts) {
    if (!opts || !opts.apiBase) throw new Error("未配置 API 地址");
    if (!opts.message || !String(opts.message).trim()) {
      throw new Error("消息不能为空");
    }

    var snapshot = opts.snapshot || (window.GuxiaomiChat && window.GuxiaomiChat.getSnapshot()) || {};

    if (window.GuxiaomiChatStockCache && opts.message) {
      var enriched = window.GuxiaomiChatStockCache.enrichSnapshot(opts.message, snapshot);
      if (enriched !== snapshot) {
        snapshot = enriched;
        if (window.GuxiaomiChat) window.GuxiaomiChat.setContext(snapshot);
      }
    }

    if (shouldUseAnalyzeChat(snapshot)) {
      return sendAnalyzeChat(
        Object.assign({}, opts, {
          snapshot: snapshot,
        }),
      );
    }

    var system = opts.system;
    if (!system && window.GuxiaomiChatRoles) {
      var role = window.GuxiaomiChatRoles.resolveRole(opts.message, snapshot);
      system = window.GuxiaomiChatRoles.buildSystemPrompt(role, snapshot, opts.history);
    } else if (!system && window.GuxiaomiChat && window.GuxiaomiChat.buildSystemPrompt) {
      system = window.GuxiaomiChat.buildSystemPrompt(snapshot, opts.history);
    }

    return sendLlmChat(
      Object.assign({}, opts, {
        system: system || "",
        snapshot: snapshot,
      }),
    );
  }

  async function fetchSuggestedQuestions(opts) {
    if (!opts || !opts.apiBase || !opts.userMessage || !opts.assistantReply) return [];
    try {
      var snap = opts.snapshot || {};
      var stockLine = "";
      if (snap.stock && snap.stock.code) {
        stockLine =
          "当前上下文已载入股票：" +
          snap.stock.code +
          (snap.stock.market ? "（" + snap.stock.market + "）" : "") +
          "。涉及该股的问题可直接写代码，勿用占位符。\n";
      }
      var diagnosisLine = "";
      if (snap.focus === "diagnosis") {
        diagnosisLine =
          "这是一次 AI 诊断对话。追问应帮助用户深挖：报告论点与现价校准、技术关键位、仓位与风险、或报告某章节（多空/风险/操作建议）的延展分析。\n";
        if (snap.report && snap.report.base_name) {
          diagnosisLine +=
            "已载入报告《" +
            snap.report.base_name +
            "》，可围绕报告章节生成追问。\n";
        }
      }
      var prompt =
        "基于以下对话，生成 3 条专业后续追问建议。\n\n" +
        "要求：\n" +
        "1. 每行一条，不要编号、不要 Markdown\n" +
        "2. 若用户需自行填写标的，必须用【股票代码】或【标的名称】占位，例如：请分析【股票代码】的支撑位与止损位\n" +
        "3. 禁止生成含糊的「帮我分析一只股票」这类无法直接作答的问题\n" +
        "4. 问题要具体、专业、与对话内容相关，能推动深度分析而非重复首轮结论\n" +
        stockLine +
        diagnosisLine +
        "\n用户：" +
        truncate(opts.userMessage, 500) +
        "\n\n助手：" +
        truncate(opts.assistantReply, 800);

      var answer = await sendLlmChat({
        apiBase: opts.apiBase,
        system:
          "你是股小蜜追问建议生成器。只输出问题列表，每行一条。需要用户补充标的时必须使用【股票代码】占位符。",
        message: prompt,
        history: [],
        stream: false,
        maxTokens: 320,
        temperature: 0.45,
        modelKey: opts.modelKey,
      });
      return String(answer || "")
        .split("\n")
        .map(function (q) {
          return q.replace(/^[\d.\-\s]+/, "").replace(/^#+\s*/, "").trim();
        })
        .filter(Boolean)
        .slice(0, 3);
    } catch (e) {
      console.warn("生成建议追问失败", e);
      return [];
    }
  }

  function truncate(text, max) {
    var s = text == null ? "" : String(text);
    if (s.length <= max) return s;
    return s.slice(0, max) + "…";
  }

  window.GuxiaomiChatService = {
    sendMessage: sendMessage,
    fetchSuggestedQuestions: fetchSuggestedQuestions,
    sanitizeReply: sanitizeReply,
  };
})();
