import { cache } from "react";
import type { Announcement, Ctx, Tenant } from "@churchy/contracts";
import { effectiveConfig, type EffectiveConfig } from "@churchy/presets";
import { publicFile, type PublicFile } from "@/lib/announcements/view";
import { getPublicCtx } from "@/server/public-site";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Data for the public weekly announcements (D-14). Everything goes through the repository
 * interfaces with an anonymous tenant ctx, so drafts and scheduled weeks are never read.
 */

export interface PublicAnnouncementSite {
  ctx: Ctx;
  tenant: Tenant;
  config: EffectiveConfig;
}

/** The current church and its effective configuration, or null without a tenant (memoized). */
export const getPublicAnnouncementSite = cache(async (): Promise<PublicAnnouncementSite | null> => {
  const ctx = await getPublicCtx();
  const repos = await getRequestRepositories();
  const tenant = await repos.tenants.current(ctx);
  if (tenant === null) return null;
  const config = effectiveConfig({
    name: tenant.name,
    denomination: tenant.denomination,
    siteConfig: tenant.siteConfig,
  });
  return { ctx, tenant, config };
});

/** The PDF attachment of an announcement, when it is a public file. */
export async function announcementFile(
  ctx: Ctx,
  announcement: Announcement | null,
): Promise<PublicFile | null> {
  if (announcement?.pdfMediaId == null) return null;
  const repos = await getRequestRepositories();
  return publicFile(await repos.media.get(ctx, announcement.pdfMediaId));
}

/** The latest visible announcement with its PDF, for the home-page teaser; null when none. */
export async function getLatestAnnouncement(): Promise<{
  announcement: Announcement;
  file: PublicFile | null;
  config: EffectiveConfig;
} | null> {
  const site = await getPublicAnnouncementSite();
  if (site === null || !site.config.modules.announcements) return null;
  const repos = await getRequestRepositories();
  const announcement = await repos.announcements.latest(site.ctx);
  if (announcement === null) return null;
  return {
    announcement,
    file: await announcementFile(site.ctx, announcement),
    config: site.config,
  };
}
