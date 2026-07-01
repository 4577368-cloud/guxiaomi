(function () {
  var params = new URLSearchParams(window.location.search);
  var api = params.get("api") || params.get("apiPort") || "";
  if (api) {
    if (/^https?:\/\//i.test(api)) {
      window.ANALYSIS_API_BASE = api;
    } else {
      var h = window.location.hostname;
      if (h === "localhost" || h === "127.0.0.1") {
        window.ANALYSIS_API_BASE = "http://localhost:" + api;
      }
    }
  }

  var host = window.location.hostname;
  window.GUXIAOMI_CHAT_API_BASE =
    window.ANALYSIS_API_BASE ||
    (host === "localhost" || host === "127.0.0.1"
      ? "http://localhost:8123"
      : window.location.origin || "");

  var mounted = false;
  var attempts = 0;
  var maxAttempts = 120;

  function mount() {
    if (mounted) return;
    if (!window.React || !window.ReactDOM || !window.GlobalChat) {
      attempts += 1;
      if (attempts < maxAttempts) {
        setTimeout(mount, 50);
      } else {
        console.warn("GlobalChat: React 或组件未加载（已超时）");
      }
      return;
    }
    mounted = true;
    var rootEl = document.getElementById("guxiaomi-chat-root");
    if (!rootEl) {
      rootEl = document.createElement("div");
      rootEl.id = "guxiaomi-chat-root";
      document.body.appendChild(rootEl);
    }
    var root = ReactDOM.createRoot(rootEl);
    root.render(React.createElement(GlobalChat));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
  window.addEventListener("load", mount);
})();
