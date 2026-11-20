import type { OrgRole, WebsiteRole, WorkspaceRole } from "./roles";

/**
 * A scope list: explicit ids, or `"*"` for "all". A missing scope always means **none**
 * (deny by default) — the server maps an unrestricted (`NULL`) scope column to `"*"`.
 */
export type ScopeList = readonly string[] | "*";

/**
 * A user acting inside one church (tenant): website roles (SDD §11.3) and workspace roles
 * (SDD §21.2) combined additively, plus the resolved scopes of those roles.
 *
 * Built by the server from `memberships`, `team_members`, `rooms.manager_person_ids`,
 * `staff_profiles.manager_person_id` etc. Never carries organization context.
 */
export interface TenantActor {
  readonly kind: "tenant";
  readonly tenantId: string;
  /** An actor is never in a tenant and an organization context at the same time. */
  readonly orgId?: never;
  readonly userId: string | null;
  /** The actor's `people` record in this tenant (needed for own tickets, assignments, reports). */
  readonly personId: string | null;
  readonly websiteRoles: readonly WebsiteRole[];
  readonly workspaceRoles: readonly WorkspaceRole[];
  /** `groupLeader` scope: groups (Közösségek) whose events and group page the actor manages. */
  readonly groupIds?: readonly string[];
  /** `teamLeader` scope: teams the actor leads (`team_members.is_leader`). */
  readonly leadTeamIds?: readonly string[];
  /** Every team the actor's person is a member of (volunteer "own teams"). */
  readonly memberTeamIds?: readonly string[];
  /** `roomManager` scope: rooms the actor manages. */
  readonly managedRoomIds?: readonly string[];
  /** `hrHandler` scope: HR category ids (non-confidential categories only). */
  readonly hrCategoryIds?: ScopeList;
  /**
   * `confidentialHandler` scope: confidential HR category ids. Always explicit — SDD §25.4
   * requires the handler to be scoped to the category, so there is no `"*"`.
   */
  readonly confidentialCategoryIds?: readonly string[];
  /** Manager relationship: people whose `staff_profiles.manager_person_id` is this actor. */
  readonly directReportPersonIds?: readonly string[];
  /**
   * Set when a platform operator acts through time-limited support access granted by the
   * church owner (SDD §13). Such an actor is hard-excluded from every HR action (SDD §28).
   * The server only builds this actor while the grant is valid (no clock in the policy).
   */
  readonly impersonatedBy?: string;
}

/** A parish (tenant) linked to the organization and the HR categories it delegated. */
export interface OrgLink {
  readonly tenantId: string;
  readonly status: "requested" | "active" | "revoked";
  /** `org_delegations.hr_category_key` values, or `"*"` for all HR categories. */
  readonly delegatedCategoryKeys: ScopeList;
}

/**
 * A user acting for a diocesan organization (SDD §25.7). Has no tenant context, so it can only
 * reach HR data of linked parishes in delegated categories — nothing else.
 */
export interface OrgActor {
  readonly kind: "org";
  readonly orgId: string;
  /** An actor is never in a tenant and an organization context at the same time. */
  readonly tenantId?: never;
  readonly userId: string | null;
  readonly personId: string | null;
  readonly orgRoles: readonly OrgRole[];
  /** `org_memberships.category_scopes`: HR category keys the actor may access. */
  readonly categoryScopes?: ScopeList;
  /** `org_memberships.parish_scopes`: tenant ids the actor may access. */
  readonly parishScopes?: ScopeList;
  /** The organization's parish links (`org_links` + `org_delegations`). */
  readonly links?: readonly OrgLink[];
}

/**
 * A platform operator in the platform console. Has no tenant or organization capability in this
 * vocabulary and is denied every HR action. (Support access to a church is modelled as a
 * `TenantActor` with `impersonatedBy`.)
 */
export interface PlatformActor {
  readonly kind: "platform";
  readonly userId: string;
  readonly tenantId?: never;
  readonly orgId?: never;
}

/** A visitor without a session (public website). Denied every action of this vocabulary. */
export interface AnonymousActor {
  readonly kind: "anonymous";
  readonly tenantId?: never;
  readonly orgId?: never;
}

/** The resolved permission subject passed to `can()` / `explain()`. */
export type Actor = TenantActor | OrgActor | PlatformActor | AnonymousActor;

type TenantActorInput = Omit<TenantActor, "kind" | "websiteRoles" | "workspaceRoles"> &
  Partial<Pick<TenantActor, "websiteRoles" | "workspaceRoles">>;

/** Convenience constructor for tenant actors (personas, tests); role lists default to empty. */
export function tenantActor(input: TenantActorInput): TenantActor {
  return { websiteRoles: [], workspaceRoles: [], ...input, kind: "tenant" };
}

type OrgActorInput = Omit<OrgActor, "kind">;

/** Convenience constructor for organization actors. */
export function orgActor(input: OrgActorInput): OrgActor {
  return { ...input, kind: "org" };
}

/** Whether `id` is within a scope list; a missing scope matches nothing. */
export function inScope(scope: ScopeList | undefined, id: string | null | undefined): boolean {
  if (scope === undefined || id === null || id === undefined) return false;
  return scope === "*" || scope.includes(id);
}
