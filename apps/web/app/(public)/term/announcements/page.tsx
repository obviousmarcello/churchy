import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Announcement } from "@churchy/contracts";
import { Alert, PageShell } from "@churchy/ui";
import { PublicSiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import {
  ARCHIVE_PAGE_SIZE,
  PAGE_PARAM,
  VIEW_PARAM,
  WEEK_PARAM,
  announcementsHref,
  isArchiveView,
  parsePageParam,
  parseWeekParam,
} from "@/lib/announcements/view";
import { TERM_ROUTE_HEADER, termRoutePath } from "@/lib/term-routes";
import { getPublicAnnouncementSite } from "@/server/public-announcements";
import { getRequestRepositories } from "@/server/repositories";
import { ArchiveView } from "./archive-view";
import { WeekView } from "./week-view";
import "./print.css";
import { getSiteHref } from "@/server/site-base";

/**
 * Public weekly announcements (D-14, SDD §7.3): the latest week by default, any earlier week at
 * `?het=<Sunday>` with `‹ Előző hét | Archívum | Következő hét ›` navigation, the archive at
 * `?nezet=archivum`, and a print view (chrome hidden). The heading names the Sunday in the
 * tenant's liturgical tradition. Plain links only, so everything works without JavaScript.
 *
 * Reached through the tenant's term slug (`/hirdetesek`), which the proxy rewrites to this
 * internal route (`lib/term-routes.ts`).
 */

type SearchParams = Record<string, string | string[] | undefined>;

/** Weeks the neighbour links look through (about four years). */
const NEIGHBOUR_WINDOW = 200;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const [t, site, params, siteHref] = await Promise.all([
    getT("public.announcements"),
    getPublicAnnouncementSite(),
    searchParams,
    getSiteHref(),
  ]);
  // Canonical (D-17): the latest week at the bare path, an earlier week at its `?het=<Sunday>`.
  const week = parseWeekParam(params[WEEK_PARAM]);
  const basePath = siteHref(termRoutePath(t, "announcementsSection"));
  return {
    title: t("metaTitle", { church: site?.tenant.name ?? "" }),
    description: t("metaDescription"),
    alternates: {
      canonical: isArchiveView(params[VIEW_PARAM])
        ? announcementsHref(basePath, { archive: true, page: parsePageParam(params[PAGE_PARAM]) })
        : announcementsHref(basePath, { week: week.kind === "week" ? week.sunday : null }),
    },
  };
}

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Only reachable through the public term slug, never at the internal path.
  if ((await headers()).get(TERM_ROUTE_HEADER) !== "announcementsSection") notFound();

  const [site, params, t, common, siteHref] = await Promise.all([
    getPublicAnnouncementSite(),
    searchParams,
    getT("public.announcements"),
    getT("common"),
    getSiteHref(),
  ]);
  if (site === null || !site.config.modules.announcements) notFound();
  const { ctx, tenant, config } = site;
  const repos = await getRequestRepositories();
  const sectionPath = termRoutePath(t, "announcementsSection");
  const basePath = siteHref(sectionPath);
  const family = config.calendarFamily;

  let content;
  if (isArchiveView(params[VIEW_PARAM])) {
    const page = parsePageParam(params[PAGE_PARAM]);
    const [list, latest] = await Promise.all([
      repos.announcements.list(ctx, { page, pageSize: ARCHIVE_PAGE_SIZE }),
      repos.announcements.latest(ctx),
    ]);
    content = (
      <ArchiveView basePath={basePath} list={list} latestId={latest?.id ?? null} family={family} />
    );
  } else {
    // A week given another way (`2026. 11. 12.`, a weekday) is redirected to its Sunday.
    const week = parseWeekParam(params[WEEK_PARAM]);
    if (week.kind === "week" && !week.canonical) {
      redirect(announcementsHref(basePath, { week: week.sunday }));
    }
    const [all, latest] = await Promise.all([
      repos.announcements.list(ctx, { pageSize: NEIGHBOUR_WINDOW }),
      repos.announcements.latest(ctx),
    ]);
    let announcement: Announcement | null = latest;
    if (week.kind === "week") {
      announcement =
        all.items.find((a) => a.weekSunday === week.sunday) ??
        (await repos.announcements.byWeek(ctx, week.sunday));
    }
    content = (
      <>
        {week.kind === "invalid" ? (
          <div className="mb-6 max-w-prose print:hidden">
            <Alert tone="warning">
              <p>{t("dateInvalid")}</p>
            </Alert>
          </div>
        ) : null}
        <WeekView
          basePath={basePath}
          ctx={ctx}
          announcement={announcement}
          sunday={week.kind === "week" ? week.sunday : (latest?.weekSunday ?? null)}
          latestId={latest?.id ?? null}
          items={all.items}
          family={family}
        />
      </>
    );
  }

  return (
    <PageShell
      skipLinkLabel={common("skipToContent")}
      header={<PublicSiteHeader currentHref={sectionPath} />}
    >
      <div
        data-print-page="announcements"
        className="mx-auto w-full max-w-(--content-max) px-(--gutter) py-8 print:max-w-none print:p-0"
      >
        <p
          className="text-fs-3 font-semibold text-muted print:text-[11pt]"
          data-testid="announcements-church"
        >
          {tenant.name}
        </p>
        {content}
      </div>
    </PageShell>
  );
}
