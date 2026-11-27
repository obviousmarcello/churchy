import type { Messages } from "@/i18n/music/messages";

// Music Sheet DB's module registry (`lib/modules/registry.ts`) reduced to what the copied event
// editor reads: the id of a module and its name. The modules themselves are Churchy's workspace
// modules (`ws.music.*`, `/admin/modulok`); the pages hand the ones that are on to the client
// components under the ids of the music app (`MusicModulesProvider`).

export type ModuleId = string;

const NAMES: Record<string, (m: Messages) => string> = {
  scripture: (m) => m.modules.names.scripture,
  "projection.images": (m) => m.modules.names.projectionImages,
  "projection.announcements": (m) => m.modules.names.projectionAnnouncements,
  "projection.text-slides": (m) => m.modules.names.projectionTextSlides,
};

export function moduleDef(id: ModuleId): { id: ModuleId; label: (m: Messages) => string } {
  return { id, label: NAMES[id] ?? (() => id) };
}
