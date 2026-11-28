import { AdminPage } from "@/components/admin";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { SiteDraftSection } from "@/components/setup/site-draft-section";
import { getT } from "@/i18n/server";
import { getRequestContext } from "@/server/session";
import { ownerDraftsFor, siteBuilderMode } from "@/server/site-builder-run";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.setup"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** *Első beállítás* (D-34): the setup wizard inside the admin shell, for owners and admins. */
export default async function SetupPage() {
  const t = await getT("admin.setup");
  const { tenantId } = await getRequestContext();
  const drafts = tenantId === undefined ? [] : await ownerDraftsFor(siteBuilderMode(), tenantId);
  return (
    <AdminPage
      title={t("title")}
      lead={t("lead")}
      section="setup"
      breadcrumbs={[{ label: t("title") }]}
      testId="admin-setup"
    >
      <div className="grid gap-10">
        <SiteDraftSection drafts={drafts} />
        <SetupWizard />
      </div>
    </AdminPage>
  );
}
