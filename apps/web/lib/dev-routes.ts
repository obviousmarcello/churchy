import { notFound } from "next/navigation";

/**
 * Dev-only routes (`/fejlesztes/*`: component showcase, demo outbox) are served unless the
 * environment sets `HIDE_DEV_ROUTES=1`. The flag is read per request, so pages that use it must be
 * dynamic (`export const dynamic = "force-dynamic"`). Issue #18 later gates the demo tools on the
 * demo-mode flag as well; this is the single place to extend.
 */
export function devRoutesHidden(env: Record<string, string | undefined> = process.env): boolean {
  return env.HIDE_DEV_ROUTES === "1";
}

/** Responds with the 404 page unless dev routes are enabled (pages, server actions). */
export function assertDevRoutesVisible(): void {
  if (devRoutesHidden()) notFound();
}
