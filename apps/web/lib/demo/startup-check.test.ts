import { afterEach, describe, expect, it, vi } from "vitest";
import { runDemoStartupCheck } from "./startup-check";

afterEach(() => vi.restoreAllMocks());

const exitSpy = () =>
  vi.fn((code: number): never => {
    throw new Error(`exit ${code}`);
  });

describe("instrumentation startup check", () => {
  it("exits with 1 and names the variable (not its value) in a forbidden combination", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exit = exitSpy();
    expect(() =>
      runDemoStartupCheck({ DEMO_MODE: "1", BARION_POS_KEY: "pos-secret" }, exit),
    ).toThrow("exit 1");
    expect(exit).toHaveBeenCalledWith(1);
    expect(String(error.mock.calls[0]?.[0])).toContain("BARION_POS_KEY");
    expect(String(error.mock.calls[0]?.[0])).not.toContain("pos-secret");
  });

  it("lets a clean demo and a non-demo server start", () => {
    const exit = exitSpy();
    runDemoStartupCheck({ DEMO_MODE: "1", APP_ENV: "demo" }, exit);
    runDemoStartupCheck({ APP_ENV: "production", DATABASE_URL: "postgres://db" }, exit);
    expect(exit).not.toHaveBeenCalled();
  });
});
