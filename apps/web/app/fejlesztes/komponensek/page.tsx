import { Fragment, type CSSProperties, type ReactNode } from "react";
import {
  RADIUS_STEPS,
  isHexColor,
  resolveThemeConfig,
  themeAttributes,
  type RadiusStep,
} from "@churchy/themes";
import {
  AdminScope,
  Address,
  Alert,
  Badge,
  BankAccount,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  DateInput,
  Dialog,
  DialogClose,
  Footer,
  FooterLink,
  FormattedDate,
  FormattedTime,
  Header,
  Hero,
  Input,
  PageShell,
  PersonName,
  Phone,
  SectionHeading,
  Select,
  Tabs,
  Textarea,
  TimeInput,
  type HeroImage,
} from "@churchy/ui";
import { getT } from "@/i18n/server";
import { assertDevRoutesVisible } from "@/lib/dev-routes";
import { termsForDenomination } from "@/i18n/terms";
import { ThemePlayground } from "./theme-playground";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("dev.showcase"), getT("common")]);
  return {
    title: `${t("metaTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

// Read per request: the theme comes from the URL (primary, accent, radius), which is how the
// showcase demonstrates runtime theming, and HIDE_DEV_ROUTES is evaluated at runtime.
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const SCOPE_ID = "showcase-scope";

// Fictitious demo data (CLAUDE.md rule 4).
const DEMO_NOW = "2026-11-12T10:00:00+01:00";
const DEMO_ADDRESS = {
  postalCode: "1056",
  city: "Budapest",
  street: "Március 15. tér",
  houseNumber: "3",
};
const DEMO_PHONE = "06 30 1234567";
const DEMO_ACCOUNT = "11773016-11111018-00000000";
const TRADITIONS = [
  ["rk", "traditionRk"],
  ["ref", "traditionRef"],
  ["bapt", "traditionBapt"],
] as const;

function Block({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children?: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 py-10 lg:py-14">
      <div className="mb-8">
        <SectionHeading id={`${id}-title`} title={title} />
        {lead ? <p className="mt-4 max-w-[68ch] text-fs-3 text-muted">{lead}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 text-fs-1 font-bold tracking-[0.14em] text-muted uppercase">{children}</h3>
  );
}

const colorTokens = [
  "--c-surface",
  "--c-surface-raised",
  "--c-surface-sunken",
  "--c-text",
  "--c-muted",
  "--c-primary",
  "--c-primary-contrast",
  "--c-accent",
  "--c-accent-text",
  "--c-border",
  "--c-border-strong",
  "--c-focus",
  "--c-inverse",
  "--c-danger",
  "--c-success",
  "--c-warning",
  "--c-info",
] as const;

const TOC_KEYS = [
  "theme",
  "tokens",
  "typography",
  "header",
  "hero",
  "cards",
  "buttons",
  "forms",
  "feedback",
  "tabs",
  "admin",
  "formatting",
  "footer",
] as const;

const spacingSteps = Array.from({ length: 12 }, (_, i) => i + 1);
const typeSteps = [1, 2, 3, 4, 5, 6, 7] as const;

export default async function ShowcasePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  assertDevRoutesVisible();

  const params = await searchParams;
  const primary = first(params.primary);
  const accent = first(params.accent);
  const radius = first(params.radius);
  const theme = resolveThemeConfig({
    colors: {
      ...(isHexColor(primary) ? { primary } : {}),
      ...(isHexColor(accent) ? { accent } : {}),
    },
    ...(RADIUS_STEPS.includes(radius as RadiusStep) ? { radius: radius as RadiusStep } : {}),
  });

  const [t, common] = await Promise.all([getT("dev.showcase"), getT("common")]);
  const heroImage: HeroImage = {
    src: "/demo/templom.svg",
    alt: t("hero.imageAlt"),
    width: 1600,
    height: 900,
  };

  const nav = await getT("dev.showcase.header.nav");
  const fmt = await getT("dev.showcase.formatting");
  const home = await getT("public.home");
  const headerNav = [
    { label: nav("home"), href: "#", current: true },
    { label: nav("schedule"), href: "#miserend" },
    { label: nav("announcements"), href: "#hirdetesek" },
    { label: nav("events"), href: "#esemenyek" },
    { label: nav("sacraments"), href: "#szentsegek" },
    {
      label: nav("about"),
      href: "#rolunk",
      children: [
        { label: nav("aboutHistory"), href: "#tortenet" },
        { label: nav("aboutStaff"), href: "#munkatarsak" },
        { label: nav("aboutGroups"), href: "#kozossegek" },
      ],
    },
    { label: nav("contact"), href: "#kapcsolat" },
  ];

  const f = await getT("dev.showcase.footer");
  const footer = (
    <Footer
      brand={{ name: f("brandName"), description: f("description") }}
      legalLabel={common("legalNavigation")}
      legal={[
        { label: f("legalImprint"), href: "#impresszum" },
        { label: f("legalPrivacy"), href: "#adatkezeles" },
        { label: f("legalAccessibility"), href: "#akadalymentesseg" },
      ]}
      note={f("note")}
      columns={[
        {
          heading: f("contactHeading"),
          children: (
            <address className="grid gap-0 not-italic">
              <p className="py-2">
                <Address address={DEMO_ADDRESS} />
              </p>
              <FooterLink href="tel:+36301234567">
                <Phone value={DEMO_PHONE} />
              </FooterLink>
              <FooterLink href="mailto:iroda@minta-plebania.example">{f("email")}</FooterLink>
            </address>
          ),
        },
        {
          heading: f("hoursHeading"),
          children: (
            <ul className="grid gap-2">
              <li>{f("hours1")}</li>
              <li>{f("hours2")}</li>
              <li>{f("hours3")}</li>
            </ul>
          ),
        },
        {
          heading: f("linksHeading"),
          children: (
            <ul>
              {[
                [f("linkSchedule"), "#miserend"],
                [f("linkAnnouncements"), "#hirdetesek"],
                [f("linkEvents"), "#esemenyek"],
                [f("linkContact"), "#kapcsolat"],
              ].map(([label, href]) => (
                <li key={href}>
                  <FooterLink href={href as string}>{label}</FooterLink>
                </li>
              ))}
            </ul>
          ),
        },
      ]}
    />
  );

  const { style, ...scopeAttrs } = themeAttributes(theme);
  const fm = await getT("dev.showcase.forms");
  const ad = await getT("dev.showcase.admin");
  const tb = await getT("dev.showcase.tabs");
  const fb = await getT("dev.showcase.feedback");
  const cd = await getT("dev.showcase.cards");
  const bt = await getT("dev.showcase.buttons");
  const tk = await getT("dev.showcase.tokens");

  return (
    <div id={SCOPE_ID} {...scopeAttrs} style={style as CSSProperties} className="bg-surface">
      <PageShell skipLinkLabel={common("skipToContent")} footer={footer}>
        <div className="mx-auto w-full max-w-(--content-max) px-(--gutter)">
          <header className="py-10 lg:py-14">
            <h1 className="font-heading text-fs-7 leading-[1.02] font-bold text-primary">
              {t("title")}
            </h1>
            <p className="mt-4 max-w-[68ch] text-fs-4 text-text">{t("lead")}</p>
            <Alert tone="info" className="mt-6">
              {t("devNotice")}
            </Alert>
            <nav aria-label={t("tocLabel")} className="mt-6">
              <ul className="flex flex-wrap gap-2">
                {TOC_KEYS.map((key) => (
                  <li key={key}>
                    <ButtonLink href={`#${key}`} variant="secondary" size="sm">
                      {t(`toc.${key}`)}
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            </nav>
          </header>

          <Block id="theme" title={t("theme.title")} lead={t("theme.lead")}>
            <ThemePlayground
              scopeId={SCOPE_ID}
              initial={theme}
              labels={{
                primaryLabel: t("theme.primaryLabel"),
                primaryHelp: t("theme.primaryHelp"),
                accentLabel: t("theme.accentLabel"),
                accentHelp: t("theme.accentHelp"),
                radiusLabel: t("theme.radiusLabel"),
                radiusOptions: {
                  square: t("theme.radiusSquare"),
                  soft: t("theme.radiusSoft"),
                  round: t("theme.radiusRound"),
                },
                apply: t("theme.apply"),
                reset: t("theme.reset"),
                invalidColor: t("theme.invalidColor"),
                contrastOk: t.raw("theme.contrastOk"),
                contrastBad: t.raw("theme.contrastBad"),
                previewButton: t("theme.previewButton"),
                previewLink: t("theme.previewLink"),
              }}
            />
          </Block>

          <Block id="tokens" title={tk("title")} lead={tk("lead")}>
            <div className="grid gap-10">
              <div>
                <Label>{tk("colors")}</Label>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {colorTokens.map((name) => (
                    <li key={name} className="grid gap-1.5">
                      <span
                        aria-hidden="true"
                        className="h-14 rounded-md border border-border-strong"
                        style={{ backgroundColor: `var(${name})` }}
                      />
                      <code className="text-fs-1 break-all text-muted">{name}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <Label>{tk("type")}</Label>
                <ul className="grid gap-2">
                  {typeSteps.map((step) => (
                    <li key={step} className="flex items-baseline gap-4">
                      <code className="w-14 shrink-0 text-fs-1 text-muted">--fs-{step}</code>
                      <span
                        className="font-heading leading-tight font-semibold"
                        style={{ fontSize: `var(--fs-${step})` }}
                      >
                        {tk("typeSample")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <Label>{tk("spacing")}</Label>
                <ul className="grid gap-1.5">
                  {spacingSteps.map((step) => (
                    <li key={step} className="flex items-center gap-4">
                      <code className="w-20 shrink-0 text-fs-1 text-muted">--space-{step}</code>
                      <span
                        aria-hidden="true"
                        className="h-3 rounded-sm bg-accent"
                        style={{ width: `var(--space-${step})` }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <Label>{tk("shape")}</Label>
                <ul className="flex flex-wrap gap-6">
                  {[
                    ["rounded-sm", tk("radiusSmall")],
                    ["rounded-md", tk("radiusMedium")],
                    ["rounded-lg", tk("radiusLarge")],
                  ].map(([cls, label]) => (
                    <li key={cls} className="grid justify-items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`size-20 border-2 border-primary bg-surface-raised ${cls}`}
                      />
                      <span className="text-fs-2 text-muted">{label}</span>
                    </li>
                  ))}
                  <li className="grid justify-items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-20 rounded-md bg-surface-raised shadow-card"
                    />
                    <span className="text-fs-2 text-muted">{tk("shadow")}</span>
                  </li>
                </ul>
              </div>
            </div>
          </Block>

          <Block id="typography" title={t("typography.title")} lead={t("typography.lead")}>
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <Label>{t("typography.headingLabel")}</Label>
                <p
                  data-testid="font-heading-sample"
                  lang="hu"
                  className="font-heading text-fs-6 leading-tight font-semibold text-primary"
                >
                  {t("typography.headingSample")}
                </p>
              </div>
              <div>
                <Label>{t("typography.bodyLabel")}</Label>
                <p data-testid="font-body-sample" lang="hu" className="text-fs-3">
                  {t("typography.bodySample")}{" "}
                  <a href="#typography">{t("typography.linkSample")}</a>
                </p>
              </div>
            </div>
          </Block>

          <Block id="header" title={t("header.title")} lead={t("header.lead")}>
            <div
              data-testid="showcase-header"
              className="overflow-visible rounded-lg border border-border"
            >
              <Header
                sticky={false}
                brand={{ name: t("header.brandName"), href: "#" }}
                nav={headerNav}
                cta={{ label: nav("support"), href: "#tamogatas" }}
                labels={{
                  navigation: common("mainNavigation"),
                  openMenu: common("openMenu"),
                  closeMenu: common("closeMenu"),
                }}
              />
            </div>
          </Block>
        </div>

        <section id="hero" aria-labelledby="hero-title" className="scroll-mt-6 py-10 lg:py-14">
          <div className="mx-auto mb-8 w-full max-w-(--content-max) px-(--gutter)">
            <SectionHeading id="hero-title" title={t("hero.title")} />
            <p className="mt-4 max-w-[68ch] text-fs-3 text-muted">{t("hero.lead")}</p>
          </div>
          <div className="grid gap-12">
            {(
              [
                ["image-full", t("hero.variantImageFull")],
                ["image-split", t("hero.variantImageSplit")],
                ["text-only", t("hero.variantTextOnly")],
              ] as const
            ).map(([variant, label]) => (
              <div key={variant} data-testid={`showcase-hero-${variant}`}>
                <div className="mx-auto w-full max-w-(--content-max) px-(--gutter)">
                  <Label>{label}</Label>
                </div>
                <Hero
                  variant={variant}
                  headingLevel={2}
                  eyebrow={t("hero.heroEyebrow")}
                  title={t("hero.heroTitle")}
                  lead={t("hero.heroLead")}
                  image={variant === "text-only" ? undefined : heroImage}
                  actions={
                    <>
                      <ButtonLink href="#miserend" variant="primary" size="lg">
                        {t("hero.heroAction")}
                      </ButtonLink>
                      <ButtonLink
                        href="#kapcsolat"
                        variant="secondary"
                        size="lg"
                        className={
                          variant === "image-full"
                            ? "border-white bg-white/10 text-white hover:bg-white/20"
                            : undefined
                        }
                      >
                        {t("hero.heroActionSecondary")}
                      </ButtonLink>
                    </>
                  }
                />
              </div>
            ))}
          </div>
        </section>

        <div className="mx-auto w-full max-w-(--content-max) px-(--gutter)">
          <Block id="cards" title={cd("title")} lead={cd("lead")}>
            <div className="grid gap-10">
              <div className="grid gap-8">
                <SectionHeading
                  level={2}
                  eyebrow={cd("headingEyebrow")}
                  title={cd("headingTitle")}
                  action={
                    <ButtonLink href="#hirek" variant="ghost" size="sm">
                      {cd("headingAction")}
                    </ButtonLink>
                  }
                />
                <SectionHeading level={3} align="center" title={cd("headingCenteredTitle")} />
              </div>
              <div data-testid="showcase-cards" className="grid gap-6 md:grid-cols-3">
                <Card
                  eyebrow={cd("newsEyebrow")}
                  title={cd("newsTitle")}
                  href="#hirek"
                  image={{ src: "/demo/templom.svg", alt: "", width: 1600, height: 900 }}
                  footer={<span>{cd("newsFooter")}</span>}
                >
                  <p>{cd("newsBody")}</p>
                </Card>
                <Card
                  eyebrow={cd("plainEyebrow")}
                  title={cd("plainTitle")}
                  footer={
                    <ButtonLink href="#hirdetesek" variant="secondary" size="sm">
                      {cd("plainAction")}
                    </ButtonLink>
                  }
                >
                  <p>{cd("plainBody")}</p>
                </Card>
                <Card
                  tone="highlight"
                  eyebrow={cd("highlightEyebrow")}
                  title={cd("highlightTitle")}
                  footer={<Badge tone="warning">{cd("badge")}</Badge>}
                >
                  <p>{cd("highlightBody")}</p>
                </Card>
              </div>
            </div>
          </Block>

          <Block id="buttons" title={bt("title")} lead={bt("lead")}>
            <div className="grid gap-8">
              <div>
                <Label>{bt("variants")}</Label>
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary">{bt("primary")}</Button>
                  <Button variant="secondary">{bt("secondary")}</Button>
                  <Button variant="ghost">{bt("ghost")}</Button>
                  <Button variant="danger">{bt("danger")}</Button>
                </div>
              </div>
              <div>
                <Label>{bt("sizes")}</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm">{bt("small")}</Button>
                  <Button size="md">{bt("medium")}</Button>
                  <Button size="lg">{bt("large")}</Button>
                </div>
              </div>
              <div>
                <Label>{bt("states")}</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button disabled>{bt("disabled")}</Button>
                  <Button variant="secondary" disabled>
                    {bt("disabled")}
                  </Button>
                  <ButtonLink href="#buttons" variant="secondary">
                    {bt("link")}
                  </ButtonLink>
                </div>
              </div>
            </div>
          </Block>

          <Block id="forms" title={fm("title")} lead={fm("lead")}>
            <div className="grid gap-6 md:grid-cols-2">
              <Input label={fm("nameLabel")} help={fm("nameHelp")} autoComplete="name" required />
              <Input
                label={fm("emailLabel")}
                type="email"
                defaultValue={fm("emailValue")}
                error={fm("emailError")}
                autoComplete="email"
                required
              />
              <Input
                label={fm("phoneLabel")}
                type="tel"
                optionalLabel={fm("phoneOptional")}
                help={fm("phoneHelp")}
                autoComplete="tel"
              />
              <Select
                label={fm("selectLabel")}
                help={fm("selectHelp")}
                placeholder={fm("selectPlaceholder")}
                defaultValue=""
                options={[
                  { value: "nagyboldogasszony", label: fm("selectOption1") },
                  { value: "szent-anna", label: fm("selectOption2") },
                ]}
              />
              <DateInput label={fm("dateLabel")} help={fm("dateHelp")} defaultValue="2026-11-15" />
              <TimeInput label={fm("timeLabel")} defaultValue="18:00" />
              <Textarea
                label={fm("textareaLabel")}
                help={fm("textareaHelp")}
                wrapperClassName="md:col-span-2"
              />
              <Checkbox
                label={fm("checkboxLabel")}
                help={fm("checkboxHelp")}
                error={fm("checkboxError")}
              />
              <div>
                <Checkbox label={fm("checkboxChecked")} defaultChecked />
                <Input
                  label={fm("disabledLabel")}
                  defaultValue={fm("disabledValue")}
                  disabled
                  wrapperClassName="mt-3"
                />
              </div>
            </div>
          </Block>

          <Block id="feedback" title={fb("title")} lead={fb("lead")}>
            <div className="grid gap-8">
              <ul className="flex flex-wrap gap-3">
                <li>
                  <Badge tone="neutral">{fb("badgeNeutral")}</Badge>
                </li>
                <li>
                  <Badge tone="primary">{fb("badgePrimary")}</Badge>
                </li>
                <li>
                  <Badge tone="accent">{fb("badgeAccent")}</Badge>
                </li>
                <li>
                  <Badge tone="success">{fb("badgeSuccess")}</Badge>
                </li>
                <li>
                  <Badge tone="warning">{fb("badgeWarning")}</Badge>
                </li>
                <li>
                  <Badge tone="danger">{fb("badgeDanger")}</Badge>
                </li>
                <li>
                  <Badge tone="info">{fb("badgeInfo")}</Badge>
                </li>
                <li>
                  <Badge tone="danger" dot>
                    {fb("badgeLive")}
                  </Badge>
                </li>
              </ul>
              <div className="grid gap-4 md:grid-cols-2">
                <Alert tone="info" title={fb("infoTitle")}>
                  {fb("infoBody")}
                </Alert>
                <Alert tone="success" title={fb("successTitle")}>
                  {fb("successBody")}
                </Alert>
                <Alert tone="warning" title={fb("warningTitle")}>
                  {fb("warningBody")}
                </Alert>
                <Alert tone="danger" title={fb("dangerTitle")}>
                  {fb("dangerBody")}
                </Alert>
              </div>
              <div>
                <Label>{fb("bannerHeading")}</Label>
                <Alert
                  variant="banner"
                  tone="danger"
                  action={
                    <ButtonLink href="#elo" size="sm" variant="secondary">
                      {fb("bannerAction")}
                    </ButtonLink>
                  }
                >
                  <Badge tone="danger" dot className="mr-2">
                    {fb("badgeLive")}
                  </Badge>
                  {fb("bannerBody")}
                </Alert>
              </div>
            </div>
          </Block>

          <Block id="tabs" title={tb("title")} lead={tb("lead")}>
            <div className="grid gap-8">
              <Tabs
                label={tb("label")}
                tabs={[
                  { value: "1", label: tb("tab1"), content: <p>{tb("panel1")}</p> },
                  { value: "2", label: tb("tab2"), content: <p>{tb("panel2")}</p> },
                  { value: "3", label: tb("tab3"), content: <p>{tb("panel3")}</p> },
                ]}
              />
              <div>
                <Dialog
                  trigger={<Button variant="danger">{tb("open")}</Button>}
                  title={tb("dialogTitle")}
                  description={tb("dialogDescription")}
                  closeLabel={common("closeDialog")}
                  footer={
                    <>
                      <DialogClose asChild>
                        <Button variant="secondary">{tb("cancel")}</Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button variant="danger">{tb("confirm")}</Button>
                      </DialogClose>
                    </>
                  }
                >
                  <p>{tb("dialogBody")}</p>
                </Dialog>
              </div>
            </div>
          </Block>

          <Block id="admin" title={ad("title")} lead={ad("lead")}>
            <AdminScope
              data-testid="showcase-admin"
              className="grid gap-6 rounded-lg border-2 border-border-strong p-5 sm:p-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-fs-5 font-bold text-text">{ad("heading")}</h3>
                <Badge tone="success">{ad("savedBadge")}</Badge>
              </div>
              <p className="text-fs-3 font-semibold">{ad("stepLabel")}</p>
              <nav aria-label={ad("linksLabel")}>
                <ul className="flex flex-wrap gap-2">
                  {[ad("link1"), ad("link2"), ad("link3")].map((label) => (
                    <li key={label}>
                      <ButtonLink href="#admin" variant="ghost" size="sm">
                        {label}
                      </ButtonLink>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="grid gap-5 md:grid-cols-2">
                <DateInput
                  label={ad("weekLabel")}
                  help={ad("weekHelp")}
                  defaultValue={ad("weekValue")}
                />
                <Select
                  label={ad("locationLabel")}
                  placeholder={ad("locationPlaceholder")}
                  defaultValue=""
                  options={[
                    { value: "nagyboldogasszony", label: fm("selectOption1") },
                    { value: "szent-anna", label: fm("selectOption2") },
                  ]}
                />
                <Input
                  label={ad("titleLabel")}
                  help={ad("titleHelp")}
                  wrapperClassName="md:col-span-2"
                />
                <Textarea
                  label={ad("textLabel")}
                  help={ad("textHelp")}
                  wrapperClassName="md:col-span-2"
                />
                <Checkbox label={ad("pdfLabel")} />
                <TimeInput label={fm("timeLabel")} defaultValue="18:00" />
              </div>
              <Alert tone="warning" title={ad("alertTitle")}>
                {ad("alertBody")}
              </Alert>
              <Tabs
                label={ad("tabsLabel")}
                tabs={[
                  { value: "1", label: ad("tab1"), content: <p>{ad("panel1")}</p> },
                  { value: "2", label: ad("tab2"), content: <p>{ad("panel2")}</p> },
                ]}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary">{ad("publish")}</Button>
                <Button variant="secondary">{ad("save")}</Button>
                <Dialog
                  trigger={<Button variant="danger">{ad("delete")}</Button>}
                  title={tb("dialogTitle")}
                  description={tb("dialogDescription")}
                  closeLabel={common("closeDialog")}
                  footer={
                    <>
                      <DialogClose asChild>
                        <Button variant="secondary">{tb("cancel")}</Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button variant="danger">{tb("confirm")}</Button>
                      </DialogClose>
                    </>
                  }
                />
              </div>
            </AdminScope>
          </Block>
        </div>

        <div className="mx-auto w-full max-w-(--content-max) px-(--gutter)">
          <Block id="formatting" title={fmt("title")} lead={fmt("lead")}>
            <div className="grid grid-cols-1 gap-10">
              <dl
                data-testid="showcase-formatting"
                className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-[14rem_minmax(0,1fr)]"
              >
                {(
                  [
                    ["dateLong", <FormattedDate key="a" value="2026-11-12" />],
                    ["dateShort", <FormattedDate key="a" value="2026-11-12" format="short" />],
                    [
                      "dateMonthDay",
                      <FormattedDate key="a" value="2026-11-15" format="monthDay" />,
                    ],
                    ["dateWeek", <FormattedDate key="a" value="2026-11-12" format="weekRange" />],
                    [
                      "dateRelative",
                      <FormattedDate key="a" value="2026-11-13" format="relative" now={DEMO_NOW} />,
                    ],
                    ["time", <FormattedTime key="a" value="18:00" />],
                    ["timeSpoken", <FormattedTime key="a" value="18:30" style="spoken" />],
                    ["timeRange", <FormattedTime key="a" value="18:00" end="19:30" />],
                    [
                      "personName",
                      <PersonName
                        key="a"
                        name={{
                          prefix: "dr.",
                          familyName: fmt("demoFamilyName"),
                          givenName: fmt("demoGivenName"),
                        }}
                      />,
                    ],
                    ["address", <Address key="a" address={DEMO_ADDRESS} />],
                    ["phone", <Phone key="a" value={DEMO_PHONE} link />],
                    ["bankAccount", <BankAccount key="a" value={DEMO_ACCOUNT} />],
                    ["iban", <BankAccount key="a" value={DEMO_ACCOUNT} format="iban" />],
                  ] as const
                ).map(([key, node]) => (
                  <Fragment key={key}>
                    <dt className="font-semibold text-muted">{fmt(key)}</dt>
                    <dd>{node}</dd>
                  </Fragment>
                ))}
              </dl>

              <div>
                <Label>{fmt("termsHeading")}</Label>
                <p className="mb-4 max-w-[68ch] text-fs-3 text-muted">{fmt("termsLead")}</p>
                <ul data-testid="showcase-terms" className="grid gap-4 md:grid-cols-3">
                  {TRADITIONS.map(([denomination, labelKey]) => {
                    const terms = termsForDenomination(denomination);
                    return (
                      <li key={denomination}>
                        <Card title={fmt(labelKey)} headingLevel={4}>
                          <dl className="grid gap-1">
                            {(
                              [
                                ["termsColumnService", "service"],
                                ["termsColumnSchedule", "serviceSchedule"],
                                ["termsColumnLead", "leadClergy"],
                                ["termsColumnCommunity", "community"],
                              ] as const
                            ).map(([labelKey, termKey]) => (
                              <Fragment key={termKey}>
                                <dt className="text-fs-2 text-muted">{fmt(labelKey)}</dt>
                                <dd className="font-semibold">{terms.term(termKey).nom}</dd>
                              </Fragment>
                            ))}
                          </dl>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <Label>{fmt("termsLive")}</Label>
                <ul data-testid="showcase-terms-live" className="grid gap-1 text-fs-3">
                  <li>{home("nextServices")}</li>
                  <li>{home("welcome")}</li>
                </ul>
              </div>
            </div>
          </Block>

          <Block id="footer" title={f("title")} lead={f("lead")} />
        </div>
      </PageShell>
    </div>
  );
}
