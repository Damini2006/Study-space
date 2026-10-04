/**
 * Canvas-painted textures for the sign-in scene.
 *
 * Everything on the cards is drawn into a 2D canvas and uploaded as a
 * THREE.CanvasTexture. That keeps typography crisp, avoids fetching a web
 * font inside WebGL, and lets us repaint only when something actually
 * changes (mode switch, citation chip lighting up).
 */

const INK = "#2a2740";
const INK_SOFT = "#57526b";

export const MODE_CARD_TINT = {
  signin: { light: "#fbf6ea", dark: "#211f3a", edge: "#7c79cc" },
  signup: { light: "#fdf1f7", dark: "#271f36", edge: "#ffa3c6" },
  forgot: { light: "#f2f1ff", dark: "#1f1e3d", edge: "#9d9ae6" },
  reset: { light: "#f2f1ff", dark: "#1f1e3d", edge: "#9d9ae6" },
};

export const FEATURE_CARDS = [
  { label: "Notes", glyph: "\u2328" },
  { label: "Quiz", glyph: "?" },
  { label: "Planner", glyph: "\u25cb" },
  { label: "Source [1]", glyph: "\u201c" },
  { label: "Focus", glyph: "\u25cf" },
];

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrap(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const lines = wrap(ctx, text, maxWidth).slice(0, maxLines);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

function mono(ctx, size) {
  ctx.font = `600 ${size}px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace`;
}

function sans(ctx, weight, size) {
  ctx.font = `${weight} ${size}px Inter, ui-sans-serif, system-ui, sans-serif`;
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/* ------------------------------------------------------------------ */
/*  Front face — the question                                          */
/* ------------------------------------------------------------------ */
export function paintQuestion(ctx, { tint, dark, width, height }) {
  const ink = dark ? "#f4f0e7" : INK;
  const inkSoft = dark ? "#b5afce" : INK_SOFT;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = tint;
  roundRect(ctx, 0, 0, width, height, 40);
  ctx.fill();

  // top rule
  ctx.strokeStyle = dark ? "rgba(255,255,255,0.16)" : "rgba(42,39,64,0.14)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(56, 128);
  ctx.lineTo(width - 56, 128);
  ctx.stroke();

  // eyebrow
  ctx.fillStyle = "#5b57b5";
  roundRect(ctx, 56, 56, 176, 52, 26);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  mono(ctx, 26);
  ctx.textBaseline = "middle";
  ctx.fillText("QUESTION", 84, 83);

  ctx.fillStyle = inkSoft;
  mono(ctx, 24);
  ctx.textAlign = "right";
  ctx.fillText("CARD 12 / 24", width - 56, 83);
  ctx.textAlign = "left";

  // body
  ctx.fillStyle = ink;
  sans(ctx, 600, 54);
  ctx.textBaseline = "alphabetic";
  drawText(
    ctx,
    "Why does an ideal gas cool when it expands adiabatically?",
    56,
    232,
    width - 112,
    72,
    4
  );

  // footer
  ctx.fillStyle = inkSoft;
  mono(ctx, 24);
  ctx.fillText("CHAPTER 3 \u00b7 THERMODYNAMICS", 56, height - 64);
}

/* ------------------------------------------------------------------ */
/*  Back face — the cited answer                                       */
/* ------------------------------------------------------------------ */
export function paintAnswer(ctx, { tint, dark, width, height, lit = 2 }) {
  const ink = dark ? "#f4f0e7" : INK;
  const inkSoft = dark ? "#b5afce" : INK_SOFT;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = tint;
  roundRect(ctx, 0, 0, width, height, 40);
  ctx.fill();

  ctx.strokeStyle = dark ? "rgba(255,255,255,0.16)" : "rgba(42,39,64,0.14)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(56, 128);
  ctx.lineTo(width - 56, 128);
  ctx.stroke();

  ctx.fillStyle = "#e2608f";
  roundRect(ctx, 56, 56, 148, 52, 26);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  mono(ctx, 26);
  ctx.textBaseline = "middle";
  ctx.fillText("ANSWER", 84, 83);

  ctx.fillStyle = inkSoft;
  mono(ctx, 24);
  ctx.textAlign = "right";
  ctx.fillText("CITED", width - 56, 83);
  ctx.textAlign = "left";

  ctx.fillStyle = ink;
  sans(ctx, 500, 46);
  ctx.textBaseline = "alphabetic";
  const after = drawText(
    ctx,
    "Because no heat crosses the boundary, any work the gas does comes from its own internal energy.",
    56,
    214,
    width - 112,
    62,
    4
  );

  // citation chips light up one after the other
  const chips = [
    { label: "[1]", ref: "ADIABATIC \u00b7 P.14" },
    { label: "[2]", ref: "WORKED EX. 4 \u00b7 P.21" },
  ];
  let cx = 56;
  const cy = Math.min(after + 26, height - 150);
  chips.forEach((c, i) => {
    const on = i < lit;
    mono(ctx, 26);
    const w = 54 + ctx.measureText(c.ref).width + 44;
    ctx.fillStyle = on
      ? dark
        ? "#a9a6ee"
        : "#5b57b5"
      : dark
        ? "rgba(255,255,255,0.10)"
        : "rgba(42,39,64,0.08)";
    roundRect(ctx, cx, cy, w, 56, 28);
    ctx.fill();

    ctx.fillStyle = on ? "#ffffff" : dark ? "#8f8ab5" : "#8b85a1";
    ctx.textBaseline = "middle";
    ctx.fillText(c.label, cx + 22, cy + 29);
    mono(ctx, 22);
    ctx.fillText(c.ref, cx + 54 + 34, cy + 30);
    cx += w + 18;
  });

  // honest footer
  ctx.strokeStyle = dark ? "rgba(255,255,255,0.16)" : "rgba(42,39,64,0.14)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(56, height - 96);
  ctx.lineTo(width - 56, height - 96);
  ctx.stroke();
  ctx.fillStyle = inkSoft;
  mono(ctx, 24);
  ctx.textBaseline = "middle";
  const cited = Math.min(lit, 2);
  ctx.fillText(`${cited} OF 2 CLAIMS CITED`, 56, height - 56);
}

/* ------------------------------------------------------------------ */
/*  Orbiting feature cards                                             */
/* ------------------------------------------------------------------ */
export function paintFeature(ctx, { label, glyph, dark, width, height }) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = dark ? "#232040" : "#ffffff";
  roundRect(ctx, 0, 0, width, height, 44);
  ctx.fill();

  ctx.strokeStyle = dark ? "rgba(255,255,255,0.18)" : "rgba(124,121,204,0.45)";
  ctx.lineWidth = 5;
  roundRect(ctx, 3, 3, width - 6, height - 6, 42);
  ctx.stroke();

  // glyph badge
  ctx.fillStyle = dark ? "#2e2b52" : "#efedff";
  roundRect(ctx, 40, height / 2 - 56, 112, 112, 34);
  ctx.fill();
  ctx.fillStyle = "#5b57b5";
  sans(ctx, 700, 58);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, 96, height / 2 + 2);

  // label
  ctx.fillStyle = dark ? "#f4f0e7" : INK;
  ctx.textAlign = "left";
  sans(ctx, 600, 46);
  ctx.fillText(label, 180, height / 2 + 2);
  ctx.textAlign = "left";
}

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */
export function createCardTextures({ mode = "signin", dark = false, lit = 2 }) {
  const W = 1024;
  const H = 640;
  const tint = (MODE_CARD_TINT[mode] || MODE_CARD_TINT.signin)[dark ? "dark" : "light"];

  const front = makeCanvas(W, H);
  const back = makeCanvas(W, H);
  paintQuestion(front.getContext("2d"), { tint, dark, width: W, height: H });
  paintAnswer(back.getContext("2d"), { tint, dark, width: W, height: H, lit });

  return { front, back, tint, W, H };
}

export function createFeatureTexture({ label, glyph, dark }) {
  const W = 640;
  const H = 256;
  const c = makeCanvas(W, H);
  paintFeature(c.getContext("2d"), { label, glyph, dark, width: W, height: H });
  return c;
}
