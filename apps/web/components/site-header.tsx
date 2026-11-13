import { Header } from "@churchy/ui";
import { buildAppNav } from "@/lib/app-nav";
import { filterNav } from "@/lib/permissions/nav";
import { getT } from "@/i18n/server";
import { getActor, getRequestContext } from "@/server/session";

/**
 * App-shell header whose navigation is filtered with `can()` (D-05). Renders nothing while the
 * visitor has no navigation item (anonymous visitors, until public nav items exist).
 */
export async function SiteHeader() {
  const [actor, ctx, t, nav] = await Promise.all([
    getActor(),
    getRequestContext(),
    getT("common"),
    getT("common.nav"),
  ]);
  const items = filterNav(buildAppNav(nav), actor, ctx);
  if (items.length === 0) return null;
  return (
    <Header
      brand={{ name: t("appName"), href: "/" }}
      nav={items.map(({ label, href, children }) => ({
        label,
        href,
        children: children?.map((c) => ({ label: c.label, href: c.href })),
      }))}
      labels={{
        navigation: t("mainNavigation"),
        openMenu: t("openMenu"),
        closeMenu: t("closeMenu"),
      }}
    />
  );
}
