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

  function saveBucketMessages(bucketKey, messages) {
    var store = readStore();
    var prev = store.buckets[bucketKey] || {};
    store.buckets[bucketKey] = {
      messages: normalizeMessages(messages),
      updatedAt: new Date().toISOString(),
      readUpTo: typeof prev.readUpTo === "number" ? prev.readUpTo : 0,
    };
    writeStore(store);
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
    getModelKey: getModelKey,
    setModelKey: setModelKey,
    runLegacyMigration: runLegacyMigration,
    markMigrationDone: markMigrationDone,
  };
})();
