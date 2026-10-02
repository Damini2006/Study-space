/**
 * Small, safe markdown renderer for AI output.
 *
 * Everything is HTML-escaped before formatting is applied, so model output
 * can never inject markup (XSS). Citation markers `[n]` become clickable
 * chips via event delegation (see CitationList / MessageBubble).
 */

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(escaped, { citations = true } = {}) {
  let out = escaped;
  // inline code first so other patterns don't touch it
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  // links: only http(s) and relative
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  if (citations) {
    out = out.replace(
      /\[(\d{1,3})\]/g,
      '<button type="button" class="citation-chip" data-citation="$1" aria-label="Open source passage $1">$1</button>'
    );
  }
  return out;
}

const LIST_TYPES = { ul: [], ol: [] };

export function mdToHtml(markdown, opts = {}) {
  if (!markdown) return "";
  const codeBlocks = [];
  let src = String(markdown).replace(/\r\n/g, "\n");

  // pull fenced code blocks out before escaping
  src = src.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const token = `\u0000CB${codeBlocks.length}\u0000`;
    codeBlocks.push(
      `<pre><code class="language-${escapeHtml(lang || "")}">${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`
    );
    return token;
  });

  const lines = src.split("\n");
  const html = [];
  let paragraph = [];
  let listTag = null;
  let tableRows = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${inline(escapeHtml(paragraph.join(" ")), opts)}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listTag) {
      html.push(`</${listTag}>`);
      listTag = null;
    }
  };
  const flushTable = () => {
    if (tableRows.length) {
      const [head, ...rest] = tableRows;
      const isRow = (r) => r.trim().startsWith("|");
      const cells = (row) =>
        row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      let body = rest;
      if (body.length && /^|[\s:|-]+$/.test(body[0])) body = body.slice(1);
      html.push(
        `<table><thead><tr>${cells(head)
          .map((c) => `<th>${inline(escapeHtml(c), opts)}</th>`)
          .join("")}</tr></thead><tbody>${body
          .filter(isRow)
          .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(escapeHtml(c), opts)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`
      );
      tableRows = [];
    }
  };

  for (const raw of lines) {
    const line = raw;
    const trimmed = line.trim();

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
      html.push(`<h${level}>${inline(escapeHtml(heading[2]), opts)}</h${level}>`);
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
      html.push(`<blockquote>${inline(escapeHtml(trimmed.replace(/^>\s?/, "")), opts)}</blockquote>`);
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(trimmed);
    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ul || ol) {
      flushParagraph();
      const want = ul ? "ul" : "ol";
      if (listTag !== want) {
        closeList();
        html.push(`<${want}>`);
        listTag = want;
      }
      html.push(`<li>${inline(escapeHtml((ul || ol)[1]), opts)}</li>`);
      continue;
    }
    if (listTag && /^\s{2,}\S/.test(line)) {
      // continuation of a list item
      html[html.length - 1] = html[html.length - 1].replace(
        /<\/li>$/,
        ` ${inline(escapeHtml(trimmed), opts)}</li>`
      );
      continue;
    }
    closeList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  closeList();
  flushTable();

  let result = html.join("");
  codeBlocks.forEach((block, i) => {
    result = result.replace(`\u0000CB${i}\u0000`, block);
  });
  return result;
}

/** Extract plain text from a TipTap JSON document (for exports/search). */
export function tiptapToText(doc) {
  if (!doc || typeof doc !== "object") return "";
  const walk = (node) => {
    if (!node) return "";
    if (node.type === "text") return node.text || "";
    if (Array.isArray(node.content)) return node.content.map(walk).join("");
    return "";
  };
  const blocks = walk(doc);
  return blocks.replace(/\n{3,}/g, "\n\n").trim();
}

export { LIST_TYPES };
