import { expect, test } from "@playwright/test";
import { PROFILE, signInViaForm, stubApi, stubSupabaseAuth } from "./support.js";

/**
 * The gate in front of /app, driven through the real thing: a cold page load
 * at the protected URL, a real `signInWithPassword` against a stubbed
 * Supabase host, and real queries against a stubbed API. The unit suite
 * already covers Protected as a component — what it cannot cover is
 * supabase-js resolving a session on its own, which is the half that decides
 * whether the guard ever opens.
 */
let errors;

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
});

test.afterEach(() => {
  expect(errors, "no uncaught exceptions").toEqual([]);
});

test("a signed-out visitor deep in the app is replaced with the sign-in page", async ({
  page,
}) => {
  await page.goto("/app/focus");

  // Replace, not push: the URL the visitor could not reach is gone from
  // history rather than sitting behind Back as a second dead end.
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page).toHaveTitle("Sign in — StudySpace");
});

test("signing in returns the visitor to the page they were after", async ({
  page,
}) => {
  await stubSupabaseAuth(page);
  await stubApi(page);

  await page.goto("/app/focus");
  await expect(page).toHaveURL(/\/auth$/);

  await signInViaForm(page);

  // Protected put /app/focus in location.state; honouring it is what makes a
  // shared link survive the sign-in standing in front of it. This always
  // landed on /app/dashboard until Auth stopped hardcoding its destination.
  await expect(page).toHaveURL(/\/app\/focus$/);
  await expect(page).toHaveTitle("Focus — StudySpace");
});

test("the dashboard renders a workspace served by the API", async ({ page }) => {
  const spaceId = "11111111-2222-3333-4444-555555555555";

  await stubSupabaseAuth(page);
  await stubApi(page, {
    "/api/me": PROFILE,
    "/api/spaces": [
      {
        id: spaceId,
        title: "Organic Chemistry",
        subject: "Chemistry",
        color: "#4F5BD5",
        source_count: 4,
        ready_source_count: 3,
        due_today: 2,
        updated_at: "2026-10-01T10:00:00.000Z",
      },
    ],
  });

  // Reached the way a stranger reaches it: bounced to /auth first, then let
  // back in. Stubbing the API and cold-loading the URL would find no session
  // anywhere — the guard is right to refuse that, so the test has to sign in.
  await page.goto("/app/dashboard");
  await expect(page).toHaveURL(/\/auth$/);
  await signInViaForm(page);

  await expect(page).toHaveURL(/\/app\/dashboard$/);
  await expect(page).toHaveTitle("Dashboard — StudySpace");
  await expect(
    page.getByRole("heading", { level: 3, name: "Organic Chemistry" })
  ).toBeVisible();
  // The card is a link into the space, not just a label — the router and the
  // fixture have to agree on the id for it to resolve.
  await expect(page.locator(`a[href="/app/spaces/${spaceId}"]`)).toBeVisible();
});
