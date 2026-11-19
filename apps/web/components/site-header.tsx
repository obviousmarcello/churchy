import { Header } from "@churchy/ui";
import { buildAppNav, buildPublicNav } from "@/lib/app-nav";
import { aboutPages } from "@/lib/pages/public-pages";
import { filterNav } from "@/lib/permissions/nav";
import { getT } from "@/i18n/server";
import { getEnabledPublicModules } from "@/server/plans";
import { listPublishedPages } from "@/server/public-pages";
import { getActor, getRequestContext } from "@/server/session";

/**
 * Site header whose navigation is filtered with `can()` (D-05): the public main navigation, then
 * the app areas the actor may use (an area is visible when one of its sections is); the sections
 * themselves are listed on each area's landing page. Public items keep their sub-menu (*Rólunk ▾*
 * with the church's static pages and the staff page, D-16). Renders nothing while the visitor has
 * no navigation item. `currentHref` marks the item of the current page.
 */
export async function SiteHeader({ currentHref }: { currentHref?: string } = {}) {
  const [actor, ctx, t, nav, pages, modules] = await Promise.all([
    getActor(),
    getRequestContext(),
    getT("common"),
    getT("common.nav"),
    listPublishedPages(),
    getEnabledPublicModules(),
  ]);
  // Modules switched off (D-25) or outside the plan (D-87) leave the public navigation.
  const publicItems = filterNav(buildPublicNav(nav, nav, aboutPages(pages, nav)), actor, {
    ...ctx,
    isModuleEnabled: (module) => (modules as ReadonlySet<string>).has(module),
  });
  const appItems = filterNav(buildAppNav(nav), actor, ctx);
  if (publicItems.length + appItems.length === 0) return null;
  return (
    <Header
      brand={{ name: t("appName"), href: "/" }}
      nav={[
        ...publicItems.map(({ label, href, children }) => {
          const sub = children?.map((c) => ({
            label: c.label,
            href: c.href,
            current: c.href === currentHref,
          }));
          return sub?.length
            ? { label, href, current: sub.some((c) => c.current), children: sub }
            : { label, href, current: href === currentHref };
        }),
        ...appItems.map(({ label, href }) => ({ label, href, current: href === currentHref })),
      ]}
      labels={{
        navigation: t("mainNavigation"),
        openMenu: t("openMenu"),
        closeMenu: t("closeMenu"),
      }}
    />
  );
}
