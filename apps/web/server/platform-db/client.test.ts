// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { platformDbEnabled } from "./client";

describe("platformDbEnabled", () => {
  it("needs DATABASE_URL_PLATFORM", () => {
    expect(platformDbEnabled({})).toBe(false);
    expect(platformDbEnabled({ DATABASE_URL_PLATFORM: "  " })).toBe(false);
    expect(platformDbEnabled({ DATABASE_URL_PLATFORM: "postgres://x" })).toBe(true);
  });

  it("is never on in demo mode or APP_ENV=demo, and ignores DATABASE_URL", () => {
    const url = "postgres://x";
    expect(platformDbEnabled({ DATABASE_URL_PLATFORM: url, DEMO_MODE: "1" })).toBe(false);
    expect(platformDbEnabled({ DATABASE_URL_PLATFORM: url, APP_ENV: "Demo" })).toBe(false);
    expect(platformDbEnabled({ DATABASE_URL: url })).toBe(false);
  });
});
