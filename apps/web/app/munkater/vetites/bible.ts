"use client";

import type { I18n } from "@/i18n/music/i18n";
import type { ProjectionItem, ProjectionTile } from "@/lib/music/projection/slides";
import type { ProjectionLook } from "@/lib/music/projection/themes";

// The Bible panel of the controller (look up a verse and show it) is part of the scripture phase
// (phase 6): until then it is not available.
export function useBible(_locale: I18n["locale"], _look: ProjectionLook, _liveKey: string | null) {
  return {
    available: false as boolean,
    items: [] as ProjectionItem[],
    openItem: null as ProjectionItem | null,
    follow(_itemKey: string | undefined, _chapter: number) {},
  };
}
export type Bible = ReturnType<typeof useBible>;
export type { ProjectionTile };
