import { AdminPage } from "@/components/admin";
import { EntityForm } from "@/components/admin/content/entity-form";
import { getT } from "@/i18n/server";
import { mayOpen } from "@/server/content-admin";
import { blockFields, blockValues } from "@/server/room-admin";
import { createServiceBlock } from "@/server/room-admin-actions";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.rooms.blocks"), getT("common")]);
  return {
    title: `${t("newTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** New service → room block mapping (D-61). */
export default async function Page() {
  const [nav, t, form] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.rooms.blocks"),
    getT("admin.content.form"),
  ]);
  const label = nav("sections.adminRooms");
  if (!(await mayOpen("adminRooms")))
    return <AdminPage title={t("newTitle")} section="adminRooms" />;
  return (
    <AdminPage
      title={t("newTitle")}
      section="adminRooms"
      breadcrumbs={[{ label, href: "/admin/termek" }, { label: t("newTitle") }]}
    >
      <EntityForm
        action={createServiceBlock}
        fields={await blockFields()}
        values={blockValues()}
        submitLabel={form("create")}
        cancelHref="/admin/termek"
        testId="block-form"
      />
    </AdminPage>
  );
}
