import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin";
import { EntityForm } from "@/components/admin/content/entity-form";
import { getT } from "@/i18n/server";
import { adminData, mayOpen } from "@/server/content-admin";
import { blockFields, blockValues } from "@/server/room-admin";
import { updateServiceBlock } from "@/server/room-admin-actions";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.rooms.blocks"), getT("common")]);
  return {
    title: `${t("editTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Edit a service → room block mapping (D-61). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [nav, t, form] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.rooms.blocks"),
    getT("admin.content.form"),
  ]);
  const label = nav("sections.adminRooms");
  if (!(await mayOpen("adminRooms")))
    return <AdminPage title={t("editTitle")} section="adminRooms" />;
  const { ctx, repos } = await adminData();
  const block = (await repos.rooms.listServiceBlocks(ctx)).find((b) => b.id === id);
  if (!block) notFound();
  return (
    <AdminPage
      title={t("editTitle")}
      section="adminRooms"
      breadcrumbs={[{ label, href: "/admin/termek" }, { label: block.serviceType }]}
    >
      <EntityForm
        action={updateServiceBlock.bind(null, id)}
        fields={await blockFields()}
        values={blockValues(block)}
        submitLabel={form("save")}
        cancelHref="/admin/termek"
        testId="block-form"
      />
    </AdminPage>
  );
}
