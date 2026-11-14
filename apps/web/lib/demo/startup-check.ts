import type { Env } from "./flag";
import { assertDemoModeSafe } from "./safety";

/**
 * The startup check of `instrumentation.ts` (Node.js runtime only): when the environment breaks a
 * demo-mode rule, print why (variable names only) and exit with code 1, so `next start` fails fast
 * instead of serving a demo with real credentials.
 */
export function runDemoStartupCheck(
  env: Env = process.env,
  exit: (code: number) => never = process.exit,
): void {
  try {
    assertDemoModeSafe(env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    exit(1);
  }
}
