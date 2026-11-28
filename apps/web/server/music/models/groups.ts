import "server-only";

import { z } from "zod";

import {
  canManageChildren,
  canManageGroup,
  canMoveOrDelete,
  GROUP_MEMBERS_MAX,
  GROUP_NAME_MAX_LENGTH,
  GROUP_ROLES,
  GROUPS_MAX,
  pathLabel,
  treeOrder,
  type GroupDetailsDTO,
  type GroupDTO,
  type GroupNode,
  type GroupOptionDTO,
  type GroupRights,
  type GroupRole,
  type GroupUses,
} from "@/lib/music/groups";
import type { ServiceAreaDTO } from "@/lib/music/volunteer-templates";
import {
  getLedGroupIds,
  requireGroupManager,
  requireGroupRoleAdmin,
  type CurrentUser,
} from "@/server/music/auth";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/music/errors";
import { getMusicSupabase } from "@/server/music/db";
import { zodMessage } from "@/server/music/zod-i18n";
import { listPeople, type PersonDTO } from "./profiles";
import { databaseError, idList, idSchema, isId, parseInput, requiredText } from "./shared";

// Groups: the service areas as a tree, e.g. Music → Band → Vocals, under one
// root group of all users (see the migrations `groups` and `root_group`, and
// `src/lib/groups.ts`). The event admins and the
// superadmins manage all groups. A leader manages the groups that they lead:
// the names, the members and the leaders, and the groups below them. Only
// the superadmins give roles to the groups, and only they add people to a
// group with roles (see the migration `group_fixes`).

const nameSchema = requiredText(GROUP_NAME_MAX_LENGTH);
const parentSchema = idSchema.nullable();

const DUPLICATE_GROUP = zodMessage(({ m }) => m.server.groups.duplicateGroup);
const DUPLICATE_MEMBER = zodMessage(({ m }) => m.server.groups.duplicateMember);

const membersInputSchema = z
  .array(z.strictObject({ userId: idSchema, isLeader: z.boolean() }))
  .max(GROUP_MEMBERS_MAX)
  .refine((members) => new Set(members.map((member) => member.userId)).size === members.length, {
    message: DUPLICATE_MEMBER,
  });

const rolesInputSchema = z.array(z.enum(GROUP_ROLES)).max(GROUP_ROLES.length);

const groupRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  parent_id: z.uuid().nullable(),
  is_root: z.boolean(),
});

const NAME_TAKEN = () =>
  new ValidationError([{ path: "name", message: ({ m }) => m.server.groups.nameTaken }]);
// A group or a user was deleted after the page loaded.
const GROUP_MISSING = () => new ConflictError(({ m }) => m.server.groups.groupMissing);
const TOO_MANY_GROUPS = () =>
  new ConflictError(({ m, format }) => format(m.server.groups.tooManyGroups, { max: GROUPS_MAX }));
// A group with roles gives them to its members: only a superadmin adds people to it.
const ROLES_NEED_SUPERADMIN = () =>
  new ConflictError(({ m }) => m.server.groups.rolesNeedSuperadmin);
// Only a superadmin or a leader of the group (or of a group above it) takes roles away.
const REMOVE_NEEDS_LEADER = () => new ConflictError(({ m }) => m.server.groups.removeNeedsLeader);
// A leader of the root group leads all groups: only a superadmin chooses them.
const ROOT_LEADERS_NEED_SUPERADMIN = () =>
  new ConflictError(({ m }) => m.server.groups.rootLeadersNeedSuperadmin);
// A removed member or a moved group would lose an open projection of an event (see the migration `event_scopes_fixes`).
const PROJECTION_USER = () => new ConflictError(({ m }) => m.server.groups.projectionUser);
// A delete has no name to check: a `23505` is not "name taken".
const DELETE_ERRORS = {
  "23503": GROUP_MISSING,
  "P0001:projection_user": PROJECTION_USER,
  "P0001:group_has_children": () => new ConflictError(({ m }) => m.server.groups.hasChildren),
  "P0001:group_root": () => new ConflictError(({ m }) => m.server.groups.root),
  "P0001:group_roles_remove": REMOVE_NEEDS_LEADER,
};
const GROUP_ERRORS = {
  ...DELETE_ERRORS,
  "23505": NAME_TAKEN,
  "P0001:too_many_service_areas": TOO_MANY_GROUPS,
  "P0001:group_cycle": () => new ConflictError(({ m }) => m.server.groups.cycle),
  "P0001:group_roles": ROLES_NEED_SUPERADMIN,
};

/** All groups in the order of their siblings. The caller checks the rights. */
export async function listGroups(): Promise<GroupDTO[]> {
  // The root group exists from the first use of the groups (music_root_area_id() creates it).
  const ensured = await (await getMusicSupabase()).rpc("music_root_area_id");
  if (ensured.error) throw databaseError("find the root group", ensured.error);
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("service_areas")
    .select("id, name, parent_id, is_root")
    .order("position")
    .order("name");
  if (error) throw databaseError("list groups", error);
  return z
    .array(groupRowSchema)
    .parse(data)
    .map((row) => ({ id: row.id, name: row.name, parentId: row.parent_id, isRoot: row.is_root }));
}

/**
 * All groups in the order of the tree, each with its path as its name, e.g.
 * "Music › Band": for the lists of the templates, the teams and the courses.
 * Without the root group, unless `withRoot`: a team or a template of all
 * users means nothing, but a course for all users has the root group. The
 * caller checks the rights.
 */
export async function listServiceAreas({ withRoot = false }: { withRoot?: boolean } = {}): Promise<
  ServiceAreaDTO[]
> {
  return treeOrder(await listGroups())
    .filter((group) => withRoot || !group.isRoot)
    .map((group) => ({ id: group.id, name: pathLabel(group) }));
}

/** The groups that the user manages: "all" for the event admins and the superadmins, else the groups that they lead. */
export async function groupRightsOf(user: CurrentUser): Promise<GroupRights> {
  if (user.canEditEvents) return "all";
  if (!user.leadsGroups) return new Set();
  return getLedGroupIds(user.id);
}

/**
 * The members of each group with the members of the groups below it, by
 * group id: the people that the pickers of the teams suggest. The caller
 * checks the rights.
 */
export async function listGroupMemberIds(): Promise<Map<string, string[]>> {
  // One row for each group (at most `GROUPS_MAX`), so the row limit of the API does not cut it.
  const { data, error } = await (await getMusicSupabase()).rpc("area_member_ids");
  if (error) throw databaseError("list group members", error);
  return new Map(
    z
      .array(z.object({ area_id: z.uuid(), user_ids: z.array(z.uuid()) }))
      .parse(data)
      .map((row) => [row.area_id, row.user_ids]),
  );
}

const MEMBERS_PAGE_SIZE = 1000;

/** All rows of `service_area_members`, in pages: the API returns at most `max_rows` rows at a time. */
async function listAllGroupMembers(): Promise<
  { area_id: string; user_id: string; is_leader: boolean }[]
> {
  const rowSchema = z.array(
    z.object({ area_id: z.uuid(), user_id: z.uuid(), is_leader: z.boolean() }),
  );
  const rows: z.output<typeof rowSchema> = [];
  for (let from = 0; ; from += MEMBERS_PAGE_SIZE) {
    const { data, error } = await (
      await getMusicSupabase()
    )
      .from("service_area_members")
      .select("area_id, user_id, is_leader")
      .order("created_at")
      .order("area_id")
      .order("user_id")
      .range(from, from + MEMBERS_PAGE_SIZE - 1);
    if (error) throw databaseError("list group members", error);
    const page = rowSchema.parse(data);
    rows.push(...page);
    if (page.length < MEMBERS_PAGE_SIZE) return rows;
  }
}

/**
 * All groups in the order of the tree, and the rights of the user: for the
 * group pickers of the templates and the courses. For the event admins and
 * the leaders.
 */
export async function getGroupTree(): Promise<{ groups: GroupNode[]; rights: "all" | string[] }> {
  const user = await requireGroupManager();
  const [groups, rights] = await Promise.all([listGroups(), groupRightsOf(user)]);
  return { groups: treeOrder(groups), rights: rights === "all" ? "all" : [...rights] };
}

export type GroupsPageDTO = {
  /**
   * The groups that the user can see, in the order of the tree, with their
   * members and roles. `givesRoles`: the group or a group above it has a role.
   */
  groups: (GroupDetailsDTO & Pick<GroupNode, "depth" | "path"> & { givesRoles: boolean })[];
  /** "all", or the ids of the groups that the user leads. */
  rights: "all" | string[];
  /**
   * The groups that the user leads, with the groups below them, also for an
   * event admin: only they (and the superadmins) take members away from a
   * group with roles.
   */
  ledGroupIds: string[];
  /** The members of the groups. Emails only for the superadmins. */
  people: PersonDTO[];
  /** Only the superadmins give roles to the groups and choose the leaders of the root group. */
  canEditRoles: boolean;
};

/**
 * The groups page: all groups for the event admins and the superadmins, the
 * led groups for a leader. Each group with the path from the top, so a
 * leader sees where their groups are.
 */
export async function getGroupsPage(): Promise<GroupsPageDTO> {
  const user = await requireGroupManager();
  const supabase = await getMusicSupabase();
  const [groups, rights, led, members, roles] = await Promise.all([
    listGroups(),
    groupRightsOf(user),
    user.leadsGroups ? getLedGroupIds(user.id) : new Set<string>(),
    listAllGroupMembers(),
    // At most `GROUPS_MAX` × the group roles: below the row limit of the API.
    supabase.from("service_area_roles").select("area_id, role"),
  ]);
  if (roles.error) throw databaseError("list group roles", roles.error);

  const visible = treeOrder(groups).filter((group) => canManageGroup(rights, group.id));
  const visibleIds = new Set(visible.map((group) => group.id));

  const membersByGroup = new Map<string, GroupDetailsDTO["members"]>();
  for (const row of members) {
    if (!visibleIds.has(row.area_id)) continue;
    const list = membersByGroup.get(row.area_id) ?? [];
    list.push({ userId: row.user_id, isLeader: row.is_leader });
    membersByGroup.set(row.area_id, list);
  }
  const rolesByGroup = new Map<string, GroupRole[]>();
  for (const row of z
    .array(z.object({ area_id: z.uuid(), role: z.enum(GROUP_ROLES) }))
    .parse(roles.data)) {
    rolesByGroup.set(row.area_id, [...(rolesByGroup.get(row.area_id) ?? []), row.role]);
  }

  const rolesOf = inheritedRoles(groups, rolesByGroup);

  const people = await listPeople(
    [...membersByGroup.values()].flat().map((member) => member.userId),
    { emails: user.canViewPeopleEmails },
  );
  return {
    groups: visible.map((group) => ({
      id: group.id,
      name: group.name,
      parentId: group.parentId,
      isRoot: group.isRoot,
      depth: group.depth,
      path: group.path,
      members: membersByGroup.get(group.id) ?? [],
      roles: GROUP_ROLES.filter((role) => rolesByGroup.get(group.id)?.includes(role)),
      givesRoles: rolesOf(group.id).length > 0,
    })),
    rights: rights === "all" ? "all" : [...rights],
    ledGroupIds: [...led],
    people,
    canEditRoles: user.canManageGroupRoles,
  };
}

/** The user and their rights, or a `ForbiddenError` when `allowed` is false for these rights. */
async function requireRights(allowed: (rights: GroupRights) => boolean): Promise<CurrentUser> {
  const user = await requireGroupManager();
  if (!allowed(await groupRightsOf(user))) throw new ForbiddenError();
  return user;
}

/** The parent of the group, or undefined if there is no such group. */
async function parentOf(id: string): Promise<string | null | undefined> {
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("service_areas")
    .select("parent_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw databaseError("get group", error);
  return data ? z.uuid().nullable().parse(data.parent_id) : undefined;
}

/** Adds a group under `parentId`, after the others. Returns its id. */
export async function createGroup(parentId: unknown, name: unknown): Promise<string> {
  const input = parseInput(z.strictObject({ parentId: idSchema, name: nameSchema }), {
    parentId,
    name,
  });
  await requireRights((rights) => canManageChildren(rights, input.parentId));

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("create_service_area", { p_parent_id: input.parentId, p_name: input.name });
  if (error) throw databaseError("create group", error, GROUP_ERRORS);
  return z.uuid().parse(data);
}

/** Returns false if there is no such group. */
export async function renameGroup(id: string, name: unknown): Promise<boolean> {
  if (!isId(id)) return false;
  const groupName = parseInput(z.strictObject({ name: nameSchema }), { name }).name;
  await requireRights((rights) => canManageGroup(rights, id));

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("service_areas")
    .update({ name: groupName })
    .eq("id", id)
    .select("id");
  if (error) throw databaseError("rename group", error, GROUP_ERRORS);
  return data.length > 0;
}

/**
 * Puts the group under `parentId` (null: at the top), in the order of `ids`:
 * the ids of all groups there, with this one. Returns false if there is no
 * such group, or the groups there changed meanwhile, e.g. in another tab.
 * The user must be able to move the group and to manage the groups there.
 */
export async function placeGroup(id: string, parentId: unknown, ids: unknown): Promise<boolean> {
  if (!isId(id)) return false;
  const parent = parseInput(parentSchema, parentId);
  const order = parseInput(idList(GROUPS_MAX, DUPLICATE_GROUP), ids);
  if (!order.includes(id)) return false;
  const current = await parentOf(id);
  if (current === undefined) return false;
  const user = await requireRights(
    (rights) =>
      canManageChildren(rights, parent) &&
      (current === parent || canMoveOrDelete(rights, { parentId: current })),
  );

  // The move and the order in one transaction. Only a superadmin moves members under a group with other roles.
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("place_service_area", {
    p_id: id,
    p_parent_id: parent,
    p_ids: order,
    p_grant_roles: user.canManageGroupRoles,
    p_actor_id: user.id,
  });
  if (error) throw databaseError("place group", error, GROUP_ERRORS);
  return z.boolean().parse(data);
}

/** Deletes a group without sub-groups, also from the templates, the teams and the courses. Returns false if there is no such group. */
export async function deleteGroup(id: string): Promise<boolean> {
  if (!isId(id)) return false;
  const parent = await parentOf(id);
  if (parent === undefined) return false;
  const user = await requireRights((rights) => canMoveOrDelete(rights, { parentId: parent }));

  // Under the lock of the tree. A group with roles and members: only a superadmin or a leader there.
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("delete_service_area", {
    p_id: id,
    p_grant_roles: user.canManageGroupRoles,
    p_actor_id: user.id,
  });
  if (error) throw databaseError("delete group", error, DELETE_ERRORS);
  return z.boolean().parse(data);
}

/** What uses the group, for the warning before a delete. */
export async function countGroupUses(id: string): Promise<GroupUses> {
  const none = {
    templates: 0,
    events: 0,
    scopedEvents: 0,
    scopedEventsOnly: 0,
    courses: 0,
    members: 0,
    children: 0,
  };
  if (!isId(id)) return none;
  await requireRights((rights) => canManageGroup(rights, id));
  const { data, error } = await (await getMusicSupabase()).rpc("service_area_uses", { p_id: id });
  if (error) throw databaseError("count group uses", error);
  const {
    scoped_events: scopedEvents,
    scoped_events_only: scopedEventsOnly,
    ...uses
  } = z
    .object({
      templates: z.number(),
      events: z.number(),
      // Missing before the migration `event_scopes`.
      scoped_events: z.number().default(0),
      // Missing before the migration `event_scopes_fixes`: then each event gets the parent group.
      scoped_events_only: z.number().optional(),
      courses: z.number(),
      members: z.number(),
      children: z.number(),
    })
    .parse(data);
  return { ...uses, scopedEvents, scopedEventsOnly: scopedEventsOnly ?? scopedEvents };
}

/**
 * Replaces the members and the leaders of the group. Returns false if there
 * is no such group. A group with roles (its own or from a group above it)
 * gives them to its members: only a superadmin adds people to it, and only a
 * superadmin or a leader of the group (or of a group above it) removes people
 * or changes its leaders. Only a superadmin changes the leaders of the root
 * group (see the migration `group_member_rights`).
 */
export async function setGroupMembers(id: string, input: unknown): Promise<boolean> {
  if (!isId(id)) return false;
  const members = parseInput(membersInputSchema, input);
  const user = await requireRights((rights) => canManageGroup(rights, id));

  // The database checks under the lock of the tree whether `user` leads the group or a group above it.
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("set_service_area_members", {
    p_area_id: id,
    p_members: members.map((member) => ({ user_id: member.userId, is_leader: member.isLeader })),
    p_grant_roles: user.canManageGroupRoles,
    p_actor_id: user.id,
  });
  if (error) {
    throw databaseError("set group members", error, {
      "23503": GROUP_MISSING,
      "P0001:group_roles": ROLES_NEED_SUPERADMIN,
      "P0001:group_roles_remove": REMOVE_NEEDS_LEADER,
      "P0001:root_leaders": ROOT_LEADERS_NEED_SUPERADMIN,
      "P0001:projection_user": PROJECTION_USER,
    });
  }
  return z.boolean().parse(data);
}

/** Replaces the roles of the group: all members of the group and of the groups below it have them. Superadmins only. */
export async function setGroupRoles(id: string, input: unknown): Promise<boolean> {
  await requireGroupRoleAdmin();
  if (!isId(id)) return false;
  const roles = parseInput(rolesInputSchema, input);

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("set_service_area_roles", { p_area_id: id, p_roles: [...new Set(roles)] });
  if (error) throw databaseError("set group roles", error, GROUP_ERRORS);
  return z.boolean().parse(data);
}

/**
 * All groups but the root group, in the order of the tree, one level higher,
 * each with the roles that it gives: for the group picker of a new user.
 * Superadmins only.
 */
export async function listGroupOptions(): Promise<GroupOptionDTO[]> {
  await requireGroupRoleAdmin();
  const [groups, roles] = await Promise.all([
    listGroups(),
    // At most `GROUPS_MAX` × the group roles: below the row limit of the API.
    (await getMusicSupabase()).from("service_area_roles").select("area_id, role"),
  ]);
  if (roles.error) throw databaseError("list group roles", roles.error);

  const own = new Map<string, Set<GroupRole>>();
  for (const row of z
    .array(z.object({ area_id: z.uuid(), role: z.enum(GROUP_ROLES) }))
    .parse(roles.data)) {
    own.set(row.area_id, (own.get(row.area_id) ?? new Set()).add(row.role));
  }
  const rolesOf = inheritedRoles(groups, own);

  return treeOrder(groups).flatMap((group) =>
    group.isRoot ? [] : [{ ...group, depth: group.depth - 1, roles: rolesOf(group.id) }],
  );
}

/**
 * The roles of a group and of the groups above it, in the order of
 * `GROUP_ROLES`, from the own roles of each group. A cycle cannot be in the
 * database, but the loop must still end.
 */
function inheritedRoles(
  groups: readonly { id: string; parentId: string | null }[],
  own: ReadonlyMap<string, Iterable<GroupRole>>,
): (id: string) => GroupRole[] {
  const parents = new Map(groups.map((group) => [group.id, group.parentId]));
  return (id) => {
    const result = new Set<GroupRole>();
    const seen = new Set<string>();
    for (
      let current: string | null | undefined = id;
      current && !seen.has(current);
      current = parents.get(current)
    ) {
      seen.add(current);
      for (const role of own.get(current) ?? []) result.add(role);
    }
    return GROUP_ROLES.filter((role) => result.has(role));
  };
}

/**
 * The roles that the user has from their groups, each with the groups that
 * give it (paths, e.g. "Music › Band"), for the users page. Superadmins only.
 */
export async function listGroupRolesOf(
  userId: string,
): Promise<{ role: GroupRole; groups: string[] }[]> {
  await requireGroupRoleAdmin();
  if (!isId(userId)) return [];
  const supabase = await getMusicSupabase();
  const [groups, memberAreas, roles] = await Promise.all([
    listGroups(),
    supabase.rpc("member_area_ids", { p_user_id: userId }),
    supabase.from("service_area_roles").select("area_id, role"),
  ]);
  if (memberAreas.error) throw databaseError("list groups of user", memberAreas.error);
  if (roles.error) throw databaseError("list group roles", roles.error);

  const mine = new Set(
    z
      .array(z.object({ id: z.uuid() }))
      .parse(memberAreas.data)
      .map((row) => row.id),
  );
  const labels = new Map(treeOrder(groups).map((group) => [group.id, pathLabel(group)]));
  const result = new Map<GroupRole, string[]>();
  for (const row of z
    .array(z.object({ area_id: z.uuid(), role: z.enum(GROUP_ROLES) }))
    .parse(roles.data)) {
    if (!mine.has(row.area_id)) continue;
    result.set(row.role, [...(result.get(row.role) ?? []), labels.get(row.area_id) ?? ""]);
  }
  return GROUP_ROLES.flatMap((role) => {
    const names = result.get(role);
    return names ? [{ role, groups: names.sort() }] : [];
  });
}

/** The roles that each group gives (own roles only), for the roles editor. */
export async function listGroupRolesByGroup(): Promise<Map<string, GroupRole[]>> {
  await requireGroupManager();
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("service_area_roles")
    .select("area_id, role");
  if (error) throw databaseError("list group roles", error);
  const result = new Map<string, GroupRole[]>();
  for (const row of z
    .array(z.object({ area_id: z.uuid(), role: z.enum(GROUP_ROLES) }))
    .parse(data)) {
    result.set(row.area_id, [...(result.get(row.area_id) ?? []), row.role]);
  }
  return result;
}
