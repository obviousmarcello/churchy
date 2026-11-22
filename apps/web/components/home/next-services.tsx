import type { Location } from "@churchy/contracts";
import { formatTime } from "@churchy/hu";
import type { NextService, Service } from "@churchy/schedule";
import {
  ArrowRightIcon,
  Badge,
  ButtonLink,
  ClockIcon,
  FormattedDate,
  FormattedTime,
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

/** The service type most of the shown rows have: the heading already names it, rows omit it. */
function dominantType(view: NextServicesView): string | null {
  const counts = new Map<string, number>();
  for (const day of view.days)
    for (const s of day.services) counts.set(s.serviceType, (counts.get(s.serviceType) ?? 0) + 1);
  let best: string | null = null;
  let max = 0;
  for (const [type, n] of counts)
    if (n > max) {
      best = type;
      max = n;
    }
  return best;
}

/**
 * The home page's *Következő szentmisék* strip (SDD §7.1, §9.3, D-10, UI-02): a full-width band
 * right below the hero with today and tomorrow (or the next three services within 14 days) under
 * *Ma / Holnap* labels, the upcoming changes, and the link to the full schedule. It is compact on
 * purpose: at most {@link SERVICE_ROWS} rows and two change lines (each with *és még N*), so the
 * whole block fits one phone screen below the hero on any date. Names (`{service.plural}`,
 * `{serviceSchedule.lower}`) come from the church's terminology.
 */
export async function NextServicesStrip({
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
  const omitType = dominantType(view);
  const labels: RowLabels = {
    typeLabel: (type: string) => serviceTypeLabel(type, serviceTypes),
    language: (code: string) => capitalize(schedule("language", { language: languageName(code) })),
    badge: (status: "cancelled" | "modified" | "added") => schedule(`badges.${status}`),
    originalTime: (time: string) => schedule("originalTime", { time }),
  };
  const place = (service: Service) =>
    showLocation ? locationName.get(service.locationId) : undefined;

  return (
    <section
      aria-labelledby="home-next-services"
      className="px-2 pt-2 sm:px-3 sm:pt-3"
      data-testid="next-services"
      data-home-section="nextServices"
    >
      {/* A rounded panel like the hero above it (design v2), white on the page. */}
      <div className="rounded-[calc(var(--radius-xl)_+_0.5rem)] border border-hairline bg-surface-raised shadow-card">
        {/* Phone: one column in reading order. From 1024 px: title and link | days | changes. */}
        <div className="mx-auto grid w-full max-w-(--content-max) gap-4 px-(--gutter) py-5 sm:py-8 lg:grid-cols-[minmax(13rem,1fr)_2.2fr_minmax(15rem,1.3fr)] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:gap-y-5 lg:py-10">
          <h2
            id="home-next-services"
            className="flex items-center gap-2 font-heading text-section-title [font-weight:var(--fw-heading)] tracking-(--heading-tracking) text-primary lg:col-start-1 lg:row-start-1 lg:items-start"
          >
            <ClockIcon className="size-6 shrink-0 text-accent-text lg:mt-0.5" />
            {t("nextServices")}
          </h2>

          {view.days.length === 0 ? (
            <p
              className="text-fs-3 text-muted lg:col-start-2 lg:row-span-2 lg:row-start-1"
              data-testid="next-services-empty"
            >
              {t("nextServicesNone")}
            </p>
          ) : (
            <div
              className="flex flex-col gap-2 lg:col-start-2 lg:row-span-2 lg:row-start-1"
              data-testid="next-services-days"
            >
              <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {view.days.map((day) => (
                  <div key={day.date} data-date={day.date} data-testid="next-services-day">
                    <h3 className="font-body text-fs-3 leading-tight font-semibold text-accent-text">
                      <FormattedDate value={day.date} format="relative" now={now} />
                    </h3>
                    <ul className="mt-1 grid gap-1">
                      {day.services.map((service) => (
                        <ServiceRow
                          key={service.id}
                          service={service}
                          place={place(service)}
                          showType={service.serviceType !== omitType}
                          labels={labels}
                          inProgressLabel={t("inProgress")}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {view.moreServices > 0 ? (
                <p className="text-fs-2 text-muted" data-testid="next-services-more">
                  {t("moreServices", { count: view.moreServices })}
                </p>
              ) : null}
            </div>
          )}

          {view.exceptions.length > 0 ? (
            <div
              className="self-start rounded-card bg-accent-soft px-4 py-3 lg:col-start-3 lg:row-span-2 lg:row-start-1"
              data-testid="next-services-exceptions"
            >
              <h3 className="font-body text-fs-2 font-semibold text-text">{t("changesHeading")}</h3>
              <ul className="mt-1.5 grid gap-1.5">
                {view.exceptions.map((line) => (
                  <ExceptionRow
                    key={`${line.exceptionId}-${line.service.id}`}
                    date={line.date}
                    kind={line.kind}
                    service={line.service}
                    place={place(line.service)}
                    labels={labels}
                  />
                ))}
              </ul>
              {view.moreExceptions > 0 ? (
                <p className="mt-1.5 text-fs-2 text-muted">
                  <a href={href} className="text-text underline underline-offset-4">
                    {t("changesMore", { count: view.moreExceptions })}
                  </a>
                </p>
              ) : null}
            </div>
          ) : null}

          <ButtonLink
            href={href}
            variant="secondary"
            size="sm"
            iconEnd={<ArrowRightIcon />}
            className="self-start justify-self-start lg:col-start-1 lg:row-start-2"
            data-testid="next-services-all"
          >
            {t("fullSchedule")}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

interface RowLabels {
  typeLabel: (type: string) => string;
  language: (code: string) => string;
  badge: (status: "cancelled" | "modified" | "added") => string;
  originalTime: (time: string) => string;
}

function ServiceRow({
  service,
  place,
  showType,
  labels,
  inProgressLabel,
}: {
  service: NextService;
  place: string | undefined;
  showType: boolean;
  labels: RowLabels;
  inProgressLabel: string;
}) {
  const badge = exceptionBadge(service.status);
  const moved =
    service.status === "modified" && service.original && service.original.time !== service.time
      ? service.original.time
      : null;
  // Without a place, the type is the only description: then it always shows.
  const typeShown = showType || !place;
  return (
    <li
      data-service-status={service.status}
      data-testid="next-service"
      className="grid grid-cols-[3rem_1fr] items-baseline gap-x-3 text-fs-3"
    >
      <span className="font-semibold tabular-nums">
        <FormattedTime value={service.time} />
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        {place ? <span>{place}</span> : null}
        {typeShown ? (
          <span className={cn(place && "text-fs-2 text-muted")}>
            {labels.typeLabel(service.serviceType)}
          </span>
        ) : null}
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

function ExceptionRow({
  date,
  kind,
  service,
  place,
  labels,
}: {
  date: string;
  kind: string;
  service: Service;
  place: string | undefined;
  labels: RowLabels;
}) {
  const badge = exceptionBadge(service.status);
  const cancelled = service.status === "cancelled";
  const moved =
    service.status === "modified" && service.original && service.original.time !== service.time
      ? service.original.time
      : null;
  return (
    <li data-exception-kind={kind} className="text-fs-2 leading-snug">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-semibold">
          <FormattedDate value={date} format="monthDay" />
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
          {place ?? labels.typeLabel(service.serviceType)}
        </span>
        {moved ? (
          <span className="text-muted">
            <s>{labels.originalTime(formatTime(moved))}</s>
          </span>
        ) : null}
      </p>
      {service.reason ? <p className="line-clamp-2 text-muted">{service.reason}</p> : null}
    </li>
  );
}
