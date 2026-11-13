import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);

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
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: /visual\.spec\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /visual\.spec\.ts/ },
    // Visual regression runs once, at explicit viewport widths (360 / 768 / 1024 / 1440).
    {
      name: "visual",
      use: { ...devices["Desktop Chrome"], reducedMotion: "reduce" },
      testMatch: /visual\.spec\.ts/,
    },
  ],
  webServer: {
    command: `pnpm next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
