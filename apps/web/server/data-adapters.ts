/**
 * Server composition root of the data-access layer (SDD §4.4) — the ONLY app file allowed to
 * import data adapters (lint rule, D-90). Importing it registers the adapters with the contracts
 * registry; everything else resolves repositories through `getRequestRepositories()`
 * (`server/repositories.ts`) or `getRepositories()`.
 *
 * Phase A: the mock adapter for all modules. Without demo mode one default store serves every
 * request. In demo mode (D-92) every visitor has their own demo session (`createMockSessions`,
 * D-91 AC1) named by the demo session cookie: `repositoriesFor(sessionId)` binds the repositories
 * to that session's store and `resetDemoSession()` is *Visszaállítás*.
 *
 * It also exposes, as plain data, what only the mock store knows: the demo outbox (SDD §4.4
 * *Kimenő levelek*), the demo directory (churches + diocese) and the memberships behind the demo
 * personas, from which `server/session.ts` builds the actor.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type {
  Denomination,
  Membership,
  OrgMembership,
  Repositories,
  TeamMember,
  TermForms,
} from "@churchy/contracts";
import { DATA_MODULES, adapterRegistry } from "@churchy/contracts";
import type { EmailParams, EmailTemplateKey } from "@churchy/email";
import type { MockSessions, MockStore, OutboxEntry, OutboxTemplate } from "@churchy/data-mock";
import {
  DEMO_ORG_ID,
  DEMO_TENANT_IDS,
  createDemoDatasetWithPersonas,
  createMockSessions,
  createMockStore,
  defaultDemoDataset,
  registerMockAdapter,
} from "@churchy/data-mock";
import { formatPersonName } from "@churchy/hu";
import type { DemoContextOption, DemoDirectory, DemoPersonaKey } from "@/lib/demo/personas";

const STORE_KEY = Symbol.for("churchy.data-adapters.mockStore");
const SESSIONS_KEY = Symbol.for("churchy.data-adapters.demoSessions");
type GlobalWithStores = typeof globalThis & {
  [STORE_KEY]?: MockStore;
  [SESSIONS_KEY]?: MockSessions;
};

/** Live demo sessions kept in memory; beyond this the least recently used one is dropped. */
const MAX_DEMO_SESSIONS = 100;

/** The default demo store; kept on `globalThis` so dev hot reloads keep its state. */
function defaultStore(): MockStore {
  const global = globalThis as GlobalWithStores;
  global[STORE_KEY] ??= createMockStore(defaultDemoDataset());
  return global[STORE_KEY];
}

/** Per-visitor demo sessions (demo mode), each seeded with a fresh demo dataset. */
function demoSessions(): MockSessions {
  const global = globalThis as GlobalWithStores;
  global[SESSIONS_KEY] ??= createMockSessions({
    datasetFactory: () => defaultDemoDataset(),
    maxSessions: MAX_DEMO_SESSIONS,
  });
  return global[SESSIONS_KEY];
}

/** The store of a demo session, or the default store without a session (`null`). */
function storeFor(sessionId: string | null): MockStore {
  return sessionId === null ? defaultStore() : demoSessions().get(sessionId);
}

/** The store the mock repositories are being resolved for (see `repositoriesFor`). */
const resolvingStore = new AsyncLocalStorage<MockStore>();

registerMockAdapter(() => resolvingStore.getStore() ?? defaultStore());

/**
 * Repositories bound to a demo session's store (`null`: the default store). Modules are resolved
 * lazily with the adapter selected per module, exactly like `getRepositories()`.
 */
export function repositoriesFor(sessionId: string | null): Repositories {
  const store = storeFor(sessionId);
  const cache = new Map<string, unknown>();
  const repos = {} as Repositories;
  for (const name of DATA_MODULES) {
    Object.defineProperty(repos, name, {
      enumerable: true,
      get: () => {
        if (!cache.has(name)) {
          cache.set(
            name,
            resolvingStore.run(store, () => adapterRegistry.resolve(name)),
          );
        }
        return cache.get(name);
      },
    });
  }
  return repos;
}

/** *Visszaállítás*: restores a demo session's seed data, outbox and simulation switches. */
export function resetDemoSession(sessionId: string): void {
  demoSessions().reset(sessionId);
}

// ---------------------------------------------------------------------------------------------
// Demo directory & personas (D-92)
// ---------------------------------------------------------------------------------------------

interface PersonaUsers {
  directory: DemoDirectory;
  /** tenant id → persona key → user id */
  tenants: Record<string, Record<string, string>>;
  /** persona key → diocesan user id */
  org: Record<string, string>;
}

let personaUsers: PersonaUsers | undefined;

/** Ids and names are stable across seeds, so one seed build answers for every session. */
function seedPersonas(): PersonaUsers {
  if (personaUsers) return personaUsers;
  const { dataset, personas } = createDemoDatasetWithPersonas(new Date());
  const tenantIds = [DEMO_TENANT_IDS.catholic, DEMO_TENANT_IDS.reformed, DEMO_TENANT_IDS.baptist];
  const contexts: DemoContextOption[] = tenantIds.map((id) => ({
    kind: "tenant",
    id,
    name: dataset.tenants.find((t) => t.id === id)?.name ?? id,
  }));
  contexts.push({
    kind: "org",
    id: DEMO_ORG_ID,
    name: dataset.organizations.find((o) => o.id === DEMO_ORG_ID)?.name ?? DEMO_ORG_ID,
  });
  personaUsers = {
    directory: { contexts, defaultTenantId: DEMO_TENANT_IDS.catholic },
    tenants: personas.tenants,
    org: personas.org,
  };
  return personaUsers;
}

/** The 3 demo churches and the diocese, in switcher order (default: the Catholic parish). */
export function demoDirectory(): DemoDirectory {
  return seedPersonas().directory;
}

/** What the demo data says about a persona's user in one church: membership and scopes. */
export interface DemoTenantIdentity {
  kind: "tenant";
  tenantId: string;
  userId: string;
  personId: string | null;
  membership: Membership;
  /** The person's team memberships (`team_members`). */
  teamMembers: TeamMember[];
  /** People whose `staff_profiles.manager_person_id` is this person. */
  directReportPersonIds: string[];
  /** The tenant's HR categories (to split the membership's category scope). */
  hrCategories: { id: string; confidential: boolean }[];
}

/** What the demo data says about a diocesan persona: org membership and parish links. */
export interface DemoOrgIdentity {
  kind: "org";
  orgId: string;
  userId: string;
  membership: OrgMembership;
  links: { tenantId: string; status: "requested" | "active" | "revoked"; categoryKeys: string[] }[];
}

export type DemoIdentity = DemoTenantIdentity | DemoOrgIdentity;

/**
 * The memberships behind `persona` in the given context, read from the visitor's demo session
 * (so a role change made in the demo shows up on the next request). `null` for the visitor
 * persona or when the persona has no active membership there.
 */
export function demoIdentity(
  sessionId: string | null,
  persona: DemoPersonaKey,
  contextId: string,
): DemoIdentity | null {
  const users = seedPersonas();
  const { data } = storeFor(sessionId);

  if (contextId === DEMO_ORG_ID) {
    const userId = users.org[persona];
    const membership = userId
      ? data.orgMemberships.find((m) => m.orgId === contextId && m.userId === userId)
      : undefined;
    if (!userId || !membership) return null;
    return {
      kind: "org",
      orgId: contextId,
      userId,
      membership,
      links: data.orgLinks
        .filter((l) => l.orgId === contextId)
        .map((l) => ({
          tenantId: l.tenantId,
          status: l.status,
          categoryKeys: data.orgDelegations
            .filter((d) => d.orgId === contextId && d.tenantId === l.tenantId)
            .map((d) => d.hrCategoryKey),
        })),
    };
  }

  const userId = users.tenants[contextId]?.[persona];
  const membership = userId
    ? data.memberships.find((m) => m.tenantId === contextId && m.userId === userId && m.active)
    : undefined;
  if (!userId || !membership) return null;
  const personId =
    data.people.find((p) => p.tenantId === contextId && p.userId === userId)?.id ?? null;
  return {
    kind: "tenant",
    tenantId: contextId,
    userId,
    personId,
    membership,
    teamMembers:
      personId === null
        ? []
        : data.teamMembers.filter((m) => m.tenantId === contextId && m.personId === personId),
    directReportPersonIds:
      personId === null
        ? []
        : data.staffProfiles
            .filter((s) => s.tenantId === contextId && s.managerPersonId === personId)
            .map((s) => s.personId),
    hrCategories: data.hrCategories
      .filter((c) => c.tenantId === contextId)
      .map((c) => ({ id: c.id, confidential: c.confidential })),
  };
}

// ---------------------------------------------------------------------------------------------
// Outbox (demo mode: nothing is sent, everything that would be sent is listed)
// ---------------------------------------------------------------------------------------------

/** Compile-time guard: the email package must render exactly the templates the mock emits. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const outboxTemplatesAreRenderable: Same<OutboxTemplate, EmailTemplateKey> = true;
void outboxTemplatesAreRenderable;

export type OutboxRecipientView =
  | { kind: "person" | "user"; id: string; name: string | null }
  | { kind: "persona"; persona: string };

export interface OutboxTenantView {
  id: string;
  name: string;
  denomination: Denomination;
  terminology: Record<string, TermForms>;
}

/** One message the demo would have sent, with its recipient and tenant resolved for display. */
export interface OutboxMessage {
  id: string;
  /** ISO instant. */
  at: string;
  channel: "email" | "push";
  template: EmailTemplateKey;
  recipient: OutboxRecipientView;
  /** Null for organization-level messages or when the tenant is not in the demo data. */
  tenant: OutboxTenantView | null;
  params: EmailParams;
}

function recipientView(store: MockStore, recipient: OutboxEntry["recipient"]): OutboxRecipientView {
  if (recipient.kind === "persona") return { kind: "persona", persona: recipient.persona };
  if (recipient.kind === "person") {
    const person = store.data.people.find((p) => p.id === recipient.personId);
    return {
      kind: "person",
      id: recipient.personId,
      name: person
        ? formatPersonName({
            familyName: person.familyName,
            givenName: person.givenName,
            prefix: person.prefix ?? undefined,
            suffix: person.suffix ?? undefined,
          })
        : null,
    };
  }
  const user = store.data.users.find((u) => u.id === recipient.userId);
  return { kind: "user", id: recipient.userId, name: user?.name ?? null };
}

function tenantView(store: MockStore, tenantId: string | null): OutboxTenantView | null {
  const tenant = tenantId ? store.data.tenants.find((t) => t.id === tenantId) : undefined;
  return tenant
    ? {
        id: tenant.id,
        name: tenant.name,
        denomination: tenant.denomination,
        terminology: tenant.siteConfig.terminology ?? {},
      }
    : null;
}

/** Everything in a demo session's outbox (`null`: the default store), oldest first. */
export function listOutbox(sessionId: string | null = null): OutboxMessage[] {
  const store = storeFor(sessionId);
  return store.listOutbox().map((entry) => ({
    id: entry.id,
    at: entry.at,
    channel: entry.channel,
    template: entry.template,
    recipient: recipientView(store, entry.recipient),
    tenant: tenantView(store, entry.tenantId),
    params: entry.params,
  }));
}

/** Empties a demo session's outbox (`null`: the default store) — *Kiürítés*. */
export function clearOutbox(sessionId: string | null = null): void {
  storeFor(sessionId).clearOutbox();
}
