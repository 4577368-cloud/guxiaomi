/** 全局 AI 对话会话持久化与旧版迁移 */
(function () {
  var STORAGE_KEY = "guxiaomi_chat_v1";
  var MODEL_KEY = "guxiaomi_chat_model_key";
  var MIGRATION_FLAG = "guxiaomi_chat_migrated_v1";
  var MAX_MESSAGES = 80;

  function readStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { buckets: {} };
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return { buckets: {} };
      if (!data.buckets || typeof data.buckets !== "object") data.buckets = {};
      return data;
    } catch (_) {
      return { buckets: {} };
    }
  }

  function writeStore(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("保存对话历史失败", e);
    }
  }

  function normalizeMessages(messages) {
    return (messages || [])
      .filter(function (m) {
        return m && (m.role === "user" || m.role === "assistant") && m.content;
      })
      .map(function (m) {
        return {
          role: m.role,
          content: String(m.content),
          time: m.time || null,
        };
      })
      .slice(-MAX_MESSAGES);
  }

  function getBucketMessages(bucketKey) {
    var store = readStore();
    var bucket = store.buckets[bucketKey];
    return bucket && Array.isArray(bucket.messages)
      ? normalizeMessages(bucket.messages)
      : [];
  }

  function saveBucketMessages(bucketKey, messages, meta) {
    meta = meta || {};
    var store = readStore();
    var prev = store.buckets[bucketKey] || {};
    var normalized = normalizeMessages(messages);
    var preview = "";
    for (var i = normalized.length - 1; i >= 0; i--) {
      if (normalized[i].role === "user") {
        preview = String(normalized[i].content).slice(0, 48);
        break;
      }
    }
    store.buckets[bucketKey] = {
      messages: normalized,
      updatedAt: new Date().toISOString(),
      readUpTo: typeof prev.readUpTo === "number" ? prev.readUpTo : 0,
      title: meta.title || prev.title || "",
      contextSnapshot: meta.contextSnapshot || prev.contextSnapshot || null,
      preview: preview || prev.preview || "",
    };
    writeStore(store);
  }

  function deriveThreadTitle(scopeKey) {
    if (!scopeKey) return "对话";
    if (scopeKey.indexOf("workbench") >= 0) return "工作台";
    var parts = String(scopeKey).split("|");
    if (scopeKey.indexOf("diagnosis") >= 0) {
      var code = parts[0] || "";
      if (parts.indexOf("thread") >= 0) {
        return (code || "标的") + " · 新会话";
      }
      if (parts.length >= 4) {
        var rn = parts.slice(3).join("|");
        if (rn.length > 22) rn = rn.slice(0, 20) + "…";
        return code ? code + " · " + rn : rn;
      }
      return (code || "诊断") + " · 对话";
    }
    return scopeKey.length > 28 ? scopeKey.slice(0, 26) + "…" : scopeKey;
  }

  function listThreadsForPage(page) {
    var store = readStore();
    var prefix = String(page || "global") + "::";
    return Object.keys(store.buckets)
      .filter(function (k) {
        return k.indexOf(prefix) === 0;
      })
      .map(function (k) {
        var b = store.buckets[k] || {};
        var scopeKey = k.slice(prefix.length);
        var msgs = Array.isArray(b.messages) ? b.messages : [];
        return {
          bucketKey: k,
          scopeKey: scopeKey,
          title: b.title || deriveThreadTitle(scopeKey),
          preview: b.preview || "",
          updatedAt: b.updatedAt || "",
          messageCount: msgs.length,
          contextSnapshot: b.contextSnapshot || null,
        };
      })
      .filter(function (t) {
        return t.messageCount > 0 || t.contextSnapshot;
      })
      .sort(function (a, b) {
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      });
  }

  function getBucketReadUpTo(bucketKey) {
    var store = readStore();
    var bucket = store.buckets[bucketKey];
    if (!bucket) return 0;
    if (typeof bucket.readUpTo === "number") return bucket.readUpTo;
    return Array.isArray(bucket.messages) ? bucket.messages.length : 0;
  }

  function setBucketReadUpTo(bucketKey, index) {
    var store = readStore();
    var bucket = store.buckets[bucketKey];
    if (!bucket) {
      bucket = { messages: [], updatedAt: new Date().toISOString() };
      store.buckets[bucketKey] = bucket;
    }
    bucket.readUpTo = Math.max(0, index | 0);
    writeStore(store);
  }

  function clearBucketMessages(bucketKey) {
    var store = readStore();
    delete store.buckets[bucketKey];
    writeStore(store);
  }

  function getModelKey() {
    try {
      return (
        localStorage.getItem(MODEL_KEY) ||
        localStorage.getItem("analysis_selected_model_key") ||
        localStorage.getItem("ziwei_selected_model_key") ||
        "model2"
      );
    } catch (_) {
      return "model2";
    }
  }

  function setModelKey(key) {
    try {
      localStorage.setItem(MODEL_KEY, String(key || "model2"));
    } catch (_) {}
  }

  function migrateAnalysisHistory(bucketKey, stockCode, market) {
    if (!stockCode) return [];
    var code = String(stockCode).toUpperCase().trim();
    var m = String(market || "")
      .replace(/\s+/g, "")
      .toUpperCase()
      .trim();
    var legacyKey = "analysis_chat_history_" + code + "_" + m;
    try {
      var raw = localStorage.getItem(legacyKey);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) return [];
      saveBucketMessages(bucketKey, parsed);
      return normalizeMessages(parsed);
    } catch (_) {
      return [];
    }
  }

  function migrateZiweiHistory(bucketKey) {
    try {
      var raw = localStorage.getItem("ziwei_current_reports");
      if (!raw) return [];
      var reports = JSON.parse(raw);
      var msgs = reports && reports.chatMessages;
      if (!Array.isArray(msgs) || !msgs.length) return [];
      saveBucketMessages(bucketKey, msgs);
      return normalizeMessages(msgs);
    } catch (_) {
      return [];
    }
  }

  function runLegacyMigration(bucketKey, snapshot) {
    try {
      if (localStorage.getItem(MIGRATION_FLAG)) return getBucketMessages(bucketKey);
    } catch (_) {}

    var existing = getBucketMessages(bucketKey);
    if (existing.length) return existing;

    var page = snapshot && snapshot.page;
    if (page === "analysis" && snapshot.stock) {
      var migrated = migrateAnalysisHistory(
        bucketKey,
        snapshot.stock.code,
        snapshot.stock.market,
      );
      if (migrated.length) return migrated;
    }
    if (page === "ziwei") {
      var ziweiMsgs = migrateZiweiHistory(bucketKey);
      if (ziweiMsgs.length) return ziweiMsgs;
    }
    return [];
  }

  function markMigrationDone() {
    try {
      localStorage.setItem(MIGRATION_FLAG, "1");
    } catch (_) {}
  }

  window.GuxiaomiChatStorage = {
    STORAGE_KEY: STORAGE_KEY,
    MODEL_KEY: MODEL_KEY,
    getBucketMessages: getBucketMessages,
    saveBucketMessages: saveBucketMessages,
    getBucketReadUpTo: getBucketReadUpTo,
    setBucketReadUpTo: setBucketReadUpTo,
    clearBucketMessages: clearBucketMessages,
    deriveThreadTitle: deriveThreadTitle,
    listThreadsForPage: listThreadsForPage,
    getModelKey: getModelKey,
    setModelKey: setModelKey,
    runLegacyMigration: runLegacyMigration,
    markMigrationDone: markMigrationDone,
  };
})();
