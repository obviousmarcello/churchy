import { AdminPage } from "@/components/admin";
import { EntityForm } from "@/components/admin/content/entity-form";
import { getT } from "@/i18n/server";
import { createEvent } from "@/server/content-actions";
import { adminData, mayOpen } from "@/server/content-admin";
import { eventFields, eventValues } from "@/server/content-fields";

export async function generateMetadata() {
  const [flow, common] = await Promise.all([getT("admin.flows"), getT("common")]);
  return {
    title: `${flow("eventNew")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** New event (D-21): saved as a draft; publishing is on the edit screen. */
export default async function Page() {
  const [nav, flow, form] = await Promise.all([
    getT("common.nav"),
    getT("admin.flows"),
    getT("admin.content.form"),
  ]);
  const label = nav("sections.events");
  if (!(await mayOpen("events"))) return <AdminPage title={flow("eventNew")} section="events" />;
  const { ctx, repos } = await adminData();
  return (
    <AdminPage
      title={flow("eventNew")}
      section="events"
      breadcrumbs={[{ label, href: "/admin/esemenyek" }, { label: flow("eventNew") }]}
    >
      <EntityForm
        action={createEvent}
        fields={await eventFields(ctx, repos)}
        values={await eventValues(ctx, repos)}
        submitLabel={form("create")}
        cancelHref="/admin/esemenyek"
        testId="event-form"
      />
    </AdminPage>
  );
}
