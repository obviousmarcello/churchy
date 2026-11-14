import type { Location } from "@churchy/contracts";
import { formatTime, weekdayName } from "@churchy/hu";
import type { ScheduleDay, Service } from "@churchy/schedule";
import { Badge, FormattedDate, FormattedTime, cn, type BadgeTone } from "@churchy/ui";
import { getT } from "@/i18n/server";
import {
  DEFAULT_LANGUAGE,
  capitalize,
  exceptionBadge,
  languageName,
  serviceTypeLabel,
  weekRangeLabel,
  type ServiceTypeOption,
  type WeekNav,
} from "@/lib/service-schedule/view";

const EXCEPTION_TONE: Record<"cancelled" | "modified" | "added", BadgeTone> = {
  cancelled: "danger",
  modified: "warning",
  added: "info",
};

/**
 * One row per day (`Hétfő, nov. 10.`), each with its services: time, location, type and language
 * badges, exception badge (*Elmarad / Változás / Rendkívüli*) with its reason, and the note. Today
 * is highlighted, past services are dimmed. In print: two columns, compact type.
 */
export async function WeekView({
  week,
  days,
  locations,
  showLocation,
  serviceTypes,
  today,
  now,
}: {
  week: WeekNav;
  days: readonly ScheduleDay[];
  locations: readonly Location[];
  showLocation: boolean;
  serviceTypes: readonly ServiceTypeOption[];
  today: string;
  /** The current instant (epoch ms), for dimming past services. */
  now: number;
}) {
  const t = await getT("public.schedule");
  const locationName = new Map(locations.map((l) => [l.id, l.name]));

  return (
    <section aria-labelledby="schedule-week-heading" className="mt-8 print:mt-3">
      <h2
        id="schedule-week-heading"
        className="font-heading text-fs-6 font-semibold print:text-[15pt]"
        data-testid="schedule-week-heading"
      >
        {t("weekHeading", { range: weekRangeLabel(week) })}
      </h2>

      {locations.length === 0 ? (
        <p className="mt-4 text-muted">{t("noLocations")}</p>
      ) : (
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
                  "rounded-md border border-border bg-surface-raised p-4 break-inside-avoid",
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
                      {t("today")}
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
                    {t("noServices")}
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
                        labels={{
                          badge: (status) => t(`badges.${status}`),
                          language: (code) =>
                            capitalize(t("language", { language: languageName(code) })),
                          originalTime: (time) => t("originalTime", { time }),
                        }}
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function ServiceItem({
  service,
  locationName,
  serviceTypes,
  past,
  labels,
}: {
  service: Service;
  locationName: string | null | undefined;
  serviceTypes: readonly ServiceTypeOption[];
  past: boolean;
  labels: {
    badge: (status: "cancelled" | "modified" | "added") => string;
    language: (code: string) => string;
    originalTime: (time: string) => string;
  };
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
      className={cn(
        "grid grid-cols-[4.5rem_1fr] gap-x-3 print:grid-cols-[3.2rem_1fr] print:gap-x-2 print:text-[9.5pt] print:leading-tight",
        past && "text-muted print:text-text",
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
              {labels.language(service.language)}
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
