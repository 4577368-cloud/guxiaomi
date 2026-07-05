/** 定时刷新状态：格式化时间戳 + 拉取 /api/cron/status */
(function () {
  function formatCronRefreshAt(isoStr) {
    if (!isoStr) return "";
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    var now = new Date();
    var hh = String(d.getHours()).padStart(2, "0");
    var mm = String(d.getMinutes()).padStart(2, "0");
    var timePart = hh + ":" + mm;
    if (d.toDateString() === now.toDateString()) return "今天 " + timePart;
    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "昨天 " + timePart;
    var diffDays = Math.floor((now - d) / 86400000);
    if (diffDays < 7) return diffDays + " 天前 " + timePart;
    return d.getMonth() + 1 + "月" + d.getDate() + "日 " + timePart;
  }

  function isCronRefreshStale(isoStr, maxHours) {
    if (!isoStr) return true;
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return true;
    return Date.now() - d.getTime() > (maxHours || 26) * 3600000;
  }

  async function fetchCronRefreshStatus(apiBase) {
    var base = (apiBase || "").replace(/\/+$/, "");
    if (!base && typeof location !== "undefined" && location.origin) {
      base = location.origin;
    }
    if (!base) return null;
    var res = await fetch(base + "/api/cron/status");
    if (!res.ok) return null;
    var data = await res.json();
    return data && data.ok ? data : null;
  }

  window.formatCronRefreshAt = formatCronRefreshAt;
  window.isCronRefreshStale = isCronRefreshStale;
  window.fetchCronRefreshStatus = fetchCronRefreshStatus;
})();
