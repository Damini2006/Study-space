/**
 * The Settings page itself: what its labels and code actually do.
 *
 * Three bugs rode on this page: the space pickers for Retrieval and
 * Audit labelled their options `s.name` on a SpaceOut whose field is
 * `title` (every option rendered "undefined"); a token-card onClick set
 * "editing" state whose close button could never render
 * (`editingToken?.id` reads .id off a string id); and the page was
 * titled "MCP Tokens" and exported as `MCPManagement` while carrying
 * eight tabs including the Data tab the FAQ points at.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND = fs.existsSync(path.join(process.cwd(), "index.html"))
  ? process.cwd()
  : path.join(process.cwd(), "frontend");
const read = (...parts) => fs.readFileSync(path.join(FRONTEND, ...parts), "utf8");
const SETTINGS = read("src", "pages", "Settings.jsx");

describe("the page's identity", () => {
  it("is exported as SettingsPage, not the stale MCPManagement", () => {
    expect(SETTINGS).toContain("export default function SettingsPage");
    expect(SETTINGS).not.toContain("MCPManagement");
  });

  it("titles itself for the whole page it is", () => {
    expect(SETTINGS).toContain(">Settings</h1>");
    expect(SETTINGS).not.toContain(">MCP Tokens</h1>");
    expect(SETTINGS).toContain("Tokens, model routing, prompts, retrieval, your data, and the app itself.");
  });
});

describe("the space pickers", () => {
  it("label options with the title SpaceOut actually has", () => {
    const titles = SETTINGS.match(/label: s\.title/g) ?? [];
    expect(titles.length).toBe(2); // Retrieval and Audit
    expect(SETTINGS).not.toContain("label: s.name"); // SpaceOut has no name
  });
});

describe("the token cards", () => {
  it("carry no phantom editing state whose close button can never render", () => {
    expect(SETTINGS).not.toContain("editingToken");
    expect(SETTINGS).not.toContain("setEditingToken");
  });
});
