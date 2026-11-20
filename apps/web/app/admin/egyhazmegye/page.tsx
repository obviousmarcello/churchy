import { Alert, Badge, FormattedDate, FormattedTime, type BadgeTone } from "@churchy/ui";
import type { OrgLink } from "@churchy/contracts";
import { AdminPage } from "@/components/admin";
import { StepButton } from "@/components/hr/ticket-controls";
import { DelegationForm } from "@/components/portal/delegation-form";
import { getT } from "@/i18n/server";
import { approveOrgLink, revokeOrgLink, saveOrgDelegations } from "@/server/org-link-actions";
import { orgAccessOf } from "@/server/org-audit";
import { adminData, mayOpen } from "@/server/content-admin";
import { getRequestContext } from "@/server/session";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.orgLink")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

const TONE: Record<OrgLink["status"], BadgeTone> = {
  active: "success",
  requested: "warning",
  revoked: "neutral",
};

const H2 = "font-heading text-fs-5 font-bold text-primary";

/**
 * *Egyházmegyei kapcsolat* (D-84): the parish owner's side of the diocesan link. Approve a link
 * request and choose which HR categories are delegated (default: none of the confidential ones),
 * change the choice later, or end the link — access ends at once. Every diocesan read and action
 * is listed below with the ticket reference only (D-85).
 */
export default async function Page() {
  const [nav, t, kind] = await Promise.all([
    getT("common.nav"),
    getT("admin.orgLink"),
    getT("admin.orgLink.kind"),
  ]);
  const title = nav("sections.orgLink");
  if (!(await mayOpen("orgLink"))) return <AdminPage title={title} section="orgLink" />;

  const { ctx, repos } = await adminData();
  const { tenantId } = await getRequestContext();
  const [links, categories, delegations, access] = await Promise.all([
    repos.organizations.listLinks(ctx),
    repos.hr.listCategories(ctx),
    repos.organizations.listDelegations(ctx),
    orgAccessOf(tenantId ?? ""),
  ]);
  const options = categories
    .filter((c) => c.active)
    .map((c) => ({ key: c.key, name: c.name, confidential: c.confidential }));
  const live = links.filter((l) => l.status !== "revoked");

  return (
    <AdminPage
      title={title}
      lead={t("lead")}
      section="orgLink"
      breadcrumbs={[{ label: title }]}
      testId="admin-org-link"
    >
      {live.length === 0 ? (
        <Alert tone="info" title={t("noneTitle")}>
          <p>{t("noneBody")}</p>
        </Alert>
      ) : (
        <ul className="flex flex-col gap-4">
          {live.map((link) => {
            const delegated = delegations
              .filter((d) => d.orgId === link.orgId)
              .map((d) => d.hrCategoryKey);
            const needsMe = link.status === "requested" && link.approvedByParish === null;
            return (
              <li
                key={link.id}
                className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4"
                data-testid="org-link"
                data-status={link.status}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-fs-4 font-bold text-primary">{t("diocese")}</h2>
                  <Badge tone={TONE[link.status]} data-testid="link-status">
                    {t(`status.${link.status}`)}
                  </Badge>
                  {link.status === "requested" && !needsMe ? (
                    <span className="text-muted">{t("waitsForOrg")}</span>
                  ) : null}
                </div>
                {needsMe ? <p>{t("approveLead")}</p> : null}
                {link.status === "active" ? <p>{t("activeLead")}</p> : null}
                {needsMe || link.status === "active" ? (
                  <DelegationForm
                    categories={options}
                    initial={
                      needsMe
                        ? delegated.filter(
                            (k) => !options.some((o) => o.key === k && o.confidential),
                          )
                        : delegated
                    }
                    submitLabel={needsMe ? t("approve") : t("save")}
                    testId={needsMe ? "approve-form" : "delegation-form"}
                    run={
                      needsMe
                        ? approveOrgLink.bind(null, link.id)
                        : saveOrgDelegations.bind(null, link.orgId)
                    }
                  />
                ) : null}
                <div>
                  <StepButton
                    run={revokeOrgLink.bind(null, link.id)}
                    testId="link-revoke"
                    variant="secondary"
                  >
                    {link.status === "active"
                      ? t("revoke")
                      : needsMe
                        ? t("decline")
                        : t("withdraw")}
                  </StepButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section
        aria-labelledby="org-access"
        className="flex flex-col gap-3"
        data-testid="org-access"
      >
        <h2 id="org-access" className={H2}>
          {t("accessTitle")}
        </h2>
        <p className="max-w-prose text-muted">{t("accessLead")}</p>
        {access.length === 0 ? (
          <p>{t("accessNone")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {access.slice(0, 20).map((a) => (
              <li key={a.id} data-testid="org-access-row">
                <FormattedDate format="short" value={a.at} /> <FormattedTime value={a.at} /> —{" "}
                {t("accessEntry", { kind: kind(a.kind), reference: a.reference })}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminPage>
  );
}
