import { DbDraftStore, platformDbEnabled } from "@/server/platform-db";

/**
 * Deletes the site builder drafts that expired without being applied (hourly). Uses the platform
 * connection (`DATABASE_URL_PLATFORM`): `site_drafts` is a platform table the app role cannot touch.
 * Returns the number of drafts removed; without a platform connection there is nothing to do.
 * The log carries the count only.
 */
export async function purgeSiteDrafts(now: Date = new Date()): Promise<number> {
  if (!platformDbEnabled()) return 0;
  return new DbDraftStore("worker").purgeExpired(now);
}
