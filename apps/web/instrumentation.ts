/**
 * Runs once when a Next.js server instance starts, before it serves requests.
 *
 * D-92: refuse to start with `DEMO_MODE` in staging/production or with any database, storage,
 * email, push or payment credential configured (rules and the credential list:
 * `lib/demo/safety.ts`). The Node-only part lives in its own module, imported only in the Node.js
 * runtime (Next's recommended pattern).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runDemoStartupCheck } = await import("./lib/demo/startup-check");
    runDemoStartupCheck();
  }
}
