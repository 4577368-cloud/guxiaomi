/** AI 回复富文本渲染：隐藏 Markdown 标记，用样式强调标题/数字/重点 */
(function () {
  function stripMdDecor(line) {
    var t = String(line || "").trim();
    t = t.replace(/^#{1,6}\s+/, "");
    t = t.replace(/^[-*•]\s+/, "");
    t = t.replace(/^\d+[.)]\s+/, "");
    return t.trim();
  }

  function headingLevel(line) {
    var m = String(line || "").match(/^(#{1,6})\s+/);
    return m ? m[1].length : 0;
  }

  function renderInline(text, keyBase) {
    var parts = [];
    var src = String(text || "");
    var boldRe = /\*\*([^*]+)\*\*/g;
    var last = 0;
    var m;
    var idx = 0;

    function pushPlain(chunk) {
      if (!chunk) return;
      var numRe = /([-+]?\d{1,3}(?:,\d{3})*(?:\.\d+)?%?)/g;
      var segLast = 0;
      var nm;
      while ((nm = numRe.exec(chunk)) !== null) {
        if (nm.index > segLast) {
          parts.push(
            React.createElement(
              "span",
              { key: keyBase + "-t" + idx++ },
              chunk.slice(segLast, nm.index),
            ),
          );
        }
        var val = nm[1];
        var isPct = val.indexOf("%") >= 0;
        var isNeg = val.indexOf("-") === 0;
        parts.push(
          React.createElement(
            "span",
            {
              key: keyBase + "-n" + idx++,
              className:
                "font-semibold tabular-nums " +
                (isPct
                  ? isNeg
                    ? "text-rose-600"
                    : "text-emerald-600"
                  : "text-cyan-700"),
            },
            val,
          ),
        );
        segLast = nm.index + val.length;
      }
      if (segLast < chunk.length) {
        parts.push(
          React.createElement("span", { key: keyBase + "-r" + idx++ }, chunk.slice(segLast)),
        );
      }
    }

    while ((m = boldRe.exec(src)) !== null) {
      if (m.index > last) pushPlain(src.slice(last, m.index));
      parts.push(
        React.createElement(
          "strong",
          { key: keyBase + "-b" + idx++, className: "font-semibold text-slate-900" },
          m[1],
        ),
      );
      last = m.index + m[0].length;
    }
    if (last < src.length) pushPlain(src.slice(last));
    if (!parts.length) return [React.createElement("span", { key: keyBase + "-e" }, "")];
    return parts;
  }

  function GlobalChatRichText(props) {
    var text = props.text;
    if (!text) return null;
    var lines = String(text).split(/\r?\n/);
    var nodes = [];

    lines.forEach(function (line, i) {
      var raw = line.trim();
      if (!raw) {
        nodes.push(React.createElement("div", { key: "sp" + i, className: "h-1.5" }));
        return;
      }

      var hl = headingLevel(line);
      var content = stripMdDecor(raw);
      content = content.replace(/`([^`]+)`/g, "$1");
      content = content.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

      if (hl === 1) {
        nodes.push(
          React.createElement(
            "p",
            { key: "h1" + i, className: "mt-3 mb-1 text-base font-bold text-slate-900 first:mt-0" },
            renderInline(content, "h1" + i),
          ),
        );
        return;
      }
      if (hl === 2) {
        nodes.push(
          React.createElement(
            "p",
            { key: "h2" + i, className: "mt-2.5 mb-1 text-[15px] font-bold text-teal-800" },
            renderInline(content, "h2" + i),
          ),
        );
        return;
      }
      if (hl >= 3) {
        nodes.push(
          React.createElement(
            "p",
            { key: "h3" + i, className: "mt-2 mb-0.5 text-sm font-semibold text-slate-800" },
            renderInline(content, "h3" + i),
          ),
        );
        return;
      }

      if (/^[-*•]\s+/.test(raw) || /^\d+[.)]\s+/.test(raw)) {
        nodes.push(
          React.createElement(
            "p",
            { key: "li" + i, className: "flex gap-2 pl-1 text-[15px] leading-relaxed text-slate-700" },
            React.createElement("span", { className: "shrink-0 text-teal-600", "aria-hidden": true }, "•"),
            React.createElement("span", { className: "min-w-0" }, renderInline(content, "li" + i)),
          ),
        );
        return;
      }

      nodes.push(
        React.createElement(
          "p",
          { key: "p" + i, className: "text-[15px] leading-relaxed text-slate-700 whitespace-pre-wrap" },
          renderInline(content, "p" + i),
        ),
      );
    });

    return React.createElement("div", { className: "space-y-1 break-words" }, nodes);
  }

  window.GlobalChatRichText = GlobalChatRichText;
})();
