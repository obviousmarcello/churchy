import type { OrgResource, Resource } from "./actions";
import type { OrgActor } from "./actor";
import type { Decision } from "./decision";
import { allow, deny } from "./decision";

/** Diocesan portal administration (SDD §25.7: *Sablonok*, *Plébániák*, members). */
export function evaluateOrgAdmin(actor: OrgActor, action: string, resource: Resource): Decision {
  if ((resource as OrgResource).orgId !== actor.orgId) {
    return deny("resource belongs to another organization");
  }
  if (action === "org.portal.open") {
    return actor.orgRoles.length > 0
      ? allow("any organization role may open the portal")
      : deny("requires an organization role");
  }
  // org.members.manage, org.links.manage, hr.template.manage
  return actor.orgRoles.includes("orgHrAdmin")
    ? allow(`orgHrAdmin grants ${action}`)
    : deny(`only orgHrAdmin may ${action}`);
}
