// Groups: a tree of the service areas, e.g. Music → Band → Vocals (see
// `src/server/models/groups.ts` and the migrations `groups` and
// `root_group`). One root group is above all the other groups: every user is
// a member of it, and what is for everyone, e.g. a course, has it. A member
// of a group counts as a member of all the groups above it. A leader leads
// the group and all the groups below it. Keep the limits in sync with the
// migrations.

export const GROUP_NAME_MAX_LENGTH = 60;
export const GROUPS_MAX = 200;
export const GROUP_MEMBERS_MAX = 500;

/** The roles that a group can give to its members: all roles but superadmin. */
export const GROUP_ROLES = ["song_admin", "event_admin", "music_leader", "course_admin"] as const;

export type GroupRole = (typeof GROUP_ROLES)[number];

/**
 * A group, in the order of its siblings. `parentId`: the group above it, null
 * only for the root group (`isRoot`).
 */
export type GroupDTO = { id: string; name: string; parentId: string | null; isRoot: boolean };

/** A group in the order of the tree, with the names of the groups above it. */
export type GroupNode = GroupDTO & {
  /** 0 at the top. */
  depth: number;
  /** The names from the top to the group, e.g. ["Music", "Band"], without the root group. */
  path: string[];
};

export type GroupMemberDTO = { userId: string; isLeader: boolean };

/** A group on the groups page: its direct members and its roles. */
export type GroupDetailsDTO = GroupDTO & { members: GroupMemberDTO[]; roles: GroupRole[] };

/**
 * A group in the group picker of a new user: without the root group, one
 * level higher. `roles`: the roles that a member gets from this group and
 * from the groups above it.
 */
export type GroupOptionDTO = GroupNode & { roles: GroupRole[] };

/**
 * How many things use a group, for the warning before its delete.
 * `scopedEvents`: the events for this group, `scopedEventsOnly`: those of
 * them for this group alone. These get the group above it, the others only
 * lose the group (see the migrations `event_scopes` and `event_scopes_fixes`).
 */
export type GroupUses = {
  templates: number;
  events: number;
  scopedEvents: number;
  scopedEventsOnly: number;
  courses: number;
  members: number;
  children: number;
};

/**
 * The groups that a user can manage: "all" for the event admins and the
 * superadmins, else the groups that they lead (with all the groups below
 * them, see `led_area_ids()`).
 */
export type GroupRights = "all" | ReadonlySet<string>;

/** The separator of the names in a path, e.g. "Music › Band". */
const PATH_SEPARATOR = " › ";

/**
 * The groups in the order of the tree: each group, then the groups below it.
 * `groups` must be in the order of the siblings. A group whose parent is
 * missing counts as a group at the top. The paths leave out the root group.
 */
export function treeOrder<Group extends GroupDTO>(
  groups: readonly Group[],
): (Group & { depth: number; path: string[] })[] {
  const ids = new Set(groups.map((group) => group.id));
  const children = new Map<string | null, Group[]>();
  for (const group of groups) {
    const parent = group.parentId !== null && ids.has(group.parentId) ? group.parentId : null;
    const siblings = children.get(parent);
    if (siblings) siblings.push(group);
    else children.set(parent, [group]);
  }

  const result: (Group & { depth: number; path: string[] })[] = [];
  const seen = new Set<string>();
  const visit = (parent: string | null, depth: number, path: string[]) => {
    for (const group of children.get(parent) ?? []) {
      // A cycle cannot be in the database, but the order must still end.
      if (seen.has(group.id)) continue;
      seen.add(group.id);
      result.push({ ...group, depth, path: [...path, group.name] });
      visit(group.id, depth + 1, group.isRoot ? [] : [...path, group.name]);
    }
  };
  visit(null, 0, []);
  return result;
}

/** The path of a group as one text, e.g. "Music › Band". */
export function pathLabel(node: Pick<GroupNode, "path">): string {
  return node.path.join(PATH_SEPARATOR);
}

/** The user can rename the group, and change its members and its leaders. */
export function canManageGroup(rights: GroupRights, id: string): boolean {
  return rights === "all" || rights.has(id);
}

/**
 * The user can add a group under `parentId`, or change the order there. Null
 * (above the root group): never.
 */
export function canManageChildren(rights: GroupRights, parentId: string | null): boolean {
  return parentId !== null && (rights === "all" || rights.has(parentId));
}

/**
 * The user can delete or move the group: it must be below a group that they
 * lead. A leader cannot delete or move the group where they are a leader at
 * the top, and nobody can delete or move the root group.
 */
export function canMoveOrDelete(rights: GroupRights, group: Pick<GroupDTO, "parentId">): boolean {
  return canManageChildren(rights, group.parentId);
}

/** A row of the tree for a drag: the group, its parent and its depth. */
type TreeRow = Pick<GroupNode, "id" | "parentId" | "depth">;

/** Where a dragged group goes: its parent, and the sibling before it (null: first). */
type DropPlace = { depth: number; parentId: string | null; afterId: string | null };

/**
 * The place of a dragged group in the tree. `rows`: the rows on the screen in
 * the order of the tree, without the dragged group and the groups below it.
 * `index`: the place in `rows` where it goes. `wantedDepth`: the depth from
 * the pointer; the result keeps it between the depths that the neighbours
 * allow. Null when no parent fits, e.g. above the first group of a leader
 * whose parent they cannot see.
 */
export function projectDrop(
  rows: readonly TreeRow[],
  index: number,
  wantedDepth: number,
): DropPlace | null {
  const previous = index > 0 ? rows[index - 1] : undefined;
  const next = rows[index];
  const max = previous ? previous.depth + 1 : (next?.depth ?? 0);
  const min = next ? Math.min(next.depth, max) : 0;
  const depth = Math.min(Math.max(wantedDepth, min), max);

  for (let i = index - 1; i >= 0; i--) {
    const row = rows[i]!;
    if (row.depth === depth) return { depth, parentId: row.parentId, afterId: row.id };
    if (row.depth === depth - 1) return { depth, parentId: row.id, afterId: null };
    if (row.depth < depth - 1) return null;
  }
  if (next && next.depth === depth) return { depth, parentId: next.parentId, afterId: null };
  return depth === 0 ? { depth, parentId: null, afterId: null } : null;
}

/** The ids of the groups under `parentId` with the group `id` after `afterId` (null: first). */
export function siblingOrder(
  groups: readonly GroupDTO[],
  id: string,
  parentId: string | null,
  afterId: string | null,
): string[] {
  const ids = groups
    .filter((group) => group.parentId === parentId && group.id !== id)
    .map((group) => group.id);
  ids.splice(afterId === null ? 0 : ids.indexOf(afterId) + 1, 0, id);
  return ids;
}

/**
 * The groups in the order of the tree after the group `id` moved under
 * `parentId`, with its new siblings in the order of `ids`. Each group whose
 * parent is not in `groups` (a leader sees only part of the tree) keeps its
 * depth and its path.
 */
export function applyPlace<Group extends GroupNode>(
  groups: readonly Group[],
  id: string,
  parentId: string | null,
  ids: readonly string[],
): Group[] {
  const moved = groups.map((group) => (group.id === id ? { ...group, parentId } : group));
  const present = new Set(moved.map((group) => group.id));
  // The groups at the top of what the user sees: the root group, or the top of a branch of a leader.
  const isTop = (group: Group) => group.parentId === null || !present.has(group.parentId);
  const rank = new Map(ids.map((other, index) => [other, index]));
  const children = (parent: string | null) => {
    const list =
      parent === null ? moved.filter(isTop) : moved.filter((group) => group.parentId === parent);
    return parentId === parent
      ? list.toSorted((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
      : list;
  };

  const result: Group[] = [];
  const seen = new Set<string>();
  const visit = (group: Group, depth: number, path: string[]) => {
    if (seen.has(group.id)) return;
    seen.add(group.id);
    result.push({ ...group, depth, path });
    for (const child of children(group.id))
      visit(child, depth + 1, group.isRoot ? [child.name] : [...path, child.name]);
  };
  // Each group at the top keeps its depth and its path.
  for (const top of children(null)) visit(top, top.depth, top.path);
  return result;
}
