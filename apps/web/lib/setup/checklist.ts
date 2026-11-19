import { flaggedKeys, includedStaff, type SetupDraft } from "./draft";
import type { Invite, SetupSettings } from "./invites";
import type { ModuleSelection } from "./modules";

/**
 * The checklist on the last page of the wizard (D-34 AC2: owner checklist): what the wizard
 * already did and what is left, each with a link into the admin where it is finished. Nothing is
 * stored yet in Phase A, so the first items are "done" by the draft, the rest by the owner later.
 */
export const CHECKLIST_ITEMS = [
  "basics",
  "appearance",
  "schedule",
  "locations",
  "staff",
  "users",
  "workspace",
  "domain",
  "launch",
] as const;
export type ChecklistId = (typeof CHECKLIST_ITEMS)[number];

export interface ChecklistItem {
  id: ChecklistId;
  done: boolean;
  href: string;
}

export interface SetupOutcome {
  draft: SetupDraft;
  modules: ModuleSelection;
  invites: readonly Invite[];
  settings: SetupSettings;
}

export function buildChecklist({ draft, modules, invites }: SetupOutcome): ChecklistItem[] {
  const flagged = flaggedKeys(draft);
  const none = (prefix: string) => !flagged.some((k) => k.startsWith(prefix));
  const workspace = Object.values(modules).some(Boolean);
  const done: Record<ChecklistId, boolean> = {
    basics: draft.name.trim() !== "" && none("name") && none("denomination"),
    appearance: none("theme"),
    schedule: draft.serviceTimes.length > 0 && none("serviceTime:"),
    locations: draft.locations.length > 0 && none("location:"),
    staff: includedStaff(draft).length > 0,
    users: invites.length > 0,
    workspace,
    domain: false,
    launch: false,
  };
  const href: Record<ChecklistId, string> = {
    basics: "/admin/megjelenes",
    appearance: "/admin/megjelenes",
    schedule: "/admin/rend",
    locations: "/admin/helyszinek",
    staff: "/admin/munkatarsak",
    users: "/admin/felhasznalok",
    workspace: "/munkater",
    domain: "/admin/domain",
    launch: "/admin",
  };
  return CHECKLIST_ITEMS.map((id) => ({ id, done: done[id], href: href[id] }));
}

export function checklistProgress(items: readonly ChecklistItem[]): {
  done: number;
  total: number;
} {
  return { done: items.filter((i) => i.done).length, total: items.length };
}
