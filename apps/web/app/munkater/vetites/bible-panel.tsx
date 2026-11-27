"use client";

import type { ProjectionItem, ProjectionTile } from "@/lib/music/projection/slides";
import type { QuickItemInput } from "@/lib/music/projection/quick-items";
import type { ProjectionSource } from "@/lib/music/projection/slides";
import type { Bible } from "./bible";

// Phase 6 (scripture). The panel is not available yet: the layout state is empty and nothing shows.
export type BiblePanelLayout = { open: boolean };

export function useBiblePanelLayout(): BiblePanelLayout {
  return { open: false };
}

export function BiblePanelButton(_props: { layout: BiblePanelLayout; available: boolean }) {
  return null;
}

export function BiblePanel(_props: {
  layout: BiblePanelLayout;
  bible: Bible;
  live: { itemKey: string; tileIds: Set<string> } | null;
  onClickVerse: (tile: ProjectionTile, click: { range: boolean; toggle: boolean }) => void;
  onShowVerses: (item: ProjectionItem, tiles: ProjectionTile[]) => void;
  onAdd: (source: ProjectionSource, item: QuickItemInput) => void | Promise<void>;
}) {
  return null;
}
