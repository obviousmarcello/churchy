"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ListMusicIcon, LoaderCircleIcon, XIcon } from "lucide-react";

import { EditSongButton, type EditSongTarget } from "@/app/munkater/enektar/edit-song-dialog";
import { AddItemBox } from "@/components/music/add-item-box";
import { ModuleGate } from "@/components/music/app-config";
import { useChangeNotices } from "@/components/music/event-changes";
import { useUnsavedChangesWarning } from "@/components/music/form-parts";
import { invalidatePageCache } from "@/components/music/page-cache";
import { RunSheetSummary } from "@/components/music/run-sheet";
import {
  SetlistRows,
  isTextRow,
  rowSeconds,
  scriptureTranslationInput,
  type ItemRow,
} from "@/components/music/setlist-rows";
import { Button } from "@/components/music/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import type { AvatarPerson } from "@/components/music/user-avatar";
import type { ThemeOption } from "@/components/music/setlist-rows";
import { useI18n } from "@/i18n/music/client";
import type { EventAnnouncementsDTO } from "@/lib/music/announcements/schema";
import {
  blockPlan,
  normalizeBlocks,
  runSheetWithBlocks,
  type EventBlock,
} from "@/lib/music/event-blocks";
import { mergeItems } from "@/lib/music/event-items-merge";
import { changedPages } from "@/lib/music/page-keys";
import { registerPendingSave } from "@/lib/music/pending-saves";
import type { EventImageSetsDTO } from "@/lib/music/projection/images";
import type { ProjectionLook } from "@/lib/music/projection/themes";
import type { SetlistItemDTO } from "@/server/music/models/setlists";
import type { SongWithArrangementsDTO } from "@/server/music/models/songs";
import { createEventBlockAction, deleteEventBlockAction, saveItemsAction } from "./actions-client";
import { eventSetlistIdAction } from "../sync-actions";
import { AddAnnouncementsButton, AnnouncementItem } from "./announcement-item";
import { BlockEditor } from "./block-editor";
import { ImageUploadButton, useImageItemUpload } from "./event-image-upload";
import { ImageItemImages } from "./image-item";

/** The time without changes before a save, so typing in a text item does not save each letter. */
const AUTOSAVE_DELAY_MS = 800;

/** The saves of one change that can meet a change of another user, each with a merge. */
const SAVE_TRIES = 5;

type SaveStatus =
  { kind: "idle" | "pending" | "saving" | "saved" } | { kind: "error"; message: string };

/**
 * The items of an event: add songs, text items, scripture readings and image
 * items, remove and reorder them, choose the arrangement and the volunteer of
 * each item and edit the text items. A song can appear more than once. Each
 * change saves automatically. Each item can have a planned time: the list shows
 * the planned start of each item and the total time (see `runSheet`).
 * The changes of other users come in at once, and
 * merge with the changes here that are not saved yet (see `mergeItems`). An image item comes from the button next to the field,
 * or from files dropped on the page (see `event-image-upload.tsx`). An
 * announcements item comes from the other button (see `announcement-item.tsx`).
 * Selected adjacent items can become a block, with a name and a countdown
 * (see `@/lib/event-blocks`).
 */
export function ItemsForm({
  eventId,
  setlistId,
  selection,
  catalog,
  volunteers,
  themes,
  maxItems,
  imageSets,
  look,
  announcements,
  eventStartsAt,
  eventEndsAt,
  eventDurationMinutes,
  liveKey,
  blocks,
  onEditSong,
  statusSlot,
}: {
  eventId: string;
  /** The setlist of the saved items: the base of the next save. */
  setlistId: string | null;
  /** The saved items, in order. */
  selection: ItemRow[];
  /** Every song with its arrangements, by title. */
  catalog: SongWithArrangementsDTO[];
  /** The volunteers of the event, by name. */
  volunteers: AvatarPerson[];
  /** The projection themes, the default first. */
  themes: ThemeOption[];
  maxItems: number;
  /** The images of the image items, by set. */
  imageSets: EventImageSetsDTO;
  /** The look of the event, for the previews of the images. */
  look: ProjectionLook;
  /** The announcements items, with their calendar entries. */
  announcements: EventAnnouncementsDTO;
  eventStartsAt: string;
  eventEndsAt: string;
  eventDurationMinutes: number;
  /** The key of the item that the projection shows now, if any. */
  liveKey: string | null;
  /** The blocks of the items. */
  blocks: EventBlock[];
  /** For song admins: opens the song of a row in the edit dialog. */
  onEditSong?: (target: EditSongTarget) => void;
  /** The element for the save state, e.g. below the heading of the items. Without it, the state shows below the items. */
  statusSlot?: HTMLElement | null;
}) {
  const { m, plural, format } = useI18n();
  const tb = m.components.eventBlocks;
  const [rows, setRows] = useState(selection);
  /** The keys of the selected items, for a new block. */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /** The item of the last click without Shift: the start of a range. */
  const anchor = useRef<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  /** The new block: its name field gets the focus when it shows. */
  const [newBlockKey, setNewBlockKey] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  /** The block that its X removes now. */
  const [removingBlock, setRemovingBlock] = useState<string | null>(null);
  /** After the remove of a block: its first item gets the focus of the X. */
  const focusAfterRemove = useRef<{ blockKey: string; itemKey: string } | null>(null);
  // The rows now, for the upload, which adds rows while it runs.
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  });
  const root = useRef<HTMLDivElement>(null);

  const songsById = new Map(catalog.map((song) => [song.id, song]));
  const volunteerIds = new Set(volunteers.map((person) => person.id));
  const themeIds = new Set(themes.map((theme) => theme.id));
  // The server rejects a text item without a title, so these changes wait.
  const canSave = rows.every((row) => !isTextRow(row) || row.title.trim() !== "");
  const isFull = rows.length >= maxItems;
  // A block with a time of its own takes that time (see `runSheetWithBlocks`).
  const sheet = runSheetWithBlocks(
    eventStartsAt,
    rows.map((row) => ({ seconds: rowSeconds(row, songsById), blockKey: row.blockKey ?? null })),
    blocks,
  );

  const {
    status,
    markPending,
    retry: flush,
    setDragging,
  } = useItemsSync({
    eventId,
    saved: { setlistId, rows: selection },
    rows,
    replaceRows: (next) => {
      rowsRef.current = next;
      setRows(next);
    },
    canSave,
    inputOf: (row) => toInput(row, volunteerIds, themeIds),
    titleOf: (row) =>
      isTextRow(row)
        ? row.title.trim() ||
          format(m.components.setlistRows.untitledItem, { number: rows.indexOf(row) + 1 })
        : (songsById.get(row.songId)?.title ?? m.components.setlistRows.unknownSong),
  });

  function changeRows(next: ItemRow[]) {
    setRows(next);
    markPending();
  }

  function add(row: ItemRow) {
    changeRows([...rows, row]);
  }

  // Only the sets of the items, as `count_event_images_for_limit()`: the set
  // of a removed item waits for the cleanup, but does not count.
  const imageCount = rows.reduce(
    (sum, row) =>
      sum + (isTextRow(row) && row.imageSetId ? (imageSets[row.imageSetId]?.length ?? 0) : 0),
    0,
  );
  const upload = useImageItemUpload({
    eventId,
    imageCount,
    canAdd: () => rowsRef.current.length < maxItems,
    addRow: (row) => {
      rowsRef.current = [...rowsRef.current, row];
      setRows(rowsRef.current);
      markPending();
    },
    dropTarget: root,
  });
  const inputActions = (
    <>
      <ModuleGate id="projection.images">
        <ImageUploadButton upload={upload} />
      </ModuleGate>
      <ModuleGate id="projection.announcements">
        <AddAnnouncementsButton
          eventId={eventId}
          disabled={isFull}
          onCreated={(announcementId) => {
            if (rowsRef.current.length >= maxItems) return;
            rowsRef.current = [
              ...rowsRef.current,
              {
                kind: "text",
                key: crypto.randomUUID(),
                title: m.announcements.editor.defaultTitle,
                notes: "",
                scripture: false,
                scriptureTranslation: null,
                announcementId,
                volunteerId: null,
              },
            ];
            setRows(rowsRef.current);
            markPending();
          }}
        />
      </ModuleGate>
    </>
  );
  const announcementContext = {
    eventId,
    eventStartsAt,
    eventEndsAt,
    data: announcements,
    imageSets,
    look,
  };

  // The selected items that are not there anymore do not count.
  // An item of a block is not for a new block.
  const blockKeys = new Set(blocks.map((block) => block.key));
  const selectable = (row: ItemRow) => !row.blockKey || !blockKeys.has(row.blockKey);
  const selectedIndexes = rows.flatMap((row, index) =>
    selected.has(row.key) && selectable(row) ? [index] : [],
  );
  const plannedItems = rows.map((row) => ({
    blockKey: row.blockKey ?? null,
    seconds: rowSeconds(row, songsById),
  }));

  /** A click selects the item or takes it out. Shift + click selects the items from the last clicked one. */
  function select(key: string, range: boolean) {
    setSelectionError(null);
    const keys = rows.map((row) => row.key);
    const from = range && anchor.current ? keys.indexOf(anchor.current) : -1;
    const to = keys.indexOf(key);
    if (from >= 0 && to >= 0) {
      const [first, last] = from < to ? [from, to] : [to, from];
      const inRange = rows
        .slice(first, last + 1)
        .filter(selectable)
        .map((row) => row.key);
      setSelected((current) => new Set([...current, ...inRange]));
      return;
    }
    anchor.current = key;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setSelectionError(null);
    anchor.current = null;
  }

  /** The number toggle of the item, else its drag handle: the focus goes there when its control goes away. */
  function focusItem(key: string) {
    const toggle = root.current?.querySelector<HTMLElement>(
      `[data-select-toggle="${CSS.escape(key)}"]`,
    );
    if (toggle) return toggle.focus();
    const index = rowsRef.current.findIndex((row) => row.key === key);
    const rowElements = root.current?.querySelectorAll("[data-row]");
    rowElements?.[index]?.querySelector<HTMLElement>("[data-drag-handle]")?.focus();
  }

  /** "Clear selection": the bar goes away with its button, so the focus goes to the first item that was selected. */
  function clearSelectionFromBar() {
    const first = selectedIndexes[0] === undefined ? undefined : rows[selectedIndexes[0]]?.key;
    clearSelection();
    if (first) requestAnimationFrame(() => focusItem(first));
  }

  // Escape clears the selection, but not in a field.
  const hasSelection = selectedIndexes.length > 0;
  useEffect(() => {
    if (!hasSelection) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (
        (event.target as Element | null)?.closest?.(
          "input, textarea, select, [role=dialog], [role=menu], [role=listbox]",
        )
      )
        return;
      clearSelection();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasSelection]);

  /** A new block of the selected items, which must be adjacent. Its header then shows its name, to change in place. */
  async function createBlock() {
    const first = selectedIndexes[0];
    const last = selectedIndexes.at(-1);
    if (first === undefined || last === undefined || creating) return;
    if (last - first + 1 !== selectedIndexes.length) {
      setSelectionError(tb.notAdjacent);
      return;
    }
    setSelectionError(null);
    // The server makes the block of its items: the changes here go first.
    if (!canSave) {
      setSelectionError(m.events.items.needTitles);
      return;
    }
    setCreating(true);
    try {
      if (!(await flush())) {
        setSelectionError(m.events.actions.itemsSaveFailed);
        return;
      }
      // As `selectedIndexes`: not the items that went into a block, e.g. after a change of another user.
      const keys = rowsRef.current.flatMap((row) =>
        selected.has(row.key) && selectable(row) ? [row.key] : [],
      );
      if (keys.length === 0) return clearSelection();
      invalidatePageCache(changedPages.event(eventId));
      const result = await createEventBlockAction(eventId, keys, tb.defaultName);
      if (result.status === "error") {
        setSelectionError(result.message || m.events.actions.blockSaveFailed);
        return;
      }
      setNewBlockKey(result.key);
      clearSelection();
    } catch {
      setSelectionError(m.events.actions.blockSaveFailed);
    } finally {
      setCreating(false);
    }
  }

  async function ungroup(block: EventBlock) {
    if (removingBlock) return;
    setBlockError(null);
    setRemovingBlock(block.key);
    // The header goes away with its X: the focus goes to the first item of the block.
    const firstKey = rowsRef.current.find((row) => row.blockKey === block.key)?.key;
    focusAfterRemove.current = firstKey ? { blockKey: block.key, itemKey: firstKey } : null;
    invalidatePageCache(changedPages.event(eventId));
    try {
      const result = await deleteEventBlockAction(eventId, block.key);
      if (result.status === "error") {
        focusAfterRemove.current = null;
        setBlockError(result.message);
      }
    } catch {
      focusAfterRemove.current = null;
      setBlockError(m.events.actions.blockDeleteFailed);
    } finally {
      setRemovingBlock(null);
    }
  }

  // The block is gone: the focus that its X had goes to its first item.
  useEffect(() => {
    const target = focusAfterRemove.current;
    if (!target || blocks.some((block) => block.key === target.blockKey)) return;
    focusAfterRemove.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    requestAnimationFrame(() => focusItem(target.itemKey));
  });

  return (
    <div ref={root} className="flex flex-col gap-4">
      {rows.length > 0 ? (
        <>
          {blockError && (
            <p role="alert" className="text-sm text-danger">
              {blockError}
            </p>
          )}
          <SetlistRows
            rows={rows}
            songsById={songsById}
            onChange={changeRows}
            liveKey={liveKey}
            onDragChange={setDragging}
            volunteers={volunteers}
            themes={themes}
            textSlides
            // The form is for event admins: they can paste into the shared cache.
            canPasteScripture
            // Without any time, the rows show no planned starts: they would all be the start of the event.
            timing={{ starts: sheet.totalSeconds > 0 ? sheet.starts : null }}
            selection={{
              keys: selected,
              onSelect: select,
              onClear: clearSelection,
              bar: (
                <SelectionBar
                  count={selectedIndexes.length}
                  creating={creating}
                  error={selectionError}
                  onCreate={() => void createBlock()}
                  onClear={clearSelectionFromBar}
                />
              ),
            }}
            blocks={{
              list: blocks,
              header: (block) => (
                <BlockEditor
                  eventId={eventId}
                  block={block}
                  plan={blockPlan(plannedItems, block.key)}
                  autoFocus={block.key === newBlockKey}
                  editSlot={onEditSong !== undefined}
                  onFocused={() => setNewBlockKey(null)}
                  removing={removingBlock === block.key}
                  onUngroup={() => void ungroup(block)}
                />
              ),
            }}
            rowActions={
              onEditSong &&
              ((row, title) => (
                <EditSongButton
                  title={title}
                  onClick={() =>
                    onEditSong({ songId: row.songId, arrangementId: row.arrangementId })
                  }
                />
              ))
            }
            imageItem={(row, title) =>
              row.imageSetId && (
                <ImageItemImages
                  eventId={eventId}
                  setId={row.imageSetId}
                  title={title}
                  images={imageSets[row.imageSetId] ?? []}
                  look={look}
                  progress={upload.progress?.setId === row.imageSetId ? upload.progress : null}
                />
              )
            }
            announcementItem={(row, title) =>
              row.announcementId && (
                <AnnouncementItem
                  context={announcementContext}
                  announcementId={row.announcementId}
                  title={title}
                  editable
                  className="pl-6"
                />
              )
            }
          />
          <RunSheetSummary
            sheet={sheet}
            startsAt={eventStartsAt}
            durationMinutes={eventDurationMinutes}
            admin
          />
          {volunteers.length === 0 && (
            <p className="text-sm text-muted">{m.events.items.noVolunteersHint}</p>
          )}
        </>
      ) : (
        <Empty className="rounded-card border p-6 md:p-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListMusicIcon />
            </EmptyMedia>
            <EmptyTitle>{m.events.items.emptyTitle}</EmptyTitle>
            <EmptyDescription>{m.events.items.emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {isFull ? (
        <p className="text-sm text-muted">{plural(m.events.items.full, maxItems)}</p>
      ) : (
        <AddItemBox
          catalog={catalog}
          rows={rows}
          onAdd={add}
          inputAction={() => inputActions}
          textSlides
        />
      )}
      {upload.errors.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 text-sm text-danger">
          {upload.errors.map((error, index) => (
            <p key={index}>{error}</p>
          ))}
        </div>
      )}

      {/* In the place that the page gives, e.g. next to the heading of the items, else here. A failed
          save and the missing titles stay here, next to the items: they ask for an action on them. */}
      {statusSlot && canSave && status.kind !== "error" ? (
        createPortal(
          <SaveStatusMessage status={status} canSave={canSave} onRetry={flush} />,
          statusSlot,
        )
      ) : (
        <SaveStatusMessage status={status} canSave={canSave} onRetry={flush} />
      )}
    </div>
  );
}

type SavedItems = { setlistId: string | null; rows: ItemRow[] };

/**
 * Saves the rows after each change, when `canSave` is true, over the items
 * that the form knows from the server (the base). One save runs at a time:
 * changes during a save go in the next one. When the event has other items
 * now, e.g. from another user, the save merges with them and tries again.
 * New `saved` items, e.g. after a change of another user, merge with the
 * changes here that are not saved yet. During a drag they wait for its end.
 * A change here that did not go in as it was shows a notice.
 */
function useItemsSync({
  eventId,
  saved,
  rows,
  replaceRows,
  canSave,
  inputOf,
  titleOf,
}: {
  eventId: string;
  /** The items on the server, from the page. */
  saved: SavedItems;
  rows: ItemRow[];
  replaceRows: (rows: ItemRow[]) => void;
  canSave: boolean;
  inputOf: (row: ItemRow) => ItemInput;
  titleOf: (row: ItemRow) => string;
}) {
  const { m } = useI18n();
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const notify = useChangeNotices(eventId, null);
  const router = useRouter();
  /** False after the form unmounts: the last save can end on another page. */
  const mounted = useRef(true);
  /** The items that the server has, as the form knows them. */
  const base = useRef(saved);
  /** The setlists that the form knew: an answer with one of them is older than the base. */
  const seen = useRef(new Set([saved.setlistId]));
  const rowsRef = useRef(rows);
  /** The running save: true when it saved the items. */
  const running = useRef<Promise<boolean> | null>(null);
  const dragging = useRef(false);
  /** New items of the server that wait for the end of a drag. */
  const waiting = useRef<SavedItems | null>(null);
  // On another page, a notice has a button to the event, where the user can check the items.
  const openEvent = {
    label: m.components.eventChanges.openEvent,
    onClick: () => router.push(`/munkater/esemenyek/${eventId}`),
  };
  const latest = useRef({ replaceRows, inputOf, titleOf, notify, canSave, openEvent });
  useLayoutEffect(() => {
    rowsRef.current = rows;
    latest.current = { replaceRows, inputOf, titleOf, notify, canSave, openEvent };
  });

  const [inputs] = useState(
    () => (list: ItemRow[]) => JSON.stringify(list.map(latest.current.inputOf)),
  );

  /** The rows with the items of the server and the changes here that are not saved yet. */
  const [merge] = useState(() => (theirs: SavedItems) => {
    const { replaceRows, titleOf, notify, openEvent } = latest.current;
    const result = mergeItems(base.current.rows, rowsRef.current, theirs.rows);
    // Two moves can take items of a block apart: one run keeps the block, as on the server.
    const items = normalizeBlocks(result.items);
    base.current = theirs;
    seen.current.add(theirs.setlistId);
    if (JSON.stringify(items) !== JSON.stringify(rowsRef.current)) {
      rowsRef.current = items;
      replaceRows(items);
    }
    if (result.conflicts.length > 0) {
      void notify({
        authors: [],
        conflicts: result.conflicts.map((conflict) => ({
          ...conflict,
          item: { key: conflict.item.key, title: titleOf(conflict.item) },
        })),
        action: mounted.current ? undefined : openEvent,
      });
    }
  });

  const savedJson = JSON.stringify(saved);
  useEffect(() => {
    const incoming: SavedItems = JSON.parse(savedJson);
    function receive() {
      if (dragging.current) {
        waiting.current = incoming;
        return;
      }
      merge(incoming);
    }
    if (
      incoming.setlistId === base.current.setlistId &&
      inputs(incoming.rows) === inputs(base.current.rows)
    )
      return;
    if (incoming.setlistId === base.current.setlistId || !seen.current.has(incoming.setlistId)) {
      receive();
      return;
    }
    // An answer from before a save here: the form knows newer items.
    if (incoming.setlistId !== null) return;
    // No items: an answer from before a save here, or a remove of all items
    // after it. Null is the same each time, so the server tells which.
    const before = base.current.setlistId;
    let current = true;
    void eventSetlistIdAction(eventId).then((setlistId) => {
      if (current && setlistId === null && base.current.setlistId === before) receive();
    });
    return () => {
      current = false;
    };
  }, [eventId, savedJson, inputs, merge]);

  /** Saves the rows now, or gives the running save. True when the items are saved. */
  const flush = useCallback((): Promise<boolean> => {
    if (running.current) return running.current;
    const save = (async () => {
      setStatus({ kind: "saving" });
      try {
        for (let tries = 0; ; tries++) {
          const sending = rowsRef.current;
          if (inputs(sending) === inputs(base.current.rows)) break;
          if (tries >= SAVE_TRIES) {
            setStatus({ kind: "error", message: m.events.items.saveFailed });
            return false;
          }
          invalidatePageCache(changedPages.event(eventId));
          const { inputOf } = latest.current;
          const result = await saveItemsAction(
            eventId,
            withoutSavedAssignments(sending.map(inputOf), base.current.rows.map(inputOf)),
            base.current.setlistId,
          );
          if (result.status === "error") {
            setStatus({ kind: "error", message: result.message });
            return false;
          }
          if (result.status === "saved") {
            base.current = { setlistId: result.setlistId, rows: sending };
            seen.current.add(result.setlistId);
          } else {
            merge({ setlistId: result.setlistId, rows: toItemRows(result.items) });
          }
        }
        setStatus({ kind: "saved" });
        return true;
      } catch {
        setStatus({ kind: "error", message: m.events.items.connectionFailed });
        return false;
      }
    })();
    running.current = save;
    // A callback of the promise runs after the line above, also when the save ends without a request.
    void save.finally(() => {
      running.current = null;
    });
    return save;
  }, [eventId, m, inputs, merge]);

  const items = inputs(rows);
  useEffect(() => {
    if (!canSave) return;
    if (items === inputs(base.current.rows)) {
      // The user undid the changes before the save, or a merge brought the same items.
      const timer = setTimeout(() =>
        setStatus((current) => (current.kind === "pending" ? { kind: "saved" } : current)),
      );
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [items, canSave, flush, inputs]);

  // A link to a page with the items saves the changes first (see `savePendingChanges`).
  // Without a title of a text item, the save is not possible: the page stays, with a button to open the link without saving.
  useEffect(() => {
    mounted.current = true;
    const changed = () =>
      running.current !== null || inputs(rowsRef.current) !== inputs(base.current.rows);
    const unregister = registerPendingSave({
      pending: changed,
      save: () => (running.current || latest.current.canSave ? flush() : Promise.resolve(false)),
    });
    return () => {
      mounted.current = false;
      unregister();
      // Another link, e.g. in the sidebar: the timer of the save stops with the page.
      if (latest.current.canSave && changed()) void flush();
    };
  }, [flush, inputs]);

  // Ask before the page closes with changes that are not saved yet.
  const unsaved = !canSave || (status.kind !== "idle" && status.kind !== "saved");
  useUnsavedChangesWarning(unsaved);

  return {
    status,
    /** Call on each change by the user. A running save keeps its status. */
    markPending: () =>
      setStatus((current) => (current.kind === "saving" ? current : { kind: "pending" })),
    retry: flush,
    /** New items of the server wait during a drag: the rows must not move under the pointer. */
    setDragging(value: boolean) {
      dragging.current = value;
      const next = waiting.current;
      if (value || !next) return;
      waiting.current = null;
      merge(next);
    },
  };
}

/**
 * The bar over the first selected item while items are selected: "Create
 * block" for the selected items, and "Clear selection".
 */
function SelectionBar({
  count,
  creating,
  error,
  onCreate,
  onClear,
}: {
  count: number;
  creating: boolean;
  /** Why the block was not made, e.g. the items are not adjacent. */
  error: string | null;
  onCreate: () => void;
  onClear: () => void;
}) {
  const { m, plural } = useI18n();
  const t = m.components.eventBlocks;

  return (
    <div className="w-max max-w-full rounded-card border bg-surface-raised px-3 py-2 text-text shadow-lg">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* The rows show the selection: the count is only for screen readers. */}
          <p role="status" className="sr-only">
            {plural(t.selected, count)}
          </p>
          <Button
            type="button"
            size="sm"
            onClick={onCreate}
            aria-disabled={creating || undefined}
            aria-describedby={error ? "items-selection-error" : undefined}
          >
            {creating && <LoaderCircleIcon aria-hidden className="animate-spin" />}
            {t.create}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onClear}
            aria-label={t.clearSelection}
            title={t.clearSelection}
          >
            <XIcon />
          </Button>
        </div>
        {error && (
          <p id="items-selection-error" role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function SaveStatusMessage({
  status,
  canSave,
  onRetry,
}: {
  status: SaveStatus;
  canSave: boolean;
  onRetry: () => void;
}) {
  const { m } = useI18n();

  if (status.kind === "error") {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-x-2 text-sm text-danger">
        {status.message}
        <Button type="button" variant="link" className="h-auto p-0" onClick={onRetry}>
          {m.events.items.tryAgain}
        </Button>
      </div>
    );
  }

  const [icon, message] = !canSave
    ? [null, m.events.items.needTitles]
    : status.kind === "pending" || status.kind === "saving"
      ? [
          <LoaderCircleIcon key="icon" aria-hidden className="size-4 animate-spin" />,
          m.common.actions.saving,
        ]
      : status.kind === "saved"
        ? [<CheckIcon key="icon" aria-hidden className="size-4" />, m.events.items.allSaved]
        : [null, m.events.items.autoSave];

  return (
    <p role="status" className="flex items-center gap-1.5 text-xs text-muted [&_svg]:size-3.5">
      {icon}
      {message}
    </p>
  );
}

type ItemInput = ReturnType<typeof toInput>;

/**
 * The items without the volunteer, the theme, the planned time and the block
 * of an item that had the same value in the base of the save. Such an item keeps the
 * value that it has on the server, e.g. a volunteer that another user chose,
 * or a theme that the projection controller set in the meantime: these
 * changes keep the setlist, so the check of the base does not see them (see
 * `set_event_items()`).
 */
function withoutSavedAssignments(items: ItemInput[], savedItems: ItemInput[]) {
  const saved = new Map(savedItems.map((item) => [item.key, item]));
  // JSON leaves out a key with `undefined`.
  return items.map((item) => {
    const before = saved.get(item.key);
    if (!before) return item;
    return {
      ...item,
      ...(before.volunteerId === item.volunteerId && { volunteerId: undefined }),
      ...(before.themeId === item.themeId && { themeId: undefined }),
      ...(before.durationSeconds === item.durationSeconds && { durationSeconds: undefined }),
      ...(before.blockKey === item.blockKey && { blockKey: undefined }),
    };
  });
}

/** The rows of the items of an event, for the form. */
export function toItemRows(items: SetlistItemDTO[]): ItemRow[] {
  return items.map((item): ItemRow =>
    item.kind === "song"
      ? {
          kind: "song",
          key: item.key,
          songId: item.song.id,
          arrangementId: item.arrangement.id,
          musicalKey: item.musicalKey,
          volunteerId: item.volunteerId,
          themeId: item.themeId,
          durationSeconds: item.durationSeconds,
          blockKey: item.blockKey,
        }
      : {
          kind: "text",
          key: item.key,
          title: item.title,
          notes: item.notes ?? "",
          scripture: item.scripture,
          scriptureTranslation: item.scriptureTranslation,
          imageSetId: item.imageSetId,
          announcementId: item.announcementId,
          textSlide: item.textSlide,
          description: item.description ?? "",
          highlight: item.highlight ?? "",
          volunteerId: item.volunteerId,
          themeId: item.themeId,
          durationSeconds: item.durationSeconds,
          blockKey: item.blockKey,
        },
  );
}

/**
 * The input of `setEventItems` for a row. A volunteer who left the event
 * becomes none, and so does a deleted theme: then the event theme. No planned
 * time: null.
 */
function toInput(row: ItemRow, volunteerIds: Set<string>, themeIds: Set<string>) {
  const volunteerId = row.volunteerId && volunteerIds.has(row.volunteerId) ? row.volunteerId : null;
  const themeId = row.themeId && themeIds.has(row.themeId) ? row.themeId : null;
  const durationSeconds = row.durationSeconds ?? null;
  const blockKey = row.blockKey ?? null;
  return isTextRow(row)
    ? {
        kind: "text",
        key: row.key,
        title: row.title,
        notes: row.notes,
        scripture: row.scripture,
        scriptureTranslation: scriptureTranslationInput(row),
        // JSON leaves out a key with `undefined`: a text item without images keeps its form.
        imageSetId: row.imageSetId ?? undefined,
        announcementId: row.announcementId ?? undefined,
        // Only a text slide has these keys, so another text item keeps its form.
        textSlide: row.textSlide ? true : undefined,
        description: row.textSlide ? (row.description ?? "") : undefined,
        highlight: row.textSlide ? (row.highlight ?? "") : undefined,
        volunteerId,
        themeId,
        durationSeconds,
        blockKey,
      }
    : {
        kind: "song",
        key: row.key,
        arrangementId: row.arrangementId,
        musicalKey: row.musicalKey ?? null,
        volunteerId,
        themeId,
        durationSeconds,
        blockKey,
      };
}
