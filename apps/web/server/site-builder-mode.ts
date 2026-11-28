import { demoModeEnabled } from "@/lib/demo/flag";
import { platformDbEnabled } from "@/server/platform-db";

export const ANTHROPIC_KEY_ENV = "ANTHROPIC_API_KEY";

/**
 * - `demo`: DEMO_MODE; the fixture pipeline (no network, no key, no database).
 * - `live`: the platform database and the platform Anthropic key are configured.
 * - `off`: anything else; the console page says what is missing.
 */
export type SiteBuilderMode = "demo" | "live" | "off";

export function siteBuilderMode(
  env: Record<string, string | undefined> = process.env,
): SiteBuilderMode {
  if (demoModeEnabled(env)) return "demo";
  const key = env[ANTHROPIC_KEY_ENV]?.trim();
  return platformDbEnabled(env) && key ? "live" : "off";
}
