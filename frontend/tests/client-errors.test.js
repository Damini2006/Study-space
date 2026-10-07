import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installGlobalErrorCapture, resetClientErrorCapture } from "@/lib/clientErrors";
import { api } from "@/lib/api";

const CONSENT_KEY = "studyspace.cookieConsent";

let fetchMock;

function crash(message = "TypeError: x is undefined") {
  window.dispatchEvent(new ErrorEvent("error", { message }));
}

function payloadOf(callIndex = 0) {
  return JSON.parse(fetchMock.mock.calls[callIndex][1].body);
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  resetClientErrorCapture();
  installGlobalErrorCapture();
});

afterEach(() => {
  resetClientErrorCapture();
  vi.unstubAllGlobals();
});

describe("global error capture", () => {
  it("stays silent until the cookie banner has been accepted", () => {
    crash("no consent yet");
    expect(fetchMock).not.toHaveBeenCalled();

    localStorage.setItem(CONSENT_KEY, "declined");
    crash("and declined");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends an uncaught error to the endpoint when consented", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    crash("TypeError: x is undefined");
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${api.base}/client-errors`);
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(payloadOf()).toMatchObject({
      message: "TypeError: x is undefined",
      source: "uncaught",
      route: window.location.pathname,
    });
  });

  it("reports unhandled rejections under their own source", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    const event = new Event("unhandledrejection");
    event.reason = new Error("quota exceeded");
    window.dispatchEvent(event);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payloadOf()).toMatchObject({
      message: "quota exceeded",
      source: "rejection",
    });
  });

  it("does not repeat the same message inside the window", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    crash("boom");
    crash("boom");
    crash("boom");
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops after ten reports from one page", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    for (let i = 0; i < 12; i += 1) crash(`boom ${i}`);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("keeps credential-shaped text off the wire", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    const token =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhLWEtYS1hLWEtYS1hLWEiLCJleHAiOjF9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c";
    crash(`failed while holding ${token}`);
    await flush();

    const payload = payloadOf();
    expect(payload.message).not.toContain(token);
    expect(payload.message).toContain("[redacted-jwt]");
  });

  it("truncates before sending", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    crash("M".repeat(4000));
    await flush();

    expect(payloadOf().message).toHaveLength(500);
  });

  it("installs once however many times it is called", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    installGlobalErrorCapture();
    installGlobalErrorCapture();
    crash("once");
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("survives its own transport failing without wedging", async () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    fetchMock.mockRejectedValue(new Error("offline"));

    expect(() => crash("first failure")).not.toThrow();
    await flush();
    expect(() => crash("second failure")).not.toThrow();
    await flush();

    // The rejected fetch never became an unhandled rejection (vitest
    // would fail the test), and the second report still went out.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
