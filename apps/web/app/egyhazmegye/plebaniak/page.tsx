import { notFound } from "next/navigation";
import { Alert, Badge, type BadgeTone } from "@churchy/ui";
import type { OrgLink } from "@churchy/contracts";
import { can } from "@churchy/policy";
import { StepButton } from "@/components/hr/ticket-controls";
import { getT } from "@/i18n/server";
import { getOrgHrEnv } from "@/server/org-hr";
import { approveParishLink, requestParishLink, revokeParishLink } from "@/server/org-link-actions";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.orgLinks")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

const TONE: Record<OrgLink["status"] | "none", BadgeTone> = {
  active: "success",
  requested: "warning",
  revoked: "neutral",
  none: "neutral",
};

/**
 * *Plébániák* (D-84): link status and delegated HR categories per parish. Linking needs the
 * approval of both sides; the diocese can invite a parish, approve a parish's request and end a
 * link at any time. What a parish delegates is the parish's own decision (shown here, changed in
 * the parish's admin), so non-delegated categories are neither listed nor counted.
 */
export default async function PortalParishesPage() {
  const env = await getOrgHrEnv();
  if (env === null) notFound();
  const mayManage = can(env.actor, "org.links.manage", { orgId: env.orgId });
  if (!mayManage) notFound();
  const [t, links] = await Promise.all([
    getT("portal.parishes"),
    env.repos.organizations.listLinks(env.ctx),
  ]);
  const current = (tenantId: string): OrgLink | undefined => {
    const own = links.filter((l) => l.tenantId === tenantId);
    return own.findLast((l) => l.status !== "revoked") ?? own.at(-1);
  };

  return (
    <div className="flex flex-col gap-6" data-testid="portal-parishes">
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {t("title")}
        </h1>
        <p className="mt-1 max-w-prose text-fs-4 text-muted">{t("lead")}</p>
      </header>
      <Alert tone="info" title={t("rulesTitle")}>
        <p>{t("rulesBody")}</p>
      </Alert>
      <ul className="flex flex-col gap-3">
        {env.parishes.map((p) => {
          const link = current(p.tenantId);
          const state = link?.status ?? "none";
          const delegated = [...env.categories.values()].filter((c) => c.tenantId === p.tenantId);
          const waitsForParish = state === "requested" && link?.approvedByParish === null;
          const waitsForOrg = state === "requested" && link?.approvedByOrg === null;
          return (
            <li
              key={p.tenantId}
              className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4"
              data-testid="parish-row"
              data-parish={p.tenantId}
              data-link={state}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-fs-4 font-bold text-primary">{p.name}</h2>
                <Badge tone={TONE[state]} data-testid="link-status">
                  {t(`status.${state}`)}
                </Badge>
                {waitsForParish ? <span className="text-muted">{t("waitsForParish")}</span> : null}
                {waitsForOrg ? <span className="text-muted">{t("waitsForOrg")}</span> : null}
              </div>
              {state === "active" ? (
                <div data-testid="delegated">
                  <p className="font-bold">{t("delegated")}</p>
                  {delegated.length === 0 ? (
                    <p className="text-muted">{t("delegatedNone")}</p>
                  ) : (
                    <ul className="list-inside list-disc">
                      {delegated.map((c) => (
                        <li key={c.id}>{c.name}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-muted">{t("delegatedNote")}</p>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {state === "none" || state === "revoked" ? (
                  <StepButton run={requestParishLink.bind(null, p.tenantId)} testId="link-request">
                    {t("request")}
                  </StepButton>
                ) : null}
                {link !== undefined && waitsForOrg ? (
                  <StepButton run={approveParishLink.bind(null, link.id)} testId="link-approve">
                    {t("approve")}
                  </StepButton>
                ) : null}
                {link !== undefined && (state === "active" || state === "requested") ? (
                  <StepButton
                    run={revokeParishLink.bind(null, link.id)}
                    testId="link-revoke"
                    variant="secondary"
                  >
                    {state === "active" ? t("revoke") : t("withdraw")}
                  </StepButton>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
