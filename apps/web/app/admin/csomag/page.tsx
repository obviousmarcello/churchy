import Link from "next/link";
import { formatHuf } from "@churchy/hu";
import type { Plan } from "@churchy/contracts";
import { Alert, Badge, ButtonLink, FormattedDate } from "@churchy/ui";
import { AdminPage } from "@/components/admin";
import { PlanChangeButton } from "@/components/admin/plan/plan-change-button";
import { getT } from "@/i18n/server";
import { type LimitStatus } from "@/lib/plans/entitlements";
import { websiteModuleRows, workspaceModuleId, workspaceModuleRows } from "@/lib/plans/modules";
import { canServer } from "@/lib/permissions/server";
import { effectiveConfig } from "@churchy/presets";
import { adminData, mayOpen } from "@/server/content-admin";
import { getPlanView, upgradeOver } from "@/server/plan-admin";
import { changePlanAction } from "@/server/plan-actions";
import { getRequestContext } from "@/server/session";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.plan")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

const gb = (n: number) =>
  new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 1 }).format(Math.round(n * 10) / 10);

/** Usage meter with the Hungarian warning from 90 % and the block at 100 % (D-87 AC2). */
function Meter({ label, status, text }: { label: string; status: LimitStatus; text: string }) {
  return (
    <div className="flex flex-col gap-1" data-testid="plan-limit" data-level={status.level}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{label}</span>
        <span className="text-muted">{text}</span>
      </div>
      <progress
        className="h-3 w-full accent-primary"
        value={status.percent}
        max={100}
        aria-label={label}
      />
    </div>
  );
}

/** *Csomag* (D-87): current plan, limits, module availability and the plan catalog. */
export default async function Page() {
  const [nav, t] = await Promise.all([getT("common.nav"), getT("admin.plan")]);
  const title = nav("sections.plan");
  if (!(await mayOpen("plan"))) return <AdminPage title={title} section="plan" />;
  const [view, { ctx, repos }, context] = await Promise.all([
    getPlanView(),
    adminData(),
    getRequestContext(),
  ]);
  const tenant = await repos.tenants.current(ctx);
  const config = tenant
    ? effectiveConfig({
        name: tenant.name,
        denomination: tenant.denomination,
        siteConfig: tenant.siteConfig,
      })
    : null;
  const { ent } = view;
  const mayChange =
    !ent.coveredByDeal &&
    (await canServer("site.domain.manage", { tenantId: context.tenantId ?? "" }));
  const websiteRows = websiteModuleRows(config?.modules ?? {}, ent);
  const wsRows = workspaceModuleRows(ent.wsTier, tenant?.siteConfig.workspaceModules, ent);
  const upgradeHint = (key: "storage" | "editors" | "workspace") => (
    <Link href="#plans" className="font-semibold text-primary underline">
      {t(`limits.upgrade.${key}`)}
    </Link>
  );

  const planCard = (plan: Plan) => {
    const isCurrent = plan.key === ent.websitePlanKey || plan.key === ent.workspacePlanKey;
    const e = plan.entitlements;
    const canPick = mayChange && !isCurrent && (plan.kind === "website" || ent.workspaceAllowed);
    return (
      <li
        key={plan.key}
        className="flex flex-col gap-3 rounded-md border-2 border-border-strong bg-surface-raised p-4"
        data-testid="plan-card"
        data-current={isCurrent}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-fs-5 font-bold">{plan.name}</h3>
          {isCurrent ? <Badge tone="success">{t("catalog.current")}</Badge> : null}
        </div>
        <p>
          <span className="text-fs-5 font-bold">{formatHuf(plan.priceMonthly)}</span>{" "}
          <span className="text-muted">{t("catalog.perMonth")}</span>
          <br />
          <span className="text-fs-2 text-muted">
            {t("catalog.perYear", { price: formatHuf(plan.priceYearly) })}
          </span>
        </p>
        <ul className="flex flex-col gap-1 text-fs-2">
          {plan.kind === "website" ? (
            <>
              <li>{t("catalog.storage", { gb: e.storageGb })}</li>
              <li>
                {e.maxEditors === null
                  ? t("catalog.editorsUnlimited")
                  : t("catalog.editors", { count: e.maxEditors })}
              </li>
              <li>{t("catalog.modules", { count: e.modules.length })}</li>
              <li>{e.customDomain ? t("catalog.domainYes") : t("catalog.domainNo")}</li>
              <li>{e.footerCredit ? t("catalog.creditYes") : t("catalog.creditNo")}</li>
            </>
          ) : (
            <>
              <li>{t("catalog.wsUsers", { count: e.maxWorkspaceUsers ?? 0 })}</li>
              <li>{t("catalog.wsModules", { count: e.wsModules.length })}</li>
            </>
          )}
        </ul>
        {canPick ? (
          <PlanChangeButton
            planName={plan.name}
            upgrade={upgradeOver(view, plan)}
            onChange={changePlanAction.bind(null, plan.key)}
          />
        ) : null}
        {plan.kind === "workspace" && !ent.workspaceAllowed ? (
          <p className="text-fs-2 text-muted">{t("catalog.workspaceNeedsPaid")}</p>
        ) : null}
      </li>
    );
  };

  return (
    <AdminPage
      title={title}
      lead={t("lead")}
      section="plan"
      breadcrumbs={[{ label: title }]}
      testId="admin-plan"
      actions={
        <ButtonLink href="/admin/szamlazas" variant="secondary">
          {t("toBilling")}
        </ButtonLink>
      }
    >
      <section
        aria-labelledby="current-h"
        className="flex flex-col gap-3"
        data-testid="plan-current"
      >
        <h2 id="current-h" className="font-heading text-fs-5 font-bold text-primary">
          {t("current.title")}
        </h2>
        <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-fs-2 text-muted">{t("current.website")}</dt>
            <dd className="text-fs-4 font-bold" data-testid="plan-website-name">
              {ent.websitePlanName}
            </dd>
          </div>
          <div>
            <dt className="text-fs-2 text-muted">{t("current.workspace")}</dt>
            <dd className="text-fs-4 font-bold" data-testid="plan-workspace-name">
              {ent.workspacePlanName ?? t("current.noWorkspace")}
            </dd>
          </div>
          {view.subscription ? (
            <div>
              <dt className="text-fs-2 text-muted">{t("current.renews")}</dt>
              <dd>
                <FormattedDate value={view.subscription.currentPeriodEnd} />
              </dd>
            </div>
          ) : null}
        </dl>
        {ent.coveredByDeal ? (
          <Alert tone="info" title={t("deal.title")}>
            <p>{t("deal.body")}</p>
          </Alert>
        ) : null}
      </section>

      <section aria-labelledby="limits-h" className="flex flex-col gap-4" data-testid="plan-limits">
        <h2 id="limits-h" className="font-heading text-fs-5 font-bold text-primary">
          {t("limits.title")}
        </h2>
        <Meter
          label={t("limits.storage")}
          status={view.storage}
          text={t("limits.storageUsed", { used: gb(view.storage.used), cap: gb(ent.storageGb) })}
        />
        {view.storage.level === "warning" || view.storage.level === "full" ? (
          <Alert
            tone={view.storage.level === "full" ? "danger" : "warning"}
            title={t(`limits.storageAlert.${view.storage.level}`)}
            action={upgradeHint("storage")}
          />
        ) : null}
        <Meter
          label={t("limits.editors")}
          status={view.editors}
          text={
            ent.maxEditors === null
              ? t("limits.editorsUnlimited", { used: view.editors.used })
              : t("limits.editorsUsed", { used: view.editors.used, cap: ent.maxEditors })
          }
        />
        {view.editors.level === "warning" || view.editors.level === "full" ? (
          <Alert
            tone={view.editors.level === "full" ? "danger" : "warning"}
            title={t(`limits.editorsAlert.${view.editors.level}`)}
            action={upgradeHint("editors")}
          />
        ) : null}
        {view.workspaceUsers.level === "disabled" ? (
          <p className="text-muted">{t("limits.noWorkspace")}</p>
        ) : (
          <>
            <Meter
              label={t("limits.workspaceUsers")}
              status={{
                used: view.workspaceUsers.used,
                cap: view.workspaceUsers.cap,
                level:
                  view.workspaceUsers.level === "full"
                    ? "full"
                    : view.workspaceUsers.level === "warning"
                      ? "warning"
                      : "ok",
                allowsMore: view.workspaceUsers.canInvite,
                percent: Math.min(
                  100,
                  Math.round((view.workspaceUsers.used / view.workspaceUsers.cap) * 100),
                ),
              }}
              text={t("limits.workspaceUsed", {
                used: view.workspaceUsers.used,
                cap: view.workspaceUsers.cap,
              })}
            />
            {view.workspaceUsers.level === "warning" || view.workspaceUsers.level === "full" ? (
              <Alert
                tone={view.workspaceUsers.level === "full" ? "danger" : "warning"}
                title={t(`limits.workspaceAlert.${view.workspaceUsers.level}`)}
                action={upgradeHint("workspace")}
              />
            ) : null}
          </>
        )}
        <ul className="flex flex-col gap-2" data-testid="plan-features">
          <li className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t("features.domain")}</span>
            {ent.customDomain ? (
              <Badge tone="success">{t("features.included")}</Badge>
            ) : (
              <>
                <Badge tone="warning">{t("features.notIncluded")}</Badge>
                <span className="text-fs-2 text-muted">{t("features.domainUpgrade")}</span>
              </>
            )}
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t("features.credit")}</span>
            <Badge tone={ent.footerCredit ? "neutral" : "success"}>
              {ent.footerCredit ? t("features.creditShown") : t("features.creditHidden")}
            </Badge>
          </li>
        </ul>
      </section>

      <section aria-labelledby="avail-h" className="flex flex-col gap-3" data-testid="plan-modules">
        <h2 id="avail-h" className="font-heading text-fs-5 font-bold text-primary">
          {t("modules.title")}
        </h2>
        <p className="text-muted">{t("modules.lead")}</p>
        <ul className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {websiteRows.map((r) => (
            <li
              key={r.key}
              className="flex flex-wrap items-center gap-2"
              data-entitled={r.entitled}
            >
              <span>{t(`modules.website.${r.key}`)}</span>
              <Badge tone={r.entitled ? "success" : "warning"}>
                {r.entitled ? t("modules.available") : t("modules.locked")}
              </Badge>
            </li>
          ))}
          {wsRows.map((r) => (
            <li
              key={r.key}
              className="flex flex-wrap items-center gap-2"
              data-entitled={r.entitled}
            >
              <span>{t(`modules.workspace.${workspaceModuleId(r.key)}`)}</span>
              <Badge tone={r.entitled ? "success" : "warning"}>
                {r.entitled ? t("modules.available") : t("modules.locked")}
              </Badge>
            </li>
          ))}
        </ul>
        <p>
          <Link href="/admin/modulok" className="font-semibold text-primary underline">
            {t("modules.toToggles")}
          </Link>
        </p>
      </section>

      <section aria-labelledby="plans" className="flex flex-col gap-3" data-testid="plan-catalog">
        <h2 id="plans" className="font-heading text-fs-5 font-bold text-primary">
          {t("catalog.title")}
        </h2>
        <p className="text-muted">{t("catalog.lead")}</p>
        {!mayChange && !ent.coveredByDeal ? (
          <Alert tone="info" title={t("catalog.ownerOnly")} />
        ) : null}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{view.plans.map(planCard)}</ul>
      </section>
    </AdminPage>
  );
}
