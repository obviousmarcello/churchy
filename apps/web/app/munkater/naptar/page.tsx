import { CalendarToolbar, PeriodTitle } from "@/components/workspace/calendar-toolbar";
import { AgendaView, DayView, MonthView, WeekView } from "@/components/workspace/calendar-views";
import { getEntryLabels } from "@/components/workspace/entry-labels";
import { getT } from "@/i18n/server";
import { buildEntries, groupByDay, parseCalendarParams, windowFor } from "@/lib/workspace/calendar";
import { creatableVisibilities } from "@/lib/workspace/event-access";
import { getMemberEnv, loadCalendarSources } from "@/server/workspace";
import { requireWorkspaceModule } from "@/server/workspace-nav";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.calendar"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * *Naptár* (D-58, SDD §22.1): day / week / month / agenda views over the events the actor may see
 * plus the computed layers (services, room bookings, my assignments, absences, holidays). State is
 * in the URL (`?nezet=&datum=&reteg=&naptar=`). Without `nezet` the agenda shows below 768 px and
 * the month from there up.
 */
export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  await requireWorkspaceModule("ws.calendar");
  const [env, t, labels] = await Promise.all([
    getMemberEnv(),
    getT("munkater.calendar"),
    getEntryLabels(),
  ]);
  const params = parseCalendarParams(await searchParams, env.today);
  const window = windowFor(params.view, params.date);
  const sources = await loadCalendarSources(env, window.from, window.to, params.layers);
  const byDay = groupByDay(
    buildEntries(sources, params.layers, params.calendarIds),
    window.from,
    window.to,
  );
  const common = { byDay, today: env.today, labels };
  const canCreate = creatableVisibilities(env.actor, env.tenantId, null).length > 0;

  return (
    <div className="flex flex-col gap-5" data-testid="workspace-calendar">
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {t("title")}
        </h1>
        <p className="mt-1 text-fs-4 text-muted" data-testid="calendar-period">
          <PeriodTitle view={params.view} date={params.date} />
        </p>
      </header>
      <CalendarToolbar
        params={params}
        today={env.today}
        calendars={sources.calendars}
        labels={labels}
        canCreate={canCreate}
      />
      {params.view === "nap" ? <DayView {...common} date={params.date} /> : null}
      {params.view === "het" ? <WeekView {...common} days={window.days} /> : null}
      {params.view === "napirend" ? <AgendaView {...common} days={window.days} /> : null}
      {params.view === "honap" && window.month ? (
        <MonthView {...common} grid={window.month} params={params} />
      ) : null}
      {params.view === "auto" && window.month ? (
        <>
          <div className="md:hidden">
            <AgendaView {...common} days={window.days} />
          </div>
          <MonthView {...common} grid={window.month} params={params} className="hidden md:block" />
        </>
      ) : null}
    </div>
  );
}
