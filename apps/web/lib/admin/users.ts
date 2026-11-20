import { slugify } from "@churchy/hu";
import {
  TENANT_ROLES,
  WORKSPACE_ROLES,
  type Member,
  type TenantRole,
  type WorkspaceRole,
} from "@churchy/contracts";

/**
 * Pure logic of the user management screen (D-26, FR-307/308): who counts where, the *last owner*
 * guard, the form field names and how a submitted form becomes a membership change. Permissions
 * are decided by `can()` (`site.users.manage`), never here.
 */

export const USER_ROLES: readonly TenantRole[] = TENANT_ROLES;
export const USER_WS_ROLES: readonly WorkspaceRole[] = WORKSPACE_ROLES;

/** Checkbox field name of a workspace role in the form. */
export const wsField = (role: WorkspaceRole): string => `ws_${role}`;

export const USER_FIELDS = [
  "name",
  "email",
  "role",
  "groups",
  ...USER_WS_ROLES.map(wsField),
] as const;

/** Where a member stands: invited and never signed in, active, or deactivated. */
export type MemberState = "active" | "invited" | "inactive";

export function memberState(member: Pick<Member, "active" | "user">): MemberState {
  if (!member.active) return "inactive";
  return member.user.lastLoginAt === null ? "invited" : "active";
}

/** Active members with any workspace role: they count against the workspace tier's cap. */
export function activeWorkspaceUsers(
  members: readonly Pick<Member, "active" | "wsRoles">[],
): number {
  return members.filter((m) => m.active && m.wsRoles.length > 0).length;
}

/** Active members with a website role: the editors the free plan caps. */
export function activeEditors(members: readonly Pick<Member, "active" | "role">[]): number {
  return members.filter((m) => m.active && m.role !== null).length;
}

/** Whether `userId` is the only active owner (the guard of FR-308). */
export function isLastActiveOwner(
  members: readonly Pick<Member, "active" | "role" | "userId">[],
  userId: string,
): boolean {
  // Membership data, not an actor: this mirrors the repository's own invariant (FR-308) so the UI
  // can disable the controls; what a user may do is still decided by `can()`.
  const owners = members.filter(
    // eslint-disable-next-line no-restricted-syntax -- last-owner invariant on membership rows
    (m) => m.active && m.role === "owner",
  );
  return owners.length === 1 && owners[0]?.userId === userId;
}

/** Website roles the change touches (the resource `can("site.users.manage")` is checked against). */
export function targetRolesOf(current: TenantRole | null, next: TenantRole | null): TenantRole[] {
  return [current, next].filter((r): r is TenantRole => r !== null);
}

/** The fields of a submitted user form. */
export interface UserFormInput {
  readonly role: TenantRole | null;
  readonly wsRoles: WorkspaceRole[];
  readonly groupIds: string[];
}

const isRole = (value: string): value is TenantRole =>
  (USER_ROLES as readonly string[]).includes(value);

/** Reads role, workspace roles and groups from form values; an unknown role is `undefined`. */
export function parseUserForm(values: Record<string, string>): UserFormInput | undefined {
  const raw = values["role"] ?? "";
  if (raw !== "" && !isRole(raw)) return undefined;
  return {
    role: raw === "" ? null : (raw as TenantRole),
    wsRoles: USER_WS_ROLES.filter((r) => values[wsField(r)] === "on"),
    groupIds: groupIdsOf(values["groups"] ?? ""),
  };
}

/** `Ifjúság, Kórus` → `["ifjusag", "korus"]` (groups are P1: ids are slugs of the typed names). */
export function groupIdsOf(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,\n]/)
        .map((g) => slugify(g.trim()))
        .filter((g) => g !== ""),
    ),
  ];
}

/** Form values of an existing member. */
export function memberValues(member?: Member): Record<string, string> {
  const values: Record<string, string> = {
    name: member?.user.name ?? "",
    email: member?.user.email ?? "",
    role: member?.role ?? "",
    groups: member?.groupIds.join(", ") ?? "",
  };
  for (const r of USER_WS_ROLES) values[wsField(r)] = member?.wsRoles.includes(r) ? "on" : "";
  return values;
}
