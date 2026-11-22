import { ButtonLink, ChurchIcon, IconTile } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { DISPLAY_FONT } from "./display-font";

/**
 * Header of the Churchy platform pages (landing page, sign-in): the product's own chrome, not a
 * church's `SiteHeader`. The logo, anchors to the landing page's sections (from 768 px) and the
 * *Belépés* button.
 */
export async function PlatformHeader() {
  const t = await getT("public.landing.nav");
  const common = await getT("common");
  const anchors = [
    { id: "how", href: "/#hogyan" },
    { id: "features", href: "/#funkciok" },
    { id: "examples", href: "/#peldak" },
    { id: "faq", href: "/#kerdesek" },
  ] as const;
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface-raised supports-[backdrop-filter:blur(1px)]:bg-surface-glass supports-[backdrop-filter:blur(1px)]:backdrop-blur-xl">
      <div className="mx-auto flex min-h-(--header-h) w-full max-w-(--content-max) items-center gap-3 px-(--gutter)">
        <a
          href="/"
          aria-label={t("home")}
          data-testid="platform-brand"
          className="flex min-h-11 items-center gap-3 text-primary no-underline"
        >
          <IconTile icon={<ChurchIcon />} tone="primary" size="md" />
          <span
            className="text-[1.75rem] leading-none font-semibold tracking-[-0.01em]"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            {common("appName")}
          </span>
        </a>
        <nav aria-label={t("label")} className="ml-auto hidden md:block">
          <ul className="flex items-center gap-1">
            {anchors.map(({ id, href }) => (
              <li key={id}>
                <a
                  href={href}
                  className="inline-flex min-h-11 items-center rounded-full px-3.5 text-fs-2 font-semibold text-text no-underline transition-[background-color,color] duration-(--dur-2) hover:bg-hover hover:text-primary lg:text-fs-3"
                >
                  {t(id)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto md:ml-2">
          <ButtonLink href="/belepes" variant="outline" size="sm" data-testid="platform-login">
            {t("login")}
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
