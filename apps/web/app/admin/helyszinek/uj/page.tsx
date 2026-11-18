import { AdminPage } from "@/components/admin";
import { EntityForm } from "@/components/admin/content/entity-form";
import { getT } from "@/i18n/server";
import { createLocation } from "@/server/content-actions";
import { mayOpen } from "@/server/content-admin";
import { locationFields, locationValues } from "@/server/content-fields";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.locations"), getT("common")]);
  return {
    title: `${t("newTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** New location (D-21). */
export default async function Page() {
  const [nav, t, form] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.locations"),
    getT("admin.content.form"),
  ]);
  const label = nav("sections.locations");
  if (!(await mayOpen("locations"))) return <AdminPage title={t("newTitle")} section="locations" />;
  return (
    <AdminPage
      title={t("newTitle")}
      section="locations"
      breadcrumbs={[{ label, href: "/admin/helyszinek" }, { label: t("newTitle") }]}
    >
      <EntityForm
        action={createLocation}
        fields={await locationFields()}
        values={locationValues()}
        submitLabel={form("create")}
        cancelHref="/admin/helyszinek"
        testId="location-form"
      />
    </AdminPage>
  );
}
