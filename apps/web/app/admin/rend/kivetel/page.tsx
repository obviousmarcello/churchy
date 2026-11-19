import { notFound } from "next/navigation";
import { ExceptionFlow } from "@/components/schedule/exception-flow";
import { getT } from "@/i18n/server";
import { canOpenAdminSection } from "@/server/admin";
import { loadScheduleAdmin } from "@/server/schedule-admin";

export async function generateMetadata() {
  const [flow, common] = await Promise.all([getT("admin.flows"), getT("common")]);
  return {
    title: `${flow("scheduleException")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** The exception flow (D-22 AC3), reached from the dashboard quick action. */
export default async function Page() {
  if (!(await canOpenAdminSection("schedule"))) return null;
  const [admin, t] = await Promise.all([loadScheduleAdmin(), getT("admin.schedule.exceptions")]);
  if (admin === null) notFound();
  return (
    <section aria-labelledby="exceptions-heading" className="grid gap-6">
      <div>
        <h2 id="exceptions-heading" className="font-heading text-fs-5 font-semibold">
          {t("title")}
        </h2>
        <p className="mt-1 max-w-prose text-muted">{t("lead")}</p>
      </div>
      <ExceptionFlow {...admin} />
    </section>
  );
}
