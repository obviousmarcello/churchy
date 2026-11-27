import type {
  ModuleKey,
  SiteConfigOverrides,
  WorkspaceModuleKey,
  WsTier,
} from "@churchy/contracts";
import { ModuleKeySchema, WorkspaceModuleKeySchema } from "@churchy/contracts";
import { moduleEnabled } from "@/lib/workspace/plan-tier";
import { includesModule, includesWorkspaceModule, type Entitlements } from "./entitlements";

/**
 * Module registry view of the toggles screen (D-25, SDD §5.5, §20.1). A module is **on** when the
 * church switched it on **and** its plan includes it; a module outside the plan is shown locked
 * (with the upgrade prompt), never silently missing. Content of a module that is off is kept.
 */

export const WEBSITE_MODULE_KEYS: readonly ModuleKey[] = ModuleKeySchema.options;
export const WORKSPACE_MODULE_KEYS: readonly WorkspaceModuleKey[] =
  WorkspaceModuleKeySchema.options;

/** Workspace modules that handle personal data of staff (DoD #10: security hand-over first). */
export const SENSITIVE_WORKSPACE_MODULES: readonly WorkspaceModuleKey[] = [
  "ws.hr",
  "ws.hr.leave",
  "ws.hr.confidential",
];

export interface ModuleRow<K extends string> {
  readonly key: K;
  /** The plan includes the module. */
  readonly entitled: boolean;
  /** Switched on in the church's settings (only meaningful when entitled). */
  readonly enabled: boolean;
}

/** Website modules with their plan and switch state. `stored` is the effective module map. */
export function websiteModuleRows(
  stored: Partial<Record<ModuleKey, boolean>>,
  ent: Entitlements,
): ModuleRow<ModuleKey>[] {
  return WEBSITE_MODULE_KEYS.map((key) => ({
    key,
    entitled: includesModule(ent, key),
    enabled: stored[key] === true,
  }));
}

/** Workspace modules; `overrides` are the stored `workspaceModules` (an explicit `false` is off). */
export function workspaceModuleRows(
  tier: WsTier,
  overrides: Partial<Record<WorkspaceModuleKey, boolean>> | undefined,
  ent: Entitlements,
): ModuleRow<WorkspaceModuleKey>[] {
  return WORKSPACE_MODULE_KEYS.map((key) => ({
    key,
    entitled: includesWorkspaceModule(ent, key),
    enabled: moduleEnabled(tier, overrides, key),
  }));
}

/** Form field name of a module checkbox. */
export const websiteField = (key: ModuleKey): string => `m_${key}`;
export const workspaceField = (key: WorkspaceModuleKey): string => `w_${key}`;

/**
 * The stored overrides after saving the toggles form. Only entitled modules change: a module
 * outside the plan keeps whatever was stored (so an upgrade restores it with content intact).
 */
export function applyModuleToggles(
  current: SiteConfigOverrides,
  values: Record<string, string>,
  ent: Entitlements,
): SiteConfigOverrides {
  const modules = { ...current.modules };
  for (const key of WEBSITE_MODULE_KEYS) {
    if (includesModule(ent, key)) modules[key] = values[websiteField(key)] === "on";
  }
  const workspaceModules = { ...current.workspaceModules };
  for (const key of WORKSPACE_MODULE_KEYS) {
    if (includesWorkspaceModule(ent, key)) {
      workspaceModules[key] = values[workspaceField(key)] === "on";
    }
  }
  return { ...current, modules, workspaceModules };
}

/** Message id of a workspace module (`ws.hr.leave` → `hr_leave`; dots are nesting in messages). */
const WORKSPACE_IDS = {
  "ws.calendar": "calendar",
  "ws.rooms": "rooms",
  "ws.worship": "worship",
  "ws.rota": "rota",
  "ws.hr": "hr",
  "ws.hr.leave": "hr_leave",
  "ws.hr.confidential": "hr_confidential",
  "ws.docs": "docs",
  "ws.board": "board",
  "ws.music.songs": "music_songs",
  "ws.music.songs.pdfs": "music_songs_pdfs",
  "ws.music.songs.images": "music_songs_images",
  "ws.music.songs.scores": "music_songs_scores",
  "ws.music.songs.sound-files": "music_songs_sound_files",
  "ws.music.songs.links": "music_songs_links",
  "ws.music.songs.songpraise": "music_songs_songpraise",
  "ws.music.songs.ocr": "music_songs_ocr",
  "ws.music.song-rights": "music_song_rights",
  "ws.music.sheet": "music_sheet",
  "ws.music.sheet.metronome": "music_sheet_metronome",
  "ws.music.sheet.midi-out": "music_sheet_midi_out",
  "ws.music.sheet.marks": "music_sheet_marks",
  "ws.music.sheet.chord-diagrams": "music_sheet_chord_diagrams",
  "ws.music.sheet.live": "music_sheet_live",
  "ws.music.events": "music_events",
  "ws.music.events.images": "music_events_images",
  "ws.music.events.announcements": "music_events_announcements",
  "ws.music.projection": "music_projection",
  "ws.music.projection.themes": "music_projection_themes",
  "ws.music.projection.text-slides": "music_projection_text_slides",
  "ws.music.projection.overlay": "music_projection_overlay",
  "ws.music.projection.countdown": "music_projection_countdown",
  "ws.music.projection.pptx-export": "music_projection_pptx_export",
  "ws.music.projection.quick-add": "music_projection_quick_add",
} as const satisfies Record<WorkspaceModuleKey, string>;
export type WorkspaceModuleId = (typeof WORKSPACE_IDS)[WorkspaceModuleKey];
export const workspaceModuleId = (key: WorkspaceModuleKey): WorkspaceModuleId => WORKSPACE_IDS[key];
