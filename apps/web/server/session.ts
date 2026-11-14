import type { Actor } from "@churchy/policy";
import { orgActor, tenantActor } from "@churchy/policy";
import { contextOf } from "@/lib/demo/personas";
import { demoDirectory, demoIdentity, type DemoIdentity } from "@/server/data-adapters";
import { getDemoState, type DemoState } from "@/server/demo";

/**
 * Session / actor access — THE single seam through which the app learns who is acting.
 *
 * Everything that needs permissions (RSC pages, nav, server helpers) calls `getActor()`; nothing
 * else may read roles or build actors (the lint rule in `eslint.permissions.mjs` exempts only
 * this file).
 *
 * - Demo mode (D-92, `DEMO_MODE=1`): the role switcher replaces login. The selected persona is
 *   looked up in the visitor's demo data (membership, teams, managed rooms, HR scopes, direct
 *   reports, diocesan links) and turned into a real `Actor` by `actorFromIdentity()`, so menus,
 *   buttons and routes are decided by the real `can()`.
 * - Otherwise (Phase A): an anonymous visitor.
 *
 * Phase B replaces `defaultResolver` with the Auth.js session + membership lookup; callers do not
 * change. Tests can still install their own resolver with `setActorResolver()`.
 */
export type ActorResolver = () => Actor | Promise<Actor>;

const ANONYMOUS: Actor = { kind: "anonymous" };

/**
 * Builds the policy actor from what the data says about a user (memberships and scopes). `null`
 * (no user, or no active membership in this context) is the anonymous visitor.
 */
export function actorFromIdentity(identity: DemoIdentity | null): Actor {
  if (identity === null) return ANONYMOUS;

  if (identity.kind === "org") {
    const { membership } = identity;
    return orgActor({
      orgId: identity.orgId,
      userId: identity.userId,
      personId: null,
      orgRoles: membership.roles,
      // `org_memberships`: a null scope column means "all" (SDD §25.7).
      categoryScopes: membership.categoryScopes ?? "*",
      parishScopes: membership.parishScopes ?? "*",
      links: identity.links.map((link) => ({
        tenantId: link.tenantId,
        status: link.status,
        delegatedCategoryKeys: link.categoryKeys.includes("*") ? "*" : link.categoryKeys,
      })),
    });
  }

  const { membership } = identity;
  const confidential = new Set(
    identity.hrCategories.filter((c) => c.confidential).map((c) => c.id),
  );
  return tenantActor({
    tenantId: identity.tenantId,
    userId: identity.userId,
    personId: identity.personId,
    websiteRoles: membership.role === null ? [] : [membership.role],
    workspaceRoles: membership.wsRoles,
    groupIds: membership.groupIds,
    leadTeamIds: identity.teamMembers.filter((m) => m.isLeader).map((m) => m.teamId),
    memberTeamIds: identity.teamMembers.map((m) => m.teamId),
    managedRoomIds: membership.roomIds,
    // One `hr_category_ids` column scopes both HR roles; the policy keeps them apart.
    hrCategoryIds: membership.hrCategoryIds.filter((id) => !confidential.has(id)),
    confidentialCategoryIds: membership.hrCategoryIds.filter((id) => confidential.has(id)),
    directReportPersonIds: identity.directReportPersonIds,
  });
}

const defaultResolver: ActorResolver = async () => {
  const demo = await getDemoState();
  if (demo === null) return ANONYMOUS;
  const { persona, contextId } = demo.selection;
  return actorFromIdentity(demoIdentity(demo.sessionId, persona, contextId));
};

let resolver: ActorResolver = defaultResolver;

/** Installs the resolver used by `getActor()` (tests; Phase B auth). */
export function setActorResolver(next: ActorResolver): void {
  resolver = next;
}

/** Restores the default resolver (demo persona, or anonymous); used by tests. */
export function resetActorResolver(): void {
  resolver = defaultResolver;
}

/** The actor of the current request. */
export async function getActor(): Promise<Actor> {
  return resolver();
}

/**
 * Tenant (church) or organization (diocese) context of the current request — never both
 * (SDD §25.7). Demo mode: the church or diocese chosen in the switcher. Otherwise the demo's
 * default church until host-based tenant resolution arrives (D-03).
 */
export type RequestContext =
  | { readonly tenantId: string; readonly orgId?: undefined }
  | { readonly orgId: string; readonly tenantId?: undefined };

export async function getRequestContext(): Promise<RequestContext> {
  return requestContextFrom(await getDemoState());
}

/**
 * The request context for a request's demo state — the one place that decides which church a
 * request is for, shared by `getRequestContext()` and the proxy (`siteConfigForRequest()`). Host-based
 * resolution (D-03) replaces this; its callers do not change.
 */
export function requestContextFrom(
  demo: Pick<DemoState, "directory" | "selection"> | null,
): RequestContext {
  if (demo === null) return { tenantId: demoDirectory().defaultTenantId };
  const context = contextOf(demo.directory, demo.selection.contextId);
  return context.kind === "org" ? { orgId: context.id } : { tenantId: context.id };
}
