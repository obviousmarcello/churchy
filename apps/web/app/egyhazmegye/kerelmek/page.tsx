import { notFound } from "next/navigation";
import type { TicketStatus } from "@churchy/hr";
import { TicketRow } from "@/components/hr/badges";
import { ScopePanel } from "@/components/portal/scope-panel";
import { getT } from "@/i18n/server";
import { getOrgHrEnv, reachableParishes } from "@/server/org-hr";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("portal.requests"), getT("common")]);
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

const FILTER_LINK =
  "inline-flex min-h-11 items-center rounded-md border border-border px-3 aria-[current=page]:bg-primary aria-[current=page]:text-primary-contrast";

/**
 * *Kérések* (D-85): one inbox across the linked parishes with a parish and a status filter.
 * Delegated categories only, confidential tickets never; each row opens the ticket in the portal.
 */
export default async function PortalRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [env, t, status, query] = await Promise.all([
    getOrgHrEnv(),
    getT("portal.requests"),
    getT("munkater.hr.status"),
    searchParams,
  ]);
  if (env === null) notFound();
  const parishes = reachableParishes(env);
  const parish = parishes.find((p) => p.tenantId === query["plebania"]);
  const filter = STATUS_FILTERS.find((s) => s === query["allapot"]);
  const href = (p: string | undefined, s: TicketStatus | undefined): string => {
    const params = new URLSearchParams();
    if (p !== undefined) params.set("plebania", p);
    if (s !== undefined) params.set("allapot", s);
    const q = params.toString();
    return q === "" ? "/egyhazmegye/kerelmek" : `/egyhazmegye/kerelmek?${q}`;
  };
  const rows = env.rows.filter(
    (r) =>
      (parish === undefined || r.ticket.tenantId === parish.tenantId) &&
      (filter === undefined || r.ticket.status === filter),
  );

  return (
    <div className="flex flex-col gap-6" data-testid="portal-requests">
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {t("title")}
        </h1>
        <p className="mt-1 max-w-prose text-fs-4 text-muted">{t("lead")}</p>
      </header>

      <nav
        aria-label={t("filterParish")}
        className="flex flex-wrap gap-2"
        data-testid="filter-parish"
      >
        {[undefined, ...parishes].map((p) => (
          <a
            key={p?.tenantId ?? "all"}
            href={href(p?.tenantId, filter)}
            aria-current={parish?.tenantId === p?.tenantId ? "page" : undefined}
            className={FILTER_LINK}
          >
            {p === undefined ? t("allParishes") : p.name}
          </a>
        ))}
      </nav>
      <nav
        aria-label={t("filterStatus")}
        className="flex flex-wrap gap-2"
        data-testid="filter-status"
      >
        {[undefined, ...STATUS_FILTERS].map((s) => (
          <a
            key={s ?? "all"}
            href={href(parish?.tenantId, s)}
            aria-current={filter === s ? "page" : undefined}
            className={FILTER_LINK}
          >
            {s === undefined ? t("allStatuses") : status(s)}
          </a>
        ))}
      </nav>

      <section aria-label={t("title")} className="flex flex-col gap-3" data-testid="portal-inbox">
        <p className="text-muted" data-testid="portal-count">
          {t("count", { count: rows.length })}
        </p>
        {rows.length === 0 ? (
          <p>{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
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
