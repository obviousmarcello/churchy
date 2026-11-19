import type { WorkspaceModuleKey, WsTier } from "@churchy/contracts";

/**
 * Workspace plan tiers (D-53 AC5, SDD §20.1): `none / s50 / m150 / l300` enable the workspace
 * modules and cap the active workspace users. A warning shows from 90 % of the cap, new
 * invitations are blocked at 100 %; deactivated users are not counted.
 */

export const TIER_CAPS: Record<WsTier, number> = { none: 0, s50: 50, m150: 150, l300: 300 };

const S50: readonly WorkspaceModuleKey[] = [
  "ws.calendar",
  "ws.rooms",
  "ws.worship",
  "ws.rota",
  "ws.hr",
  "ws.hr.leave",
];
const M150: readonly WorkspaceModuleKey[] = [...S50, "ws.hr.confidential", "ws.docs"];
const L300: readonly WorkspaceModuleKey[] = [...M150, "ws.board"];

/** Modules each tier includes (the tenant may switch single modules off on top of this). */
export const TIER_MODULES: Record<WsTier, readonly WorkspaceModuleKey[]> = {
  none: [],
  s50: S50,
  m150: M150,
  l300: L300,
};

export const WARNING_RATIO = 0.9;

export type TierLevel = "ok" | "warning" | "full" | "disabled";

export interface TierStatus {
  readonly tier: WsTier;
  readonly cap: number;
  readonly used: number;
  /** `disabled`: no workspace; `warning`: ≥ 90 % of the cap; `full`: cap reached. */
  readonly level: TierLevel;
  readonly canInvite: boolean;
}

/** Tier status for `activeUsers` (callers pass only active, non-deactivated users). */
export function tierStatus(tier: WsTier, activeUsers: number): TierStatus {
  const cap = TIER_CAPS[tier];
  const used = Math.max(0, Math.floor(activeUsers));
  if (cap === 0) return { tier, cap, used, level: "disabled", canInvite: false };
  const level: TierLevel = used >= cap ? "full" : used >= cap * WARNING_RATIO ? "warning" : "ok";
  return { tier, cap, used, level, canInvite: level !== "full" };
}

/**
 * Whether a workspace module is on: the tier must include it and the tenant must not have
 * switched it off (`siteConfig.workspaceModules`, an explicit `false`).
 */
export function moduleEnabled(
  tier: WsTier,
  overrides: Partial<Record<WorkspaceModuleKey, boolean>> | undefined,
  key: WorkspaceModuleKey,
): boolean {
  return TIER_MODULES[tier].includes(key) && overrides?.[key] !== false;
}
