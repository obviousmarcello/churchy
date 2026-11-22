import { ClockIcon, Header, monogramOf, type NavItem } from "@churchy/ui";
import { buildAppNav, buildPublicNav } from "@/lib/app-nav";
import { serviceWhen } from "@/lib/home/next-services";

import { aboutPages, publicImage } from "@/lib/pages/public-pages";
import { filterNav } from "@/lib/permissions/nav";
import { termRoutePath } from "@/lib/term-routes";
import { getT } from "@/i18n/server";
import { getRequestNow } from "@/server/clock";
import { getEnabledPublicModules } from "@/server/plans";
import { listPublishedPages } from "@/server/public-pages";
import { getHomeNextServices } from "@/server/public-schedule";
import { getPublicSite } from "@/server/public-seo";
import { getRequestRepositories } from "@/server/repositories";
import { getActor, getRequestContext } from "@/server/session";

/**
 * The navigation filtered with `can()` (D-05): the public main navigation, then the app areas the
 * actor may use (an area is visible when one of its sections is); the sections themselves are
 * listed on each area's landing page. Public items keep their sub-menu (*Rólunk ▾* with the
 * church's static pages and the staff page, D-16). `currentHref` marks the item of the current page.
 */
async function headerNav(currentHref: string | undefined): Promise<NavItem[]> {
  const [actor, ctx, nav, pages, modules] = await Promise.all([
    getActor(),
    getRequestContext(),
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
  return [
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
  ];
}

/**
 * Header of the app areas (workspace, diocese portal): the product name and the navigation.
 * Renders nothing while the visitor has no navigation item.
 */
export async function SiteHeader({ currentHref }: { currentHref?: string } = {}) {
  const [t, items] = await Promise.all([getT("common"), headerNav(currentHref)]);
  if (items.length === 0) return null;
  return (
    <Header
      brand={{ name: t("appName"), href: "/" }}
      nav={items}
      labels={{
        navigation: t("mainNavigation"),
        openMenu: t("openMenu"),
        closeMenu: t("closeMenu"),
      }}
    />
  );
}

/**
 * Header of a church's public site (UI-02): the church's short name with its logo (or a monogram
 * of its initials), the navigation, and one call to action, the next service from the schedule
 * engine (*Szeretettel várjuk · vasárnap 10:00*), linking to the full schedule. Without an upcoming
 * service (or without the schedule module) the button names the schedule page itself.
 */
export async function PublicSiteHeader({ currentHref }: { currentHref?: string } = {}) {
  const [site, t, chrome, items, view, now, repos] = await Promise.all([
    getPublicSite(),
    getT("common"),
    getT("public.chrome"),
    headerNav(currentHref),
    getHomeNextServices(),
    getRequestNow(),
    getRequestRepositories(),
  ]);
  if (site === null) return SiteHeader({ ...(currentHref ? { currentHref } : {}) });
  const { identity, modules } = site.config;
  const name = identity.shortName || identity.name;
  const logoMedia = identity.logoMediaId
    ? await repos.media.get(site.ctx, identity.logoMediaId)
    : null;
  const logo = publicImage(logoMedia);
  const next = view?.next ?? null;
  const cta = modules.schedule
    ? {
        href: termRoutePath(chrome, "serviceSchedule"),
        icon: <ClockIcon />,
        "data-testid": "header-next-service",
        ...(next
          ? { caption: chrome("ctaCaption"), label: chrome("ctaWhen", serviceWhen(next, now)) }
          : { label: chrome("ctaFallback") }),
      }
    : undefined;
  return (
    <Header
      brand={{
        name,
        href: "/",
        ...(logo
          ? {
              logo: (
                // eslint-disable-next-line @next/next/no-img-element -- small uploaded logo, already sized
                <img
                  src={logo.src}
                  alt=""
                  width={logo.width ?? 44}
                  height={logo.height ?? 44}
                  className="size-11 object-contain"
                />
              ),
            }
          : { monogram: monogramOf(name) }),
      }}
      nav={items}
      {...(cta ? { cta } : {})}
      labels={{
        navigation: t("mainNavigation"),
        openMenu: t("openMenu"),
        closeMenu: t("closeMenu"),
      }}
    />
  );
}
