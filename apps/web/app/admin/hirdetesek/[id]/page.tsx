import { notFound } from "next/navigation";
import { FormattedDate } from "@churchy/ui";
import { AdminPage } from "@/components/admin";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { EntityForm } from "@/components/admin/content/entity-form";
import { SavedNotice } from "@/components/admin/content/list-parts";
import { PublishSection } from "@/components/admin/content/publish-section";
import { getT } from "@/i18n/server";
import { publishState } from "@/lib/admin/content";
import { announcementsHref } from "@/lib/announcements/view";
import { termRoutePath } from "@/lib/term-routes";
import {
  deleteAnnouncement,
  publishAnnouncement,
  unpublishAnnouncement,
  updateAnnouncement,
} from "@/server/content-actions";
import { adminData, canInChurch, mayOpen } from "@/server/content-admin";
import { announcementFields, announcementValues } from "@/server/content-fields";

type Params = Promise<{ id: string }>;

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.announcements"), getT("common")]);
  return {
    title: `${t("editTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Edit a weekly announcement (D-21) with its publishing panel (D-20). */
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
    getT("admin.content.announcements"),
    getT("admin.content.form"),
  ]);
  const label = nav("sections.announcements");
  if (!(await mayOpen("announcements"))) {
    return <AdminPage title={label} section="announcements" />;
  }

  const { ctx, repos, now } = await adminData();
  const row = await repos.announcements.get(ctx, id);
  if (row === null) notFound();
  const state = publishState(row, now);
  const heading = t("editTitle");

  return (
    <AdminPage
      title={heading}
      lead={t("heading", { date: row.weekSunday })}
      section="announcements"
      breadcrumbs={[{ label, href: "/admin/hirdetesek" }, { label: heading }]}
      testId="admin-announcement-edit"
    >
      <p className="text-fs-4">
        <FormattedDate value={row.weekSunday} data-testid="announcement-week" />
      </p>
      <SavedNotice saved={query["mentve"] === "1"} />
      <PublishSection
        state={state}
        at={row.publishedAt}
        scheduling
        canPublish={await canInChurch("announcement.publish")}
        previewHref={`/admin/hirdetesek/${id}/elonezet`}
        liveHref={announcementsHref(termRoutePath(t, "announcementsSection"), {
          week: row.weekSunday,
        })}
        onPublish={publishAnnouncement.bind(null, id)}
        onUnpublish={unpublishAnnouncement.bind(null, id)}
      />
      <EntityForm
        action={updateAnnouncement.bind(null, id)}
        fields={await announcementFields()}
        values={announcementValues(row, row.weekSunday)}
        submitLabel={form("save")}
        cancelHref="/admin/hirdetesek"
        testId="announcement-form"
      />
      <div>
        <DeleteButton
          name={row.weekSunday}
          onDelete={deleteAnnouncement.bind(null, id)}
          redirectTo="/admin/hirdetesek"
          size="md"
        />
      </div>
    </AdminPage>
  );
}
