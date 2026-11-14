import type { Location } from "@churchy/contracts";
import { Button, ButtonLink, Input, cn } from "@churchy/ui";
import { getT } from "@/i18n/server";
import {
  DATE_PARAM,
  LOCATION_PARAM,
  scheduleHref,
  type WeekNav,
} from "@/lib/service-schedule/view";

/**
 * Week switcher, date field and location chips. Plain links and a GET form: everything works
 * without JavaScript and each state is a URL. Hidden in print.
 */
export async function ScheduleFilters({
  basePath,
  week,
  locations,
  location,
  dateValue,
  dateError,
}: {
  basePath: string;
  week: WeekNav;
  locations: readonly Location[];
  location: Location | null;
  /** Current value of the date field (Hungarian format, or what the visitor typed). */
  dateValue: string;
  dateError: boolean;
}) {
  const t = await getT("public.schedule");
  const slug = location?.slug ?? null;
  const shownWeek = week.isCurrentWeek ? null : week.monday;

  return (
    <div className="mt-6 grid gap-5 print:hidden" data-testid="schedule-filters">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <nav aria-label={t("weekNavigation")}>
          <ul className="flex flex-wrap gap-2">
            <li>
              <ButtonLink
                variant="secondary"
                size="sm"
                href={scheduleHref(basePath, { date: week.previous, location: slug })}
              >
                <span aria-hidden="true">‹</span> {t("previousWeek")}
              </ButtonLink>
            </li>
            <li>
              <ButtonLink
                variant={week.isCurrentWeek ? "primary" : "secondary"}
                size="sm"
                href={scheduleHref(basePath, { location: slug })}
                aria-current={week.isCurrentWeek ? "date" : undefined}
              >
                {t("thisWeek")}
              </ButtonLink>
            </li>
            <li>
              <ButtonLink
                variant="secondary"
                size="sm"
                href={scheduleHref(basePath, { date: week.next, location: slug })}
              >
                {t("nextWeek")} <span aria-hidden="true">›</span>
              </ButtonLink>
            </li>
          </ul>
        </nav>

        <form
          method="get"
          action={basePath}
          className="flex flex-wrap items-start gap-2"
          data-testid="schedule-date-form"
        >
          <Input
            name={DATE_PARAM}
            label={t("dateLabel")}
            help={t("dateHelp")}
            error={dateError ? t("dateInvalid") : undefined}
            defaultValue={dateValue}
            inputMode="numeric"
            autoComplete="off"
            wrapperClassName="w-56 max-w-full"
          />
          {slug ? <input type="hidden" name={LOCATION_PARAM} value={slug} /> : null}
          <Button type="submit" variant="secondary" className="mt-8">
            {t("dateSubmit")}
          </Button>
        </form>
      </div>

      {locations.length > 1 ? (
        <nav aria-label={t("locationFilter")}>
          <ul className="flex flex-wrap gap-2">
            {[null, ...locations].map((l) => {
              const active = (l?.id ?? null) === (location?.id ?? null);
              return (
                <li key={l?.id ?? "all"}>
                  <a
                    href={scheduleHref(basePath, { date: shownWeek, location: l?.slug })}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full border-2 px-4 text-fs-2 font-semibold no-underline",
                      active
                        ? "border-primary bg-primary text-primary-contrast"
                        : "border-border-strong bg-surface-raised text-text hover:border-primary hover:text-primary",
                    )}
                  >
                    {l ? l.name : t("allLocations")}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
