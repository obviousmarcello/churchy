import { Alert, Badge, PageShell } from "@churchy/ui";
import { buildAppNav, type AppArea } from "@/lib/app-nav";
import { filterNav } from "@/lib/permissions/nav";
import { getT } from "@/i18n/server";
import { getDemoState } from "@/server/demo";
import { getActor, getRequestContext } from "@/server/session";
import { SiteHeader } from "./site-header";

/**
 * Landing page of an app area (*Munkatér*, *Weboldal kezelése*, *Egyházmegyei portál*). Lists the
 * sections the actor may use — decided by `can()` through `filterNav()` — and shows a no-access
 * notice when there is none. Section pages arrive with their modules.
 */
export async function AreaHome({
  area,
  title,
  lead,
}: {
  area: AppArea;
  title: string;
  lead: string;
}) {
  const [actor, ctx, nav, t, common, demo] = await Promise.all([
    getActor(),
    getRequestContext(),
    getT("common.nav"),
    getT("common.area"),
    getT("common"),
    getDemoState(),
  ]);
  const sections = filterNav(buildAppNav(nav), actor, ctx).find((i) => i.id === area)?.children;

  return (
    <PageShell skipLinkLabel={common("skipToContent")} header={<SiteHeader />}>
      <div className="mx-auto w-full max-w-(--content-max) px-(--gutter) py-10">
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">{title}</h1>
        {sections === undefined ? (
          <div className="mt-6 max-w-prose" data-testid="area-no-access">
            <Alert tone="warning" title={t("noAccessTitle")}>
              <p>{t("noAccessBody")}</p>
              {demo !== null && <p className="mt-2">{t("noAccessDemoHint")}</p>}
            </Alert>
          </div>
        ) : (
          <>
            <p className="mt-3 max-w-prose text-fs-4 text-muted">{lead}</p>
            <h2 className="mt-8 font-heading text-fs-5 font-semibold">{t("sectionsHeading")}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="area-sections">
              {sections.map((section) => (
                <li
                  key={section.id}
                  data-section={section.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-4 py-3"
                >
                  <span className="font-semibold">{section.label}</span>
                  <Badge>{t("upcoming")}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-fs-2 text-muted">{t("upcomingNote")}</p>
          </>
        )}
      </div>
    </PageShell>
  );
}
