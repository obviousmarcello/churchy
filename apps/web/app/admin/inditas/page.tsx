import { AdminPage } from "@/components/admin";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.setup"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** *Első beállítás* (D-34): the setup wizard inside the admin shell, for owners and admins. */
export default async function SetupPage() {
  const t = await getT("admin.setup");
  return (
    <AdminPage
      title={t("title")}
      lead={t("lead")}
      section="setup"
      breadcrumbs={[{ label: t("title") }]}
      testId="admin-setup"
    >
      <SetupWizard />
    </AdminPage>
  );
}
