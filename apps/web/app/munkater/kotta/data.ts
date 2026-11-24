import "server-only";

import { getRequestI18n } from "@/i18n/music/server";
import { createI18n, type I18n } from "@/i18n/music/i18n";
import { isForArrangement } from "@/lib/music/attachments";
import { canonicalKey } from "@/lib/music/chords/key";
import type { FileView } from "@/lib/music/file-view";
import type { SheetMark } from "@/lib/music/sheet-marks";
import { firstParam } from "@/lib/music/song-filters";
import type { CurrentUser } from "@/server/music/auth";
import type { ArrangementDTO } from "@/server/music/models/arrangements";
import { listImagesOfSongs, type SongImageDTO } from "@/server/music/models/images";
import { listLinksOfSongs, type SongLinkDTO } from "@/server/music/models/links";
import {
  getMyArrangementSettings,
  type ArrangementSettingsDTO,
} from "@/server/music/models/my-arrangements";
import { getMyFileViews } from "@/server/music/models/my-file-views";
import { listPdfsOfSongs, type SongPdfDTO } from "@/server/music/models/pdfs";
import { listScoresOfSongs, type SongScoreDTO } from "@/server/music/models/scores";
import { listMySheetMarks } from "@/server/music/models/sheet-marks";
import {
  getSong,
  listArrangementsWithSongs,
  type SongSummaryDTO,
} from "@/server/music/models/songs";
import { listSoundFilesOfSongs, type SongSoundFileDTO } from "@/server/music/models/sound-files";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";
import type { SheetSong } from "./sheet-viewer";

/** The most songs on a sheet that is not saved (the most items of a setlist in the music app). */
const SHEET_MAX_ITEMS = 100;

export type SheetPageData = {
  /** A new value mounts the viewer again: another song or list of arrangements. */
  viewerKey: string;
  title: string;
  songs: SheetSong[];
  /** Song admins can save the tempo of the metronome to the arrangement. */
  canEditSongs: boolean;
  /** The back link when the URL has no `from`. */
  backHref: string;
  /** The modules of the chord sheet that are on (`ws.music.sheet.*`), by their id in the music app. */
  modules: Record<string, boolean>;
};

export type SheetNotFound = "noArrangement" | "song" | "songs";

type SearchParams = Record<string, string | string[] | undefined>;

// See `page.tsx` for the URLs. Each song shows with the signed-in user's capo, key, layout and
// marks for its arrangement. Events and live sessions come with later phases.
export async function loadSheetPage(
  user: CurrentUser,
  params: SearchParams,
): Promise<{ data: SheetPageData } | { notFound: SheetNotFound }> {
  const i18n = createI18n((await getRequestI18n()).m);
  const [marksOn, metronomeOn, midiOn, diagramsOn] = await Promise.all([
    isWorkspaceModuleOn("ws.music.sheet.marks"),
    isWorkspaceModuleOn("ws.music.sheet.metronome"),
    isWorkspaceModuleOn("ws.music.sheet.midi-out"),
    isWorkspaceModuleOn("ws.music.sheet.chord-diagrams"),
  ]);
  const modules = {
    "sheet.marks": marksOn,
    "sheet.metronome": metronomeOn,
    "sheet.midi-out": midiOn,
    "sheet.chord-diagrams": diagramsOn,
  };
  const listMarks = (arrangementIds: string[]) =>
    marksOn ? listMySheetMarks(arrangementIds) : Promise.resolve(new Map<string, SheetMark[]>());

  // One arrangement, or several in playing order: a list that is not saved. Each can have its key.
  let arrangementIds = [params.arrangement ?? []].flat().slice(0, SHEET_MAX_ITEMS);
  const keyParams = [params.key ?? []].flat();
  if (arrangementIds.length === 0) {
    const song = await getSong(firstParam(params.song) ?? "");
    // The default arrangement is first.
    const defaultArrangement = song?.arrangements[0];
    if (!defaultArrangement) return { notFound: song ? "noArrangement" : "song" };
    arrangementIds = [defaultArrangement.id];
  }

  const [[items, scores, { pdfs, images, soundFiles, links, fileViews }], settings, marks] =
    await Promise.all([
      // The files and the links need the songs of the arrangements, but not the settings or the marks.
      listArrangementsWithSongs(arrangementIds).then(async (items) => {
        const songIds = items.map(({ song }) => song.id);
        return [
          items,
          ...(await Promise.all([listScoresOfSongs(songIds), listFiles(songIds)])),
        ] as const;
      }),
      getMyArrangementSettings(arrangementIds),
      listMarks(arrangementIds),
    ]);
  if (items.length === 0) return { notFound: arrangementIds.length > 1 ? "songs" : "song" };

  // The key of each time of a song: `items` leaves out the arrangements that do not exist.
  let found = 0;
  const slotKeys = arrangementIds.flatMap((id, index) => {
    if (items[found]?.arrangement.id !== id) return [];
    found++;
    return [canonicalKey(keyParams[index])];
  });
  const single = items.length === 1 ? items[0] : null;
  return {
    data: {
      viewerKey: arrangementIds.join(),
      canEditSongs: user.canEditSongs,
      title: single ? single.song.title : i18n.m.sheet.page.setlist,
      // A song can come more than once: its id then has the number of the time, e.g. "<arrangement id>:2".
      songs: items.map(({ song, arrangement }, index) =>
        toSheetSong(i18n, occurrenceId(items, index), song, arrangement, {
          capo: settings.get(arrangement.id)?.capo ?? null,
          key: settings.get(arrangement.id)?.key ?? null,
          views: settings.get(arrangement.id)?.views ?? {},
          slotKey: slotKeys[index] ?? null,
          marks: marks.get(arrangement.id) ?? [],
          scores: scores.get(song.id) ?? [],
          pdfs: pdfs.get(song.id) ?? [],
          images: images.get(song.id) ?? [],
          soundFiles: soundFiles.get(song.id) ?? [],
          links: links.get(song.id) ?? [],
          fileViews,
          volunteer: null,
        }),
      ),
      backHref: single ? `/munkater/enektar?song=${single.song.id}` : "/munkater/enektar",
      modules,
    },
  };
}

/**
 * The PDF files, the images, the sound files and the links of the songs, and
 * the signed-in user's zoom of each PDF file and image.
 */
async function listFiles(songIds: string[]) {
  const [pdfs, images, soundFiles, links, fileViews] = await Promise.all([
    listPdfsOfSongs(songIds),
    listImagesOfSongs(songIds),
    listSoundFilesOfSongs(songIds),
    listLinksOfSongs(songIds),
    getMyFileViews(songIds),
  ]);
  return { pdfs, images, soundFiles, links, fileViews };
}

/**
 * `own` has the user's own capo, key and marks for the arrangement (null: the
 * chart's), `slotKey` the key of the event slot or the rehearsal, the
 * song's scores, PDFs, images, sound files and links, and the user's zoom of
 * the files.
 */
function toSheetSong(
  { m, format }: I18n,
  id: string,
  song: SongSummaryDTO,
  arrangement: ArrangementDTO,
  own: ArrangementSettingsDTO & {
    slotKey: string | null;
    marks: SheetMark[];
    scores: SongScoreDTO[];
    pdfs: SongPdfDTO[];
    images: SongImageDTO[];
    soundFiles: SongSoundFileDTO[];
    links: SongLinkDTO[];
    fileViews: Map<string, FileView>;
    /** The name of the volunteer of the event slot. */
    volunteer: string | null;
  },
): SheetSong {
  // The sheet shows the key first, in the user's note names.
  const details: string[] = [];
  if (arrangement.bpm) details.push(format(m.sheet.details.bpm, { bpm: arrangement.bpm }));
  if (arrangement.timeSignature) details.push(arrangement.timeSignature);
  const pdfs = own.pdfs.filter((pdf) => isForArrangement(pdf, arrangement.id));
  const images = own.images.filter((image) => isForArrangement(image, arrangement.id));

  return {
    kind: "song",
    id,
    arrangementId: arrangement.id,
    title: song.title,
    artist: song.artist,
    key: arrangement.key,
    otherKeys: arrangement.otherKeys,
    slotKey: own.slotKey,
    ownKey: own.key,
    views: own.views,
    bpm: arrangement.bpm,
    timeSignature: arrangement.timeSignature,
    details,
    capo: own.capo,
    arrangementName: arrangement.isDefault ? null : arrangement.name,
    chordpro: arrangement.chordpro,
    sectionOrder: arrangement.sectionOrder,
    notes: null,
    description: null,
    highlight: null,
    scripture: null,
    volunteer: own.volunteer,
    marks: own.marks,
    scores: own.scores,
    pdfs,
    images,
    soundFiles: own.soundFiles.filter((soundFile) => isForArrangement(soundFile, arrangement.id)),
    links: own.links.filter((link) => isForArrangement(link, arrangement.id)),
    fileViews: Object.fromEntries(
      [...pdfs, ...images].flatMap((file) => {
        const view = own.fileViews.get(file.id);
        return view ? [[file.id, view]] : [];
      }),
    ),
  };
}

/** The id of the song at `index` on the sheet of a setlist that is not saved: the arrangement, then ":2" for its second time, and so on. */
function occurrenceId(items: { arrangement: { id: string } }[], index: number): string {
  const id = items[index]!.arrangement.id;
  const times = items.slice(0, index + 1).filter((item) => item.arrangement.id === id).length;
  return times === 1 ? id : `${id}:${times}`;
}
