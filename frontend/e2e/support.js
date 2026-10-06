import { Buffer } from "node:buffer";

/**
 * Fixtures and network stubs shared by the end-to-end suites.
 *
 * Nothing here fakes the app. The real supabase-js client runs, writes a
 * session to storage in its own format, and fires its own auth events; the
 * stubs only answer the two hosts it would otherwise talk to, and they do it
 * before a socket opens — so the suite needs neither a Supabase instance nor
 * the FastAPI backend, while still exercising every line in between.
 *
 * Not named *.e2e.js, so neither runner collects it as a test.
 */

export const E2E_EMAIL = "student@studyspace.test";

const USER_ID = "6f1c1e2a-0f4a-4a1a-9a6b-2c9a5b7d0001";

/** Structurally real, signed with a key nobody verifies — see fakeSession. */
function signJwt(payload) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(
    payload
  )}.e2e-signature`;
}

/**
 * A complete auth-js `Session` for `email`.
 *
 * The access token is a proper three-part JWT rather than a stand-in string:
 * supabase-js hands it back out of storage on the next `getSession()`, and
 * anything that decodes it to read a claim would throw on a bare word. The
 * signature is decorative — no verifier runs in these tests — but `exp` is
 * not: set it far enough out and the auto-refresh ticker stays asleep
 * instead of asking for a token this stub does not serve.
 */
export function fakeSession(email = E2E_EMAIL) {
  const now = Math.floor(Date.now() / 1000);
  const issuedAt = new Date(now * 1000).toISOString();

  return {
    access_token: signJwt({
      sub: USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email,
      session_id: "e2e-session",
      exp: now + 3600,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { display_name: "E2E Student" },
      aal: "aal1",
      is_anonymous: false,
    }),
    refresh_token: "e2e-refresh-token",
    expires_in: 3600,
    expires_at: now + 3600,
    token_type: "bearer",
    user: {
      id: USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email,
      email_confirmed_at: issuedAt,
      phone: "",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { display_name: "E2E Student" },
      identities: [],
      created_at: issuedAt,
      updated_at: issuedAt,
    },
  };
}

/** What `GET /me` answers with — the profile the shell renders. */
export const PROFILE = {
  id: USER_ID,
  email: E2E_EMAIL,
  display_name: "E2E Student",
  theme: null,
  role: "student",
  created_at: "2026-01-06T09:00:00.000Z",
};

export async function stubSupabaseAuth(page, email = E2E_EMAIL) {
  const session = fakeSession(email);
  await page.route("**/auth/v1/token*", (route) =>
    route.fulfill({ json: session })
  );
}

/**
 * Every FastAPI call, answered from fixtures.
 *
 * `paths` keys are full URL pathnames (`"/api/me"`), taken off the request
 * rather than guessed, because that is what the app actually asks for. The
 * defaults are not a shortcut: an empty list on a read is precisely what
 * these endpoints return for a fresh account, so untouched pages run through
 * their real empty states instead of a happy path nobody sees on day one.
 * Writes echo their own body back, which is enough for the client to treat
 * them as succeeded.
 */
export async function stubApi(page, paths = {}) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const override = paths[pathname];

    if (override !== undefined) {
      const json =
        typeof override === "function" ? await override(route) : override;
      return route.fulfill({ json });
    }

    if (request.method() === "GET") {
      return route.fulfill({ json: [] });
    }

    let body = {};
    try {
      body = request.postDataJSON() ?? {};
    } catch {
      // A non-JSON body (multipart upload) has nothing worth echoing.
    }
    return route.fulfill({ json: body });
  });
}

/**
 * Submits the sign-in form on /auth. The password is long enough to clear
 * the client-side length check; the e-mail is the one `stubSupabaseAuth`
 * answers for, so the session that comes back is the one the tests expect.
 */
export async function signInViaForm(page) {
  await page.getByLabel("E-mail").fill(E2E_EMAIL);
  await page
    .getByLabel("Password", { exact: true })
    .fill("correct horse battery staple");
  await page.locator('button[type="submit"]').click();
}
