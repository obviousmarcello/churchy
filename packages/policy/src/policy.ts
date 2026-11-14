import type { Action, ResourceByAction, TenantResource } from "./actions";
import { HR_ACTIONS, ORG_ACTIONS, WEBSITE_ACTIONS, WORKSPACE_ACTIONS, isHrAction } from "./actions";
import type { Actor, TenantActor } from "./actor";
import type { Decision } from "./decision";
import { deny } from "./decision";
import { evaluateHrOrg, evaluateHrTenant } from "./hr";
import { evaluateOrgAdmin } from "./org";
import { evaluateWebsite } from "./website";
import { evaluateWorkspace } from "./workspace";

const ORG = new Set<string>(ORG_ACTIONS);
const WEBSITE = new Set<string>(WEBSITE_ACTIONS);
const WORKSPACE = new Set<string>(WORKSPACE_ACTIONS);
const HR = new Set<string>(HR_ACTIONS);

function evaluateTenant(actor: TenantActor, action: string, resource: unknown): Decision {
  if (ORG.has(action)) return deny("organization resources are not available in a tenant context");
  if ((resource as TenantResource).tenantId !== actor.tenantId) {
    return deny("resource belongs to another tenant");
  }
  if (actor.impersonatedBy !== undefined && isHrAction(action)) {
    return deny("platform support access is excluded from HR");
  }
  const typed = resource as ResourceByAction[Action];
  if (WEBSITE.has(action)) return evaluateWebsite(actor, action, typed);
  if (WORKSPACE.has(action)) return evaluateWorkspace(actor, action, typed);
  return evaluateHrTenant(actor, action, typed);
}

function evaluate(actor: Actor, action: string, resource: unknown): Decision {
  if (!WEBSITE.has(action) && !WORKSPACE.has(action) && !HR.has(action) && !ORG.has(action)) {
    return deny(`unknown action ${action}`);
  }
  if (actor.tenantId !== undefined && actor.orgId !== undefined) {
    return deny("an actor must not combine tenant and organization context");
  }
  if (resource === null || typeof resource !== "object") return deny("missing resource");

  switch (actor.kind) {
    case "tenant":
      return evaluateTenant(actor, action, resource);
    case "org": {
      const typed = resource as ResourceByAction[Action];
      if (ORG.has(action)) return evaluateOrgAdmin(actor, action, typed);
      if (HR.has(action)) return evaluateHrOrg(actor, action, typed);
      return deny("organization actors may only access delegated HR data");
    }
    case "platform":
      return isHrAction(action)
        ? deny("platform actors are excluded from HR")
        : deny("platform actors have no tenant or organization capability");
    case "anonymous":
      return deny("anonymous visitors have no capability in this vocabulary");
    default:
      return deny("unknown actor kind");
  }
}

/**
 * Decides whether `actor` may perform `action` on `resource`, with the reason.
 * Deny by default: unknown actors, actions, malformed input and every case not granted by the
 * SDD matrices are denied. Pure: no IO, no clock.
 */
export function explain<A extends Action>(
  actor: Actor,
  action: A,
  resource: ResourceByAction[A],
): Decision {
  try {
    if (actor === null || typeof actor !== "object") return deny("missing actor");
    return evaluate(actor, action, resource);
  } catch {
    return deny("malformed actor or resource");
  }
}

/** `true` when `actor` may perform `action` on `resource` (see `explain` for the reason). */
export function can<A extends Action>(
  actor: Actor,
  action: A,
  resource: ResourceByAction[A],
): boolean {
  return explain(actor, action, resource).allowed;
}
