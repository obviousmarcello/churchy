import { notFound } from "next/navigation";
import { demoModeEnabled, type Env } from "@/lib/demo/flag";

/**
 * Dev-only routes (`/fejlesztes/*`: component showcase, demo outbox *Kimenő levelek*) are tools for
 * developers and for the demo, never for a real deployment:
 *
 * - `HIDE_DEV_ROUTES=1` always hides them;
 * - otherwise they are served in demo mode (`DEMO_MODE=1`, D-92) and in local development/tests,
 *   and hidden in any other production server (`next start` without demo mode).
 *
 * The flags are read per request, so pages that use them must be dynamic
 * (`export const dynamic = "force-dynamic"`).
 */
export function devRoutesHidden(env: Env = process.env): boolean {
  if (env.HIDE_DEV_ROUTES === "1") return true;
  return !demoModeEnabled(env) && env.NODE_ENV === "production";
}

/** Responds with the 404 page unless dev routes are enabled (pages, server actions). */
export function assertDevRoutesVisible(): void {
  if (devRoutesHidden()) notFound();
}
