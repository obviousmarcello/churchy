import type { Location } from "@churchy/contracts";
import type { ScheduleDay } from "@churchy/schedule";
import { WeekDays } from "@/components/schedule/week-days";
import { getT } from "@/i18n/server";
import {
  languageName,
  weekRangeLabel,
  type ServiceTypeOption,
  type WeekNav,
} from "@/lib/service-schedule/view";

/**
 * The week of the public service schedule: heading and the shared day list (`WeekDays`, also used
 * by the admin editor's preview).
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
        <WeekDays
          days={days}
          locations={locations}
          showLocation={showLocation}
          serviceTypes={serviceTypes}
          today={today}
          now={now}
          labels={{
            today: t("today"),
            noServices: t("noServices"),
            badge: (status) => t(`badges.${status}`),
            language: (code) => t("language", { language: languageName(code) }),
            originalTime: (time) => t("originalTime", { time }),
          }}
        />
      )}
    </section>
  );
}
