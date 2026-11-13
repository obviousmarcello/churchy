import { Header } from "@churchy/ui";
import messages from "@messages/hu.json";
import { APP_NAV } from "@/lib/app-nav";
import { filterNav } from "@/lib/permissions/nav";
import { getActor, getRequestContext } from "@/server/session";

/**
 * App-shell header whose navigation is filtered with `can()` (D-05). Renders nothing while the
 * visitor has no navigation item (anonymous visitors, until public nav items exist).
 */
export async function SiteHeader() {
  const [actor, ctx] = await Promise.all([getActor(), getRequestContext()]);
  const items = filterNav(APP_NAV, actor, ctx);
  if (items.length === 0) return null;
  return (
    <Header
      brand={{ name: messages.common.appName, href: "/" }}
      nav={items.map(({ label, href, children }) => ({
        label,
        href,
        children: children?.map((c) => ({ label: c.label, href: c.href })),
      }))}
      labels={{
        navigation: messages.common.mainNavigation,
        openMenu: messages.common.openMenu,
        closeMenu: messages.common.closeMenu,
      }}
    />
  );
}
