// Volunteer templates: the groups (service areas) of a kind of event (see
// `src/server/models/volunteer-templates.ts` and `src/lib/groups.ts`). Keep
// the limits in sync with the migrations `volunteer_templates`,
// `volunteer_template_limits` and `groups`.

export const TEMPLATE_NAME_MAX_LENGTH = 100;
export const VOLUNTEER_TEMPLATES_MAX = 100;
/** The most users in the team of one group of an event. */
export const AREA_MEMBERS_MAX = 50;
/** The longest text in place of the people of an area of an event (the migration `event_area_notes`). */
export const AREA_NOTE_MAX_LENGTH = 200;
/** The longest note on the teams of an event (the migration `event_team_notes`). */
export const TEAM_NOTE_MAX_LENGTH = 500;

/**
 * A group (service area) in a list, e.g. "Music" or "Broadcast". `name`: its
 * path, e.g. "Music › Band" (see `listServiceAreas()`).
 */
export type ServiceAreaDTO = { id: string; name: string };

export type VolunteerTemplateDTO = {
  id: string;
  name: string;
  /** The groups of the template, in the order of the tree. Their members are the usual people. */
  areaIds: string[];
};

/**
 * The volunteers of an area of an event, in their order, or a text in their
 * place, e.g. "Sign up at Gábor". An area has people or a text, not both.
 */
export type EventTeamDTO = { areaId: string; name: string; userIds: string[]; note: string | null };

export type EventTeamsDTO = {
  /** The template that the event admins chose for the event, or null. */
  templateId: string | null;
  /** Only the areas with volunteers or a text, in the order of the areas. */
  teams: EventTeamDTO[];
  /** The note on the teams, e.g. "Baptism: two more ushers", or null. Optional: an older copy of the page has none. */
  note?: string | null;
};
