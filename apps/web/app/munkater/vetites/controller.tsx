"use client";

import Link from "next/link";
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenIcon,
  CheckIcon,
  CircleAlertIcon,
  ClipboardPasteIcon,
  EraserIcon,
  GripVerticalIcon,
  ImagesIcon,
  ListMusicIcon,
  MegaphoneIcon,
  LoaderCircleIcon,
  MonitorIcon,
  MonitorOffIcon,
  MonitorXIcon,
  PencilIcon,
  PlusIcon,
  PresentationIcon,
  RadioIcon,
  SlidersHorizontalIcon,
  SquareIcon,
  TextIcon,
  TimerResetIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";

import { ModuleGate, useModule } from "@/components/music/app-config";
import { BlockCountdownBadge } from "@/components/music/block-countdown";
import { BlockHeader } from "@/components/music/block-header";
import { ScriptureTranslationSelect } from "@/components/music/scripture-translation-select";
import { Button, buttonVariants } from "@/components/music/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { NativeSelect } from "@/components/music/ui/native-select";
import { UserAvatar, type AvatarPerson } from "@/components/music/user-avatar";
import { useI18n } from "@/i18n/music/client";
import type { I18n } from "@/i18n/music/i18n";
import { createStoredString } from "@/lib/music/browser";
import { blockPlan, blockRuns } from "@/lib/music/event-blocks";
import { personName } from "@/lib/music/format";
import { projectionOverlayHref, projectionScreenHref } from "@/lib/music/next-path";
import { hasPendingSaves, savePendingChanges } from "@/lib/music/pending-saves";
import type { EventImageDTO } from "@/lib/music/projection/images";
import { STREAM_LINES, streamPartIndex, streamParts } from "@/lib/music/projection/overlay";
import {
  narrowestAspectRatio,
  newerProjectionState,
  nextSeq,
  parseOverlayInfo,
  parseProjectionCommand,
  parseProjectionState,
  parseScreenInfo,
  PROJECTION_CLOSE_EVENT,
  PROJECTION_IMAGES_EVENT,
  PROJECTION_KEYS,
  PROJECTION_STATE_EVENT,
  PROJECTION_SYNC_EVENT,
  PROJECTION_THEMES_EVENT,
  SCREEN_TIMEOUT_MS,
  type OverlayInfo,
  type ProjectionCommand,
  type ProjectionMode,
  type ProjectionState,
  type ScreenInfo,
} from "@/lib/music/projection/protocol";
import {
  isQuickItemKey,
  parseQuickItems,
  placeQuickItems,
  QUICK_ITEMS_START,
  removeQuickItem,
  withQuickItems,
  type QuickItem,
  type QuickItemInput,
} from "@/lib/music/projection/quick-items";
import {
  buildProjectionItems,
  DEFAULT_ASPECT_RATIO,
  findTile,
  isBibleItemKey,
  ROLL_TEXT_SIZE_DEFAULT,
  ROLL_TEXT_SIZES,
  scriptureRollSlide,
  scriptureSlide,
  tileOfAnchor,
  tileSequence,
  type ProjectionItem,
  type ProjectionSlide,
  type ProjectionSource,
  type ProjectionTile,
} from "@/lib/music/projection/slides";
import {
  resolveLook,
  resolveTheme,
  type ProjectionLook,
  type ProjectionThemeChoice,
  type ProjectionThemeDTO,
} from "@/lib/music/projection/themes";
import { MAX_PASSAGE_VERSES } from "@/lib/music/scripture/passage";
import type { ScriptureTranslation } from "@/lib/music/scripture/translations";
import { toastError } from "@/lib/music/toast";
import { cn } from "@/lib/music/utils";
import type { EventScheduleDTO } from "@/server/music/models/projections";
import { useBible } from "./bible";
import { BiblePanel, BiblePanelButton, useBiblePanelLayout } from "./bible-panel";
import { useProjectionChannel, type ProjectionChannelConfig } from "./channel";
import { DownloadSlidesButton } from "./download-slides";
import { MixerSyncButton } from "./mixer-sync-button";
import { ImageAdjustDialog } from "./image-adjust-dialog";
import { PasteScriptureDialog } from "./paste-scripture-dialog";
import { projectionFontVariables } from "./projection-fonts";
import { useLeaderState, type ProjectionLiveSession } from "./leader";
import { QuickAddBox, useQuickAddUpload, type QuickAddEvent } from "./quick-add";
import { useAnnounceRunning } from "./running";
import { ScreenPicker } from "./screen-picker";
import { ScheduleStatus } from "./schedule-status";
import { useScripturePassages, type MoreVerses, type ScriptureReading } from "./scripture";
import { focusDragHandle, useSetlistDrag } from "./setlist-drag";
import {
  SetlistFieldsMenu,
  SetlistResizeHandle,
  songDetails,
  useSetlistFields,
  useSetlistLayout,
} from "./setlist-layout";
import { SlideView } from "./slide-view";

// The controller of a projection: the setlist, the tiles of the selected
// item, and what the screens show now and next. A click on a tile shows it on
// the screens at once. The keys of a presenter remote work too: → ↓ Space
// PageDown for the next tile, ← ↑ PageUp for the previous one, across the
// items; B for black and C for clear. After the last tile the screens clear.
// For an event, "Stream: 2 lines" splits each lyrics slide for the stream
// overlay (see `streamParts`) while an overlay is open: "Next" goes through
// its parts first, and the screens keep the whole slide. The state carries
// the setting, so all the controllers of the event use it.
// The same commands come from the screens: a click, a swipe or a key on them.
// The quick add box puts a song or a scripture reading after the live item, on
// this controller only (see `quick-items.ts`), or for an event admin in the
// event. It has the focus when the controller opens; while it is empty, the
// keys for the slides still work.
// A drag reorders the setlist (see `setlist-drag.ts`): the quick items on this
// controller, the other items in the event or the rehearsal setlist. A wide
// setlist can be resized, and shows the chosen details of the songs under
// their titles, e.g. the songbook (see `setlist-layout.tsx`). The
// adjustments of the images of an image item (see `images.ts`) can change here.
// An item that another user removed from the event stays here, faded, until
// the page loads again: the screens can show it now.
// For an event admin, "Edit items" in the setlist header starts the edit
// mode: the items editor of the event page in place of the setlist (see
// `items-editor.tsx`), with all the fields of each item. The screens and
// the keys of the slides still work, but not on a control of the editor.
// "Done" shows the setlist again.
// The Bible panel on the right shows any passage at once, without an item in
// the setlist (see `bible.ts`).

const BLANK: ProjectionSlide = { kind: "blank" };

/** `part`: the part of the lyrics on the stream overlay (see `streamParts`), from 0. -1: the whole slide. */
type Entry = { item: ProjectionItem; tile: ProjectionTile; part?: number };

export type ProjectionControllerProps = {
  title: string;
  backHref: string;
  sources: ProjectionSource[];
  channel: ProjectionChannelConfig;
  /** The running live session of the event, to show the place of its leader. */
  liveSession: ProjectionLiveSession | null;
  /** The setlist changed after the controller loaded it, and it does not follow the change. */
  changed: boolean;
  /** The keys of the items that another user removed: they stay here, faded, but are not in the setlist. */
  removedKeys?: ReadonlySet<string>;
  /**
   * Adds the item of the quick add to the event after the item of `afterKey`
   * (`QUICK_ITEMS_START`: at the start, null: at the end), with `key`. Null or left out: the quick items are on
   * this controller only.
   */
  addToEvent?:
    | ((afterKey: string | null, key: string, item: QuickItemInput) => Promise<ThemeChangeOutcome>)
    | null;
  /** The keys of the items that the quick add of this controller added to the event: they have a remove button. */
  addedKeys?: ReadonlySet<string>;
  /** Removes an item of `addedKeys` from the event. */
  removeFromEvent?: ((key: string) => Promise<ThemeChangeOutcome>) | null;
  /** The changes of the event from other users do not come now: only from time to time. */
  syncOffline?: boolean;
  /**
   * Saves a new order of `sources`, e.g. after a drag. Null when the user
   * cannot change the setlist: then only the quick items move.
   */
  reorder: ((keys: string[]) => Promise<ReorderOutcome>) | null;
  /** The projection themes and which theme each item uses. */
  themes: ProjectionThemeChoice;
  /**
   * Saves the theme of the event or of an item (null: the theme of the level
   * above). Null when the themes cannot change here, e.g. in a rehearsal.
   */
  changeTheme:
    ((target: ThemeTarget, themeId: string | null) => Promise<ThemeChangeOutcome>) | null;
  /** Another controller changed a theme: load the themes again. */
  onThemesChanged?: () => void;
  /** An image of an image item was saved here. Null or left out: the images cannot change here, e.g. in a rehearsal. */
  onImageSaved?: ((image: EventImageDTO) => void) | null;
  /** Another controller changed an image: load the images again. */
  onImagesChanged?: () => void;
  /** The run sheet of the event: the header compares the live item with its planned time. Null or left out: none, e.g. in a rehearsal. */
  schedule?: EventScheduleDTO | null;
  /**
   * The items editor of the event in the setlist: the edit mode. `liveKey`:
   * the key of the item on the screens now. Null or left out: no edit mode,
   * e.g. for a user who is not an event admin.
   */
  itemsEditor?: ((props: { liveKey: string | null }) => React.ReactNode) | null;
  /** The volunteer of each item that has one, by the key of the item: the setlist shows them. */
  assignees?: Readonly<Record<string, AvatarPerson>>;
  /**
   * Starts the countdown "remaining" of a block of `schedule` (see
   * `startEventBlock`): when an item of it goes live, or with `restart` by
   * "Restart countdown". Null or left out: no start, e.g. in a rehearsal.
   */
  startBlock?: ((key: string, restart: boolean) => Promise<ThemeChangeOutcome>) | null;
};

/** The theme of the event, or of one of its items. */
export type ThemeTarget = "event" | { itemKey: string };

export type ThemeChangeOutcome = { status: "success" } | { status: "error"; message: string };

/** `apply`: shows the new sources, together with the changes of the controller. */
export type ReorderOutcome =
  { status: "success"; apply: () => void } | { status: "error"; message: string };

const NO_KEYS: ReadonlySet<string> = new Set();
const NO_ASSIGNEES: Readonly<Record<string, AvatarPerson>> = {};

export function ProjectionController({
  title,
  backHref,
  sources,
  channel,
  liveSession,
  changed,
  removedKeys = NO_KEYS,
  addToEvent = null,
  addedKeys = NO_KEYS,
  removeFromEvent = null,
  syncOffline = false,
  reorder,
  themes,
  changeTheme,
  onThemesChanged,
  onImageSaved = null,
  onImagesChanged,
  schedule = null,
  itemsEditor = null,
  assignees = NO_ASSIGNEES,
  startBlock = null,
}: ProjectionControllerProps) {
  const i18n = useI18n();
  const { m, plural, format } = i18n;
  const t = m.project.controller;
  const commands = useRef<(command: ProjectionCommand) => void>(() => {});
  const control = useProjection(
    channel,
    (command) => commands.current(command),
    () => onThemesChanged?.(),
    () => onImagesChanged?.(),
  );
  // For the menu item back to this controller on the other pages.
  useAnnounceRunning(channel.eventId, { title, screens: control.screens.length > 0 });
  const [ratioSetting, setRatioSetting] = useAspectRatioSetting();
  const autoRatio = narrowestAspectRatio(control.screens) ?? DEFAULT_ASPECT_RATIO;
  const aspectRatio = ratioSetting === "auto" ? autoRatio : RATIOS[ratioSetting];
  // Only for an event: the overlay is on another device, which needs the Realtime channel.
  const overlayEventId = channel.connection ? channel.eventId : null;
  const [streamPreference, setStreamPreference] = useStreamLinesSetting();
  // The lines of a part of the lyrics: a setting of the state, so all the
  // controllers split in the same way. Before the first state, the setting of this device.
  const streamLines = control.state
    ? (control.state.streamLines ?? null)
    : streamPreference
      ? STREAM_LINES
      : null;
  const [rollPreference, setRollPreference] = useScriptureRollSetting();
  // The roll view of the verses and its text size: a setting of the state
  // too, so all the controllers show the verses in the same way. Null: the page view.
  const scriptureRoll = control.state
    ? (control.state.scriptureRoll ?? null)
    : rollPreference.on
      ? rollPreference.size
      : null;
  const rollId = useId();
  /** The parts of the lyrics of a tile on the stream overlay (see `streamParts`), while one is open. Null: one step. */
  const partsOf = (tile: ProjectionTile) =>
    streamLines && overlayEventId && control.overlayCount > 0
      ? streamParts(tile.slide, streamLines)
      : null;
  const [quickItems, setQuickItems] = useQuickItems(channel.eventId);
  const allSources = useMemo(() => withQuickItems(sources, quickItems), [sources, quickItems]);
  // The translations that the user selected here, by item key. Not saved: the event keeps its own.
  const [translations, setTranslations] = useState<ReadonlyMap<string, string>>(new Map());
  const scripture = useScripturePassages(allSources, translations);
  const builtItems = useMemo(
    () =>
      buildProjectionItems(allSources, aspectRatio, scripture.passages, (source) =>
        resolveLook(
          themes.themes,
          itemThemeId(themes, source),
          themes.eventThemeId,
          arrangementThemeId(source),
        ),
      ),
    [allSources, aspectRatio, scripture.passages, themes],
  );
  // The look of the event, e.g. for the end of the setlist.
  const eventLook = resolveLook(themes.themes, null, themes.eventThemeId);
  /** The "none" option of the theme of an item: the theme of its arrangement, else of the event. */
  const inheritedThemeLabel = (source: ProjectionSource | undefined) => {
    const arrangementTheme = themes.themes.find((theme) => theme.id === arrangementThemeId(source));
    return arrangementTheme
      ? format(m.project.themes.useArrangementTheme, { name: arrangementTheme.name })
      : format(m.project.themes.useEventTheme, {
          name: resolveTheme(themes.themes, null, themes.eventThemeId)?.name ?? "",
        });
  };
  // The order during a drag and while it saves.
  const [order, setOrder] = useState<string[] | null>(null);
  // The item that moved, while the new order saves. Its handle shows the progress: no notice that moves the list.
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const savingOrder = savingKey !== null;
  const items = useMemo(() => inOrder(builtItems, order), [builtItems, order]);
  const setlistSequence = useMemo(() => tileSequence(items), [items]);
  const leaderState = useLeaderState(liveSession);
  const leader = leaderState?.position ?? null;

  const { state } = control;
  const position = state?.position ?? null;
  const positionKey = position && "itemKey" in position ? position.itemKey : null;
  const biblePanel = useBiblePanelLayout();
  const bible = useBible(i18n.locale, eventLook, positionKey);
  // The parts of the child modules of "projection" (the Modules tab of Configuration).
  const biblePanelOn = useModule("projection.bible-panel");
  const countdownOn = useModule("projection.countdown");
  const themesOn = useModule("projection.themes");
  const overlayOn = useModule("projection.overlay");
  // A verse of the Bible panel is not in the setlist: its book is an item of its own.
  const liveItem = positionKey
    ? (items.find((item) => item.key === positionKey) ??
      bible.items.find((item) => item.key === positionKey) ??
      null)
    : null;
  const bibleLive = liveItem !== null && isBibleItemKey(liveItem.key);
  // "Next" and "Previous" go through the verses of a book of the Bible panel, not into the setlist.
  const sequence = useMemo(
    () => (bibleLive ? tileSequence([liveItem]) : setlistSequence),
    [bibleLive, liveItem, setlistSequence],
  );
  const liveTile =
    liveItem && position && "tileId" in position ? findTile(liveItem, position.tileId) : null;
  // The live tile, or the verses that are on the screens together (see `showVerses`).
  const liveTiles =
    liveItem && liveTile ? liveVerseTiles(liveItem, liveTile, state?.slide ?? BLANK) : [];
  const atEnd = position !== null && "end" in position;
  // Another controller can show an item or a tile that this one does not have,
  // e.g. its quick item, or a verse after its "Load more" or in another
  // translation. Then only a click on a tile goes on: not the first tile.
  const unknownLive = position !== null && "itemKey" in position && liveTile === null;
  const liveIndex = atEnd
    ? sequence.length
    : liveTile
      ? sequence.findIndex((entry) => entry.item === liveItem && entry.tile === liveTile)
      : -1;
  // The part of the lyrics on the stream overlay. -1: the overlay shows the
  // whole slide, e.g. from a controller without the parts; "Next" goes to the first part.
  const liveParts = liveTile ? partsOf(liveTile) : null;
  const livePart =
    liveParts && state?.stream && position && "itemKey" in position
      ? streamPartIndex(liveParts, state.stream, position.streamPart)
      : -1;
  const next: Entry | "end" | null =
    liveItem && liveTile && liveParts && livePart + 1 < liveParts.length
      ? { item: liveItem, tile: liveTile, part: livePart + 1 }
      : sequence.length === 0 || atEnd
        ? null
        : liveIndex + 1 < sequence.length
          ? (sequence[liveIndex + 1] ?? null)
          : // After the last verse of a book of the Bible panel: nothing.
            bibleLive
            ? null
            : "end";

  // The selected item follows the screens: to another item when the live tile goes there. Not to a book of the Bible panel.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [followedKey, setFollowedKey] = useState<string | null>(null);
  const liveKey = liveItem?.key ?? null;
  if (liveKey !== followedKey) {
    setFollowedKey(liveKey);
    if (liveKey && !bibleLive) setSelectedKey(liveKey);
  }

  // The blocks of the items (see `@/lib/event-blocks`): the block of the live
  // item shows its countdown in the header, and starts it when the live item
  // goes into it.
  const blocksByKey = useMemo(
    () => new Map((schedule?.blocks ?? []).map((block) => [block.key, block])),
    [schedule],
  );
  const blockKeyOf = useMemo(
    () => new Map(schedule?.items.map((item) => [item.key, item.blockKey])),
    [schedule],
  );
  const plannedItems = useMemo(() => schedule?.items ?? [], [schedule]);
  const liveBlock = liveKey ? blocksByKey.get(blockKeyOf.get(liveKey) ?? "") : undefined;
  const liveStartKey = liveBlock?.countdown === "remaining" ? liveBlock.key : null;
  const startBlockRef = useRef(startBlock);
  useLayoutEffect(() => {
    startBlockRef.current = startBlock;
  });
  useEffect(() => {
    // The server keeps a running start: each open controller can ask.
    if (liveStartKey && countdownOn) void startBlockRef.current?.(liveStartKey, false);
  }, [liveStartKey, countdownOn]);

  // A failed restart: an alert with "Try again" in the header of the block, until a restart succeeds.
  const [restartError, setRestartError] = useState<{ key: string; message: string } | null>(null);
  const [restartingKey, setRestartingKey] = useState<string | null>(null);
  async function restartBlock(key: string) {
    setRestartingKey(key);
    const result = await startBlock?.(key, true);
    setRestartingKey(null);
    setRestartError(result?.status === "error" ? { key, message: result.message } : null);
  }

  // The Bible panel follows the live verse to its chapter, e.g. after "Next".
  const liveBibleVerse = bibleLive && liveTile?.verse ? liveTile.verse : null;
  const followedChapter = liveBibleVerse ? `${liveItem?.key} ${liveBibleVerse.chapter}` : null;
  const { follow: followBibleVerse } = bible;
  useEffect(() => {
    if (!followedChapter) return;
    const [key = "", chapter] = followedChapter.split(" ");
    followBibleVerse(key, Number(chapter));
  }, [followedChapter, followBibleVerse]);
  const selected = items.find((item) => item.key === selectedKey) ?? items[0] ?? null;

  /**
   * `slide`: e.g. more verses together, with `entry` the last of them, and
   * `tiles` their tiles. With the roll view (`roll`, its text size), verses
   * have the verses around them (see `scriptureRollSlide`).
   */
  function show(
    entry: Entry,
    mode: ProjectionMode = "show",
    slide: ProjectionSlide = entry.tile.slide,
    tiles: ProjectionTile[] = [entry.tile],
    roll = scriptureRoll,
  ) {
    // The sequence of the entry, not of the live item: e.g. a click on the setlist while a verse of the Bible panel is live.
    const entrySequence = !isBibleItemKey(entry.item.key)
      ? setlistSequence
      : entry.item === liveItem
        ? sequence
        : tileSequence([entry.item]);
    const index = entrySequence.findIndex(
      (candidate) => candidate.item === entry.item && candidate.tile === entry.tile,
    );
    const following = index >= 0 ? entrySequence[index + 1] : undefined;
    const parts = partsOf(entry.tile);
    // -1: the whole slide on the overlay, e.g. after a change of the theme.
    const part =
      parts && (entry.part ?? 0) >= 0 ? Math.min(entry.part ?? 0, parts.length - 1) : null;
    publish(
      {
        mode,
        slide: (roll !== null && scriptureRollSlide(entry.item, tiles, roll)) || slide,
        position: {
          itemKey: entry.item.key,
          tileId: entry.tile.id,
          ...(part !== null && { streamPart: part }),
        },
        look: entry.item.look,
        ...(following ? nextImages(entry.item.look, following) : NO_PRELOAD),
        ...(parts && part !== null && { stream: parts[part] }),
      },
      streamLines,
      roll,
    );
  }

  /** A new state, with the settings of the parts of the lyrics (see `streamLines`) and of the roll view. */
  function publish(
    update: Omit<ProjectionState, "seq" | "streamLines" | "scriptureRoll">,
    lines = streamLines,
    roll = scriptureRoll,
  ) {
    control.publish({
      ...update,
      ...(lines && { streamLines: lines }),
      ...(roll !== null && { scriptureRoll: roll }),
    });
  }

  function goNext() {
    if (unknownLive) return;
    if (next === "end") {
      publish({
        mode: "show",
        slide: BLANK,
        position: { end: true },
        look: liveItem?.look ?? eventLook,
        ...NO_PRELOAD,
      });
    } else if (next) show(next);
  }

  function goPrevious() {
    // The part of the lyrics before it on the stream overlay.
    if (liveItem && liveTile && livePart > 0)
      return show({ item: liveItem, tile: liveTile, part: livePart - 1 });
    // Before the first of the verses on the screens.
    const first = liveTiles[0];
    const index = first
      ? sequence.findIndex((entry) => entry.item === liveItem && entry.tile === first)
      : liveIndex;
    if (index <= 0) return;
    // At the last part of the lyrics on the stream overlay.
    const previous = sequence[index - 1]!;
    show({ ...previous, part: (partsOf(previous.tile)?.length ?? 1) - 1 });
  }

  /**
   * The tiles of the item together on the screens, in their order: more
   * verses of a scripture reading, or one tile. The position is the last
   * tile, so "Next" goes on after it. `part`: the part of the lyrics on the
   * stream overlay. `roll`: the roll view (see `show`).
   */
  function showVerses(
    item: ProjectionItem,
    tiles: ProjectionTile[],
    mode: ProjectionMode = "show",
    part = 0,
    roll = scriptureRoll,
  ) {
    const ordered = item.tiles.filter((tile) => tiles.includes(tile));
    const last = ordered.at(-1);
    if (!last) return;
    const verses = ordered.flatMap((tile) => (tile.verse ? [tile.verse] : []));
    const slide =
      ordered.length > 1 && item.scriptureFormat
        ? scriptureSlide(item.scriptureFormat, verses)
        : last.slide;
    show({ item, tile: last, part }, mode, slide, ordered, roll);
  }

  // The verse that a Shift-click selects from: the last verse of a click without Shift.
  const [verseAnchor, setVerseAnchor] = useState<{ itemKey: string; tileId: string } | null>(null);

  /**
   * A click on a tile shows it. On a verse, Shift selects the verses from the
   * last clicked verse, and Ctrl or ⌘ adds the verse or removes it: the
   * screens show the selected verses together.
   */
  function clickTile(item: ProjectionItem, tile: ProjectionTile, { range, toggle }: TileClick) {
    const live = item === liveItem ? liveTiles.filter((candidate) => candidate.verse) : [];
    if (tile.verse && toggle) {
      setVerseAnchor({ itemKey: item.key, tileId: tile.id });
      const selection = live.includes(tile)
        ? live.filter((candidate) => candidate !== tile)
        : [...live, tile];
      // At least one verse stays on the screens.
      if (selection.length > 0) showVerses(item, selection);
      return;
    }
    if (tile.verse && range) {
      const anchor =
        (verseAnchor?.itemKey === item.key && findTile(item, verseAnchor.tileId)) ||
        live[0] ||
        tile;
      const [from, to] = [item.tiles.indexOf(anchor), item.tiles.indexOf(tile)].sort(
        (a, b) => a - b,
      );
      showVerses(
        item,
        item.tiles.slice(from, to! + 1).filter((candidate) => candidate.verse),
      );
      return;
    }
    setVerseAnchor({ itemKey: item.key, tileId: tile.id });
    show({ item, tile });
  }

  function toggle(mode: Exclude<ProjectionMode, "show">) {
    const current = control.state;
    publish({
      mode: current?.mode === mode ? "show" : mode,
      slide: current?.slide ?? BLANK,
      position: current?.position ?? null,
      look: current?.look ?? eventLook,
      preload: current?.preload ?? null,
      preloadImage: current?.preloadImage ?? null,
      ...(current?.stream && { stream: current.stream }),
    });
  }

  /**
   * Turns the parts of the lyrics on or off, on this device and for all the
   * controllers. The overlay shows the whole live slide: "Next" goes to its
   * first part.
   */
  function changeStreamLines(on: boolean) {
    setStreamPreference(on);
    const current = control.state;
    if (!current) return;
    const { mode, slide, position, look, preload, preloadImage } = current;
    const tile =
      position && "itemKey" in position
        ? { itemKey: position.itemKey, tileId: position.tileId }
        : position;
    publish({ mode, slide, position: tile, look, preload, preloadImage }, on ? STREAM_LINES : null);
  }

  /**
   * Turns the roll view of the verses on or off, or changes its text size
   * (null: off), on this device and for all the controllers. The live verses
   * go to the screens again in the new view.
   */
  function changeScriptureRoll(roll: number | null) {
    setRollPreference(roll === null ? { ...rollPreference, on: false } : { on: true, size: roll });
    const current = control.state;
    if (!current) return;
    if (liveItem && liveTile?.verse)
      return showVerses(liveItem, liveTiles, current.mode, livePart, roll);
    const { mode, slide, position, look, preload, preloadImage, stream } = current;
    // A roll that this controller cannot make again, e.g. of a quick item: the page view, or the new text size.
    const next =
      slide.kind === "scripture" && slide.roll
        ? { ...slide, roll: roll === null ? undefined : { ...slide.roll, textSize: roll } }
        : slide;
    publish(
      { mode, slide: next, position, look, preload, preloadImage, ...(stream && { stream }) },
      streamLines,
      roll,
    );
  }

  // After a change of a theme here, the screens get the live slide in its new
  // look, and its new split. Only this controller: the others can have the
  // themes from before for a moment. `republishAfter`: the themes to wait
  // for a change of, e.g. a render without new themes does not republish.
  const republishAfter = useRef<ProjectionThemeChoice | null>(null);
  const themesRef = useRef(themes);
  useEffect(() => {
    themesRef.current = themes;
    if (!republishAfter.current || republishAfter.current === themes) return;
    republishAfter.current = null;
    if (liveItem && liveTile)
      showVerses(liveItem, liveTiles, control.state?.mode ?? "show", livePart);
  });

  async function applyTheme(target: ThemeTarget, themeId: string | null) {
    if (!changeTheme) return;
    republishAfter.current = themesRef.current;
    const result = await changeTheme(target, themeId).catch(() => ({
      status: "error" as const,
      message: m.project.themes.saveFailed,
    }));
    if (result.status === "success") {
      control.notifyThemes();
      return;
    }
    toastError(result.message);
    // The themes load again: then the screens get the saved look, not the
    // look that did not save.
    republishAfter.current = themesRef.current;
    onThemesChanged?.();
  }

  // The scripture reading in the dialog for its pasted text (see `paste-scripture-dialog.tsx`).
  const [pasting, setPasting] = useState<{
    title: string;
    translation: ScriptureTranslation;
  } | null>(null);

  // The image of an image item in the dialog of its adjustments, with the look of its item.
  const [adjusting, setAdjusting] = useState<{
    image: EventImageDTO;
    look: ProjectionLook;
    qr?: Extract<ProjectionSlide, { kind: "image" }>["qr"];
  } | null>(null);
  // After a save here, the screens get the live image with its new
  // adjustments, when the new gallery is here.
  const savedImage = useRef<EventImageDTO | null>(null);
  useEffect(() => {
    const saved = savedImage.current;
    if (!saved) return;
    // An image of an image item, or a page of the attachment of an announcement.
    if (!liveItem || liveTile?.slide.kind !== "image" || liveTile.slide.url !== saved.url) {
      savedImage.current = null;
      return;
    }
    const slide = liveTile.slide;
    if (JSON.stringify(slide.adjust) !== JSON.stringify(saved.adjust)) return;
    savedImage.current = null;
    show({ item: liveItem, tile: liveTile }, control.state?.mode ?? "show");
  });

  function imageSaved(image: EventImageDTO) {
    if (!onImageSaved) return;
    savedImage.current = image;
    onImageSaved(image);
    control.notifyImages();
  }

  /**
   * The place of a new quick item: after the live item, also when the live
   * item is a quick item of this controller. A verse of the Bible panel is not
   * in the setlist: after the selected item, which stays on the item that was
   * live before. Null: at the end.
   */
  function quickItemAfterKey(): string | null {
    const afterItem = bibleLive ? items.find((item) => item.key === selectedKey) : liveItem;
    return afterItem?.key ?? null;
  }

  async function addQuickItem(source: ProjectionSource, item: QuickItemInput) {
    if (!addToEvent) {
      setQuickItems([...quickItems, { afterKey: quickItemAfterKey(), source }]);
      setSelectedKey(source.key);
      return;
    }
    const result = await addEventItem(item);
    if ("error" in result) toastError(result.error);
  }

  /**
   * Adds the item to the event at the place of a quick item, or after the item
   * of the event of `eventAfterKey`. The key of the new item, or the reason of the failure.
   */
  async function addEventItem(
    item: QuickItemInput,
    eventAfterKey?: string,
  ): Promise<{ key: string } | { error: string }> {
    if (!addToEvent) return { error: m.project.quickAdd.addFailed };
    const key = crypto.randomUUID();
    let after: string | null;
    if (eventAfterKey) after = eventAfterKey;
    else {
      const afterKey = quickItemAfterKey();
      // A quick item is not in the event: the item comes after the item of the event before it.
      const eventKeys = new Set(sources.map((candidate) => candidate.key));
      const before = afterKey
        ? items.slice(0, items.findIndex((candidate) => candidate.key === afterKey) + 1)
        : [];
      // No item of the event before it: at the start.
      after =
        afterKey === null
          ? null
          : (before.findLast(
              (candidate) => eventKeys.has(candidate.key) && !removedKeys.has(candidate.key),
            )?.key ?? QUICK_ITEMS_START);
    }
    const result = await addToEvent(after, key, item).catch(() => ({
      status: "error" as const,
      message: m.project.quickAdd.addFailed,
    }));
    if (result.status === "error") return { error: result.message };
    setSelectedKey(key);
    return { key };
  }

  // For an event admin: the quick add also adds image items and announcements items to the event.
  const quickAddTarget: Omit<QuickAddEvent, "upload"> | null =
    addToEvent && channel.eventId
      ? {
          eventId: channel.eventId,
          // Not the faded items that another admin removed: the server does not count them.
          imageCount: sources.reduce(
            (count, source) =>
              count +
              (source.kind === "images" && !removedKeys.has(source.key) ? source.images.length : 0),
            0,
          ),
          add: addEventItem,
        }
      : null;
  // The upload goes on when the box of the empty controller gives its place to the box above the setlist.
  const quickAddUpload = useQuickAddUpload(quickAddTarget);
  const quickAddEvent: QuickAddEvent | null = quickAddTarget && {
    ...quickAddTarget,
    upload: quickAddUpload,
  };

  async function removeAddedItem(key: string) {
    if (!removeFromEvent) return;
    const result = await removeFromEvent(key).catch(() => ({
      status: "error" as const,
      message: m.project.quickAdd.removeFailed,
    }));
    if (result.status === "error") toastError(result.message);
  }

  const quickItemsRef = useRef(quickItems);
  useLayoutEffect(() => {
    quickItemsRef.current = quickItems;
  });
  // The edit mode: the items editor in place of the setlist. Not kept: the controller opens for the slides.
  const [editingItems, setEditingItems] = useState(false);
  // Done saves the changes of the editor first. A change that the editor cannot save,
  // e.g. a text item without a title, keeps the edit mode: the editor shows why.
  async function changeEditMode(editing: boolean) {
    if (editing || !hasPendingSaves()) {
      setEditingItems(editing);
      return;
    }
    if (await savePendingChanges()) setEditingItems(false);
    else toastError(t.editorUnsaved);
  }
  const editMode = editingItems && itemsEditor !== null;
  const setlistLayout = useSetlistLayout(editMode);
  const [setlistFields, setSetlistFields] = useSetlistFields();
  const sourceByKey = useMemo(
    () => new Map(allSources.map((source) => [source.key, source])),
    [allSources],
  );
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const drag = useSetlistDrag({
    listRef,
    keys: items.map((item) => item.key),
    onMove: setOrder,
    onDrop: (keys, key) => void dropOrder(keys, key),
  });

  /**
   * Keeps the order of a drag: the quick items here, the others in the
   * setlist. Null: the drag was cancelled. `movedKey`: the item that moved.
   */
  async function dropOrder(keys: string[] | null, movedKey: string) {
    if (!keys) return setOrder(null);
    setQuickItems(placeQuickItems(quickItemsRef.current, keys));
    const setlistKeys = keys.filter((key) => !isQuickItemKey(key) && !removedKeys.has(key));
    const savedKeys = sources
      .filter((source) => !removedKeys.has(source.key))
      .map((source) => source.key);
    if (!reorder || setlistKeys.every((key, index) => key === savedKeys[index]))
      return setOrder(null);

    const focusedKey =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.dragHandle
        : undefined;
    setSavingKey(movedKey);
    const result = await reorder(setlistKeys).catch(() => ({
      status: "error" as const,
      message: t.reorderFailed,
    }));
    setSavingKey(null);
    setOrder(null);
    if (result.status === "error") {
      toastError(result.message);
      return;
    }
    result.apply();
    // The list can render again: the handle of a move by keys gets the focus back.
    if (focusedKey) requestAnimationFrame(() => focusDragHandle(listRef.current, focusedKey));
  }

  function changeTranslation(key: string, translation: string) {
    // A quick item keeps its translation with it, also after a reload.
    if (isQuickItemKey(key)) {
      setQuickItems(
        quickItems.map((item) =>
          item.source.key === key && item.source.kind === "text"
            ? { ...item, source: { ...item.source, translation } }
            : item,
        ),
      );
    } else {
      setTranslations((current) => new Map(current).set(key, translation));
    }
  }

  const leaderItem = leader ? (items.find((item) => item.key === leader.songId) ?? null) : null;
  const leaderTile =
    leaderItem && leader
      ? tileOfAnchor(leaderItem, leader.section, {
          written: leader.written,
          from: leaderItem === liveItem ? liveTile : null,
        })
      : null;

  useLayoutEffect(() => {
    commands.current = (command) => {
      if (command === "next") goNext();
      else if (command === "previous") goPrevious();
      else toggle(command);
    };
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.defaultPrevented ||
        isInDialog(event.target) ||
        isInItemsEditor(event.target)
      )
        return;
      if (isTextField(event.target) && !isEmptyFieldKey(event)) return;
      const command = PROJECTION_KEYS[event.key];
      if (!command) return;
      event.preventDefault();
      commands.current(command);
    }
    // A focused button clicks on the release of Space: it must not show its tile again.
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === " " && !isTextField(event.target) && !isInItemsEditor(event.target))
        event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const screenRunning = control.localScreenCount > 0;

  // The header of each block, before the first of its items in the setlist. A quick item between them does not repeat it.
  const blockHeaderAt = new Map<number, NonNullable<typeof liveBlock>>();
  const shownBlocks = new Set<string>();
  for (const run of blockRuns(
    items.map((item) => ({ blockKey: blockKeyOf.get(item.key) ?? null })),
  )) {
    const block = blocksByKey.get(run.blockKey);
    if (!block || shownBlocks.has(block.key)) continue;
    shownBlocks.add(block.key);
    blockHeaderAt.set(run.first, block);
  }

  return (
    <main className={cn("flex h-dvh flex-col bg-surface", projectionFontVariables)}>
      <header className="flex items-center gap-2 border-b px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-3">
        <Link
          href={backHref}
          aria-label={m.project.page.close}
          title={m.project.page.close}
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <XIcon />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-heading text-base font-semibold">{title}</h1>
        {schedule && liveBlock && countdownOn && (
          <BlockCountdownBadge
            block={liveBlock}
            plannedSeconds={blockPlan(plannedItems, liveBlock.key).seconds}
            eventStartsAt={schedule.startsAt}
            className="max-w-48"
          />
        )}
        {schedule && countdownOn && <ScheduleStatus schedule={schedule} liveKey={liveKey} />}
        <ScreenCount count={control.screens.length} overlayCount={control.overlayCount} />
        {/* Without a translation with its full text (the Bible translations tab of Configuration), no panel: the button says why. */}
        <ModuleGate id="projection.bible-panel">
          <BiblePanelButton layout={biblePanel} available={bible.available} />
        </ModuleGate>
        <ModuleGate id="projection.pptx-export">
          <DownloadSlidesButton title={title} items={items} aspectRatio={aspectRatio} />
        </ModuleGate>
        <ModuleGate id="mixer">
          <MixerSyncButton sources={allSources} liveKey={liveKey} leader={leaderState} />
        </ModuleGate>
        {/* While a screen of this computer runs, closing it is the main action: the close button is primary, at the end.
            The picker keeps its place, so it does not mount again when a screen opens or closes. */}
        <ScreenPicker
          href={projectionScreenHref(channel.eventId)}
          shareable={channel.connection !== null}
          overlayHref={
            overlayEventId && overlayOn
              ? (background) => projectionOverlayHref(overlayEventId, background)
              : null
          }
          variant={screenRunning ? "outline" : "default"}
        />
        {screenRunning && (
          <Button
            type="button"
            onClick={control.closeLocalScreens}
            aria-label={plural(t.closeScreens, control.localScreenCount)}
            title={plural(t.closeScreens, control.localScreenCount)}
          >
            <MonitorXIcon />
            <span className="sr-only sm:not-sr-only">{t.closeScreensShort}</span>
          </Button>
        )}
      </header>

      {changed && (
        <p
          role="status"
          className="flex items-center gap-2 border-b bg-surface-sunken px-3 py-2 text-sm"
        >
          <CircleAlertIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{t.setlistChanged}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            {t.reload}
          </Button>
        </p>
      )}
      {(control.status === "connecting" || control.status === "failed") && (
        <p role="status" className="border-b px-3 py-1.5 text-xs text-muted">
          {control.status === "connecting" ? t.connecting : t.connectionFailed}
        </p>
      )}
      {syncOffline && control.status === "live" && (
        <p role="status" className="border-b px-3 py-1.5 text-xs text-muted">
          {m.components.eventChanges.offline}
        </p>
      )}

      {/* The Bible panel on the right of the controller. */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {items.length === 0 && !editMode ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListMusicIcon />
                </EmptyMedia>
                <EmptyTitle>{m.project.gate.emptyTitle}</EmptyTitle>
                <EmptyDescription>
                  {channel.eventId
                    ? m.project.gate.emptyEventDescription
                    : m.project.gate.emptyRehearsalDescription}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <ModuleGate id="projection.quick-add">
                  <QuickAddBox
                    onAdd={addQuickItem}
                    event={quickAddEvent}
                    className="w-full text-left"
                  />
                </ModuleGate>
                {itemsEditor && (
                  <EditItemsToggle editing={false} onChange={changeEditMode} withText />
                )}
              </EmptyContent>
            </Empty>
          ) : (
            // Narrow: the previews, the setlist in a row, the tiles. Wide: the setlist is a column on the left, with a handle to resize it.
            // Narrow in the edit mode: the previews, and the items editor below them in place of the setlist and the tiles.
            <div
              style={{ "--setlist-width": setlistLayout.column } as React.CSSProperties}
              className={cn(
                "grid min-h-0 flex-1 lg:grid-cols-[var(--setlist-width)_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]",
                editMode ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[auto_auto_minmax(0,1fr)]",
              )}
            >
              {/* Wide: the settings are a column on the right of the previews. Narrow: below the buttons. */}
              <section className="@container border-b p-3 lg:col-start-2 lg:row-start-1">
                <div className="flex flex-col gap-3 @4xl:flex-row @4xl:items-start @4xl:gap-4">
                  <div className="flex min-w-0 flex-col gap-3 lg:max-w-2xl @4xl:flex-1">
                    <div className="grid grid-cols-2 gap-3">
                      <Preview
                        label={t.live}
                        mode={state?.mode ?? "show"}
                        slide={state ? state.slide : null}
                        look={state?.look ?? eventLook}
                        empty={t.nothingLive}
                        stream={state?.stream ?? null}
                        playVideo
                      />
                      <Preview
                        label={t.next}
                        mode="show"
                        slide={next && next !== "end" ? next.tile.slide : null}
                        look={next && next !== "end" ? next.item.look : eventLook}
                        empty={next === "end" || atEnd ? t.endOfSetlist : t.nothingNext}
                        stream={
                          next && next !== "end"
                            ? (partsOf(next.tile)?.[next.part ?? 0] ?? null)
                            : null
                        }
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant={state?.mode === "black" ? "default" : "outline"}
                        aria-pressed={state?.mode === "black"}
                        aria-keyshortcuts="B"
                        onClick={() => toggle("black")}
                      >
                        <SquareIcon className="fill-current" />
                        {t.black}
                      </Button>
                      <Button
                        type="button"
                        variant={state?.mode === "clear" ? "default" : "outline"}
                        aria-pressed={state?.mode === "clear"}
                        aria-keyshortcuts="C"
                        onClick={() => toggle("clear")}
                      >
                        <EraserIcon />
                        {t.clear}
                      </Button>
                      {leaderTile && leaderItem && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => show({ item: leaderItem, tile: leaderTile })}
                        >
                          <RadioIcon />
                          {t.goToLeader}
                        </Button>
                      )}
                    </div>
                    <p className="hidden text-xs text-muted lg:block">{t.keys}</p>
                  </div>
                  {/* Narrow: the settings wrap as lines of text, so that they take few rows. Wider: one label and
                      one control in each row (two in a medium-width row), so that the labels align. */}
                  <div
                    role="group"
                    aria-label={t.displaySettings}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm @xl:grid @xl:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] @xl:gap-x-3 @4xl:w-80 @4xl:shrink-0 @4xl:grid-cols-[auto_minmax(0,1fr)] @4xl:border-l @4xl:pl-4"
                  >
                    {changeTheme && themesOn && (
                      <ThemeSelect
                        label={m.project.themes.eventTheme}
                        themes={themes.themes.filter((theme) => !theme.isDefault)}
                        value={themes.eventThemeId}
                        noneLabel={format(m.project.themes.useDefaultTheme, {
                          name: themes.themes.find((theme) => theme.isDefault)?.name ?? "",
                        })}
                        onChange={(themeId) => void applyTheme("event", themeId)}
                        className={SETTING_ROW}
                        selectClassName="w-auto max-w-48 @xl:w-full @xl:max-w-none"
                      />
                    )}
                    <label className={cn(SETTING_ROW, "text-muted")}>
                      <span className="whitespace-nowrap">{t.aspectRatio}</span>
                      <NativeSelect
                        value={ratioSetting}
                        onChange={(event) => setRatioSetting(event.target.value as RatioSetting)}
                        className="w-auto @xl:w-full"
                      >
                        <option value="auto">
                          {i18n.format(t.aspectRatioAuto, { ratio: ratioName(autoRatio) })}
                        </option>
                        {Object.keys(RATIOS).map((ratio) => (
                          <option key={ratio} value={ratio}>
                            {ratio}
                          </option>
                        ))}
                      </NativeSelect>
                    </label>
                    <div title={t.scriptureRollHint} className={SETTING_ROW}>
                      <label htmlFor={rollId} className="whitespace-nowrap text-muted">
                        {t.scriptureRoll}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id={rollId}
                          type="checkbox"
                          className="size-4 shrink-0 accent-primary"
                          checked={scriptureRoll !== null}
                          onChange={(event) =>
                            changeScriptureRoll(event.target.checked ? rollPreference.size : null)
                          }
                        />
                        {/* Always there, so that the layout does not move: disabled without the roll view. A disabled
                            select gets no pointer events, so the span under it shows its hint. */}
                        <span title={t.scriptureRollSizeOff} className="min-w-0 @xl:flex-1">
                          <NativeSelect
                            aria-label={t.scriptureRollSize}
                            title={t.scriptureRollSize}
                            value={scriptureRoll ?? rollPreference.size}
                            disabled={scriptureRoll === null}
                            onChange={(event) => changeScriptureRoll(Number(event.target.value))}
                            className="w-auto @xl:w-full"
                          >
                            {/* A size of another controller that this one does not have, e.g. of a newer version. */}
                            {scriptureRoll !== null &&
                              !ROLL_TEXT_SIZES.some((size) => size === scriptureRoll) && (
                                <option value={scriptureRoll}>
                                  {format(m.project.images.percent, { value: scriptureRoll })}
                                </option>
                              )}
                            {ROLL_TEXT_SIZES.map((size) => (
                              <option key={size} value={size}>
                                {format(m.project.images.percent, { value: size })}
                              </option>
                            ))}
                          </NativeSelect>
                        </span>
                      </div>
                    </div>
                    {overlayEventId && (
                      <label
                        title={format(t.streamLinesHint, { lines: streamLines ?? STREAM_LINES })}
                        className={cn(SETTING_ROW, "text-muted")}
                      >
                        <span className="whitespace-nowrap">
                          {format(t.streamLines, { lines: streamLines ?? STREAM_LINES })}
                        </span>
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={streamLines !== null}
                          onChange={(event) => changeStreamLines(event.target.checked)}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </section>

              <nav
                ref={navRef}
                aria-label={t.setlist}
                className={cn(
                  "border-b lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:overflow-y-auto lg:border-r lg:border-b-0",
                  editMode && "overflow-y-auto",
                )}
              >
                {!editMode && (
                  <ModuleGate id="projection.quick-add">
                    <QuickAddBox onAdd={addQuickItem} event={quickAddEvent} className="px-3 pt-3" />
                  </ModuleGate>
                )}
                <div className={cn("flex items-center gap-2 px-3 pt-3", editMode && "pb-3")}>
                  <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{t.setlist}</h2>
                  {itemsEditor && <EditItemsToggle editing={editMode} onChange={changeEditMode} />}
                  {!editMode && (
                    <SetlistFieldsMenu fields={setlistFields} onChange={setSetlistFields} />
                  )}
                </div>
                {editMode ? (
                  <div data-items-editor>{itemsEditor({ liveKey })}</div>
                ) : (
                  <>
                    <p role="status" className="sr-only">
                      {savingOrder ? t.reorderSaving : ""}
                    </p>
                    <ol
                      ref={listRef}
                      className={cn(
                        "flex gap-2 overflow-x-auto p-3 lg:flex-col lg:gap-1 lg:overflow-x-visible",
                        drag.dragKey !== null && "cursor-grabbing select-none",
                      )}
                    >
                      {items.map((item, index) => {
                        const blockHeader = blockHeaderAt.get(index);
                        const inBlock =
                          blockKeyOf.has(item.key) &&
                          blocksByKey.has(blockKeyOf.get(item.key) ?? "");
                        const quick = isQuickItemKey(item.key);
                        const removed = removedKeys.has(item.key);
                        const details = songDetails(sourceByKey.get(item.key), setlistFields).join(
                          " · ",
                        );
                        const removable =
                          quick ||
                          (addedKeys.has(item.key) && removeFromEvent !== null && !removed);
                        const movable = !removed && (quick || reorder !== null);
                        return (
                          <Fragment key={item.key}>
                            {blockHeader && schedule && (
                              <li className="flex w-44 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-card border-l-4 border-l-primary/40 bg-surface-sunken px-2.5 py-1.5 lg:mt-1 lg:w-auto lg:shrink">
                                <BlockHeader
                                  block={blockHeader}
                                  status={
                                    countdownOn && (
                                      <BlockCountdownBadge
                                        block={blockHeader}
                                        plannedSeconds={
                                          blockPlan(plannedItems, blockHeader.key).seconds
                                        }
                                        eventStartsAt={schedule.startsAt}
                                        hideName
                                      />
                                    )
                                  }
                                  actions={
                                    startBlock &&
                                    countdownOn &&
                                    blockHeader.countdown === "remaining"
                                      ? [
                                          {
                                            id: "restart",
                                            label: m.components.eventBlocks.restart,
                                            icon: <TimerResetIcon />,
                                            onSelect: () => void restartBlock(blockHeader.key),
                                          },
                                        ]
                                      : []
                                  }
                                />
                                {restartError?.key === blockHeader.key && (
                                  <div
                                    role="alert"
                                    className="flex w-full flex-wrap items-center gap-2 text-xs text-danger"
                                  >
                                    <span className="min-w-0 flex-1">{restartError.message}</span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      aria-disabled={restartingKey === blockHeader.key}
                                      onClick={() =>
                                        restartingKey === null && void restartBlock(blockHeader.key)
                                      }
                                    >
                                      {restartingKey === blockHeader.key && (
                                        <LoaderCircleIcon aria-hidden className="animate-spin" />
                                      )}
                                      {m.common.autoSave.retry}
                                    </Button>
                                  </div>
                                )}
                              </li>
                            )}
                            <li
                              data-setlist-item
                              className={cn(
                                "relative shrink-0 lg:shrink",
                                inBlock && "lg:border-l-4 lg:border-l-primary/40 lg:pl-1",
                                drag.dragKey === item.key &&
                                  "z-10 rounded-card bg-surface shadow-md",
                              )}
                            >
                              {movable && (
                                <button
                                  type="button"
                                  data-drag-handle={item.key}
                                  aria-label={format(t.move, { title: item.title })}
                                  aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
                                  title={t.dragToReorder}
                                  disabled={savingOrder}
                                  onPointerDown={(event) => {
                                    if (event.button !== 0) return;
                                    // No text selection while dragging.
                                    event.preventDefault();
                                    drag.start(item.key, event);
                                  }}
                                  onKeyDown={(event) => {
                                    const offset = MOVE_KEYS[event.key];
                                    if (!offset) return;
                                    // Not a slide key for the controller.
                                    event.preventDefault();
                                    drag.move(item.key, offset);
                                  }}
                                  className={cn(
                                    "absolute top-1/2 left-0.5 flex h-8 w-6 -translate-y-1/2 touch-none items-center justify-center rounded-sm text-muted outline-none hover:text-text focus-visible:ring-[3px] focus-visible:ring-focus/50 disabled:opacity-50",
                                    drag.dragKey !== null ? "cursor-grabbing" : "cursor-grab",
                                  )}
                                >
                                  {savingKey === item.key ? (
                                    <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
                                  ) : (
                                    <GripVerticalIcon className="size-4" />
                                  )}
                                </button>
                              )}
                              <button
                                type="button"
                                aria-current={item === selected ? "true" : undefined}
                                title={quick ? t.quickItem : removed ? t.removedItem : undefined}
                                onClick={() => setSelectedKey(item.key)}
                                className={cn(
                                  // Narrow: the same height in the row, also with the details of a song under its title.
                                  "flex h-full w-44 items-center gap-2 rounded-card border px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-sunken lg:h-auto lg:w-full",
                                  movable && "pl-7",
                                  quick && "border-dashed",
                                  removable && "pr-9",
                                  removed && "border-dashed opacity-50",
                                  item === selected && "border-primary bg-primary/10",
                                )}
                              >
                                <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">
                                  {index + 1}
                                </span>
                                {item.scripture ? (
                                  <BookOpenIcon className="size-4 shrink-0 text-muted" />
                                ) : item.kind === "images" ? (
                                  <ImagesIcon className="size-4 shrink-0 text-muted" />
                                ) : item.kind === "announcements" ? (
                                  <MegaphoneIcon className="size-4 shrink-0 text-muted" />
                                ) : item.kind === "textSlide" ? (
                                  <PresentationIcon className="size-4 shrink-0 text-muted" />
                                ) : item.kind === "text" ? (
                                  <TextIcon className="size-4 shrink-0 text-muted" />
                                ) : (
                                  <ListMusicIcon className="size-4 shrink-0 text-muted" />
                                )}
                                <span className="flex min-w-0 flex-1 flex-col">
                                  <span className="truncate">
                                    {item.title}
                                    {quick && <span className="sr-only"> ({t.quickItem})</span>}
                                    {removed && <span className="sr-only"> ({t.removedItem})</span>}
                                  </span>
                                  {details && (
                                    <span className="truncate text-xs text-muted">{details}</span>
                                  )}
                                </span>
                                {assignees[item.key] && (
                                  <AssigneeMark person={assignees[item.key]!} />
                                )}
                                {item === leaderItem && <LeaderMark label={t.leader} />}
                                {item === liveItem && <LiveMark label={t.live} />}
                              </button>
                              {removable && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={format(t.removeQuickItem, { title: item.title })}
                                  title={format(t.removeQuickItem, { title: item.title })}
                                  onClick={() =>
                                    quick
                                      ? setQuickItems(removeQuickItem(quickItems, item.key))
                                      : void removeAddedItem(item.key)
                                  }
                                  className="absolute top-1/2 right-1 -translate-y-1/2"
                                >
                                  <XIcon />
                                </Button>
                              )}
                            </li>
                          </Fragment>
                        );
                      })}
                    </ol>
                  </>
                )}
              </nav>
              <SetlistResizeHandle layout={setlistLayout} panelRef={navRef} />

              <section
                aria-label={selected?.title}
                className={cn(
                  "overflow-y-auto p-3 lg:col-start-2 lg:row-start-2",
                  editMode && "max-lg:hidden",
                )}
              >
                {/* A quick item is not in the event: it has the theme of the event. Nor is a removed item. */}
                {selected &&
                  changeTheme &&
                  themesOn &&
                  !isQuickItemKey(selected.key) &&
                  !removedKeys.has(selected.key) && (
                    <ThemeSelect
                      label={m.project.themes.itemTheme}
                      ariaLabel={format(m.project.themes.itemThemeOf, { title: selected.title })}
                      themes={themes.themes}
                      value={
                        itemThemeId(
                          themes,
                          allSources.find((source) => source.key === selected.key),
                        ) ?? null
                      }
                      noneLabel={inheritedThemeLabel(
                        allSources.find((source) => source.key === selected.key),
                      )}
                      onChange={(themeId) => void applyTheme({ itemKey: selected.key }, themeId)}
                      className="mb-3"
                    />
                  )}
                {selected && (
                  <Tiles
                    item={selected}
                    liveTiles={selected === liveItem ? liveTiles : []}
                    livePart={selected === liveItem ? livePart : -1}
                    partsOf={partsOf}
                    onShowPart={(tile, part) => show({ item: selected, tile, part })}
                    leaderTile={selected === leaderItem ? leaderTile : null}
                    onShow={(tile, click) => clickTile(selected, tile, click)}
                    reading={scripture.readings.get(selected.key) ?? null}
                    onTranslationChange={(translation) =>
                      changeTranslation(selected.key, translation)
                    }
                    onRetry={scripture.retry}
                    onPaste={(translation) => setPasting({ title: selected.title, translation })}
                    more={scripture.more.get(selected.key) ?? null}
                    onLoadMore={() => scripture.loadMore(selected.key)}
                    aspectRatio={aspectRatio}
                    onAdjust={
                      onImageSaved &&
                      (selected.kind === "images" || selected.kind === "announcements")
                        ? (tile) => {
                            const source = allSources.find(
                              (candidate) => candidate.key === selected.key,
                            );
                            const image = tileImage(source, tile);
                            const qr = tile.slide.kind === "image" ? tile.slide.qr : undefined;
                            if (image) setAdjusting({ image, look: selected.look, qr });
                          }
                        : null
                    }
                  />
                )}
              </section>
            </div>
          )}
        </div>
        {bible.available && biblePanelOn && (
          <BiblePanel
            layout={biblePanel}
            bible={bible}
            live={
              bibleLive && liveItem
                ? { itemKey: liveItem.key, tileIds: new Set(liveTiles.map((tile) => tile.id)) }
                : null
            }
            onClickVerse={(tile, click) => bible.openItem && clickTile(bible.openItem, tile, click)}
            onShowVerses={(item, tiles) => {
              setVerseAnchor({ itemKey: item.key, tileId: tiles[0]!.id });
              showVerses(item, tiles);
            }}
            onAdd={addQuickItem}
          />
        )}
      </div>
      {adjusting && (
        <ImageAdjustDialog
          image={adjusting.image}
          look={adjusting.look}
          qr={adjusting.qr}
          aspectRatio={aspectRatio}
          open
          onOpenChange={(open) => !open && setAdjusting(null)}
          onSaved={imageSaved}
        />
      )}
      {pasting && (
        <PasteScriptureDialog
          reference={pasting.title}
          translation={pasting.translation}
          open
          onOpenChange={(open) => !open && setPasting(null)}
          onSaved={(book, verses) => scripture.addPasted(pasting.translation.id, book, verses)}
          eventId={channel.eventId}
        />
      )}
    </main>
  );
}

/** The keys of a click on a tile: Shift for `range`, Ctrl or ⌘ for `toggle`. */
type TileClick = { range: boolean; toggle: boolean };

function Tiles({
  item,
  liveTiles,
  livePart,
  partsOf,
  onShowPart,
  leaderTile,
  onShow,
  reading,
  onTranslationChange,
  onRetry,
  onPaste,
  more,
  onLoadMore,
  aspectRatio,
  onAdjust,
}: {
  item: ProjectionItem;
  /** The tiles on the screens: one, or more verses together. */
  liveTiles: ProjectionTile[];
  /** The part of the lyrics of the live tile on the stream overlay, from 0. -1: the whole slide. */
  livePart: number;
  /** The parts of the lyrics of a tile on the stream overlay (see `streamParts`). Null: one step. */
  partsOf: (tile: ProjectionTile) => string[][] | null;
  leaderTile: ProjectionTile | null;
  onShow: (tile: ProjectionTile, click: TileClick) => void;
  /** Shows the tile with a part of its lyrics on the stream overlay. */
  onShowPart: (tile: ProjectionTile, part: number) => void;
  /** The text of a scripture reading. */
  reading: ScriptureReading | null;
  onTranslationChange: (translation: string) => void;
  onRetry: () => void;
  /** Opens the dialog for the text of a reading in a "pasted" translation. */
  onPaste: (translation: ScriptureTranslation) => void;
  /** The "Load more" button after the verses. Null: none, e.g. after the last verse of the Bible. */
  more: MoreVerses | null;
  onLoadMore: () => void;
  /** The shape of the screens, for the pictures of the images. */
  aspectRatio: number;
  /** Opens the adjustments of an image of the gallery. Null: they cannot change here. */
  onAdjust: ((tile: ProjectionTile) => void) | null;
}) {
  const i18n = useI18n();
  const t = i18n.m.project.controller;
  // With the parts of the lyrics, a slide is a column: the whole slide, then its parts.
  const parted = item.tiles.some((tile) => partsOf(tile));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="min-w-0 flex-1 font-heading font-heading text-fs-5 font-bold text-primary">
          {item.title}
        </h2>
        {reading && (
          <ScriptureTranslationSelect
            value={reading.translation.id}
            onChange={onTranslationChange}
            title={item.title}
            offNote={false}
          />
        )}
      </div>
      {reading && (
        <ScriptureStatusNote
          reading={reading}
          quick={isQuickItemKey(item.key)}
          onRetry={onRetry}
          onPaste={() => onPaste(reading.translation)}
        />
      )}
      <ul
        className={cn(
          "grid gap-2",
          parted
            ? "items-start sm:grid-cols-2 xl:grid-cols-3"
            : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4",
        )}
      >
        {item.tiles.map((tile) => {
          const parts = partsOf(tile);
          const live = liveTiles.includes(tile);
          if (parts) {
            return (
              <li key={tile.id}>
                <PartedTile
                  label={tileLabel(i18n, item, tile)}
                  paragraphs={tile.slide.kind === "lyrics" ? tile.slide.paragraphs : []}
                  parts={parts}
                  live={live}
                  livePart={live ? livePart : -1}
                  leader={tile === leaderTile}
                  onShow={() => onShowPart(tile, 0)}
                  onShowPart={(part) => onShowPart(tile, part)}
                />
              </li>
            );
          }
          return (
            <li key={tile.id} className="relative">
              <button
                type="button"
                aria-pressed={live}
                // No text selection with Shift.
                onMouseDown={(event) => event.shiftKey && event.preventDefault()}
                onClick={(event) =>
                  onShow(tile, { range: event.shiftKey, toggle: event.metaKey || event.ctrlKey })
                }
                className={cn(
                  TILE_BUTTON,
                  "flex h-full min-h-24 flex-col gap-1 rounded-card p-2.5",
                  live && LIVE_TILE,
                )}
              >
                <TileHeading
                  label={tileLabel(i18n, item, tile)}
                  leader={tile === leaderTile}
                  live={live}
                  className={cn(tile.slide.kind === "image" && onAdjust && "pr-8")}
                />
                {hasThumbnail(tile.slide) ? (
                  <span
                    className="relative block w-full overflow-hidden rounded-sm border bg-black"
                    style={{ aspectRatio }}
                  >
                    <SlideView slide={tile.slide} look={item.look} />
                  </span>
                ) : (
                  <span className="line-clamp-3 text-xs text-muted">{tilePreview(i18n, tile)}</span>
                )}
              </button>
              {tile.slide.kind === "image" && onAdjust && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={i18n.format(i18n.m.project.images.adjustOf, {
                    name: tileLabel(i18n, item, tile),
                  })}
                  title={i18n.m.project.images.adjust}
                  onClick={() => onAdjust(tile)}
                  className="absolute top-1.5 right-1.5"
                >
                  <SlidersHorizontalIcon />
                </Button>
              )}
            </li>
          );
        })}
        {more && item.scriptureFormat && (
          <li>
            <button
              type="button"
              disabled={more.status === "loading"}
              onClick={more.status === "failed" ? onRetry : onLoadMore}
              className="flex h-full min-h-24 w-full flex-col items-center justify-center gap-1 rounded-card border border-dashed p-2.5 text-center text-sm transition-colors hover:bg-surface-sunken focus-visible:ring-3 focus-visible:ring-focus/50 focus-visible:outline-none disabled:opacity-60"
            >
              {more.status === "loading" ? (
                <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
              ) : more.status === "failed" ? (
                <CircleAlertIcon aria-hidden className="size-4" />
              ) : (
                <PlusIcon aria-hidden className="size-4" />
              )}
              <span className="font-medium">
                {more.status === "loading"
                  ? t.loadingMoreVerses
                  : more.status === "failed"
                    ? t.scriptureRetry
                    : t.loadMoreVerses}
              </span>
              {more.status === "ready" && <span className="text-xs text-muted">{more.label}</span>}
              {more.status === "failed" && (
                <span className="text-xs text-muted">{t.moreVersesFailed}</span>
              )}
            </button>
          </li>
        )}
      </ul>
      {item.kind === "song" && !item.hasLyrics && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t.noLyricsTitle}</EmptyTitle>
            <EmptyDescription>{t.noLyrics}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {/* Only the blank tile: no description and no highlighted text. */}
      {item.kind === "textSlide" && item.tiles.length === 1 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t.noTextSlideTextTitle}</EmptyTitle>
            <EmptyDescription>{t.noTextSlideText}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

/**
 * A lyrics slide with its parts on the stream overlay, in a column: the
 * whole slide on top, which the screens show, then a box for each part. A
 * click on the whole slide shows its first part.
 */
function PartedTile({
  label,
  paragraphs,
  parts,
  live,
  livePart,
  leader,
  onShow,
  onShowPart,
}: {
  label: string;
  paragraphs: string[][];
  parts: string[][];
  live: boolean;
  /** The live part, from 0. -1: the overlay shows the whole slide, or the slide is not live. */
  livePart: number;
  leader: boolean;
  onShow: () => void;
  onShowPart: (part: number) => void;
}) {
  const { m, format } = useI18n();
  const t = m.project.controller;

  return (
    <div className={cn("flex flex-col gap-2 rounded-card border p-2", live && "border-primary")}>
      <button
        type="button"
        aria-pressed={live && livePart < 0}
        onClick={onShow}
        className={cn(
          TILE_BUTTON,
          "flex flex-col gap-1 rounded-control p-2.5",
          live && livePart < 0 && LIVE_TILE,
        )}
      >
        <TileHeading label={label} leader={leader} live={live} />
        <span className="flex flex-col gap-1.5 text-xs text-muted">
          {paragraphs.map((lines, index) => (
            <Lines key={index} lines={lines} />
          ))}
        </span>
      </button>
      {parts.map((lines, index) => (
        <button
          key={index}
          type="button"
          aria-pressed={livePart === index}
          aria-label={format(t.streamPart, {
            part: index + 1,
            parts: parts.length,
            lines: lines.join(" / "),
          })}
          onClick={() => onShowPart(index)}
          className={cn(
            TILE_BUTTON,
            "ml-3 w-[calc(100%-0.75rem)] rounded-control px-2.5 py-2 text-sm",
            livePart === index && LIVE_TILE,
          )}
        >
          <Lines lines={lines} />
        </button>
      ))}
    </div>
  );
}

/** A button of a tile, or of a part of the lyrics. */
const TILE_BUTTON =
  "w-full border text-left transition-colors hover:bg-surface-sunken focus-visible:ring-3 focus-visible:ring-focus/50 focus-visible:outline-none";
/** A tile on the screens, or the part of the lyrics on the stream overlay. */
const LIVE_TILE = "border-primary bg-primary/10 ring-2 ring-primary";

/** The name of a tile, with the marks of the leader and of the screens. */
function TileHeading({
  label,
  leader,
  live,
  className,
}: {
  label: string;
  leader: boolean;
  live: boolean;
  className?: string;
}) {
  const { m } = useI18n();
  const t = m.project.controller;
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      {leader && <LeaderMark label={t.leader} />}
      {live && <LiveMark label={t.live} />}
    </span>
  );
}

/** The lines of a paragraph, each on its own line. */
function Lines({ lines }: { lines: string[] }) {
  return (
    <span>
      {lines.map((line, index) => (
        <span key={index} className="block">
          {line}
        </span>
      ))}
    </span>
  );
}

/** The tiles of the verses on the slide, or only the live tile. */
function liveVerseTiles(
  item: ProjectionItem,
  liveTile: ProjectionTile,
  slide: ProjectionSlide,
): ProjectionTile[] {
  if (!liveTile.verse || slide.kind !== "scripture" || slide.verses.length < 2) return [liveTile];
  const texts = new Set(slide.verses.map((verse) => verse.text));
  const tiles = item.tiles.filter((tile) => tile.verse && texts.has(tile.verse.text));
  return tiles.includes(liveTile) ? tiles : [liveTile];
}

/** What the controller knows about the text of a scripture reading. Nothing when all of it is on the tiles. */
function ScriptureStatusNote({
  reading,
  quick,
  onRetry,
  onPaste,
}: {
  reading: ScriptureReading;
  quick: boolean;
  onRetry: () => void;
  onPaste: () => void;
}) {
  const { m, format } = useI18n();
  const t = m.project.controller;
  const { status } = reading;
  if (status.status === "ready" && !status.missing && !status.truncated) {
    // A wrong text in the cache: a user pastes it again.
    if (reading.translation.source !== "pasted") return null;
    return (
      <div>
        <Button type="button" size="sm" variant="ghost" onClick={onPaste}>
          <ClipboardPasteIcon />
          {t.scriptureReplace}
        </Button>
      </div>
    );
  }

  const text =
    status.status === "loading"
      ? t.scriptureLoading
      : status.status === "failed"
        ? t.scriptureFailed
        : status.status === "notInstalled"
          ? format(t.scriptureNotInstalled, { translation: reading.translation.shortName })
          : status.status === "needsText"
            ? format(t.scriptureNeedsText, { translation: reading.translation.shortName })
            : status.status === "off"
              ? t.scriptureOff
              : status.status === "unrecognized"
                ? quick
                  ? t.scriptureUnrecognizedQuick
                  : t.scriptureUnrecognized
                : status.status === "unavailable"
                  ? format(t.scriptureUnavailable, { translation: reading.translation.shortName })
                  : status.truncated
                    ? format(t.scriptureTruncated, { count: MAX_PASSAGE_VERSES })
                    : format(t.scriptureMissing, { translation: reading.translation.shortName });

  return (
    <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-muted">
      {status.status === "loading" ? (
        <LoaderCircleIcon aria-hidden className="size-4 shrink-0 animate-spin" />
      ) : (
        <CircleAlertIcon aria-hidden className="size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1">{text}</span>
      {status.status === "needsText" && (
        <Button type="button" size="sm" onClick={onPaste}>
          <ClipboardPasteIcon />
          {t.scripturePaste}
        </Button>
      )}
      {/* For "needsText": another user may have pasted the text. */}
      {(status.status === "failed" ||
        status.status === "notInstalled" ||
        status.status === "needsText") && (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          {t.scriptureRetry}
        </Button>
      )}
    </p>
  );
}

function Preview({
  label,
  mode,
  slide,
  look,
  empty,
  stream = null,
  playVideo = false,
}: {
  label: string;
  mode: ProjectionMode;
  slide: ProjectionSlide | null;
  look: ProjectionLook;
  /** The text when there is no slide. */
  empty: string;
  /** The lines on the stream overlay, when it shows a part of the lyrics. */
  stream?: string[] | null;
  /** The video of the background plays: only for the live slide, as on the screens. */
  playVideo?: boolean;
}) {
  const { m } = useI18n();
  const t = m.project.controller;
  const modeLabel = mode === "black" ? t.black : mode === "clear" ? t.clear : null;

  return (
    <figure className="flex min-w-0 flex-col gap-1">
      <figcaption className="flex items-center gap-2 text-xs font-medium text-muted">
        {label}
        {modeLabel && (
          <span className="rounded bg-inverse px-1.5 py-0.5 text-[0.7rem] text-inverse-text">
            {modeLabel}
          </span>
        )}
      </figcaption>
      <div className="relative aspect-video overflow-hidden rounded-control border bg-black">
        {slide ? (
          <SlideView slide={slide} mode={mode} look={look} playVideo={playVideo} />
        ) : (
          <p className="flex size-full items-center justify-center p-2 text-center text-xs text-white/70">
            {empty}
          </p>
        )}
      </div>
      {stream && slide && (
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
          <VideoIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="sr-only">{t.streamPreview}: </span>
          <span className="min-w-0 truncate">{stream.join(" / ")}</span>
        </p>
      )}
    </figure>
  );
}

function ScreenCount({ count, overlayCount }: { count: number; overlayCount: number }) {
  const { m, plural } = useI18n();
  const t = m.project.controller;
  const overlays = overlayCount > 0 && (
    <span
      role="status"
      title={plural(t.overlays, overlayCount)}
      className="flex items-center gap-1.5 text-xs text-muted"
    >
      <VideoIcon className="size-4" />
      <span className="hidden sm:inline">{plural(t.overlays, overlayCount)}</span>
    </span>
  );
  if (count === 0) {
    return (
      <>
        <span
          role="status"
          title={t.noScreens}
          className="flex items-center gap-1.5 text-xs text-danger"
        >
          <MonitorOffIcon className="size-4" />
          <span className="hidden sm:inline">{t.noScreensShort}</span>
        </span>
        {overlays}
      </>
    );
  }
  return (
    <>
      <span role="status" className="flex items-center gap-1.5 text-xs text-muted">
        <MonitorIcon className="size-4" />
        <span className="hidden sm:inline">{plural(t.screens, count)}</span>
      </span>
      {overlays}
    </>
  );
}

function LiveMark({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[0.7rem] font-medium text-primary-contrast">
      {label}
    </span>
  );
}

function LeaderMark({ label }: { label: string }) {
  return (
    <span title={label} className="flex shrink-0 items-center text-primary">
      <RadioIcon aria-hidden className="size-4" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** The volunteer of an item in the setlist: the avatar, with the name as a tooltip. */
function AssigneeMark({ person }: { person: AvatarPerson }) {
  const i18n = useI18n();
  const name = personName(person, i18n);
  return (
    <span title={name} className="flex shrink-0 items-center">
      <UserAvatar person={person} size="sm" className="size-5" />
      <span className="sr-only">
        {i18n.m.events.eventItems.volunteerPrefix}
        {name}
      </span>
    </span>
  );
}

/**
 * The switch of the edit mode: "Edit items", or "Done" in the edit mode. An
 * icon button next to the menu of the setlist fields, with the text as its
 * label; a button with the text in the empty state (`withText`).
 */
function EditItemsToggle({
  editing,
  onChange,
  withText = false,
}: {
  editing: boolean;
  onChange: (editing: boolean) => void;
  withText?: boolean;
}) {
  const { m } = useI18n();
  const t = m.project.controller;
  const label = editing ? t.doneEditing : t.editItems;
  const icon = editing ? <CheckIcon /> : <PencilIcon />;
  if (withText) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => onChange(!editing)}>
        {icon}
        {label}
      </Button>
    );
  }
  return (
    <Button
      type="button"
      size="icon-sm"
      variant={editing ? "default" : "ghost"}
      aria-label={label}
      title={label}
      onClick={() => onChange(!editing)}
    >
      {icon}
    </Button>
  );
}

/** E.g. "Verse 1 (1/2)", "Title" or "Clear screen". */
function tileLabel({ m, format }: I18n, item: ProjectionItem, tile: ProjectionTile): string {
  const t = m.project.controller;
  if (item.scripture)
    return tile.slide.kind === "title" ? t.scriptureTile : (tile.label ?? t.scriptureTile);
  // An image item without images yet has a blank tile.
  if (item.kind === "images")
    return tile.slide.kind === "image" ? (tile.label ?? t.imageTile) : t.textItemTile;
  if (item.kind === "text" || item.kind === "textSlide") {
    if (tile.slide.kind === "blank") return t.textItemTile;
    return tile.parts > 1
      ? format(t.partLabel, { label: t.textTile, part: tile.part + 1, parts: tile.parts })
      : t.textTile;
  }
  if (item.kind === "announcements") {
    if (tile.slide.kind === "blank") return t.textItemTile;
    if (tile.slide.kind === "qr") return format(t.qrTile, { label: tile.label ?? "" });
  }
  if (tile.slide.kind === "title") return t.titleTile;
  const label = tile.label ?? t.unlabeledTile;
  return tile.parts > 1
    ? format(t.partLabel, { label, part: tile.part + 1, parts: tile.parts })
    : label;
}

/** The first lines of the tile, or what it shows. */
function tilePreview({ m, format }: I18n, tile: ProjectionTile): string {
  const t = m.project.controller;
  if (tile.slide.kind === "title") return tile.slide.title;
  if (tile.slide.kind === "blank")
    return tile.slide.caption
      ? format(t.captionPreview, { caption: tile.slide.caption })
      : t.blankPreview;
  if (tile.slide.kind === "image") return tile.label ?? "";
  if (tile.slide.kind === "scripture")
    return tile.slide.verses.map((verse) => verse.text).join(" ");
  if (tile.slide.kind === "announcements")
    return tile.slide.entries.map((entry) => entry.title).join(" / ");
  if (tile.slide.kind === "announcement")
    return [tile.slide.when, ...tile.slide.details].filter(Boolean).join(" / ") || tile.slide.title;
  if (tile.slide.kind === "qr") return tile.slide.caption ?? tile.slide.text;
  if (tile.slide.kind === "text")
    return [...tile.slide.paragraphs, ...tile.slide.highlight].flat().join(" / ");
  return tile.slide.paragraphs.flat().join(" / ") || t.noTextPreview;
}

/** The slides that the tiles show as small slides: the images, and the announcements, which have a layout of their own. */
function hasThumbnail(slide: ProjectionSlide): boolean {
  return (
    slide.kind === "image" ||
    slide.kind === "announcements" ||
    slide.kind === "announcement" ||
    slide.kind === "qr"
  );
}

/** The image of an image tile: of an image item by its id, or a page of the attachment of an announcement (see `ProjectionTile.id`). */
function tileImage(
  source: ProjectionSource | undefined,
  tile: ProjectionTile,
): EventImageDTO | undefined {
  if (source?.kind === "images") return source.images.find((candidate) => candidate.id === tile.id);
  if (source?.kind !== "announcements" || tile.slide.kind !== "image") return undefined;
  const [entryId, page] = tile.id.split(".");
  return source.own.find((entry) => entry.id === entryId)?.images[Number(page) - 1];
}

function isTextField(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * A key for the slides in an empty text field, e.g. the quick add box, which
 * has the focus when the controller opens: → ← Space PageDown PageUp. Not ↓ ↑:
 * they open the suggestions.
 */
function isEmptyFieldKey(event: KeyboardEvent) {
  return (
    event.target instanceof HTMLInputElement &&
    event.target.value === "" &&
    ["ArrowRight", "ArrowLeft", " ", "PageDown", "PageUp"].includes(event.key)
  );
}

/**
 * On a control of the items editor, e.g. its remove button: the keys there are
 * for the control, so that Space does not show the next slide on the screens.
 */
function isInItemsEditor(target: EventTarget | null) {
  return target instanceof Element && target.closest("[data-items-editor]") !== null;
}

/**
 * In a dialog, a popover or a menu, e.g. the screen picker: the keys there are
 * not for the slides. A dialog with `data-projection-keys` gives them to the
 * slides, e.g. the Bible panel on a narrow window.
 */
function isInDialog(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest(
      '[role="dialog"]:not([data-projection-keys]), [role="alertdialog"], [role="menu"]',
    ) !== null
  );
}

/** An open screen or stream overlay. `local`: a window of this browser, which the controller can close. */
type OpenWindow<T> = { info: T; seenAt: number; local: boolean };

/**
 * The open windows of one kind (the screens or the stream overlays), by id.
 * It forgets a window that has not told it is open for `SCREEN_TIMEOUT_MS`,
 * e.g. after a crash or a lost network.
 */
function useOpenWindows<T extends { id: string }>() {
  const [windows, setWindows] = useState<Map<string, OpenWindow<T>>>(new Map());
  const windowsRef = useRef(windows);

  function update(change: (current: Map<string, OpenWindow<T>>) => Map<string, OpenWindow<T>>) {
    windowsRef.current = change(windowsRef.current);
    setWindows(windowsRef.current);
  }

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const stale = [...windowsRef.current.values()].some(
        ({ seenAt }) => now - seenAt > SCREEN_TIMEOUT_MS,
      );
      if (!stale) return;
      windowsRef.current = new Map(
        [...windowsRef.current].filter(([, { seenAt }]) => now - seenAt <= SCREEN_TIMEOUT_MS),
      );
      setWindows(windowsRef.current);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  return {
    windows: [...windows.values()],
    /** A window tells that it is open. True for a window that was not known: it opened or reloaded. */
    seen(info: T, local: boolean): boolean {
      const known = windowsRef.current.get(info.id);
      // The same message can come on both channels: a window of this browser stays local.
      const isLocal = local || (known?.local ?? false);
      update((current) =>
        new Map(current).set(info.id, { info, seenAt: Date.now(), local: isLocal }),
      );
      return !known;
    },
    closed(id: string) {
      update((current) => {
        const next = new Map(current);
        next.delete(id);
        return next;
      });
    },
    forgetLocal() {
      update((current) => new Map([...current].filter(([, entry]) => !entry.local)));
    },
  };
}

/**
 * The state of the screens, the open screens and stream overlays, and
 * `publish`. The controller keeps the newest state that any device sent, so
 * two controllers show the same. It asks for the state when it opens, and
 * gives it to each new screen and overlay.
 * `onCommand` gets the commands of the screens that show the state of this
 * controller.
 */
function useProjection(
  config: ProjectionChannelConfig,
  onCommand: (command: ProjectionCommand) => void,
  onThemes: () => void,
  onImages: () => void,
) {
  const [state, setState] = useState<ProjectionState | null>(null);
  const stateRef = useRef<ProjectionState | null>(null);
  const screens = useOpenWindows<ScreenInfo>();
  const overlays = useOpenWindows<OverlayInfo>();

  function receive(incoming: ProjectionState) {
    const next = newerProjectionState(stateRef.current, incoming);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
  }

  function sendState() {
    if (stateRef.current) channel.send(PROJECTION_STATE_EVENT, stateRef.current);
  }

  const channel = useProjectionChannel(config, {
    onMessage(event, payload, { local }) {
      if (event === "state") {
        const incoming = parseProjectionState(payload);
        if (incoming) receive(incoming);
      } else if (event === "sync") {
        // Another controller opened. Also without a screen, it gets the state.
        sendState();
      } else if (event === "themes") {
        onThemes();
      } else if (event === "images") {
        onImages();
      } else if (event === "command") {
        const message = parseProjectionCommand(payload);
        // Only once: after the command, the state of this controller is newer (see `baseSeq`).
        if (message && message.baseSeq === (stateRef.current?.seq ?? null))
          onCommand(message.command);
      } else if (event === "screen") {
        const info = parseScreenInfo(payload);
        // A screen that opens or reloads shows the slide at once.
        if (info && screens.seen(info, local)) sendState();
      } else if (event === "screen-closed") {
        const info = parseScreenInfo(payload);
        if (info) screens.closed(info.id);
      } else if (event === "overlay") {
        const info = parseOverlayInfo(payload);
        if (info && overlays.seen(info, local)) sendState();
      } else if (event === "overlay-closed") {
        const info = parseOverlayInfo(payload);
        if (info) overlays.closed(info.id);
      }
    },
    // Also after a lost connection: the screens on other devices did not get the slides of that time.
    onConnected: () => {
      channel.send(PROJECTION_SYNC_EVENT, {});
      sendState();
    },
  });

  // The windows of this browser answer at once.
  const { send, sendLocal } = channel;
  useEffect(() => send(PROJECTION_SYNC_EVENT, {}), [send]);

  return {
    state,
    status: channel.status,
    screens: screens.windows.map(({ info }) => info),
    localScreenCount: screens.windows.filter((screen) => screen.local).length,
    /** The stream overlays on all devices. They do not change the split of the slides. */
    overlayCount: overlays.windows.length,
    /** Closes the screens that are windows of this browser. Not the screens on other devices. */
    closeLocalScreens() {
      sendLocal(PROJECTION_CLOSE_EVENT, {});
      screens.forgetLocal();
    },
    /** Tells the other controllers that a theme changed (see `PROJECTION_THEMES_EVENT`). */
    notifyThemes() {
      send(PROJECTION_THEMES_EVENT, {});
    },
    /** Tells the other controllers that an image changed (see `PROJECTION_IMAGES_EVENT`). */
    notifyImages() {
      send(PROJECTION_IMAGES_EVENT, {});
    },
    /** Shows a new state on all screens and controllers. */
    publish(update: Omit<ProjectionState, "seq">) {
      const next = { ...update, seq: nextSeq(stateRef.current, Date.now()) };
      stateRef.current = next;
      setState(next);
      send(PROJECTION_STATE_EVENT, next);
    },
  };
}

/** A row of the screen settings of the controller: a label and a control, in the columns of the grid from `@xl`. */
const SETTING_ROW = "flex items-center gap-x-3 @xl:col-span-2 @xl:grid @xl:grid-cols-subgrid";

/** A select of a projection theme. "" is the theme of the level above (`noneLabel`). */
function ThemeSelect({
  label,
  ariaLabel,
  themes,
  value,
  noneLabel,
  onChange,
  className,
  selectClassName = "w-auto max-w-48",
}: {
  label: string;
  ariaLabel?: string;
  themes: ProjectionThemeDTO[];
  value: string | null;
  noneLabel: string;
  onChange: (themeId: string | null) => void;
  className?: string;
  selectClassName?: string;
}) {
  return (
    <label className={cn("flex items-center gap-2 text-sm text-muted", className)}>
      <span className="whitespace-nowrap">{label}</span>
      <NativeSelect
        aria-label={ariaLabel}
        // A deleted theme shows as the level above.
        value={themes.some((theme) => theme.id === value) ? (value ?? "") : ""}
        onChange={(event) => onChange(event.target.value || null)}
        className={selectClassName}
      >
        <option value="">{noneLabel}</option>
        {themes.map((theme) => (
          <option key={theme.id} value={theme.id}>
            {theme.name}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}

/** The theme of the arrangement of a song, null for none. */
function arrangementThemeId(source: ProjectionSource | undefined): string | null {
  return source?.kind === "song" ? (source.arrangementThemeId ?? null) : null;
}

/** The theme of the item itself, null for the theme of the arrangement or of the event: a change on a controller wins over the loaded one. */
function itemThemeId(
  themes: ProjectionThemeChoice,
  source: ProjectionSource | undefined,
): string | null {
  if (!source) return null;
  return Object.hasOwn(themes.itemThemeIds, source.key)
    ? (themes.itemThemeIds[source.key] ?? null)
    : (source.themeId ?? null);
}

/**
 * The image of the next slide, and its background image when it is new on
 * the screens. The screens show the background of the theme under an image
 * slide too (the image can cover it), so only the looks count.
 */
function nextImages(
  current: ProjectionLook,
  following: Entry,
): Pick<ProjectionState, "preload" | "preloadImage"> {
  const { slide } = following.tile;
  const image = following.item.look.background.image;
  return {
    preload: image && image !== current.background.image ? image : null,
    preloadImage: slide.kind === "image" ? slide.url : null,
  };
}

const NO_PRELOAD = { preload: null, preloadImage: null } satisfies Pick<
  ProjectionState,
  "preload" | "preloadImage"
>;

/** The arrow keys on a drag handle: one place back or on, in a row and in a column. */
const MOVE_KEYS: Record<string, -1 | 1> = {
  ArrowUp: -1,
  ArrowLeft: -1,
  ArrowDown: 1,
  ArrowRight: 1,
};

/** The items in the order of `keys`, e.g. during a drag. An item without a place in it, e.g. a new one, at the end. */
function inOrder(items: ProjectionItem[], keys: string[] | null): ProjectionItem[] {
  if (!keys) return items;
  const index = new Map(keys.map((key, i) => [key, i]));
  return [...items].sort(
    (a, b) => (index.get(a.key) ?? keys.length) - (index.get(b.key) ?? keys.length),
  );
}

const RATIOS = { "16:9": 16 / 9, "16:10": 16 / 10, "4:3": 4 / 3 };
type RatioSetting = "auto" | keyof typeof RATIOS;

/** E.g. "16:9" for the ratio of a known shape, else "1.85:1". */
function ratioName(ratio: number): string {
  const known = Object.entries(RATIOS).find(([, value]) => Math.abs(value - ratio) < 0.02);
  return known ? known[0] : `${ratio.toFixed(2)}:1`;
}

// The quick items of each projection, for this tab only: `sessionStorage`.
const quickItemStores = new Map<string, ReturnType<typeof createStoredString>>();

function useQuickItems(eventId: string | null): [QuickItem[], (items: QuickItem[]) => void] {
  const key = `projection-quick-items:${eventId ?? "rehearsal"}`;
  let store = quickItemStores.get(key);
  if (!store) {
    store = createStoredString(key, "session");
    quickItemStores.set(key, store);
  }
  const value = store.useValue();
  const items = useMemo(() => parseQuickItems(value), [value]);
  const { set } = store;
  return [items, (next) => set(next.length > 0 ? JSON.stringify(next) : null)];
}

// The shape of the screens for the split of long sections, on this device.
const ratioStore = createStoredString("projection-aspect-ratio");

function useAspectRatioSetting(): [RatioSetting, (setting: RatioSetting) => void] {
  const value = ratioStore.useValue();
  const setting = value && Object.hasOwn(RATIOS, value) ? (value as RatioSetting) : "auto";
  return [setting, (next) => ratioStore.set(next === "auto" ? null : next)];
}

// The parts of the lyrics on the stream overlay (see `streamParts`): the
// setting of this device for a new projection. Then the state keeps it.
const streamLinesStore = createStoredString("projection-stream-lines");

function useStreamLinesSetting(): [boolean, (on: boolean) => void] {
  const on = streamLinesStore.useValue() === "on";
  return [on, (next) => streamLinesStore.set(next ? "on" : null)];
}

// The roll view of the verses (see `scriptureRollSlide`): the setting of this
// device for a new projection, and its text size, also while it is off. Then
// the state keeps it.
const scriptureRollStore = createStoredString("projection-scripture-roll");
const scriptureRollSizeStore = createStoredString("projection-scripture-roll-size");

type RollSetting = { on: boolean; size: number };

function useScriptureRollSetting(): [RollSetting, (setting: RollSetting) => void] {
  const on = scriptureRollStore.useValue() === "on";
  const stored = Number(scriptureRollSizeStore.useValue());
  const size = ROLL_TEXT_SIZES.some((step) => step === stored) ? stored : ROLL_TEXT_SIZE_DEFAULT;
  return [
    { on, size },
    (next) => {
      scriptureRollStore.set(next.on ? "on" : null);
      scriptureRollSizeStore.set(next.size === ROLL_TEXT_SIZE_DEFAULT ? null : `${next.size}`);
    },
  ];
}
