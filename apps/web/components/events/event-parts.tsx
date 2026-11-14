import type { ReactNode } from "react";
import type { Event } from "@churchy/contracts";
import { describeRecurrence } from "@churchy/events";
import { Badge, FormattedDate, FormattedTime, cn } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { eventPath } from "@/lib/events/public-event";
import type { PublicOccurrence } from "@/server/public-events";

/** Inline text link style (Tailwind's preflight strips the browser's link styling). */
export const LINK_CLASS =
  "font-semibold text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2";

/** Link to the detail page of an occurrence (series members carry their date). */
export function occurrenceHref(occ: PublicOccurrence): string {
  const path = eventPath(occ.event);
  return occ.seriesId !== null && !occ.isOverride ? `${path}?datum=${occ.date}` : path;
}

/** Hungarian recurrence text of a series, or null for single events / undescribable rules. */
export function recurrenceText(master: Event, options: { withTime?: boolean } = {}): string | null {
  if (master.rrule === null) return null;
  return describeRecurrence(master.rrule, {
    start: master.startsAt,
    allDay: master.allDay,
    withTime: options.withTime,
    capitalize: true,
  });
}

/** „2026. november 20., péntek · 18:00–20:00” or the all-day / multi-day variant. */
export async function OccurrenceWhen({
  occ,
  className,
  dateFormat = "long",
}: {
  occ: PublicOccurrence;
  className?: string;
  dateFormat?: "long" | "monthDayLong";
}) {
  const t = await getT("public.events");
  const multiDay = occ.lastDate !== occ.date;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      <span>
        <FormattedDate value={occ.date} format={dateFormat} />
        {multiDay ? (
          <>
            {" – "}
            <FormattedDate value={occ.lastDate} format={dateFormat} />
          </>
        ) : null}
      </span>
      <span aria-hidden="true">·</span>
      {occ.allDay ? (
        <span>{t("allDay")}</span>
      ) : occ.endMs > occ.startMs ? (
        <FormattedTime value={occ.start} end={occ.end} />
      ) : (
        <FormattedTime value={occ.start} />
      )}
    </span>
  );
}

/** Badges for a series member: recurring, moved. */
export async function OccurrenceBadges({
  occ,
  category,
}: {
  occ: PublicOccurrence;
  category?: string | null;
}) {
  const t = await getT("public.events");
  const badges: ReactNode[] = [];
  if (category) badges.push(<Badge key="category">{category}</Badge>);
  if (occ.isOverride) {
    badges.push(
      <Badge key="moved" tone="warning">
        {t("moved")}
      </Badge>,
    );
  }
  return badges.length > 0 ? <span className="flex flex-wrap gap-2">{badges}</span> : null;
}

/** Page heading, lead and the list / month view switch shared by both views. */
export async function EventsHeader({ view }: { view: "list" | "month" }) {
  const t = await getT("public.events");
  const views = [
    { key: "list", href: "/esemenyek", label: t("viewList") },
    { key: "month", href: "/esemenyek/naptar", label: t("viewMonth") },
  ] as const;
  return (
    <header className="flex flex-col gap-4">
      <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">{t("title")}</h1>
      <p className="max-w-prose text-fs-4 text-muted">{t("lead")}</p>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav aria-label={t("views")}>
          <ul className="flex gap-1 rounded-md border border-border bg-surface-sunken p-1">
            {views.map((v) => (
              <li key={v.key}>
                <a
                  href={v.href}
                  aria-current={v.key === view ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-(--control-h-sm) items-center rounded-sm px-4 text-fs-2 font-semibold no-underline",
                    v.key === view
                      ? "bg-primary text-primary-contrast"
                      : "text-primary hover:bg-primary-soft",
                  )}
                >
                  {v.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex max-w-md flex-col gap-1 text-fs-2">
          <a href="/esemenyek.ics" className={LINK_CLASS} data-testid="events-ics-feed">
            {t("subscribe")}
          </a>
          <p className="text-muted">{t("subscribeHint")}</p>
        </div>
      </div>
    </header>
  );
}
