import { AdminPage } from "@/components/admin";
import { EntityForm } from "@/components/admin/content/entity-form";
import { getT } from "@/i18n/server";
import { createStaff } from "@/server/content-actions";
import { mayOpen } from "@/server/content-admin";
import { staffFields, staffValues } from "@/server/content-fields";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.staff"), getT("common")]);
  return {
    title: `${t("newTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** New person for the staff page (D-21). Demo data only: never real personal data. */
export default async function Page() {
  const [nav, t, form] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.staff"),
    getT("admin.content.form"),
  ]);
  const label = nav("sections.staff");
  if (!(await mayOpen("staff"))) return <AdminPage title={t("newTitle")} section="staff" />;
  return (
    <AdminPage
      title={t("newTitle")}
      section="staff"
      breadcrumbs={[{ label, href: "/admin/munkatarsak" }, { label: t("newTitle") }]}
    >
      <EntityForm
        action={createStaff}
        fields={await staffFields()}
        values={staffValues()}
        submitLabel={form("create")}
        cancelHref="/admin/munkatarsak"
        testId="staff-form"
      />
    </AdminPage>
  );
}
