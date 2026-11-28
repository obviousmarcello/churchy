"use client";

import { GripVerticalIcon } from "lucide-react";

import { useI18n } from "@/i18n/music/client";
import { cn } from "@/lib/music/utils";

/** The keys that move an item by its handle. */
const MOVE_KEYS: Record<string, -1 | 1> = { ArrowUp: -1, ArrowDown: 1 };

/**
 * The handle of a row of a list that a drag reorders (`useSetlistDrag`): a
 * drag with the pointer, or the arrow keys when it has the focus.
 */
export function DragHandle({
  id,
  label,
  dragging,
  disabled,
  onStart,
  onMove,
}: {
  id: string;
  label: string;
  dragging: boolean;
  disabled?: boolean;
  onStart: (event: React.PointerEvent) => void;
  onMove: (offset: -1 | 1) => void;
}) {
  const { m } = useI18n();
  return (
    <button
      type="button"
      data-drag-handle={id}
      aria-label={label}
      aria-keyshortcuts="ArrowUp ArrowDown"
      title={m.courses.dragHint}
      disabled={disabled}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        // No text selection while dragging.
        event.preventDefault();
        onStart(event);
      }}
      onKeyDown={(event) => {
        const offset = MOVE_KEYS[event.key];
        if (!offset) return;
        event.preventDefault();
        onMove(offset);
      }}
      className={cn(
        "flex h-8 w-6 shrink-0 touch-none items-center justify-center rounded-sm text-muted outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
        dragging ? "cursor-grabbing" : "cursor-grab",
      )}
    >
      <GripVerticalIcon className="size-4" aria-hidden />
    </button>
  );
}
