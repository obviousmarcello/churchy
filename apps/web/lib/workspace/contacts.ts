import type { ContactVisibility, Person } from "@churchy/contracts";
import { can, type Actor } from "@churchy/policy";

/**
 * Contact-field visibility in the workspace directory (D-51 AC3, FR-502). Each person controls who
 * sees their email and phone (four levels, `ContactVisibility`); minors' contact details are
 * additionally hidden from everybody except their own team leaders and HR/leaders (SDD §28).
 *
 * Pure and decided with `can()` — the viewer's roles are never inspected:
 * - `public` / `workspace`: any workspace user who may see the person at all;
 * - `team`: a viewer who shares a team with the person;
 * - `private`: the person themselves, HR handlers (`hr.staffRecord.view`) and leaders
 *   (`calendarEvent.publish`, the Vezető-only capability).
 */

export type ContactField = "email" | "phone";

export interface ContactViewer {
  readonly actor: Actor;
  readonly tenantId: string;
}

function sharesTeam(
  actor: Actor,
  personTeamIds: readonly string[],
  teams: "memberTeamIds" | "leadTeamIds",
): boolean {
  if (actor.kind !== "tenant") return false;
  const own = actor[teams] ?? [];
  return personTeamIds.some((id) => own.includes(id));
}

/** Leaders and HR handlers (capability-based, no role names). */
function seesEverything(viewer: ContactViewer, personId: string): boolean {
  const { actor, tenantId } = viewer;
  return (
    can(actor, "hr.staffRecord.view", { tenantId, personId }) ||
    can(actor, "calendarEvent.publish", { tenantId })
  );
}

/** Whether `viewer` may see `person`'s `field`. `personTeamIds` are the teams the person is in. */
export function contactVisible(
  viewer: ContactViewer,
  person: Pick<Person, "id" | "isMinor" | "contactVisibility">,
  field: ContactField,
  personTeamIds: readonly string[],
): boolean {
  const { actor } = viewer;
  if (actor.kind !== "tenant" || actor.tenantId !== viewer.tenantId) return false;
  if (actor.personId !== null && actor.personId === person.id) return true;
  if (seesEverything(viewer, person.id)) return true;
  if (sharesTeam(actor, personTeamIds, "leadTeamIds")) return true;
  if (person.isMinor) return false;
  const level: ContactVisibility = person.contactVisibility[field];
  switch (level) {
    case "public":
    case "workspace":
      return true;
    case "team":
      return sharesTeam(actor, personTeamIds, "memberTeamIds");
    case "private":
      return false;
  }
}

export interface VisibleContact {
  readonly email: string | null;
  readonly phone: string | null;
  /** The person has a contact field the viewer may not see. */
  readonly hasHidden: boolean;
}

/** The contact fields of `person` the viewer may see. */
export function visibleContact(
  viewer: ContactViewer,
  person: Pick<Person, "id" | "isMinor" | "contactVisibility" | "email" | "phone">,
  personTeamIds: readonly string[],
): VisibleContact {
  const email = contactVisible(viewer, person, "email", personTeamIds);
  const phone = contactVisible(viewer, person, "phone", personTeamIds);
  return {
    email: email ? person.email : null,
    phone: phone ? person.phone : null,
    hasHidden: (!email && person.email !== null) || (!phone && person.phone !== null),
  };
}
