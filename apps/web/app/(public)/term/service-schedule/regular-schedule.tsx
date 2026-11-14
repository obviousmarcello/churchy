import { formatMonthDay, parseIsoDate, weekdayName } from "@churchy/hu";
import type { ServiceRule } from "@churchy/contracts";
import { Badge, FormattedTime } from "@churchy/ui";
import { getT } from "@/i18n/server";
import {
  DEFAULT_LANGUAGE,
  capitalize,
  languageName,
  serviceTypeLabel,
  type RegularLocation,
  type ServiceTypeOption,
  type Validity,
} from "@/lib/service-schedule/view";

/** `2026. szeptember 1.`, or `június 15.` for the month-days of a yearly period. */
function validityDate(iso: string, yearly: boolean): string {
  const monthDay = formatMonthDay(iso, { style: "long" });
  return yearly ? monthDay : `${parseIsoDate(iso).year}. ${monthDay}`;
}

/**
 * *Általános miserend* (SDD §7.2): the regular weekly table per location and period, each with its
 * validity (*Érvényes: …*) and the period in force today marked. Not printed (print shows the week).
 */
export async function RegularSchedule({
  regular,
  serviceTypes,
}: {
  regular: readonly RegularLocation[];
  serviceTypes: readonly ServiceTypeOption[];
}) {
  const t = await getT("public.schedule");
  if (regular.length === 0) return null;

  const validityText = (v: Validity): string => {
    switch (v.kind) {
      case "always":
        return t("validity.always");
      case "yearly":
        return t("validity.yearly", {
          from: validityDate(v.from, true),
          to: validityDate(v.to, true),
        });
      case "range":
        return t("validity.range", {
          from: validityDate(v.from, false),
          to: validityDate(v.to, false),
        });
      case "from":
        return t("validity.from", { from: validityDate(v.from, false) });
      case "until":
        return t("validity.until", { to: validityDate(v.to, false) });
    }
  };

  const ruleDetails = (rule: ServiceRule): string[] => {
    const details = [serviceTypeLabel(rule.serviceType, serviceTypes)];
    if (rule.language !== DEFAULT_LANGUAGE) {
      details.push(t("language", { language: languageName(rule.language) }));
    }
    if (rule.nthWeek !== null) {
      details.push(
        t("nthWeek", {
          nth: rule.nthWeek === -1 ? "last" : String(rule.nthWeek),
          weekday: String(rule.weekday),
        }),
      );
    }
    return details;
  };

  return (
    <section
      aria-labelledby="schedule-regular-heading"
      className="mt-12 print:hidden"
      data-testid="schedule-regular"
    >
      <h2 id="schedule-regular-heading" className="font-heading text-fs-6 font-semibold">
        {t("regularTitle")}
      </h2>
      <p className="mt-2 max-w-prose text-muted">{t("regularLead")}</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        {regular.map(({ location, periods }) => (
          <div key={location.id} data-location={location.slug}>
            <h3 className="font-heading text-fs-5 font-semibold text-primary">{location.name}</h3>
            {periods.length === 0 ? (
              <p className="mt-2 text-fs-2 text-muted">{t("regularEmpty")}</p>
            ) : (
              periods.map(({ period, validity, current, rows }) => (
                <div key={period.id} className="mt-4" data-period={period.id}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h4 className="text-fs-3 font-semibold">{period.name}</h4>
                    {current ? <Badge tone="success">{t("regularCurrent")}</Badge> : null}
                  </div>
                  <p className="text-fs-2 text-muted" data-testid="schedule-validity">
                    {validityText(validity)}
                  </p>
                  <table className="mt-2 w-full border-collapse text-left text-fs-2">
                    <caption className="sr-only">
                      {t("regularCaption", { location: location.name, period: period.name })}
                    </caption>
                    <thead>
                      <tr className="border-b-2 border-border-strong">
                        <th scope="col" className="w-32 py-1.5 pr-3 font-semibold">
                          {t("regularDay")}
                        </th>
                        <th scope="col" className="py-1.5 font-semibold">
                          {t("regularServices")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ weekday, rules }) => (
                        <tr key={weekday} className="border-b border-border align-top">
                          <th scope="row" className="py-1.5 pr-3 font-semibold">
                            {weekdayName(weekday, { capitalize: true })}
                          </th>
                          <td className="py-1.5">
                            <ul className="grid gap-1">
                              {rules.map((rule) => (
                                <li key={rule.id}>
                                  <FormattedTime
                                    value={rule.time}
                                    className="font-semibold tabular-nums"
                                  />{" "}
                                  {capitalize(ruleDetails(rule).join(", "))}
                                  {rule.note ? (
                                    <span className="block text-muted">{rule.note}</span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
