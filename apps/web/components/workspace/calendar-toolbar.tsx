import Link from "next/link";
import type { Calendar } from "@churchy/contracts";
import { monthName } from "@churchy/hu";
import { Button, ButtonLink, Checkbox, FormattedDate } from "@churchy/ui";
import { getT } from "@/i18n/server";
import {
  CALENDAR_PARAM,
  DATE_PARAM,
  FILTERED_PARAM,
  LAYERS,
  LAYER_PARAM,
  VIEWS,
  VIEW_PARAM,
  calendarQuery,
  stepDate,
  type CalendarParams,
  type CalendarView,
} from "@/lib/workspace/calendar";
import type { EntryLabels } from "./entry-labels";

const BASE = "/munkater/naptar";
const linkClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border-2 border-border-strong px-3 font-semibold text-text no-underline hover:bg-primary-soft aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-contrast";

/** Heading text of the shown period: the month, the week range or the day. */
export function PeriodTitle({ view, date }: { view: CalendarView | "auto"; date: string }) {
  switch (view) {
    case "nap":
      return <FormattedDate value={date} />;
    case "het":
      return <FormattedDate value={date} format="weekRange" />;
    case "napirend":
      return <FormattedDate value={date} format="short" />;
    default:
      return <>{`${date.slice(0, 4)}. ${monthName(Number(date.slice(5, 7)))}`}</>;
  }
}

/**
 * View switcher, previous / next / today and the layer + calendar filter (a plain GET form, so it
 * works without JavaScript). The filter is a disclosure to keep the phone screen calm.
 */
export async function CalendarToolbar({
  params,
  today,
  calendars,
  labels,
  canCreate,
}: {
  params: CalendarParams;
  today: string;
  calendars: readonly Calendar[];
  labels: EntryLabels;
  canCreate: boolean;
}) {
  const t = await getT("munkater.calendar");
  const effective: CalendarView = params.view === "auto" ? "honap" : params.view;
  const q = (patch: Partial<CalendarParams>) => `${BASE}?${calendarQuery(params, patch)}`;
  return (
    <div className="flex flex-col gap-3" data-testid="calendar-toolbar">
      <nav aria-label={t("viewSwitcher")} className="flex flex-wrap gap-2">
        {VIEWS.map((view) => (
          <Link
            key={view}
            href={q({ view })}
            aria-current={params.view === view ? "page" : undefined}
            className={linkClass}
            data-view={view}
          >
            {t(`views.${view}`)}
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={q({ date: stepDate(effective, params.date, -1) })}
          className={linkClass}
          rel="prev"
        >
          {t("previous")}
        </Link>
        <Link href={q({ date: today })} className={linkClass}>
          {t("today")}
        </Link>
        <Link
          href={q({ date: stepDate(effective, params.date, 1) })}
          className={linkClass}
          rel="next"
        >
          {t("next")}
        </Link>
        {canCreate ? (
          <ButtonLink href="/munkater/naptar/uj" className="ml-auto">
            {t("newEvent")}
          </ButtonLink>
        ) : null}
      </div>
      <details
        className="rounded-md border border-border bg-surface-raised"
        data-testid="calendar-filter"
      >
        <summary className="flex min-h-11 cursor-pointer items-center px-3 font-semibold">
          {t("filter")}
        </summary>
        <form method="get" action={BASE} className="grid gap-4 p-3">
          {params.view !== "auto" ? (
            <input type="hidden" name={VIEW_PARAM} value={params.view} />
          ) : null}
          <input type="hidden" name={DATE_PARAM} value={params.date} />
          <input type="hidden" name={FILTERED_PARAM} value="1" />
          <fieldset className="grid gap-1">
            <legend className="font-semibold">{t("layersLegend")}</legend>
            {LAYERS.map((layer) => (
              <Checkbox
                key={layer}
                name={LAYER_PARAM}
                value={layer}
                label={labels.layers[layer]}
                defaultChecked={params.layers.includes(layer)}
              />
            ))}
          </fieldset>
          {calendars.length > 0 ? (
            <fieldset className="grid gap-1">
              <legend className="font-semibold">{t("calendarsLegend")}</legend>
              {calendars.map((calendar) => (
                <Checkbox
                  key={calendar.id}
                  name={CALENDAR_PARAM}
                  value={calendar.id}
                  label={calendar.name}
                  help={undefined}
                  defaultChecked={
                    params.calendarIds.length === 0 || params.calendarIds.includes(calendar.id)
                  }
                />
              ))}
            </fieldset>
          ) : null}
          <div>
            <Button type="submit">{t("applyFilter")}</Button>
          </div>
        </form>
      </details>
    </div>
  );
}
