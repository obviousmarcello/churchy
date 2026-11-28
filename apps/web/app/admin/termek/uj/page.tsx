import { AdminPage } from "@/components/admin";
import { EntityForm } from "@/components/admin/content/entity-form";
import { getT } from "@/i18n/server";
import { adminData, mayOpen } from "@/server/content-admin";
import { roomFields, roomValues } from "@/server/room-admin";
import { createRoom } from "@/server/room-admin-actions";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.rooms"), getT("common")]);
  return {
    title: `${t("newTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** New room or resource (D-60). */
export default async function Page() {
  const [nav, t, form] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.rooms"),
    getT("admin.content.form"),
  ]);
  const label = nav("sections.adminRooms");
  if (!(await mayOpen("adminRooms")))
    return <AdminPage title={t("newTitle")} section="adminRooms" />;
  const { ctx, repos } = await adminData();
  const first = (await repos.locations.list(ctx))[0];
  return (
    <AdminPage
      title={t("newTitle")}
      section="adminRooms"
      breadcrumbs={[{ label, href: "/admin/termek" }, { label: t("newTitle") }]}
    >
      <EntityForm
        action={createRoom}
        fields={await roomFields()}
        values={roomValues(undefined, first?.id ?? "")}
        submitLabel={form("create")}
        cancelHref="/admin/termek"
        testId="room-form"
      />
    </AdminPage>
  );
}
