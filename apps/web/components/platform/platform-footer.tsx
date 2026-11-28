import { Container } from "@churchy/ui";
import { DemoChipSlot } from "@/components/demo-chip-slot";
import { DemoMenu } from "@/components/demo-chip";
import { demoModeEnabled } from "@/lib/demo/flag";
import { getT } from "@/i18n/server";
import { todayInBudapest } from "@churchy/hu";
import { DISPLAY_FONT } from "./display-font";

const linkClass =
  "inline-flex min-h-11 items-center rounded-full px-2 text-inverse-text underline decoration-inverse-muted/50 underline-offset-4 hover:decoration-inverse-accent";

/**
 * Footer of the Churchy platform pages: wordmark, the page links and, in demo mode on the landing
 * page only, a tiny *Demo* link that opens the demo menu (the landing page has no demo bar; every
 * other page has the floating chip instead).
 */
export async function PlatformFooter() {
  const [t, nav, common] = await Promise.all([
    getT("public.landing.footer"),
    getT("public.landing.nav"),
    getT("common"),
  ]);
  const year = todayInBudapest(new Date()).slice(0, 4);
  return (
    <footer
      data-surface="inverse"
      className="rounded-t-[calc(var(--radius-xl)_+_0.5rem)] bg-inverse text-inverse-text"
      data-testid="platform-footer"
    >
      <Container className="grid gap-8 py-12 lg:grid-cols-[1.4fr_1fr] lg:py-14">
        <div className="grid content-start gap-3">
          <p
            className="m-0 text-[2rem] leading-none font-semibold text-inverse-accent"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            {common("appName")}
          </p>
          <p className="m-0 max-w-[40ch] text-fs-2 text-inverse-muted">{t("tagline")}</p>
        </div>
        <nav aria-label={t("navLabel")}>
          <ul className="-mx-2 flex flex-wrap gap-x-4 gap-y-1">
            <li>
              <a href="/#hogyan" className={linkClass}>
                {nav("how")}
              </a>
            </li>
            <li>
              <a href="/#peldak" className={linkClass}>
                {nav("examples")}
              </a>
            </li>
            <li>
              <a href="/belepes" className={linkClass}>
                {nav("login")}
              </a>
            </li>
          </ul>
        </nav>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-inverse-muted/20 pt-5 text-fs-2 text-inverse-muted lg:col-span-2">
          <p className="m-0">{t("copyright", { year })}</p>
          {demoModeEnabled() ? <p className="m-0">{t("demoNotice")}</p> : null}
          <DemoChipSlot show="landing">
            <DemoMenu variant="footer" />
          </DemoChipSlot>
        </div>
      </Container>
    </footer>
  );
}
