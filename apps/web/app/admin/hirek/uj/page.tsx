import { AdminPage } from "@/components/admin";
import { EntityForm } from "@/components/admin/content/entity-form";
import { getT } from "@/i18n/server";
import { createNews } from "@/server/content-actions";
import { mayOpen } from "@/server/content-admin";
import { newsFields, newsValues } from "@/server/content-fields";

export async function generateMetadata() {
  const [flow, common] = await Promise.all([getT("admin.flows"), getT("common")]);
  return {
    title: `${flow("newsNew")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** New news post (D-21): saved as a draft; publishing is on the edit screen. */
export default async function Page() {
  const [nav, flow, form] = await Promise.all([
    getT("common.nav"),
    getT("admin.flows"),
    getT("admin.content.form"),
  ]);
  const label = nav("sections.news");
  if (!(await mayOpen("news"))) return <AdminPage title={flow("newsNew")} section="news" />;
  return (
    <AdminPage
      title={flow("newsNew")}
      section="news"
      breadcrumbs={[{ label, href: "/admin/hirek" }, { label: flow("newsNew") }]}
    >
      <EntityForm
        action={createNews}
        fields={await newsFields()}
        values={newsValues()}
        submitLabel={form("create")}
        cancelHref="/admin/hirek"
        testId="news-form"
      />
    </AdminPage>
  );
}
