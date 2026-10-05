import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn-style class combiner */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** Debounce a function call */
export function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/** Throttle a function call */
export function throttle(fn, limit = 300) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/** Clamp a number between min and max */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function formatDate(value, opts) {
  const options = opts || { month: "short", day: "numeric" };
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, options);
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
}

export function relativeTime(value) {
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + "d ago";
  return formatDate(d, { month: "short", day: "numeric", year: "numeric" });
}

export function initials(name) {
  const value = name || "?";
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(function (w) { return w[0].toUpperCase(); })
    .join("");
}

export function tiptapToText(doc) {
  if (!doc || typeof doc !== "object") return "";
  const walk = function (node) {
    if (!node) return "";
    if (node.type === "text") return node.text || "";
    if (Array.isArray(node.content)) return node.content.map(walk).join("");
    return "";
  };
  return walk(doc).replace(/\n{3,}/g, "\n\n").trim();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(escaped) {
  let out = escaped;
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return out;
}

export function mdToHtml(markdown) {
  if (!markdown) return "";
  let src = String(markdown).replace(/\r\n/g, "\n");
  const codeBlocks = [];
  src = src.replace(/```([\w-]*)\n([\s\S]*?)```/g, function (_, lang, code) {
    const token = "\u0000CB" + codeBlocks.length + "\u0000";
    codeBlocks.push(
      '<pre><code class="language-' + (lang || "") + '">' +
        code.replace(/\n$/, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
        "</code></pre>"
    );
    return token;
  });

  const lines = src.split("\n");
  const html = [];
  let paragraph = [];
  let listTag = null;
  let tableRows = [];

  const flushParagraph = function () {
    if (paragraph.length) {
      html.push("<p>" + inline(escapeHtml(paragraph.join(" "))) + "</p>");
      paragraph = [];
    }
  };
  const closeList = function () {
    if (listTag) {
      html.push("</" + listTag + ">");
      listTag = null;
    }
  };
  const cells = function (row) {
    return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); });
  };
  const flushTable = function () {
    if (tableRows.length) {
      const head = tableRows[0];
      let body = tableRows.slice(1);
      if (body.length && /^[\s:|-]+$/.test(body[0])) body = body.slice(1);
      html.push(
        "<table><thead><tr>" +
          cells(head).map(function (c) { return "<th>" + inline(escapeHtml(c)) + "</th>"; }).join("") +
          "</tr></thead><tbody>" +
          body
            .filter(function (r) { return r.trim().startsWith("|"); })
            .map(function (r) {
              return "<tr>" + cells(r).map(function (c) { return "<td>" + inline(escapeHtml(c)) + "</td>"; }).join("") + "</tr>";
            })
            .join("") +
          "</tbody></table>"
      );
      tableRows = [];
    }
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (/^\u0000CB\d+\u0000$/.test(trimmed)) {
      flushParagraph();
      closeList();
      flushTable();
      html.push(trimmed);
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      closeList();
      flushTable();
      continue;
    }
    if (trimmed.startsWith("|")) {
      flushParagraph();
      closeList();
      tableRows.push(trimmed);
      continue;
    }
    flushTable();

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push("<h" + level + ">" + inline(escapeHtml(heading[2])) + "</h" + level + ">");
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushParagraph();
      closeList();
      html.push("<hr />");
      continue;
    }
    if (trimmed.startsWith(">")) {
      flushParagraph();
      closeList();
      html.push("<blockquote>" + inline(escapeHtml(trimmed.replace(/^>\s?/, ""))) + "</blockquote>");
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(trimmed);
    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ul || ol) {
      flushParagraph();
      const want = ul ? "ul" : "ol";
      if (listTag !== want) {
        closeList();
        html.push("<" + want + ">");
        listTag = want;
      }
      html.push("<li>" + inline(escapeHtml((ul || ol)[1])) + "</li>");
      continue;
    }
    if (listTag && /^\s{2,}\S/.test(raw)) {
      html[html.length - 1] = html[html.length - 1].replace(/<\/li>$/, " " + inline(escapeHtml(trimmed)) + "</li>");
      continue;
    }
    closeList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  closeList();
  flushTable();

  let result = html.join("");
  codeBlocks.forEach(function (block, i) {
    result = result.replace("\u0000CB" + i + "\u0000", block);
  });
  return result;
}
