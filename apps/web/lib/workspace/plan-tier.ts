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
  "ws.music.songs",
  "ws.music.songs.pdfs",
  "ws.music.songs.images",
  "ws.music.songs.scores",
  "ws.music.songs.sound-files",
  "ws.music.songs.links",
  "ws.music.songs.songpraise",
  "ws.music.songs.ocr",
  "ws.music.song-rights",
  "ws.music.sheet",
  "ws.music.sheet.metronome",
  "ws.music.sheet.midi-out",
  "ws.music.sheet.marks",
  "ws.music.sheet.chord-diagrams",
  "ws.music.events",
  "ws.music.events.images",
  "ws.music.events.announcements",
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
  if (!TIER_MODULES[tier].includes(key)) return false;
  if (!key.startsWith(MUSIC_PREFIX)) return overrides?.[key] !== false;
  // Music modules are off until the church switches them on, and need their parent module.
  const parent = musicParent(key);
  return overrides?.[key] === true && (parent === null || moduleEnabled(tier, overrides, parent));
}

const MUSIC_PREFIX = "ws.music.";

/** `ws.music.songs.pdfs` → `ws.music.songs`; `ws.music.song-rights`, `ws.music.sheet` → `ws.music.songs`; `ws.music.sheet.midi-out` → `ws.music.sheet.metronome`. */
export function musicParent(key: WorkspaceModuleKey): WorkspaceModuleKey | null {
  if (key === "ws.music.songs") return null;
  if (key === "ws.music.song-rights" || key === "ws.music.sheet" || key === "ws.music.events")
    return "ws.music.songs";
  if (key === "ws.music.sheet.midi-out") return "ws.music.sheet.metronome";
  const parent = key.slice(0, key.lastIndexOf("."));
  return parent.startsWith(MUSIC_PREFIX) ? (parent as WorkspaceModuleKey) : null;
}
