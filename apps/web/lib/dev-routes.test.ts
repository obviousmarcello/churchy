import { afterEach, describe, expect, it } from "vitest";
import { assertDevRoutesVisible, devRoutesHidden } from "./dev-routes";

const original = process.env.HIDE_DEV_ROUTES;
afterEach(() => {
  if (original === undefined) delete process.env.HIDE_DEV_ROUTES;
  else process.env.HIDE_DEV_ROUTES = original;
});

describe("dev routes gate", () => {
  it("hides only when HIDE_DEV_ROUTES is exactly 1", () => {
    expect(devRoutesHidden({})).toBe(false);
    expect(devRoutesHidden({ HIDE_DEV_ROUTES: "0" })).toBe(false);
    expect(devRoutesHidden({ HIDE_DEV_ROUTES: "true" })).toBe(false);
    expect(devRoutesHidden({ HIDE_DEV_ROUTES: "1" })).toBe(true);
  });

  it("assertDevRoutesVisible renders the 404 page when hidden (read per call)", () => {
    delete process.env.HIDE_DEV_ROUTES;
    expect(() => assertDevRoutesVisible()).not.toThrow();
    process.env.HIDE_DEV_ROUTES = "1";
    expect(() => assertDevRoutesVisible()).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });
});
