// The groups of an event (see the migration `event_scopes`). An event of the
// root group is for all users. An event of other groups is only for the
// members of these groups and of the groups below them. The volunteers, the
// user who added the event and the superadmins always see it. A superadmin
// gives any group to an event; an event admin only the groups that they are a
// member of (with the groups above them and the root group).

/** At most this many groups for an event. Groups are at most `GROUPS_MAX`. */
export const EVENT_AREAS_MAX = 50;

/** A group of the "Groups" field. */
export type EventGroupOption = {
  id: string;
  /** The path of the group, e.g. "Music › Band", or the name of the root group. */
  label: string;
  isRoot: boolean;
};

/** The data of the "Groups" field of the event forms. */
export type EventScopeOptions = {
  /** All groups in the order of the tree, the root group first. */
  groups: EventGroupOption[];
  /** The groups that the user can add or remove: "all" for a superadmin, else their ids. */
  editable: "all" | string[];
};

/** The root group alone: the groups of a new event. Empty without a root group. */
export function defaultEventAreaIds(options: EventScopeOptions): string[] {
  const root = options.groups.find((group) => group.isRoot);
  return root ? [root.id] : [];
}

/** The user can add or remove the group (see `forbiddenEventAreaChanges()`). */
export function canChangeEventArea(options: EventScopeOptions, id: string): boolean {
  return options.editable === "all" || options.editable.includes(id);
}

/**
 * Checks or unchecks a group. The root group means all users, so it excludes
 * the other groups: a check on the root group removes all other groups (each
 * user who can change the event can make it an event for all users), and a
 * check on another group removes the root group. `locked`: the groups of the
 * event that the user cannot change. Only the root group removes them, and
 * they come back without it (see `forbiddenEventAreaChanges()`).
 */
export function toggleEventArea(
  areaIds: readonly string[],
  id: string,
  checked: boolean,
  options: EventScopeOptions,
  locked: readonly string[] = [],
): string[] {
  const rootId = options.groups.find((group) => group.isRoot)?.id;
  if (checked && id === rootId) return [id];
  const next = checked
    ? [...areaIds.filter((areaId) => areaId !== id && areaId !== rootId), id]
    : areaIds.filter((areaId) => areaId !== id);
  return [...locked.filter((areaId) => !next.includes(areaId)), ...next];
}

/** The groups of the event that the user cannot change. `areaIds`: the groups that the event has. */
export function lockedEventAreas(areaIds: readonly string[], options: EventScopeOptions): string[] {
  return areaIds.filter((id) => !canChangeEventArea(options, id));
}

/**
 * The groups that a change adds or removes and that the user cannot change,
 * or an empty list. The root group alone (an event for all users) needs no
 * rights: with it the event goes to more users, not fewer. `rootId`: the id
 * of the root group.
 */
export function forbiddenEventAreaChanges(
  next: readonly string[],
  previous: readonly string[],
  rights: "all" | ReadonlySet<string>,
  rootId: string | null,
): string[] {
  if (rights === "all") return [];
  if (rootId !== null && next.includes(rootId)) return [];
  const before = new Set(previous);
  const after = new Set(next);
  return [
    ...next.filter((id) => !before.has(id)),
    ...previous.filter((id) => !after.has(id)),
  ].filter((id) => !rights.has(id));
}

/** The same groups, in any order. */
export function sameEventAreas(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return set.size === new Set(b).size && b.every((id) => set.has(id));
}

/**
 * The labels of the groups of an event, for its badge: empty for an event of
 * all users. `labels`: the labels of the groups without the root group. A
 * missing label (a group deleted since) is left out.
 */
export function eventGroupLabels(
  areaIds: readonly string[] | undefined,
  labels: Readonly<Record<string, string>>,
): string[] {
  return (areaIds ?? []).flatMap((id) => (labels[id] === undefined ? [] : [labels[id]]));
}
