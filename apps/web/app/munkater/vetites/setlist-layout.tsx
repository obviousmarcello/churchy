"use client";

import { useMemo } from "react";
import { Menu } from "@base-ui/react/menu";
import { CheckIcon, Settings2Icon } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import { createStoredString, useRootFontPx } from "@/lib/music/browser";
import type { ProjectionSource } from "@/lib/music/projection/slides";

import { ResizeHandle } from "./resize-handle";

// The setlist of the controller. Wide: a column on the left, with a handle on
// its right edge to resize it. Narrow: a row, which keeps its size. The
// details of the songs under their titles, e.g. the songbook, are a choice
// too. The width and the details stay on the device. In the edit mode, the
// column is at least as wide as the rows of the items editor need, and has a
// width of its own: a resize there does not change the setlist of the slides.

const storedWidth = createStoredString("projection-setlist-width");
const storedEditWidth = createStoredString("projection-setlist-edit-width");

/** In rem. The width of the column before a resize. */
const DEFAULT_WIDTH = 18;

/** In rem. */
const MIN_WIDTH = 14;

/** In rem. The narrowest column in the edit mode: the fields of the items editor fit in a row. */
const EDIT_MIN_WIDTH = 28;

/** The largest part of the controller for the setlist: the tiles keep the rest. */
const MAX_SHARE = 0.5;

/**
 * The width during a drag of the handle, on the grid of the controller. Not a
 * state of the controller: a move does not render its tiles and previews again.
 */
const DRAG_WIDTH_PROPERTY = "--setlist-drag-width";

/** The saved width of the setlist column, and its change. `editing`: the edit mode, with a wider column. */
export function useSetlistLayout(editing = false) {
  const normalWidth = parseWidth(storedWidth.useValue());
  const editWidth = parseWidth(storedEditWidth.useValue());
  const width = editing ? editWidth : normalWidth;
  const store = editing ? storedEditWidth : storedWidth;
  const min = editing ? `min(${EDIT_MIN_WIDTH}rem, ${MAX_SHARE * 100}%)` : `${MIN_WIDTH}rem`;
  return {
    /** In rem. The narrowest column that the handle gives. */
    minWidth: editing ? EDIT_MIN_WIDTH : MIN_WIDTH,
    /** The column of the grid, for `grid-template-columns`. The window can be too narrow for the saved width. */
    column: `clamp(${min},var(${DRAG_WIDTH_PROPERTY}, ${width === null ? `${DEFAULT_WIDTH}rem` : `${width}px`}), ${MAX_SHARE * 100}%)`,
    /** In px. Null: the default width. */
    setWidth: (next: number | null) => store.set(next === null ? null : String(Math.round(next))),
  };
}

type SetlistLayout = ReturnType<typeof useSetlistLayout>;

function parseWidth(value: string | null | undefined): number | null {
  const width = Number(value);
  return value && Number.isFinite(width) && width > 0 ? width : null;
}

/** The widest setlist column now: a part of the grid. */
function maxWidth(panel: HTMLElement): number {
  return (panel.parentElement?.clientWidth ?? window.innerWidth) * MAX_SHARE;
}

/**
 * The handle on the right edge of the setlist column. A grid item of its own
 * in the cell of the column: the setlist scrolls, the handle stays.
 * `panelRef`: the setlist, in the grid of the controller.
 */
export function SetlistResizeHandle({
  layout,
  panelRef,
}: {
  layout: SetlistLayout;
  panelRef: React.RefObject<HTMLElement | null>;
}) {
  const { m } = useI18n();
  const t = m.project.controller;
  const rootFontPx = useRootFontPx();

  return (
    <div className="relative hidden w-0 justify-self-end lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:block">
      <ResizeHandle
        panelRef={panelRef}
        edge="right"
        label={t.resizeSetlist}
        minWidth={layout.minWidth * rootFontPx}
        maxWidth={maxWidth}
        onPreview={(width) => {
          const grid = panelRef.current?.parentElement;
          if (width === null) grid?.style.removeProperty(DRAG_WIDTH_PROPERTY);
          else grid?.style.setProperty(DRAG_WIDTH_PROPERTY, `${width}px`);
        }}
        onChange={layout.setWidth}
        onReset={() => layout.setWidth(null)}
      />
    </div>
  );
}

/** The details of a song that the setlist can show under its title, in this order. */
const SETLIST_FIELDS = ["songbook", "artist", "authors"] as const;

type SetlistField = (typeof SETLIST_FIELDS)[number];

/** The songbook: the congregation finds the song in it. */
const DEFAULT_FIELDS: SetlistField[] = ["songbook"];

const storedFields = createStoredString("projection-setlist-fields");

const fieldsSchema = z.array(z.enum(SETLIST_FIELDS));

/** The details under the song titles, and their change. */
export function useSetlistFields(): [SetlistField[], (fields: SetlistField[]) => void] {
  const value = storedFields.useValue();
  const fields = useMemo(() => parseFields(value), [value]);
  // An empty list stays: no details.
  return [
    fields,
    (next) =>
      storedFields.set(JSON.stringify(SETLIST_FIELDS.filter((field) => next.includes(field)))),
  ];
}

function parseFields(json: string | null | undefined): SetlistField[] {
  if (!json) return DEFAULT_FIELDS;
  try {
    const result = fieldsSchema.safeParse(JSON.parse(json));
    return result.success ? result.data : DEFAULT_FIELDS;
  } catch {
    return DEFAULT_FIELDS;
  }
}

/** The selected details of a song that it has, e.g. ["Dicsérd az Urat 123"]. Empty for the other items. */
export function songDetails(
  source: ProjectionSource | undefined,
  fields: SetlistField[],
): string[] {
  if (source?.kind !== "song") return [];
  return fields.flatMap((field) => source[field]?.trim() || []);
}

/** The button with the menu of the details under the song titles. */
export function SetlistFieldsMenu({
  fields,
  onChange,
}: {
  fields: SetlistField[];
  onChange: (fields: SetlistField[]) => void;
}) {
  const { m } = useI18n();
  const t = m.project.controller;

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t.setlistFields}
            title={t.setlistFields}
          />
        }
      >
        <Settings2Icon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" collisionPadding={8} className="z-50">
          <Menu.Popup className="min-w-48 origin-[var(--transform-origin)] rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Menu.Group>
              <Menu.GroupLabel className="px-2 py-1.5 text-xs font-medium text-muted">
                {t.setlistFields}
              </Menu.GroupLabel>
              {SETLIST_FIELDS.map((field) => (
                <Menu.CheckboxItem
                  key={field}
                  checked={fields.includes(field)}
                  onCheckedChange={(checked) =>
                    onChange(
                      checked
                        ? [...fields, field]
                        : fields.filter((candidate) => candidate !== field),
                    )
                  }
                  className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-surface-sunken"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    <Menu.CheckboxItemIndicator>
                      <CheckIcon className="size-4" />
                    </Menu.CheckboxItemIndicator>
                  </span>
                  {t.setlistFieldNames[field]}
                </Menu.CheckboxItem>
              ))}
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
