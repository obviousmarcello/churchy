import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { blankDemoCredentials } from "../lib/demo/safety";

/**
 * D-92 AC3: the built app refuses to start (`next start` exits with code 1, naming the problem)
 * in every forbidden combination. One combination per rule and per credential category; the unit
 * test `lib/demo/safety.test.ts` covers every single variable of the list.
 */
const APP = fileURLToPath(new URL("..", import.meta.url));

const inherited = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const cleanDemo = { ...inherited, ...blankDemoCredentials(inherited), DEMO_MODE: "1" };

const FORBIDDEN: [name: string, env: Record<string, string>, mentions: string][] = [
  ["staging environment", { APP_ENV: "staging" }, "APP_ENV=staging"],
  ["production environment", { APP_ENV: "production" }, "APP_ENV=production"],
  ["database credential", { DATABASE_URL: "postgres://demo:demo@localhost/x" }, "DATABASE_URL"],
  ["storage credential", { S3_SECRET_ACCESS_KEY: "x" }, "S3_SECRET_ACCESS_KEY"],
  ["email credential", { SMTP_PASSWORD: "x" }, "SMTP_PASSWORD"],
  ["push credential", { VAPID_PRIVATE_KEY: "x" }, "VAPID_PRIVATE_KEY"],
  ["payment credential", { BARION_POS_KEY: "x" }, "BARION_POS_KEY"],
  ["database adapter", { DATA_ADAPTER_NEWS: "db" }, "DATA_ADAPTER_NEWS=db"],
  ["ambiguous flag", { DEMO_MODE: "true" }, "DEMO_MODE must be 1"],
];

function start(
  port: number,
  env: Record<string, string>,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["next", "start", "-p", String(port)], {
      cwd: APP,
      env: { ...cleanDemo, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`next start kept running on port ${port}:\n${output}`));
    }, 45_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

test.describe("demo-mode startup check", () => {
  test.describe.configure({ mode: "parallel" });

  FORBIDDEN.forEach(([name, env, mentions], i) => {
    test(`refuses to start with DEMO_MODE and a ${name}`, async () => {
      test.setTimeout(60_000);
      const { code, output } = await start(Number(process.env.PORT ?? 3100) + 50 + i, env);
      expect(code, output).toBe(1);
      expect(output).toContain("Refusing to start with DEMO_MODE");
      expect(output).toContain(mentions);
      // Values never reach the log.
      expect(output).not.toContain("postgres://demo:demo");
    });
  });
});
