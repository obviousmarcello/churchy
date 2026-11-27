"use client";

import type { QuickItemInput } from "@/lib/music/projection/quick-items";
import type { ProjectionSource } from "@/lib/music/projection/slides";

// The quick add of the controller (a song, a text slide, images or announcements added during the
// event) is built on the items editor of the event page (`AddItemBox`, the image upload, the
// announcements button), which come with the event-editor slice (5c). Until then the box is not
// shown; the types are those of the copied controller.

export type ImageItemUpload = { busy: boolean };

/** For an event admin: the items that only the event can have, e.g. an image item. */
export type QuickAddEvent = {
  eventId: string;
  /** The images of the image items of the event now, for the limit of the images. */
  imageCount: number;
  /** Adds the item to the event after the live item, or after the item of `afterKey`. */
  add: (item: QuickItemInput, afterKey?: string) => Promise<{ key: string } | { error: string }>;
  upload: ImageItemUpload;
};

export function useQuickAddUpload(_event: Omit<QuickAddEvent, "upload"> | null): ImageItemUpload {
  return { busy: false };
}

export function QuickAddBox(_props: {
  onAdd: (source: ProjectionSource, item: QuickItemInput) => void | Promise<void>;
  event?: QuickAddEvent | null;
  className?: string;
}) {
  return null;
}
