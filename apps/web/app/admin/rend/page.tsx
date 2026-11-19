import { notFound } from "next/navigation";
import { ScheduleEditor } from "@/components/schedule/schedule-editor";
import { getT } from "@/i18n/server";
import { canOpenAdminSection } from "@/server/admin";
import { loadScheduleAdmin } from "@/server/schedule-admin";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.schedule")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** *Heti rend* (D-22): the weekly grid per location and period with the 8-week preview. */
export default async function Page() {
  // The layout shows the no-access notice; nothing is loaded for an actor who may not open it.
  if (!(await canOpenAdminSection("schedule"))) return null;
  const [admin, t] = await Promise.all([loadScheduleAdmin(), getT("admin.schedule.editor")]);
  if (admin === null) notFound();
  return (
    <section aria-labelledby="weekly-heading" className="grid gap-6">
      <div>
        <h2 id="weekly-heading" className="font-heading text-fs-5 font-semibold">
          {t("title")}
        </h2>
        <p className="mt-1 max-w-prose text-muted">{t("lead")}</p>
      </div>
      <ScheduleEditor {...admin} />
    </section>
  );
}
