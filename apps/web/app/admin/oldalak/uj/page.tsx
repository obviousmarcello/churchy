import { AdminPage } from "@/components/admin";
import { EntityForm } from "@/components/admin/content/entity-form";
import { getT } from "@/i18n/server";
import { createPage } from "@/server/content-actions";
import { adminData, mayOpen } from "@/server/content-admin";
import { pageFields, pageValues } from "@/server/content-fields";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.pages"), getT("common")]);
  return {
    title: `${t("newTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** New page (D-21): saved as a draft; publishing is on the edit screen. */
export default async function Page() {
  const [nav, t, form] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.pages"),
    getT("admin.content.form"),
  ]);
  const label = nav("sections.pages");
  if (!(await mayOpen("pages"))) return <AdminPage title={t("newTitle")} section="pages" />;
  const { ctx, repos } = await adminData();
  return (
    <AdminPage
      title={t("newTitle")}
      section="pages"
      breadcrumbs={[{ label, href: "/admin/oldalak" }, { label: t("newTitle") }]}
    >
      <EntityForm
        action={createPage}
        fields={await pageFields(await repos.pages.list(ctx))}
        values={pageValues()}
        submitLabel={form("create")}
        cancelHref="/admin/oldalak"
        testId="page-form"
      />
    </AdminPage>
  );
}
