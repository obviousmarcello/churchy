import { queueEventAddedNotifications } from "@/server/music/notifications";
import "server-only";

import { z } from "zod";

import {
  MAX_GRID_EVENTS,
  rangeBounds,
  type DayRange,
  type GridTemplate,
  type TeamGridCells,
  type TeamGridNotes,
} from "@/lib/music/team-grid";
import {
  AREA_MEMBERS_MAX,
  AREA_NOTE_MAX_LENGTH,
  TEAM_NOTE_MAX_LENGTH,
  type EventTeamsDTO,
  type ServiceAreaDTO,
  type VolunteerTemplateDTO,
} from "@/lib/music/volunteer-templates";
import { canManageGroup } from "@/lib/music/groups";
import { requireGroupManager, requireUser } from "@/server/music/auth";
import { ConflictError, ForbiddenError, ProjectionUserError } from "@/server/music/errors";
import { getMusicSupabase } from "@/server/music/db";
import {
  canSeeEvent,
  requireEventAdminOf,
  requireTeamEditorOf,
  visibleEventsFilter,
  withFilter,
} from "./event-access";
import { listPeople, type PersonDTO } from "./profiles";
import { databaseError, endingProjections, idSchema, parseInput, withAuthor } from "./shared";
import { groupRightsOf, listGroupMemberIds, listServiceAreas } from "./groups";
import { areaMembersSchema, listVolunteerTemplates, toMembersParam } from "./volunteer-templates";

// The teams of an event: its volunteers in each group (service area), usually
// the groups of a volunteer template (see the migrations `event_teams` and
// `groups`). Everyone who sees the event sees its teams. The event admins and
// the superadmins change them, on the page of the event or one group at a
// time in the team planner. A leader of a group changes the teams of the
// groups that they lead, but not the template and not the note on the teams.

const teamsInputSchema = z.strictObject({
  templateId: idSchema.nullable(),
  teams: areaMembersSchema,
});

export type EventTeamsInput = z.input<typeof teamsInputSchema>;

const TEAMS_ERRORS = {
  "P0001:projection_user": () => new ProjectionUserError(),
  // A template, an area or a user was deleted after the page loaded.
  "23503": () => new ConflictError(({ m }) => m.server.volunteerTemplates.teamMissing),
  // A leader adds only the members of the group (the migration `team_outsiders`).
  "P0001:team_outsider": () =>
    new ConflictError(({ m }) => m.server.volunteerTemplates.teamOutsider),
};

/** The template and the teams of the event. Empty if there is no such event, or the user cannot see it. */
export async function getEventTeams(eventId: string): Promise<EventTeamsDTO> {
  const user = await requireUser();
  if (!(await canSeeEvent(user.id, eventId))) return { templateId: null, teams: [], note: null };

  const supabase = await getMusicSupabase();
  const [event, members, notes, teamNote, areas] = await Promise.all([
    supabase.from("events").select("volunteer_template_id").eq("id", eventId).maybeSingle(),
    supabase
      .from("event_volunteer_areas")
      .select("area_id, user_id, position")
      .eq("event_id", eventId),
    supabase.from("event_area_notes").select("area_id, note").eq("event_id", eventId),
    supabase.from("event_team_notes").select("note").eq("event_id", eventId).maybeSingle(),
    listServiceAreas(),
  ]);
  if (event.error) throw databaseError("get event template", event.error);
  if (members.error) throw databaseError("list event teams", members.error);
  if (notes.error) throw databaseError("list event area notes", notes.error);
  if (teamNote.error) throw databaseError("get event team note", teamNote.error);

  const rows = z
    .array(z.object({ area_id: z.uuid(), user_id: z.uuid(), position: z.number() }))
    .parse(members.data)
    .sort((a, b) => a.position - b.position);
  const userIds = new Map<string, string[]>();
  for (const row of rows)
    userIds.set(row.area_id, [...(userIds.get(row.area_id) ?? []), row.user_id]);
  const texts = new Map(
    z
      .array(z.object({ area_id: z.uuid(), note: z.string() }))
      .parse(notes.data)
      .map((row) => [row.area_id, row.note]),
  );

  return {
    templateId:
      z.object({ volunteer_template_id: z.uuid().nullable() }).nullable().parse(event.data)
        ?.volunteer_template_id ?? null,
    // In the order of the tree of the groups, each with its path as its name.
    teams: areas.flatMap((area): EventTeamsDTO["teams"] => {
      const people = userIds.get(area.id);
      // A group has people or a text. With both (a race of two old saves), the people win.
      if (people) return [{ areaId: area.id, name: area.name, userIds: people, note: null }];
      const note = texts.get(area.id);
      return note === undefined ? [] : [{ areaId: area.id, name: area.name, userIds: [], note }];
    }),
    note: z.object({ note: z.string() }).nullable().parse(teamNote.data)?.note ?? null,
  };
}

/** The data of the Teams dialog of an event. */
export type TeamEditorDTO = {
  /** "all" for an event admin, or the ids of the groups that the leader leads: only their teams change. */
  editable: "all" | string[];
  /** The templates by name. Only an event admin changes the template of the event. */
  templates: VolunteerTemplateDTO[];
  /** All groups in the order of the tree, each with its path as its name. */
  areas: ServiceAreaDTO[];
  /**
   * The members of each group that the user can change, with the members of
   * the groups below it: the first people of its picker. A leader does not
   * get the members of the other groups.
   */
  groupMembers: Record<string, string[]>;
  /** The users to add, by name (`listPeople()`). */
  users: PersonDTO[];
  /** The members of the groups, also those that `users` leaves out. Emails only for the superadmins. */
  people: PersonDTO[];
  /** True if `users` leaves out the users without a display name. */
  unnamedHidden: boolean;
};

/** The data of the Teams dialog for an event admin or a leader of a group; null for the other users. */
export async function getTeamEditor(): Promise<TeamEditorDTO | null> {
  const user = await requireUser();
  if (!user.canEditEvents && !user.leadsGroups) return null;
  const [{ templates, areas }, members, rights, users] = await Promise.all([
    listVolunteerTemplates(),
    listGroupMemberIds(),
    groupRightsOf(user),
    listPeople(),
  ]);
  const groupMembers = Object.fromEntries(
    areas
      .filter((area) => canManageGroup(rights, area.id))
      .map((area) => [area.id, members.get(area.id) ?? []]),
  );
  return {
    editable: rights === "all" ? "all" : [...rights],
    templates,
    areas,
    groupMembers,
    users,
    people: await listPeople(Object.values(groupMembers).flat(), {
      emails: user.canViewPeopleEmails,
    }),
    unnamedHidden: !user.canViewPeopleEmails,
  };
}

/**
 * Saves the template and the teams of the event. An event admin saves all
 * teams: the groups that `teams` leaves out lose their people. A leader saves
 * only the teams in `teams`, all of their own groups, and the template stays.
 * A user in a team becomes a volunteer, and gets the "added to an event"
 * email if they turned it on, unless they added themselves. A volunteer who
 * was in a team and is in none now stops being a volunteer. Returns false if
 * there is no such event, or the signed-in user cannot see it. Fails when a
 * removed volunteer would lose their open projection of the event: with
 * `endProjections`, it ends instead.
 */
export async function setEventTeams(
  eventId: string,
  input: unknown,
  { endProjections = false }: { endProjections?: boolean } = {},
): Promise<boolean> {
  const editor = await requireTeamEditorOf(eventId);
  if (!editor) return false;
  const { rights, user: currentUser } = editor;
  const { templateId, teams } = parseInput(teamsInputSchema, input);
  if (rights !== "all" && !teams.every((team) => rights.has(team.areaId)))
    throw new ForbiddenError();

  const supabase = await getMusicSupabase();
  const { data, error } = await endingProjections(
    withAuthor(
      rights === "all"
        ? supabase.rpc("set_event_teams", {
            p_event_id: eventId,
            p_template_id: templateId,
            p_teams: toMembersParam(teams),
          })
        : supabase.rpc("set_event_area_teams", {
            p_event_id: eventId,
            p_teams: toMembersParam(teams),
            p_any_user: currentUser.canEditEvents,
          }),
      currentUser.id,
    ),
    endProjections,
  );
  if (error) throw databaseError("set event teams", error, TEAMS_ERRORS);

  const result = z
    .object({ added: z.array(z.object({ user_id: z.uuid(), created_at: z.string() })) })
    .nullable()
    .parse(data);
  if (!result) return false;

  await queueEventAddedNotifications(
    eventId,
    result.added.filter((row) => row.user_id !== currentUser.id).map((row) => row.user_id),
  );
  return true;
}

/** An event admin or a leader of the group, who can see the event; null when they cannot see it. */
async function requireAreaEditorOf(eventId: string, areaId: string) {
  const editor = await requireTeamEditorOf(eventId);
  if (!editor) return null;
  if (!canManageGroup(editor.rights, areaId)) throw new ForbiddenError();
  return editor.user;
}

const areaTeamInputSchema = z.strictObject({
  userIds: z.array(idSchema).max(AREA_MEMBERS_MAX),
});

export type EventAreaTeamInput = z.input<typeof areaTeamInputSchema>;

/**
 * Saves the team of one group of the event, for the team planner: the other
 * groups and the template stay. For the event admins and the leaders of the
 * group. The same rules as `setEventTeams()` for the new and the removed
 * volunteers, their emails and their projections. Returns false if there is
 * no such event, or the signed-in user cannot see it.
 */
export async function setEventAreaTeam(
  eventId: string,
  areaId: string,
  input: unknown,
  { endProjections = false }: { endProjections?: boolean } = {},
): Promise<boolean> {
  const area = parseInput(idSchema, areaId);
  const currentUser = await requireAreaEditorOf(eventId, area);
  if (!currentUser) return false;
  const { userIds } = parseInput(areaTeamInputSchema, input);

  const { data, error } = await endingProjections(
    withAuthor(
      (await getMusicSupabase()).rpc("set_event_area_team", {
        p_event_id: eventId,
        p_area_id: area,
        p_user_ids: userIds,
        // A leader adds only the members of the group and of the groups below it.
        p_any_user: currentUser.canEditEvents,
      }),
      currentUser.id,
    ),
    endProjections,
  );
  if (error) throw databaseError("set event area team", error, TEAMS_ERRORS);

  const result = z
    .object({ added: z.array(z.object({ user_id: z.uuid(), created_at: z.string() })) })
    .nullable()
    .parse(data);
  if (!result) return false;

  await queueEventAddedNotifications(
    eventId,
    result.added.filter((row) => row.user_id !== currentUser.id).map((row) => row.user_id),
  );
  return true;
}

const areaNoteInputSchema = z.strictObject({
  note: z
    .string()
    .trim()
    .max(AREA_NOTE_MAX_LENGTH)
    .transform((note) => note || null),
});

export type EventAreaNoteInput = z.input<typeof areaNoteInputSchema>;

/**
 * Saves the text of one group of the event, e.g. "Sign up at Gábor". An
 * empty text removes it. The people of the group leave it, with the same
 * rules as `setEventAreaTeam()`. For the event admins and the leaders of the
 * group. Returns false if there is no such event, or the signed-in user
 * cannot see it.
 */
export async function setEventAreaNote(
  eventId: string,
  areaId: string,
  input: unknown,
  { endProjections = false }: { endProjections?: boolean } = {},
): Promise<boolean> {
  const area = parseInput(idSchema, areaId);
  const currentUser = await requireAreaEditorOf(eventId, area);
  if (!currentUser) return false;
  const { note } = parseInput(areaNoteInputSchema, input);

  const { data, error } = await endingProjections(
    withAuthor(
      (await getMusicSupabase()).rpc("set_event_area_note", {
        p_event_id: eventId,
        p_area_id: area,
        p_note: note,
      }),
      currentUser.id,
    ),
    endProjections,
  );
  if (error) throw databaseError("set event area note", error, TEAMS_ERRORS);
  return data !== null;
}

const teamNoteInputSchema = z.strictObject({
  note: z
    .string()
    .trim()
    .max(TEAM_NOTE_MAX_LENGTH)
    .transform((note) => note || null),
});

export type EventTeamNoteInput = z.input<typeof teamNoteInputSchema>;

/**
 * Saves the note on the teams of the event, e.g. "Baptism: two more ushers".
 * An empty note removes it. Returns false if there is no such event, or the
 * signed-in user cannot see it.
 */
export async function setEventTeamNote(eventId: string, input: unknown): Promise<boolean> {
  const currentUser = await requireEventAdminOf(eventId);
  if (!currentUser) return false;
  const { note } = parseInput(teamNoteInputSchema, input);

  const table = (await getMusicSupabase()).from("event_team_notes");
  const { error } = await withAuthor(
    note === null
      ? table.delete().eq("event_id", eventId)
      : table.upsert(
          { event_id: eventId, note, updated_at: new Date().toISOString() },
          { onConflict: "event_id" },
        ),
    currentUser.id,
  );
  // The event was deleted after the check.
  if (error?.code === "23503") return false;
  if (error) throw databaseError("set event team note", error);
  return true;
}

/** An event in a row of the team planner. */
export type TeamGridEventDTO = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  isPrivate: boolean;
  /** The volunteer template of the event, or null: then the event uses all groups. */
  template: GridTemplate | null;
};

export type TeamGridDTO = {
  range: DayRange;
  /** The events of the timeframe that the user can see, by their start, at most `MAX_GRID_EVENTS`. */
  events: TeamGridEventDTO[];
  /** Whether the timeframe has more events than `events`. */
  truncated: boolean;
  /** The groups in the order of the tree: all groups for an event admin, the led groups for a leader. */
  areas: ServiceAreaDTO[];
  /** The members of each group of `areas` with the members of the groups below it, for the people pickers. */
  groupMembers: Record<string, string[]>;
  /** The names (paths) of all groups by id: the cells have the teams of all groups, for the double bookings. */
  areaNames: Record<string, string>;
  /** Only the event admins change the notes on the teams. The leaders read them. */
  canEditEventNotes: boolean;
  /** The event admins add any user to a team. A leader adds only the members of the group and of the groups below it. */
  canAddAnyUser: boolean;
  cells: TeamGridCells;
  /** The texts in place of the people: `notes[eventId][areaId]`. */
  notes: TeamGridNotes;
  /** The notes on the teams of the events, by event id (the last column). */
  eventNotes: Record<string, string>;
  /** The people in the cells and the members of the groups. Emails only for the superadmins. */
  people: PersonDTO[];
};

const gridEventRowSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  is_private: z.boolean(),
  volunteer_template: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});

/** The groups of each of these templates, by template id. */
async function listTemplateAreas(templateIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (templateIds.length === 0) return result;
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("volunteer_template_areas")
    .select("template_id, area_id")
    .in("template_id", templateIds);
  if (error) throw databaseError("list template areas", error);
  for (const row of z.array(z.object({ template_id: z.uuid(), area_id: z.uuid() })).parse(data)) {
    const areaIds = result.get(row.template_id) ?? [];
    if (!areaIds.includes(row.area_id)) areaIds.push(row.area_id);
    result.set(row.template_id, areaIds);
  }
  return result;
}

/** Event ids in one read: 50 ids keep its URL short (about 2 KB). */
const GRID_EVENT_CHUNK = 50;
/** Rows in one read: the `max_rows` of the API (see `supabase/config.toml`), which cuts longer results. */
const GRID_PAGE_SIZE = 1000;

type GridPage = {
  data: unknown[] | null;
  error: { message: string; code?: string; hint?: string | null } | null;
};

/**
 * All the rows of a read for these events: the event ids in chunks, each
 * chunk in pages. `read` must sort the rows by a unique key, so that the
 * pages do not overlap.
 */
async function readForEvents(
  operation: string,
  eventIds: string[],
  read: (ids: string[], from: number, to: number) => PromiseLike<GridPage>,
): Promise<unknown[]> {
  const chunks: string[][] = [];
  for (let index = 0; index < eventIds.length; index += GRID_EVENT_CHUNK) {
    chunks.push(eventIds.slice(index, index + GRID_EVENT_CHUNK));
  }
  const results = await Promise.all(
    chunks.map(async (ids) => {
      const rows: unknown[] = [];
      for (let from = 0; ; from += GRID_PAGE_SIZE) {
        const { data, error } = await read(ids, from, from + GRID_PAGE_SIZE - 1);
        if (error) throw databaseError(operation, error);
        rows.push(...(data ?? []));
        if ((data?.length ?? 0) < GRID_PAGE_SIZE) return rows;
      }
    }),
  );
  return results.flat();
}

/** The team planner of a timeframe, for the event admins, the superadmins and the leaders (with their groups). */
export async function getTeamGrid(range: DayRange): Promise<TeamGridDTO> {
  const user = await requireGroupManager();
  const { start, end } = rangeBounds(range);
  const supabase = await getMusicSupabase();

  const [eventsResult, allAreas, rights, allMembers] = await Promise.all([
    visibleEventsFilter(user).then((filter) =>
      withFilter(
        supabase
          .from("events")
          .select(
            "id, title, starts_at, ends_at, is_private, volunteer_template:volunteer_templates (id, name)",
          )
          .gte("starts_at", start)
          .lt("starts_at", end),
        filter,
      )
        .order("starts_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(MAX_GRID_EVENTS + 1),
    ),
    listServiceAreas(),
    groupRightsOf(user),
    listGroupMemberIds(),
  ]);
  if (eventsResult.error) throw databaseError("list team planner events", eventsResult.error);
  const areas = allAreas.filter((area) => canManageGroup(rights, area.id));
  const groupMembers = Object.fromEntries(
    areas.map((area) => [area.id, allMembers.get(area.id) ?? []]),
  );
  const rows = z.array(gridEventRowSchema).parse(eventsResult.data).slice(0, MAX_GRID_EVENTS);
  const eventIds = rows.map((row) => row.id);
  const [templateAreas, members, texts, teamNotes] = await Promise.all([
    listTemplateAreas([...new Set(rows.flatMap((row) => row.volunteer_template?.id ?? []))]),
    readForEvents("list team planner teams", eventIds, (ids, from, to) =>
      supabase
        .from("event_volunteer_areas")
        .select("event_id, area_id, user_id")
        .in("event_id", ids)
        .order("event_id", { ascending: true })
        .order("area_id", { ascending: true })
        .order("position", { ascending: true })
        .order("user_id", { ascending: true })
        .range(from, to),
    ),
    readForEvents("list team planner notes", eventIds, (ids, from, to) =>
      supabase
        .from("event_area_notes")
        .select("event_id, area_id, note")
        .in("event_id", ids)
        .order("event_id", { ascending: true })
        .order("area_id", { ascending: true })
        .range(from, to),
    ),
    readForEvents("list team planner event notes", eventIds, (ids, from, to) =>
      supabase
        .from("event_team_notes")
        .select("event_id, note")
        .in("event_id", ids)
        .order("event_id", { ascending: true })
        .range(from, to),
    ),
  ]);
  const events: TeamGridEventDTO[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isPrivate: row.is_private,
    template: row.volunteer_template
      ? {
          name: row.volunteer_template.name,
          areaIds: templateAreas.get(row.volunteer_template.id) ?? [],
        }
      : null,
  }));

  const cells: TeamGridCells = {};
  const notes: TeamGridNotes = {};
  const eventNotes: Record<string, string> = {};
  for (const row of z.array(z.object({ event_id: z.uuid(), note: z.string() })).parse(teamNotes)) {
    eventNotes[row.event_id] = row.note;
  }
  for (const row of z
    .array(z.object({ event_id: z.uuid(), area_id: z.uuid(), user_id: z.uuid() }))
    .parse(members)) {
    const eventCells = (cells[row.event_id] ??= {});
    (eventCells[row.area_id] ??= []).push(row.user_id);
  }
  for (const row of z
    .array(z.object({ event_id: z.uuid(), area_id: z.uuid(), note: z.string() }))
    .parse(texts)) {
    // With both (a race of two old saves), the people win, as on the event page.
    if (cells[row.event_id]?.[row.area_id]?.length) continue;
    (notes[row.event_id] ??= {})[row.area_id] = row.note;
  }

  const userIds = [
    ...Object.values(cells).flatMap((eventCells) => Object.values(eventCells).flat()),
    ...Object.values(groupMembers).flat(),
  ];
  return {
    range,
    events,
    truncated: (eventsResult.data?.length ?? 0) > MAX_GRID_EVENTS,
    areas,
    groupMembers,
    areaNames: Object.fromEntries(allAreas.map((area) => [area.id, area.name])),
    canEditEventNotes: rights === "all",
    canAddAnyUser: rights === "all",
    cells,
    notes,
    eventNotes,
    people: await listPeople(userIds, { emails: user.canViewPeopleEmails }),
  };
}

/** The signed-in user's reply to an event they volunteer for (`yes`/`maybe`/`no`), or null: no reply or not a volunteer. */
export async function getMyReply(
  eventId: string,
): Promise<{ volunteer: boolean; reply: string | null }> {
  const user = await requireUser();
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_volunteers")
    .select("reply")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw databaseError("read my reply", error);
  return {
    volunteer: data !== null,
    reply: z.object({ reply: z.string().nullable() }).nullable().parse(data)?.reply ?? null,
  };
}
