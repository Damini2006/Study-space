import { expect, test } from "@playwright/test";
import {
  PROFILE,
  signInViaForm,
  stubApi,
  stubNotesApi,
  stubSupabaseAuth,
} from "./support.js";

/**
 * A whole note's life, through the real UI: written in the tiptap editor,
 * saved over the wire, refetched into the list, pinned, filtered by search,
 * then deleted. Everything between the button and the fixture is the
 * shipping app — react-query, the api client, the mutations.
 */
let errors;

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  // The delete path asks the browser to confirm, and Playwright dismisses
  // any dialog it has not been handed — which would quietly turn the last
  // step of this test into a no-op that still passed every assertion before it.
  page.on("dialog", (dialog) => dialog.accept());
});

test.afterEach(() => {
  expect(errors, "no uncaught exceptions").toEqual([]);
});

/** Signed in and looking at Notes, with every host the page talks to stubbed. */
async function openNotes(page) {
  await stubSupabaseAuth(page);
  await stubApi(page, { "/api/me": PROFILE });
  await stubNotesApi(page);

  await page.goto("/app/notes");
  await expect(page).toHaveURL(/\/auth$/);
  await signInViaForm(page);
  await expect(page).toHaveURL(/\/app\/notes$/);
}

// The editor used to be rendered unconditionally with `open` hardcoded and
// an onClose that wrote back `null` — the value already in state. So it
// appeared the moment you arrived, and no control could dismiss it: the
// modal covered the list and search, and Cancel, the X, the backdrop and
// Escape were all no-ops. Nothing in the page could reach the editor now.
test("the note editor opens on request and closes again", async ({ page }) => {
  await openNotes(page);

  await expect(
    page.getByRole("heading", { name: "New note", level: 2 })
  ).toHaveCount(0);

  await page.getByRole("button", { name: "New note" }).click();
  await expect(
    page.getByRole("heading", { name: "New note", level: 2 })
  ).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("heading", { name: "New note", level: 2 })
  ).toHaveCount(0);
});

test("a note can be written, found and deleted", async ({ page }) => {
  await openNotes(page);

  // A fresh account, and an honest answer from the stub for one.
  await expect(
    page.getByRole("heading", { name: "No notes yet" })
  ).toBeVisible();

  await page.getByRole("button", { name: "New note" }).click();
  await page.getByPlaceholder("Note title").fill("Photosynthesis flashcards");
  await page
    .locator('[contenteditable="true"]')
    .fill("Chlorophyll absorbs red and blue light.");

  // aria-live reports what the editor parsed, not what the test typed — a
  // fill that never reached the editor would leave this reading 0 words.
  const stats = page.locator('[aria-live="polite"]').filter({ hasText: "words" });
  await expect(stats).toContainText("6 words");

  await page.getByRole("button", { name: "Save note" }).click();

  // The assertion a static fixture would fail: the list is refetched after
  // the mutation, so it can only show this note if the write really landed.
  await expect(
    page.getByRole("heading", { name: "Photosynthesis flashcards" })
  ).toBeVisible();

  // Pinning is the update path — a PATCH with { pinned: true } that has to
  // come back before the button changes what it offers.
  await page.getByRole("button", { name: "Pin" }).click();
  await expect(page.getByRole("button", { name: "Unpin" })).toBeVisible();

  // Filtering in both directions — a term that matches nothing has to say so
  // rather than quietly showing every note back.
  const search = page.getByPlaceholder("Search notes…");
  await search.fill("mitosis");
  await expect(page.getByText("No notes match your filters.")).toBeVisible();
  await search.fill("flash");
  await expect(
    page.getByRole("heading", { name: "Photosynthesis flashcards" })
  ).toBeVisible();
  await search.fill("");

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(
    page.getByRole("heading", { name: "No notes yet" })
  ).toBeVisible();
});
