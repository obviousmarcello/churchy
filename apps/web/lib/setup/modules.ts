import type { WorkspaceModuleKey } from "@churchy/contracts";

/**
 * Step 3 of the setup wizard: which internal workspace modules (*Munkatér*) the church switches
 * on. Entitlements-style: each module is either entitled by the plan (a toggle) or not (shown
 * locked, with the reason). `setupEntitlements()` is a STUB until D-87 provides
 * `entitlements(tenant)`; it must never read plan keys anywhere else (CLAUDE.md).
 */

export const SETUP_MODULE_IDS = ["calendar", "rooms", "worship", "hr", "diocese"] as const;
export type SetupModuleId = (typeof SETUP_MODULE_IDS)[number];

export interface SetupModule {
  id: SetupModuleId;
  /** Workspace modules (SDD §20.1) the choice switches on. */
  keys: readonly WorkspaceModuleKey[];
  /** Handles personal data of staff: real use needs the security hand-over first (DoD #10). */
  sensitive: boolean;
}

export const SETUP_MODULES: readonly SetupModule[] = [
  { id: "calendar", keys: ["ws.calendar"], sensitive: false },
  { id: "rooms", keys: ["ws.rooms"], sensitive: false },
  { id: "worship", keys: ["ws.worship", "ws.rota"], sensitive: false },
  { id: "hr", keys: ["ws.hr", "ws.hr.leave"], sensitive: true },
  // Not a workspace module: the link to the diocesan HR portal (`org_links`).
  { id: "diocese", keys: [], sensitive: true },
];

export type SetupPlan = "ingyenes" | "munkater";
/** Plan of a church that has just been set up (demo: the workspace is included). */
export const DEFAULT_SETUP_PLAN: SetupPlan = "munkater";

export type SetupEntitlements = Readonly<Record<SetupModuleId, boolean>>;

/** STUB for `entitlements(tenant)` (D-87): what the plan includes. */
export function setupEntitlements(plan: SetupPlan): SetupEntitlements {
  const included = plan === "munkater";
  return {
    calendar: included,
    rooms: included,
    worship: included,
    hr: included,
    diocese: included,
  };
}

export type ModuleSelection = Readonly<Record<SetupModuleId, boolean>>;

/** Everything the plan includes is on, except the sensitive modules, which the owner opts into. */
export function defaultSelection(entitlements: SetupEntitlements): ModuleSelection {
  return Object.fromEntries(
    SETUP_MODULES.map((m) => [m.id, entitlements[m.id] && !m.sensitive]),
  ) as ModuleSelection;
}

/** Toggles a module; a module the plan does not include cannot be switched on. */
export function toggleModule(
  selection: ModuleSelection,
  id: SetupModuleId,
  entitlements: SetupEntitlements,
): ModuleSelection {
  if (!entitlements[id] && !selection[id]) return selection;
  return { ...selection, [id]: !selection[id] };
}

/** The `workspaceModules` override the selection stands for. */
export function workspaceModuleFlags(
  selection: ModuleSelection,
): Partial<Record<WorkspaceModuleKey, boolean>> {
  const flags: Partial<Record<WorkspaceModuleKey, boolean>> = {};
  for (const entry of SETUP_MODULES) {
    for (const key of entry.keys) flags[key] = selection[entry.id];
  }
  return flags;
}
