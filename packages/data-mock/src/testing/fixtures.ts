/**
 * Small, dedicated fixture dataset for the contract suites (NOT the demo seed): two tenants, one
 * diocese, staff actors with a membership and a person in their tenant, an org actor, a platform
 * actor, the platform plan catalog, a few platform hymnals, a preset plan template and some
 * working-day calendar entries. All names and addresses are fictitious.
 */
import type { ContractEnv } from "@churchy/contracts/testing";
import type { Entitlements, Person, Plan, Tenant } from "@churchy/contracts";
import type { MockDataset } from "../dataset";
import { emptyDataset } from "../dataset";
import type { MockStore, MockStoreOptions } from "../store";
import { createMockStore } from "../store";

const STAMP = "2026-01-05T09:00:00+01:00";

export const CONTRACT_ENV: ContractEnv = {
  tenantA: "tenant-a",
  tenantB: "tenant-b",
  orgId: "org-1",
  actorA: { userId: "user-a", personId: "person-a" },
  actorB: { userId: "user-b", personId: "person-b" },
  orgActor: { userId: "user-org", personId: null },
  platformActor: { userId: "user-platform", personId: null },
};

const WEBSITE_MODULES: Entitlements["modules"] = [
  "news",
  "announcements",
  "events",
  "schedule",
  "locations",
  "staff",
  "rites",
];

function plan(
  key: Plan["key"],
  name: string,
  kind: Plan["kind"],
  monthly: number,
  extra: Partial<Entitlements> = {},
): Plan {
  return {
    key,
    name,
    kind,
    priceMonthly: monthly,
    priceYearly: monthly * 10,
    entitlements: {
      customDomain: monthly > 0,
      storageGb: monthly > 0 ? 20 : 1,
      maxEditors: monthly > 0 ? null : 2,
      modules: WEBSITE_MODULES,
      footerCredit: monthly === 0,
      workspaceAllowed: kind === "workspace" || monthly > 0,
      wsTier: "none",
      wsModules: [],
      maxWorkspaceUsers: null,
      ...extra,
    },
  };
}

function tenant(
  id: string,
  slug: string,
  name: string,
  denomination: Tenant["denomination"],
  planKey: string,
): Tenant {
  return {
    id,
    slug,
    name,
    denomination,
    status: "active",
    siteConfig: {},
    planKey,
    wsTier: "none",
    organizationId: null,
    launchedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

function person(
  id: string,
  tenantId: string,
  userId: string,
  familyName: string,
  givenName: string,
): Person {
  return {
    id,
    tenantId,
    userId,
    prefix: null,
    familyName,
    givenName,
    suffix: null,
    roleTitle: "irodavezető",
    staffGroup: "staff",
    isPublic: false,
    bio: null,
    email: null,
    phone: null,
    contactVisibility: { email: "workspace", phone: "workspace" },
    skills: [],
    photoMediaId: null,
    isMinor: false,
    guardianEmail: null,
    active: true,
    sort: 0,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

const membership = (tenantId: string, userId: string) => ({
  tenantId,
  userId,
  role: "owner" as const,
  groupIds: [],
  wsRoles: ["leader" as const],
  teamIds: [],
  roomIds: [],
  hrCategoryIds: [],
  active: true,
  invitedAt: null,
  createdAt: STAMP,
});

/** The contract fixture dataset (a fresh object on every call). */
export function contractDataset(): MockDataset {
  const env = CONTRACT_ENV;
  return {
    ...emptyDataset(),
    tenants: [
      tenant(env.tenantA, "minta-plebania", "Minta Plébánia", "rk", "teljes"),
      tenant(env.tenantB, "proba-gyulekezet", "Próba Református Gyülekezet", "ref", "ingyenes"),
    ],
    users: [
      {
        id: env.actorA.userId,
        email: "a.munkatars@example.test",
        name: "Minta Anna",
        twoFactorEnabled: false,
        lastLoginAt: null,
      },
      {
        id: env.actorB.userId,
        email: "b.munkatars@example.test",
        name: "Próba Béla",
        twoFactorEnabled: false,
        lastLoginAt: null,
      },
      {
        id: env.orgActor.userId,
        email: "hr@egyhazmegye.example.test",
        name: "Teszt Orsolya",
        twoFactorEnabled: true,
        lastLoginAt: null,
      },
      {
        id: env.platformActor.userId,
        email: "uzemelteto@example.test",
        name: "Platform Pál",
        twoFactorEnabled: true,
        lastLoginAt: null,
      },
    ],
    memberships: [
      membership(env.tenantA, env.actorA.userId),
      membership(env.tenantB, env.actorB.userId),
    ],
    people: [
      person(env.actorA.personId, env.tenantA, env.actorA.userId, "Minta", "Anna"),
      person(env.actorB.personId, env.tenantB, env.actorB.userId, "Próba", "Béla"),
    ],
    plans: [
      plan("ingyenes", "Ingyenes", "website", 0),
      plan("teljes", "Teljes", "website", 4900),
      plan("ws_s50", "Munkatér S", "workspace", 9900, { wsTier: "s50", maxWorkspaceUsers: 50 }),
      plan("ws_m150", "Munkatér M", "workspace", 19900, { wsTier: "m150", maxWorkspaceUsers: 150 }),
      plan("ws_l300", "Munkatér L", "workspace", 29900, { wsTier: "l300", maxWorkspaceUsers: 300 }),
    ],
    organizations: [
      {
        id: env.orgId,
        kind: "egyhazmegye",
        name: "Minta Egyházmegye",
        slug: "minta-egyhazmegye",
        denomination: "rk",
        settings: {},
        createdAt: STAMP,
        updatedAt: STAMP,
      },
    ],
    orgMemberships: [
      {
        orgId: env.orgId,
        userId: env.orgActor.userId,
        roles: ["orgHrAdmin"],
        categoryScopes: null,
        parishScopes: null,
      },
    ],
    hymnals: [
      {
        id: "hymnal-sze",
        tenantId: null,
        abbreviation: "SZVU",
        name: "Szent vagy, Uram!",
        denomination: "rk",
      },
      {
        id: "hymnal-re",
        tenantId: null,
        abbreviation: "RÉ",
        name: "Református énekeskönyv",
        denomination: "ref",
      },
    ],
    planTemplates: [
      {
        id: "tpl-preset-mise",
        tenantId: null,
        denomination: "rk",
        serviceType: "szentmise",
        name: "Szentmise (alap)",
        items: [
          {
            type: "song",
            title: "Bevonulási ének",
            songId: null,
            arrangementId: null,
            keyOverride: null,
            verses: null,
            durationS: null,
            responsiblePersonId: null,
            notes: null,
          },
        ],
      },
    ],
    workdayCalendar: [
      { date: "2026-01-01", kind: "holiday", name: "Újév" },
      { date: "2026-01-02", kind: "swapped_restday", name: "Áthelyezett pihenőnap" },
      { date: "2026-03-15", kind: "holiday", name: "Nemzeti ünnep" },
    ],
  };
}

/** A fresh store seeded with the contract fixtures, plus the matching `ContractEnv`. */
export function seedContractFixtures(
  options: MockStoreOptions = {},
): MockStore & { contractEnv: ContractEnv } {
  return Object.assign(createMockStore(contractDataset(), options), { contractEnv: CONTRACT_ENV });
}
