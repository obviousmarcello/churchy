import type { Location } from "@churchy/contracts";
import { formatTime } from "@churchy/hu";
import type { NextService, Service } from "@churchy/schedule";
import {
  Badge,
  ButtonLink,
  FormattedDate,
  FormattedTime,
  SectionHeading,
  cn,
  type BadgeTone,
} from "@churchy/ui";
import { getT } from "@/i18n/server";
import type { NextServicesView } from "@/lib/home/next-services";
import {
  DEFAULT_LANGUAGE,
  capitalize,
  exceptionBadge,
  languageName,
  serviceTypeLabel,
  type ServiceTypeOption,
} from "@/lib/service-schedule/view";
import { termRoutePath } from "@/lib/term-routes";

const EXCEPTION_TONE: Record<"cancelled" | "modified" | "added", BadgeTone> = {
  cancelled: "danger",
  modified: "warning",
  added: "info",
};

/**
 * The home page's *Következő szentmisék* card (SDD §7.1, §9.3, D-10): today and tomorrow (or the
 * next three services within 14 days) with *Ma / Holnap* labels, upcoming exceptions highlighted,
 * and a link to the full schedule. Compact rows, so the card stays within one screen on a phone.
 * Names (`{service.plural}`, `{serviceSchedule.lower}`) come from the church's terminology.
 */
export async function NextServicesCard({
  view,
  now,
  locations,
  serviceTypes,
}: {
  view: NextServicesView;
  /** The request's instant; labels are relative to it. */
  now: Date;
  locations: readonly Location[];
  serviceTypes: readonly ServiceTypeOption[];
}) {
  const [t, schedule] = await Promise.all([getT("public.home"), getT("public.schedule")]);
  const href = termRoutePath(t, "serviceSchedule");
  const showLocation = locations.length > 1;
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const labels = {
    typeLabel: (type: string) => serviceTypeLabel(type, serviceTypes),
    language: (code: string) => capitalize(schedule("language", { language: languageName(code) })),
    badge: (status: "cancelled" | "modified" | "added") => schedule(`badges.${status}`),
    originalTime: (time: string) => schedule("originalTime", { time }),
    place: (service: Service) => (showLocation ? locationName.get(service.locationId) : undefined),
  };

  return (
    <section
      aria-labelledby="home-next-services"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-4 shadow-card sm:p-6"
      data-testid="next-services"
    >
      <SectionHeading id="home-next-services" title={t("nextServices")} />

      {view.days.length === 0 ? (
        <p className="text-fs-3 text-muted" data-testid="next-services-empty">
          {t("nextServicesNone")}
        </p>
      ) : (
        <div className="flex flex-col gap-3" data-testid="next-services-days">
          {view.days.map((day) => (
            <div key={day.date} data-date={day.date} data-testid="next-services-day">
              <h3 className="font-heading text-fs-4 leading-tight font-bold text-primary">
                <FormattedDate value={day.date} format="relative" now={now} />
              </h3>
              <ul className="mt-1 grid gap-1.5">
                {day.services.map((service) => (
                  <ServiceRow
                    key={service.id}
                    service={service}
                    place={labels.place(service)}
                    labels={labels}
                    inProgressLabel={t("inProgress")}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {view.exceptions.length > 0 ? (
        <div
          className="rounded-md border-l-[6px] border-accent bg-accent-soft p-3"
          data-testid="next-services-exceptions"
        >
          <h3 className="text-fs-2 font-bold tracking-[0.12em] text-text uppercase">
            {t("changesHeading")}
          </h3>
          <ul className="mt-1.5 grid gap-2">
            {view.exceptions.map((line) => {
              const { service } = line;
              const badge = exceptionBadge(service.status);
              const cancelled = service.status === "cancelled";
              const place = labels.place(service);
              const moved =
                service.status === "modified" &&
                service.original &&
                service.original.time !== service.time
                  ? service.original.time
                  : null;
              return (
                <li
                  key={`${line.exceptionId}-${service.id}`}
                  data-exception-kind={line.kind}
                  className="text-fs-3"
                >
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold">
                      <FormattedDate value={line.date} format="monthDay" />
                    </span>
                    {badge ? (
                      <Badge tone={EXCEPTION_TONE[badge]} data-badge="exception">
                        {labels.badge(badge)}
                      </Badge>
                    ) : null}
                    <span className="tabular-nums">
                      {cancelled ? (
                        <s>
                          <FormattedTime value={service.time} />
                        </s>
                      ) : (
                        <FormattedTime value={service.time} />
                      )}
                    </span>
                    <span className={cn(cancelled && "line-through")}>
                      {[place, labels.typeLabel(service.serviceType)].filter(Boolean).join(" · ")}
                    </span>
                    {moved ? (
                      <span className="text-fs-2 text-muted">
                        <s>{labels.originalTime(formatTime(moved))}</s>
                      </span>
                    ) : null}
                  </p>
                  {service.reason ? (
                    <p className="text-fs-2 font-semibold">{service.reason}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {view.moreExceptions > 0 ? (
            <p className="mt-2 text-fs-2 text-muted">
              {t("changesMore", { count: view.moreExceptions })}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <ButtonLink href={href} variant="secondary" size="sm" data-testid="next-services-all">
          {t("fullSchedule")}
          <span aria-hidden="true"> →</span>
        </ButtonLink>
      </div>
    </section>
  );
}

function ServiceRow({
  service,
  place,
  labels,
  inProgressLabel,
}: {
  service: NextService;
  place: string | undefined;
  labels: {
    typeLabel: (type: string) => string;
    language: (code: string) => string;
    badge: (status: "cancelled" | "modified" | "added") => string;
    originalTime: (time: string) => string;
  };
  inProgressLabel: string;
}) {
  const badge = exceptionBadge(service.status);
  const moved =
    service.status === "modified" && service.original && service.original.time !== service.time
      ? service.original.time
      : null;
  return (
    <li
      data-service-status={service.status}
      data-testid="next-service"
      className="grid grid-cols-[3.25rem_1fr] items-baseline gap-x-3 text-fs-3"
    >
      <span className="font-bold tabular-nums">
        <FormattedTime value={service.time} />
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {place ? <span className="font-semibold">{place}</span> : null}
        <span className={cn(place && "text-muted")}>{labels.typeLabel(service.serviceType)}</span>
        {service.language !== DEFAULT_LANGUAGE ? (
          <Badge tone="accent">{labels.language(service.language)}</Badge>
        ) : null}
        {badge ? <Badge tone={EXCEPTION_TONE[badge]}>{labels.badge(badge)}</Badge> : null}
        {moved ? (
          <span className="text-fs-2 text-muted">
            <s>{labels.originalTime(formatTime(moved))}</s>
          </span>
        ) : null}
        {service.inProgress ? (
          <Badge tone="success" dot data-testid="service-live">
            {inProgressLabel}
          </Badge>
        ) : null}
      </span>
    </li>
  );
}
