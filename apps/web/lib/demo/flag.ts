/**
 * The `DEMO_MODE` runtime flag (D-92, SDD §4.4). `DEMO_MODE=1` turns on the demo role switcher
 * (instead of login), the *„Bemutató — nem valós adatok”* banner, the *Visszaállítás* reset and
 * per-visitor mock stores. Unset, empty or `0` means off. Any other value is a configuration error
 * that the startup check (`./safety.ts`) refuses, so a typo never silently enables or disables it.
 *
 * Pure: takes the environment as an argument (defaults to `process.env`, read per call).
 */
export type Env = Readonly<Record<string, string | undefined>>;

export type DemoModeFlag = "on" | "off" | "invalid";

export function demoModeFlag(env: Env = process.env): DemoModeFlag {
  const value = env.DEMO_MODE;
  if (value === undefined || value === "" || value === "0") return "off";
  return value === "1" ? "on" : "invalid";
}

/** Whether demo mode is on (`DEMO_MODE=1`). */
export function demoModeEnabled(env: Env = process.env): boolean {
  return demoModeFlag(env) === "on";
}
