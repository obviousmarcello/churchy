import { Alert, ButtonLink } from "@churchy/ui";
import { slaStatus, ticketStats, type TicketStatus } from "@churchy/hr";
import { can } from "@churchy/policy";
import { TicketRow } from "@/components/hr/badges";
import { getT } from "@/i18n/server";
import {
  accessOf,
  approvalRoute,
  categoryOf,
  chainOf,
  getHrEnv,
  mayView,
  personLabel,
} from "@/server/hr";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.hr.list"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

const STATUS_FILTERS: readonly TicketStatus[] = [
  "uj",
  "folyamatban",
  "jovahagyasra_var",
  "jovahagyva",
  "elutasitva",
  "lezart",
];

/** *HR-ügyintézés* (D-71 … D-74): my requests, approvals waiting for me, the handler inbox. */
export default async function HrPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [env, t, common, query] = await Promise.all([
    getHrEnv(),
    getT("munkater.hr.list"),
    getT("munkater.hr.status"),
    searchParams,
  ]);
  const filter = STATUS_FILTERS.find((s) => s === query["allapot"]);
  const tickets = await env.repos.hr.listTickets(env.ctx);
  const rows = await Promise.all(
    tickets.flatMap((ticket) => {
      const category = categoryOf(env, ticket);
      if (category === undefined) return [];
      const access = accessOf(env, ticket, category);
      if (!mayView(access)) return [];
      return [
        (async () => {
          const approvals =
            ticket.status === "jovahagyasra_var"
              ? await env.repos.hr.listApprovals(env.ctx, ticket.id)
              : [];
          const waiting = chainOf(env, ticket, category, approvals).progress;
          const route =
            waiting.state === "waiting" ? approvalRoute(env, waiting.step, access) : null;
          return {
            ticket,
            category,
            access,
            approve: route !== null && ticket.status === "jovahagyasra_var",
          };
        })(),
      ];
    }),
  );
  const sla = (ticket: (typeof tickets)[number], hours: number | null) =>
    slaStatus(
      { createdAt: ticket.createdAt, slaHours: hours, closedAt: ticket.closedAt },
      env.now,
      env.calendar,
    );
  const render = (items: typeof rows) => (
    <ul className="flex flex-col gap-3">
      {items.map(({ ticket, category }) => (
        <TicketRow
          key={ticket.id}
          ticket={ticket}
          category={category.name}
          requester={ticket.anonymous ? "" : personLabel(env, ticket.requesterPersonId)}
          sla={sla(ticket, category.slaHours)}
          now={env.now}
        />
      ))}
    </ul>
  );

  const approvals = rows.filter((r) => r.approve);
  const inbox = rows.filter(
    (r) =>
      r.access.handle && !r.access.mine && (filter === undefined || r.ticket.status === filter),
  );
  const mine = rows.filter((r) => r.access.mine);
  const canSubmit = env.categories.some(
    (c) =>
      c.active &&
      env.me !== null &&
      can(env.actor, "hr.ticket.create", {
        tenantId: env.tenantId,
        category: {
          id: c.id,
          key: c.key,
          confidential: c.confidential,
          whoCanSubmit: c.whoCanSubmit,
        },
      }),
  );
  const showDashboard = can(env.actor, "hr.report.view", { tenantId: env.tenantId });
  const openNonConfidential = tickets.filter((x) => !x.confidential);
  const stats = showDashboard
    ? ticketStats(
        openNonConfidential.map((x) => ({
          id: x.id,
          categoryId: x.categoryId,
          status: x.status,
          createdAt: x.createdAt,
          closedAt: x.closedAt,
          slaHours: categoryOf(env, x)?.slaHours ?? null,
        })),
        env.now,
        env.calendar,
      )
    : null;
  const anonymousRef = typeof query["nevtelen"] === "string" ? query["nevtelen"] : null;
  const anonymousCode = typeof query["kod"] === "string" ? query["kod"] : null;

  return (
    <div className="flex flex-col gap-6" data-testid="hr-home">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
            {t("title")}
          </h1>
          <p className="mt-1 text-fs-4 text-muted">{t("lead")}</p>
        </div>
        {canSubmit ? (
          <ButtonLink href="/munkater/hr/uj" data-testid="hr-new">
            {t("newRequest")}
          </ButtonLink>
        ) : null}
      </header>

      {anonymousRef !== null && anonymousCode !== null ? (
        <div data-testid="anonymous-code">
          <Alert tone="success" title={t("anonymousSent")}>
            <p>{t("anonymousBody", { reference: anonymousRef, code: anonymousCode })}</p>
          </Alert>
        </div>
      ) : null}

      {stats !== null ? (
        <section
          aria-labelledby="hr-dashboard"
          className="flex flex-col gap-3"
          data-testid="hr-dashboard"
        >
          <h2 id="hr-dashboard" className="font-heading text-fs-5 font-bold text-primary">
            {t("dashboard")}
          </h2>
          <p className="text-muted">
            {t("dashboardSummary", {
              open: stats.open,
              overdue: stats.overdueIds.length,
              median:
                stats.medianResolutionMinutes === null
                  ? "–"
                  : Math.round(stats.medianResolutionMinutes / 60),
            })}
          </p>
          <div
            className="relative overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label={t("dashboard")}
          >
            <table className="w-full min-w-96 text-left">
              <caption className="sr-only">{t("dashboard")}</caption>
              <thead>
                <tr>
                  <th scope="col" className="py-1 pr-3">
                    {t("colCategory")}
                  </th>
                  <th scope="col" className="py-1 pr-3">
                    {t("colOpen")}
                  </th>
                  <th scope="col" className="py-1 pr-3">
                    {t("colOverdue")}
                  </th>
                  <th scope="col" className="py-1">
                    {t("colMedian")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.byCategory.map((c) => (
                  <tr key={c.categoryId} className="border-t border-border">
                    <th scope="row" className="py-1 pr-3 font-normal">
                      {env.categories.find((x) => x.id === c.categoryId)?.name}
                    </th>
                    <td className="py-1 pr-3">{c.open}</td>
                    <td className="py-1 pr-3">{c.overdue}</td>
                    <td className="py-1">
                      {c.medianResolutionMinutes === null
                        ? "–"
                        : t("hours", { count: Math.round(c.medianResolutionMinutes / 60) })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="flex flex-wrap gap-2 text-muted">
            {STATUS_FILTERS.map((s) => (
              <span key={s}>
                {common(s)}: {stats.byStatus[s]}
              </span>
            ))}
          </p>
        </section>
      ) : null}

      {approvals.length > 0 ? (
        <section
          aria-labelledby="hr-approvals"
          className="flex flex-col gap-3"
          data-testid="hr-approvals"
        >
          <h2 id="hr-approvals" className="font-heading text-fs-5 font-bold text-primary">
            {t("approvals")}
          </h2>
          {render(approvals)}
        </section>
      ) : null}

      {rows.some((r) => r.access.handle && !r.access.mine) ? (
        <section aria-labelledby="hr-inbox" className="flex flex-col gap-3" data-testid="hr-inbox">
          <h2 id="hr-inbox" className="font-heading text-fs-5 font-bold text-primary">
            {t("inbox")}
          </h2>
          <nav aria-label={t("filter")} className="flex flex-wrap gap-2">
            {[undefined, ...STATUS_FILTERS].map((s) => (
              <a
                key={s ?? "all"}
                href={s === undefined ? "/munkater/hr" : `/munkater/hr?allapot=${s}`}
                aria-current={filter === s ? "page" : undefined}
                className="inline-flex min-h-11 items-center rounded-control border border-hairline px-3 aria-[current=page]:bg-primary aria-[current=page]:text-primary-contrast"
              >
                {s === undefined ? t("all") : common(s)}
              </a>
            ))}
          </nav>
          {inbox.length === 0 ? <p>{t("emptyFiltered")}</p> : render(inbox)}
        </section>
      ) : null}

      <section aria-labelledby="hr-mine" className="flex flex-col gap-3" data-testid="hr-mine">
        <h2 id="hr-mine" className="font-heading text-fs-5 font-bold text-primary">
          {t("mine")}
        </h2>
        {mine.length === 0 ? <p>{t("emptyMine")}</p> : render(mine)}
      </section>
    </div>
  );
}
