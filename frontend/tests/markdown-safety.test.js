import { describe, expect, it } from "vitest";
import { mdToHtml } from "@/lib/utils";

/**
 * Chat and Studio output is model-generated and rendered with
 * dangerouslySetInnerHTML, so this renderer is the app's main XSS boundary.
 * These are the vectors that would matter if escaping ever regressed.
 *
 * The invariant is deliberately about what is *emitted*: no dangerous element
 * and no event handler inside a tag, whatever the input does to get there.
 */

const DANGEROUS_ELEMENT =
  /<(script|iframe|object|embed|svg|style|link|meta|base|form)\b/i;
const HANDLER_IN_TAG = /<[a-z][^>]*\son[a-z]+\s*=/i;

// The renderer uses NUL-delimited tokens to park code blocks while it works.
const NUL = String.fromCharCode(0);

const VECTORS = [
  ["a raw script tag", "<script>alert(1)</script>"],
  ["an img with onerror", '<img src=x onerror="alert(1)">'],
  ["a tag with a click handler", '<a href="#" onclick="alert(1)">x</a>'],
  ["svg with onload", "<svg onload=alert(1)>"],
  ["a nested iframe", '<iframe src="javascript:alert(1)"></iframe>'],
  ["an attribute breakout", '"><script>alert(1)</script>'],
  ["payload in a heading", "# <script>alert(1)</script>"],
  ["payload in a list item", "- <script>alert(1)</script>"],
  ["payload in a blockquote", "> <script>alert(1)</script>"],
  ["payload in a table cell", "| <img src=x onerror=alert(1)> |\n| --- |\n| x |"],
  [
    "payload escaping a code fence",
    "```html\n</code></pre><script>alert(1)</script>\n```",
  ],
  ["payload behind an entity", "&lt;script&gt;alert(1)&lt;/script&gt;"],
  ["payload in a link label", '[<script>alert(1)</script>](https://example.com)'],
  [
    "a forged code-block sentinel",
    `${NUL}CB0${NUL}<script>alert(1)</script>`,
  ],
  ["a trailing script tag with no markdown", "hello\n<script>alert(1)</script>"],
];

describe("mdToHtml keeps model output inert", () => {
  it.each(VECTORS)("emits no dangerous markup for %s", (_label, input) => {
    const html = mdToHtml(input);
    expect(html).not.toMatch(DANGEROUS_ELEMENT);
    expect(html).not.toMatch(HANDLER_IN_TAG);
  });

  it("still renders the formatting it is meant to", () => {
    const html = mdToHtml(
      "**bold** and `code` and [a link](https://example.com)"
    );
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('<a href="https://example.com"');
  });
});

describe("mdToHtml links", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ])("will not emit a %s href", (url) => {
    const html = mdToHtml(`[click](${url})`);
    expect(html).not.toMatch(/<a\s[^>]*href\s*=\s*["']?[a-z]+:/i);
  });

  it("cannot break out of the href attribute", () => {
    // Escaping happens before the link is matched, so a quote in the URL
    // arrives as an entity — decoded as part of the value, never as the
    // delimiter that ends the attribute.
    const html = mdToHtml('[click](https://example.com/" onmouseover="alert(1))');
    expect(html).not.toMatch(HANDLER_IN_TAG);
  });

  it("cannot break out with an unspaced payload either", () => {
    const html = mdToHtml('[click](https://example.com/"onclick="alert(1))');
    expect(html).not.toMatch(HANDLER_IN_TAG);
    expect(html).toContain("&quot;");
  });

  it("hands external links over without the opener", () => {
    const html = mdToHtml("[click](https://example.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("allows ordinary relative links", () => {
    const html = mdToHtml("[home](/app)");
    expect(html).toContain('<a href="/app"');
  });
});
