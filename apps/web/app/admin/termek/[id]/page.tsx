import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { EntityForm } from "@/components/admin/content/entity-form";
import { SavedNotice } from "@/components/admin/content/list-parts";
import { getT } from "@/i18n/server";
import { adminData, mayOpen } from "@/server/content-admin";
import { roomFields, roomValues } from "@/server/room-admin";
import { deleteRoomAction, updateRoom } from "@/server/room-admin-actions";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.rooms"), getT("common")]);
  return {
    title: `${t("editTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Edit a room (D-60): catalog data, approval policy and booking rules. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [nav, t, form] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.rooms"),
    getT("admin.content.form"),
  ]);
  const label = nav("sections.adminRooms");
  if (!(await mayOpen("adminRooms"))) return <AdminPage title={label} section="adminRooms" />;
  const { ctx, repos } = await adminData();
  const room = await repos.rooms.get(ctx, id);
  if (room === null) notFound();
  return (
    <AdminPage
      title={room.name}
      section="adminRooms"
      breadcrumbs={[{ label, href: "/admin/termek" }, { label: room.name }]}
      testId="admin-room-edit"
    >
      <SavedNotice saved={query["mentve"] === "1"} />
      <EntityForm
        action={updateRoom.bind(null, id)}
        fields={await roomFields()}
        values={roomValues(room)}
        submitLabel={form("save")}
        cancelHref="/admin/termek"
        testId="room-form"
      />
      <p className="max-w-2xl text-muted">{t("deleteNote")}</p>
      <div>
        <DeleteButton
          name={room.name}
          onDelete={deleteRoomAction.bind(null, id)}
          redirectTo="/admin/termek"
          size="md"
        />
      </div>
    </AdminPage>
  );
}
