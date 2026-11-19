import { EmailSchema, type TenantRole, type WorkspaceRole } from "@churchy/contracts";
import type { ModuleSelection, SetupModuleId } from "./modules";

/**
 * Step 4 of the setup wizard: people to invite. Mock only — the draft keeps the list in the
 * browser, nothing is sent (fictitious addresses in the demo).
 */

export type InviteRole = Extract<TenantRole, "admin" | "editor" | "office">;
export type InviteWorkspaceRole = Extract<
  WorkspaceRole,
  "employee" | "musicLeader" | "roomManager" | "hrHandler"
>;
export type InviteRoleKey = InviteRole | InviteWorkspaceRole;

export interface InviteRoleOption {
  key: InviteRoleKey;
  /** The module the role is for; the role is offered only when it is switched on. */
  module?: SetupModuleId;
}

export const INVITE_ROLES: readonly InviteRoleOption[] = [
  { key: "admin" },
  { key: "editor" },
  { key: "office" },
  { key: "employee" },
  { key: "musicLeader", module: "worship" },
  { key: "roomManager", module: "rooms" },
  { key: "hrHandler", module: "hr" },
];

export const MAX_INVITES = 20;

export interface Invite {
  email: string;
  role: InviteRoleKey;
}

export function availableRoles(selection: ModuleSelection): InviteRoleOption[] {
  return INVITE_ROLES.filter((r) => r.module === undefined || selection[r.module]);
}

export type InviteError = "email" | "duplicate" | "role" | "limit";

/** Adds an invite, or says why not. E-mail addresses are compared case-insensitively. */
export function addInvite(
  list: readonly Invite[],
  input: { email: string; role: string },
  selection: ModuleSelection,
): { ok: true; list: Invite[] } | { ok: false; error: InviteError } {
  const email = input.email.trim();
  if (!EmailSchema.safeParse(email).success) return { ok: false, error: "email" };
  const role = availableRoles(selection).find((r) => r.key === input.role);
  if (!role) return { ok: false, error: "role" };
  if (list.length >= MAX_INVITES) return { ok: false, error: "limit" };
  if (list.some((i) => i.email.toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: "duplicate" };
  }
  return { ok: true, list: [...list, { email, role: role.key }] };
}

export function removeInvite(list: readonly Invite[], email: string): Invite[] {
  return list.filter((i) => i.email !== email);
}

/** Drops invites whose module was switched off after they were added. */
export function pruneInvites(list: readonly Invite[], selection: ModuleSelection): Invite[] {
  const allowed = new Set(availableRoles(selection).map((r) => r.key));
  return list.filter((i) => allowed.has(i.role));
}

/** Other settings of the step. */
export interface SetupSettings {
  /** Where notifications of the new site go. */
  notifyEmail: string;
  /** The public site shows *Hamarosan* until the owner goes live. */
  comingSoon: boolean;
  /** Weekly reminder to publish the announcements. */
  weeklyReminder: boolean;
}
