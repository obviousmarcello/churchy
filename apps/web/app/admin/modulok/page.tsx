import Link from "next/link";
import { Alert, Badge } from "@churchy/ui";
import { AdminPage } from "@/components/admin";
import { EntityForm } from "@/components/admin/content/entity-form";
import { SavedNotice } from "@/components/admin/content/list-parts";
import { getT } from "@/i18n/server";
import { SENSITIVE_WORKSPACE_MODULES, workspaceModuleId } from "@/lib/plans/modules";
import { mayOpen } from "@/server/content-admin";
import { getModulesView } from "@/server/module-admin";
import { saveModulesAction } from "@/server/module-actions";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.modules")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/**
 * *Modulok* (D-25, FR-105): switch website and workspace modules on and off. A module that is
 * off disappears from the navigation, the home page and the sitemap and its routes answer 404;
 * switching it on again restores everything, content intact. Modules outside the plan are listed
 * locked, with the upgrade prompt (`entitlements()`).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [nav, t, query] = await Promise.all([
    getT("common.nav"),
    getT("admin.modules"),
    searchParams,
  ]);
  const title = nav("sections.modules");
  if (!(await mayOpen("modules"))) return <AdminPage title={title} section="modules" />;
  const view = await getModulesView();
  if (view === null) return <AdminPage title={title} section="modules" />;
  const locked = [
    ...view.website
      .filter((r) => !r.entitled)
      .map((r) => ({ id: `w-${r.key}`, title: t(`website.items.${r.key}.title`) })),
    ...view.workspace
      .filter((r) => !r.entitled)
      .map((r) => ({
        id: r.key,
        title: t(`workspace.items.${workspaceModuleId(r.key)}.title`),
      })),
  ];
  const sensitiveOn = view.workspace.some(
    (r) => r.entitled && SENSITIVE_WORKSPACE_MODULES.includes(r.key),
  );
  return (
    <AdminPage
      title={title}
      lead={t("lead")}
      section="modules"
      breadcrumbs={[{ label: title }]}
      testId="admin-modules"
    >
      <SavedNotice saved={query["mentve"] === "1"} />
      <Alert tone="info" title={t("offTitle")}>
        <p>{t("offBody")}</p>
      </Alert>
      {sensitiveOn ? (
        <Alert tone="warning" title={t("securityTitle")}>
          <p>{t("securityBody")}</p>
        </Alert>
      ) : null}
      <EntityForm
        action={saveModulesAction}
        fields={view.fields}
        values={view.values}
        submitLabel={t("save")}
        cancelHref="/admin"
        testId="modules-form"
      />
      {locked.length > 0 ? (
        <section
          aria-labelledby="locked-h"
          className="flex flex-col gap-3"
          data-testid="modules-locked"
        >
          <h2 id="locked-h" className="font-heading text-fs-5 font-bold text-primary">
            {t("locked.title")}
          </h2>
          <p className="text-muted">{t("locked.lead")}</p>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {locked.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-3 p-3"
                data-testid="locked-module"
              >
                <span className="font-semibold">{m.title}</span>
                <Badge tone="warning">{t("locked.badge")}</Badge>
              </li>
            ))}
          </ul>
          <p>
            <Link href="/admin/csomag" className="font-semibold text-primary underline">
              {t("locked.upgrade")}
            </Link>
          </p>
        </section>
      ) : null}
    </AdminPage>
  );
}
