import Link from "next/link";
import { can } from "@churchy/policy";
import { Badge, ButtonLink, FormattedDate, FormattedTime, Stagger } from "@churchy/ui";
import { CreatePlanForm } from "@/components/worship/create-plan-form";
import { getEntryLabels } from "@/components/workspace/entry-labels";
import { getT } from "@/i18n/server";
import { getMemberEnv } from "@/server/workspace";
import { requireWorkspaceModule } from "@/server/workspace-nav";
import {
  canViewPlan,
  loadUpcomingServices,
  occurrenceDates,
  planViewResources,
} from "@/server/worship";
import { createPlanForService } from "@/server/worship-actions";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.worship"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

const TONE = {
  draft: "neutral",
  in_review: "warning",
  approved: "success",
  locked: "info",
} as const;

/** *Liturgia* (D-66): the upcoming services with their plans, plan creation, all visible plans. */
export default async function WorshipPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireWorkspaceModule("ws.worship");
  const [query, env, t, labels] = await Promise.all([
    searchParams,
    getMemberEnv(),
    getT("munkater.worship"),
    getEntryLabels(),
  ]);
  const { repos, ctx, actor, tenantId } = env;
  const status = typeof query["allapot"] === "string" ? query["allapot"] : "";
  const mayEdit = can(actor, "servicePlan.edit", { tenantId, teamId: null });

  const [upcoming, templates, plans, assignments] = await Promise.all([
    loadUpcomingServices(env),
    repos.servicePlans.listTemplates(ctx),
    repos.servicePlans.list(ctx),
    repos.assignments.list(ctx, {}),
  ]);
  const visible = plans.filter((p) =>
    canViewPlan(
      actor,
      planViewResources(
        tenantId,
        assignments.filter((a) =>
          p.occurrenceId ? a.occurrenceId === p.occurrenceId : a.eventId === p.eventId,
        ),
      ),
    ),
  );
  const dates = await occurrenceDates(env, visible);
  const shown = visible
    .filter((p) => status === "" || p.status === status)
    .sort((a, b) => (dates.get(b.id) ?? "").localeCompare(dates.get(a.id) ?? ""));
  const visibleIds = new Set(visible.map((p) => p.id));

  return (
    <div className="flex max-w-4xl flex-col gap-6" data-testid="worship-page">
      <header className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
            {t("title")}
          </h1>
          <p className="mt-1 text-fs-4 text-muted">{t("lead")}</p>
        </div>
        <ButtonLink href="/munkater/liturgia/sablonok" variant="secondary" className="ml-auto">
          {t("templates")}
        </ButtonLink>
      </header>

      <section aria-labelledby="up-h" className="flex flex-col gap-2">
        <h2 id="up-h" className="font-heading text-fs-5 font-bold">
          {t("upcoming")}
        </h2>
        <Stagger as="ul" className="flex flex-col gap-2" data-testid="upcoming-services">
          {upcoming.map((s) => {
            const plan = s.plan && visibleIds.has(s.plan.id) ? s.plan : null;
            const titled = s.title.charAt(0).toUpperCase() + s.title.slice(1);
            return (
              <li
                key={s.key}
                className="flex flex-col gap-2 rounded-card border border-hairline bg-surface-raised shadow-xs p-3"
                data-testid="upcoming-service"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    <FormattedDate value={s.startsAt} format="short" />{" "}
                    <FormattedTime value={s.startsAt} /> – {titled}
                  </span>
                  <span className="text-muted">{s.locationName}</span>
                  {plan ? (
                    <>
                      <Badge tone={TONE[plan.status]}>{labels.planStatus[plan.status]}</Badge>
                      <Link
                        href={`/munkater/liturgia/${plan.id}`}
                        className="ml-auto inline-flex min-h-11 items-center font-semibold text-primary"
                      >
                        {t("openPlan")}
                      </Link>
                    </>
                  ) : (
                    <Badge>{t("noPlan")}</Badge>
                  )}
                </div>
                {!s.plan && mayEdit ? (
                  <CreatePlanForm
                    service={{
                      locationId: s.locationId,
                      serviceType: s.serviceType,
                      startsAt: s.startsAt,
                      title: titled,
                    }}
                    templates={[...templates]
                      .sort(
                        (a, b) =>
                          Number(b.serviceType === s.serviceType) -
                          Number(a.serviceType === s.serviceType),
                      )
                      .map((x) => ({ id: x.id, name: x.name }))}
                    create={createPlanForService}
                  />
                ) : null}
              </li>
            );
          })}
        </Stagger>
      </section>

      <section aria-labelledby="all-h" className="flex flex-col gap-2">
        <h2 id="all-h" className="font-heading text-fs-5 font-bold">
          {t("allPlans")}
        </h2>
        <nav aria-label={t("filter")} className="flex flex-wrap gap-2">
          {(["", "draft", "in_review", "approved", "locked"] as const).map((s) => (
            <ButtonLink
              key={s}
              href={s === "" ? "/munkater/liturgia" : `/munkater/liturgia?allapot=${s}`}
              size="sm"
              variant={status === s ? "primary" : "secondary"}
              aria-current={status === s ? "true" : undefined}
            >
              {s === "" ? t("all") : labels.planStatus[s]}
            </ButtonLink>
          ))}
        </nav>
        {shown.length === 0 ? <p>{t("noPlans")}</p> : null}
        <ul className="flex flex-col divide-y divide-border" data-testid="plan-list">
          {shown.map((p) => (
            <li
              key={p.id}
              className="flex min-h-11 flex-wrap items-center gap-2 py-2"
              data-testid="plan-row"
            >
              <Link href={`/munkater/liturgia/${p.id}`} className="font-semibold text-primary">
                {p.title}
              </Link>
              {dates.get(p.id) ? <FormattedDate value={dates.get(p.id)!} format="short" /> : null}
              <Badge tone={TONE[p.status]}>{labels.planStatus[p.status]}</Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
