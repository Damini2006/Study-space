/**
 * Studio output download: one real button instead of three dead ones.
 *
 * The panel used to offer pdf/anki/markdown export buttons calling
 * `studioApi.exportPdf/exportAnki/exportMarkdown` - none of which exist
 * on the client or the backend - plus a `toUppercase` typo that would
 * have thrown even if they had. These tests pin the honest version: a
 * single Download .md built from the output's own content through the
 * tested `outputToMarkdown` helper, with an empty output reported
 * instead of downloaded as a blank file.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { outputToMarkdown } from "@/lib/export-file";

const FRONTEND = fs.existsSync(path.join(process.cwd(), "index.html"))
  ? process.cwd()
  : path.join(process.cwd(), "frontend");
const read = (...parts) => fs.readFileSync(path.join(FRONTEND, ...parts), "utf8");
const PANEL = read("src", "components", "workspace", "StudioPanel.jsx");
const SERVICES = read("src", "services", "api-services.js");

describe("outputToMarkdown", () => {
  it("passes a summary's own markdown straight through", () => {
    const md = "# Photosynthesis\n\nLight reactions fix energy.";
    expect(outputToMarkdown({ type: "summary", content: { markdown: md } })).toBe(md);
  });

  it("renders flashcards as question and answer sections", () => {
    const md = outputToMarkdown({
      type: "flashcards",
      content: { cards: [{ front: "What is ATP?", back: "Energy currency" }] },
    });
    expect(md).toContain("What is ATP?");
    expect(md).toContain("Energy currency");
    expect(md).toContain("## Card 1");
  });

  it("renders quizzes with options, the answer, and the explanation", () => {
    const md = outputToMarkdown({
      type: "quiz",
      content: {
        questions: [
          {
            question: "Which organelle makes ATP?",
            options: ["Nucleus", "Mitochondrion", "Ribosome"],
            answer_index: 1,
            explanation: "The powerhouse.",
          },
        ],
      },
    });
    expect(md).toContain("Which organelle makes ATP?");
    expect(md).toContain("A. Nucleus");
    expect(md).toContain("**Answer:** B. Mitochondrion");
    expect(md).toContain("The powerhouse.");
  });

  it("returns nothing to download for content it cannot render", () => {
    expect(outputToMarkdown({ content: {} })).toBe("");
    expect(outputToMarkdown({ content: [{ unexpected: true }] })).toBe("");
    expect(outputToMarkdown(null)).toBe("");
  });
});

describe("the panel's download button", () => {
  it("never mentions methods that do not exist anywhere", () => {
    expect(PANEL).not.toContain("exportPdf");
    expect(PANEL).not.toContain("exportAnki");
    expect(PANEL).not.toContain("exportMarkdown");
    expect(PANEL).not.toContain("toUppercase");
    expect(SERVICES).not.toContain("exportPdf");
    expect(SERVICES).not.toContain("exportAnki");
    expect(SERVICES).not.toContain("exportMarkdown");
  });

  it("builds a text/markdown blob from the tested helper with a .md name", () => {
    expect(PANEL).toContain("outputToMarkdown(openOutput)");
    expect(PANEL).toContain('type: "text/markdown"');
    expect(PANEL).toContain(".toLowerCase()}.md");
    expect(PANEL).toContain('aria-label="Download markdown"');
    expect(PANEL).toContain("Downloaded .md");
  });

  it("reports an empty output instead of downloading a blank file", () => {
    expect(PANEL).toContain('if (!text.trim())');
    expect(PANEL).toContain("has no text to download");
    // The guard runs before any blob is built.
    expect(PANEL.indexOf("text.trim()")).toBeLessThan(PANEL.indexOf("new Blob("));
  });
});
