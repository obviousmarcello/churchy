import { notFound } from "next/navigation";
import { Alert } from "@churchy/ui";
import { AdminPage } from "@/components/admin";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { EntityForm } from "@/components/admin/content/entity-form";
import { SavedNotice } from "@/components/admin/content/list-parts";
import { PublishSection } from "@/components/admin/content/publish-section";
import { getT } from "@/i18n/server";
import { deleteEvent, setEventStatus, updateEvent } from "@/server/content-actions";
import { adminData, canInChurch, mayOpen } from "@/server/content-admin";
import { eventFields, eventValues } from "@/server/content-fields";

type Params = Promise<{ id: string }>;

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.events"), getT("common")]);
  return {
    title: `${t("editTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Edit an event (D-21): draft, published or cancelled (events have no scheduled date). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [nav, t, form] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.events"),
    getT("admin.content.form"),
  ]);
  const label = nav("sections.events");
  if (!(await mayOpen("events"))) return <AdminPage title={label} section="events" />;

  const { ctx, repos } = await adminData();
  const event = await repos.events.get(ctx, id);
  if (event === null) notFound();

  return (
    <AdminPage
      title={event.title}
      section="events"
      breadcrumbs={[{ label, href: "/admin/esemenyek" }, { label: event.title }]}
      testId="admin-event-edit"
    >
      <SavedNotice saved={query["mentve"] === "1"} />
      <PublishSection
        state={event.status}
        scheduling={false}
        canPublish={await canInChurch("event.publish")}
        previewHref={`/admin/esemenyek/${id}/elonezet`}
        liveHref={`/esemenyek/${event.slug}`}
        onPublish={setEventStatus.bind(null, id, "published")}
        onUnpublish={setEventStatus.bind(null, id, "draft")}
        onCancel={setEventStatus.bind(null, id, "cancelled")}
      />
      {event.rrule !== null ? (
        <div className="max-w-2xl">
          <Alert tone="info" title={t("columns.when")}>
            <p>{t("recurring")}</p>
          </Alert>
        </div>
      ) : null}
      <EntityForm
        action={updateEvent.bind(null, id)}
        fields={await eventFields(ctx, repos)}
        values={await eventValues(ctx, repos, event)}
        submitLabel={form("save")}
        cancelHref="/admin/esemenyek"
        testId="event-form"
      />
      <div>
        <DeleteButton
          name={event.title}
          onDelete={deleteEvent.bind(null, id)}
          redirectTo="/admin/esemenyek"
          size="md"
        />
      </div>
    </AdminPage>
  );
}
