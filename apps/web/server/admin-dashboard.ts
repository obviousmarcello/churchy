import { addDays, todayInBudapest, type IsoDate } from "@churchy/hu";
import { dayWindow, expandEvents } from "@churchy/events";
import { effectiveConfig } from "@churchy/presets";
import {
  comingSunday,
  dashboardWarnings,
  daysWithoutException,
  HOLIDAY_LOOKAHEAD_DAYS,
  missingOnboardingSteps,
  specialDays,
  type DashboardWarning,
} from "@/lib/admin/warnings";
import { getAdminCtx, getAdminSections } from "@/server/admin";
import { getRequestNow } from "@/server/clock";
import { getRequestRepositories } from "@/server/repositories";

export type DraftType = "news" | "announcement" | "event" | "page";

export interface DraftRow {
  readonly id: string;
  readonly type: DraftType;
  /** Title; `null` for an announcement, which is identified by `date` (its Sunday). */
  readonly title: string | null;
  readonly date: IsoDate | null;
  readonly updatedAt: string;
  /** Admin section the draft is edited in. */
  readonly section: string;
}

export interface UpcomingEvent {
  readonly id: string;
  readonly title: string;
  readonly date: IsoDate;
  /** Start as ISO date-time; `null` for an all-day event. */
  readonly start: string | null;
}

export interface DashboardData {
  readonly now: Date;
  readonly today: IsoDate;
  readonly warnings: readonly DashboardWarning[];
  readonly drafts: readonly DraftRow[];
  readonly upcoming: readonly UpcomingEvent[];
  /** `null` when the actor may not read requests. */
  readonly newRequests: number | null;
  /** Sections the actor may open, by id; quick actions and lists follow it. */
  readonly sectionIds: ReadonlySet<string>;
}

const DRAFT_LIMIT = 8;
const UPCOMING_DAYS = 30;
const UPCOMING_LIMIT = 5;

/**
 * Everything the dashboard shows (D-18), read through the repository interfaces with the actor's
 * ctx. What the actor may see follows `can()` via the permission-filtered sections (no role
 * checks): a part is only loaded when its section is open to the actor.
 */
export async function loadDashboard(): Promise<DashboardData> {
  const [ctx, sections, now, repos] = await Promise.all([
    getAdminCtx(),
    getAdminSections(),
    getRequestNow(),
    getRequestRepositories(),
  ]);
  const sectionIds = new Set(sections.map((s) => s.id));
  const today = todayInBudapest(now);
  const empty: DashboardData = {
    now,
    today,
    warnings: [],
    drafts: [],
    upcoming: [],
    newRequests: null,
    sectionIds,
  };
  if (ctx.tenantId === undefined) return empty;

  const tenant = await repos.tenants.current(ctx);
  const family = tenant
    ? effectiveConfig({
        name: tenant.name,
        denomination: tenant.denomination,
        siteConfig: tenant.siteConfig,
      }).calendarFamily
    : "catholic";
  const sunday = comingSunday(today);
  const wide = dayWindow(addDays(today, -180), addDays(today, 180));

  const [news, announcements, pages, events, requests, exceptions, locations, schedule] =
    await Promise.all([
      sectionIds.has("news") ? repos.news.list(ctx, { pageSize: 200 }) : null,
      sectionIds.has("announcements") ? repos.announcements.list(ctx, { pageSize: 100 }) : null,
      sectionIds.has("pages") || sectionIds.has("appearance") ? repos.pages.list(ctx) : null,
      sectionIds.has("events") ? repos.events.list(ctx, wide) : null,
      sectionIds.has("requests") ? repos.requests.list(ctx, { status: "uj" }) : null,
      sectionIds.has("schedule")
        ? repos.schedule.listExceptions(ctx, {
            from: today,
            to: addDays(today, HOLIDAY_LOOKAHEAD_DAYS),
          })
        : null,
      sectionIds.has("appearance") ? repos.locations.list(ctx) : null,
      sectionIds.has("appearance") ? repos.schedule.getScheduleData(ctx) : null,
    ]);

  const drafts: DraftRow[] = [
    ...(news?.items ?? [])
      .filter((p) => p.status === "draft")
      .map((p) => ({
        id: p.id,
        type: "news" as const,
        title: p.title,
        date: null,
        updatedAt: p.updatedAt,
        section: "news",
      })),
    ...(announcements?.items ?? [])
      .filter((a) => a.status === "draft")
      .map((a) => ({
        id: a.id,
        type: "announcement" as const,
        title: null,
        date: a.weekSunday,
        updatedAt: a.updatedAt,
        section: "announcements",
      })),
    ...(events ?? [])
      .filter((e) => e.status === "draft" && e.parentEventId === null)
      .map((e) => ({
        id: e.id,
        type: "event" as const,
        title: e.title,
        date: null,
        updatedAt: e.updatedAt,
        section: "events",
      })),
    ...(sectionIds.has("pages") ? (pages ?? []) : [])
      .filter((p) => p.status === "draft")
      .map((p) => ({
        id: p.id,
        type: "page" as const,
        title: p.title,
        date: null,
        updatedAt: p.updatedAt,
        section: "pages",
      })),
  ]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, DRAFT_LIMIT);

  const upcoming: UpcomingEvent[] = events
    ? expandEvents(
        events.filter((e) => e.status === "published"),
        dayWindow(today, addDays(today, UPCOMING_DAYS)),
      )
        .filter((o) => o.endMs >= now.getTime())
        .sort((a, b) => a.startMs - b.startMs)
        .slice(0, UPCOMING_LIMIT)
        .map((o) => ({
          id: `${o.event.id}-${o.start}`,
          title: o.event.title,
          date: o.date,
          start: o.allDay ? null : o.start,
        }))
    : [];

  const newRequests = requests === null ? null : requests.length;

  const warnings = dashboardWarnings({
    today,
    announcementForSunday:
      announcements === null
        ? null
        : announcements.items.some((a) => a.weekSunday === sunday && a.status === "published"),
    uncoveredDays:
      exceptions === null
        ? null
        : daysWithoutException(specialDays(today, family), new Set(exceptions.map((x) => x.date))),
    missingSteps:
      locations === null || schedule === null || pages === null
        ? null
        : missingOnboardingSteps({
            location: locations.length > 0,
            schedule: schedule.rules.length > 0,
            page: pages.some((p) => p.status === "published"),
          }),
    newRequests,
  });

  return { now, today, warnings, drafts, upcoming, newRequests, sectionIds };
}
