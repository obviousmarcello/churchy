import type { Location, ScheduleData } from "@churchy/contracts";
import { liturgicalDay, publicHoliday } from "@churchy/calendar";
import { addDays, todayInBudapest } from "@churchy/hu";
import { effectiveConfig } from "@churchy/presets";
import type { DayContext } from "@churchy/schedule";
import { PREVIEW_WEEKS, previewWeeks } from "@/lib/admin/schedule-editor";
import type { ServiceTypeOption } from "@/lib/service-schedule/view";
import { adminData } from "@/server/content-admin";

/** Everything the schedule admin screens (D-22) need, serialisable for the client editors. */
export interface ScheduleAdminData {
  locations: Location[];
  data: ScheduleData;
  serviceTypes: ServiceTypeOption[];
  today: string;
  /** The request's current instant (epoch ms). */
  now: number;
  /** Feast / holiday annotation per day, for the preview weeks and a year ahead. */
  dayContexts: Record<string, DayContext>;
}

/** Days with a feast annotation are computed ahead for the exception flow's date picker. */
const CONTEXT_DAYS = 400;

export async function loadScheduleAdmin(): Promise<ScheduleAdminData | null> {
  const { ctx, repos, now } = await adminData();
  const tenant = await repos.tenants.current(ctx);
  if (tenant === null) return null;
  const config = effectiveConfig({
    name: tenant.name,
    denomination: tenant.denomination,
    siteConfig: tenant.siteConfig,
  });
  const [locations, data] = await Promise.all([
    repos.locations.list(ctx),
    repos.schedule.getScheduleData(ctx),
  ]);
  const today = todayInBudapest(now);
  const first = previewWeeks(today, PREVIEW_WEEKS)[0]?.monday ?? today;
  const dayContexts: Record<string, DayContext> = {};
  for (let i = 0; i < CONTEXT_DAYS; i += 1) {
    const date = addDays(first, i);
    const day = liturgicalDay(date, config.calendarFamily);
    const holiday = publicHoliday(date);
    const context: DayContext = {
      ...(day.name !== null && (day.isSunday || day.isNotable)
        ? { liturgicalDayName: day.name }
        : {}),
      ...(holiday ? { publicHolidayName: holiday.name } : {}),
    };
    if (context.liturgicalDayName !== undefined || context.publicHolidayName !== undefined) {
      dayContexts[date] = context;
    }
  }
  return {
    locations,
    data,
    serviceTypes: config.serviceTypes.map(({ key, forms }) => ({
      key,
      forms: { nom: forms.nom, lower: forms.lower },
    })),
    today,
    now: now.getTime(),
    dayContexts,
  };
}
