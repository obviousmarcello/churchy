"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Drawer } from "@base-ui/react/drawer";
import { Popover } from "@base-ui/react/popover";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CrownIcon,
  FileMusicIcon,
  GuitarIcon,
  MaximizeIcon,
  MinimizeIcon,
  MinusIcon,
  PanelLeftCloseIcon,
  PanelLeftIcon,
  PenLineIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  PrinterIcon,
  Settings2Icon,
  SquareIcon,
  XIcon,
  RadioIcon,
} from "lucide-react";

import { useModule } from "@/components/music/app-config";
import { NoteNamesSelect, useNoteNames } from "@/components/music/note-names";
import { invalidatePageCache, invalidatePageCacheExcept } from "@/components/music/page-cache";
import { Button, buttonVariants } from "@/components/music/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { useI18n } from "@/i18n/music/client";
import type { I18n } from "@/i18n/music/i18n";
import { rich } from "@/i18n/music/rich";
import { useBrowserValue, useMediaQuery, useRootFontPx } from "@/lib/music/browser";
import { useFullscreen, useWakeLock } from "@/lib/music/screen";
import { useDeviceType } from "@/lib/music/device-type";
import { parseChordPro, type ChordProDocument } from "@/lib/music/chordpro";
import { CAPO_MAX, chartCapo, chartWithCapo } from "@/lib/music/chords/capo";
import { canonicalKey, chartInKey, parseKey } from "@/lib/music/chords/key";
import {
  chartInNotation,
  chartNotation,
  chartToEnglish,
  fromEnglish,
  toEnglish,
  type Notation,
} from "@/lib/music/chords/notation";
import { songChords } from "@/lib/music/chords/song-chords";
import { FIT_VIEW, isFitView, type FileView } from "@/lib/music/file-view";
import { changedPages } from "@/lib/music/page-keys";
import { zoomStep } from "@/lib/music/pinch-zoom";
import { scoreTranspose, shownScoreKey } from "@/lib/music/score/score-interval";
import { isInKey, sheetContent } from "@/lib/music/sheet-content";
import type { SheetMark } from "@/lib/music/sheet-marks";
import {
  parseSheetPlace,
  placeAnchor,
  sheetPlaceStore,
  storedSheetPlace,
} from "@/lib/music/sheet-place";
import {
  isEmptyView,
  layoutValues,
  SHEET_BUTTON_SIZES,
  SHEET_MAX_PAGES,
  type DeviceType,
  type SheetContentChoice,
  type SheetView,
  type SongViews,
} from "@/lib/music/sheet-view";
import { swipeStep } from "@/lib/music/swipe";
import { cn } from "@/lib/music/utils";
import type { SongImageDTO } from "@/server/music/models/images";
import type { SongLinkDTO } from "@/server/music/models/links";
import type { SongPdfDTO } from "@/server/music/models/pdfs";
import type { SongScoreDTO } from "@/server/music/models/scores";
import type { SongSoundFileDTO } from "@/server/music/models/sound-files";
import { setCapoAction, setKeyAction, setViewAction, type CapoResult } from "./capo-actions";
import { ChordSheet, sheetBlocks } from "./chord-sheet";
import { Choice } from "./choice";
import { FileZoomSetting } from "./file-zoom-setting";
import { KeyButton, KeySetting, type SlotKind, type SongKeys } from "./key-setting";
import { LiveControl } from "./live-control";
import { useLiveSession, type LiveSessionProps } from "./live-session";
import { StartLiveControl, type StartLive } from "./start-live-control";
import { MetronomeControl, useMetronome } from "./metronome-control";
import { PRINT_FONT_PX, PrintButton, PrintImage, PrintSheet } from "./print-sheet";
import { RehearsalPanel, type RehearsalSong, type ScorePlayback } from "./rehearsal-panel";
import { useScorePlayer, type PlayableTimeline } from "./score-player";
import { PrintScore, ScoreView } from "./score-view";
import { SheetImage } from "./sheet-image";
import { MarkError, MarkingLayer, MarkToolbar, MarksLayer, useSheetMarks } from "./sheet-marks";
import { SheetMoreMenu, type MoreMenuItem, type PopoverControl } from "./sheet-more-menu";
import { PrintPdf, SheetPdf } from "./sheet-pdf";
import { SheetScreenContext } from "./sheet-room";
import { ContentIcon, contentName, SongViewButton } from "./song-view-button";
import { saveTempoAction } from "./capo-actions";
import { useTextZoom } from "./text-zoom";
import { setFileViewAction } from "./capo-actions";
import {
  SHEET_BASE_FONT_PX,
  SHEET_MIN_PAGE_EM,
  updateSheetSettings,
  useSheetSettings,
  type SheetSettings,
} from "./sheet-settings";

/**
 * One song of the sheet: an arrangement's chart with the song's title. In an
 * event it can also be a text item, e.g. a prayer, a scripture reading or a
 * text slide: a title, its kind under it, its texts and notes, with an empty chart.
 */
export type SheetSong = {
  kind: "song" | "text";
  /** The arrangement, or the setlist slot in an event. */
  id: string;
  /** Null for a text item. */
  arrangementId: string | null;
  title: string;
  /** The song's artist. Null to use the chart's `{subtitle}` or `{artist}`. */
  artist: string | null;
  /** The key of the chart in English note names, e.g. "G", "Bb" or "F#m". */
  key: string | null;
  /** The other keys of the chart, in English note names. */
  otherKeys: string[];
  /** The key of the event slot or the rehearsal, in English note names. Null: the key of the chart. */
  slotKey: string | null;
  /** The user's own key for the arrangement, in English note names. Null: `slotKey` or the key of the chart. */
  ownKey: string | null;
  /** The metronome starts with this tempo. */
  bpm: number | null;
  /** For example "4/4" or "6/8". */
  timeSignature: string | null;
  /** For example ["72 BPM", "4/4"]. The key comes before them; the capo and `arrangementName` follow them. */
  details: string[];
  /** The user's own capo for the arrangement. Null to use the chart's `{capo}`. */
  capo: number | null;
  /** The user's own layout of the arrangement, by device type. Empty for a text item. */
  views: SongViews;
  /** Null for the song's default arrangement. */
  arrangementName: string | null;
  chordpro: string;
  /** Section labels in playing order. Empty means "as written". */
  sectionOrder: string[];
  /** The notes of a text item. Null for a song. */
  notes: string | null;
  /** The description and the highlighted text of a text slide. Null for the other items. */
  description: string | null;
  highlight: string | null;
  /** The translation of a scripture reading: the sheet shows its verses. Null for the other items. */
  scripture: string | null;
  /** The name of the volunteer of the event item. Null without one, and outside an event. */
  volunteer: string | null;
  /** The user's own marks on the arrangement. Empty for a text item. */
  marks: SheetMark[];
  /** The MusicXML scores of the song, by name. Empty for a text item. */
  scores: SongScoreDTO[];
  /** The PDF files of the arrangement, by name. Empty for a text item. */
  pdfs: SongPdfDTO[];
  /** The images of the arrangement, by name. Empty for a text item. */
  images: SongImageDTO[];
  /** The sound files of the arrangement, by name. Empty for a text item. */
  soundFiles: SongSoundFileDTO[];
  /** The links of the arrangement, by name. Empty for a text item. */
  links: SongLinkDTO[];
  /** The user's own zoom of the PDF files and the images, by id. A file without one shows the whole page. */
  fileViews: Record<string, FileView>;
};

/**
 * The changes with the saved value of an arrangement. `undefined` deletes the
 * change, so the value of the page data shows.
 */
function withSaved<Value>(
  changes: Record<string, Value>,
  arrangementId: string,
  saved: Value | undefined,
) {
  if (saved !== undefined) return { ...changes, [arrangementId]: saved };
  const rest = { ...changes };
  delete rest[arrangementId];
  return rest;
}

/** The song's own layout on this type of device: a change on this page, else the page data. Empty for a text item. */
function ownView(
  song: SheetSong,
  deviceType: DeviceType,
  changes: Record<string, SheetView>,
): SheetView {
  if (song.arrangementId === null) return {};
  if (song.arrangementId in changes) return changes[song.arrangementId]!;
  return song.views[deviceType] ?? {};
}

/** The array of the last render while its items stay the same (`Object.is`), for the dependencies of a memo. */
function useSameItems<Item>(items: Item[]): Item[] {
  const [kept, setKept] = useState(items);
  const same =
    kept.length === items.length && kept.every((item, index) => Object.is(item, items[index]));
  if (!same) setKept(items);
  return same ? kept : items;
}

/**
 * The saves of a setting of one arrangement. `saved` is the value that the
 * server has after a save on this page; before one, the value of the page
 * data is (`undefined`).
 */
type SaveQueue<Value> = { queue: Promise<void>; saved: Value | undefined; latest: number };

/**
 * Saves a change after the earlier changes of the arrangement, so the server
 * keeps the last change. After an error of the latest change, `onError` gets
 * the value that the server has. `failed`: the message when the save cannot
 * start, e.g. offline.
 */
function queueSave<Value>(
  queues: Record<string, SaveQueue<Value>>,
  arrangementId: string,
  value: Value,
  {
    save,
    failed,
    onSaved,
    onError,
  }: {
    save: () => Promise<CapoResult>;
    failed: string;
    onSaved: () => void;
    onError: (saved: Value | undefined, message: string) => void;
  },
) {
  const saves = (queues[arrangementId] ??= {
    queue: Promise.resolve(),
    saved: undefined,
    latest: 0,
  });
  const change = ++saves.latest;
  saves.queue = saves.queue.then(async () => {
    let message: string | null;
    try {
      const result = await save();
      message = result.status === "error" ? result.message : null;
    } catch {
      message = failed;
    }
    if (message === null) {
      saves.saved = value;
      onSaved();
      return;
    }
    // A later change shows its own result.
    if (change !== saves.latest) return;
    onError(saves.saved, message);
  });
}

/**
 * One or more charts as a full-screen chord sheet, e.g. all the songs of an
 * event. The sheet is cut into pages of the height of the screen, and
 * `settings.pagesOnScreen` of them show side by side (with `auto`, as many as
 * fit). Each song starts on a new screen, or with `settings.songStart: "page"`
 * on the next page.
 * Turn the pages with the arrow keys, Page Up and Page Down, Space (most
 * page-turner pedals send these keys), or a tap on the left or right side of
 * the sheet.
 */
export function SheetViewer({
  cacheKey,
  placeKey,
  isFresh,
  title,
  songs,
  backHref,
  slotKind = "rehearsal",
  startSongId,
  live: liveProps,
  startLive,
  canEditSongs = false,
}: {
  /** The key of the page in the page cache. A save of the user's own capo, key or marks updates its copy. */
  cacheKey: string;
  /** The sheet (`SheetPageData.viewerKey`): the tab keeps the user's place on it for a reload. */
  placeKey: string;
  /** False while `songs` is the browser copy. */
  isFresh: boolean;
  /** The song or the event. */
  title: string;
  songs: SheetSong[];
  backHref: string;
  /** Where the `slotKey` of the songs comes from. */
  slotKind?: SlotKind;
  /** The song that the sheet opens at, e.g. the setlist slot that a live session started from. Else the first one. */
  startSongId?: string;
  /** The running live session of the sheet. */
  live?: LiveSessionProps;
  /** Without `live`: how the user can start or join a live session. */
  startLive?: StartLive;
  /** Song admins and superadmins can save the tempo of the metronome to the arrangement. */
  canEditSongs?: boolean;
}) {
  const settings = useSheetSettings();
  const noteNames = useNoteNames();
  const i18n = useI18n();
  const { m, format } = i18n;
  // The capos and keys that the user changed on this page, by arrangement.
  // They show before the server saves them.
  const [capoChanges, setCapoChanges] = useState<Record<string, number | null>>({});
  const [capoError, setCapoError] = useState<{ arrangementId: string; message: string } | null>(
    null,
  );
  const [keyChanges, setKeyChanges] = useState<Record<string, string | null>>({});
  const [keyError, setKeyError] = useState<{ arrangementId: string; message: string } | null>(null);
  // The same for the layouts of the songs on this type of device: the song's whole own view.
  const deviceType = useDeviceType();
  const [viewChanges, setViewChanges] = useState<Record<string, SheetView>>({});
  const [viewError, setViewError] = useState<{ arrangementId: string; message: string } | null>(
    null,
  );
  // The own layout of each song. A setting that is not in it comes from the device.
  const songViews = useMemo(
    () => songs.map((song) => ownView(song, deviceType, viewChanges)),
    [songs, deviceType, viewChanges],
  );
  const songSettings = useMemo(
    () => songViews.map((view) => ({ ...settings, ...view })),
    [songViews, settings],
  );
  // The section order of each song: the only layout setting that changes the
  // charts. The same array until an order changes, so a change of the text size
  // does not build the charts again.
  const songOrders = useSameItems(songSettings.map((song) => song.order));
  // The same for the content that the user chose for each song (see `sheet-content.ts`).
  // A change of the layout keeps the object of the content.
  const songChoices = useSameItems(songViews.map((view) => view.content));

  /**
   * After a save of the user's own capo, key or marks: the copies of the other
   * sheets are old, so they go. The copy of this sheet gets the change, so it
   * stays for offline use.
   */
  function keepOwnChange(arrangementId: string, update: (song: SheetSong) => SheetSong) {
    invalidatePageCacheExcept<{ songs: SheetSong[] }>(changedPages.sheets(), cacheKey, (data) => ({
      ...data,
      songs: data.songs.map((song) => (song.arrangementId === arrangementId ? update(song) : song)),
    }));
  }

  // The user's own marks. In mark mode, a layer over the sheet takes the pen
  // or the finger, and a tap does not turn the page.
  const marks = useSheetMarks(songs, {
    isFresh,
    onSaved: (arrangementId, update) =>
      keepOwnChange(arrangementId, (song) => ({ ...song, marks: update(song.marks) })),
  });
  const [marking, setMarking] = useState(false);
  const showMarks = settings.showMarks || marking;
  // The text size follows the root font, e.g. a larger text that the user chose in the browser.
  const rootFontPx = useRootFontPx();
  const sizePercent = (size: number) => (size * rootFontPx) / SHEET_BASE_FONT_PX;
  // The size of the text: of the device, and of each song.
  const emPx = (rootFontPx * settings.size) / 100;
  const songEmPx = songSettings.map((song) => (rootFontPx * song.size) / 100);

  // A live session. The users who follow see the leader's song and section,
  // on the page where it is on their screen. All users see the leader's keys.
  const live = useLiveSession(liveProps ?? null);
  const liveOn = live.active && (live.status === "connecting" || live.status === "live");
  // The same object until the keys change: the leader sends the state every few seconds.
  const liveKeysText = liveOn ? JSON.stringify(live.state?.keys ?? {}) : "{}";
  const liveKeys = useMemo(
    () => JSON.parse(liveKeysText) as Record<string, string>,
    [liveKeysText],
  );

  const charts = useMemo(
    () =>
      songs.map((song, index) => {
        // In English note names, so the keys and the capo can move the chords.
        const written = chartToEnglish(parseChordPro(song.chordpro), chartNotation(song.chordpro));
        const writtenCapo = chartCapo(written);
        const ownCapo =
          song.arrangementId !== null && song.arrangementId in capoChanges
            ? (capoChanges[song.arrangementId] ?? null)
            : song.capo;
        const capo = ownCapo ?? writtenCapo;
        const ownKey =
          song.arrangementId !== null && song.arrangementId in keyChanges
            ? (keyChanges[song.arrangementId] ?? null)
            : song.ownKey;
        const liveKey = liveKeys[song.id] ?? null;
        // A key that the chart cannot move to (e.g. minor for a major chart) leaves the chart as written.
        const inKey = chartInKey(written, liveKey ?? ownKey ?? song.slotKey);
        const writtenKey = written.meta.key ?? null;
        const keys: SongKeys | null =
          song.kind === "song" && writtenKey && parseKey(writtenKey)
            ? {
                written: writtenKey,
                others: song.otherKeys,
                slot: song.slotKey,
                own: ownKey,
                live: liveKey,
                shown: inKey.meta.key ?? writtenKey,
              }
            : null;
        // The chords are the shapes for the user's capo, in the user's note names.
        const chart = chartWithCapo(inKey, capo);
        const blocks = sheetBlocks(
          chartInNotation(chart, noteNames),
          song.sectionOrder,
          songOrders[index]!,
        );
        // What the sheet shows of the song: the chords, a score, a PDF file or an image.
        const shownKey = keys?.shown ?? null;
        const content =
          song.kind === "song"
            ? sheetContent({
                choice: songChoices[index],
                scoreName: settings.scoreName,
                hasChords: blocks.length > 0,
                scores: song.scores,
                pdfs: song.pdfs,
                images: song.images,
                shownKey,
              })
            : ({ kind: "chords" } as const);
        // A score moves to the key of the chords, without the capo.
        const score = content.kind === "score" ? content.score : null;
        const file =
          content.kind === "pdf" ? content.pdf : content.kind === "image" ? content.image : null;
        return {
          song,
          chart,
          ...sheetHeader(i18n, song, chart, capo, noteNames),
          content,
          score: score && {
            score,
            transpose: keys ? scoreTranspose(score.key, keys.written, keys.shown) : null,
            details: scoreDetails(i18n, song, score, shownScoreKey(score.key, shownKey), noteNames),
          },
          fileDetails: file && fileDetails(i18n, song, file, shownKey, noteNames),
          capo: capo || null,
          ownCapo,
          chartCapo: writtenCapo,
          keys,
          blocks,
          // In English note names, for the shapes of the rehearsal panel.
          chords: songChords(blocks).map((chord) => toEnglish(chord, noteNames)),
        };
      }),
    [
      i18n,
      songs,
      songOrders,
      songChoices,
      settings.scoreName,
      capoChanges,
      keyChanges,
      liveKeys,
      noteNames,
    ],
  );
  // Marks go on the lines of the chords. A song that shows a score, a PDF file or an image has none.
  // No marks while the module "sheet.marks" is off.
  const marksOn = useModule("sheet.marks");
  const canMark =
    marksOn &&
    charts.some(
      ({ song, content }) =>
        song.kind === "song" && song.arrangementId !== null && content.kind === "chords",
    );
  // E.g. the last chord sheet changes to a score: a stroke now has no line to go on.
  if (marking && !canMark) setMarking(false);

  const capoSaves = useRef<Record<string, SaveQueue<number | null>>>({});

  /** Shows the new capo at once and saves it. Null uses the chart's capo again. */
  function setCapo(arrangementId: string, capo: number | null) {
    setCapoError(null);
    setCapoChanges((changes) => ({ ...changes, [arrangementId]: capo }));
    queueSave(capoSaves.current, arrangementId, capo, {
      save: () => setCapoAction(arrangementId, capo),
      failed: m.sheet.capo.saveFailed,
      onSaved: () => keepOwnChange(arrangementId, (song) => ({ ...song, capo })),
      onError: (saved, message) => {
        // Back to the saved capo. Before a save, to the page data: it can be
        // fresher than when the change started (the browser copy, then fresh data).
        setCapoChanges((changes) => withSaved(changes, arrangementId, saved));
        setCapoError({ arrangementId, message });
      },
    });
  }

  // The same for the keys.
  const keySaves = useRef<Record<string, SaveQueue<string | null>>>({});

  /** Shows the new key at once and saves it. Null uses the key of the event or the chart again. */
  function setOwnKey(arrangementId: string, key: string | null) {
    setKeyError(null);
    setKeyChanges((changes) => ({ ...changes, [arrangementId]: key }));
    queueSave(keySaves.current, arrangementId, key, {
      save: () => setKeyAction(arrangementId, key),
      failed: m.sheet.key.saveFailed,
      onSaved: () => keepOwnChange(arrangementId, (song) => ({ ...song, ownKey: key })),
      onError: (saved, message) => {
        setKeyChanges((changes) => withSaved(changes, arrangementId, saved));
        setKeyError({ arrangementId, message });
      },
    });
  }

  // The same for the layouts of the songs on this type of device.
  const viewSaves = useRef<Record<string, SaveQueue<SheetView>>>({});

  /**
   * Shows the song's new layout at once and saves it. An empty view uses the
   * device's settings again. After the save, `deviceChanges` go to the
   * device's settings too: a failed save changes nothing.
   */
  function setView(arrangementId: string, view: SheetView, deviceChanges: SheetView = {}) {
    setViewError(null);
    setViewChanges((changes) => ({ ...changes, [arrangementId]: view }));
    queueSave(viewSaves.current, arrangementId, view, {
      save: () => setViewAction(arrangementId, deviceType, isEmptyView(view) ? null : view),
      failed: m.sheet.view.saveFailed,
      onSaved: () => {
        if (!isEmptyView(deviceChanges)) updateSheetSettings(deviceChanges);
        keepOwnChange(arrangementId, (song) => ({
          ...song,
          views: { ...song.views, [deviceType]: view },
        }));
      },
      onError: (saved, message) => {
        setViewChanges((changes) => withSaved(changes, arrangementId, saved));
        setViewError({ arrangementId, message });
      },
    });
  }

  /** Shows the song as the chords, a score, a PDF file or an image. It is not a setting of the device. */
  function setContent(index: number, content: SheetContentChoice) {
    const { arrangementId } = songs[index]!;
    if (arrangementId) setView(arrangementId, { ...songViews[index], content });
  }

  // The user's own zoom of the PDF files and the images, by file. It is not a
  // setting of the arrangement or of the device: a file has one zoom for the user.
  const [fileViewChanges, setFileViewChanges] = useState<Record<string, FileView>>({});
  const [fileViewError, setFileViewError] = useState<{ fileId: string; message: string } | null>(
    null,
  );
  const fileViewSaves = useRef<Record<string, SaveQueue<FileView>>>({});

  /** The zoom of a file of the song: a change on this page, else the page data. */
  function fileView(song: SheetSong, fileId: string): FileView {
    return fileViewChanges[fileId] ?? song.fileViews[fileId] ?? FIT_VIEW;
  }

  /** Shows the new zoom of a file at once and saves it. */
  function setFileView(kind: "pdf" | "image", fileId: string, view: FileView) {
    setFileViewError(null);
    setFileViewChanges((changes) => ({ ...changes, [fileId]: view }));
    queueSave(fileViewSaves.current, fileId, view, {
      save: () => setFileViewAction(kind, fileId, isFitView(view) ? null : view),
      failed: m.sheet.zoom.saveFailed,
      onSaved: () =>
        // The copies of the other sheets are old, so they go. The copy of this sheet gets the change.
        invalidatePageCacheExcept<{ songs: SheetSong[] }>(
          changedPages.sheets(),
          cacheKey,
          (data) => ({
            ...data,
            songs: data.songs.map((song) => {
              const files = [...song.pdfs, ...song.images];
              if (!files.some((file) => file.id === fileId)) return song;
              const fileViews = { ...song.fileViews };
              if (isFitView(view)) delete fileViews[fileId];
              else fileViews[fileId] = view;
              return { ...song, fileViews };
            }),
          }),
        ),
      onError: (saved, message) => {
        setFileViewChanges((changes) => withSaved(changes, fileId, saved));
        setFileViewError({ fileId, message });
      },
    });
  }

  /** The leader of a live session sets the key for everyone. Else it is the user's own key. */
  function changeKey(index: number, key: string | null) {
    const { song } = charts[index]!;
    // The other devices take only the usual names, e.g. "Am" for "Amin".
    if (liveOn && live.isLeader) live.setKey(song.id, key === null ? null : canonicalKey(key));
    else if (song.arrangementId) setOwnKey(song.arrangementId, key);
  }

  function keySetting(index: number) {
    const { song, keys } = charts[index]!;
    if (!keys) return null;
    return (
      <KeySetting
        // Another song starts without the error of the previous one.
        key={song.id}
        title={
          songs.length > 1
            ? format(m.sheet.key.titleOfSong, { song: song.title })
            : m.sheet.key.title
        }
        keys={keys}
        slotKind={slotKind}
        isLeader={liveOn && live.isLeader}
        notation={noteNames}
        error={keyError?.arrangementId === song.arrangementId ? keyError!.message : null}
        onChange={(key) => changeKey(index, key)}
      />
    );
  }

  // Docking needs room: on small screens the table of contents always opens over the sheet.
  const isWide = useMediaQuery(WIDE_QUERY);
  const docked = settings.dockContents && isWide;
  const [overlayOpen, setOverlayOpen] = useState(false);
  const contentsOpen = songs.length > 1 && (docked ? settings.tableOfContents : overlayOpen);

  function setContentsOpen(open: boolean) {
    if (docked) updateSheetSettings({ tableOfContents: open });
    else setOverlayOpen(open);
  }

  function setDocked(dock: boolean) {
    updateSheetSettings({ dockContents: dock, tableOfContents: dock });
    setOverlayOpen(false);
  }

  // Rehearsal mode docks at the right on wide screens. On small screens it
  // opens over the sheet, and does not stay open for the next visit.
  const [rehearsalOverlayOpen, setRehearsalOverlayOpen] = useState(false);
  // Without the chord diagrams (the module "sheet.chord-diagrams"), the panel only has the scores, the sound files and the links.
  const diagramsOn = useModule("sheet.chord-diagrams");
  const hasRehearsal =
    diagramsOn ||
    songs.some(
      (song) => song.scores.length > 0 || song.soundFiles.length > 0 || song.links.length > 0,
    );
  const rehearsalOpen = hasRehearsal && (isWide ? settings.rehearsal : rehearsalOverlayOpen);

  function setRehearsalOpen(open: boolean) {
    if (isWide) updateSheetSettings({ rehearsal: open });
    else setRehearsalOverlayOpen(open);
  }

  // On small screens and tablets some header buttons are in the "more" menu.
  // Their popovers then show at the menu's button.
  const hasHeaderRoom = useMediaQuery(HEADER_ROOM_QUERY);
  const [moreButton, setMoreButton] = useState<HTMLButtonElement | null>(null);
  const [headerPopover, setHeaderPopover] = useState<HeaderPopover | null>(null);

  function popoverControl(name: HeaderPopover): PopoverControl {
    return {
      open: headerPopover === name,
      onOpenChange: (open) => setHeaderPopover(open ? name : null),
      anchor: hasHeaderRoom ? undefined : moreButton,
    };
  }

  // The part of the sheet that shows. It clips the pages before and after the screen.
  const [screenElement, setScreenElement] = useState<HTMLDivElement | null>(null);
  // The pages in it, which scale during a pinch of the text (`text-zoom.ts`).
  const [zoomElement, setZoomElement] = useState<HTMLDivElement | null>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<(HTMLDivElement | null)[]>([]);
  const groupEndRefs = useRef<(HTMLDivElement | null)[]>([]);
  const songRefs = useRef<(HTMLElement | null)[]>([]);
  // The first page on the screen: a song, and a page from the start of that
  // song. It stays when the number of pages per screen or the song start changes.
  // After a reload, the place that the tab kept (the viewer mounts only in the browser, see `SheetView`).
  const [ownAnchor, setOwnAnchor] = useState(
    () =>
      placeAnchor(parseSheetPlace(sheetPlaceStore.get(), placeKey), songs) ?? {
        song: Math.max(
          songs.findIndex((song) => song.id === startSongId),
          0,
        ),
        page: 0,
      },
  );
  // The kept place is only for a reload: a link to the sheet later opens at its start.
  // React does not unmount the viewer when the page unloads.
  useEffect(() => () => sheetPlaceStore.set(null), [placeKey]);
  // New data can change the order of the songs (e.g. fresh data after the
  // browser copy): the anchor stays at its song.
  const [anchorSongs, setAnchorSongs] = useState(songs);
  if (songs !== anchorSongs) {
    setAnchorSongs(songs);
    const index = songs.findIndex((song) => song.id === anchorSongs[ownAnchor.song]?.id);
    if (index >= 0 && index !== ownAnchor.song) setOwnAnchor({ ...ownAnchor, song: index });
  }
  // Counts the new pages of the scores, PDF files and images: the sheet measures its pages again after each.
  const [fileLayouts, setFileLayouts] = useState(0);
  // The notes of the scores on the sheet, by song, and the voices that the user chose to play.
  const [scoreTimelines, setScoreTimelines] = useState<
    Record<string, { url: string; timeline: PlayableTimeline }>
  >({});
  // The notes of the scores that show now. The notes of the song's score before a change do not count.
  const shownTimelines: Record<string, PlayableTimeline> = Object.fromEntries(
    charts.flatMap(({ song, score }) => {
      const entry = scoreTimelines[song.id];
      return score && entry?.url === score.score.url ? [[song.id, entry.timeline]] : [];
    }),
  );
  const [scoreVoices, setScoreVoices] = useState<Record<string, string[]>>({});
  const player = useScorePlayer();
  const [layout, setLayout] = useState<Layout>({
    width: 0,
    gap: 0,
    groupPages: [],
    songPages: [],
    sections: [],
  });

  // The songs in groups. Each group starts on a new screen; in a group, each song starts on a new page.
  const groups = useMemo(
    () =>
      settings.songStart === "screen"
        ? songs.map((_, index) => [index])
        : [songs.map((_, index) => index)],
    [songs, settings.songStart],
  );
  // The pages side by side and the text size of each group. A group of one
  // song has the song's; the songs of a larger group share the pages, so it
  // has the device's pages, and with `auto` the pages fit the largest text of its songs.
  const groupFormats = useMemo(
    () =>
      groups.map((songIndexes) => {
        const pages =
          songIndexes.length === 1
            ? songSettings[songIndexes[0]!]!.pagesOnScreen
            : settings.pagesOnScreen;
        const sizes = songIndexes.map((index) => songSettings[index]!.size);
        const size = sizes.length > 0 ? Math.max(...sizes) : settings.size;
        return { pagesOnScreen: pages, emPx: (rootFontPx * size) / 100 };
      }),
    [groups, songSettings, settings, rootFontPx],
  );
  // A new width can change the number of columns of a group (with `auto`).
  // The columns element keeps its size, so the sheet measures again after this change.
  const columnCounts = groupFormats
    .map((format) => pagesOnScreen(format, layout.width, layout.gap))
    .join(" ");

  // Each group is a multi-column layout, and its columns are the pages. The
  // ones that do not fit on the screen overflow to the right. The page of an
  // element is the column it is in.
  useLayoutEffect(() => {
    const columns = columnsRef.current;
    if (!columns) return;

    function measure() {
      const groupElements = groupRefs.current.slice(0, groups.length);
      if (!columns || !groupElements[0]) return;
      const width = columns.clientWidth;
      const gap = parseFloat(getComputedStyle(groupElements[0]).columnGap) || 0;
      // The page of an element in its group, and the group of a song.
      const pageOf = (element: Element | null | undefined, groupIndex: number) => {
        const group = groupElements[groupIndex];
        if (!element || !group) return 0;
        const pageWidth = groupPageWidth(groupFormats[groupIndex]!, width, gap);
        return Math.floor(
          (element.getBoundingClientRect().left - group.getBoundingClientRect().left + 1) /
            pageWidth,
        );
      };
      const groupOf = (song: number) => (groups.length > 1 ? song : 0);

      const next: Layout = {
        width,
        gap,
        groupPages: groupElements.map((_, index) =>
          Math.max(1, pageOf(groupEndRefs.current[index], index) + 1),
        ),
        songPages: songRefs.current
          .slice(0, songs.length)
          .map((element, index) => pageOf(element, groupOf(index))),
        // The sections that `ChordSheet` names, for the leader's place in a live session.
        sections: songRefs.current.slice(0, songs.length).flatMap((element, index) =>
          Array.from(
            element?.querySelectorAll<HTMLElement>("[data-live-anchor]") ?? [],
            (section) => ({
              song: index,
              name: section.dataset.liveAnchor ?? "",
              page: pageOf(section, groupOf(index)),
            }),
          ),
        ),
      };
      setLayout((current) => (sameLayout(current, next) ? current : next));
    }

    measure();
    let active = true;
    document.fonts.ready.then(() => {
      if (active) measure();
    });
    const observer = new ResizeObserver(measure);
    observer.observe(columns);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [charts, songSettings, groupFormats, groups, songs.length, fileLayouts, columnCounts]);

  const leaderPosition = liveOn && !live.isLeader ? (live.state?.position ?? null) : null;
  const leaderSong = leaderPosition
    ? songs.findIndex((song) => song.id === leaderPosition.songId)
    : -1;
  const leaderAnchor =
    leaderPosition && leaderSong >= 0
      ? { song: leaderSong, page: sectionPage(layout, leaderSong, leaderPosition.section) }
      : null;
  const followsLeader = live.following && leaderAnchor !== null;
  const anchor = followsLeader ? leaderAnchor : ownAnchor;
  // The place that shows, also the leader's: a reload opens where the user was.
  const anchorSongId = songs[anchor.song]?.id;
  useEffect(() => {
    if (anchorSongId)
      sheetPlaceStore.set(storedSheetPlace(placeKey, { songId: anchorSongId, page: anchor.page }));
  }, [placeKey, anchorSongId, anchor.page]);

  /** A page turn or a song change of the user. It stops the follow of the leader. */
  function setAnchor(next: { song: number; page: number }) {
    if (followsLeader) live.setFollowing(false);
    setOwnAnchor(next);
  }

  // Each group has its own number of pages on a screen. The last screen of a group can have empty places.
  const groupPagesOnScreen = groupFormats.map((format) =>
    pagesOnScreen(format, layout.width, layout.gap),
  );
  const groupPages = groups.map((_, index) => layout.groupPages[index] ?? 1);
  const groupScreens = groupPages.map((count, index) =>
    Math.ceil(count / groupPagesOnScreen[index]!),
  );
  const groupFirstScreens = groupScreens.map((_, index) => sum(groupScreens.slice(0, index)));
  // The pages count from the first page of the sheet, without the empty places.
  const groupFirstPages = groupPages.map((_, index) => sum(groupPages.slice(0, index)));
  const screenCount = sum(groupScreens);
  const anchorSong = Math.min(anchor.song, songs.length - 1);
  const anchorGroup = groups.length > 1 ? anchorSong : 0;
  // The page in its group. A song can become shorter, e.g. with a smaller text size.
  const anchorPage = Math.min(
    (layout.songPages[anchorSong] ?? 0) + anchor.page,
    groupPages[anchorGroup]! - 1,
  );
  const screen = Math.min(
    groupFirstScreens[anchorGroup]! + Math.floor(anchorPage / groupPagesOnScreen[anchorGroup]!),
    screenCount - 1,
  );
  const group = groupFirstScreens.findLastIndex((groupScreen) => groupScreen <= screen);
  const pages = groupPagesOnScreen[group];
  // The first and the last page on the screen, in the group and in the sheet.
  const firstInGroup = (screen - groupFirstScreens[group]!) * pages!;
  const lastInGroup = Math.min(firstInGroup + pages!, groupPages[group]!) - 1;
  const first = groupFirstPages[group]! + firstInGroup;
  const last = groupFirstPages[group]! + lastInGroup;
  const pageCount = sum(groupPages);
  // The first page of each song in the sheet.
  const songPages = songs.map(
    (_, index) => (layout.songPages[index] ?? 0) + groupFirstPages[groups.length > 1 ? index : 0]!,
  );
  // The song at the top of the first page on the screen.
  const currentIndex = songs.length > 1 ? songPages.findLastIndex((page) => page <= first) : -1;
  const currentSong = songs[currentIndex] as SheetSong | undefined;
  // The capo and key settings are for the only song, or the song at the top of the screen.
  const capoIndex = songs.length === 1 ? 0 : currentIndex;
  const capoChart = charts[capoIndex] as (typeof charts)[number] | undefined;
  // The same song has the layout settings. A song of a group with several
  // songs shares the pages side by side: they are the device's.
  const viewIndex = Math.max(capoIndex, 0);
  const viewSong = songs[viewIndex];
  const sharedPages = groups[groups.length > 1 ? viewIndex : 0]!.length > 1;

  /**
   * A change of the layout of the song. The device's settings change too
   * (after the save), so the songs without their own settings use the latest ones.
   */
  function changeSongView(index: number, changes: SheetView) {
    const { arrangementId } = songs[index]!;
    if (arrangementId) setView(arrangementId, { ...songViews[index], ...changes }, changes);
    else updateSheetSettings(changes);
  }
  const changeView = (changes: SheetView) => changeSongView(viewIndex, changes);
  // A pinch on the chords of a song changes its text size, like the buttons of the settings.
  // Between the songs, the pinch is for the song of the settings.
  useTextZoom(screenElement, zoomElement, {
    sizes: songSettings.map((song) => song.size),
    songAt(target) {
      const index = songRefs.current
        .slice(0, songs.length)
        .findIndex((element) => element?.contains(target));
      const song = index >= 0 ? index : viewIndex;
      return charts[song]!.content.kind === "chords" ? song : -1;
    },
    enabled: !marking,
    onSize: (song, size) => changeSongView(song, { size }),
  });
  const metronomeOn = useModule("sheet.metronome");
  const metronomeSong = songs.length === 1 ? songs[0] : currentSong;
  const metronome = useMetronome(
    metronomeSong,
    liveOn
      ? {
          grid: live.state?.grid ?? null,
          clock: live.clock,
          isLeader: live.isLeader,
          setGrid: live.setGrid,
        }
      : undefined,
  );
  const tempoArrangementId = canEditSongs ? metronomeSong?.arrangementId : null;
  const saveTempo = tempoArrangementId
    ? (bpm: number) => {
        // The other pages that show the tempo.
        invalidatePageCache(changedPages.songs());
        return saveTempoAction(tempoArrangementId, bpm);
      }
    : undefined;

  // The leader sends its place: the song and the section at the top of the screen.
  const topSong = songs.length > 1 ? Math.max(currentIndex, 0) : 0;
  const topSection =
    layout.sections
      .filter((section) => section.song === topSong && section.page <= firstInGroup)
      .at(-1)?.name ?? null;
  const topSongId = songs[topSong]?.id ?? null;
  // For a projection: its slides follow the section order (see `tileOfAnchor`).
  const topWritten =
    songOrders[topSong] === "written" && (songs[topSong]?.sectionOrder.length ?? 0) > 0;
  const { isLeader, status: liveStatus, setPosition } = live;
  useEffect(() => {
    if (isLeader && liveStatus === "live" && topSongId) {
      setPosition({ songId: topSongId, section: topSection, written: topWritten });
    }
  }, [isLeader, liveStatus, setPosition, topSongId, topSection, topWritten]);

  // On the screen of a user who follows, the leader's section lights up for a moment.
  const followedSection = followsLeader ? leaderPosition?.section : null;
  useEffect(() => {
    if (!followedSection || leaderSong < 0) return;
    const element = songRefs.current[leaderSong]?.querySelector(
      `[data-live-anchor="${CSS.escape(followedSection)}"]`,
    );
    const animation = element?.animate(
      [
        { backgroundColor: "color-mix(in oklab, var(--c-primary) 20%, transparent)" },
        { backgroundColor: "transparent" },
      ],
      { duration: 1500, easing: "ease-out" },
    );
    return () => animation?.cancel();
  }, [followedSection, leaderSong]);
  // The songs with a page on the screen. Text items have no chords.
  const rehearsalSongs: RehearsalSong[] = charts
    .filter(
      ({ song }, index) =>
        song.kind === "song" &&
        songPages[index]! <= last &&
        (songPages[index + 1] ?? Infinity) > first,
    )
    .map(({ song, chords, capo, score }) => ({
      id: song.id,
      title: song.title,
      chords,
      capo,
      hasScores: song.scores.length > 0,
      score: score && { name: score.score.name, notes: shownTimelines[song.id]?.notes ?? null },
      soundFiles: song.soundFiles,
      links: song.links,
    }));

  /** Plays the notes of the song's score, in the voices that the user chose. */
  /**
   * Plays the notes of the song's score, in the voices that the user chose.
   * `fromNote`: the id of the first note. While the metronome plays, on its beats.
   */
  function playScore(songId: string, fromNote?: string) {
    const timeline = shownTimelines[songId];
    if (!timeline) return;
    const from = fromNote ? timeline.notes.find((note) => note.id === fromNote) : null;
    // A note that does not sound alone, e.g. the end of a tie, is not in the notes.
    if (from === undefined) return;
    player.play(songId, timeline, {
      voices: scoreVoices[songId] ?? null,
      from,
      speed: settings.scoreSpeed,
      metronome: metronome.running
        ? { engine: metronome.engine, quarterNotesPerBeat: metronome.quarterNotesPerBeat }
        : null,
    });
  }

  const scorePlayback: ScorePlayback = {
    playing: player.playing,
    waiting: player.waiting,
    withMetronome: metronome.running,
    speed: settings.scoreSpeed,
    voices: scoreVoices,
    onPlay: playScore,
    onStop: player.stop,
    onVoices: (songId, voices) => setScoreVoices((current) => ({ ...current, [songId]: voices })),
  };

  // The playback stops when its song shows the chords again.
  const playingSong = player.playing;
  const playingHasScore = charts.some(
    ({ song, score }) => song.id === playingSong && score !== null,
  );
  const stopScore = player.stop;
  useEffect(() => {
    if (playingSong && !playingHasScore) stopScore();
  }, [playingSong, playingHasScore, stopScore]);
  // The notes that follow the metronome stop with it.
  const followsMetronome = player.synced;
  const metronomeRunning = metronome.running;
  useEffect(() => {
    if (playingSong && followsMetronome && !metronomeRunning) stopScore();
  }, [playingSong, followsMetronome, metronomeRunning, stopScore]);

  /**
   * Turns to the page of an element of the song, e.g. the note that plays, when it is not on the screen.
   * It is not a page turn of the user: while the sheet follows the leader, the leader's page stays.
   */
  function reveal(songIndex: number, element: Element) {
    if (followsLeader) return;
    const sheet = screenElement;
    const groupIndex = groups.length > 1 ? songIndex : 0;
    const group = groupRefs.current[groupIndex];
    const groupWidth = groupPageWidth(groupFormats[groupIndex]!, layout.width, layout.gap);
    if (!sheet || !group || groupWidth <= 0) return;
    const box = element.getBoundingClientRect();
    const view = sheet.getBoundingClientRect();
    if (box.left >= view.left && box.right <= view.right) return;
    const groupPage = Math.floor((box.left - group.getBoundingClientRect().left + 1) / groupWidth);
    setOwnAnchor({
      song: songIndex,
      page: Math.max(groupPage - (layout.songPages[songIndex] ?? 0), 0),
    });
  }

  function goTo(target: number) {
    const targetScreen = Math.min(Math.max(target, 0), screenCount - 1);
    const targetGroup = groupFirstScreens.findLastIndex(
      (groupScreen) => groupScreen <= targetScreen,
    );
    const targetFirst =
      groupFirstPages[targetGroup]! +
      (targetScreen - groupFirstScreens[targetGroup]!) * groupPagesOnScreen[targetGroup]!;
    const song = Math.max(
      songPages.findLastIndex((page) => page <= targetFirst),
      0,
    );
    setAnchor({ song, page: targetFirst - songPages[song]! });
  }

  const { isFullscreen, canFullscreen, toggleFullscreen } = useFullscreen();
  useWakeLock(settings.keepAwake);

  // The only song has no chart: the sheet shows an empty state, and there is nothing to print.
  const nothingToShow =
    songs.length === 1 &&
    songs[0]!.kind === "song" &&
    charts[0]!.blocks.length === 0 &&
    charts[0]!.content.kind === "chords";
  // The print of the sheet: the songs, by index. Each print has a new id.
  const [printJob, setPrintJob] = useState<{ id: number; songs: number[] } | null>(null);

  /** Prints the song at the top of the screen, or all the songs. */
  function print(scope: "song" | "all") {
    const indexes =
      scope === "song" && currentIndex >= 0 ? [currentIndex] : songs.map((_, index) => index);
    setPrintJob((job) => ({ id: (job?.id ?? 0) + 1, songs: indexes }));
  }

  // The latest handler, so the listener does not need to change on every page turn.
  const onKeyDown = useRef<(event: KeyboardEvent) => void>(null);
  useLayoutEffect(() => {
    onKeyDown.current = (event) => {
      // Ctrl+P (⌘P on a Mac) prints the sheet, not the page with its buttons.
      const printKey =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "p";
      if (printKey && !event.defaultPrevented && !nothingToShow) {
        event.preventDefault();
        print("all");
        return;
      }
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      // The fields of the settings use the arrow keys.
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, select, textarea, [role=dialog]")) return;
      // Space on a button or link clicks it.
      if (event.key === " " && target?.closest("button, a")) return;

      if (
        ["ArrowRight", "ArrowDown", "PageDown"].includes(event.key) ||
        (event.key === " " && !event.shiftKey)
      ) {
        goTo(screen + 1);
      } else if (
        ["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key) ||
        (event.key === " " && event.shiftKey)
      ) {
        goTo(screen - 1);
      } else if (event.key === "Home") {
        goTo(0);
      } else if (event.key === "End") {
        goTo(screenCount - 1);
      } else if (event.key === "f" && canFullscreen) {
        toggleFullscreen();
      } else if (event.key === "m" && metronomeOn) {
        metronome.toggle();
      } else if (event.key === "p" && capoChart?.score && shownTimelines[capoChart.song.id]) {
        if (player.playing) player.stop();
        else playScore(capoChart.song.id);
      } else if (event.key === "r" && hasRehearsal) {
        setRehearsalOpen(!rehearsalOpen);
      } else if (event.key === "a" && canMark) {
        setMarking(!marking);
      } else {
        return;
      }
      event.preventDefault();
    };
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown.current?.(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // A tap on the left third turns back, on the right third forward. The
  // middle third does nothing, so the text stays easy to select.
  function onSheetClick(event: React.MouseEvent<HTMLDivElement>) {
    // In mark mode a tap draws or writes. The clicks of the toolbar come here too.
    if (marking) return;
    if (event.target instanceof Element && event.target.closest("button, a")) return;
    if (window.getSelection()?.isCollapsed === false) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    if (x < 1 / 3) goTo(screen - 1);
    else if (x > 2 / 3) goTo(screen + 1);
  }

  // A swipe with one finger turns a page too. Touch events, not pointer
  // events: the browser cancels the pointer when it starts to pan, but it
  // always sends `touchend`. A swipe does not click, so no tap turns a page too.
  const swipeStart = useRef<{ x: number; y: number; time: number } | null>(null);

  function onSheetTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    swipeStart.current = null;
    if (marking || event.touches.length !== 1) return;
    // A long line that scrolls sideways uses the swipe itself.
    const scroller = event.target instanceof Element ? event.target.closest("pre") : null;
    if (scroller && scroller.scrollWidth > scroller.clientWidth) return;
    const touch = event.touches[0];
    swipeStart.current = { x: touch!.clientX, y: touch!.clientY, time: event.timeStamp };
  }

  function onSheetTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || marking || event.changedTouches.length !== 1) return;
    if (window.getSelection()?.isCollapsed === false) return;
    const touch = event.changedTouches[0];
    const step = swipeStep(
      touch!.clientX - start.x,
      touch!.clientY - start.y,
      event.timeStamp - start.time,
    );
    if (step !== 0) goTo(screen + step);
  }

  const contentsProps: ContentsPanelProps = {
    songs,
    keys: charts.map((chart) => chart.keys),
    notation: noteNames,
    keySetting,
    currentIndex,
    leaderIndex: leaderSong,
    docked,
    canDock: isWide,
    onSelect: (index) => {
      setAnchor({ song: index, page: 0 });
      if (!docked) setOverlayOpen(false);
    },
    onDock: setDocked,
    onClose: () => setContentsOpen(false),
  };

  const pageValues = { page: first + 1, first: first + 1, last: last + 1, count: pageCount };
  const pageLabel = format(first === last ? m.sheet.viewer.page : m.sheet.viewer.pages, pageValues);
  const shortPageLabel = format(
    first === last ? m.sheet.viewer.pageShort : m.sheet.viewer.pagesShort,
    pageValues,
  );

  // On a small screen these buttons are in the footer, near the thumbs; the
  // header has no room for all the buttons.
  const pagination = (size: "icon" | "icon-lg") => (
    <>
      <Button
        variant="ghost"
        size={size}
        aria-label={m.sheet.viewer.previousPage}
        disabled={screen === 0}
        onClick={() => goTo(screen - 1)}
      >
        <ChevronLeftIcon />
      </Button>
      <p
        aria-live="polite"
        className="text-center text-sm whitespace-nowrap text-muted tabular-nums"
      >
        <span aria-hidden>{shortPageLabel}</span>
        <span className="sr-only">{pageLabel}</span>
      </p>
      <Button
        variant="ghost"
        size={size}
        aria-label={m.sheet.viewer.nextPage}
        disabled={screen >= screenCount - 1}
        onClick={() => goTo(screen + 1)}
      >
        <ChevronRightIcon />
      </Button>
    </>
  );
  const marksButton = (className: string) =>
    canMark && (
      <Button
        variant="ghost"
        size="icon"
        className={className}
        aria-label={m.sheet.marks.button}
        aria-pressed={marking}
        title={marking ? m.sheet.marks.stopShortcut : m.sheet.marks.startShortcut}
        onClick={() => setMarking(!marking)}
      >
        <PenLineIcon />
      </Button>
    );

  // The PDF file or the image of the song at the top of the screen, which can zoom.
  const zoomFile =
    capoChart?.content.kind === "pdf"
      ? { kind: "pdf" as const, id: capoChart.content.pdf.id }
      : capoChart?.content.kind === "image" && capoChart.content.image.pages.length > 0
        ? { kind: "image" as const, id: capoChart.content.image.id }
        : null;
  // The song can show something else than the chords: a score, a PDF file or an image.
  const hasViews =
    capoChart !== undefined &&
    capoChart.song.arrangementId !== null &&
    (capoChart.song.scores.length > 0 ||
      capoChart.song.pdfs.length > 0 ||
      capoChart.song.images.some((image) => image.pages.length > 0));
  // The "more" menu has the buttons that are `hidden lg:inline-flex` below.
  const moreItems: MoreMenuItem[] = [
    ...(canFullscreen
      ? [
          {
            key: "fullscreen",
            icon: isFullscreen ? <MinimizeIcon /> : <MaximizeIcon />,
            label: isFullscreen ? m.sheet.viewer.exitFullScreen : m.sheet.viewer.fullScreen,
            onSelect: toggleFullscreen,
          },
        ]
      : []),
    ...(hasRehearsal
      ? [
          {
            key: "rehearsal",
            icon: <GuitarIcon />,
            label: m.sheet.rehearsal.button,
            // It opens a drawer on small screens.
            opensPopover: true,
            onSelect: () => setRehearsalOpen(!rehearsalOpen),
          },
        ]
      : []),
    ...(hasViews
      ? [
          {
            key: "content",
            icon: <ContentIcon content={capoChart.content} />,
            label: m.sheet.content.title,
            detail: contentName(i18n, capoChart.content),
            opensPopover: true,
            onSelect: () => setHeaderPopover("content"),
          },
        ]
      : []),
    ...(!liveProps && startLive
      ? [
          {
            key: "live",
            icon: <RadioIcon />,
            label: m.sheet.live.title,
            opensPopover: true,
            onSelect: () => setHeaderPopover("live"),
          },
        ]
      : []),
    ...(nothingToShow
      ? []
      : songs.length > 1
        ? [
            {
              key: "print-song",
              icon: <PrinterIcon />,
              label: m.sheet.print.thisSong,
              detail: currentSong?.title,
              onSelect: () => print("song"),
            },
            {
              key: "print-all",
              icon: <PrinterIcon />,
              label: m.sheet.print.allSongs,
              onSelect: () => print("all"),
            },
          ]
        : [
            {
              key: "print",
              icon: <PrinterIcon />,
              label: m.sheet.print.button,
              onSelect: () => print("all"),
            },
          ]),
  ];

  /** The text item of an event: its texts, and the verses of a scripture reading. */
  const textItemBody = (song: SheetSong) => (
    <div className="space-y-[0.75em]">
      {song.description && <p className="whitespace-pre-line">{song.description}</p>}
      {song.highlight && <p className="font-semibold whitespace-pre-line">{song.highlight}</p>}
      {song.notes && <p className="whitespace-pre-line">{song.notes}</p>}
    </div>
  );

  /** A song on paper: as on the screen, with the settings of the song. */
  function printedSong(index: number) {
    const { song, chart, subtitle, details, blocks, content, score } = charts[index]!;
    const options = songSettings[index];
    if (score) {
      return (
        <>
          <ChordSheet
            title={song.title}
            subtitle={subtitle}
            details={score.details}
            blocks={[]}
            options={options!}
          />
          <PrintScore
            url={score.score.url}
            transpose={score.transpose}
            showChords={options!.showChords}
            sizePercent={(PRINT_FONT_PX * 100) / SHEET_BASE_FONT_PX}
          />
        </>
      );
    }
    if (content.kind === "pdf" || content.kind === "image") {
      return (
        <>
          <ChordSheet
            title={song.title}
            subtitle={subtitle}
            details={charts[index]!.fileDetails ?? details}
            blocks={[]}
            options={options!}
          />
          {content.kind === "pdf" ? (
            <PrintPdf url={content.pdf.url} />
          ) : (
            <PrintImage image={content.image} />
          )}
        </>
      );
    }
    const arrangementId = song.kind === "song" ? song.arrangementId : null;
    return (
      <>
        <ChordSheet
          title={song.title}
          subtitle={subtitle}
          details={details}
          blocks={blocks}
          options={options!}
          marks={
            arrangementId && settings.showMarks
              ? (anchor) => <MarksLayer marks={marks.byAnchor[arrangementId]?.get(anchor)} />
              : undefined
          }
        />
        {song.kind === "text"
          ? textItemBody(song)
          : blocks.length === 0 && (
              <p className="text-(--sheet-muted) italic">
                {emptyChartMessage(i18n, chart.parts.length)}
              </p>
            )}
      </>
    );
  }

  return (
    // `fixed`: Safari 26 on iOS colors the status bar and the toolbar like the
    // fixed header and footer. Without them it puts a light gradient there.
    // The safe area keeps the buttons away from the notch and the round corners.
    <main className="fixed inset-0 flex flex-col overflow-hidden pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <header className="flex h-[calc(3rem+env(safe-area-inset-top))] shrink-0 items-center gap-1 border-b bg-surface px-2 pt-[env(safe-area-inset-top)]">
        <Link
          href={backHref}
          aria-label={m.sheet.viewer.close}
          title={m.common.actions.close}
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <XIcon />
        </Link>
        {songs.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.sheet.viewer.tableOfContents}
            aria-expanded={contentsOpen}
            title={contentsOpen ? m.sheet.viewer.hideContents : m.sheet.viewer.showContents}
            onClick={() => setContentsOpen(!contentsOpen)}
          >
            {contentsOpen ? <PanelLeftCloseIcon /> : <PanelLeftIcon />}
          </Button>
        )}
        <h1 className="min-w-0 flex-1 truncate px-1 text-sm font-medium">
          {title}
          {currentSong && (
            <span className="font-normal text-muted">
              {m.common.separator}
              {currentSong.title}
            </span>
          )}
        </h1>

        <div className="hidden shrink-0 items-center gap-1 md:flex">{pagination("icon")}</div>

        {canFullscreen && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            aria-label={isFullscreen ? m.sheet.viewer.exitFullScreen : m.sheet.viewer.fullScreen}
            title={
              isFullscreen
                ? m.sheet.viewer.exitFullScreenShortcut
                : m.sheet.viewer.fullScreenShortcut
            }
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
          </Button>
        )}
        {!nothingToShow && (
          <PrintButton
            severalSongs={songs.length > 1}
            onPrint={print}
            className="hidden lg:inline-flex"
          />
        )}
        {hasRehearsal && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            aria-label={m.sheet.rehearsal.button}
            aria-pressed={rehearsalOpen}
            title={rehearsalOpen ? m.sheet.rehearsal.hideShortcut : m.sheet.rehearsal.showShortcut}
            onClick={() => setRehearsalOpen(!rehearsalOpen)}
          >
            <GuitarIcon />
          </Button>
        )}
        {marksButton("hidden md:inline-flex")}
        {liveOn && !live.isLeader && !followsLeader && leaderAnchor && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 pointer-coarse:h-9"
            onClick={() => live.setFollowing(true)}
          >
            <CrownIcon />
            {/* Tablets and small laptops: the header has more buttons, and no room for the text. */}
            <span className="hidden sm:max-md:inline xl:inline">{m.sheet.live.backToLeader}</span>
          </Button>
        )}
        {liveProps ? (
          <LiveControl live={live} session={liveProps.session} title={title} />
        ) : (
          startLive && (
            <StartLiveControl
              start={startLive}
              backHref={backHref}
              control={popoverControl("live")}
              className="hidden lg:inline-flex"
            />
          )
        )}
        {hasViews && (
          <SongViewButton
            scores={capoChart.song.scores}
            pdfs={capoChart.song.pdfs}
            images={capoChart.song.images}
            shown={capoChart.content}
            shownKey={capoChart.keys?.shown ?? null}
            scoreName={settings.scoreName}
            title={
              songs.length > 1
                ? format(m.sheet.content.titleOfSong, { song: capoChart.song.title })
                : m.sheet.content.title
            }
            error={
              viewError?.arrangementId === capoChart.song.arrangementId ? viewError.message : null
            }
            onChange={(content) => setContent(capoIndex, content)}
            onScoreNameChange={(scoreName) => updateSheetSettings({ scoreName })}
            control={popoverControl("content")}
            className="hidden lg:inline-flex"
          />
        )}
        {capoChart?.keys && (
          <KeyButton
            keys={capoChart.keys}
            notation={noteNames}
            label={format(m.sheet.key.button, {
              key: fromEnglish(capoChart.keys.shown, noteNames),
            })}
          >
            {keySetting(capoIndex)}
          </KeyButton>
        )}
        {/* One metronome control only: it pulses its toolbar on each beat. */}
        {isWide && metronomeOn && <MetronomeControl metronome={metronome} saveTempo={saveTempo} />}
        <SettingsPopover
          settings={settings}
          hasSeveralSongs={songs.length > 1}
          canMark={canMark}
          song={{
            title:
              songs.length > 1
                ? format(m.sheet.view.ofSong, { song: viewSong!.title })
                : m.sheet.view.thisSong,
            settings: songSettings[viewIndex]!,
            canOwn: viewSong!.arrangementId !== null,
            // The content of the song is not a part of its layout: it has its own button.
            hasOwn: !isEmptyView(layoutValues(songViews[viewIndex]!)),
            hasSectionOrder: viewSong!.sectionOrder.length > 0,
            sharedPages,
            deviceType,
            capo: capoChart?.song.arrangementId ? (
              <CapoSetting
                // Another song starts without the error of the previous one.
                key={capoChart.song.arrangementId}
                title={m.sheet.capo.title}
                capo={capoChart.capo ?? 0}
                ownCapo={capoChart.ownCapo!}
                chartCapo={capoChart.chartCapo}
                error={
                  capoError?.arrangementId === capoChart.song.arrangementId
                    ? capoError.message
                    : null
                }
                onChange={(capo) => setCapo(capoChart.song.arrangementId!, capo)}
              />
            ) : null,
            zoom: zoomFile && capoChart && (
              <FileZoomSetting
                // Another file starts without the error of the previous one.
                key={zoomFile.id}
                view={fileView(capoChart.song, zoomFile.id)}
                error={fileViewError?.fileId === zoomFile.id ? fileViewError.message : null}
                onChange={(view) => setFileView(zoomFile.kind, zoomFile.id, view)}
              />
            ),
            error: viewError?.arrangementId === viewSong!.arrangementId ? viewError.message : null,
            onChange: changeView,
            // The song then follows the device's settings. They already have
            // the song's latest changes (`changeView`), so the song can look
            // the same: it only follows the next changes of the general settings.
            onReset: () => {
              const { content } = songViews[viewIndex]!;
              if (viewSong!.arrangementId)
                setView(viewSong!.arrangementId, content ? { content } : {});
            },
          }}
        />
        <SheetMoreMenu items={moreItems} buttonRef={setMoreButton} />
      </header>

      <div className="relative flex min-h-0 flex-1">
        {docked && contentsOpen && (
          <aside className="flex w-64 shrink-0 flex-col overflow-y-auto overscroll-contain border-r bg-surface-raised text-text">
            <ContentsPanel {...contentsProps} />
          </aside>
        )}
        {nothingToShow ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileMusicIcon />
              </EmptyMedia>
              <EmptyTitle>{m.sheet.viewer.nothingToShow}</EmptyTitle>
              <EmptyDescription>
                {emptyChartMessage(i18n, charts[0]!.chart.parts.length)}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div
            ref={setScreenElement}
            // The colors of the paper are in `globals.css`, for the light and the dark theme.
            data-sheet-paper={settings.background}
            style={{ fontSize: `${emPx}px` }}
            // `--pad` is the side padding. The gap between the pages is twice
            // as wide, so no part of the pages before and after the screen
            // shows in the padding.
            // `touch-manipulation`: no double-tap zoom, so two quick taps turn two pages.
            className="relative min-h-0 flex-1 touch-manipulation overflow-hidden bg-(--sheet-bg) px-(--pad) py-4 text-(--sheet-fg) [--pad:1rem] sm:py-6 sm:[--pad:2rem]"
            onClick={onSheetClick}
            onTouchStart={onSheetTouchStart}
            onTouchEnd={onSheetTouchEnd}
            onTouchCancel={() => (swipeStart.current = null)}
          >
            {/* The PDF files and the images use memory only near the screen. */}
            <SheetScreenContext value={screenElement}>
              <div ref={setZoomElement} className="h-full">
                <div
                  ref={columnsRef}
                  className="relative h-full"
                  // A screen is the width of the sheet plus one gap.
                  style={{ transform: `translateX(${-screen * (layout.width + layout.gap)}px)` }}
                >
                  {groups.map((songIndexes, groupIndex) => (
                    <div
                      key={songIndexes.map((index) => songs[index]!.id).join(" ")}
                      ref={(element) => {
                        groupRefs.current[groupIndex] = element;
                      }}
                      // The scores fit their pages to the height of the group.
                      data-sheet-group
                      className="absolute inset-y-0 w-full"
                      style={{
                        // A screen is the width of the sheet plus one gap.
                        left: `calc(${groupFirstScreens[groupIndex]} * (100% + 2 * var(--pad)))`,
                        columnCount: groupPagesOnScreen[groupIndex],
                        columnGap: "calc(2 * var(--pad))",
                        columnFill: "auto",
                      }}
                    >
                      {songIndexes.map((index, position) => {
                        const { song, chart, subtitle, details, blocks, content, score } =
                          charts[index]!;
                        const arrangementId = song.kind === "song" ? song.arrangementId : null;
                        if (score) {
                          return (
                            <article
                              key={song.id}
                              ref={(element) => {
                                songRefs.current[index] = element;
                              }}
                              // Marks belong to the lines of the chords: mark mode does not put them on a score.
                              data-mark-none
                              className={cn(position > 0 && "break-before-column")}
                              style={{ fontSize: `${songEmPx[index]}px` }}
                            >
                              <ChordSheet
                                title={song.title}
                                subtitle={subtitle}
                                details={score.details}
                                blocks={[]}
                                options={songSettings[index]!}
                              />
                              <ScoreView
                                url={score.score.url}
                                transpose={score.transpose}
                                showChords={songSettings[index]!.showChords}
                                sizePercent={sizePercent(songSettings[index]!.size)}
                                active={player.playing === song.id ? player.active : NO_NOTES}
                                onLayout={() => setFileLayouts((count) => count + 1)}
                                onTimeline={(timeline) => {
                                  setScoreTimelines((current) => ({
                                    ...current,
                                    [song.id]: { url: score.score.url, timeline },
                                  }));
                                  // New pages, e.g. in a new key: the old notes do not show anymore.
                                  if (player.playing === song.id) player.stop();
                                }}
                                onReveal={(element) => reveal(index, element)}
                                // In rehearsal mode, or while the notes play, a tap on a note plays from it.
                                onNoteClick={
                                  rehearsalOpen || player.playing
                                    ? (noteId) => playScore(song.id, noteId)
                                    : undefined
                                }
                                onShowChords={() => setContent(index, { kind: "chords" })}
                              />
                            </article>
                          );
                        }
                        if (content.kind === "pdf" || content.kind === "image") {
                          return (
                            <article
                              key={song.id}
                              ref={(element) => {
                                songRefs.current[index] = element;
                              }}
                              // Marks belong to the lines of the chords.
                              data-mark-none
                              className={cn(position > 0 && "break-before-column")}
                              style={{ fontSize: `${songEmPx[index]}px` }}
                            >
                              <ChordSheet
                                title={song.title}
                                subtitle={subtitle}
                                details={charts[index]!.fileDetails ?? details}
                                blocks={[]}
                                options={songSettings[index]!}
                              />
                              {content.kind === "pdf" ? (
                                // Another file starts without the state of the last one, e.g. a failed load.
                                <SheetPdf
                                  key={content.pdf.id}
                                  url={content.pdf.url}
                                  view={fileView(song, content.pdf.id)}
                                  onViewChange={(view) => setFileView("pdf", content.pdf.id, view)}
                                  onLayout={() => setFileLayouts((count) => count + 1)}
                                />
                              ) : (
                                <SheetImage
                                  key={content.image.id}
                                  image={content.image}
                                  view={fileView(song, content.image.id)}
                                  onViewChange={(view) =>
                                    setFileView("image", content.image.id, view)
                                  }
                                  onLayout={() => setFileLayouts((count) => count + 1)}
                                />
                              )}
                            </article>
                          );
                        }
                        return (
                          <article
                            key={song.id}
                            ref={(element) => {
                              songRefs.current[index] = element;
                            }}
                            data-mark-arrangement={arrangementId ?? undefined}
                            className={cn(position > 0 && "break-before-column")}
                            style={{ fontSize: `${songEmPx[index]}px` }}
                          >
                            <ChordSheet
                              title={song.title}
                              subtitle={subtitle}
                              details={details}
                              blocks={blocks}
                              options={songSettings[index]!}
                              marks={
                                arrangementId
                                  ? (anchor) =>
                                      showMarks && (
                                        <MarksLayer
                                          marks={marks.byAnchor[arrangementId]?.get(anchor)}
                                        />
                                      )
                                  : undefined
                              }
                            />
                            {song.kind === "text"
                              ? textItemBody(song)
                              : blocks.length === 0 && (
                                  <p className="text-(--sheet-muted) italic">
                                    {emptyChartMessage(i18n, chart.parts.length)}
                                  </p>
                                )}
                          </article>
                        );
                      })}
                      <div
                        ref={(element) => {
                          groupEndRefs.current[groupIndex] = element;
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </SheetScreenContext>

            {/* Lines between the pages on the screen. Each page, with its share of the gaps, is 1/n of the width. */}
            {Array.from({ length: last - first }, (_, index) => (
              <div
                key={index}
                aria-hidden
                className="absolute inset-y-4 w-px bg-(--sheet-rule) sm:inset-y-6"
                style={{ left: `${((index + 1) * 100) / pages!}%` }}
              />
            ))}

            {player.playing && !marking && (
              <Button
                variant="secondary"
                size="sm"
                className="absolute bottom-3 left-3 z-20 shadow"
                title={m.sheet.play.stopShortcut}
                onClick={player.stop}
              >
                <SquareIcon />
                {m.sheet.play.stop}
              </Button>
            )}
            {marking && (
              <MarkingLayer
                settings={settings}
                emPx={emPx}
                marks={marks.marks}
                onCommit={marks.commit}
                onUndo={marks.undo}
                onRedo={marks.redo}
                onDone={() => setMarking(false)}
              />
            )}
            {(marking || marks.error) && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex flex-col items-center gap-2 px-2 text-base">
                {marks.error && <MarkError message={marks.error} onDismiss={marks.dismissError} />}
                {marking && marks.isEmpty && !marks.error && (
                  <p className="max-w-md rounded-lg bg-surface/90 px-3 py-1.5 text-center text-xs text-muted shadow">
                    {m.sheet.marks.empty}
                  </p>
                )}
                {marking && (
                  <MarkToolbar
                    settings={settings}
                    canUndo={marks.canUndo}
                    canRedo={marks.canRedo}
                    onUndo={marks.undo}
                    onRedo={marks.redo}
                    onDone={() => setMarking(false)}
                  />
                )}
              </div>
            )}
          </div>
        )}
        {isWide && rehearsalOpen && (
          <aside className="flex w-80 shrink-0 flex-col overflow-y-auto overscroll-contain border-l bg-surface-raised text-text">
            <RehearsalPanel
              songs={rehearsalSongs}
              options={settings}
              notation={noteNames}
              playback={scorePlayback}
              onClose={() => setRehearsalOpen(false)}
            />
          </aside>
        )}
      </div>

      <footer className="grid min-h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-1 border-t bg-surface px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden">
        <div className="flex justify-start">
          {!isWide && metronomeOn && (
            <MetronomeControl metronome={metronome} bar="footer" saveTempo={saveTempo} />
          )}
        </div>
        <div className="flex items-center gap-1">{pagination("icon-lg")}</div>
        <div className="flex justify-end">{marksButton("size-9")}</div>
      </footer>

      <Drawer.Root
        swipeDirection="left"
        open={!docked && overlayOpen}
        onOpenChange={setOverlayOpen}
      >
        <Drawer.Portal>
          <Drawer.Backdrop className="fixed inset-0 min-h-dvh bg-black/40 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-starting-style:opacity-0 data-swiping:duration-0 supports-[-webkit-touch-callout:none]:absolute" />
          <Drawer.Viewport className="fixed inset-0 flex items-stretch justify-start">
            <Drawer.Popup className="flex h-full w-72 max-w-[calc(100vw-3rem)] flex-col overflow-y-auto overscroll-contain border-r bg-surface-raised text-text shadow-lg outline-none [transform:translateX(var(--drawer-swipe-movement-x))] transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] touch-auto data-ending-style:[transform:translateX(calc(-100%-2px))] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-starting-style:[transform:translateX(calc(-100%-2px))] data-swiping:select-none">
              <ContentsPanel {...contentsProps} inDrawer />
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>

      <Drawer.Root
        swipeDirection="right"
        open={!isWide && rehearsalOverlayOpen}
        onOpenChange={setRehearsalOverlayOpen}
      >
        <Drawer.Portal>
          <Drawer.Backdrop className="fixed inset-0 min-h-dvh bg-black/40 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-starting-style:opacity-0 data-swiping:duration-0 supports-[-webkit-touch-callout:none]:absolute" />
          <Drawer.Viewport className="fixed inset-0 flex items-stretch justify-end">
            <Drawer.Popup className="flex h-full w-80 max-w-[calc(100vw-3rem)] flex-col overflow-y-auto overscroll-contain border-l bg-surface-raised text-text shadow-lg outline-none [transform:translateX(var(--drawer-swipe-movement-x))] transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] touch-auto data-ending-style:[transform:translateX(calc(100%+2px))] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-starting-style:[transform:translateX(calc(100%+2px))] data-swiping:select-none">
              <RehearsalPanel
                songs={rehearsalSongs}
                options={settings}
                notation={noteNames}
                playback={scorePlayback}
                onClose={() => setRehearsalOverlayOpen(false)}
                inDrawer
              />
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>

      {printJob && (
        <PrintSheet
          key={printJob.id}
          // The browser names the PDF file with it.
          title={printJob.songs.length === 1 ? songs[printJob.songs[0]!]!.title : title}
          onDone={() => setPrintJob(null)}
        >
          {printJob.songs.map((index, position) => (
            <article key={songs[index]!.id} className={cn(position > 0 && "break-before-page")}>
              {printedSong(index)}
            </article>
          ))}
        </PrintSheet>
      )}
    </main>
  );
}

/** The header popovers that the "more" menu opens on small screens. */
type HeaderPopover = "content" | "live";

/** No notes sound: the same array each time, so the score does not light up again. */
const NO_NOTES: string[] = [];

type Layout = {
  /** The width of the sheet, in pixels. */
  width: number;
  /** The gap between the pages, in pixels. */
  gap: number;
  /** The number of pages of each group of songs. */
  groupPages: number[];
  /** The page (from 0) on which each song starts, counted from the start of its group. */
  songPages: number[];
  /** The named sections of each song (see `sectionAnchors`), with their page in the group. */
  sections: { song: number; name: string; page: number }[];
};

function sameLayout(a: Layout, b: Layout) {
  return (
    a.width === b.width &&
    a.gap === b.gap &&
    sameNumbers(a.groupPages, b.groupPages) &&
    sameNumbers(a.songPages, b.songPages) &&
    a.sections.length === b.sections.length &&
    a.sections.every(
      (section, index) =>
        section.song === b.sections[index]!.song &&
        section.name === b.sections[index]!.name &&
        section.page === b.sections[index]!.page,
    )
  );
}

/** The page of a section from the start of its song. The start of the song when the sheet does not have the section. */
function sectionPage(layout: Layout, song: number, name: string | null) {
  const section = name
    ? layout.sections.find((entry) => entry.song === song && entry.name === name)
    : undefined;
  return section ? Math.max(section.page - (layout.songPages[song] ?? 0), 0) : 0;
}

/** The pages side by side, and the text size in pixels, of a group of songs. */
type GroupFormat = { pagesOnScreen: SheetSettings["pagesOnScreen"]; emPx: number };

/** The number of pages side by side. With `auto`, as many as fit, each at least `SHEET_MIN_PAGE_EM` wide. */
function pagesOnScreen({ pagesOnScreen, emPx }: GroupFormat, width: number, gap: number) {
  if (pagesOnScreen !== "auto") return pagesOnScreen;
  return Math.max(1, Math.floor((width + gap) / (SHEET_MIN_PAGE_EM * emPx + gap)));
}

/** The width of a page of the group plus the gap after it, in pixels. */
function groupPageWidth(format: GroupFormat, width: number, gap: number) {
  return (width + gap) / pagesOnScreen(format, width, gap);
}

function sameNumbers(a: number[], b: number[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

/** The line under the title and the details line. They use the chart's own data when the song has none. */
function sheetHeader(
  i18n: I18n,
  song: SheetSong,
  chart: ChordProDocument,
  capo: number,
  notation: Notation,
) {
  const { m, format } = i18n;
  // The key of the chords, also after a change of the key.
  const key = song.kind === "song" ? (chart.meta.key ?? null) : null;
  const details = key
    ? [format(m.sheet.details.key, { key: fromEnglish(key, notation) }), ...song.details]
    : [...song.details];
  if (capo) details.push(format(m.sheet.details.capo, { capo }));
  details.push(...lastDetails(i18n, song));
  return { subtitle: song.artist ?? chart.meta.subtitle ?? chart.meta.artist ?? null, details };
}

/** The details line of a score: the key it shows in, the details of the song and the name of the score. */
function scoreDetails(
  i18n: I18n,
  song: SheetSong,
  score: SongScoreDTO,
  key: string | null,
  notation: Notation,
) {
  const { m, format } = i18n;
  const details = key ? [format(m.sheet.details.key, { key: fromEnglish(key, notation) })] : [];
  details.push(...song.details, score.name, ...lastDetails(i18n, song));
  return details;
}

/**
 * The details line of a PDF file or an image: its keys, the details of the
 * song and the name of the file. A file that is not in the key of the sheet
 * (`shownKey`) says the key of the sheet: the file cannot move to it.
 */
function fileDetails(
  i18n: I18n,
  song: SheetSong,
  file: SongPdfDTO | SongImageDTO,
  shownKey: string | null,
  notation: Notation,
) {
  const { m, format } = i18n;
  const details =
    file.keys.length > 0
      ? [
          format(m.sheet.details.key, {
            key: file.keys.map((key) => fromEnglish(key, notation)).join(", "),
          }),
        ]
      : [];
  details.push(...song.details, file.name, ...lastDetails(i18n, song));
  if (file.keys.length > 0 && shownKey && !isInKey(file, shownKey)) {
    details.push(format(m.sheet.content.otherKey, { key: fromEnglish(shownKey, notation) }));
  }
  return details;
}

/** The end of each details line: the name of the arrangement and the volunteer of the item. */
function lastDetails({ m, format }: I18n, song: SheetSong): string[] {
  const details = song.arrangementName ? [song.arrangementName] : [];
  if (song.volunteer) details.push(format(m.sheet.details.volunteer, { name: song.volunteer }));
  return details;
}

function emptyChartMessage({ m, format }: I18n, partCount: number) {
  return partCount === 0
    ? m.sheet.viewer.noChart
    : format(m.sheet.viewer.noSectionInOrder, { option: m.sheet.settings.orderWritten });
}

// From this width the table of contents can dock next to the sheet.
const WIDE_QUERY = "(min-width: 48rem)"; // Tailwind `md`
// From this width all the header buttons fit next to the title, also on a
// touch screen, where they are larger. Below it, some are in the "more" menu.
const HEADER_ROOM_QUERY = "(min-width: 64rem)"; // Tailwind `lg`

type ContentsPanelProps = {
  songs: SheetSong[];
  /** The keys of each song. Null for a song without a key and for a text item. */
  keys: (SongKeys | null)[];
  notation: Notation;
  /** The key setting of a song, for its key button. */
  keySetting: (index: number) => React.ReactNode;
  /** The song at the top of the screen. */
  currentIndex: number;
  /** The song of the leader of a live session, or -1. */
  leaderIndex: number;
  docked: boolean;
  canDock: boolean;
  onSelect: (index: number) => void;
  onDock: (dock: boolean) => void;
  onClose: () => void;
};

/**
 * The songs with their keys. Select one to go to the page on which it
 * starts. It docks next to the sheet, or opens in a drawer over it.
 */
function ContentsPanel({
  songs,
  keys,
  notation,
  keySetting,
  currentIndex,
  leaderIndex,
  docked,
  canDock,
  onSelect,
  onDock,
  onClose,
  inDrawer,
}: ContentsPanelProps & { inDrawer?: boolean }) {
  const Title = inDrawer ? Drawer.Title : "h2";
  const { m, format, number } = useI18n();

  return (
    <nav aria-label={m.sheet.viewer.tableOfContents} className="flex flex-col gap-1 p-2">
      <div className="flex items-center gap-1 pl-2">
        <Title className="flex-1 text-xs font-medium text-text/60">{m.sheet.contents.title}</Title>
        {canDock && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={m.sheet.contents.dock}
            aria-pressed={docked}
            title={docked ? m.sheet.contents.undock : m.sheet.contents.dock}
            onClick={() => onDock(!docked)}
          >
            {docked ? <PinOffIcon /> : <PinIcon />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={m.sheet.contents.close}
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      <ol className="flex flex-col gap-0.5">
        {songs.map((song, index) => {
          const songKeys = keys[index];
          return (
            <Fragment key={song.id}>
              <li className="relative">
                <button
                  type="button"
                  aria-current={index === currentIndex ? "true" : undefined}
                  onClick={() => onSelect(index)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text/80 transition-colors outline-none hover:bg-surface-sunken hover:text-text focus-visible:ring-3 focus-visible:ring-focus/50",
                    // Room for the key button. A button cannot hold a button, so it is next to this one.
                    songKeys && "pr-14",
                    index === currentIndex && "bg-surface-sunken font-medium text-text",
                  )}
                >
                  <span className="w-5 shrink-0 text-right text-xs text-text/60 tabular-nums">
                    {number(index + 1)}.
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate", song.kind === "text" && "italic")}>
                    {song.title}
                  </span>
                  {index === leaderIndex && (
                    <>
                      <CrownIcon aria-hidden className="size-3.5 shrink-0 text-amber-500" />
                      <span className="sr-only">{m.sheet.live.leaderHere}</span>
                    </>
                  )}
                  {!songKeys && song.key && (
                    // A key that the sheet cannot move, e.g. "G major". A border, not a background: the row of the
                    // current song has the accent background.
                    <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 font-mono text-xs font-normal">
                      {rich(
                        format(m.sheet.contents.key, { key: fromEnglish(song.key, notation) }),
                        {
                          hidden: (text) => <span className="sr-only">{text}</span>,
                        },
                      )}
                    </span>
                  )}
                </button>
                {songKeys && (
                  <KeyButton
                    keys={songKeys}
                    notation={notation}
                    label={format(m.sheet.key.buttonOfSong, {
                      song: song.title,
                      key: fromEnglish(songKeys.shown, notation),
                    })}
                    className="absolute top-1/2 right-1 h-7 -translate-y-1/2 border border-border text-xs font-normal"
                  >
                    {keySetting(index)}
                  </KeyButton>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

/** The part of the sheet settings for one song: the only song, or the song at the top of the screen. */
type SongSettingsPart = {
  /** "This song", or the name of the song when the sheet has several. */
  title: string;
  /** The song's settings: its own, and the device's for the others. */
  settings: SheetSettings;
  /** False for a text item: it uses the device's settings. */
  canOwn: boolean;
  /** The song has its own settings on this type of device. */
  hasOwn: boolean;
  hasSectionOrder: boolean;
  /** The songs share the pages, so the pages side by side are for all songs. */
  sharedPages: boolean;
  deviceType: DeviceType;
  /** The user's own capo of the song. Null for a text item. */
  capo: React.ReactNode;
  /** The zoom of the song's PDF file or image. Null when it shows something else. */
  zoom: React.ReactNode;
  error: string | null;
  onChange: (changes: SheetView) => void;
  /** Removes the song's own settings. */
  onReset: () => void;
};

function SettingsPopover({
  settings,
  song,
  hasSeveralSongs,
  canMark,
}: {
  /** The device's settings. */
  settings: SheetSettings;
  song: SongSettingsPart;
  hasSeveralSongs: boolean;
  /** The sheet has a song that the user can mark. */
  canMark: boolean;
}) {
  const canKeepAwake = useBrowserValue(() => "wakeLock" in navigator, false);
  const { m, number } = useI18n();
  const smaller = zoomStep(SHEET_BUTTON_SIZES, song.settings.size, -1);
  const larger = zoomStep(SHEET_BUTTON_SIZES, song.settings.size, 1);
  const view = song.settings;
  const hint = {
    phone: m.sheet.view.hintPhone,
    tablet: m.sheet.view.hintTablet,
    desktop: m.sheet.view.hintDesktop,
  }[song.deviceType];
  const resetButton = (text: string) => (
    <button type="button" className="font-medium text-text underline" onClick={song.onReset}>
      {text}
    </button>
  );
  const pagesChoice = (
    value: SheetSettings["pagesOnScreen"],
    onChange: (value: SheetSettings["pagesOnScreen"]) => void,
  ) => (
    <Choice
      label={m.sheet.settings.pagesOnScreen}
      value={value}
      options={[
        { value: "auto", label: m.sheet.settings.pagesAuto },
        ...Array.from({ length: SHEET_MAX_PAGES }, (_, index) => ({
          value: index + 1,
          label: number(index + 1),
        })),
      ]}
      onChange={onChange}
    />
  );

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.sheet.settings.button}
            title={m.sheet.settings.buttonTitle}
          />
        }
      >
        <Settings2Icon />
      </Popover.Trigger>
      <Popover.Portal>
        {/* On a phone the settings fill the screen, and only their body scrolls. */}
        <Popover.Positioner
          sideOffset={8}
          align="end"
          collisionPadding={8}
          className="z-50 max-sm:inset-0! max-sm:fixed! max-sm:transform-none!"
        >
          <Popover.Popup className="flex max-h-[var(--available-height)] w-72 max-w-[calc(100vw-1rem)] origin-[var(--transform-origin)] flex-col overflow-hidden rounded-lg border bg-surface-raised text-text shadow-lg outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:border-0 max-sm:pt-[env(safe-area-inset-top)] max-sm:pr-[env(safe-area-inset-right)] max-sm:pl-[env(safe-area-inset-left)] max-sm:shadow-none">
            <div className="flex shrink-0 items-center gap-2 px-4 pt-4 max-sm:h-12 max-sm:border-b max-sm:py-0 max-sm:pr-2">
              <Popover.Title className="flex-1 truncate text-sm font-semibold">
                {m.sheet.settings.title}
              </Popover.Title>
              <Popover.Close
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="sm:hidden"
                    aria-label={m.common.actions.close}
                    title={m.common.actions.close}
                  />
                }
              >
                <XIcon />
              </Popover.Close>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
              <section aria-labelledby="sheet-settings-song" className="flex flex-col gap-4">
                <h3
                  id="sheet-settings-song"
                  className="truncate text-xs font-semibold tracking-wide text-muted uppercase"
                >
                  {song.title}
                </h3>
                {song.capo}
                {song.zoom}

                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-muted">{m.sheet.settings.size}</p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={m.sheet.settings.smaller}
                      disabled={smaller === undefined}
                      onClick={() => smaller !== undefined && song.onChange({ size: smaller })}
                    >
                      <MinusIcon />
                    </Button>
                    <output aria-live="polite" className="flex-1 text-center text-sm tabular-nums">
                      {number(view.size / 100, { style: "percent" })}
                    </output>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={m.sheet.settings.larger}
                      disabled={larger === undefined}
                      onClick={() => larger !== undefined && song.onChange({ size: larger })}
                    >
                      <PlusIcon />
                    </Button>
                  </div>
                </div>

                {!song.sharedPages &&
                  pagesChoice(view.pagesOnScreen, (pagesOnScreen) =>
                    song.onChange({ pagesOnScreen }),
                  )}
                <Choice
                  label={m.sheet.settings.chords}
                  value={view.showChords}
                  options={[
                    { value: true, label: m.sheet.settings.chordsShow },
                    { value: false, label: m.sheet.settings.chordsHide },
                  ]}
                  onChange={(showChords) => song.onChange({ showChords })}
                />
                {view.showChords && (
                  <Choice
                    label={m.sheet.settings.syllables}
                    value={view.underlineSyllables}
                    options={[
                      { value: true, label: m.sheet.settings.syllablesUnderline },
                      { value: false, label: m.sheet.settings.syllablesPlain },
                    ]}
                    onChange={(underlineSyllables) => song.onChange({ underlineSyllables })}
                  />
                )}
                {song.hasSectionOrder && (
                  <Choice
                    label={m.sheet.settings.order}
                    value={view.order}
                    options={[
                      { value: "arrangement", label: m.sheet.settings.orderArrangement },
                      { value: "written", label: m.sheet.settings.orderWritten },
                    ]}
                    onChange={(order) => song.onChange({ order })}
                  />
                )}
                <Choice
                  label={m.sheet.settings.repeats}
                  value={view.repeats}
                  options={[
                    { value: "full", label: m.sheet.settings.repeatsFull },
                    { value: "label", label: m.sheet.settings.repeatsLabel },
                  ]}
                  onChange={(repeats) => song.onChange({ repeats })}
                />
                {song.canOwn && (
                  <p className="text-xs text-muted">
                    {song.hasOwn && <>{rich(m.sheet.view.own, { button: resetButton })} </>}
                    {hint}
                  </p>
                )}
                {song.error && (
                  <p role="alert" className="text-xs text-danger">
                    {song.error}
                  </p>
                )}
              </section>

              <section
                aria-labelledby="sheet-settings-all"
                className="flex flex-col gap-4 border-t pt-4"
              >
                <h3
                  id="sheet-settings-all"
                  className="text-xs font-semibold tracking-wide text-muted uppercase"
                >
                  {m.sheet.view.allSongs}
                </h3>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="sheet-note-names" className="text-xs font-medium text-muted">
                    {m.components.noteNames.label}
                  </label>
                  <NoteNamesSelect id="sheet-note-names" />
                </div>
                {song.sharedPages &&
                  pagesChoice(settings.pagesOnScreen, (pagesOnScreen) =>
                    updateSheetSettings({ pagesOnScreen }),
                  )}
                {hasSeveralSongs && (
                  <Choice
                    label={m.sheet.settings.songStart}
                    value={settings.songStart}
                    options={[
                      { value: "screen", label: m.sheet.settings.songStartScreen },
                      { value: "page", label: m.sheet.settings.songStartPage },
                    ]}
                    onChange={(songStart) => updateSheetSettings({ songStart })}
                  />
                )}
                <Choice
                  label={m.sheet.settings.background}
                  value={settings.background}
                  options={[
                    // Dark gray in the dark theme.
                    { value: "white", label: m.sheet.settings.backgroundPlain },
                    { value: "tinted", label: m.sheet.settings.backgroundTinted },
                  ]}
                  onChange={(background) => updateSheetSettings({ background })}
                />
                {canMark && (
                  <Choice
                    label={m.sheet.marks.show}
                    value={settings.showMarks}
                    options={[
                      { value: true, label: m.sheet.marks.showOn },
                      { value: false, label: m.sheet.marks.showOff },
                    ]}
                    onChange={(showMarks) => updateSheetSettings({ showMarks })}
                  />
                )}
                {canKeepAwake && (
                  <Choice
                    label={m.sheet.settings.keepAwake}
                    value={settings.keepAwake}
                    options={[
                      { value: true, label: m.sheet.settings.on },
                      { value: false, label: m.sheet.settings.off },
                    ]}
                    onChange={(keepAwake) => updateSheetSettings({ keepAwake })}
                  />
                )}
              </section>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The user's own capo for the song's arrangement. The chords on the sheet change with it. */
function CapoSetting({
  title,
  capo,
  ownCapo,
  chartCapo,
  error,
  onChange,
}: {
  title: string;
  capo: number;
  /** Null when the song uses the chart's capo. */
  ownCapo: number | null;
  chartCapo: number;
  error: string | null;
  onChange: (capo: number | null) => void;
}) {
  const { m, format, number } = useI18n();
  // A step to the chart's capo uses the chart's capo again, so a later change of the chart shows.
  const step = (next: number) => onChange(next === chartCapo ? null : next);
  const chartButton = (text: string) => (
    <button
      type="button"
      className="font-medium text-text underline"
      onClick={() => onChange(null)}
    >
      {text}
    </button>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <p className="truncate text-xs font-medium text-muted">{title}</p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={m.sheet.capo.lower}
          disabled={capo <= 0}
          onClick={() => step(Math.min(capo - 1, CAPO_MAX))}
        >
          <MinusIcon />
        </Button>
        <output aria-live="polite" className="flex-1 text-center text-sm tabular-nums">
          {capo === 0 ? m.sheet.capo.none : number(capo)}
        </output>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={m.sheet.capo.higher}
          disabled={capo >= CAPO_MAX}
          onClick={() => step(capo + 1)}
        >
          <PlusIcon />
        </Button>
      </div>
      <p className="text-xs text-muted">
        {ownCapo === null || ownCapo === chartCapo
          ? m.sheet.capo.fromChart
          : chartCapo === 0
            ? rich(m.sheet.capo.noChartCapo, { button: chartButton })
            : rich(format(m.sheet.capo.otherChartCapo, { capo: chartCapo }), {
                button: chartButton,
              })}{" "}
        {m.sheet.capo.hint}
      </p>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
