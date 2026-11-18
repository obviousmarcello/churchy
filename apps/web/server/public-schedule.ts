import { cache } from "react";
import { buildNextServices, type NextServicesView } from "@/lib/home/next-services";
import { getRequestNow } from "@/server/clock";
import { getPublicSite } from "@/server/public-seo";
import { getRequestRepositories } from "@/server/repositories";

/**
 * "Next services" of the request's church at the request's clock (D-10), memoized per request so
 * the block and the live banner share one resolution. Null when the church has no schedule
 * module. Read through the repositories as an anonymous visitor.
 */
export const getHomeNextServices = cache(async (): Promise<NextServicesView | null> => {
  const [site, repos, now] = await Promise.all([
    getPublicSite(),
    getRequestRepositories(),
    getRequestNow(),
  ]);
  if (site === null || !site.config.modules.schedule) return null;
  const [locations, data] = await Promise.all([
    repos.locations.list(site.ctx),
    repos.schedule.getScheduleData(site.ctx),
  ]);
  return buildNextServices({ locations, data }, now);
});
