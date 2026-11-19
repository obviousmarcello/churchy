import Link from "next/link";
import { ButtonLink, FormattedDate } from "@churchy/ui";
import { buildWorkdayCalendar, leaveBalance, dayKind } from "@churchy/hr";
import { addDays, startOfIsoWeek } from "@churchy/hu";
import { can } from "@churchy/policy";
import { getT } from "@/i18n/server";
import { conflictingSlots } from "@/lib/hr/conflicts";
import { loadCalendarSources } from "@/server/workspace";
import { getHrEnv, personLabel } from "@/server/hr";
import { requireWorkspaceModule } from "@/server/workspace-nav";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.absence"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

const DAYS = 28;

/**
 * *Távollétek* (D-73): who is away (*Távol* for everybody, the type only for handlers of the
 * category), my leave balance, assignment conflicts for team leaders and the balances of all
 * staff for HR.
 */
export default async function AbsencePage() {
  await requireWorkspaceModule("ws.hr.leave");
  const [env, t] = await Promise.all([getHrEnv(), getT("munkater.absence")]);
  const { repos, ctx, actor, tenantId, today } = env;
  const year = Number(today.slice(0, 4));
  const from = startOfIsoWeek(today);
  const to = addDays(from, DAYS - 1);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(from, i));
  const sources = await loadCalendarSources(env, from, to, ["absences"]);
  const rows = [...new Set(sources.absences.map((a) => a.person))].map((person) => ({
    person,
    items: sources.absences.filter((a) => a.person === person),
  }));
  const holidays = buildWorkdayCalendar(
    (
      await Promise.all([year, year + 1].map((y) => repos.absences.listWorkdayCalendar(ctx, y)))
    ).flat(),
  );

  const me = env.me?.personId ?? null;
  const mayOwn = me !== null && can(actor, "hr.leaveBalance.view", { tenantId, personId: me });
  const [entitlement, mine] = mayOwn
    ? await Promise.all([
        repos.absences.getEntitlement(ctx, me, year),
        repos.absences.list(ctx, { from: `${year}-01-01`, to: `${year}-12-31`, personIds: [me] }),
      ])
    : [null, []];
  const balance = mayOwn ? leaveBalance(year, entitlement, mine) : null;

  // HR: balances of everybody who has an entitlement.
  const mayAll = can(actor, "hr.report.view", { tenantId });
  const balances = mayAll
    ? await Promise.all(
        [...env.profiles.keys()].map(async (personId) => {
          const [e, list] = await Promise.all([
            repos.absences.getEntitlement(ctx, personId, year),
            repos.absences.list(ctx, {
              from: `${year}-01-01`,
              to: `${year}-12-31`,
              personIds: [personId],
            }),
          ]);
          return e === null ? null : { personId, balance: leaveBalance(year, e, list) };
        }),
      )
    : [];

  // Conflicts: accepted/requested assignments of people who are away, for the teams I manage.
  const [absences, teams] = await Promise.all([
    repos.absences.list(ctx, { from: today, to, statuses: ["approved", "requested"] }),
    repos.teams.list(ctx),
  ]);
  const slots = await repos.assignments.list(ctx, {
    from: `${today}T00:00:00Z`,
    to: `${addDays(to, 1)}T00:00:00Z`,
    statuses: ["requested", "accepted"],
  });
  const conflicts = conflictingSlots(slots, absences).filter((s) =>
    can(actor, "assignment.manage", { tenantId, teamId: s.teamId }),
  );
  const canRequest = env.categories.some(
    (c) =>
      c.active &&
      c.createsAbsence &&
      can(actor, "hr.ticket.create", {
        tenantId,
        category: {
          id: c.id,
          key: c.key,
          confidential: c.confidential,
          whoCanSubmit: c.whoCanSubmit,
        },
      }),
  );

  return (
    <div className="flex flex-col gap-6" data-testid="absence-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
            {t("title")}
          </h1>
          <p className="mt-1 text-fs-4 text-muted">{t("lead")}</p>
        </div>
        {canRequest ? (
          <ButtonLink href="/munkater/hr/uj?tipus=tavollet" data-testid="absence-new">
            {t("request")}
          </ButtonLink>
        ) : null}
      </header>

      {balance !== null ? (
        <section
          aria-labelledby="a-balance"
          className="flex flex-col gap-2"
          data-testid="leave-balance"
        >
          <h2 id="a-balance" className="font-heading text-fs-5 font-bold text-primary">
            {t("balanceTitle", { year })}
          </h2>
          <p>
            {t("balanceLine", {
              entitlement: balance.entitlement,
              carried: balance.carriedOver,
              adjustments: balance.adjustments,
              used: balance.used,
            })}
          </p>
          <p className="font-bold" data-testid="leave-remaining">
            {t("balanceRemaining", { count: balance.remaining })}
          </p>
          {balance.planned > 0 ? (
            <p className="text-muted">{t("balancePlanned", { count: balance.planned })}</p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="a-grid" className="flex flex-col gap-2" data-testid="absence-grid">
        <h2 id="a-grid" className="font-heading text-fs-5 font-bold text-primary">
          {t("gridTitle")}
        </h2>
        {rows.length === 0 ? (
          <p>{t("none")}</p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("gridTitle")}>
            <table className="min-w-full border-collapse text-fs-2">
              <caption className="sr-only">{t("gridTitle")}</caption>
              <thead>
                <tr>
                  <th scope="col" className="py-1 pr-3 text-left">
                    {t("person")}
                  </th>
                  {days.map((d) => (
                    <th key={d} scope="col" className="px-0.5 py-1 text-center font-normal">
                      <span className="sr-only">
                        <FormattedDate format="short" value={d} />
                      </span>
                      <span aria-hidden="true">{Number(d.slice(8))}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.person} className="border-t border-border" data-testid="absence-row">
                    <th scope="row" className="py-1 pr-3 text-left font-normal">
                      {row.person || t("someone")}
                    </th>
                    {days.map((d) => {
                      const away = row.items.find((a) => a.startDate <= d && a.endDate >= d);
                      const off = dayKind(d, [1, 2, 3, 4, 5], holidays) === "holiday";
                      return (
                        <td
                          key={d}
                          className={`min-w-6 px-0.5 py-1 text-center ${away ? "bg-warning-soft font-bold text-warning" : off ? "bg-surface-sunken" : ""}`}
                        >
                          {away ? (
                            <span className="sr-only">{away.detail ?? t("away")}</span>
                          ) : null}
                          {away ? <span aria-hidden="true">{t("awayShort")}</span> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-muted">{t("legend")}</p>
      </section>

      {conflicts.length > 0 ? (
        <section
          aria-labelledby="a-conflicts"
          className="flex flex-col gap-2"
          data-testid="absence-conflicts"
        >
          <h2 id="a-conflicts" className="font-heading text-fs-5 font-bold text-primary">
            {t("conflictsTitle")}
          </h2>
          <ul className="flex flex-col gap-2">
            {conflicts.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3"
                data-testid="conflict"
              >
                <span>
                  {personLabel(env, c.personId)} · {teams.find((x) => x.id === c.teamId)?.name} ·{" "}
                  <FormattedDate format="short" value={c.startsAt} />
                </span>
                <Link
                  href={`/munkater/tavollet/helyettes/${c.id}`}
                  className="inline-flex min-h-11 items-center font-semibold text-primary"
                >
                  {t("findSubstitute")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mayAll && balances.length > 0 ? (
        <section aria-labelledby="a-all" className="flex flex-col gap-2" data-testid="all-balances">
          <h2 id="a-all" className="font-heading text-fs-5 font-bold text-primary">
            {t("allBalances", { year })}
          </h2>
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label={t("allBalances", { year })}
          >
            <table className="w-full min-w-96 text-left">
              <caption className="sr-only">{t("allBalances", { year })}</caption>
              <thead>
                <tr>
                  <th scope="col" className="py-1 pr-3">
                    {t("person")}
                  </th>
                  <th scope="col" className="py-1 pr-3">
                    {t("colTotal")}
                  </th>
                  <th scope="col" className="py-1 pr-3">
                    {t("colUsed")}
                  </th>
                  <th scope="col" className="py-1">
                    {t("colRemaining")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {balances.flatMap((b) =>
                  b === null
                    ? []
                    : [
                        <tr key={b.personId} className="border-t border-border">
                          <th scope="row" className="py-1 pr-3 font-normal">
                            {personLabel(env, b.personId)}
                          </th>
                          <td className="py-1 pr-3">{b.balance.total}</td>
                          <td className="py-1 pr-3">{b.balance.used}</td>
                          <td className="py-1">{b.balance.remaining}</td>
                        </tr>,
                      ],
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
