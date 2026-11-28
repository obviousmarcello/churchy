import { notFound } from "next/navigation";
import { Alert, ButtonLink } from "@churchy/ui";
import { isOpen, ticketStats, type TicketStatus } from "@churchy/hr";
import { TicketRow } from "@/components/hr/badges";
import { ScopePanel } from "@/components/portal/scope-panel";
import { getT } from "@/i18n/server";
import { getOrgHrEnv, reachableParishes, type OrgTicketRow } from "@/server/org-hr";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("portal.home"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

const H2 = "font-heading text-fs-5 font-bold text-primary";
const STATUSES: readonly TicketStatus[] = [
  "uj",
  "folyamatban",
  "jovahagyasra_var",
  "jovahagyva",
  "elutasitva",
  "lezart",
];

const statOf = (
  rows: readonly OrgTicketRow[],
  env: NonNullable<Awaited<ReturnType<typeof getOrgHrEnv>>>,
) =>
  ticketStats(
    rows.map(({ ticket, category }) => ({
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

/**
 * *Áttekintés* (D-85): open tickets across the linked parishes, overdue list, counts per parish
 * and status, median resolution time. Only delegated, non-confidential tickets the actor may read
 * are counted — the figures never reveal what is out of scope.
 */
export default async function PortalDashboardPage() {
  const env = await getOrgHrEnv();
  if (env === null) notFound();
  const [t, status] = await Promise.all([getT("portal.overview"), getT("munkater.hr.status")]);
  const stats = statOf(env.rows, env);
  const parishes = reachableParishes(env);
  const overdue = env.rows.filter((r) => stats.overdueIds.includes(r.ticket.id));
  overdue.sort(
    (a, b) => stats.overdueIds.indexOf(a.ticket.id) - stats.overdueIds.indexOf(b.ticket.id),
  );
  const median =
    stats.medianResolutionMinutes === null
      ? "–"
      : String(Math.round(stats.medianResolutionMinutes / 60));
  const tiles: { id: string; label: string; value: string }[] = [
    { id: "open", label: t("open"), value: String(stats.open) },
    { id: "overdue", label: t("overdue"), value: String(stats.overdueIds.length) },
    { id: "waiting", label: t("waiting"), value: String(stats.byStatus.jovahagyasra_var) },
    {
      id: "median",
      label: t("median"),
      value: median === "–" ? median : t("hours", { count: median }),
    },
  ];

  return (
    <div className="flex flex-col gap-8" data-testid="portal-dashboard">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
            {t("title")}
          </h1>
          <p className="mt-1 max-w-prose text-fs-4 text-muted">{t("lead")}</p>
        </div>
        <ButtonLink href="/egyhazmegye/kerelmek" data-testid="portal-to-requests">
          {t("toRequests")}
        </ButtonLink>
      </header>

      <section aria-label={t("figures")}>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="portal-figures">
          {tiles.map((tile) => (
            <div
              key={tile.id}
              className="rounded-md border border-border bg-surface-raised p-4"
              data-figure={tile.id}
            >
              <dt className="text-muted">{tile.label}</dt>
              <dd className="font-heading text-fs-6 font-bold text-primary">{tile.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {parishes.length === 0 ? (
        <Alert tone="info" title={t("emptyTitle")}>
          <p>{t("emptyBody")}</p>
        </Alert>
      ) : (
        <section aria-labelledby="portal-by-parish" className="flex flex-col gap-3">
          <h2 id="portal-by-parish" className={H2}>
            {t("byParish")}
          </h2>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("byParish")}>
            <table className="w-full min-w-96 text-left" data-testid="portal-by-parish">
              <caption className="sr-only">{t("byParish")}</caption>
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
                  <th scope="col" className="py-1">
                    {t("colTotal")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {parishes.map((p) => {
                  const own = env.rows.filter((r) => r.ticket.tenantId === p.tenantId);
                  const s = statOf(own, env);
                  return (
                    <tr
                      key={p.tenantId}
                      className="border-t border-border"
                      data-parish={p.tenantId}
                    >
                      <th scope="row" className="py-1 pr-3 font-normal">
                        <a
                          href={`/egyhazmegye/kerelmek?plebania=${p.tenantId}`}
                          className="inline-flex min-h-11 items-center font-semibold text-primary"
                        >
                          {p.name}
                        </a>
                      </th>
                      <td className="py-1 pr-3">{s.open}</td>
                      <td className="py-1 pr-3">{s.overdueIds.length}</td>
                      <td className="py-1">{own.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted" data-testid="portal-by-status">
            {STATUSES.map((s) => (
              <span key={s}>
                {status(s)}: {stats.byStatus[s]}
              </span>
            ))}
          </p>
        </section>
      )}

      <section
        aria-labelledby="portal-overdue"
        className="flex flex-col gap-3"
        data-testid="portal-overdue"
      >
        <h2 id="portal-overdue" className={H2}>
          {t("overdueList")}
        </h2>
        {overdue.length === 0 ? (
          <p>{t("noOverdue")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {overdue
              .filter((r) => isOpen(r.ticket.status))
              .map((r) => (
                <TicketRow
                  key={r.ticket.id}
                  ticket={r.ticket}
                  category={r.category.name}
                  requester={r.requester}
                  parish={r.parish}
                  sla={r.sla}
                  now={env.now}
                  href={`/egyhazmegye/kerelmek/${r.ticket.id}`}
                />
              ))}
          </ul>
        )}
      </section>

      <ScopePanel env={env} />
    </div>
  );
}
