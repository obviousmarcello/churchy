/**
 * Tiny in-memory REFERENCE implementation of two repositories (announcements, locations), used
 * only to prove the contract harness works before the real mock adapter (D-91, issue #14)
 * exists. Not exported from the package; not a mock adapter.
 */
import { huCollator, isPubliclyVisible, paginate } from "../../common";
import type { Ctx } from "../../ctx";
import { ctxScope, isAnonymous, requireTenantId } from "../../ctx";
import { conflict, notFound, parseInput } from "../../errors";
import type { Announcement, AnnouncementRepo } from "../../modules/announcements";
import { AnnouncementInputSchema } from "../../modules/announcements";
import type { Location, LocationRepo } from "../../modules/locations";
import { LocationInputSchema } from "../../modules/locations";
import type { ContractEnv, ContractSetup } from "../harness";

let seq = 0;
const newId = (prefix: string) => `${prefix}-${++seq}`;

/** Tenant id for reads: null (→ no rows) for organization/platform contexts. */
function readTenant(ctx: Ctx): string | null {
  const scope = ctxScope(ctx);
  return scope.kind === "tenant" ? scope.tenantId : null;
}

export function referenceAnnouncements(now: () => Date = () => new Date()): AnnouncementRepo {
  const rows = new Map<string, Announcement>();
  const visible = (ctx: Ctx) => {
    const tenantId = readTenant(ctx);
    return [...rows.values()]
      .filter((r) => r.tenantId === tenantId)
      .filter((r) => !isAnonymous(ctx) || isPubliclyVisible(r, now()))
      .sort((a, b) => b.weekSunday.localeCompare(a.weekSunday));
  };
  const own = (ctx: Ctx, id: string) => {
    const tenantId = requireTenantId(ctx);
    const row = rows.get(id);
    if (!row || row.tenantId !== tenantId) throw notFound("Announcement", id);
    return row;
  };
  return {
    async latest(ctx) {
      return visible(ctx)[0] ?? null;
    },
    async byWeek(ctx, sunday) {
      return visible(ctx).find((r) => r.weekSunday === sunday) ?? null;
    },
    async list(ctx, page) {
      return paginate(visible(ctx), page);
    },
    async get(ctx, id) {
      return visible(ctx).find((r) => r.id === id) ?? null;
    },
    async upsert(ctx, input) {
      const tenantId = requireTenantId(ctx);
      const data = parseInput(AnnouncementInputSchema, input);
      const existing = data.id ? own(ctx, data.id) : undefined;
      const clash = [...rows.values()].find(
        (r) => r.tenantId === tenantId && r.weekSunday === data.weekSunday && r.id !== data.id,
      );
      if (clash) throw conflict("An announcement already exists for this week");
      const stamp = now().toISOString();
      const row: Announcement = {
        id: existing?.id ?? newId("ann"),
        tenantId,
        weekSunday: data.weekSunday,
        body: data.body,
        pdfMediaId: data.pdfMediaId,
        status: existing?.status ?? "draft",
        publishedAt: existing?.publishedAt ?? null,
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
      };
      rows.set(row.id, row);
      return row;
    },
    async publish(ctx, id, at) {
      const row = own(ctx, id);
      rows.set(id, { ...row, status: "published", publishedAt: at ?? now().toISOString() });
    },
    async unpublish(ctx, id) {
      const row = own(ctx, id);
      rows.set(id, { ...row, status: "draft", publishedAt: null });
    },
    async delete(ctx, id) {
      own(ctx, id);
      rows.delete(id);
    },
  };
}

export function referenceLocations(now: () => Date = () => new Date()): LocationRepo {
  const rows = new Map<string, Location>();
  const visible = (ctx: Ctx) => {
    const tenantId = readTenant(ctx);
    return [...rows.values()]
      .filter((r) => r.tenantId === tenantId)
      .sort((a, b) => a.sort - b.sort || huCollator.compare(a.name, b.name));
  };
  const own = (ctx: Ctx, id: string) => {
    const tenantId = requireTenantId(ctx);
    const row = rows.get(id);
    if (!row || row.tenantId !== tenantId) throw notFound("Location", id);
    return row;
  };
  return {
    async list(ctx) {
      return visible(ctx);
    },
    async get(ctx, id) {
      return visible(ctx).find((r) => r.id === id) ?? null;
    },
    async getBySlug(ctx, slug) {
      return visible(ctx).find((r) => r.slug === slug) ?? null;
    },
    async upsert(ctx, input) {
      const tenantId = requireTenantId(ctx);
      const data = parseInput(LocationInputSchema, input);
      const existing = data.id ? own(ctx, data.id) : undefined;
      if (
        [...rows.values()].some(
          (r) => r.tenantId === tenantId && r.slug === data.slug && r.id !== data.id,
        )
      ) {
        throw conflict("Slug already used", { field: "slug" });
      }
      const stamp = now().toISOString();
      const row: Location = {
        ...data,
        id: existing?.id ?? newId("loc"),
        tenantId,
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
      };
      rows.set(row.id, row);
      return row;
    },
    async delete(ctx, id) {
      own(ctx, id);
      rows.delete(id);
    },
    async reorder(ctx, ids) {
      const owned = ids.map((id) => own(ctx, id));
      owned.forEach((row, index) => rows.set(row.id, { ...row, sort: index }));
    },
  };
}

export const REFERENCE_ENV: ContractEnv = {
  tenantA: "tenant-a",
  tenantB: "tenant-b",
  orgId: "org-1",
  actorA: { userId: "user-a", personId: "person-a" },
  actorB: { userId: "user-b", personId: "person-b" },
  orgActor: { userId: "user-org", personId: null },
  platformActor: { userId: "user-platform", personId: null },
};

/** Fresh reference repositories for every test. */
export function createReferenceSetup(): ContractSetup {
  return {
    repos: { announcements: referenceAnnouncements(), locations: referenceLocations() },
    env: REFERENCE_ENV,
  };
}
