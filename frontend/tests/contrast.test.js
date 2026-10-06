import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Colour-contrast audit over the design tokens in globals.css.
 *
 * The values are read out of the stylesheet rather than copied in here, so a
 * token edit is measured rather than assumed — the numbers below are what a
 * user's screen actually ends up with. Text needs 4.5:1 (WCAG 1.4.3); focus
 * rings and control outlines need 3:1 (WCAG 1.4.11).
 */

const stylesheet = ["src/styles/globals.css", "frontend/src/styles/globals.css"]
  .map((p) => resolvePath(process.cwd(), p))
  .find((p) => existsSync(p));

if (!stylesheet) {
  throw new Error(`globals.css not found from ${process.cwd()}`);
}

const css = readFileSync(stylesheet, "utf8");

/** Body of the first rule matching `re` — first wins, because later matches
 *  are the print / forced-colour overrides that are not the resting theme. */
function ruleBody(re) {
  const match = re.exec(css);
  if (!match) return null;
  const start = match.index + match[0].length;
  return css.slice(start, css.indexOf("}", start));
}

function declarations(body) {
  const out = {};
  if (!body) return out;
  for (const decl of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    out[decl[1]] = decl[2].trim();
  }
  return out;
}

function resolve(theme, value, depth = 0) {
  const ref = typeof value === "string" && value.match(/^var\(--([\w-]+)\)$/);
  if (!ref || depth > 10) return value;
  return resolve(theme, theme[ref[1]], depth + 1);
}

const base = declarations(ruleBody(/:root\s*\{/));
const themes = { light: base };
for (const name of ["dark", "cozy", "pastel"]) {
  const own = declarations(
    ruleBody(new RegExp(`\\[data-theme="${name}"\\]\\s*\\{`))
  );
  // Themes only override what they differ in; the rest cascades from :root.
  themes[name] = { ...base, ...own };
}

// [foreground token, background token, where it shows up]
const TEXT_PAIRS = [
  ["text", "bg", "body text on the page"],
  ["text", "surface", "body text on a card"],
  ["text", "surface-2", "body text on a secondary surface"],
  ["text-muted", "bg", "secondary text on the page"],
  ["text-muted", "surface", "secondary text on a card"],
  ["text-muted", "surface-2", "secondary text on a secondary surface"],
  ["on-primary", "primary", "primary button label"],
  ["primary", "surface", "primary text on a card"],
  ["primary", "bg", "primary text on the page"],
  ["primary", "surface-2", "primary text on a secondary surface"],
  ["success", "success-bg", "success message"],
  ["warning", "warning-bg", "warning message"],
  ["danger", "danger-bg", "danger message"],
  ["info", "info-bg", "info message"],
  ["citation-text", "citation-bg", "citation label"],
];

const UI_PAIRS = [
  ["ring", "surface", "focus ring on a card"],
  ["ring", "bg", "focus ring on the page"],
  ["ring", "surface-2", "focus ring on a secondary surface"],
  ["input", "surface", "control outline on a card"],
  ["input", "bg", "control outline on the page"],
];

describe.each(Object.entries(themes))("%s theme", (themeName, theme) => {
  const value = (token) => resolve(theme, theme[token]);

  it.each(TEXT_PAIRS)("clears 4.5:1 — %s on %s (%s)", (fg, bg) => {
    expect(Number(ratio(value(fg), value(bg)).toFixed(2))).toBeGreaterThanOrEqual(
      4.5
    );
  });

  it.each(UI_PAIRS)("clears 3:1 — %s on %s (%s)", (fg, bg) => {
    expect(Number(ratio(value(fg), value(bg)).toFixed(2))).toBeGreaterThanOrEqual(
      3
    );
  });

  it("resolves every tested token to a colour", () => {
    for (const [fg, bg] of [...TEXT_PAIRS, ...UI_PAIRS]) {
      expect(value(fg), `${themeName} --${fg}`).toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(value(bg), `${themeName} --${bg}`).toMatch(/^#[0-9a-f]{3,8}$/i);
    }
  });
});

describe("themes that follow the OS rather than a data attribute", () => {
  // The prefers-color-scheme block is a hand-maintained copy of
  // [data-theme="dark"], and nothing fails loudly when the two drift apart.
  const PARITY = [
    "bg",
    "surface",
    "surface-2",
    "border",
    "input",
    "text",
    "text-muted",
    "primary",
    "on-primary",
    "success",
    "success-bg",
    "warning",
    "warning-bg",
    "danger",
    "danger-bg",
    "info",
    "info-bg",
    "citation-bg",
    "citation-text",
  ];

  const osDark = declarations(
    ruleBody(/:root:not\(\[data-theme\]\):not\(\[data-theme="light"\]\)\s*\{/)
  );

  it("exists", () => {
    expect(Object.keys(osDark).length).toBeGreaterThan(0);
  });

  it.each(PARITY)("matches the dark theme for --%s", (token) => {
    expect(osDark[token], `--${token} in the OS-dark block`).toBe(
      themes.dark[token]
    );
  });
});

function relativeLuminance(hex) {
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [high, low] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (high + 0.05) / (low + 0.05);
}
