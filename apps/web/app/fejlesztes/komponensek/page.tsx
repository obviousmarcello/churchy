import { Fragment, type CSSProperties, type ReactNode } from "react";
import {
  RADIUS_STEPS,
  THEME_IDS,
  isHexColor,
  resolveThemeConfig,
  themeAttributes,
  type RadiusStep,
  type ThemeId,
} from "@churchy/themes";
import {
  AdminScope,
  Address,
  Alert,
  Avatar,
  Badge,
  BankAccount,
  Breadcrumbs,
  Button,
  ButtonLink,
  CalendarIcon,
  Card,
  Checkbox,
  Chip,
  CopyIcon,
  DashboardIcon,
  DataTable,
  DateInput,
  Dialog,
  DialogClose,
  Disclosure,
  DoorIcon,
  DownloadIcon,
  EditIcon,
  EmptyState,
  EyeIcon,
  FilterIcon,
  Fieldset,
  Footer,
  FooterLink,
  FormActions,
  FormattedDate,
  FormattedTime,
  Header,
  Hero,
  ICONS,
  Icon,
  IconButton,
  IconTile,
  InboxIcon,
  Input,
  LoadingRegion,
  MegaphoneIcon,
  MenuItem,
  MoreIcon,
  MusicIcon,
  NavTabs,
  PageHeader,
  PageShell,
  PersonName,
  Phone,
  PlusIcon,
  Popover,
  Progress,
  Radio,
  SectionHeading,
  SegmentedControl,
  Select,
  SideNav,
  Skeleton,
  StatusPill,
  Tabs,
  Textarea,
  TimeInput,
  TrashIcon,
  UsersIcon,
  type DataTableColumn,
  type HeroImage,
  type IconName,
  type StatusTone,
} from "@churchy/ui";
import { getT } from "@/i18n/server";
import { assertDevRoutesVisible } from "@/lib/dev-routes";
import { termsForDenomination } from "@/i18n/terms";
import { MotionDemo } from "./motion-demo";
import { SaveDemo } from "./save-demo";
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
  return <h3 className="mb-3 font-body text-fs-2 font-semibold text-muted">{children}</h3>;
}

// Fictitious requests for the table demo (CLAUDE.md rule 4).
interface DemoRequest {
  id: string;
  nameKey: "row1Name" | "row2Name" | "row3Name";
  typeKey: "typeBaptism" | "typeWedding" | "typeFuneral";
  date: string;
  status: StatusTone;
  statusKey: "statusPending" | "statusInfo" | "statusSuccess";
}
const DEMO_REQUESTS: DemoRequest[] = [
  {
    id: "KER-2026-0012",
    nameKey: "row1Name",
    typeKey: "typeBaptism",
    date: "2026-11-12",
    status: "pending",
    statusKey: "statusPending",
  },
  {
    id: "KER-2026-0011",
    nameKey: "row2Name",
    typeKey: "typeWedding",
    date: "2026-11-09",
    status: "info",
    statusKey: "statusInfo",
  },
  {
    id: "KER-2026-0009",
    nameKey: "row3Name",
    typeKey: "typeFuneral",
    date: "2026-11-02",
    status: "success",
    statusKey: "statusSuccess",
  },
];

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
  "--c-divider",
  "--c-border-strong",
  "--c-selected",
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
  "icons",
  "navigation",
  "header",
  "hero",
  "cards",
  "buttons",
  "forms",
  "feedback",
  "table",
  "states",
  "tabs",
  "primitives",
  "motion",
  "admin",
  "formatting",
  "footer",
] as const;

const spacingSteps = Array.from({ length: 12 }, (_, i) => i + 1);
const typeSteps = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const typeRoles = ["page-title", "section-title", "card-title", "body", "caption"] as const;

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
  const themeParam = first(params.theme);
  const themeId = THEME_IDS.includes(themeParam as ThemeId) ? (themeParam as ThemeId) : undefined;
  const theme = resolveThemeConfig({
    ...(themeId ? { themeId } : {}),
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
  const ic = await getT("dev.showcase.icons");
  const nv = await getT("dev.showcase.navigation");
  const tbl = await getT("dev.showcase.table");
  const st = await getT("dev.showcase.states");
  const pr = await getT("dev.showcase.primitives");
  const mo = await getT("dev.showcase.motion");

  const requestColumns: DataTableColumn<DemoRequest>[] = [
    { key: "name", header: tbl("colName"), cell: (r) => tbl(r.nameKey), primary: true },
    { key: "type", header: tbl("colType"), cell: (r) => tbl(r.typeKey) },
    {
      key: "date",
      header: tbl("colDate"),
      cell: (r) => <FormattedDate value={r.date} format="short" />,
      nowrap: true,
    },
    {
      key: "status",
      header: tbl("colStatus"),
      cell: (r) => <StatusPill status={r.status}>{fb(r.statusKey)}</StatusPill>,
    },
    {
      key: "ref",
      header: tbl("colRef"),
      cell: (r) => <code className="text-fs-2">{r.id}</code>,
      nowrap: true,
      hideBelow: "lg",
    },
  ];

  return (
    <div id={SCOPE_ID} {...scopeAttrs} style={style as CSSProperties} className="bg-surface">
      <PageShell skipLinkLabel={common("skipToContent")} footer={footer}>
        <div className="mx-auto w-full max-w-(--content-max) px-(--gutter)">
          <header className="py-10 lg:py-14">
            <h1 className="font-heading text-page-title [font-weight:var(--fw-heading)] text-primary">
              {t("title")}
            </h1>
            <p className="mt-3 max-w-[68ch] text-fs-4 text-muted">{t("lead")}</p>
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
            <nav aria-label={t("theme.themeLabel")} className="mb-6">
              <ul className="flex flex-wrap gap-2" data-testid="showcase-theme-switch">
                {(
                  [
                    ["klasszikus", t("theme.themeKlasszikus")],
                    ["letisztult", t("theme.themeLetisztult")],
                    ["kozossegi", t("theme.themeKozossegi")],
                  ] as const
                ).map(([id, label]) => (
                  <li key={id}>
                    <Chip href={`?theme=${id}#theme`} current={theme.themeId === id}>
                      {label}
                    </Chip>
                  </li>
                ))}
              </ul>
            </nav>
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
                <ul className="mb-6 grid gap-2" data-testid="showcase-type-roles">
                  {typeRoles.map((role) => (
                    <li key={role} className="flex items-baseline gap-4">
                      <code className="w-36 shrink-0 text-fs-1 text-muted">text-{role}</code>
                      <span
                        className="leading-tight"
                        style={{
                          fontSize: `var(--fs-${role})`,
                          fontFamily: role.endsWith("title") ? "var(--font-heading)" : undefined,
                          fontWeight: role.endsWith("title") ? "var(--fw-heading)" : undefined,
                        }}
                      >
                        {tk("typeSample")}
                      </span>
                    </li>
                  ))}
                </ul>
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
                    ["rounded-xl", tk("radiusXl")],
                  ].map(([cls, label]) => (
                    <li key={cls} className="grid justify-items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`size-20 border-2 border-primary bg-surface-raised ${cls}`}
                      />
                      <span className="text-fs-2 text-muted">{label}</span>
                    </li>
                  ))}
                  {(["shadow-xs", "shadow-card", "shadow-raised", "shadow-overlay"] as const).map(
                    (cls) => (
                      <li key={cls} className="grid justify-items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={`size-20 rounded-md bg-surface-raised ${cls}`}
                        />
                        <code className="text-fs-1 text-muted">{cls}</code>
                      </li>
                    ),
                  )}
                </ul>
              </div>
              <div>
                <Label>{tk("semanticRadii")}</Label>
                <ul className="flex flex-wrap gap-6" data-testid="showcase-radii">
                  {(
                    [
                      ["rounded-control", "radiusControl"],
                      ["rounded-button", "radiusButton"],
                      ["rounded-card", "radiusCard"],
                      ["rounded-overlay", "radiusOverlay"],
                      ["rounded-tile", "radiusTile"],
                    ] as const
                  ).map(([cls, key]) => (
                    <li key={cls} className="grid justify-items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`h-16 w-24 bg-primary-soft shadow-xs ${cls}`}
                      />
                      <code className="text-fs-1 text-muted">{cls}</code>
                      <span className="text-fs-2 text-muted">{tk(key)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <Label>{tk("surfaces")}</Label>
                <ul className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ["bg-surface-app", "surfaceApp"],
                      ["bg-surface-tint", "surfaceTint"],
                      ["bg-surface-glass", "surfaceGlass"],
                    ] as const
                  ).map(([cls, key]) => (
                    <li
                      key={cls}
                      className={`grid min-h-24 content-end gap-1 rounded-card p-4 shadow-xs ${cls}`}
                    >
                      <code className="text-fs-1 text-muted">{cls}</code>
                      <span className="text-fs-2 text-text">{tk(key)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <Label>{tk("motion")}</Label>
                <p className="mb-4 text-fs-2 text-muted">{tk("hoverHint")}</p>
                <ul className="grid gap-3" data-testid="showcase-motion-tokens">
                  {(
                    [
                      ["--dur-1", "120 ms", "durationFast", "--ease-standard", "easeStandard"],
                      ["--dur-2", "200 ms", "durationBase", "--ease-spring", "easeSpring"],
                      ["--dur-3", "320 ms", "durationSlow", "--ease-emphasized", "easeEmphasized"],
                      ["--dur-4", "480 ms", "durationSlower", "--ease-exit", "easeExit"],
                    ] as const
                  ).map(([dur, ms, durKey, ease, easeKey]) => (
                    <li
                      key={dur}
                      tabIndex={0}
                      className="group/motion grid gap-2 rounded-card bg-surface-tint p-4 sm:grid-cols-[16rem_minmax(0,1fr)] sm:items-center"
                    >
                      <div className="grid text-fs-2">
                        <code className="text-text">
                          {dur} · {ms}
                        </code>
                        <span className="text-muted">{tk(durKey)}</span>
                        <code className="text-text">{ease}</code>
                        <span className="text-muted">{tk(easeKey)}</span>
                      </div>
                      <div className="relative h-10 rounded-full bg-surface-raised">
                        <span
                          aria-hidden="true"
                          style={{
                            transitionDuration: `var(${dur})`,
                            transitionTimingFunction: `var(${ease})`,
                          }}
                          className="absolute top-1 left-1 size-8 rounded-full bg-primary transition-[left] group-hover/motion:left-[calc(100%-2.25rem)] group-focus-visible/motion:left-[calc(100%-2.25rem)]"
                        />
                      </div>
                    </li>
                  ))}
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

          <Block id="icons" title={ic("title")} lead={ic("lead")}>
            <ul
              data-testid="showcase-icons"
              className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-6"
            >
              {(Object.keys(ICONS) as IconName[]).map((name) => (
                <li
                  key={name}
                  className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-surface-raised px-3 py-2.5"
                >
                  <Icon name={name} className="shrink-0 text-primary" />
                  <code className="truncate text-fs-1 text-muted">{name}</code>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <Label>{ic("sizes")}</Label>
              <div className="flex items-end gap-5 text-text">
                {(["xs", "sm", "md", "lg"] as const).map((size) => (
                  <span key={size} className="grid justify-items-center gap-1">
                    <CalendarIcon size={size} />
                    <code className="text-fs-1 text-muted">{size}</code>
                  </span>
                ))}
              </div>
            </div>
          </Block>

          <Block id="navigation" title={nv("title")} lead={nv("lead")}>
            <AdminScope
              data-testid="showcase-page-header"
              className="rounded-lg border border-border p-5 sm:p-6"
            >
              <PageHeader
                className="mb-0"
                breadcrumbs={
                  <Breadcrumbs
                    label={nv("breadcrumbsLabel")}
                    items={[
                      { label: nv("crumbAdmin"), href: "#navigation" },
                      { label: nv("crumbNews"), href: "#navigation" },
                      { label: nv("pageTitle") },
                    ]}
                  />
                }
                title={nv("pageTitle")}
                description={nv("pageDescription")}
                meta={
                  <>
                    <StatusPill status="warning">{nv("statusDraft")}</StatusPill>
                    <span className="text-fs-2 text-muted">{nv("lastSaved")}</span>
                  </>
                }
                actions={
                  <>
                    <Button variant="secondary" iconStart={<EyeIcon />}>
                      {nv("preview")}
                    </Button>
                    <Button>{nv("publish")}</Button>
                  </>
                }
                tabs={
                  <NavTabs
                    label={nv("tabsLabel")}
                    items={[
                      { label: nv("tabContent"), href: "#navigation", current: true },
                      { label: nv("tabMedia"), href: "#navigation", count: 4 },
                      { label: nv("tabComments"), href: "#navigation", count: 2 },
                    ]}
                  />
                }
              />
            </AdminScope>
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
              <div>
                <Label>{cd("variants")}</Label>
                <div
                  data-testid="showcase-card-variants"
                  className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                >
                  <Card title={cd("flatTitle")} headingLevel={4}>
                    <p>{cd("flatBody")}</p>
                  </Card>
                  <Card title={cd("raisedTitle")} headingLevel={4} variant="raised">
                    <p>{cd("raisedBody")}</p>
                  </Card>
                  <Card
                    title={cd("interactiveTitle")}
                    headingLevel={4}
                    href="#cards"
                    icon={<DoorIcon />}
                  >
                    <p>{cd("interactiveBody")}</p>
                  </Card>
                  <Card
                    title={cd("iconTitle")}
                    headingLevel={4}
                    icon={<MusicIcon />}
                    actions={<IconButton label={cd("cardActions")} icon={<MoreIcon />} size="sm" />}
                  >
                    <p>{cd("iconBody")}</p>
                  </Card>
                </div>
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
                  <Button variant="outline">{bt("outline")}</Button>
                  <Button variant="ghost">{bt("ghost")}</Button>
                  <Button variant="destructive">{bt("danger")}</Button>
                </div>
              </div>
              <div>
                <Label>{bt("icons")}</Label>
                <div
                  data-testid="showcase-icon-buttons"
                  className="flex flex-wrap items-center gap-3"
                >
                  <Button iconStart={<PlusIcon />}>{bt("withIcon")}</Button>
                  <Button variant="secondary" iconStart={<DownloadIcon />}>
                    {bt("download")}
                  </Button>
                  <IconButton label={bt("iconEdit")} icon={<EditIcon />} />
                  <IconButton label={bt("iconCopy")} icon={<CopyIcon />} variant="secondary" />
                  <IconButton label={bt("iconMore")} icon={<MoreIcon />} variant="outline" />
                  <IconButton label={bt("iconDelete")} icon={<TrashIcon />} variant="destructive" />
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
                  <Button loading>{bt("loading")}</Button>
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
              <FormActions className="md:col-span-2">
                <Button>{bt("primary")}</Button>
                <Button variant="secondary">{bt("secondary")}</Button>
                <Button variant="ghost">{bt("ghost")}</Button>
              </FormActions>
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
              <div>
                <Label>{fb("statusHeading")}</Label>
                <ul data-testid="showcase-status" className="flex flex-wrap gap-3">
                  {(
                    [
                      ["pending", "statusPending"],
                      ["info", "statusInfo"],
                      ["success", "statusSuccess"],
                      ["warning", "statusWarning"],
                      ["danger", "statusDanger"],
                      ["neutral", "statusNeutral"],
                    ] as const
                  ).map(([status, key]) => (
                    <li key={status}>
                      <StatusPill status={status}>{fb(key)}</StatusPill>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <Label>{fb("confirmHeading")}</Label>
                <p className="mb-4 max-w-[68ch] text-fs-3 text-muted">{fb("confirmLead")}</p>
                <SaveDemo
                  labels={{
                    toastRegion: fb("toastRegion"),
                    toastClose: fb("toastClose"),
                    toastSaved: fb("toastSaved"),
                    toastSavedBody: fb("toastSavedBody"),
                    saveInline: fb("saveInline"),
                    saveToast: fb("saveToast"),
                    saving: fb("saving"),
                    saved: fb("saved"),
                    saveError: fb("saveError"),
                  }}
                />
              </div>
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

          <Block id="table" title={tbl("title")} lead={tbl("lead")}>
            <div className="grid gap-8">
              <DataTable
                data-testid="showcase-table"
                caption={tbl("caption")}
                captionVisible
                columns={requestColumns}
                rows={DEMO_REQUESTS}
                rowKey={(r) => r.id}
                actionsHeader={tbl("actions")}
                rowActions={(r) => (
                  <>
                    <IconButton
                      size="sm"
                      label={`${tbl("open")}: ${tbl(r.nameKey)}`}
                      icon={<EyeIcon />}
                    />
                    <IconButton
                      size="sm"
                      label={`${tbl("more")}: ${tbl(r.nameKey)}`}
                      icon={<MoreIcon />}
                    />
                  </>
                )}
                rowProps={(r) => ({ selected: r.status === "pending" })}
              />
              <DataTable
                data-testid="showcase-table-empty"
                caption={tbl("emptyCaption")}
                captionVisible
                columns={requestColumns}
                rows={[]}
                rowKey={(r) => r.id}
                empty={
                  <EmptyState
                    size="sm"
                    icon={<CalendarIcon />}
                    title={tbl("emptyTitle")}
                    description={tbl("emptyBody")}
                    action={
                      <Button variant="secondary" size="sm" iconStart={<PlusIcon />}>
                        {tbl("emptyAction")}
                      </Button>
                    }
                  />
                }
              />
            </div>
          </Block>

          <Block id="states" title={st("title")} lead={st("lead")}>
            <div className="grid gap-6 md:grid-cols-2">
              <EmptyState
                data-testid="showcase-empty"
                icon={<InboxIcon />}
                title={st("emptyTitle")}
                description={st("emptyBody")}
                action={<Button iconStart={<PlusIcon />}>{st("emptyAction")}</Button>}
              />
              <LoadingRegion label={st("loading")} className="grid content-start gap-4">
                <div className="flex items-center gap-3">
                  <Skeleton shape="circle" />
                  <Skeleton className="w-40" />
                </div>
                <Skeleton shape="rect" className="h-28" />
                <Skeleton lines={3} />
              </LoadingRegion>
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

          <Block id="primitives" title={pr("title")} lead={pr("lead")}>
            <div className="grid gap-10" data-testid="showcase-primitives">
              <div className="grid gap-8 md:grid-cols-2">
                <div>
                  <Label>{pr("iconTiles")}</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <IconTile icon={<CalendarIcon />} size="sm" />
                    <IconTile icon={<CalendarIcon />} />
                    <IconTile icon={<CalendarIcon />} size="lg" />
                    <IconTile icon={<MusicIcon />} tone="accent" />
                    <IconTile icon={<UsersIcon />} tone="success" />
                    <IconTile icon={<MegaphoneIcon />} tone="info" />
                    <IconTile icon={<DoorIcon />} tone="neutral" />
                  </div>
                </div>
                <div>
                  <Label>{pr("avatars")}</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar label={pr("avatarLabel")} initials={pr("avatarInitials")} size="sm" />
                    <Avatar label={pr("avatarLabel")} initials={pr("avatarInitials")} />
                    <Avatar label={pr("avatarLabel2")} initials={pr("avatarInitials2")} size="lg" />
                    <Avatar
                      label={pr("avatarLabel2")}
                      initials={pr("avatarInitials2")}
                      shape="circle"
                    />
                  </div>
                </div>
                <div>
                  <Label>{pr("chips")}</Label>
                  <ul className="flex flex-wrap gap-2">
                    <li>
                      <Chip href="#primitives" current>
                        {pr("chipAll")}
                      </Chip>
                    </li>
                    <li>
                      <Chip href="#primitives" icon={<CalendarIcon />}>
                        {pr("chipLiturgy")}
                      </Chip>
                    </li>
                    <li>
                      <Chip href="#primitives" icon={<UsersIcon />}>
                        {pr("chipYouth")}
                      </Chip>
                    </li>
                    <li>
                      <Chip href="#primitives" icon={<MusicIcon />}>
                        {pr("chipMusic")}
                      </Chip>
                    </li>
                  </ul>
                </div>
                <div>
                  <Label>{pr("segmented")}</Label>
                  <SegmentedControl
                    label={pr("segmentedLabel")}
                    name="showcase-view"
                    defaultValue="week"
                    data-testid="showcase-segmented"
                    options={[
                      { value: "day", label: pr("segmentedDay") },
                      { value: "week", label: pr("segmentedWeek") },
                      { value: "month", label: pr("segmentedMonth") },
                    ]}
                  />
                </div>
                <div>
                  <Label>{pr("progress")}</Label>
                  <div className="grid gap-4">
                    <Progress
                      label={pr("progressLabel")}
                      value={3}
                      max={5}
                      valueText={pr("progressValue")}
                    />
                    <Progress label={pr("progressLoading")} tone="success" />
                  </div>
                </div>
                <div>
                  <Label>{pr("popover")}</Label>
                  <Popover
                    triggerLabel={pr("popoverTrigger")}
                    label={pr("popoverLabel")}
                    data-testid="showcase-popover"
                  >
                    <MenuItem icon={<EditIcon />}>{pr("menuEdit")}</MenuItem>
                    <MenuItem icon={<CopyIcon />}>{pr("menuCopy")}</MenuItem>
                    <MenuItem icon={<DownloadIcon />}>{pr("menuDownload")}</MenuItem>
                    <MenuItem icon={<TrashIcon />} tone="danger">
                      {pr("menuDelete")}
                    </MenuItem>
                  </Popover>
                </div>
              </div>
              <div className="grid gap-8 md:grid-cols-2">
                <div>
                  <Label>{pr("disclosure")}</Label>
                  <div className="grid gap-2">
                    <Disclosure summary={pr("disclosureSummary")} data-testid="showcase-disclosure">
                      <p>{pr("disclosureBody")}</p>
                    </Disclosure>
                    <Disclosure summary={pr("disclosureSummary2")}>
                      <p>{pr("disclosureBody2")}</p>
                    </Disclosure>
                  </div>
                </div>
                <div>
                  <Label>{pr("sideNav")}</Label>
                  <SideNav
                    label={pr("sideNavLabel")}
                    className="max-w-64 rounded-card bg-surface-app p-2"
                    items={[
                      {
                        label: pr("sideToday"),
                        href: "#primitives",
                        icon: <DashboardIcon />,
                        current: true,
                      },
                      { label: pr("sideCalendar"), href: "#primitives", icon: <CalendarIcon /> },
                      { label: pr("sideRooms"), href: "#primitives", icon: <DoorIcon /> },
                      {
                        label: pr("sideRequests"),
                        href: "#primitives",
                        icon: <InboxIcon />,
                        count: 3,
                      },
                    ]}
                  />
                </div>
                <div>
                  <Label>{pr("radios")}</Label>
                  <Fieldset legend={pr("radioLegend")} className="gap-0">
                    <Radio name="showcase-notify" label={pr("radioEmail")} defaultChecked />
                    <Radio name="showcase-notify" label={pr("radioPush")} />
                  </Fieldset>
                </div>
                <div>
                  <Label>{pr("drawer")}</Label>
                  <Dialog
                    placement="end"
                    trigger={
                      <Button variant="outline" iconStart={<FilterIcon />}>
                        {pr("drawerOpen")}
                      </Button>
                    }
                    title={pr("drawerTitle")}
                    description={pr("drawerDescription")}
                    closeLabel={common("closeDialog")}
                    footer={
                      <>
                        <DialogClose asChild>
                          <Button variant="ghost">{pr("drawerCancel")}</Button>
                        </DialogClose>
                        <DialogClose asChild>
                          <Button>{pr("drawerApply")}</Button>
                        </DialogClose>
                      </>
                    }
                  >
                    <SegmentedControl
                      label={pr("segmentedLabel")}
                      labelVisible
                      name="showcase-drawer-view"
                      defaultValue="day"
                      fullWidth
                      options={[
                        { value: "day", label: pr("segmentedDay") },
                        { value: "week", label: pr("segmentedWeek") },
                        { value: "month", label: pr("segmentedMonth") },
                      ]}
                    />
                  </Dialog>
                </div>
              </div>
            </div>
          </Block>

          <Block id="motion" title={mo("title")} lead={mo("lead")}>
            <MotionDemo
              labels={{
                staggerHeading: mo("staggerHeading"),
                staggerLead: mo("staggerLead"),
                replay: mo("replay"),
                card1Title: mo("card1Title"),
                card1Body: mo("card1Body"),
                card2Title: mo("card2Title"),
                card2Body: mo("card2Body"),
                card3Title: mo("card3Title"),
                card3Body: mo("card3Body"),
                numberHeading: mo("numberHeading"),
                counterLabel: mo("counterLabel"),
                add: mo("add"),
                remove: mo("remove"),
                progressLabel: mo("progressLabel"),
                loadingHeading: mo("loadingHeading"),
                loadingLead: mo("loadingLead"),
                save: mo("save"),
                send: mo("send"),
              }}
            />
            <div className="mt-10 rounded-card bg-surface-tint p-5 sm:p-6">
              <h3 className="font-body text-fs-4 font-semibold text-text">{mo("pageHeading")}</h3>
              <p className="mt-1 max-w-[68ch] text-fs-3 text-muted">{mo("pageLead")}</p>
              <ButtonLink href="/" variant="secondary" className="mt-4">
                {mo("pageLink")}
              </ButtonLink>
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
