import { defineConfig, devices } from "@playwright/test";
import { blankDemoCredentials } from "./lib/demo/safety";

const PORT = Number(process.env.PORT ?? 3100);
// Second server of the same build with the dev routes hidden (dev-routes-hidden.spec.ts).
const HIDDEN_PORT = Number(process.env.HIDDEN_PORT ?? 3101);
// Third server of the same build without demo mode (demo-off.spec.ts).
const NO_DEMO_PORT = Number(process.env.NO_DEMO_PORT ?? 3102);
process.env.HIDDEN_PORT = String(HIDDEN_PORT);
process.env.NO_DEMO_PORT = String(NO_DEMO_PORT);

/** The inherited environment with string values only. */
const inherited = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

/**
 * A demo deployment (D-92): `DEMO_MODE=1` and none of the credentials the startup check forbids
 * (the shell running the tests may carry unrelated cloud credentials, which are blanked).
 */
const demoEnv = (extra: Record<string, string> = {}) => ({
  ...inherited,
  ...blankDemoCredentials(inherited),
  DEMO_MODE: "1",
  ...extra,
});

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Baselines live next to the specs: e2e/__screenshots__/<spec>/<name>-<project>-<platform>.png
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{testFileName}/{arg}-{projectName}-{platform}{ext}",
  expect: {
    toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.002 },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    locale: "hu-HU",
    timezoneId: "Europe/Budapest",
  },
  projects: [
    // outbox.spec.ts runs serially in the desktop project only; server-wide and process-spawning
    // specs run once, in the desktop project.
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testIgnore:
        /(visual|outbox|dev-routes-hidden|demo-off|demo-startup|demo-banner|demo-reset)\.spec\.ts/,
    },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /visual\.spec\.ts/ },
    // Visual regression runs once, at explicit viewport widths (360 / 768 / 1024 / 1440).
    {
      name: "visual",
      use: { ...devices["Desktop Chrome"], reducedMotion: "reduce" },
      testMatch: /visual\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: `pnpm next start -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      env: demoEnv(),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm next start -p ${HIDDEN_PORT}`,
      url: `http://localhost:${HIDDEN_PORT}`,
      env: demoEnv({ HIDE_DEV_ROUTES: "1" }),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm next start -p ${NO_DEMO_PORT}`,
      url: `http://localhost:${NO_DEMO_PORT}`,
      env: { ...inherited, DEMO_MODE: "0" },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
