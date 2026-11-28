import type { ReactNode } from "react";
import { AdminPage } from "@/components/admin";
import { ScheduleNav } from "@/components/schedule/schedule-nav";
import { getT } from "@/i18n/server";

/**
 * Wrapper of the schedule screens (D-22) inside the admin shell (D-18): the standard admin page
 * (breadcrumb, title, no-access notice decided by `can()` for the schedule section) and the links
 * between the weekly rules and the exceptions. Mutations are guarded again by `withPolicy()` in
 * `actions.ts`.
 */
export default async function ScheduleLayout({ children }: { children: ReactNode }) {
  const [nav, lead] = await Promise.all([getT("common.nav"), getT("admin.sections.schedule")]);
  const title = nav("sections.schedule");
  return (
    <AdminPage
      title={title}
      lead={lead("lead")}
      section="schedule"
      breadcrumbs={[{ label: title }]}
      testId="admin-schedule"
    >
      <ScheduleNav />
      {children}
    </AdminPage>
  );
}
