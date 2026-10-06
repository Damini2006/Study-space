import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { EditorContent } from "@tiptap/react";
import { createNoteEditor, NOTE_PLACEHOLDER } from "@/lib/editor";
import { tiptapToText } from "@/lib/utils";

/**
 * The Notes dialog had no test, so a dependency major that quietly broke the
 * editor would have shipped looking green. These cover the four things the
 * page actually depends on: loading what was stored, reporting edits back in
 * a shape it can store, the placeholder, and a save/load round trip.
 */

const PARA = (text) => ({
  type: "paragraph",
  content: text ? [{ type: "text", text }] : undefined,
});

const DOC = (...nodes) => ({ type: "doc", content: nodes });

const ITEM = (text) => ({ type: "listItem", content: [PARA(text)] });

describe("the note editor", () => {
  it("loads a document that was stored earlier", () => {
    const editor = createNoteEditor({
      content: DOC(PARA("Spaced repetition, reviewed nightly")),
    });
    const { container } = render(<EditorContent editor={editor} />);

    expect(editor.getText()).toContain("Spaced repetition, reviewed nightly");
    expect(container.textContent).toContain("Spaced repetition");

    editor.destroy();
  });

  it("reports edits as JSON the page can store and read back", () => {
    const onUpdate = vi.fn();
    const editor = createNoteEditor({
      content: DOC(PARA()),
      onUpdate: ({ editor: next }) => onUpdate(next.getJSON()),
    });
    render(<EditorContent editor={editor} />);

    editor.commands.insertContent("typed into the dialog");

    expect(onUpdate).toHaveBeenCalled();
    const saved = onUpdate.mock.calls.at(-1)[0];
    expect(saved.type).toBe("doc");
    // tiptapToText is what search, the sidebar preview and .txt export use.
    expect(tiptapToText(saved)).toContain("typed into the dialog");

    editor.destroy();
  });

  it("shows the placeholder on a note with nothing in it", () => {
    const editor = createNoteEditor({ content: DOC(PARA()) });
    const { container } = render(<EditorContent editor={editor} />);

    const empty = container.querySelector("[data-placeholder]");
    expect(empty).not.toBeNull();
    expect(empty.getAttribute("data-placeholder")).toBe(NOTE_PLACEHOLDER);
    expect(empty.classList.contains("is-editor-empty")).toBe(true);

    editor.destroy();
  });

  it("loads a document written before the tiptap 3 upgrade", () => {
    // Shaped exactly as v2's getJSON() wrote it — the JSON already sitting in
    // users' notes. Three things have to hold: every word still arrives, the
    // block structure around it survives, and the editor accepts the document
    // without complaining. ProseMirror will not throw on malformed node
    // structure — Schema.node() creates without checking content — so the
    // shape is asserted directly instead of inferred from a clean console.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const editor = createNoteEditor({
      content: DOC(
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Chapter one" }],
        },
        {
          type: "bulletList",
          content: [ITEM("first point"), ITEM("second point")],
        },
        {
          type: "codeBlock",
          attrs: { language: "js" },
          content: [{ type: "text", text: "const x = 1;" }],
        }
      ),
    });
    render(<EditorContent editor={editor} />);

    expect(editor.getText()).toContain("Chapter one");
    expect(editor.getText()).toContain("first point");
    expect(editor.getText()).toContain("second point");
    expect(editor.getText()).toContain("const x = 1;");

    const reloaded = editor.getJSON();
    expect(reloaded.content.map((node) => node.type)).toEqual([
      "heading",
      "bulletList",
      "codeBlock",
    ]);
    expect(reloaded.content[0].attrs.level).toBe(2);
    expect(reloaded.content[1].content[0].type).toBe("listItem");

    const logged = [...warn.mock.calls, ...error.mock.calls]
      .map((args) => String(args[0]))
      .join(" ");
    expect(logged).not.toContain("Invalid content");

    warn.mockRestore();
    error.mockRestore();
    editor.destroy();
  });

  it("round-trips a saved document without losing content", () => {
    const first = createNoteEditor({
      content: DOC(PARA("First paragraph"), PARA("Second paragraph")),
    });
    const stored = first.getJSON();
    first.destroy();

    const second = createNoteEditor({ content: stored });
    render(<EditorContent editor={second} />);

    expect(second.getText()).toContain("First paragraph");
    expect(second.getText()).toContain("Second paragraph");
    expect(JSON.stringify(second.getJSON())).toBe(JSON.stringify(stored));

    second.destroy();
  });
});
