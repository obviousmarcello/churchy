"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import {
  BookOpenIcon,
  ClipboardPasteIcon,
  ClockIcon,
  GripVerticalIcon,
  ImagesIcon,
  LockIcon,
  MegaphoneIcon,
  MessageSquareTextIcon,
  MusicIcon,
  NotebookPenIcon,
  PaletteIcon,
  PresentationIcon,
  RadioIcon,
  UserRoundPlusIcon,
  XIcon,
} from "lucide-react";

import { PasteScriptureDialog } from "@/app/munkater/vetites/paste-scripture-dialog";
import { useAppConfig, useScriptureTranslations } from "@/components/music/app-config";
import {
  AvatarPicker,
  EmptyAvatar,
  type AvatarSize,
  type PickerOption,
} from "@/components/music/avatar-picker";
import {
  DIALOG_BACKDROP_CLASS,
  DIALOG_POPUP_CLASS,
  DialogActions,
  DialogFooter,
  DialogHeader,
} from "@/components/music/dialog-parts";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { NativeSelect } from "@/components/music/ui/native-select";
import { RowMenu, type RowMenuItem } from "@/components/music/row-menu";
import { DurationInput, PlannedStart } from "@/components/music/run-sheet";
import { ScriptureTranslationSelect } from "@/components/music/scripture-translation-select";
import { TextKindMenu } from "@/components/music/text-kind-menu";
import { Textarea } from "@/components/music/ui/textarea";
import { useNoteNames } from "@/components/music/note-names";
import { UserAvatar, type AvatarPerson } from "@/components/music/user-avatar";
import { useI18n } from "@/i18n/music/client";
import { sameKey } from "@/lib/music/chords/key";
import { fromEnglish, type Notation } from "@/lib/music/chords/notation";
import {
  blockAfterMove,
  blockRuns,
  withBlockAfterMove,
  type BlockRun,
  type EventBlock,
} from "@/lib/music/event-blocks";
import {
  EVENT_ITEM_DESCRIPTION_MAX_LENGTH,
  EVENT_ITEM_HIGHLIGHT_MAX_LENGTH,
  EVENT_ITEM_NOTES_MAX_LENGTH,
  EVENT_ITEM_TITLE_MAX_LENGTH,
  looksLikeScriptureReference,
  textItemKind,
} from "@/lib/music/event-items";
import { plannedSeconds } from "@/lib/music/event-timing";
import { itemKindModule } from "@/lib/music/modules/items";
import { moduleDef, type ModuleId } from "@/lib/music/modules/registry";
import { personName } from "@/lib/music/format";
import { DEUTEROCANONICAL_BOOKS } from "@/lib/music/scripture/books";
import { parseScriptureReference } from "@/lib/music/scripture/reference";
import {
  defaultTranslationFor,
  resolveTranslation,
  TRANSLATION_ID_PATTERN,
  type ScriptureTranslation,
} from "@/lib/music/scripture/translations";
import { cn } from "@/lib/music/utils";
import type { ArrangementSummaryDTO } from "@/server/music/models/arrangements";
import type { SongWithArrangementsDTO } from "@/server/music/models/songs";

/** Near this distance from the top or bottom of the window, a drag scrolls the page. */
const SCROLL_EDGE_PX = 80;
/** The scroll speed at the very edge of the window. */
const MAX_SCROLL_PX_PER_FRAME = 16;

/**
 * One song of a setlist, the arrangement to play, and the key to play it in
 * (English note names). No key or null: the key of the chart. Not `key`:
 * `ItemRow.key` is the id of the row.
 */
export type SetlistRow = { songId: string; arrangementId: string; musicalKey?: string | null };

/**
 * A text item of an event, e.g. "Announcement". `notes` is "" for no notes.
 * With `scripture`, a scripture reading: the title is the reference. With
 * `imageSetId`, an image item: the images of the set show on the projection.
 * With `announcementId`, an announcements item (see `announcements.ts`).
 * With `textSlide`, a text slide: the projection shows its description and
 * its highlighted text ("" for none), not its notes.
 */
export type TextRow = {
  kind: "text";
  key: string;
  title: string;
  notes: string;
  scripture: boolean;
  /** The translation of a scripture reading (see `TRANSLATIONS`). Null: the default one. */
  scriptureTranslation: string | null;
  /** The set of the images of an image item (see `EventImageSetsDTO`). Null or left out: no images. */
  imageSetId?: string | null;
  /** The announcement of an announcements item. Null or left out: none. */
  announcementId?: string | null;
  /** A text slide. False or left out: another text item. */
  textSlide?: boolean;
  /** The description of a text slide. "" or left out: none. */
  description?: string;
  /** The highlighted text of a text slide. "" or left out: none. */
  highlight?: string;
  volunteerId: string | null;
  /** The projection theme. Null or left out: the theme of the event. */
  themeId?: string | null;
  /** The planned time in seconds. Null or left out: none. */
  durationSeconds?: number | null;
  /** The block of the item (see `@/lib/event-blocks`). Null or left out: none. */
  blockKey?: string | null;
};

/**
 * One item of an event: a song or a text item, with the user id of its
 * volunteer or null, its projection theme and its planned time. `key` stays
 * the same while the row moves and changes. A song without a planned time
 * takes the duration of its arrangement.
 */
export type ItemRow =
  | (SetlistRow & {
      kind: "song";
      key: string;
      volunteerId: string | null;
      themeId?: string | null;
      durationSeconds?: number | null;
      blockKey?: string | null;
    })
  | TextRow;

/** A projection theme in the select of an item. */
export type ThemeOption = { id: string; name: string };

/** A volunteer in the volunteer picker of an item. No person: "No volunteer". */
type VolunteerOption = PickerOption & { person?: AvatarPerson };

export function isTextRow(row: SetlistRow | ItemRow): row is TextRow {
  return "kind" in row && row.kind === "text";
}

/**
 * The translation of a text row for `setEventItems`: null for another text
 * item and for a translation that the app does not have (anymore).
 */
export function scriptureTranslationInput(row: TextRow): string | null {
  return row.scripture
    ? row.scriptureTranslation !== null && TRANSLATION_ID_PATTERN.test(row.scriptureTranslation)
      ? row.scriptureTranslation
      : null
    : null;
}

/** The planned time of a row in seconds (see `plannedSeconds`). Null: none. */
export function rowSeconds(
  row: ItemRow,
  songsById: Map<string, SongWithArrangementsDTO>,
): number | null {
  if (isTextRow(row)) return row.durationSeconds ?? null;
  const arrangement = songsById
    .get(row.songId)
    ?.arrangements.find((a) => a.id === row.arrangementId);
  return plannedSeconds(row.durationSeconds, arrangement?.durationSeconds);
}

/**
 * The songs of a setlist in playing order, or the items of an event: choose
 * the arrangement of each song, edit the text items, reorder and remove them.
 * Drag a row by its handle to move it (near an edge of the window the page
 * scrolls), or focus the handle and use the up and down arrow keys; Escape
 * cancels a drag.
 * With `volunteers`, each item of an event can get one of them. The caller
 * shows the empty state and saves the rows.
 * With `liveKey`, the row of that key is live on the projection: it has a
 * mark, and its remove and a change of its arrangement ask first.
 * With `timing`, each item of an event has a time field and its planned start.
 * With `blocks`, the items of each block have a header before them (see
 * `@/lib/event-blocks`), and a row that moves joins or leaves a block (see
 * `blockAfterMove`). With `selection`, a click on an item that is not in a
 * block selects it, and
 * Shift + click selects a range (`onSelect` with `range`). The number of
 * the item is the toggle for the keyboard and for screen readers.
 */
export function SetlistRows<Row extends SetlistRow | ItemRow>({
  rows,
  songsById,
  onChange,
  rowActions,
  volunteers,
  themes,
  imageItem,
  announcementItem,
  textSlides = false,
  canPasteScripture = false,
  liveKey = null,
  timing,
  blocks,
  selection,
  onDragChange,
}: {
  rows: Row[];
  songsById: Map<string, SongWithArrangementsDTO>;
  onChange: (rows: Row[]) => void;
  /** More buttons for a song row, before the remove button. */
  rowActions?: (row: Row & SetlistRow, title: string) => React.ReactNode;
  /** The volunteers of the event, by name. No volunteer select when empty or missing. */
  volunteers?: AvatarPerson[];
  /** The projection themes for the items of an event. No theme select when missing. */
  themes?: ThemeOption[];
  /** The images of an image item and their buttons, under its title. */
  imageItem?: (row: TextRow, title: string) => React.ReactNode;
  /** The entries of an announcements item and their buttons, under its title. */
  announcementItem?: (row: TextRow, title: string) => React.ReactNode;
  /** True: a text item can also become a text slide (only on the event page). */
  textSlides?: boolean;
  /** True: a reading in a "pasted" translation gets a button for its text (`cacheVerses()` checks the roles again). */
  canPasteScripture?: boolean;
  /** The key of the row that the projection shows now. */
  liveKey?: string | null;
  /** The time fields of the items of an event, and the planned start of each row (see `runSheet`). Null starts: none shows. */
  timing?: { starts: number[] | null };
  /** The blocks of the items of an event, and the content of the header of each block. A row of a block that the list does not have shows without a block. */
  blocks?: { list: EventBlock[]; header: (block: EventBlock, run: BlockRun) => React.ReactNode };
  /**
   * The selected items of an event, by key. `range`: Shift + click. `bar`:
   * the actions for the selected items, just above the first of them.
   * `onClear`: 2 seconds after a click or the focus goes out of the selected items.
   */
  selection?: {
    keys: ReadonlySet<string>;
    onSelect: (key: string, range: boolean) => void;
    onClear: () => void;
    bar?: React.ReactNode;
  };
  /** A drag starts (true) or ends (false). */
  onDragChange?: (dragging: boolean) => void;
}) {
  const i18n = useI18n();
  const { m, format, locale } = i18n;
  const t = m.components.setlistRows;
  const noteNames = useNoteNames();
  const translations = useScriptureTranslations();
  const { modules } = useAppConfig();
  /** The module of a text item whose module is off, else null. */
  const lockedModule = (row: TextRow): ModuleId | null => {
    const kindModule = itemKindModule(
      textItemKind({
        scripture: row.scripture,
        imageSetId: row.imageSetId ?? null,
        announcementId: row.announcementId ?? null,
        textSlide: Boolean(row.textSlide),
      }),
    );
    return kindModule && !modules.includes(kindModule) ? kindModule : null;
  };
  const listRef = useRef<HTMLOListElement>(null);
  /** The row being dragged, and the rows from before the drag for Escape. */
  const [drag, setDrag] = useState<{ index: number; before: Row[] } | null>(null);
  /** The last vertical position of the pointer during a drag. */
  const pointerY = useRef(0);
  const dragging = drag !== null;
  const onDragChangeRef = useRef(onDragChange);
  useLayoutEffect(() => {
    onDragChangeRef.current = onDragChange;
  });
  useEffect(() => onDragChangeRef.current?.(dragging), [dragging]);
  // The rows now, for a change that waits for the answer to the question of the live row.
  const rowsRef = useRef(rows);
  useLayoutEffect(() => {
    rowsRef.current = rows;
  });
  const [liveChange, setLiveChange] = useState<LiveChange<Row> | null>(null);
  // The scripture reading in the dialog for its text, in a "pasted" translation (see `translations.ts`).
  const [pasting, setPasting] = useState<{
    reference: string;
    translation: ScriptureTranslation;
  } | null>(null);
  // The readings whose text this page put in the shared cache, by reference and translation.
  const [pasted, setPasted] = useState<ReadonlySet<string>>(new Set());
  // A field without a value that shows after its action in the row menu (see `RowMenu`), or while it has the focus.
  const [shownField, setShownField] = useState<{ key: string; field: ShownField } | null>(null);
  // A text item has a row menu for its notes, so the buttons of all rows stay in one column.
  const hasTextRows = rows.some(isTextRow);
  const narrow = useNarrow(listRef);
  const volunteerOptions: VolunteerOption[] = [
    { id: null, label: t.noVolunteer },
    ...(volunteers ?? []).map((person) => ({
      id: person.id,
      label: personName(person, i18n),
      person,
    })),
  ];
  /** The options of the theme of an item. The first: the theme of the arrangement of a song, else of the event. */
  const themeOptions = (arrangementThemeId: string | null): PickerOption[] => {
    const arrangementTheme = themes?.find((theme) => theme.id === arrangementThemeId);
    return [
      {
        id: null,
        label: arrangementTheme
          ? format(t.arrangementTheme, { name: arrangementTheme.name })
          : t.eventTheme,
      },
      ...(themes ?? []).map((theme) => ({ id: theme.id, label: theme.name })),
    ];
  };
  /** Hides the field of `key` that showed without a value. */
  const hideField = (key: string, field: ShownField) =>
    setShownField((current) => (current?.key === key && current.field === field ? null : current));
  /** After a picker without a value closes: the focus goes back to the menu of the row. */
  const focusRowMenu = (key: string) =>
    requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      listRef.current?.querySelector<HTMLElement>(`[data-row-menu="${CSS.escape(key)}"]`)?.focus();
    });

  /** A change of the row of `key`: for the live row, after the question. */
  function changeRow(
    key: string,
    kind: LiveChange<Row>["kind"],
    title: string,
    change: (rows: Row[]) => Row[],
  ) {
    if (liveKey !== null && key === liveKey) setLiveChange({ kind, title, change });
    else onChange(change(rows));
  }

  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(blocks ? withBlockAfterMove(next as (Row & ItemRow)[], target) : next);
    // React moves the row in the DOM, and the handle loses the focus.
    requestAnimationFrame(() =>
      rowElements()[target]?.querySelector<HTMLElement>("[data-drag-handle]")?.focus(),
    );
  }

  /** The elements of the rows, without the headers of the blocks. */
  function rowElements(): Element[] {
    return Array.from(listRef.current?.querySelectorAll(":scope > [data-row]") ?? []);
  }

  // The listeners go on the window, not on the handle: reordering moves the
  // row in the DOM, and the handle would lose the pointer capture.
  useEffect(() => {
    if (!drag) return;
    const { index, before } = drag;

    function reorder() {
      const items = rowElements();
      // The new index is the number of other rows with their middle above the pointer.
      let target = 0;
      items.forEach((item, i) => {
        if (i === index) return;
        const box = item.getBoundingClientRect();
        if (pointerY.current > box.top + box.height / 2) target++;
      });
      let next = rows;
      if (target !== index) {
        next = [...rows];
        next.splice(target, 0, ...next.splice(index, 1));
      }
      // Also without a move: the pointer can go over the header of a block.
      if (blocks) next = withDragBlock(next as (Row & ItemRow)[], target) as Row[];
      if (next !== rows) onChange(next);
      if (target !== index) setDrag({ index: target, before });
    }

    /**
     * The block of the dragged row: as `blockAfterMove`, and in front of the
     * first item of a block, the block when the pointer is below the middle
     * of its header. So a row goes into a block, or out of it, over its header.
     */
    function withDragBlock(list: (Row & ItemRow)[], at: number): (Row & ItemRow)[] {
      let blockKey = blockAfterMove(list, at);
      const following = list[at + 1]?.blockKey ?? null;
      const firstOfBlock =
        following !== null && !list.some((row, i) => i < at && row.blockKey === following);
      const header = firstOfBlock
        ? listRef.current?.querySelector(`:scope > [data-block-header="${CSS.escape(following)}"]`)
        : null;
      if (header && following) {
        const box = header.getBoundingClientRect();
        if (pointerY.current > box.top + box.height / 2) blockKey = following;
        else if (blockKey === following) blockKey = null;
      }
      if ((list[at]?.blockKey ?? null) === blockKey) return list;
      return list.map((row, i) => (i === at ? { ...row, blockKey } : row));
    }

    // Near an edge of the window, scroll the page on each frame, also when the
    // pointer stays still. The rows move under the pointer, so reorder again.
    let frame = requestAnimationFrame(function scroll() {
      const y = pointerY.current;
      const depth =
        y < SCROLL_EDGE_PX
          ? y - SCROLL_EDGE_PX
          : y > window.innerHeight - SCROLL_EDGE_PX
            ? y - (window.innerHeight - SCROLL_EDGE_PX)
            : 0;
      if (depth !== 0) {
        const speed = Math.min(Math.abs(depth) / SCROLL_EDGE_PX, 1) * MAX_SCROLL_PX_PER_FRAME;
        window.scrollBy(0, Math.sign(depth) * Math.ceil(speed));
        reorder();
      }
      frame = requestAnimationFrame(scroll);
    });

    function onPointerMove(event: PointerEvent) {
      pointerY.current = event.clientY;
      reorder();
    }
    function onPointerUp() {
      setDrag(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      onChange(before);
      setDrag(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [drag, rows, onChange, blocks]);

  function update(
    index: number,
    changes:
      | Partial<SetlistRow>
      | Partial<TextRow>
      | Pick<ItemRow, "volunteerId">
      | Pick<ItemRow, "themeId">
      | Pick<ItemRow, "durationSeconds">,
  ) {
    onChange(rows.map((row, i) => (i === index ? ({ ...row, ...changes } as Row) : row)));
  }

  /**
   * For a reading in a "pasted" translation: the button that opens the
   * dialog for its text, and when to paste it (the cache keeps it 24 hours).
   */
  function pasteRow(row: TextRow, label: string) {
    if (!canPasteScripture) return null;
    const translation = resolveTranslation(row.scriptureTranslation, translations);
    const reference = translation?.source === "pasted" ? parseScriptureReference(row.title) : null;
    // Not for a book that the translation does not have, e.g. Sirach: the controller shows it as unavailable.
    if (
      !translation ||
      !reference ||
      (!translation.deuterocanon && DEUTEROCANONICAL_BOOKS.has(reference.book))
    )
      return null;
    const done = pasted.has(`${translation.id} ${row.title.trim()}`);
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={format(t.pasteScriptureOf, { title: label })}
          onClick={() => setPasting({ reference: row.title.trim(), translation })}
        >
          <ClipboardPasteIcon />
          {t.pasteScripture}
        </Button>
        <p className="min-w-0 flex-1 text-xs text-muted">
          {format(done ? t.scripturePasted : t.pasteScriptureHint, {
            translation: translation.shortName,
          })}
        </p>
      </div>
    );
  }

  // The runs of the blocks that the list has (see `normalizeBlocks`: one run for each block).
  const blocksByKey = new Map(blocks?.list.map((block) => [block.key, block]));
  const runs = blocks
    ? blockRuns(
        rows.map((row) => ({
          blockKey:
            "blockKey" in row && row.blockKey && blocksByKey.has(row.blockKey)
              ? row.blockKey
              : null,
        })),
      )
    : [];
  const runAt = new Map(runs.map((run) => [run.first, run]));
  const inBlock = (index: number) => runs.some((run) => index >= run.first && index <= run.last);
  const lastInBlock = (index: number) => runs.some((run) => index === run.last);
  const firstSelected = selection
    ? rows.findIndex((row, index) => !inBlock(index) && selection.keys.has(keyOf(row)))
    : -1;
  const barShown = firstSelected >= 0 && Boolean(selection?.bar);
  // The selection (and with it the bar) goes away 2 seconds after a click or the focus goes
  // out of the selected items, unless a click or the focus comes back in them first.
  // A click, not a pointerdown: a touch that scrolls the page is not a click.
  // The handlers of the selected rows mark an event as inside: React events also come
  // from the popups (portals) of a row. The document sees the event after them.
  const onClearRef = useRef(selection?.onClear);
  useEffect(() => {
    onClearRef.current = selection?.onClear;
  });
  const insideEvent = useRef<Event | null>(null);
  const awayTimer = useRef<number | undefined>(undefined);
  const markInside = (event: React.SyntheticEvent) => {
    insideEvent.current = event.nativeEvent;
    window.clearTimeout(awayTimer.current);
    awayTimer.current = undefined;
  };
  // A click on an item that is not selected selects it: the selection stays.
  useEffect(() => {
    window.clearTimeout(awayTimer.current);
    awayTimer.current = undefined;
  }, [selection?.keys]);
  useEffect(() => {
    if (!barShown) return;
    const onEvent = (event: Event) => {
      if (event === insideEvent.current) return;
      if (awayTimer.current !== undefined) return;
      awayTimer.current = window.setTimeout(() => {
        awayTimer.current = undefined;
        onClearRef.current?.();
      }, 2000);
    };
    document.addEventListener("click", onEvent);
    document.addEventListener("focusin", onEvent);
    return () => {
      document.removeEventListener("click", onEvent);
      document.removeEventListener("focusin", onEvent);
      window.clearTimeout(awayTimer.current);
      awayTimer.current = undefined;
    };
  }, [barShown]);
  /** The actions for the selected items, over the top of the first of them. */
  const selectionBar = (index: number) =>
    index === firstSelected &&
    selection?.bar && (
      <div role="group" className="absolute bottom-full left-2 z-20 mb-1 max-w-[calc(100%-1rem)]">
        {selection.bar}
      </div>
    );

  /** The row, after the header of its block if it is the first row of the block. */
  function withHeader(index: number, rowKey: string, item: React.ReactNode) {
    const run = runAt.get(index);
    const block = run && blocksByKey.get(run.blockKey);
    return (
      <Fragment key={rowKey}>
        {block && run && blocks && (
          <li
            data-block-header={block.key}
            // The top of the card of the block: its items join it below.
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-t-xl border-l-4 border-l-primary/40 bg-surface-sunken px-3 py-2"
          >
            {blocks.header(block, run)}
          </li>
        )}
        {item}
      </Fragment>
    );
  }

  return (
    <ol
      ref={listRef}
      className={cn("@container flex flex-col gap-2", drag && "cursor-grabbing select-none")}
    >
      {rows.map((row, index) => {
        const handle = (title: string) => (
          <button
            type="button"
            data-drag-handle
            aria-label={format(t.move, { title })}
            aria-keyshortcuts="ArrowUp ArrowDown"
            title={t.dragToReorder}
            className={cn(
              "-ml-1 flex shrink-0 touch-none items-center rounded-sm pointer-coarse:-my-2 pointer-coarse:-ml-3 pointer-coarse:p-2 text-muted outline-none hover:text-text focus-visible:ring-[3px] focus-visible:ring-ring/50",
              drag ? "cursor-grabbing" : "cursor-grab",
            )}
            onKeyDown={(event) => {
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              event.preventDefault();
              move(index, event.key === "ArrowUp" ? -1 : 1);
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              // No text selection while dragging.
              event.preventDefault();
              pointerY.current = event.clientY;
              setDrag({ index, before: rows });
            }}
          >
            <GripVerticalIcon className="size-4" />
          </button>
        );
        const rowKey = "key" in row ? (row.key as string) : (row as SetlistRow).arrangementId;
        const live = liveKey !== null && rowKey === liveKey;
        // An item of a block is not for a new block.
        const selectable = selection !== undefined && !inBlock(index);
        const selected = selectable && selection.keys.has(rowKey);
        const numberOf = (title: string) => (
          <span className="flex shrink-0 items-center gap-1">
            {live && (
              <span className="flex items-center gap-1 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white">
                <RadioIcon aria-hidden className="size-3" />
                {t.live}
              </span>
            )}
            {selectable ? (
              <button
                type="button"
                data-select-toggle={rowKey}
                aria-pressed={selected}
                // The name starts with the visible number: a screen reader user hears the same as a sighted one.
                aria-label={`${index + 1}. ${format(m.components.eventBlocks.select, { title })}`}
                title={m.components.eventBlocks.selectHint}
                onClick={(event) => selection.onSelect(rowKey, event.shiftKey)}
                className={cn(
                  "w-6 rounded-sm text-right text-sm tabular-nums outline-none hover:text-text focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  selected ? "font-semibold text-primary" : "text-muted",
                )}
              >
                {index + 1}.
              </button>
            ) : (
              <span className="w-6 text-right text-sm text-muted tabular-nums">{index + 1}.</span>
            )}
          </span>
        );
        // A click on a part of the row that is not a control selects the row. Not in a popup of the row (a portal).
        const selectHandlers = selectable && {
          ...(selected && { onClickCapture: markInside, onFocusCapture: markInside }),
          onMouseDown: (event: React.MouseEvent<HTMLLIElement>) => {
            // No text selection with Shift + click.
            if (event.shiftKey && !onControl(event)) event.preventDefault();
          },
          onClick: (event: React.MouseEvent<HTMLLIElement>) => {
            if (onControl(event) || window.getSelection()?.toString()) return;
            selection.onSelect(rowKey, event.shiftKey);
          },
        };
        const hasVolunteerSelect =
          "volunteerId" in row && volunteers !== undefined && volunteers.length > 0;
        const volunteerSelect = (title: string) =>
          hasVolunteerSelect && (
            // A volunteer who left the event shows as none.
            <AvatarPicker
              options={volunteerOptions}
              value={row.volunteerId}
              onChange={(volunteerId) => update(index, { volunteerId })}
              label={format(t.volunteerOf, { title })}
              placeholder={t.searchVolunteers}
              avatar={(option, size) =>
                option.person ? (
                  <UserAvatar person={option.person} size={size} />
                ) : (
                  <EmptyAvatar icon={UserRoundPlusIcon} size={size} />
                )
              }
            />
          );
        // No theme select while the module "projection.themes" is off.
        const hasThemeSelect =
          "volunteerId" in row &&
          themes !== undefined &&
          themes.length > 0 &&
          modules.includes("projection.themes");
        // A deleted theme counts as none.
        const ownThemeId =
          "volunteerId" in row && themes?.some((theme) => theme.id === row.themeId)
            ? (row.themeId ?? null)
            : null;
        // Without a theme of its own, the theme shows only after "Set theme…" of the row menu.
        const themeShown =
          hasThemeSelect &&
          (ownThemeId !== null || (shownField?.key === rowKey && shownField.field === "theme"));
        const themeSelect = (title: string, arrangementThemeId: string | null = null) =>
          themeShown && (
            <AvatarPicker
              options={themeOptions(arrangementThemeId)}
              value={ownThemeId}
              onChange={(themeId) => {
                update(index, { themeId });
                if (themeId === null) focusRowMenu(rowKey);
              }}
              label={format(t.themeOf, { title })}
              placeholder={t.searchThemes}
              defaultOpen={ownThemeId === null}
              onOpenChange={(open) => {
                if (open || ownThemeId !== null) return;
                hideField(rowKey, "theme");
                focusRowMenu(rowKey);
              }}
              avatar={(option, size) =>
                option.id ? (
                  // The initials of the theme name on a color of its own, as for a person.
                  <UserAvatar
                    person={{
                      id: option.id,
                      displayName: option.label,
                      email: null,
                      avatarUrl: null,
                    }}
                    size={size}
                  />
                ) : (
                  <EmptyAvatar icon={PaletteIcon} size={size} />
                )
              }
            />
          );
        const hasTiming = timing !== undefined && "volunteerId" in row;
        const durationSeconds = hasTiming ? ((row as ItemRow).durationSeconds ?? null) : null;
        // Narrow: an empty time field shows only after "Set planned time…" of the row menu, and while it has the focus.
        const durationShown =
          hasTiming &&
          (!narrow ||
            durationSeconds !== null ||
            (shownField?.key === rowKey && shownField.field === "duration"));
        const start = hasTiming ? timing.starts?.[index] : undefined;
        const timingShown = durationShown || start !== undefined;
        const timingFields = (title: string, fallback: number | null) => {
          if (!timingShown) return null;
          return (
            <span className="flex shrink-0 items-center gap-2">
              {start !== undefined && <PlannedStart start={start} />}
              {durationShown && (
                <DurationInput
                  value={durationSeconds}
                  fallback={fallback}
                  label={format(m.events.runSheet.durationOf, { title })}
                  onChange={(seconds) => update(index, { durationSeconds: seconds })}
                  autoFocus={durationSeconds === null && narrow}
                  onFocus={() => setShownField({ key: rowKey, field: "duration" })}
                  onBlur={() => {
                    if (durationSeconds === null) hideField(rowKey, "duration");
                  }}
                />
              )}
            </span>
          );
        };
        // The notes of a text item show only with a value, after "Add notes…" of the row menu, and while they have the focus.
        const notesShown =
          isTextRow(row) &&
          (row.notes.trim() !== "" || (shownField?.key === rowKey && shownField.field === "notes"));
        // The fields without a value that the row shows only after an action of its menu.
        const menuItems: RowMenuItem[] = [
          ...(hasThemeSelect && ownThemeId === null
            ? [
                {
                  id: "theme",
                  label: t.setTheme,
                  icon: <PaletteIcon />,
                  onSelect: () => setShownField({ key: rowKey, field: "theme" }),
                },
              ]
            : []),
          ...(hasTiming && narrow && durationSeconds === null
            ? [
                {
                  id: "duration",
                  label: t.setPlannedTime,
                  icon: <ClockIcon />,
                  onSelect: () => setShownField({ key: rowKey, field: "duration" }),
                },
              ]
            : []),
          ...(isTextRow(row) && !notesShown
            ? [
                {
                  id: "notes",
                  label: t.addNotes,
                  icon: <NotebookPenIcon />,
                  onSelect: () => setShownField({ key: rowKey, field: "notes" }),
                },
              ]
            : []),
        ];
        // Without actions, an empty place of the same size: the buttons of the rows stay in one column.
        const rowMenu = (title: string) =>
          menuItems.length > 0 ? (
            <RowMenu
              label={format(m.components.rowMenu.label, { title })}
              items={menuItems}
              dataKey={rowKey}
            />
          ) : (
            (hasThemeSelect || hasTiming || hasTextRows) && (
              <span aria-hidden className="size-7 shrink-0 pointer-coarse:size-8" />
            )
          );
        // Narrow: the actions stay on the line of the title, and the selects go
        // below at full width. Wide: one line, with the actions at the end.
        const rowClassName = cn(
          // Each item is a card of its own.
          // The left border on each row, so the marks of all rows stay in one column.
          "flex flex-wrap gap-2 rounded-xl border-l-4 border-l-transparent bg-surface-sunken px-3 py-2.5 @2xl:flex-nowrap",
          // The items of a block are one card with its header, with lines between them.
          inBlock(index) && "-mt-2 rounded-none border-t border-l-primary/40 border-t-border",
          lastInBlock(index) && "rounded-b-xl",
          selected && "border-l-primary bg-primary/15 ring-1 ring-primary/50",
          index === firstSelected && selection?.bar ? "relative" : false,
          drag?.index === index && "relative z-10 bg-surface-sunken shadow-md",
        );
        const controlsClassName =
          "order-last flex basis-full flex-wrap items-center gap-2 @2xl:order-none @2xl:basis-auto @2xl:flex-nowrap";
        const actionsClassName = "flex h-8 shrink-0 items-center gap-1";

        if (isTextRow(row) && lockedModule(row)) {
          // A text item of a module that is off: it can move, but not change (see `src/lib/modules/items.ts`).
          const lockModule = lockedModule(row)!;
          const label = row.title.trim() || format(t.untitledItem, { number: index + 1 });
          const lockText = format(m.modules.items.locked, {
            module: moduleDef(lockModule).label(m),
          });
          return withHeader(
            index,
            rowKey,
            <li
              key={row.key}
              data-row
              className={cn(rowClassName, "items-center text-muted")}
              {...selectHandlers}
            >
              {selectionBar(index)}
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-8 shrink-0 items-center gap-3">
                  {handle(label)}
                  {numberOf(label)}
                </div>
                {/* The reason of the lock shows on the row: a title attribute does not show on touch screens. */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{label}</span>
                  <span className="flex items-center gap-1.5 text-xs">
                    <LockIcon aria-hidden className="size-3 shrink-0" />
                    {lockText}
                  </span>
                </div>
              </div>
            </li>,
          );
        }

        if (isTextRow(row)) {
          const images = Boolean(row.imageSetId);
          const announcements = Boolean(row.announcementId);
          const textSlide = Boolean(row.textSlide) && !images && !announcements && !row.scripture;
          const label =
            row.title.trim() ||
            format(
              row.scripture
                ? t.untitledScripture
                : textSlide
                  ? t.untitledTextSlide
                  : t.untitledItem,
              { number: index + 1 },
            );
          const ItemIcon = announcements
            ? MegaphoneIcon
            : images
              ? ImagesIcon
              : row.scripture
                ? BookOpenIcon
                : textSlide
                  ? PresentationIcon
                  : MessageSquareTextIcon;
          const hintId = `${row.key}-reference-hint`;
          const unrecognized =
            row.scripture && row.title.trim() !== "" && !looksLikeScriptureReference(row.title);
          return withHeader(
            index,
            rowKey,
            <li
              key={row.key}
              data-row
              className={cn(rowClassName, "items-start")}
              {...selectHandlers}
            >
              {selectionBar(index)}
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="flex h-8 shrink-0 items-center gap-3">
                  {handle(label)}
                  {numberOf(label)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {!images && !announcements ? (
                      // The item keeps its title and notes. Until the save, it also keeps the
                      // fields of its old kind, so a change back restores them.
                      <TextKindMenu
                        kind={textSlide ? "textSlide" : row.scripture ? "scripture" : "text"}
                        textSlides={textSlides}
                        title={label}
                        onChange={(kind) =>
                          changeRow(rowKey, "kind", label, (current) =>
                            current.map((candidate) =>
                              keyOf(candidate) === rowKey
                                ? ({
                                    ...candidate,
                                    scripture: kind === "scripture",
                                    // A scripture reading starts with a translation in the language of the app.
                                    scriptureTranslation:
                                      row.scriptureTranslation ??
                                      (kind === "scripture"
                                        ? defaultTranslationFor(locale, translations)
                                        : null),
                                    textSlide: kind === "textSlide",
                                    description: row.description ?? "",
                                    highlight: row.highlight ?? "",
                                  } as Row)
                                : candidate,
                            ),
                          )
                        }
                      />
                    ) : (
                      <span className={ITEM_ICON_CLASS}>
                        <ItemIcon aria-hidden />
                      </span>
                    )}
                    <Input
                      aria-label={format(
                        row.scripture
                          ? t.scriptureReference
                          : images
                            ? t.imageItemTitle
                            : textSlide
                              ? t.textSlideTitle
                              : t.itemTitle,
                        { number: index + 1 },
                      )}
                      placeholder={
                        row.scripture
                          ? t.scriptureReferencePlaceholder
                          : textSlide
                            ? t.textSlideTitlePlaceholder
                            : t.itemTitlePlaceholder
                      }
                      required
                      maxLength={EVENT_ITEM_TITLE_MAX_LENGTH}
                      value={row.title}
                      onChange={(event) => update(index, { title: event.target.value })}
                      aria-describedby={unrecognized ? hintId : undefined}
                      className="min-w-32 flex-1"
                    />
                    {/* The language and the translation on the line of the reference; below it when the line is too narrow. */}
                    {row.scripture && (
                      <ScriptureTranslationSelect
                        value={row.scriptureTranslation ?? ""}
                        onChange={(translation) =>
                          update(index, { scriptureTranslation: translation })
                        }
                        title={label}
                        className="shrink-0"
                      />
                    )}
                  </div>
                  {unrecognized && (
                    <p id={hintId} className="pl-6 text-xs text-muted">
                      {t.referenceNotRecognized}
                    </p>
                  )}
                  {images && imageItem?.(row, label)}
                  {announcements && announcementItem?.(row, label)}
                  {row.scripture && pasteRow(row, label)}
                  {textSlide && (
                    <>
                      <Textarea
                        aria-label={format(t.textSlideDescription, { number: index + 1 })}
                        placeholder={t.textSlideDescriptionPlaceholder}
                        maxLength={EVENT_ITEM_DESCRIPTION_MAX_LENGTH}
                        value={row.description ?? ""}
                        onChange={(event) => update(index, { description: event.target.value })}
                        className="min-h-16"
                      />
                      <Textarea
                        aria-label={format(t.textSlideHighlight, { number: index + 1 })}
                        placeholder={t.textSlideHighlightPlaceholder}
                        maxLength={EVENT_ITEM_HIGHLIGHT_MAX_LENGTH}
                        value={row.highlight ?? ""}
                        onChange={(event) => update(index, { highlight: event.target.value })}
                        className="min-h-10 font-semibold"
                      />
                      {!row.description?.trim() && !row.highlight?.trim() && (
                        <p className="text-xs text-muted">{t.textSlideEmpty}</p>
                      )}
                    </>
                  )}
                  {notesShown && (
                    <Textarea
                      aria-label={format(textSlide ? t.textSlideNotes : t.itemNotes, {
                        number: index + 1,
                      })}
                      placeholder={textSlide ? t.textSlideNotesPlaceholder : t.itemNotesPlaceholder}
                      maxLength={EVENT_ITEM_NOTES_MAX_LENGTH}
                      value={row.notes}
                      onChange={(event) => update(index, { notes: event.target.value })}
                      autoFocus={row.notes.trim() === ""}
                      onFocus={() => setShownField({ key: rowKey, field: "notes" })}
                      onBlur={() => {
                        if (row.notes.trim() !== "") return;
                        // Only spaces: no notes. The hidden field keeps no value.
                        if (row.notes !== "") update(index, { notes: "" });
                        hideField(rowKey, "notes");
                        focusRowMenu(rowKey);
                      }}
                      className="min-h-10"
                    />
                  )}
                </div>
              </div>
              {(hasVolunteerSelect || themeShown || timingShown) && (
                <div className={cn(controlsClassName, "@2xl:h-8")}>
                  {volunteerSelect(label)}
                  {themeSelect(label)}
                  {timingFields(label, null)}
                </div>
              )}
              <div className={actionsClassName}>
                <RemoveButton
                  title={label}
                  onRemove={() =>
                    changeRow(rowKey, "remove", label, (current) =>
                      current.filter((candidate) => keyOf(candidate) !== rowKey),
                    )
                  }
                />
                {rowMenu(label)}
              </div>
            </li>,
          );
        }

        const songRow = row as Row & SetlistRow;
        const song = songsById.get(songRow.songId);
        const title = song?.title ?? t.unknownSong;
        const arrangement = song?.arrangements.find((a) => a.id === songRow.arrangementId);
        const details = [
          song?.artist,
          ...(arrangement ? arrangementDetails(arrangement, noteNames, songRow.musicalKey) : []),
        ].filter(Boolean);
        // The keys of the chart, and the key of the row when the chart does not list it (anymore).
        const keyOptions = arrangement?.key ? [arrangement.key, ...arrangement.otherKeys] : [];
        if (songRow.musicalKey && !keyOptions.some((key) => sameKey(key, songRow.musicalKey))) {
          keyOptions.push(songRow.musicalKey);
        }
        const hasArrangementSelect = song !== undefined && song.arrangements.length > 1;
        const hasKeySelect = keyOptions.length > 1;

        return withHeader(
          index,
          rowKey,
          <li
            key={"key" in songRow ? songRow.key : songRow.arrangementId}
            data-row
            className={cn(rowClassName, "items-center")}
            {...selectHandlers}
          >
            {selectionBar(index)}
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {handle(title)}
              {numberOf(title)}
              <span className={ITEM_ICON_CLASS}>
                <MusicIcon aria-hidden />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">{title}</span>
                {details.length > 0 && (
                  <span className="truncate text-xs text-muted">{details.join(" · ")}</span>
                )}
              </div>
            </div>
            {(hasVolunteerSelect ||
              themeShown ||
              hasArrangementSelect ||
              hasKeySelect ||
              timingShown) && (
              <div className={controlsClassName}>
                {volunteerSelect(title)}
                {themeSelect(title, arrangement?.themeId ?? null)}
                {song && hasArrangementSelect && (
                  <NativeSelect
                    aria-label={format(t.arrangementOf, { title })}
                    value={songRow.arrangementId}
                    // The keys belong to the arrangement.
                    onChange={(event) => {
                      const arrangementId = event.target.value;
                      changeRow(rowKey, "arrangement", title, (current) =>
                        current.map((candidate) =>
                          keyOf(candidate) === rowKey
                            ? ({ ...candidate, arrangementId, musicalKey: null } as Row)
                            : candidate,
                        ),
                      );
                    }}
                    className="flex-1 @2xl:w-auto @2xl:max-w-48 @2xl:flex-none"
                  >
                    {song.arrangements.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.isDefault
                          ? format(t.defaultArrangement, { name: option.name })
                          : option.name}
                        {option.key ? ` · ${fromEnglish(option.key, noteNames)}` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                )}
                {hasKeySelect && (
                  // A round mark with the key, as the volunteer and the theme. The first option: the key of the chart.
                  <AvatarPicker
                    options={keyOptions.map((key, keyIndex) => ({
                      id: keyIndex === 0 ? null : key,
                      label:
                        keyIndex === 0
                          ? format(t.chartKey, { key: fromEnglish(key, noteNames) })
                          : fromEnglish(key, noteNames),
                      key,
                    }))}
                    value={
                      keyOptions.find(
                        (key, keyIndex) => keyIndex > 0 && sameKey(key, songRow.musicalKey),
                      ) ?? null
                    }
                    onChange={(key) =>
                      update(index, {
                        musicalKey: key && !sameKey(key, arrangement?.key) ? key : null,
                      })
                    }
                    label={format(t.keyOf, { title })}
                    placeholder={t.searchKeys}
                    avatar={(option, size) => (
                      <KeyAvatar
                        name={fromEnglish(option.key, noteNames)}
                        chart={option.id === null}
                        size={size}
                      />
                    )}
                  />
                )}
                {timingFields(title, arrangement?.durationSeconds ?? null)}
              </div>
            )}
            <div className={actionsClassName}>
              {rowActions?.(songRow, title)}
              <RemoveButton
                title={title}
                onRemove={() =>
                  changeRow(rowKey, "remove", title, (current) =>
                    current.filter((candidate) => keyOf(candidate) !== rowKey),
                  )
                }
              />
              {rowMenu(title)}
            </div>
          </li>,
        );
      })}
      {pasting && (
        <PasteScriptureDialog
          reference={pasting.reference}
          translation={pasting.translation}
          eventId={null}
          open
          onOpenChange={(open) => !open && setPasting(null)}
          onSaved={() =>
            setPasted((current) =>
              new Set(current).add(`${pasting.translation.id} ${pasting.reference.trim()}`),
            )
          }
        />
      )}
      <LiveChangeDialog
        change={liveChange}
        onClose={() => setLiveChange(null)}
        onConfirm={() => {
          if (liveChange) onChange(liveChange.change(rowsRef.current));
          setLiveChange(null);
        }}
      />
    </ol>
  );
}

/** The round mark of the kind of an item, before its title (also the button of `TextKindMenu`). */
export const ITEM_ICON_CLASS =
  "flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground [&_svg]:size-4";

/** The width of the `@2xl` container size, in rem: a narrower list wraps its rows (see `controlsClassName`). */
const WIDE_LIST_REM = 42;

/** True while the list is narrower than `WIDE_LIST_REM`. False before the first measure. */
function useNarrow(ref: React.RefObject<HTMLElement | null>): boolean {
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setNarrow(entry!.contentRect.width < WIDE_LIST_REM * rem);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return narrow;
}

/** The event comes from a control of the row, or from a popup of it (a portal, outside the row). */
function onControl(event: React.MouseEvent<HTMLElement>): boolean {
  const target = event.target as Element;
  if (!event.currentTarget.contains(target)) return true;
  const control = target.closest(
    "input, textarea, select, button, a, label, [role], [contenteditable='true']",
  );
  return (
    control !== null && event.currentTarget.contains(control) && control !== event.currentTarget
  );
}

/** A change of the live row that waits for the question: a remove, another arrangement, or another kind of a text item. */
/** A field of a row that shows without a value only after its action in the row menu. */
type ShownField = "theme" | "duration" | "notes";

type LiveChange<Row> = {
  kind: "remove" | "arrangement" | "kind";
  title: string;
  change: (rows: Row[]) => Row[];
};

function keyOf(row: SetlistRow | ItemRow): string {
  return "key" in row ? row.key : row.arrangementId;
}

/** Asks before a change of the item that the projection shows now. The change can still go on. */
function LiveChangeDialog<Row>({
  change,
  onClose,
  onConfirm,
}: {
  change: LiveChange<Row> | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { m, format } = useI18n();
  const t = m.components.setlistRows;
  // Keep the last text while the dialog animates out.
  const [shown, setShown] = useState(change);
  if (change && change !== shown) setShown(change);

  return (
    <AlertDialog.Root open={change !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <AlertDialog.Popup className={cn(DIALOG_POPUP_CLASS, "w-md")}>
          <DialogHeader>
            <AlertDialog.Title className="font-heading text-lg font-semibold tracking-tight">
              {t.liveChangeTitle}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted">
              {shown &&
                format(
                  shown.kind === "remove"
                    ? t.liveRemove
                    : shown.kind === "kind"
                      ? t.liveKind
                      : t.liveArrangement,
                  { title: shown.title },
                )}
            </AlertDialog.Description>
          </DialogHeader>
          <DialogFooter>
            <DialogActions>
              <AlertDialog.Close render={<Button type="button" variant="ghost" />}>
                {m.common.actions.cancel}
              </AlertDialog.Close>
              <Button
                type="button"
                variant={shown?.kind === "remove" ? "destructive" : "default"}
                onClick={onConfirm}
              >
                {shown?.kind === "remove" ? t.liveRemoveConfirm : t.liveArrangementConfirm}
              </Button>
            </DialogActions>
          </DialogFooter>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/** The key of a song as a round mark, e.g. "Dm". The key of the chart has a dashed border, as the "none" option of the other pickers. */
function KeyAvatar({ name, chart, size }: { name: string; chart: boolean; size: AvatarSize }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium tabular-nums",
        size === "md" ? "size-8 text-xs" : "size-6 text-[0.625rem]",
        chart
          ? "border border-dashed border-muted-foreground/50 text-muted"
          : "bg-surface-sunken text-text",
      )}
    >
      {name}
    </span>
  );
}

function RemoveButton({ title, onRemove }: { title: string; onRemove: () => void }) {
  const { m, format } = useI18n();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={format(m.components.setlistRows.remove, { title })}
      onClick={onRemove}
    >
      <XIcon />
    </Button>
  );
}

/**
 * For example ["G", "72 BPM", "4:05"]. The key is in `notation`; with
 * `musicalKey` (the key to play), that key.
 */
export function arrangementDetails(
  arrangement: ArrangementSummaryDTO,
  notation: Notation,
  musicalKey?: string | null,
): string[] {
  const details: string[] = [];
  const key = musicalKey ?? arrangement.key;
  if (key) details.push(fromEnglish(key, notation));
  if (arrangement.bpm) details.push(`${arrangement.bpm} BPM`);
  if (arrangement.durationSeconds) {
    const seconds = arrangement.durationSeconds;
    details.push(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
  }
  return details;
}
