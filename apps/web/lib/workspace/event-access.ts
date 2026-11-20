import type { Calendar, Event, EventVisibility } from "@churchy/contracts";
import { can, type Actor } from "@churchy/policy";

/**
 * Who sees and edits internal events (D-57, SDD §22.1, FR-602). Visibility levels:
 * `private` (the owner of the calendar / the creator), `team` (members of the event's team),
 * `staff` (everybody who may create staff events: leaders, employees, music leaders, room
 * managers — volunteers are not staff) and `public` (everybody in the workspace; additionally on
 * the website once published).
 *
 * Creating is decided by `can(actor, "calendarEvent.create", …)`; viewing reuses the same
 * capability for `staff` (a documented stand-in until the policy gets its own `calendarEvent.view`
 * action) and ids from the actor's team scopes for `team` / `private`. Roles are never inspected.
 */

export const VISIBILITIES: readonly EventVisibility[] = ["private", "team", "staff", "public"];

function teamsOf(actor: Actor, which: "memberTeamIds" | "leadTeamIds"): readonly string[] {
  return actor.kind === "tenant" ? (actor[which] ?? []) : [];
}

const isCreator = (actor: Actor, event: Pick<Event, "createdBy">): boolean =>
  actor.kind === "tenant" && actor.userId !== null && event.createdBy === actor.userId;

const isOwner = (actor: Actor, calendar: Pick<Calendar, "ownerPersonId"> | undefined): boolean =>
  actor.kind === "tenant" && actor.personId !== null && calendar?.ownerPersonId === actor.personId;

/** Leader-level capability (publishing to the website), used for "may manage everything". */
function managesAll(actor: Actor, tenantId: string): boolean {
  return can(actor, "calendarEvent.publish", { tenantId });
}

/** Whether `actor` may see `event` (events of another church never). */
export function eventVisibleTo(
  actor: Actor,
  event: Pick<Event, "tenantId" | "visibility" | "teamId" | "createdBy" | "status">,
  calendar: Pick<Calendar, "ownerPersonId"> | undefined,
): boolean {
  if (actor.kind !== "tenant" || actor.tenantId !== event.tenantId) return false;
  if (isCreator(actor, event)) return true;
  if (event.status === "draft" && !managesAll(actor, event.tenantId)) return false;
  switch (event.visibility) {
    case "public":
      return true;
    case "private":
      return isOwner(actor, calendar);
    case "team":
      return (
        event.teamId !== null &&
        (teamsOf(actor, "memberTeamIds").includes(event.teamId) ||
          teamsOf(actor, "leadTeamIds").includes(event.teamId))
      );
    case "staff":
      return can(actor, "calendarEvent.create", {
        tenantId: event.tenantId,
        visibility: "staff",
      });
  }
}

/** Whether `actor` may change or delete `event`. */
export function mayEditEvent(
  actor: Actor,
  event: Pick<Event, "tenantId" | "teamId" | "createdBy">,
  calendar: Pick<Calendar, "ownerPersonId" | "teamId" | "editors"> | undefined,
): boolean {
  if (actor.kind !== "tenant" || actor.tenantId !== event.tenantId) return false;
  if (isCreator(actor, event) || isOwner(actor, calendar)) return true;
  if (managesAll(actor, event.tenantId)) return true;
  const lead = teamsOf(actor, "leadTeamIds");
  const editorTeams = calendar?.editors.teamIds ?? [];
  return (
    (event.teamId !== null && lead.includes(event.teamId)) ||
    (calendar?.teamId != null && lead.includes(calendar.teamId)) ||
    editorTeams.some((id) => lead.includes(id))
  );
}

/** Whether the actor may create an event of this visibility (and team) at all. */
export function mayCreateEvent(
  actor: Actor,
  tenantId: string,
  visibility: EventVisibility,
  teamId: string | null,
): boolean {
  return can(actor, "calendarEvent.create", { tenantId, visibility, teamId });
}

/** The visibilities the actor may choose when creating an event for `teamId`. */
export function creatableVisibilities(
  actor: Actor,
  tenantId: string,
  teamId: string | null,
): EventVisibility[] {
  return VISIBILITIES.filter((v) => mayCreateEvent(actor, tenantId, v, teamId));
}

/**
 * Calendars the actor may add events to: their personal calendar, shared calendars, and the
 * calendars of teams they belong to. Absence calendars are fed by HR requests, not by hand.
 */
export function creatableCalendars<C extends Calendar>(actor: Actor, calendars: readonly C[]): C[] {
  if (actor.kind !== "tenant") return [];
  return calendars.filter((c) => {
    switch (c.kind) {
      case "shared":
        return true;
      case "personal":
        return isOwner(actor, c);
      case "team":
        return (
          c.teamId !== null &&
          (teamsOf(actor, "memberTeamIds").includes(c.teamId) ||
            teamsOf(actor, "leadTeamIds").includes(c.teamId))
        );
      case "absence":
        return false;
    }
  });
}
