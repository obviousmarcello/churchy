/**
 * Server composition root of the data-access layer (SDD §4.4) — the ONLY app file allowed to
 * import data adapters (lint rule, D-90). Importing it registers the adapters with the contracts
 * registry; everything else resolves repositories through `getRepositories()`.
 *
 * Phase A: the mock adapter for all modules, backed by one default demo store. Per-visitor demo
 * sessions (`createMockSessions`) are wired in with demo mode (#18).
 *
 * It also exposes the demo outbox (SDD §4.4 *Kimenő levelek*) as plain data for the dev viewer,
 * because the outbox is a mock-store concept that has no repository.
 */
import type { Denomination, TermForms } from "@churchy/contracts";
import type { EmailParams, EmailTemplateKey } from "@churchy/email";
import type { MockStore, OutboxEntry, OutboxTemplate } from "@churchy/data-mock";
import { createMockStore, defaultDemoDataset, registerMockAdapter } from "@churchy/data-mock";
import { formatPersonName } from "@churchy/hu";

const STORE_KEY = Symbol.for("churchy.data-adapters.mockStore");
type GlobalWithStore = typeof globalThis & { [STORE_KEY]?: MockStore };

/** The default demo store; kept on `globalThis` so dev hot reloads keep its state. */
function defaultStore(): MockStore {
  const global = globalThis as GlobalWithStore;
  global[STORE_KEY] ??= createMockStore(defaultDemoDataset());
  return global[STORE_KEY];
}

registerMockAdapter(defaultStore);

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

/** Everything in the default store's outbox, oldest first. */
export function listOutbox(): OutboxMessage[] {
  const store = defaultStore();
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

/** Empties the default store's outbox (*Kiürítés*). */
export function clearOutbox(): void {
  defaultStore().clearOutbox();
}
