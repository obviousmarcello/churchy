import type { Location } from "@churchy/contracts";
import { formatTime, weekdayName } from "@churchy/hu";
import type { ScheduleDay, Service } from "@churchy/schedule";
import { Badge, FormattedDate, FormattedTime, cn, type BadgeTone } from "@churchy/ui";
import {
  DEFAULT_LANGUAGE,
  capitalize,
  exceptionBadge,
  serviceTypeLabel,
  type ServiceTypeOption,
} from "@/lib/service-schedule/view";

const EXCEPTION_TONE: Record<"cancelled" | "modified" | "added", BadgeTone> = {
  cancelled: "danger",
  modified: "warning",
  added: "info",
};

/** Texts of the week list; the public page and the admin preview each supply their own source. */
export interface WeekDaysLabels {
  today: string;
  noServices: string;
  badge: (status: "cancelled" | "modified" | "added") => string;
  /** Badge of a non-default language (`német nyelvű`); capitalised here. */
  language: (code: string) => string;
  /** The struck-through time a service was moved from. */
  originalTime: (time: string) => string;
  /** Badge on services the admin preview marks as changed (optional). */
  changed?: string;
}

export interface WeekDaysProps {
  days: readonly ScheduleDay[];
  locations: readonly Location[];
  showLocation: boolean;
  serviceTypes: readonly ServiceTypeOption[];
  today: string;
  /** The current instant (epoch ms), for dimming past services. */
  now: number;
  labels: WeekDaysLabels;
  /** Admin preview: services for which this returns true are highlighted as changed. */
  isChanged?: (service: Service) => boolean;
}

/**
 * One row per day (`Hétfő, nov. 10.`), each with its services: time, location, type and language
 * badges, exception badge (*Elmarad / Változás / Rendkívüli*) with its reason, and the note. Today
 * is highlighted, past services are dimmed. In print: two columns, compact type.
 *
 * Shared by the public service schedule (D-11) and the admin editor's live preview (D-22), so the
 * editor shows exactly what visitors will see. No server-only imports: every text arrives through
 * `labels`.
 */
export function WeekDays({
  days,
  locations,
  showLocation,
  serviceTypes,
  today,
  now,
  labels,
  isChanged,
}: WeekDaysProps) {
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  return (
    <ol
      className="mt-4 grid gap-3 print:mt-2 print:block print:columns-2 print:gap-6"
      data-testid="schedule-days"
    >
      {days.map((day) => {
        const isToday = day.date === today;
        const { liturgicalDayName, publicHolidayName } = day.dayContext;
        const context = [liturgicalDayName, publicHolidayName].filter(
          (name, i, all): name is string => !!name && all.indexOf(name) === i,
        );
        return (
          <li
            key={day.date}
            data-date={day.date}
            aria-current={isToday ? "date" : undefined}
            className={cn(
              "rounded-card border border-hairline bg-surface-raised p-4 shadow-xs break-inside-avoid",
              "print:mb-2 print:rounded-none print:border-0 print:border-b print:bg-transparent print:p-0 print:pb-1",
              isToday && "border-l-4 border-l-primary",
            )}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-heading text-fs-5 font-semibold print:text-[12pt]">
                {weekdayName(day.date, { capitalize: true })},{" "}
                <FormattedDate value={day.date} format="monthDay" />
              </h3>
              {isToday ? (
                <Badge tone="primary" className="print:hidden">
                  {labels.today}
                </Badge>
              ) : null}
              {context.length > 0 ? (
                <p className="text-fs-2 text-muted italic print:text-[9pt]">
                  {context.join(" · ")}
                </p>
              ) : null}
            </div>
            {day.services.length === 0 ? (
              <p className="mt-2 text-fs-2 text-muted print:mt-0 print:text-[9pt]">
                {labels.noServices}
              </p>
            ) : (
              <ul className="mt-2 grid gap-2 print:mt-0.5 print:gap-0.5">
                {day.services.map((service) => (
                  <ServiceItem
                    key={service.id}
                    service={service}
                    locationName={showLocation ? locationName.get(service.locationId) : null}
                    serviceTypes={serviceTypes}
                    past={Date.parse(service.endsAt) < now}
                    changed={isChanged?.(service) ?? false}
                    labels={labels}
                  />
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ServiceItem({
  service,
  locationName,
  serviceTypes,
  past,
  changed,
  labels,
}: {
  service: Service;
  locationName: string | null | undefined;
  serviceTypes: readonly ServiceTypeOption[];
  past: boolean;
  changed: boolean;
  labels: WeekDaysLabels;
}) {
  const badge = exceptionBadge(service.status);
  const cancelled = service.status === "cancelled";
  const movedFrom =
    service.status === "modified" && service.original && service.original.time !== service.time
      ? service.original.time
      : null;
  const typeLabel = serviceTypeLabel(service.serviceType, serviceTypes);

  return (
    <li
      data-service-status={service.status}
      data-past={past ? "true" : undefined}
      data-changed={changed ? "true" : undefined}
      className={cn(
        "grid grid-cols-[4.5rem_1fr] gap-x-3 print:grid-cols-[3.2rem_1fr] print:gap-x-2 print:text-[9.5pt] print:leading-tight",
        past && "text-muted print:text-text",
        changed && "-mx-2 rounded-md px-2 py-1 ring-2 ring-primary",
      )}
    >
      <span className="font-semibold tabular-nums">
        {cancelled ? (
          <s>
            <FormattedTime value={service.time} />
          </s>
        ) : (
          <FormattedTime value={service.time} />
        )}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {locationName ? (
            <span className={cn("font-semibold", cancelled && "line-through")}>{locationName}</span>
          ) : null}
          <Badge className="print:border-0 print:px-0 print:text-[9.5pt] print:font-normal">
            {typeLabel}
          </Badge>
          {service.language !== DEFAULT_LANGUAGE ? (
            <Badge
              tone="accent"
              className="print:border-0 print:px-0 print:text-[9.5pt]"
              data-badge="language"
            >
              {capitalize(labels.language(service.language))}
            </Badge>
          ) : null}
          {badge ? (
            <Badge
              tone={EXCEPTION_TONE[badge]}
              className="print:py-0 print:text-[9pt]"
              data-badge="exception"
            >
              {labels.badge(badge)}
            </Badge>
          ) : null}
          {changed && labels.changed ? (
            <Badge tone="primary" data-badge="changed">
              {labels.changed}
            </Badge>
          ) : null}
          {movedFrom ? (
            <span className="text-fs-2 text-muted print:text-[9pt]">
              <s>{labels.originalTime(formatTime(movedFrom))}</s>
            </span>
          ) : null}
        </div>
        {service.reason ? (
          <p className="mt-0.5 text-fs-2 font-semibold print:text-[9pt]">{service.reason}</p>
        ) : null}
        {service.note && !cancelled ? (
          <p className="mt-0.5 text-fs-2 text-muted print:text-[9pt]">{service.note}</p>
        ) : null}
      </div>
    </li>
  );
}
