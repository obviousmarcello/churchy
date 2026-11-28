import { addDays, todayInBudapest } from "@churchy/hu";
import { AdminPage } from "@/components/admin";
import { EntityForm } from "@/components/admin/content/entity-form";
import { getT } from "@/i18n/server";
import { comingSunday } from "@/lib/admin/warnings";
import { createAnnouncement } from "@/server/content-actions";
import { adminData, canInChurch, mayOpen } from "@/server/content-admin";
import { announcementFields, announcementValues } from "@/server/content-fields";

export async function generateMetadata() {
  const [flow, common] = await Promise.all([getT("admin.flows"), getT("common")]);
  return {
    title: `${flow("announcementNew")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/**
 * The weekly announcement in three steps (D-21 AC2): the week is preselected (the coming Sunday,
 * or the next one without an announcement), the text is typed, *Közzététel* publishes.
 */
export default async function Page() {
  const [nav, flow, t] = await Promise.all([
    getT("common.nav"),
    getT("admin.flows"),
    getT("admin.content.announcements"),
  ]);
  const label = nav("sections.announcements");
  if (!(await mayOpen("announcements"))) {
    return <AdminPage title={flow("announcementNew")} section="announcements" />;
  }
  const { ctx, repos, now } = await adminData();
  const taken = new Set(
    (await repos.announcements.list(ctx, { pageSize: 200 })).items.map((a) => a.weekSunday),
  );
  let sunday = comingSunday(todayInBudapest(now));
  while (taken.has(sunday)) sunday = addDays(sunday, 7);

  return (
    <AdminPage
      title={flow("announcementNew")}
      section="announcements"
      breadcrumbs={[{ label, href: "/admin/hirdetesek" }, { label: flow("announcementNew") }]}
      testId="announcement-flow"
    >
      <ol className="flex flex-wrap gap-x-6 gap-y-1 font-semibold text-muted">
        <li>{t("steps.week")}</li>
        <li>{t("steps.text")}</li>
        <li>{t("steps.publish")}</li>
      </ol>
      <EntityForm
        action={createAnnouncement}
        fields={await announcementFields()}
        values={announcementValues(undefined, sunday)}
        submitLabel={t("saveDraft")}
        intentButton={
          (await canInChurch("announcement.publish"))
            ? { value: "publish", label: t("publish") }
            : undefined
        }
        cancelHref="/admin/hirdetesek"
        testId="announcement-form"
      />
    </AdminPage>
  );
}
