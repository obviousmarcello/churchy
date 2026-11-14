import { Header } from "@churchy/ui";
import { buildAppNav, buildPublicNav } from "@/lib/app-nav";
import { filterNav } from "@/lib/permissions/nav";
import { getT } from "@/i18n/server";
import { getActor, getRequestContext } from "@/server/session";

/**
 * Site header whose navigation is filtered with `can()` (D-05): the public main navigation, then
 * the app areas the actor may use (an area is visible when one of its sections is); the sections
 * themselves are listed on each area's landing page. Renders nothing while the visitor has no
 * navigation item. `currentHref` marks the item of the current page.
 */
export async function SiteHeader({ currentHref }: { currentHref?: string } = {}) {
  const [actor, ctx, t, nav] = await Promise.all([
    getActor(),
    getRequestContext(),
    getT("common"),
    getT("common.nav"),
  ]);
  const items = filterNav([...buildPublicNav(nav, nav), ...buildAppNav(nav)], actor, ctx);
  if (items.length === 0) return null;
  return (
    <Header
      brand={{ name: t("appName"), href: "/" }}
      nav={items.map(({ label, href }) => ({ label, href, current: href === currentHref }))}
      labels={{
        navigation: t("mainNavigation"),
        openMenu: t("openMenu"),
        closeMenu: t("closeMenu"),
      }}
    />
  );
}
