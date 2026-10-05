import { describe, expect, it } from "vitest";
import {
  FALLBACK_MESSAGE,
  friendlyMessage,
  pickMessage,
} from "@/lib/errors";

describe("pickMessage", () => {
  it("prefers a short, plain server detail", () => {
    expect(pickMessage(400, "Title is required")).toBe("Title is required");
    expect(pickMessage(500, "  Space already exists  ")).toBe("Space already exists");
  });

  it("ignores HTML error pages so a toast never renders markup", () => {
    expect(pickMessage(502, "<html><body>Bad gateway</body></html>")).toMatch(/restarting/);
  });

  it("ignores details too long to read in a toast", () => {
    const long = "x".repeat(400);
    expect(pickMessage(400, long)).not.toBe(long);
  });

  it("falls back to friendly copy for known statuses", () => {
    expect(pickMessage(401)).toMatch(/session expired/i);
    expect(pickMessage(429)).toMatch(/fast/i);
    expect(pickMessage(503)).toMatch(/unavailable/i);
  });

  it("falls back to the generic message for unknown statuses", () => {
    expect(pickMessage(418)).toBe(FALLBACK_MESSAGE);
    expect(pickMessage(undefined, null)).toBe(FALLBACK_MESSAGE);
  });
});

describe("friendlyMessage", () => {
  it("passes strings straight through", () => {
    expect(friendlyMessage("Already signed in")).toBe("Already signed in");
    expect(friendlyMessage("")).toBe(FALLBACK_MESSAGE);
  });

  it("returns the fallback for nullish values", () => {
    expect(friendlyMessage(null)).toBe(FALLBACK_MESSAGE);
    expect(friendlyMessage(undefined)).toBe(FALLBACK_MESSAGE);
  });

  it("uses friendly copy for API-shaped errors", () => {
    expect(friendlyMessage({ status: 404, detail: "Not found" })).toBe("Not found");
    expect(friendlyMessage({ status: 500, detail: "<html>boom</html>" })).toMatch(/internal error/i);
  });

  it("keeps plain Error messages", () => {
    expect(friendlyMessage(new Error("Storage quota exceeded"))).toBe("Storage quota exceeded");
  });

  it("reports aborted requests distinctly", () => {
    const abort = new Error("The user aborted a request.");
    abort.name = "AbortError";
    expect(friendlyMessage(abort)).toBe("Request cancelled.");
  });
});
