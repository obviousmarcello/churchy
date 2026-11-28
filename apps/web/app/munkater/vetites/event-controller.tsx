"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useModule } from "@/components/music/app-config";
import {
  useChangeNotices,
  useEventChanges,
  type EventChange,
} from "@/components/music/event-changes";
import { invalidatePageCache } from "@/components/music/page-cache";
import { useI18n } from "@/i18n/music/client";
import { createStoredString } from "@/lib/music/browser";
import { itemChanges, mergeOrder } from "@/lib/music/event-items-merge";
import { changedPages } from "@/lib/music/page-keys";
import {
  withQuickItems,
  type QuickItem,
  type QuickItemInput,
} from "@/lib/music/projection/quick-items";
import type {
  EventProjectionDTO,
  ProjectionConnectionDTO,
} from "@/server/music/models/projections";
import type { EventImageDTO } from "@/lib/music/projection/images";
import type { ProjectionSource } from "@/lib/music/projection/slides";
import {
  addQuickItemAction as addQuickItem,
  eventLiveTopicAction as eventLiveTopic,
  eventProjectionAction,
  eventProjectionBlocksAction,
  removeQuickItemAction as removeQuickItem,
  projectionControllerClosedAction,
  projectionControllerOpenAction,
  reorderEventItemsAction,
  setEventThemeAction,
  setItemThemeAction,
  startEventBlockAction,
  type ItemsEditorPart,
} from "./actions-client";
import { ALL_EDITOR_PARTS, ItemsEditorPanel, type EditorReload } from "./items-editor";
import {
  ProjectionController,
  type ReorderOutcome,
  type ThemeChangeOutcome,
  type ThemeTarget,
} from "./controller";

// The items of the event follow the changes of the other users at once: the
// database sends a message after each change (see `useEventChanges`), and the
// controller loads the items again. The screens keep their slide: a removed
// item stays here, faded, and the screens can still show it until the page
// loads again. A changed song gets its new slides, and the live slide stays
// until the next step. A toast tells what changed, and who changed it.
// An event admin can reorder the items here and add the items of the quick
// add to the event. A reorder that meets a change of another user merges
// with it (see `mergeOrder`) and saves again. The edit mode gives an event
// admin the items editor of the event page (see `items-editor.tsx`): its
// saves come back here as changes, as from another device.
// The controller tells the server that it is open (`HEARTBEAT_MS`): while it
// is, the event cannot be deleted, and no change can take it from its user.
const HEARTBEAT_MS = 30_000;

/** The tries of a reorder that meets changes of other users. */
const REORDER_TRIES = 3;

/** The wait for more changes before the open editor loads again, e.g. for the images of a PDF, which arrive one by one. */
const EDITOR_RELOAD_DELAY_MS = 1000;

/** The parts of the data of the editor that a change of the event can make old. */
const EDITOR_PARTS: Record<EventChange["kind"], readonly ItemsEditorPart[]> = {
  items: ["event", "images", "announcements"],
  // The name, the countdown or the start of a block.
  blocks: ["event"],
  details: ["event"],
  themes: ["themes"],
  // A volunteer who leaves the event leaves their items too.
  volunteers: ["volunteers", "event"],
  images: ["images"],
  announcements: ["announcements"],
  songs: ["catalog", "event"],
  live: [],
  deleted: ["event"],
  load: ALL_EDITOR_PARTS,
};

/** The controller of an event's projection, with the data from the server. */
export function EventProjectionController({
  projection: initial,
  connection,
  liveTopic: initialLiveTopic = null,
  canEditItems,
}: {
  projection: EventProjectionDTO;
  connection: ProjectionConnectionDTO;
  /** The Realtime channel of the event's running live session at the load. */
  liveTopic?: string | null;
  /** An event admin: the drag of an item saves the new order in the event, the quick add adds to the event, and the edit mode edits the items. */
  canEditItems: boolean;
}) {
  const { m } = useI18n();
  const { eventId } = initial;
  const [projection, setProjection] = useState(initial);
  const projectionRef = useRef(projection);
  useLayoutEffect(() => {
    projectionRef.current = projection;
  });
  // The items that other users removed, after the item before them.
  const [removed, setRemoved] = useState<QuickItem[]>([]);
  // No access to the event anymore, e.g. after the end of a role: the controller keeps what it has.
  const [unavailable, setUnavailable] = useState(false);
  const [liveTopic, setLiveTopic] = useState(initialLiveTopic);
  const [addedKeys, addKey] = useAddedKeys(eventId);
  // The items that this controller removed: no faded item for them.
  const ownRemoves = useRef(new Set<string>());
  // Each change of the event loads the parts of the open editor that it can make old.
  const [editorReload, reloadEditor] = useEditorReload();
  const notify = useChangeNotices(eventId, connection.connection.userId);

  const { reload, reloadNow } = useReload(eventId, (next, authors) => {
    if (next === null) {
      setUnavailable(true);
      return;
    }
    const before = projectionRef.current;
    projectionRef.current = next;
    const nextKeys = new Set(next.items.map((item) => item.key));
    const gone = before.items.filter(
      (item) => !nextKeys.has(item.key) && !ownRemoves.current.has(item.key),
    );
    setRemoved((current) => [
      ...current.filter((item) => !nextKeys.has(item.source.key)),
      ...gone.map((source) => ({
        source,
        afterKey: before.items[before.items.indexOf(source) - 1]?.key ?? null,
      })),
    ]);
    setProjection(next);
    if (authors.length > 0) {
      void notify({
        authors,
        items: itemChanges(before.items, next.items),
        other: before.title === next.title ? [] : [m.components.eventChanges.detailsChanged],
      });
    }
  });

  function reloadBlocks() {
    void eventProjectionBlocksAction(eventId).then((blocks) => {
      if (blocks === undefined) return;
      if (blocks === null) {
        setUnavailable(true);
        return;
      }
      setProjection((current) => {
        const next = { ...current, schedule: { ...current.schedule, blocks } };
        projectionRef.current = next;
        return next;
      });
    });
  }

  const { offline } = useEventChanges(eventId, connection.connection, (changes) => {
    if (changes.some((change) => change.kind === "live" || change.kind === "load")) {
      void eventLiveTopic(eventId).then((topic) => topic !== undefined && setLiveTopic(topic));
    }
    const rest = changes.filter((change) => change.kind !== "live");
    if (rest.length === 0) return;
    reloadEditor(rest.flatMap((change) => EDITOR_PARTS[change.kind]));
    // Only the blocks changed, e.g. the start of a countdown: only the blocks load again.
    if (rest.every((change) => change.kind === "blocks")) reloadBlocks();
    else reload(changes);
  });

  useControllerHeartbeat(eventId);

  // The removed items stay after the item before them.
  const allItems = useMemo(
    () => withQuickItems(projection.items, removed),
    [projection.items, removed],
  );
  const removedKeys = useMemo(() => new Set(removed.map((item) => item.source.key)), [removed]);
  // The live session uses the same Realtime server as the projection. No leader while the module "sheet.live" is off.
  const liveOn = useModule("sheet.live");

  return (
    <ProjectionController
      title={projection.title}
      backHref={`/munkater/esemenyek/${projection.eventId}`}
      sources={allItems}
      channel={{ eventId: projection.eventId, connection }}
      liveSession={
        liveOn && liveTopic ? { topic: liveTopic, connection: connection.connection } : null
      }
      changed={unavailable}
      removedKeys={removedKeys}
      addToEvent={canEditItems ? addToEvent : null}
      addedKeys={addedKeys}
      removeFromEvent={canEditItems ? removeFromEvent : null}
      syncOffline={offline}
      reorder={canEditItems && projection.setlistId ? reorder : null}
      themes={projection.themes}
      changeTheme={changeTheme}
      onThemesChanged={() => {
        reload([]);
        reloadEditor(["themes"]);
      }}
      onImageSaved={(saved) => {
        setProjection((current) => ({
          ...current,
          items: current.items.map((item) => withImage(item, saved)),
        }));
        invalidatePageCache(changedPages.event(eventId));
      }}
      onImagesChanged={() => {
        reload([]);
        reloadEditor(["images", "event"]);
      }}
      schedule={projection.schedule}
      startBlock={startBlock}
      assignees={projection.assignees}
      itemsEditor={
        canEditItems
          ? ({ liveKey }) => (
              <ItemsEditorPanel
                eventId={eventId}
                liveKey={liveKey}
                reload={editorReload}
                onSongSaved={() => {
                  reload([]);
                  reloadEditor(["catalog", "event"]);
                }}
              />
            )
          : null
      }
    />
  );

  /** Shows the new theme at once, then saves it. */
  async function changeTheme(
    target: ThemeTarget,
    themeId: string | null,
  ): Promise<ThemeChangeOutcome> {
    setProjection((current) => ({
      ...current,
      themes:
        target === "event"
          ? { ...current.themes, eventThemeId: themeId }
          : {
              ...current.themes,
              itemThemeIds: { ...current.themes.itemThemeIds, [target.itemKey]: themeId },
            },
    }));
    invalidatePageCache(changedPages.event(eventId));
    return target === "event"
      ? setEventThemeAction(eventId, themeId)
      : setItemThemeAction(eventId, target.itemKey, themeId);
  }

  /** Starts the countdown of the block, and shows its start at once. The other devices load it after the message of the change. */
  async function startBlock(key: string, restart: boolean): Promise<ThemeChangeOutcome> {
    const result = await startEventBlockAction(eventId, key, restart);
    if (result.status === "error") return result;
    const { startedAt } = result;
    setProjection((current) => {
      const next = {
        ...current,
        schedule: {
          ...current.schedule,
          blocks: current.schedule.blocks.map((block) =>
            block.key === key ? { ...block, startedAt } : block,
          ),
        },
      };
      projectionRef.current = next;
      return next;
    });
    invalidatePageCache(changedPages.event(eventId));
    return { status: "success" };
  }

  async function addToEvent(
    afterKey: string | null,
    key: string,
    item: QuickItemInput,
  ): Promise<ThemeChangeOutcome> {
    invalidatePageCache(changedPages.event(eventId));
    const result = await addQuickItem(eventId, afterKey, key, item);
    if (result.status === "success") {
      addKey(key);
      await reloadNow();
    }
    return result;
  }

  async function removeFromEvent(key: string): Promise<ThemeChangeOutcome> {
    invalidatePageCache(changedPages.event(eventId));
    ownRemoves.current.add(key);
    const result = await removeQuickItem(eventId, key);
    if (result.status === "success") await reloadNow();
    else ownRemoves.current.delete(key);
    return result;
  }

  /** Saves the order. After a change of another user, merges with it and tries again. */
  async function reorder(keys: string[]): Promise<ReorderOutcome> {
    let base = projectionRef.current;
    let order = keys;
    for (let tries = 0; tries < REORDER_TRIES && base.setlistId; tries++) {
      invalidatePageCache(changedPages.event(eventId));
      const result = await reorderEventItemsAction(eventId, base.setlistId, order);
      if (result.status === "error") return result;
      if (result.status === "success") {
        const setlistId = result.setlistId;
        const saved = order;
        return {
          status: "success",
          apply: () =>
            setProjection((current) => {
              const items = new Map(current.items.map((item) => [item.key, item]));
              const plans = new Map(current.schedule.items.map((item) => [item.key, item]));
              const next = {
                ...current,
                setlistId,
                items: saved.flatMap((key) => items.get(key) ?? []),
                // The planned starts follow the new order.
                schedule: {
                  ...current.schedule,
                  items: saved.flatMap((key) => plans.get(key) ?? []),
                },
              };
              projectionRef.current = next;
              return next;
            }),
        };
      }
      const theirs = await reloadNow();
      if (!theirs) break;
      order = mergeOrder(
        base.items.map((item) => item.key),
        order,
        theirs.items.map((item) => item.key),
      );
      base = theirs;
    }
    return { status: "error", message: m.project.controller.reorderChanged };
  }
}

/**
 * Loads the items again, one load at a time: the changes during a load bring
 * one more load after it. `apply` gets the new items (null: no access
 * anymore) and the users of the changes. A load that fails changes nothing.
 * `reloadNow`: a load at once, e.g. after a change here, with its items.
 */
function useReload(
  eventId: string,
  apply: (next: EventProjectionDTO | null, authors: (string | null)[]) => void,
) {
  const applyRef = useRef(apply);
  useLayoutEffect(() => {
    applyRef.current = apply;
  });
  const state = useRef<{
    running: Promise<EventProjectionDTO | null> | null;
    again: boolean;
    authors: (string | null)[];
  }>({
    running: null,
    again: false,
    authors: [],
  });

  const reloadNow = useCallback((): Promise<EventProjectionDTO | null> => {
    const current = state.current;
    if (current.running) {
      current.again = true;
      return current.running;
    }
    async function run(): Promise<EventProjectionDTO | null> {
      let last: EventProjectionDTO | null = null;
      do {
        current.again = false;
        const next = await eventProjectionAction(eventId);
        if (next === undefined) return last;
        const users = current.authors;
        current.authors = [];
        applyRef.current(next, users);
        last = next;
      } while (current.again);
      return last;
    }
    current.running = run().finally(() => {
      current.running = null;
    });
    return current.running;
  }, [eventId]);

  const reload = useCallback(
    (changes: EventChange[]) => {
      state.current.authors.push(
        ...changes.filter((change) => change.kind !== "load").map((change) => change.author),
      );
      void reloadNow();
    },
    [reloadNow],
  );
  return { reload, reloadNow };
}

/**
 * The parts of the data of the open items editor that a change makes old (see `ItemsEditorPanel`):
 * the parts of the changes within `EDITOR_RELOAD_DELAY_MS` load together.
 */
function useEditorReload(): [EditorReload, (parts: readonly ItemsEditorPart[]) => void] {
  const [reload, setReload] = useState<EditorReload>({ token: 0, parts: [] });
  const state = useRef<{ parts: Set<ItemsEditorPart>; timer?: ReturnType<typeof setTimeout> }>({
    parts: new Set(),
  });
  useEffect(() => {
    const current = state.current;
    return () => clearTimeout(current.timer);
  }, []);
  const request = useCallback((parts: readonly ItemsEditorPart[]) => {
    if (parts.length === 0) return;
    const current = state.current;
    for (const part of parts) current.parts.add(part);
    clearTimeout(current.timer);
    current.timer = setTimeout(() => {
      const next = [...current.parts];
      current.parts.clear();
      setReload((before) => ({ token: before.token + 1, parts: next }));
    }, EDITOR_RELOAD_DELAY_MS);
  }, []);
  return [reload, request];
}

/**
 * Tells the server that this controller is open, until it closes (see
 * `touchProjectionController`). The close goes with `sendBeacon` (see
 * `controller-closed/route.ts`): the browser cancels a Server Action when the
 * tab closes, and after a link to another page, that page does not know the
 * action. A tab that comes back from the cache of the browser tells it again at once.
 */
function useControllerHeartbeat(eventId: string) {
  useEffect(() => {
    const id = crypto.randomUUID();
    // The beat on its way: it can arrive after the beacon of the close.
    let pendingBeat: Promise<unknown> | null = null;
    function beat() {
      const request = projectionControllerOpenAction(eventId, id);
      pendingBeat = request;
      const done = () => {
        if (pendingBeat === request) pendingBeat = null;
      };
      void request.then(done, done);
    }
    function close() {
      const form = new URLSearchParams({ eventId, controllerId: id });
      if (!navigator.sendBeacon?.("/project/controller-closed", form))
        void projectionControllerClosedAction(eventId, id);
    }
    function onShow(event: PageTransitionEvent) {
      if (event.persisted) beat();
    }
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", onShow);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", onShow);
      close();
      // A beat that arrives after the close opens the controller again: close it after the beat too.
      void pendingBeat?.then(close, close);
    };
  }, [eventId]);
}

// The keys of the items that the quick add of this tab added to the event: `sessionStorage`.
const addedKeyStores = new Map<string, ReturnType<typeof createStoredString>>();

function useAddedKeys(eventId: string): [ReadonlySet<string>, (key: string) => void] {
  const storageKey = `projection-added-items:${eventId}`;
  let store = addedKeyStores.get(storageKey);
  if (!store) {
    store = createStoredString(storageKey, "session");
    addedKeyStores.set(storageKey, store);
  }
  const value = store.useValue();
  const keys = useMemo(() => new Set<string>(parseKeys(value)), [value]);
  const { set } = store;
  return [keys, (key) => set(JSON.stringify([...keys, key]))];
}

function parseKeys(json: string | null | undefined): string[] {
  try {
    const value: unknown = JSON.parse(json ?? "[]");
    return Array.isArray(value)
      ? value.filter((key): key is string => typeof key === "string")
      : [];
  } catch {
    return [];
  }
}

/** The item with the saved image in place of the image with its id. */
function withImage(item: ProjectionSource, saved: EventImageDTO): ProjectionSource {
  const replace = (images: EventImageDTO[]) =>
    images.map((image) => (image.id === saved.id ? saved : image));
  if (item.kind === "images") return { ...item, images: replace(item.images) };
  if (item.kind === "announcements") {
    return {
      ...item,
      own: item.own.map((entry) =>
        entry.imageSetId ? { ...entry, images: replace(entry.images) } : entry,
      ),
    };
  }
  return item;
}
