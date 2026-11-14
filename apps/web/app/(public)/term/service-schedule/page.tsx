import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Ctx, Location } from "@churchy/contracts";
import { liturgicalDay, publicHoliday } from "@churchy/calendar";
import { formatDateShort, todayInBudapest } from "@churchy/hu";
import { effectiveConfig } from "@churchy/presets";
import type { DayContextFn } from "@churchy/schedule";
import { Alert, PageShell } from "@churchy/ui";
import { SiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import {
  DATE_PARAM,
  LOCATION_PARAM,
  firstParam,
  parseDateParam,
  regularSchedule,
  resolveWeek,
  scheduleHref,
  weekOf,
} from "@/lib/service-schedule/view";
import { TERM_ROUTE_HEADER, termRoutePath } from "@/lib/term-routes";
import { getRequestRepositories } from "@/server/repositories";
import { getRequestContext } from "@/server/session";
import { RegularSchedule } from "./regular-schedule";
import { ScheduleFilters } from "./schedule-filters";
import { WeekView } from "./week-view";
import "./print.css";

/**
 * Public service schedule (D-11, SDD §7.2): the week resolved by `@churchy/schedule`, week
 * navigation, a date field and a location filter — all links and a GET form, so the page works
 * without JavaScript and every state is a shareable URL (`?datum=`, `?hely=`) — and the regular
 * weekly table per location and period. Print shows the week only, on one A4 page.
 *
 * Reached through the tenant's term slug (`/miserend`, `/istentiszteleti-rend`, …), which the proxy
 * rewrites to this internal route (`lib/term-routes.ts`).
 */

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("public.schedule");
  return { title: t.term("serviceSchedule").nom, description: t("metaDescription") };
}

/** Public data is read as an anonymous visitor, whoever is signed in. */
function publicCtx(tenantId: string): Ctx {
  return { tenantId, actor: { userId: null, personId: null } };
}

export default async function ServiceSchedulePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Only reachable through the public term slug, never at the internal path.
  if ((await headers()).get(TERM_ROUTE_HEADER) !== "serviceSchedule") notFound();

  const request = await getRequestContext();
  if (request.tenantId === undefined) notFound();
  const ctx = publicCtx(request.tenantId);
  const repos = await getRequestRepositories();
  const [tenant, allLocations, data, params, t, common] = await Promise.all([
    repos.tenants.current(ctx),
    repos.locations.list(ctx),
    repos.schedule.getScheduleData(ctx),
    searchParams,
    getT("public.schedule"),
    getT("common"),
  ]);
  if (tenant === null) notFound();
  const config = effectiveConfig({
    name: tenant.name,
    denomination: tenant.denomination,
    siteConfig: tenant.siteConfig,
  });
  if (!config.modules.schedule) notFound();

  const basePath = termRoutePath(t, "serviceSchedule");
  const now = new Date();
  const today = todayInBudapest(now);

  // URL state. A date typed in the Hungarian way (`2026. 12. 24.`) is redirected to its canonical
  // form, so the address bar always shows the shareable URL.
  const dateParam = parseDateParam(params[DATE_PARAM]);
  const locationSlug = firstParam(params[LOCATION_PARAM]);
  const location: Location | null = locationSlug
    ? (allLocations.find((l) => l.slug === locationSlug) ?? null)
    : null;
  if (dateParam.kind === "date" && !dateParam.canonical) {
    redirect(scheduleHref(basePath, { date: dateParam.date, location: location?.slug }));
  }
  const week = weekOf(dateParam.kind === "date" ? dateParam.date : today, today);
  const locations = location ? [location] : allLocations;

  const dayContext: DayContextFn = (date) => {
    const day = liturgicalDay(date, config.calendarFamily);
    const holiday = publicHoliday(date);
    return {
      ...(day.name !== null && (day.isSunday || day.isNotable)
        ? { liturgicalDayName: day.name }
        : {}),
      ...(holiday ? { publicHolidayName: holiday.name } : {}),
    };
  };
  const days = resolveWeek({ locations: allLocations, data }, week, {
    ...(location ? { locationIds: [location.id] } : {}),
    dayContext,
  });

  return (
    <PageShell
      skipLinkLabel={common("skipToContent")}
      header={<SiteHeader currentHref={basePath} />}
    >
      <div
        data-print-page="service-schedule"
        className="mx-auto w-full max-w-(--content-max) px-(--gutter) py-8 print:max-w-none print:p-0"
      >
        <p
          className="text-fs-3 font-semibold text-muted print:text-[11pt]"
          data-testid="schedule-church"
        >
          {tenant.name}
        </p>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary print:text-[22pt]">
          {t.term("serviceSchedule").nom}
        </h1>

        <ScheduleFilters
          basePath={basePath}
          week={week}
          locations={allLocations}
          location={location}
          dateValue={
            dateParam.kind === "invalid"
              ? dateParam.raw
              : formatDateShort(dateParam.kind === "date" ? dateParam.date : today)
          }
          dateError={dateParam.kind === "invalid"}
        />

        {locationSlug !== undefined && location === null ? (
          <div className="mt-4 max-w-prose print:hidden">
            <Alert tone="warning">
              <p>{t("unknownLocation")}</p>
            </Alert>
          </div>
        ) : null}

        <WeekView
          week={week}
          days={days}
          locations={allLocations}
          showLocation={locations.length > 1}
          serviceTypes={config.serviceTypes}
          today={today}
          now={now.getTime()}
        />

        <RegularSchedule
          regular={regularSchedule(locations, data, today)}
          serviceTypes={config.serviceTypes}
        />
      </div>
    </PageShell>
  );
}
