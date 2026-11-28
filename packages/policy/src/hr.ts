import type {
  HrCategoryRef,
  HrCategoryResource,
  HrPersonResource,
  HrSubmitResource,
  HrTicketResource,
  Resource,
} from "./actions";
import type { OrgActor, OrgLink, TenantActor } from "./actor";
import { inScope } from "./actor";
import type { Decision } from "./decision";
import { allow, deny } from "./decision";
import type { OrgRole, WorkspaceRole } from "./roles";

/*
 * HR and confidential checks are separate policy functions with their own tests (SDD §28).
 *
 * Hard rules implemented here:
 * - Confidential categories are visible only to a `confidentialHandler` / `orgConfidentialHandler`
 *   scoped to that category, plus the requester (SDD §25.4). No other role — in particular not
 *   `leader` (Vezető), `hrHandler` or a manager approving a direct report — reaches them.
 * - Platform / support access is excluded from every HR action (enforced in `policy.ts`).
 * - Organization actors only reach active-linked parishes, delegated categories and their own
 *   membership scopes (SDD §25.7).
 */

const has = (list: readonly string[] | undefined, id: string | null): boolean =>
  id !== null && (list?.includes(id) ?? false);

const holds = (actor: TenantActor, role: WorkspaceRole): boolean =>
  actor.workspaceRoles.includes(role);

/** Whether a tenant actor may handle (read, reply, process) items of the category. */
function tenantHandles(actor: TenantActor, category: HrCategoryRef): Decision {
  if (category.confidential) {
    return holds(actor, "confidentialHandler") && has(actor.confidentialCategoryIds, category.id)
      ? allow("confidentialHandler scoped to this confidential category")
      : deny("confidential category: only scoped confidential handlers (and the requester)");
  }
  return holds(actor, "hrHandler") && inScope(actor.hrCategoryIds, category.id)
    ? allow("hrHandler scoped to this category")
    : deny("not an HR handler of this category");
}

const isRequester = (actor: TenantActor, ticket: HrTicketResource): boolean =>
  actor.personId !== null && ticket.requesterPersonId === actor.personId;

function hrHandlerOnly(actor: TenantActor, action: string): Decision {
  return holds(actor, "hrHandler")
    ? allow(`hrHandler grants ${action}`)
    : deny(`only hrHandler may ${action}`);
}

/** HR capabilities of a tenant actor (SDD §21.2 HR rows, §25). */
export function evaluateHrTenant(actor: TenantActor, action: string, resource: Resource): Decision {
  switch (action) {
    case "hr.ticket.create": {
      const { category } = resource as HrSubmitResource;
      if (actor.workspaceRoles.some((role) => role !== "volunteer")) {
        return allow("workspace staff roles may submit HR requests");
      }
      if (holds(actor, "volunteer")) {
        return category.whoCanSubmit === "employees"
          ? deny("category is not enabled for volunteers")
          : allow("volunteer: category enabled for volunteers");
      }
      return deny("submitting HR requests requires a workspace role");
    }
    case "hr.ticket.read":
    case "hr.ticket.reply":
    case "hr.ticket.handle": {
      const ticket = resource as HrTicketResource;
      if (action !== "hr.ticket.read" && ticket.handedOver === true) {
        return deny("ticket was handed over and is read-only");
      }
      if (isRequester(actor, ticket)) {
        // Requesters read and reply to their own ticket but never handle it: a handler may not
        // process their own request (separation of duties, same rule as manager approval).
        return action === "hr.ticket.handle"
          ? deny("may not handle own request")
          : allow("requester of the ticket");
      }
      return tenantHandles(actor, ticket.category);
    }
    case "hr.ticket.approveAsManager": {
      const ticket = resource as HrTicketResource;
      if (ticket.category.confidential) {
        return deny("confidential tickets are never routed to managers");
      }
      if (isRequester(actor, ticket)) return deny("may not approve own request");
      const isManagerRole = holds(actor, "leader") || holds(actor, "employee");
      return isManagerRole && has(actor.directReportPersonIds, ticket.requesterPersonId)
        ? allow("manager of the requester (direct report)")
        : deny("requester is not a direct report of the actor");
    }
    case "hr.absence.viewDetails":
      return tenantHandles(actor, (resource as HrCategoryResource).category);
    case "hr.absence.viewCalendar":
      return actor.workspaceRoles.length > 0
        ? allow("absences are shown as „Távol” to the workspace")
        : deny("requires a workspace role");
    case "hr.leaveBalance.view":
      if (
        actor.workspaceRoles.length > 0 &&
        actor.personId !== null &&
        actor.personId === (resource as HrPersonResource).personId
      ) {
        return allow("own leave balance");
      }
      return hrHandlerOnly(actor, action);
    case "hr.staffRecord.view":
    case "hr.staffRecord.edit":
    case "hr.leaveBalance.manage":
    case "hr.payroll.export":
    case "hr.report.view":
      return hrHandlerOnly(actor, action);
    default:
      return deny(`${action} is not available in a tenant context`);
  }
}

/** HR actions an organization actor can ever perform (on linked parishes' data). */
const ORG_HR_ACTIONS = new Set([
  "hr.ticket.read",
  "hr.ticket.reply",
  "hr.ticket.handle",
  "hr.absence.viewDetails",
  "hr.absence.viewCalendar",
  "hr.leaveBalance.view",
  "hr.payroll.export",
  "hr.report.view",
]);

const holdsOrg = (actor: OrgActor, ...roles: OrgRole[]): boolean =>
  roles.some((role) => actor.orgRoles.includes(role));

function activeLink(actor: OrgActor, tenantId: string): OrgLink | Decision {
  const link = actor.links?.find((candidate) => candidate.tenantId === tenantId);
  if (link === undefined) return deny("parish is not linked to the organization");
  if (link.status !== "active") return deny(`parish link is ${link.status}`);
  if (!inScope(actor.parishScopes, tenantId)) return deny("parish is outside the actor's scope");
  return link;
}

function orgHandles(actor: OrgActor, link: OrgLink, category: HrCategoryRef): Decision {
  if (!inScope(link.delegatedCategoryKeys, category.key)) {
    return deny("category is not delegated to the organization");
  }
  if (!inScope(actor.categoryScopes, category.key)) {
    return deny("category is outside the actor's scope");
  }
  if (category.confidential) {
    return holdsOrg(actor, "orgConfidentialHandler")
      ? allow("orgConfidentialHandler on a delegated confidential category")
      : deny("confidential category requires orgConfidentialHandler");
  }
  return holdsOrg(actor, "orgHrAdmin", "orgHrHandler")
    ? allow("diocesan HR role on a delegated category")
    : deny("requires orgHrAdmin or orgHrHandler");
}

/** HR capabilities of a diocesan organization actor (SDD §25.7). */
export function evaluateHrOrg(actor: OrgActor, action: string, resource: Resource): Decision {
  if (!ORG_HR_ACTIONS.has(action)) {
    return deny(`${action} is not available to organization actors`);
  }
  const link = activeLink(actor, (resource as HrCategoryResource).tenantId);
  if ("allowed" in link) return link;
  const delegatesAnything =
    link.delegatedCategoryKeys === "*" || link.delegatedCategoryKeys.length > 0;

  switch (action) {
    case "hr.ticket.read":
    case "hr.ticket.reply":
    case "hr.ticket.handle": {
      const ticket = resource as HrTicketResource;
      if (action !== "hr.ticket.read" && ticket.handedOver === true) {
        return deny("ticket was handed over and is read-only");
      }
      return orgHandles(actor, link, ticket.category);
    }
    case "hr.absence.viewDetails":
      return orgHandles(actor, link, (resource as HrCategoryResource).category);
    case "hr.absence.viewCalendar":
      return delegatesAnything && actor.orgRoles.length > 0
        ? allow("absence calendar of a linked parish")
        : deny("parish delegates no HR category");
    default:
      // hr.leaveBalance.view, hr.payroll.export, hr.report.view — cross-parish reporting.
      return delegatesAnything && holdsOrg(actor, "orgHrAdmin", "orgHrHandler")
        ? allow("diocesan HR reporting on a linked parish")
        : deny("requires orgHrAdmin or orgHrHandler and a delegating parish");
  }
}
