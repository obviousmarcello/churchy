import { describe, expect, it } from "vitest";
import { demoModeEnabled, demoModeFlag } from "./flag";
import {
  CREDENTIAL_CATEGORIES,
  DemoModeSafetyError,
  FORBIDDEN_APP_ENVS,
  FORBIDDEN_DEMO_CREDENTIALS,
  assertDemoModeSafe,
  blankDemoCredentials,
  demoSafetyProblems,
} from "./safety";

const DEMO = { DEMO_MODE: "1" } as const;

describe("DEMO_MODE flag", () => {
  it("is on only for exactly 1", () => {
    expect(demoModeFlag({})).toBe("off");
    expect(demoModeFlag({ DEMO_MODE: "" })).toBe("off");
    expect(demoModeFlag({ DEMO_MODE: "0" })).toBe("off");
    expect(demoModeFlag({ DEMO_MODE: "1" })).toBe("on");
    for (const value of ["true", "yes", "on", " 1", "2"]) {
      expect(demoModeFlag({ DEMO_MODE: value }), value).toBe("invalid");
      expect(demoModeEnabled({ DEMO_MODE: value }), value).toBe(false);
    }
    expect(demoModeEnabled(DEMO)).toBe(true);
  });
});

describe("demo-mode startup check", () => {
  it("accepts a clean demo environment", () => {
    for (const appEnv of [undefined, "", "local", "ci", "demo", "development", "test"]) {
      const env = { ...DEMO, APP_ENV: appEnv, PORT: "3100", NODE_ENV: "production" };
      expect(demoSafetyProblems(env), String(appEnv)).toEqual([]);
      expect(() => assertDemoModeSafe(env)).not.toThrow();
    }
  });

  it("does not constrain the app when demo mode is off", () => {
    const env = { APP_ENV: "production", DATABASE_URL: "postgres://x", BARION_POS_KEY: "k" };
    expect(demoSafetyProblems(env)).toEqual([]);
    expect(demoSafetyProblems({ ...env, DEMO_MODE: "0" })).toEqual([]);
  });

  it("refuses an ambiguous DEMO_MODE value", () => {
    expect(() => assertDemoModeSafe({ DEMO_MODE: "true" })).toThrow(DemoModeSafetyError);
    expect(demoSafetyProblems({ DEMO_MODE: "yes" })).toEqual([{ kind: "invalidFlag" }]);
  });

  for (const appEnv of [...FORBIDDEN_APP_ENVS, "Production", " STAGING "]) {
    it(`refuses APP_ENV=${appEnv}`, () => {
      expect(demoSafetyProblems({ ...DEMO, APP_ENV: appEnv })).toEqual([
        { kind: "environment", appEnv: appEnv.trim().toLowerCase() },
      ]);
      expect(() => assertDemoModeSafe({ ...DEMO, APP_ENV: appEnv })).toThrow(/APP_ENV/);
    });
  }

  for (const category of CREDENTIAL_CATEGORIES) {
    const { names, prefixes } = FORBIDDEN_DEMO_CREDENTIALS[category];
    const variables = [...names, ...prefixes.map((p) => `${p}SOMETHING`)];

    it(`has at least one rule for ${category} credentials`, () => {
      expect(variables.length).toBeGreaterThan(0);
    });

    for (const variable of variables) {
      it(`refuses ${category} credential ${variable}`, () => {
        const env = { ...DEMO, [variable]: "secret-value" };
        expect(demoSafetyProblems(env)).toEqual([{ kind: "credential", category, variable }]);
        expect(() => assertDemoModeSafe(env)).toThrow(DemoModeSafetyError);
      });
    }
  }

  it("treats an empty or blank value as not configured", () => {
    expect(demoSafetyProblems({ ...DEMO, DATABASE_URL: "", SMTP_HOST: "  " })).toEqual([]);
  });

  it("refuses a module switched to the database adapter", () => {
    expect(demoSafetyProblems({ ...DEMO, DATA_ADAPTER_NEWS: "db" })).toEqual([
      { kind: "dbAdapter", variable: "DATA_ADAPTER_NEWS" },
    ]);
    expect(demoSafetyProblems({ ...DEMO, DATA_ADAPTER_NEWS: "mock" })).toEqual([]);
  });

  it("reports every problem at once and never leaks a value", () => {
    const env = {
      ...DEMO,
      APP_ENV: "production",
      DATABASE_URL: "postgres://user:hunter2@db",
      VAPID_PRIVATE_KEY: "hunter3",
    };
    let error: unknown;
    try {
      assertDemoModeSafe(env);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(DemoModeSafetyError);
    const { message, problems } = error as DemoModeSafetyError;
    expect(problems).toHaveLength(3);
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("VAPID_PRIVATE_KEY");
    expect(message).not.toContain("hunter");
  });

  it("does not match unrelated variables that merely contain a keyword", () => {
    const env = { ...DEMO, CLAUDE_CODE_USER_EMAIL: "x", AWS_REGION: "eu", MY_S3_NOTE: "x" };
    expect(demoSafetyProblems(env)).toEqual([]);
  });

  it("blankDemoCredentials turns an inherited environment into a clean demo one", () => {
    const shell = { ...DEMO, AWS_ACCESS_KEY_ID: "a", SMTP_HOST: "h", HOME: "/root" };
    const overrides = blankDemoCredentials(shell);
    expect(overrides).toEqual({ AWS_ACCESS_KEY_ID: "", SMTP_HOST: "" });
    expect(demoSafetyProblems({ ...shell, ...overrides })).toEqual([]);
  });
});
