import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

export const NOTE_PLACEHOLDER = "Start writing…";

const EMPTY_DOC = { type: "doc", content: [] };

/**
 * Builds the note editor.
 *
 * Kept out of the Notes dialog so the dialog stays about layout and state,
 * and so the exact configuration a note is edited with — extensions,
 * placeholder, serialisation on update — is one thing that both the page and
 * the test that guards it point at, rather than two copies that can drift.
 *
 * `content` is TipTap JSON, not HTML: what comes back out of `getJSON()` is
 * what gets stored, and `tiptapToText()` turns it back into text for search
 * and export.
 */
export function createNoteEditor({ content, onUpdate }) {
  return new Editor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: NOTE_PLACEHOLDER })],
    content: content || EMPTY_DOC,
    onUpdate,
  });
}
