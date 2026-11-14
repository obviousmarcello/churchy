import { can } from "@churchy/policy";
import type { Action, Actor, OrgResource, ResourceByAction, TenantResource } from "@churchy/policy";

/** Where the request happens: a church (tenant) or a diocesan organization. */
export type NavContext = (TenantResource | OrgResource) & {
  /**
   * Module flags (SDD §5.5 / §20.1). STUB: everything is enabled until D-25 supplies the tenant's
   * module settings.
   */
  readonly isModuleEnabled?: (module: string) => boolean;
  /** Entitlement gate. STUB: all enabled until D-87 provides `entitlements(tenant)`. */
  readonly hasEntitlement?: (entitlement: string) => boolean;
};

const enabled = (): boolean => true;

type ResourceFactory<A extends Action> = (ctx: NavContext) => ResourceByAction[A];

/** Tenant- or org-only resources can be derived from the context; others must be provided. */
export type Requirement = {
  [A in Action]: { readonly action: A } & (TenantResource extends ResourceByAction[A]
    ? { readonly resource?: ResourceFactory<A> }
    : OrgResource extends ResourceByAction[A]
      ? { readonly resource?: ResourceFactory<A> }
      : { readonly resource: ResourceFactory<A> });
}[Action];

/** A navigation entry that declares what it needs; visibility is decided by `can()`. */
export interface PermissionNavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  /** The policy action the item needs. Omit for items that are always visible. */
  readonly requires?: Requirement;
  /** Module key that must be enabled (stub until D-25). */
  readonly module?: string;
  /** Entitlement that must be present (stub until D-87). */
  readonly entitlement?: string;
  readonly children?: readonly PermissionNavItem[];
}

function allowed(item: PermissionNavItem, actor: Actor, ctx: NavContext): boolean {
  if (item.module !== undefined && !(ctx.isModuleEnabled ?? enabled)(item.module)) return false;
  if (item.entitlement !== undefined && !(ctx.hasEntitlement ?? enabled)(item.entitlement)) {
    return false;
  }
  const req = item.requires;
  if (req === undefined) return true;
  const resource = req.resource ? req.resource(ctx) : ctx;
  // The resource shape is guaranteed by the `Requirement` type.
  return can(actor, req.action, resource as never);
}

/**
 * Filters a navigation tree for `actor`. A parent that had children and lost all of them is
 * dropped too (nothing to disclose).
 */
export function filterNav(
  items: readonly PermissionNavItem[],
  actor: Actor,
  ctx: NavContext,
): PermissionNavItem[] {
  const result: PermissionNavItem[] = [];
  for (const item of items) {
    if (!allowed(item, actor, ctx)) continue;
    if (item.children) {
      const children = filterNav(item.children, actor, ctx);
      if (children.length === 0) continue;
      result.push({ ...item, children });
    } else {
      result.push(item);
    }
  }
  return result;
}
