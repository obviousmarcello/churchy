import { notFound } from "next/navigation";
import { FormattedDate } from "@churchy/ui";
import { addDays } from "@churchy/hu";
import { can } from "@churchy/policy";
import { getT } from "@/i18n/server";
import { getOrgHrEnv, profileKey } from "@/server/org-hr";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.orgAbsences")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

const DAYS_AHEAD = 90;

/**
 * *Távollétek* (D-85): approved absences across the linked parishes for the next 90 days. The
 * portal never reads people records, so a row names the staff member's position, not the person;
 * the reason (category) only shows where the policy allows it for that delegated category.
 */
export default async function PortalAbsencesPage() {
  const env = await getOrgHrEnv();
  if (env === null) notFound();
  const t = await getT("portal.absences");
  const parishName = new Map(env.parishes.map((p) => [p.tenantId, p.name]));
  const absences = (
    await env.repos.absences.list(env.ctx, {
      from: env.today,
      to: addDays(env.today, DAYS_AHEAD),
      statuses: ["approved"],
    })
  ).filter((a) => can(env.actor, "hr.absence.viewCalendar", { tenantId: a.tenantId }));
  const tickets = new Map(env.rows.map((r) => [r.ticket.id, r]));

  return (
    <div className="flex flex-col gap-6" data-testid="portal-absences">
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {t("title")}
        </h1>
        <p className="mt-1 max-w-prose text-fs-4 text-muted">{t("lead", { days: DAYS_AHEAD })}</p>
      </header>
      {absences.length === 0 ? (
        <p data-testid="portal-absences-empty">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("title")}>
          <table className="w-full min-w-96 text-left" data-testid="portal-absences-table">
            <caption className="sr-only">{t("title")}</caption>
            <thead>
              <tr>
                <th scope="col" className="py-1 pr-3">
                  {t("colParish")}
                </th>
                <th scope="col" className="py-1 pr-3">
                  {t("colPosition")}
                </th>
                <th scope="col" className="py-1 pr-3">
                  {t("colPeriod")}
                </th>
                <th scope="col" className="py-1">
                  {t("colReason")}
                </th>
              </tr>
            </thead>
            <tbody>
              {absences.map((a) => {
                const row = a.ticketId === null ? undefined : tickets.get(a.ticketId);
                const reason =
                  row !== undefined &&
                  can(env.actor, "hr.absence.viewDetails", {
                    tenantId: a.tenantId,
                    category: {
                      id: row.category.id,
                      key: row.category.key,
                      confidential: row.category.confidential,
                    },
                  })
                    ? row.category.name
                    : t("away");
                return (
                  <tr key={a.id} className="border-t border-border">
                    <td className="py-1 pr-3">{parishName.get(a.tenantId)}</td>
                    <td className="py-1 pr-3">
                      {env.profiles.get(profileKey(a.tenantId, a.personId))?.position ?? "–"}
                    </td>
                    <td className="py-1 pr-3">
                      <FormattedDate format="short" value={a.startDate} /> –{" "}
                      <FormattedDate format="short" value={a.endDate} />
                    </td>
                    <td className="py-1">{reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
