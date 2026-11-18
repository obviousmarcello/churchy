import type { ReactNode } from "react";
import { AdminPage } from "@/components/admin";
import { AppearanceNav } from "@/components/appearance/appearance-nav";
import { getT } from "@/i18n/server";

/**
 * Wrapper of the appearance screens (D-24) inside the admin shell (D-18): the standard admin page
 * (breadcrumb, title, no-access notice decided by `can()` for the *Megjelenés* section) and the
 * links between the four parts. Mutations are guarded again by `withPolicy()` in `actions.ts`.
 */
export default async function AppearanceLayout({ children }: { children: ReactNode }) {
  const t = await getT("admin.appearance");
  return (
    <AdminPage
      title={t("title")}
      lead={t("lead")}
      section="appearance"
      breadcrumbs={[{ label: t("title") }]}
    >
      <AppearanceNav />
      {children}
    </AdminPage>
  );
}
