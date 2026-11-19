import { notFound } from "next/navigation";
import { Alert } from "@churchy/ui";
import { ticketStats } from "@churchy/hr";
import { can } from "@churchy/policy";
import { getT } from "@/i18n/server";
import { getOrgHrEnv } from "@/server/org-hr";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.orgReports")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/**
 * *Jelentések* (D-85, demo depth): per parish tickets, SLA and approved absence days of the
 * current year, with a *Plébánia* column. Only parishes the actor may report on (`hr.report.view`)
 * and only delegated, non-confidential tickets count. Payroll CSV and leave balances arrive with
 * D-86.
 */
export default async function PortalReportsPage() {
  const env = await getOrgHrEnv();
  if (env === null) notFound();
  const t = await getT("portal.reports");
  const year = env.today.slice(0, 4);
  const parishes = env.parishes.filter(
    (p) => p.linkStatus === "active" && can(env.actor, "hr.report.view", { tenantId: p.tenantId }),
  );
  const absences = await env.repos.absences.list(env.ctx, {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    statuses: ["approved"],
  });

  const rows = parishes.map((p) => {
    const own = env.rows.filter((r) => r.ticket.tenantId === p.tenantId);
    const s = ticketStats(
      own.map(({ ticket, category }) => ({
        id: ticket.id,
        categoryId: ticket.categoryId,
        status: ticket.status,
        createdAt: ticket.createdAt,
        closedAt: ticket.closedAt,
        slaHours: category.slaHours,
      })),
      env.now,
      env.calendar,
    );
    const metOnTime = own.filter((r) => r.sla.state === "metOnTime").length;
    const closed = own.filter((r) => r.ticket.closedAt !== null).length;
    return {
      parish: p,
      open: s.open,
      overdue: s.overdueIds.length,
      closed,
      metOnTime,
      median: s.medianResolutionMinutes,
      days: absences
        .filter((a) => a.tenantId === p.tenantId)
        .reduce((sum, a) => sum + a.workingDays, 0),
    };
  });

  return (
    <div className="flex flex-col gap-6" data-testid="portal-reports">
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {t("title")}
        </h1>
        <p className="mt-1 max-w-prose text-fs-4 text-muted">{t("lead", { year })}</p>
      </header>
      {rows.length === 0 ? (
        <Alert tone="info" title={t("emptyTitle")}>
          <p>{t("emptyBody")}</p>
        </Alert>
      ) : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("title")}>
          <table className="w-full min-w-[40rem] text-left" data-testid="portal-reports-table">
            <caption className="sr-only">{t("title")}</caption>
            <thead>
              <tr>
                <th scope="col" className="py-1 pr-3">
                  {t("colParish")}
                </th>
                <th scope="col" className="py-1 pr-3">
                  {t("colOpen")}
                </th>
                <th scope="col" className="py-1 pr-3">
                  {t("colOverdue")}
                </th>
                <th scope="col" className="py-1 pr-3">
                  {t("colSla")}
                </th>
                <th scope="col" className="py-1 pr-3">
                  {t("colMedian")}
                </th>
                <th scope="col" className="py-1">
                  {t("colDays")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.parish.tenantId} className="border-t border-border">
                  <th scope="row" className="py-1 pr-3 font-normal">
                    {r.parish.name}
                  </th>
                  <td className="py-1 pr-3">{r.open}</td>
                  <td className="py-1 pr-3">{r.overdue}</td>
                  <td className="py-1 pr-3">
                    {r.closed === 0 ? "–" : t("slaMet", { met: r.metOnTime, closed: r.closed })}
                  </td>
                  <td className="py-1 pr-3">
                    {r.median === null ? "–" : t("hours", { count: Math.round(r.median / 60) })}
                  </td>
                  <td className="py-1">{r.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-muted">{t("note")}</p>
    </div>
  );
}
