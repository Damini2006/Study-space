/**
 * Notes: opening an existing note, and the plain-text pipeline behind search.
 *
 * `editingNote` was only ever set to `null` — NoteCard had no click
 * handler, so a saved note could never be reopened: "Edit note", the
 * `if (editingNote) updateMutation...` branch and PATCH /notes/{id} were
 * all unreachable dead code while notes stayed write-once. These tests
 * pin the wired version (card opens the editor with the note, Save goes
 * through update, pin does not open the editor, New note still creates)
 * plus the source-level claims that exports use the shared downloadBlob
 * and that content_text is derived server-side from the document.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import Notes from "@/pages/Notes";

const { notesApi } = vi.hoisted(() => ({
  notesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/services/api-services", () => ({ notesApi }));

const DOC = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Osmosis moves water." }] },
  ],
};

const NOTE = {
  id: "note-1",
  title: "Mitosis notes",
  content: DOC,
  content_text: "Osmosis moves water.",
  tags: ["bio"],
  pinned: false,
  color: "#FFF9B3",
  space_id: null,
  created_at: "2026-10-08T09:00:00Z",
  updated_at: "2026-10-08T09:00:00Z",
};

function renderNotes() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Notes />
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  notesApi.list.mockResolvedValue([NOTE]);
  notesApi.create.mockResolvedValue({ ...NOTE, id: "note-2", title: "New" });
  notesApi.update.mockResolvedValue({ ...NOTE, pinned: true });
  notesApi.delete.mockResolvedValue(undefined);
});

describe("opening an existing note", () => {
  it("starts the editor from the note and saves through PATCH", async () => {
    const user = userEvent.setup();
    renderNotes();

    await user.click(await screen.findByRole("button", { name: "Edit Mitosis notes" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit note" });
    expect(within(dialog).getByPlaceholderText("Note title")).toHaveValue("Mitosis notes");

    await user.click(within(dialog).getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(notesApi.update).toHaveBeenCalledTimes(1));
    expect(notesApi.update).toHaveBeenCalledWith(
      "note-1",
      expect.objectContaining({ title: "Mitosis notes" })
    );
    expect(notesApi.create).not.toHaveBeenCalled();
  });

  it("toggles a pin without opening the editor", async () => {
    const user = userEvent.setup();
    renderNotes();

    await user.click(await screen.findByRole("button", { name: "Pin" }));
    await waitFor(() =>
      expect(notesApi.update).toHaveBeenCalledWith("note-1", { pinned: true })
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("still creates from New note rather than editing", async () => {
    const user = userEvent.setup();
    renderNotes();

    await user.click(await screen.findByRole("button", { name: /New note/ }));
    const dialog = await screen.findByRole("dialog", { name: "New note" });
    await user.click(within(dialog).getByRole("button", { name: "Save note" }));

    await waitFor(() => expect(notesApi.create).toHaveBeenCalledTimes(1));
    expect(notesApi.update).not.toHaveBeenCalled();
  });
});

describe("the plain-text pipeline behind it", () => {
  const FRONTEND = fs.existsSync(path.join(process.cwd(), "index.html"))
    ? process.cwd()
    : path.join(process.cwd(), "frontend");
  // Normalise line endings: the working tree may be CRLF while git stores LF.
  const read = (...parts) =>
    fs.readFileSync(path.join(FRONTEND, ...parts), "utf8").replace(/\r\n/g, "\n");

  it("derives content_text server-side instead of trusting the client", () => {
    const ROUTER = read("..", "backend", "studyspace", "routers", "notes.py");
    expect(ROUTER).toContain("coalesce(nullif(public.jsonb_tiptap_text($2::jsonb), ''), $3, '')");
    expect(ROUTER).toContain("content_text = coalesce(nullif(public.jsonb_tiptap_text(");
    const MIGRATION = read("..", "supabase", "migrations", "0012_notes_content_text.sql");
    expect(MIGRATION).toContain("create or replace function public.jsonb_tiptap_text");
    expect(MIGRATION).toContain("update public.notes\nset content_text = public.jsonb_tiptap_text(content)");
  });

  it("exports through the one downloadBlob in lib/export-file", () => {
    const SRC = read("src", "pages", "Notes.jsx");
    expect(SRC).toContain('import { downloadBlob } from "@/lib/export-file"');
    expect(SRC).not.toContain("URL.createObjectURL"); // no second implementation
  });
});
