/** Platform-level demo data: plan catalog, hymnal catalog, preset templates, the diocese and its deal. */
import type {
  Deal,
  Denomination,
  Entitlements,
  ModuleKey,
  Organization,
  Plan,
  PlanTemplate,
  Tenant,
  User,
  WorkspaceModuleKey,
} from "@churchy/contracts";
import { publicHolidays } from "@churchy/calendar";
import { emptyDataset, type MockDataset } from "../dataset";
import type { Clock } from "./clock";
import { HYMNAL_CATALOG } from "./hymnals";

export const ORG_ID = "org-dunavolgyi";
export const DEAL_ID = "deal-dunavolgyi";
const ORG_BILLING_ID = "ba-org-dunavolgyi";

const CORE_MODULES: ModuleKey[] = [
  "news",
  "announcements",
  "events",
  "schedule",
  "locations",
  "staff",
  "rites",
  "search",
];
const ALL_MODULES: ModuleKey[] = [
  ...CORE_MODULES,
  "groups",
  "sermons",
  "livestream",
  "gallery",
  "documents",
  "giving",
  "onlineGiving",
  "newsletter",
  "liturgicalCalendar",
  "massIntentions",
  "funeralNotices",
];
const WS_S50: WorkspaceModuleKey[] = [
  "ws.calendar",
  "ws.rooms",
  "ws.worship",
  "ws.rota",
  "ws.hr",
  "ws.hr.leave",
];
const WS_M150: WorkspaceModuleKey[] = [...WS_S50, "ws.hr.confidential", "ws.docs"];
const WS_L300: WorkspaceModuleKey[] = [...WS_M150, "ws.board"];

function ent(partial: Partial<Entitlements>): Entitlements {
  return {
    customDomain: false,
    storageGb: 0,
    maxEditors: null,
    modules: [],
    footerCredit: false,
    workspaceAllowed: false,
    wsTier: "none",
    wsModules: [],
    maxWorkspaceUsers: null,
    ...partial,
  };
}

/** Plan catalog (SDD §19.1). Prices are illustrative demo values in whole HUF. */
export const PLANS: Plan[] = [
  {
    key: "ingyenes",
    name: "Ingyenes",
    kind: "website",
    priceMonthly: 0,
    priceYearly: 0,
    entitlements: ent({ storageGb: 1, maxEditors: 3, modules: CORE_MODULES, footerCredit: true }),
  },
  {
    key: "teljes",
    name: "Teljes",
    kind: "website",
    priceMonthly: 4_990,
    priceYearly: 49_900,
    entitlements: ent({
      customDomain: true,
      storageGb: 20,
      maxEditors: null,
      modules: ALL_MODULES,
      workspaceAllowed: true,
    }),
  },
  {
    key: "ws_s50",
    name: "Munkatér S (50 felhasználó)",
    kind: "workspace",
    priceMonthly: 9_900,
    priceYearly: 99_000,
    entitlements: ent({
      workspaceAllowed: true,
      wsTier: "s50",
      wsModules: WS_S50,
      maxWorkspaceUsers: 50,
    }),
  },
  {
    key: "ws_m150",
    name: "Munkatér M (150 felhasználó)",
    kind: "workspace",
    priceMonthly: 19_900,
    priceYearly: 199_000,
    entitlements: ent({
      workspaceAllowed: true,
      wsTier: "m150",
      wsModules: WS_M150,
      maxWorkspaceUsers: 150,
    }),
  },
  {
    key: "ws_l300",
    name: "Munkatér L (300 felhasználó)",
    kind: "workspace",
    priceMonthly: 34_900,
    priceYearly: 349_000,
    entitlements: ent({
      workspaceAllowed: true,
      wsTier: "l300",
      wsModules: WS_L300,
      maxWorkspaceUsers: 300,
    }),
  },
];

const tplItem = (
  type: PlanTemplate["items"][number]["type"],
  title: string,
  durationS: number | null = null,
) => ({
  type,
  title,
  songId: null,
  arrangementId: null,
  keyOverride: null,
  verses: null,
  durationS,
  responsiblePersonId: null,
  notes: null,
});

function presetTemplate(
  id: string,
  denomination: Denomination,
  serviceType: string,
  name: string,
  items: [PlanTemplate["items"][number]["type"], string][],
): PlanTemplate {
  return {
    id,
    tenantId: null,
    denomination,
    serviceType,
    name,
    items: items.map(([t, title]) => tplItem(t, title)),
  };
}

/** Platform preset plan templates (tenantId = null), one per demo denomination. */
export const PRESET_TEMPLATES: PlanTemplate[] = [
  presetTemplate("tpl-preset-rk-vasarnap", "rk", "szentmise", "Vasárnapi szentmise — énekrend", [
    ["song", "Bevonulási ének"],
    ["liturgy", "Kyrie"],
    ["reading", "Olvasmány"],
    ["song", "Válaszos zsoltár"],
    ["reading", "Evangélium"],
    ["sermon", "Homília"],
    ["song", "Offertóriumi ének"],
    ["song", "Áldozási ének"],
    ["song", "Záróének"],
  ]),
  presetTemplate(
    "tpl-preset-ref-vasarnap",
    "ref",
    "istentisztelet",
    "Vasárnapi istentisztelet — énekrend",
    [
      ["song", "Nyitóének"],
      ["prayer", "Fohász és köszöntés"],
      ["song", "Zsoltár"],
      ["reading", "Igeolvasás"],
      ["song", "Igehirdetés előtti ének"],
      ["sermon", "Igehirdetés"],
      ["prayer", "Közbenjáró imádság"],
      ["song", "Záróének"],
    ],
  ),
  presetTemplate(
    "tpl-preset-bapt-vasarnap",
    "bapt",
    "istentisztelet",
    "Vasárnapi istentisztelet — dicsőítési terv",
    [
      ["song", "Dicsőítő blokk 1"],
      ["song", "Dicsőítő blokk 2"],
      ["prayer", "Imádság"],
      ["reading", "Igeolvasás"],
      ["sermon", "Igehirdetés"],
      ["song", "Válaszének"],
      ["announcement", "Közlemények"],
      ["song", "Zárás"],
    ],
  ),
];

export interface OrgBuild {
  ds: MockDataset;
  /** persona → org user id */
  personas: Record<string, string>;
}

/**
 * The demo diocese: organization, diocesan HR users, links and delegations to the Catholic
 * parish, a bulk deal and two placeholder parishes covered by it (SDD §19.3, §25.7).
 */
export function buildPlatformAndDiocese(
  c: Clock,
  rk: {
    tenantId: string;
    tulajdonosUserId: string;
    vezetoUserId: string;
    delegatedCategoryKeys: string[];
  },
  emails: Set<string>,
): OrgBuild {
  const ds = emptyDataset();
  const year = Number(c.today.slice(0, 4));

  ds.plans.push(...PLANS);
  ds.hymnals.push(...HYMNAL_CATALOG);
  ds.planTemplates.push(...PRESET_TEMPLATES);

  // Hungarian public holidays for the workday calendar (L-12). Computed by packages/calendar.
  for (const y of [year - 1, year, year + 1]) {
    for (const h of publicHolidays(y)) {
      ds.workdayCalendar.push({ date: h.date, kind: "holiday", name: h.name });
    }
  }

  const org: Organization = {
    id: ORG_ID,
    kind: "egyhazmegye",
    name: "Dunavölgyi Egyházmegye",
    slug: "dunavolgyi",
    denomination: "rk",
    settings: { hrPortal: true, kozpontiEmail: "hr@pelda.hu" },
    createdAt: c.ago(130, "09:00"),
    updatedAt: c.ago(12, "09:00"),
  };
  ds.organizations.push(org);

  const orgUsers: [string, string, string, number][] = [
    ["u-org-hr", "Bálint Margit", "balint.margit.hr", 1],
    ["u-org-ugyintezo", "Fekete Gergely", "fekete.gergely.hr", 2],
    ["u-org-bizalmas", "Antal Zsuzsanna", "antal.zsuzsanna.hr", 4],
  ];
  for (const [id, name, local, last] of orgUsers) {
    const email = `${local}@pelda.hu`;
    emails.add(email);
    const user: User = {
      id,
      email,
      name,
      twoFactorEnabled: true,
      lastLoginAt: c.ago(last, "08:40"),
    };
    ds.users.push(user);
  }
  ds.orgMemberships.push(
    {
      orgId: ORG_ID,
      userId: "u-org-hr",
      roles: ["orgHrAdmin", "orgHrHandler"],
      categoryScopes: null,
      parishScopes: null,
    },
    {
      orgId: ORG_ID,
      userId: "u-org-ugyintezo",
      roles: ["orgHrHandler"],
      categoryScopes: rk.delegatedCategoryKeys.filter((k) => k !== "bizalmas-bejelentes"),
      parishScopes: null,
    },
    {
      orgId: ORG_ID,
      userId: "u-org-bizalmas",
      roles: ["orgConfidentialHandler"],
      categoryScopes: ["bizalmas-bejelentes"],
      parishScopes: [rk.tenantId],
    },
  );

  // Placeholder parishes: minimal tenants covered by the bulk deal.
  const placeholders: [string, string, string, number | null][] = [
    ["t-alsoliget", "alsoliget", "Alsóligeti Plébánia", 20],
    ["t-felsoliget", "felsoliget", "Felsőligeti Plébánia", null],
  ];
  for (const [id, slug, name, launched] of placeholders) {
    const tenant: Tenant = {
      id,
      slug,
      name,
      denomination: "rk",
      status: "active",
      siteConfig: {
        identity: { name, shortName: name.replace(" Plébánia", "") },
        denomination: "rk",
      },
      planKey: "teljes",
      wsTier: "none",
      organizationId: ORG_ID,
      launchedAt: launched === null ? null : c.ago(launched, "10:00"),
      createdAt: c.ago(40, "09:00"),
      updatedAt: c.ago(launched ?? 9, "09:00"),
    };
    ds.tenants.push(tenant);
  }

  // Links and delegations.
  ds.orgLinks.push(
    {
      id: "olink-szenttivadar",
      orgId: ORG_ID,
      tenantId: rk.tenantId,
      status: "active",
      requestedBy: "u-org-hr",
      approvedByParish: rk.tulajdonosUserId,
      approvedByOrg: "u-org-hr",
      linkedAt: c.ago(70, "11:00"),
      revokedAt: null,
    },
    {
      id: "olink-alsoliget",
      orgId: ORG_ID,
      tenantId: "t-alsoliget",
      status: "requested",
      requestedBy: "u-org-hr",
      approvedByParish: null,
      approvedByOrg: "u-org-hr",
      linkedAt: null,
      revokedAt: null,
    },
  );
  for (const key of rk.delegatedCategoryKeys) {
    ds.orgDelegations.push({ orgId: ORG_ID, tenantId: rk.tenantId, hrCategoryKey: key });
  }

  // Bulk deal and billing under the organization's account.
  const deal: Deal = {
    id: DEAL_ID,
    organizationId: ORG_ID,
    planKeys: ["teljes", "ws_m150"],
    parishLimit: 25,
    priceTerms: {
      monthlyPerParish: 2_990,
      yearlyPerParish: 29_900,
      note: "Egyházmegyei keretszerződés — bemutató adat, nem valós ár.",
    },
    validFrom: `${year}-01-01`,
    validTo: `${year + 1}-12-31`,
  };
  ds.deals.push(deal);
  ds.billingAccounts.push({
    id: ORG_BILLING_ID,
    ownerType: "organization",
    ownerId: ORG_ID,
    name: "Dunavölgyi Egyházmegye Gazdasági Hivatala",
    taxNumber: "99999999-2-13",
    address: { postalCode: "2999", city: "Dunaliget", line1: "Püspökkert utca 4.", line2: null },
    email: "gazdasagi@pelda.hu",
    paymentMethod: "transfer",
  });
  const periodEnd = c.at(c.day(150), "00:00");
  const sub = (id: string, planKey: "teljes" | "ws_m150", tenantId: string) => ({
    id,
    billingAccountId: ORG_BILLING_ID,
    planKey,
    tenantId,
    quantity: 1,
    period: "yearly" as const,
    status: "active" as const,
    currentPeriodEnd: periodEnd,
    dealId: DEAL_ID,
  });
  ds.subscriptions.push(
    sub("sub-org-szenttivadar", "teljes", rk.tenantId),
    sub("sub-org-szenttivadar-ws", "ws_m150", rk.tenantId),
    sub("sub-org-alsoliget", "teljes", "t-alsoliget"),
    sub("sub-org-felsoliget", "teljes", "t-felsoliget"),
  );
  ds.invoices.push(
    {
      id: "inv-org-1",
      billingAccountId: ORG_BILLING_ID,
      providerInvoiceId: "PE-org-0001",
      number: `CH-${year}-0002`,
      amount: 29_900 * 3 + 199_000,
      currency: "HUF",
      status: "paid",
      issuedAt: c.ago(120, "08:00"),
      paidAt: c.ago(110, "10:00"),
      pdfUrl: null,
    },
    {
      id: "inv-org-2",
      billingAccountId: ORG_BILLING_ID,
      providerInvoiceId: null,
      number: `CH-${year}-0018`,
      amount: 29_900,
      currency: "HUF",
      status: "proforma",
      issuedAt: c.ago(5, "08:00"),
      paidAt: null,
      pdfUrl: null,
    },
  );

  return {
    ds,
    personas: {
      egyhazmegyeiHr: "u-org-hr",
      orgUgyintezo: "u-org-ugyintezo",
      orgBizalmas: "u-org-bizalmas",
    },
  };
}
