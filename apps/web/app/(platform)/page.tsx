import type { Metadata } from "next";
import type { ImportStage } from "@churchy/contracts";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  BuildingIcon,
  Button,
  ButtonLink,
  CalendarIcon,
  Card,
  ChurchIcon,
  Disclosure,
  GlobeIcon,
  Reveal,
  Stagger,
} from "@churchy/ui";
import { Builder } from "@/components/setup/builder";
import { DISPLAY_FONT } from "@/components/platform/display-font";
import { getT } from "@/i18n/server";
import { demoModeEnabled } from "@/lib/demo/flag";
import { demoSiteBase } from "@/lib/site-base";
import { demoDirectory } from "@/server/data-adapters";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("public.landing");
  return { title: { absolute: t("metaTitle") }, description: t("metaDescription") };
}

/** The finished church of the setup animation: the hero shows what the robots build. */
const ALL_STAGES: ImportStage[] = [
  "fetched",
  "pages",
  "serviceTimes",
  "contacts",
  "theme",
  "preset",
  "draft",
];

const STEP_KEYS = ["paste", "build", "team"] as const;
const FAQ_KEYS = ["hosting", "gdpr", "sensitive", "import"] as const;
const KNOWN_EXAMPLES = ["szent-tivadar", "dunaligeti-reformatus", "dunaligeti-baptista"] as const;

const SECTION = "mx-auto w-full max-w-(--content-max) px-(--gutter) py-16 lg:py-24";
const SECTION_TITLE =
  "m-0 text-balance text-section-title font-semibold tracking-[-0.01em] text-primary lg:text-[1.75rem]";

/**
 * The Churchy platform landing page (`/`, platform host): a church pastes the address of its
 * current website and starts the first-setup wizard (`/uj-egyhaz?cim=…`, which begins the import
 * at once); below it how it works, what the platform covers, the three demo churches' sites and
 * the data questions a parish asks first. The page has no demo bar: the demo menu is the tiny
 * *Demo* link in its footer.
 */
export default async function LandingPage() {
  const [t, nav] = await Promise.all([getT("public.landing"), getT("public.landing.nav")]);
  const demo = demoModeEnabled();
  const examples = demo
    ? demoDirectory().contexts.flatMap((c) =>
        c.kind === "tenant" && c.slug !== undefined ? [{ name: c.name, slug: c.slug }] : [],
      )
    : [];
  const kindOf = (slug: string) => {
    const known = KNOWN_EXAMPLES.find((k) => k === slug);
    return known ? t(`examples.kinds.${known}`) : t("examples.kindFallback");
  };

  return (
    <>
      <section aria-labelledby="landing-title" className="bg-surface-app">
        <div className="mx-auto grid w-full max-w-(--content-max) items-center gap-10 px-(--gutter) py-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14 lg:py-20">
          <div className="grid gap-6">
            <h1
              id="landing-title"
              className="m-0 text-balance font-medium tracking-[-0.015em] text-primary"
              style={{
                fontFamily: DISPLAY_FONT,
                fontSize: "clamp(2.75rem, 1.6rem + 4.6vw, 4.75rem)",
                lineHeight: 1.02,
              }}
            >
              {t("hero.title")}
            </h1>
            <p className="m-0 max-w-[54ch] text-fs-4 text-muted">{t("hero.lead")}</p>
            {demo ? (
              <form
                id="kezdes"
                action="/uj-egyhaz"
                method="get"
                data-testid="landing-start"
                className="flex scroll-mt-28 flex-col gap-2 rounded-overlay bg-surface-raised p-2 shadow-raised ring-1 ring-hairline outline-2 outline-offset-2 outline-transparent transition-[outline-color,box-shadow] duration-(--dur-2) focus-within:outline-(--c-focus) sm:flex-row sm:items-center"
              >
                <label htmlFor="landing-url" className="sr-only">
                  {t("hero.label")}
                </label>
                <input
                  id="landing-url"
                  name="cim"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t("hero.placeholder")}
                  className="min-h-14 min-w-0 flex-1 rounded-control border-0 bg-transparent px-4 text-fs-4 text-text outline-none placeholder:text-muted sm:px-5"
                />
                <Button type="submit" size="lg" data-testid="landing-start-button">
                  {t("hero.start")}
                  <ArrowRightIcon />
                </Button>
              </form>
            ) : (
              <p className="m-0">
                <ButtonLink href="/belepes" size="lg">
                  {nav("login")}
                </ButtonLink>
              </p>
            )}
            {demo ? (
              <p className="m-0 max-w-[54ch] text-fs-2 text-muted">{t("hero.note")}</p>
            ) : null}
          </div>
          <Reveal className="overflow-hidden rounded-overlay shadow-raised ring-1 ring-hairline">
            <Builder completed={ALL_STAGES} running={false} className="block h-auto w-full" />
          </Reveal>
        </div>
      </section>

      <section id="hogyan" aria-labelledby="how-title" className={`${SECTION} scroll-mt-20`}>
        <h2 id="how-title" className={SECTION_TITLE}>
          {t("how.title")}
        </h2>
        <Stagger as="ol" className="mt-8 grid list-none gap-4 p-0 md:grid-cols-3">
          {STEP_KEYS.map((key, i) => (
            <li
              key={key}
              data-step={key}
              className="grid content-start gap-3 rounded-card bg-surface-tint p-6 sm:p-7"
            >
              <span
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-tile bg-primary text-[1.5rem] leading-none font-semibold text-primary-contrast"
                style={{ fontFamily: DISPLAY_FONT }}
              >
                {i + 1}
              </span>
              <h3 className="m-0 text-card-title font-semibold text-text">
                {t(`how.steps.${key}.title`)}
              </h3>
              <p className="m-0 text-fs-3 text-muted">{t(`how.steps.${key}.text`)}</p>
            </li>
          ))}
        </Stagger>
      </section>

      <section
        id="funkciok"
        aria-labelledby="features-title"
        className="scroll-mt-20 bg-surface-app"
      >
        <div className={SECTION}>
          <h2 id="features-title" className={SECTION_TITLE}>
            {t("features.title")}
          </h2>
          <p className="mt-3 mb-0 max-w-[60ch] text-fs-3 text-muted">{t("features.lead")}</p>
          <Stagger as="ul" className="mt-8 grid list-none gap-4 p-0 md:grid-cols-2">
            <Card
              as="li"
              variant="raised"
              icon={<GlobeIcon />}
              title={t("features.site.title")}
              headingLevel={3}
            >
              <p className="m-0 text-fs-3 text-muted">{t("features.site.text")}</p>
            </Card>
            <Card
              as="li"
              variant="raised"
              icon={<CalendarIcon />}
              title={t("features.workspace.title")}
              headingLevel={3}
            >
              <p className="m-0 text-fs-3 text-muted">{t("features.workspace.text")}</p>
            </Card>
            <Card
              as="li"
              variant="raised"
              icon={<BriefcaseIcon />}
              title={t("features.hr.title")}
              headingLevel={3}
            >
              <p className="m-0 text-fs-3 text-muted">{t("features.hr.text")}</p>
            </Card>
            <Card
              as="li"
              variant="raised"
              icon={<BuildingIcon />}
              title={t("features.diocese.title")}
              headingLevel={3}
            >
              <p className="m-0 text-fs-3 text-muted">{t("features.diocese.text")}</p>
            </Card>
          </Stagger>
        </div>
      </section>

      {examples.length > 0 ? (
        <section id="peldak" aria-labelledby="examples-title" className={`${SECTION} scroll-mt-20`}>
          <h2 id="examples-title" className={SECTION_TITLE}>
            {t("examples.title")}
          </h2>
          <p className="mt-3 mb-0 max-w-[60ch] text-fs-3 text-muted">{t("examples.lead")}</p>
          <Stagger
            as="ul"
            className="mt-8 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="landing-examples"
          >
            {examples.map(({ name, slug }) => (
              <Card
                key={slug}
                as="li"
                href={demoSiteBase(slug)}
                icon={<ChurchIcon />}
                eyebrow={kindOf(slug)}
                title={name}
                headingLevel={3}
                data-testid="landing-example"
              >
                <span className="inline-flex items-center gap-1.5 text-fs-3 font-semibold text-primary">
                  {t("examples.open")}
                  <ArrowRightIcon size="sm" />
                </span>
              </Card>
            ))}
          </Stagger>
        </section>
      ) : null}

      <section id="kerdesek" aria-labelledby="faq-title" className="scroll-mt-20 bg-surface-app">
        <div className={SECTION}>
          <h2 id="faq-title" className={SECTION_TITLE}>
            {t("faq.title")}
          </h2>
          <p className="mt-3 mb-0 max-w-[60ch] text-fs-3 text-muted">{t("faq.lead")}</p>
          <ul className="mt-8 grid list-none items-start gap-3 p-0 md:grid-cols-2">
            {FAQ_KEYS.map((key) => (
              <li key={key}>
                <Disclosure summary={t(`faq.items.${key}.q`)}>
                  <p className="m-0 text-muted">{t(`faq.items.${key}.a`)}</p>
                </Disclosure>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
