import { Alert } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { getAdminSections } from "@/server/admin";
import { AdminPage, type Crumb } from "./admin-page";

/** Section ids (`buildAppNav()`) that have a placeholder page. */
export type AdminSectionId =
  | "news"
  | "announcements"
  | "events"
  | "pages"
  | "staff"
  | "locations"
  | "schedule"
  | "requests"
  | "appearance"
  | "users"
  | "domain";

/**
 * Stand-in for an admin section whose module has not been built yet. It already has the final
 * route, the permission check and the page frame; the module's deliverable replaces the page
 * body (`app/admin/<route>/page.tsx`) with real content, keeping `<AdminPage section=…>`.
 *
 * For a sub-flow (`/admin/hirek/uj`) pass `flow`: the translated title of the flow, shown as
 * the last breadcrumb.
 */
export async function SectionPlaceholder({
  section,
  flow,
}: {
  section: AdminSectionId;
  flow?: string;
}) {
  const [sections, nav, t, lead] = await Promise.all([
    getAdminSections(),
    getT("common.nav"),
    getT("admin.placeholder"),
    getT(`admin.sections.${section}`),
  ]);
  // The label comes from the nav definition; fall back to the translation when the actor may not
  // open the section (the page then only shows the no-access notice).
  const item = sections.find((s) => s.id === section);
  const label = item?.label ?? nav(`sections.${section}`);
  const trail: Crumb[] =
    flow === undefined ? [{ label }] : [{ label, href: item?.href }, { label: flow }];
  return (
    <AdminPage
      title={flow ?? label}
      lead={lead("lead")}
      section={section}
      breadcrumbs={trail}
      testId="admin-placeholder"
    >
      <Alert tone="info" title={t("title")}>
        <p>{t("body", { section: label })}</p>
      </Alert>
    </AdminPage>
  );
}
