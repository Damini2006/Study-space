/**
 * The brand mark inside the application.
 *
 * The sidebar and mobile header drew a plain "SS" gradient box while the
 * landing page, auth page, manifest and favicon all used the bunny — the
 * one artwork in frontend/public (logo-mark.svg / logo-full.svg). The shell
 * now renders the same mark, kept inline so its strokes follow the theme
 * the way logo-mark.svg's hard-coded light-mode colors cannot.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { BunnyMark } from "@/components/brand/study-space-logo";

const FRONTEND = fs.existsSync(path.join(process.cwd(), "index.html"))
  ? process.cwd()
  : path.join(process.cwd(), "frontend");
const read = (...parts) => fs.readFileSync(path.join(FRONTEND, ...parts), "utf8");
const SHELL = read("src", "components", "layout", "AppShell.jsx");
const MARK = read("public", "logo-mark.svg");

const BODY_PATH = "M128 205 C132 215 118 224 106 217";

describe("BunnyMark", () => {
  it("draws the same artwork the public logo files carry", () => {
    const { container } = render(<BunnyMark size={34} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 438 362");
    expect(svg.innerHTML).toContain(BODY_PATH);
    expect(MARK).toContain(BODY_PATH);
  });

  it("follows the theme instead of freezing the file's light-mode colors", () => {
    const { container } = render(<BunnyMark size={34} />);
    const svg = container.querySelector("svg");
    expect(svg.innerHTML).toContain("var(--primary)");
    expect(svg.innerHTML).not.toContain("#4f5bd5");
  });
});

describe("the app shell", () => {
  it("renders the bunny mark where the SS monogram box used to be", () => {
    expect(SHELL).toContain('from "@/components/brand/study-space-logo"');
    expect(SHELL).toContain("<BunnyMark");
    expect(SHELL).not.toContain(">SS<");
  });
});
