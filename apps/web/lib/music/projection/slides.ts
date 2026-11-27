import { parseChordPro, type ChordProLine } from "@/lib/music/chordpro";
import { sectionAnchors } from "@/lib/music/live/protocol";
import {
  MAX_PASSAGE_VERSES,
  type BibleBook,
  type ScriptureVerse,
} from "@/lib/music/scripture/passage";
import { bookAbbreviation } from "@/lib/music/scripture/books";
import { formatVerses, referenceStyle, type ReferenceStyle } from "@/lib/music/scripture/reference";
import type { ScriptureTranslation } from "@/lib/music/scripture/translations";
import type { SectionId, WeekGroupId } from "@/lib/music/announcements/schema";
import { sheetBlocks } from "@/lib/music/sheet-blocks";
import { PROJECTION_FONTS } from "./fonts";
import type { EventImageDTO, ImageAdjust } from "./images";
import { FALLBACK_LOOK, type ProjectionLook } from "./themes";

// The slides of a projection: what the screens show for each item of a
// setlist. The controller makes them, and each command carries the slide, so
// the screens need no data of their own (see `protocol.ts`).
//
// Each song starts with a title slide. Then each section comes in the
// playing order of the arrangement, also the repeats, with the lyrics only:
// no chords, comments or directives. A section that is too long for one
// screen at the smallest text size becomes more slides, e.g. "Verse 1 (1/2)".
// A text item, e.g. "Prayer", is a slide without text; only the stream
// overlay shows its title (`caption`). A text slide, e.g. "Prayer theme", is
// a slide without text, then its description and its highlighted text, on
// more slides when they do not fit (see `textSlideParts`); the title only
// names it. A scripture reading is
// a title slide with its reference, e.g. "John 3:16-21", and the name of the
// translation. Then each verse is a tile of its own; the controller can show
// more verses together (see `scriptureSlide`). A file has the verses as
// prose, as many on a slide as fit at the smallest text size; a verse is
// never split (see `presentationSlides`). Without the text (not loaded yet,
// or not a reference that the app can read), only the title slide. An image
// item has a slide for each of its images (see `images.ts`). An announcements
// item has the lists of its sections, as many entries on a slide as fit, then
// the own slides of its highlighted entries (see `src/lib/announcements/`).
// When the entries of "Next week" are on more than one of its days (the day
// of the event, the rest of the week, the same day of the next week), its
// list is an overview without the details, then each group has its own list.

/** What a screen shows. */
export type ProjectionSlide =
  | { kind: "title"; title: string; copyright: string | null }
  /** The paragraphs of a section, each a list of lines. No paragraphs: a section without lyrics, e.g. an intro. */
  | { kind: "lyrics"; paragraphs: string[][] }
  /**
   * Verses of a scripture reading as prose. `label`: the verse number, with
   * the chapter at a new chapter, e.g. "4,1". `reference`: e.g. "Jn 3,16-21 (Károli)".
   * `roll`: the roll view (see `scriptureRollSlide`). Left out: the page view.
   * A screen of an older version drops it and shows the page view.
   */
  | {
      kind: "scripture";
      verses: { label: string; text: string }[];
      reference: string;
      /**
       * `ids`: the tile ids of `verses`. `before` and `after`: the verses
       * around them, muted. `textSize`: in percent of the largest text size
       * of the look (see `ROLL_TEXT_SIZES`).
       */
      roll?: { ids: string[]; before: RollVerse[]; after: RollVerse[]; textSize: number };
    }
  /**
   * An image of the event's gallery, with its size in pixels and its
   * adjustments. With `qr`, the image is in 2/3 of the screen and the QR code
   * in the other third, at the `side` of the screen ("end": right, or bottom
   * on a portrait screen).
   */
  | {
      kind: "image";
      url: string;
      width: number;
      height: number;
      adjust: ImageAdjust;
      qr?: ProjectionQr & { side: QrSide };
    }
  /** A list of announcements: the title of its section, e.g. "Next week", and its days. */
  | { kind: "announcements"; heading: string; range: string; entries: AnnouncementLine[] }
  /** The own slide of an announcement: its title, its day and time, and its details. */
  | { kind: "announcement"; title: string; when: string | null; details: string[] }
  /** A QR code on the whole screen, with its caption. */
  | { kind: "qr"; text: string; caption: string | null }
  /**
   * A part of the text of a text slide. Each paragraph is a list of lines.
   * `highlight`: the paragraphs of the highlighted text after them, larger
   * and in the accent color.
   */
  | { kind: "text"; paragraphs: string[][]; highlight: string[][] }
  /**
   * No text, e.g. the first slide of a text item, or after the last slide.
   * `caption`: the title of a text item, only for the stream overlay. Not a
   * slide of its own: a screen of an older version knows only the blank slide.
   */
  | { kind: "blank"; caption?: string };

/** An entry of a list of announcements. `when`: its days and time. `details`: its place and its description. `accent`: highlighted. */
export type AnnouncementLine = { when: string; title: string; details: string[]; accent: boolean };

/** A verse around the live verses of the roll view. `id`: the id of its tile, e.g. "3:16", the same in each state. */
export type RollVerse = { id: string; label: string; text: string };

/** The most verses before and after the live verses of the roll view. */
export const ROLL_CONTEXT = 3;

/**
 * The text sizes of the roll view, in percent of the largest text size of
 * the look. The roll has one size, so a step only moves the text; it gets
 * smaller only for live verses that do not fit.
 */
export const ROLL_TEXT_SIZES = [50, 60, 70, 80, 90, 100] as const;
export const ROLL_TEXT_SIZE_DEFAULT = 80;

/** A QR code with the text in it (e.g. a web address) and a caption, e.g. "Register here". */
export type ProjectionQr = { text: string; caption: string | null };

export type QrSide = "start" | "end";

/**
 * The own slides of a highlighted announcement. `id`: short, the same on each
 * controller (see `ProjectionTile.id`). `images`: the pages of its attachment.
 * They replace the text slide, unless `textFirst`. Without images, its QR
 * code comes on a slide of its own after the text slide.
 */
export type AnnouncementSlides = {
  id: string;
  title: string;
  when: string | null;
  details: string[];
  /** The set of the attachment, so the controller can follow its changes. */
  imageSetId: string | null;
  images: EventImageDTO[];
  qr: ProjectionQr | null;
  qrSide: QrSide | null;
  textFirst: boolean;
};

/** A group of the section "Next week" with its entries. */
export type AnnouncementGroup = {
  id: WeekGroupId;
  heading: string;
  range: string;
  entries: AnnouncementLine[];
};

/**
 * A section of an announcements item with its entries. With `groups`, the
 * entries are an overview of the whole section without their details, and
 * each group has its own list after it.
 */
export type AnnouncementSection = {
  id: SectionId;
  heading: string;
  range: string;
  entries: AnnouncementLine[];
  groups?: AnnouncementGroup[];
};

/** The longest reference of a scripture slide, in code points. */
export const SCRIPTURE_REFERENCE_MAX_LENGTH = 300;

export type ProjectionTile = {
  /** The same on each controller, also with another split: "title", the section and the part, e.g. "2.0", or a verse, e.g. "3:16". */
  id: string;
  /** The section label, e.g. "Verse 1". Null for the title slide and for lyrics outside the sections. */
  label: string | null;
  /** The part of a long section, from 0. */
  part: number;
  /** The number of parts of the section. 1 when it fits on one slide. */
  parts: number;
  /** The name of the section in a live session (see `sectionAnchors`). Null when it has none. */
  anchor: string | null;
  slide: ProjectionSlide;
  /** The verse of a tile of a scripture reading. */
  verse?: ScriptureVerse;
};

/** An item of the setlist as the controller gets it. */
export type ProjectionSource =
  | {
      kind: "song";
      /** The setlist item (an event) or the row of the draft (a rehearsal). */
      key: string;
      title: string;
      copyright: string | null;
      chordpro: string;
      sectionOrder: string[];
      /** The book and the number of the song in it, for the setlist of the controller. Not on the slides. */
      songbook?: string | null;
      /** The performer, for the setlist of the controller. Not on the slides. */
      artist?: string | null;
      /** The authors of the lyrics and the music, for the setlist of the controller. Not on the slides. */
      authors?: string | null;
      /** The projection theme of the item. Null or left out: the theme of the arrangement or of the event. */
      themeId?: string | null;
      /** The projection theme of the arrangement. Null or left out: the theme of the event. */
      arrangementThemeId?: string | null;
    }
  /**
   * With `scripture`, the title is the reference of a scripture reading.
   * `translation`: its translation (see `TRANSLATIONS`); null or left out
   * for the default one.
   */
  | {
      kind: "text";
      key: string;
      title: string;
      scripture?: boolean;
      translation?: string | null;
      themeId?: string | null;
    }
  /** A text slide of an event: its title names it, its description and its highlighted text show. */
  | {
      kind: "textSlide";
      key: string;
      title: string;
      description: string | null;
      highlight: string | null;
      themeId?: string | null;
    }
  /**
   * An image item of an event: a slide for each image of its set, in order.
   * Without images yet (e.g. while they upload), one blank slide.
   */
  | {
      kind: "images";
      key: string;
      title: string;
      imageSetId: string;
      images: EventImageDTO[];
      themeId?: string | null;
    }
  /**
   * An announcements item of an event, as the controller shows it: the
   * sections that have entries, and the own slides. Without either, one blank slide.
   */
  | {
      kind: "announcements";
      key: string;
      title: string;
      sections: AnnouncementSection[];
      own: AnnouncementSlides[];
      themeId?: string | null;
    };

/** The text of a scripture reading. The controller loads it (see `loadBibleBook`). */
export type ProjectionPassage = { translation: ScriptureTranslation; verses: ScriptureVerse[] };

export type ProjectionItem = {
  kind: ProjectionSource["kind"];
  key: string;
  title: string;
  /** A text item that is a scripture reading. */
  scripture: boolean;
  /**
   * A song: the title slide first. A text item: one blank slide with its
   * title as the caption. A text slide: a blank slide, then its text. A scripture reading:
   * the title slide, then the verses. An image item: an image slide for each
   * image.
   */
  tiles: ProjectionTile[];
  /** A song with lyrics to project. False for a text item. */
  hasLyrics: boolean;
  /** The look of its projection theme. The tiles are split for it. */
  look: ProjectionLook;
  /** A scripture reading with its text: how the slides of its verses name them (see `scriptureSlide`). */
  scriptureFormat?: ScriptureFormat;
};

/** The reference style of a scripture reading as the user typed it, and the short name of its translation. */
export type ScriptureFormat = ReferenceStyle & { translation: string };

// The text sizes of a slide as parts of the screen height. The screen makes
// the text as large as possible up to `maxFont`, and smaller until it fits.
// The controller splits a section that does not fit at `minFont`: below it,
// text is too small to read from the back of the room. `SMALL_FONT` is the
// copyright on a title slide, and the reference under the verses in the
// default look.
export const SMALL_FONT = 0.028;

export const SLIDE_LAYOUT = {
  maxFont: 1 / 9,
  minFont: 1 / 16,
  /** The text size of the reference under the verses. */
  referenceFont: SMALL_FONT,
  /** In em. */
  lineHeight: 1.25,
  /** The space between two paragraphs, in em. */
  paragraphGap: 0.6,
  /** The space at each side of the screen, as a part of the screen height. */
  padding: 0.06,
  /** The average width of a character of the font, in em. An estimate, a little too large. */
  charWidth: 0.55,
};

export type SlideLayout = typeof SLIDE_LAYOUT;

/**
 * The layout of a slide with a look (see `ProjectionLook`): its text sizes,
 * margin and font. The default look gives `SLIDE_LAYOUT`. The smallest text
 * is never larger than the largest one.
 */
export function slideLayout(look: ProjectionLook): SlideLayout {
  const maxFont = (SLIDE_LAYOUT.maxFont * look.textSize) / 100;
  return {
    ...SLIDE_LAYOUT,
    maxFont,
    minFont: Math.min(SLIDE_LAYOUT.minFont, maxFont),
    // In this order, 100 gives `SMALL_FONT` exactly.
    referenceFont: (look.referenceSize / 100) * SMALL_FONT,
    padding: look.margin / 100,
    charWidth: PROJECTION_FONTS[look.font].charWidth,
  };
}

/** Width / height of the screens. The default when the controller knows no screen. */
export const DEFAULT_ASPECT_RATIO = 16 / 9;

/**
 * The tiles of each item, for screens with the aspect ratio `aspectRatio`
 * (width / height). `passages`: the text of the scripture readings, by the
 * key of the item. `lookOf`: the look of the projection theme of an item
 * (see `resolveLook`); the long sections are split for it.
 */
export function buildProjectionItems(
  sources: ProjectionSource[],
  aspectRatio: number,
  passages: ReadonlyMap<string, ProjectionPassage> = new Map(),
  lookOf: (source: ProjectionSource) => ProjectionLook = () => FALLBACK_LOOK,
): ProjectionItem[] {
  return sources.map((source) => {
    const look = lookOf(source);
    const layout = slideLayout(look);
    if (source.kind === "images") {
      const tiles = source.images.map((image): ProjectionTile => ({
        id: image.id,
        label: image.name,
        part: 0,
        parts: 1,
        anchor: null,
        slide: {
          kind: "image",
          url: image.url,
          width: image.width,
          height: image.height,
          adjust: image.adjust,
        },
      }));
      const blank: ProjectionTile = {
        id: "blank",
        label: null,
        part: 0,
        parts: 1,
        anchor: null,
        slide: { kind: "blank" },
      };
      return {
        kind: "images",
        key: source.key,
        title: source.title,
        scripture: false,
        tiles: tiles.length > 0 ? tiles : [blank],
        hasLyrics: false,
        look,
      };
    }
    if (source.kind === "announcements") {
      const tiles = announcementTiles(source, aspectRatio, layout);
      const blank: ProjectionTile = {
        id: "blank",
        label: null,
        part: 0,
        parts: 1,
        anchor: null,
        slide: { kind: "blank" },
      };
      return {
        kind: "announcements",
        key: source.key,
        title: source.title,
        scripture: false,
        tiles: tiles.length > 0 ? tiles : [blank],
        hasLyrics: false,
        look,
      };
    }
    if (source.kind === "textSlide") {
      const blank: ProjectionTile = {
        id: "blank",
        label: null,
        part: 0,
        parts: 1,
        anchor: null,
        slide: { kind: "blank" },
      };
      const parts = textSlideParts(
        textParagraphs(source.description),
        textParagraphs(source.highlight),
        aspectRatio,
        layout,
      );
      const tiles = parts.map((slide, part, all): ProjectionTile => ({
        id: `text.${part}`,
        label: null,
        part,
        parts: all.length,
        anchor: null,
        slide,
      }));
      return {
        kind: "textSlide",
        key: source.key,
        title: source.title,
        scripture: false,
        tiles: [blank, ...tiles],
        hasLyrics: false,
        look,
      };
    }
    if (source.kind === "text") {
      const scripture = source.scripture ?? false;
      if (!scripture) {
        const blank: ProjectionTile = {
          id: "blank",
          label: null,
          part: 0,
          parts: 1,
          anchor: null,
          slide: { kind: "blank", ...(source.title && { caption: source.title }) },
        };
        return {
          kind: "text",
          key: source.key,
          title: source.title,
          scripture,
          tiles: [blank],
          hasLyrics: false,
          look,
        };
      }
      const passage = passages.get(source.key);
      const copyright = passage
        ? [passage.translation.name, passage.translation.notice]
            .filter((line) => line !== null)
            .join("\n")
        : null;
      const title: ProjectionTile = {
        id: "title",
        label: null,
        part: 0,
        parts: 1,
        anchor: null,
        slide: { kind: "title", title: source.title, copyright },
      };
      const style = passage ? referenceStyle(source.title) : null;
      const scriptureFormat =
        passage && style ? { ...style, translation: passage.translation.shortName } : undefined;
      const verses = passage && scriptureFormat ? scriptureTiles(passage, scriptureFormat) : [];
      return {
        kind: "text",
        key: source.key,
        title: source.title,
        scripture,
        tiles: [title, ...verses],
        hasLyrics: false,
        look,
        ...(scriptureFormat && { scriptureFormat }),
      };
    }

    const title: ProjectionTile = {
      id: "title",
      label: null,
      part: 0,
      parts: 1,
      anchor: null,
      slide: { kind: "title", title: source.title, copyright: source.copyright },
    };
    const sections = lyricSections(source.chordpro, source.sectionOrder).flatMap((section, index) =>
      splitSection(section.paragraphs, aspectRatio, layout).map(
        (paragraphs, part, all): ProjectionTile => ({
          id: `${index}.${part}`,
          label: section.label,
          part,
          parts: all.length,
          anchor: section.anchor,
          slide: { kind: "lyrics", paragraphs },
        }),
      ),
    );
    return {
      kind: "song",
      key: source.key,
      title: source.title,
      scripture: false,
      tiles: [title, ...sections],
      hasLyrics: sections.some(
        (tile) => tile.slide.kind === "lyrics" && tile.slide.paragraphs.length > 0,
      ),
      look,
    };
  });
}

const SECTION_TILE_IDS: Record<SectionId, string> = {
  nextWeek: "nw",
  thisMonth: "tm",
  nextMonth: "nm",
};
const GROUP_TILE_IDS: Record<WeekGroupId, string> = {
  eventDay: "nwd",
  restOfWeek: "nww",
  nextEventDay: "nwn",
};

/**
 * The tiles of an announcements item: "nw.0", "nw.1"… for the parts of the
 * list of a section, "nwd.0"… for the parts of the list of a group after
 * it, then for each own entry "<id>.t" for its text slide, "<id>.1"… for
 * the pages of its attachment and "<id>.qr" for its QR code.
 */
function announcementTiles(
  source: Extract<ProjectionSource, { kind: "announcements" }>,
  aspectRatio: number,
  layout: SlideLayout,
): ProjectionTile[] {
  const list = (prefix: string, { heading, range, entries }: Omit<AnnouncementGroup, "id">) =>
    splitAnnouncements(entries, aspectRatio, layout).map((part, index, all): ProjectionTile => ({
      id: `${prefix}.${index}`,
      label: heading,
      part: index,
      parts: all.length,
      anchor: null,
      slide: { kind: "announcements", heading, range, entries: part },
    }));
  const lists = source.sections.flatMap((section) => [
    ...list(SECTION_TILE_IDS[section.id], section),
    ...(section.groups ?? []).flatMap((group) => list(GROUP_TILE_IDS[group.id], group)),
  ]);
  const own = source.own.flatMap((entry): ProjectionTile[] => {
    const tile = (id: string, slide: ProjectionSlide, part = 0, parts = 1): ProjectionTile => ({
      id: `${entry.id}.${id}`,
      label: entry.title,
      part,
      parts,
      anchor: null,
      slide,
    });
    const text = tile("t", {
      kind: "announcement",
      title: entry.title,
      when: entry.when,
      details: entry.details,
    });
    if (entry.images.length === 0)
      return entry.qr ? [text, tile("qr", { kind: "qr", ...entry.qr })] : [text];
    const qr = entry.qr && { ...entry.qr, side: entry.qrSide ?? "end" };
    const pages = entry.images.map((image, index) =>
      tile(
        `${index + 1}`,
        {
          kind: "image",
          url: image.url,
          width: image.width,
          height: image.height,
          adjust: image.adjust,
          ...(qr && { qr }),
        },
        index,
        entry.images.length,
      ),
    );
    return entry.textFirst ? [text, ...pages] : pages;
  });
  return [...lists, ...own];
}

/** The part of the screen height above a list of announcements: its heading and its days. */
export const ANNOUNCEMENT_HEADER = 0.16;

/** The space for the entries of a list of announcements: all but the padding and the header. */
export function announcementListSpace(layout: SlideLayout = SLIDE_LAYOUT): number {
  return 1 - 2 * layout.padding - ANNOUNCEMENT_HEADER;
}

/** The lines of an entry of a list, for the estimate of its size. */
function announcementParagraph(line: AnnouncementLine): string[] {
  return [`${line.when}  ${line.title}`, ...line.details.flatMap((detail) => detail.split("\n"))];
}

/**
 * The entries of a list of announcements in parts that fit at the smallest
 * text size, in order. An entry that does not fit alone gets a part of its
 * own: the screen makes it smaller.
 */
export function splitAnnouncements(
  entries: AnnouncementLine[],
  aspectRatio: number,
  layout: SlideLayout = SLIDE_LAYOUT,
): AnnouncementLine[][] {
  const space = announcementListSpace(layout);
  const parts: AnnouncementLine[][] = [];
  for (const entry of entries) {
    const part = parts.at(-1);
    if (
      part &&
      fits([...part, entry].map(announcementParagraph), aspectRatio, layout.minFont, space, layout)
    )
      part.push(entry);
    else parts.push([entry]);
  }
  return parts;
}

/** A tile for each verse, e.g. "3,16". */
function scriptureTiles(passage: ProjectionPassage, format: ScriptureFormat): ProjectionTile[] {
  return passage.verses.map((verse) => ({
    // A verse of another book, after "Load more", has its book: e.g. "Acts.1:1".
    id: `${verse.book ? `${verse.book}.` : ""}${verse.chapter}:${verse.verse}`,
    label: verseLabel(format, verse, true),
    part: 0,
    parts: 1,
    anchor: null,
    slide: scriptureSlide(format, [verse]),
    verse,
  }));
}

/** The key of the item of a book in the Bible panel of the controller. A setlist item cannot have it. */
export function bibleItemKey(translation: string, book: string): string {
  return `bible:${translation}/${book}`;
}

export function isBibleItemKey(key: string): boolean {
  return key.startsWith("bible:");
}

/**
 * The item of a book in the Bible panel of the controller: a tile for each
 * verse of the book, without a title slide. The references are in the style
 * of the language of the translation: "Jn 3,16" for Hungarian, else "John 3:16".
 */
export function bibleBookItem(
  translation: ScriptureTranslation,
  book: string,
  text: BibleBook,
  look: ProjectionLook,
): ProjectionItem {
  const english = translation.language !== "hu";
  const format: ScriptureFormat = {
    book: bookAbbreviation(book, english),
    english,
    translation: translation.shortName,
  };
  const verses = text.chapters.flatMap((texts, chapterIndex) =>
    texts.flatMap((verseText, verseIndex) =>
      verseText ? [{ chapter: chapterIndex + 1, verse: verseIndex + 1, text: verseText }] : [],
    ),
  );
  return {
    kind: "text",
    key: bibleItemKey(translation.id, book),
    title: format.book,
    scripture: true,
    tiles: scriptureTiles({ translation, verses }, format),
    hasLyrics: false,
    look,
    scriptureFormat: format,
  };
}

/** The label of a verse after `previous`: with the chapter and the book in another chapter or book (see `verseLabel`). */
function verseLabelAfter(
  format: ScriptureFormat,
  previous: ScriptureVerse | undefined,
  verse: ScriptureVerse,
): string {
  const newPlace =
    previous !== undefined && (previous.chapter !== verse.chapter || previous.book !== verse.book);
  return newPlace ? verseLabel(format, verse, true) : `${verse.verse}`;
}

/** "16", or with the chapter "4,1", or with the book of a verse of another book "ApCsel 1,1". */
function verseLabel(format: ScriptureFormat, verse: ScriptureVerse, withChapter: boolean): string {
  const place = `${verse.chapter}${format.english ? ":" : ","}${verse.verse}`;
  if (verse.book) return `${bookAbbreviation(verse.book, format.english)} ${place}`;
  return withChapter ? place : `${verse.verse}`;
}

/**
 * The slide of one verse or of more verses together, in their order, with
 * their reference under them, e.g. "Jn 3,16–18 (Károli)". A verse in another
 * chapter or book than the verse before it has the chapter in its label,
 * e.g. "4,1", and the book, e.g. "ApCsel 1,1". At most the last
 * `MAX_PASSAGE_VERSES` verses, and a reference of at most
 * `SCRIPTURE_REFERENCE_MAX_LENGTH`: the screens do not accept more (see
 * `protocol.ts`).
 */
export function scriptureSlide(
  format: ScriptureFormat,
  allVerses: ScriptureVerse[],
): Extract<ProjectionSlide, { kind: "scripture" }> {
  const verses = allVerses.slice(-MAX_PASSAGE_VERSES);
  const reference = Array.from(`${formatVerses(format, verses)} (${format.translation})`);
  return {
    kind: "scripture",
    verses: verses.map((verse, index) => ({
      label: verseLabelAfter(format, verses[index - 1], verse),
      text: verse.text,
    })),
    reference:
      reference.length > SCRIPTURE_REFERENCE_MAX_LENGTH
        ? `${reference.slice(0, SCRIPTURE_REFERENCE_MAX_LENGTH - 1).join("")}…`
        : reference.join(""),
  };
}

/**
 * The slide of verse tiles of an item in the roll view: the verses, and up to
 * `ROLL_CONTEXT` verse tiles of the item before and after them. Each label
 * comes from the verse before it in the item, so a verse has the same label
 * in each state, e.g. "4,1" also as the first live verse, and "2" also after
 * a gap in the live verses. A setlist reading
 * rolls inside its passage, a book of the Bible panel through the book.
 * `textSize`: see `ROLL_TEXT_SIZES`. Without verses or without the text of
 * the item: null.
 */
export function scriptureRollSlide(
  item: ProjectionItem,
  tiles: ProjectionTile[],
  textSize: number = ROLL_TEXT_SIZE_DEFAULT,
): ProjectionSlide | null {
  const format = item.scriptureFormat;
  const all = item.tiles
    .flatMap((tile) => (tile.verse ? [{ id: tile.id, tile, verse: tile.verse }] : []))
    .map((entry, index) => ({ ...entry, index }));
  const live = all.filter(({ tile }) => tiles.includes(tile)).slice(-MAX_PASSAGE_VERSES);
  if (!format || live.length === 0) return null;
  const first = live[0]!.index;
  const last = live[live.length - 1]!.index;
  const rollVerses = (entries: typeof all) =>
    entries.map(({ id, verse, index }): RollVerse => ({
      id,
      label: verseLabelAfter(format, all[index - 1]?.verse, verse),
      text: verse.text,
    }));
  const verses = rollVerses(live);
  return {
    ...scriptureSlide(
      format,
      live.map(({ verse }) => verse),
    ),
    verses: verses.map(({ label, text }) => ({ label, text })),
    roll: {
      ids: verses.map(({ id }) => id),
      before: rollVerses(all.slice(Math.max(0, first - ROLL_CONTEXT), first)),
      after: rollVerses(all.slice(last + 1, last + 1 + ROLL_CONTEXT)),
      textSize,
    },
  };
}

/**
 * The slides of the items in order, for a file: the tiles, but the verses of
 * a scripture reading together, as many on a slide as fit (see `splitVerses`).
 */
export function presentationSlides(
  items: ProjectionItem[],
  aspectRatio: number,
): { item: ProjectionItem; slide: ProjectionSlide }[] {
  return items.flatMap((item) => {
    const format = item.scriptureFormat;
    if (!format) return item.tiles.map((tile) => ({ item, slide: tile.slide }));
    const verses = item.tiles.flatMap((tile) =>
      tile.verse
        ? [{ label: `${tile.verse.verse}`, text: tile.verse.text, verse: tile.verse }]
        : [],
    );
    return [
      ...item.tiles.filter((tile) => !tile.verse).map((tile) => ({ item, slide: tile.slide })),
      ...splitVerses(verses, aspectRatio, slideLayout(item.look)).map((part) => ({
        item,
        slide: scriptureSlide(
          format,
          part.map(({ verse }) => verse),
        ),
      })),
    ];
  });
}

/** The space for the verses: all but the padding and the reference under them. */
export function scriptureTextSpace(layout: SlideLayout = SLIDE_LAYOUT): number {
  // The gap above the reference stays the same at each size.
  return 1 - 2 * layout.padding - layout.referenceFont * layout.lineHeight - SMALL_FONT * 0.7;
}

/** `scriptureTextSpace()` of the default layout. */
export const SCRIPTURE_TEXT_SPACE = scriptureTextSpace();

/**
 * The verses in parts that fit at the smallest text size, in order. A verse
 * that does not fit alone gets a part of its own: the screen makes it smaller.
 */
export function splitVerses<Verse extends { label: string; text: string }>(
  verses: Verse[],
  aspectRatio: number,
  layout: SlideLayout = SLIDE_LAYOUT,
): Verse[][] {
  const space = scriptureTextSpace(layout);
  const parts: Verse[][] = [];
  for (const verse of verses) {
    const part = parts.at(-1);
    // One paragraph: the verses run on.
    const prose = [...(part ?? []), verse].map(({ label, text }) => `${label} ${text}`).join(" ");
    if (part && fits([[prose]], aspectRatio, layout.minFont, space, layout)) part.push(verse);
    else parts.push([verse]);
  }
  return parts;
}

type LyricSection = {
  label: string | null;
  anchor: string | null;
  paragraphs: string[][];
  /** The lines of a section after a `{chorus}` in it. */
  continued?: boolean;
};

/**
 * The sections of a chart in playing order, with the lyrics of each in
 * paragraphs. Lines outside the sections go with the section before them,
 * as on the chord sheet. `{chorus}` (play the last chorus again) is a
 * section of its own.
 */
export function lyricSections(chordpro: string, sectionOrder: string[]): LyricSection[] {
  const blocks = sheetBlocks(parseChordPro(chordpro), sectionOrder, "arrangement");
  const anchors = sectionAnchors(blocks.map((block) => block.section));
  const sections: LyricSection[] = [];
  let current: LyricSection | null = null;

  for (const [index, block] of blocks.entries()) {
    if (block.section || !current) {
      current = { label: block.section?.label ?? null, anchor: anchors[index]!, paragraphs: [] };
      sections.push(current);
    } else if (current.paragraphs.at(-1)?.length) {
      // Another part of the chart starts a new paragraph.
      current.paragraphs.push([]);
    }
    for (const line of block.lines) {
      if (line.kind === "chorus") {
        if (!line.lines) continue;
        sections.push({ label: line.label, anchor: null, paragraphs: paragraphsOf(line.lines) });
        // The lines after `{chorus}` go on with the section.
        current = { label: current!.label, anchor: null, paragraphs: [], continued: true };
        sections.push(current);
      } else {
        addLine(current!.paragraphs, line);
      }
    }
  }

  // A section without lyrics stays, e.g. an intro: the screen shows no text
  // while it plays. Not the lyrics outside the sections without lines, e.g.
  // only a comment, or the end of a section after `{chorus}`.
  return sections.flatMap(({ label, anchor, paragraphs, continued }) => {
    const lyrics = paragraphs.filter((paragraph) => paragraph.length > 0);
    return (label !== null && !continued) || lyrics.length > 0
      ? [{ label, anchor, paragraphs: lyrics }]
      : [];
  });
}

function paragraphsOf(lines: ChordProLine[]): string[][] {
  const paragraphs: string[][] = [];
  for (const line of lines) addLine(paragraphs, line);
  return paragraphs;
}

/** Adds a line to the paragraphs: an empty line ends a paragraph. Only lyrics show. */
function addLine(paragraphs: string[][], line: ChordProLine) {
  if (line.kind === "empty" || line.kind === "break") {
    if (paragraphs.at(-1)?.length) paragraphs.push([]);
    return;
  }
  if (line.kind !== "lyrics") return;
  const text = lyricText(line);
  // A line of chords only.
  if (!text) return;
  const last = paragraphs.at(-1);
  if (last) last.push(text);
  else paragraphs.push([text]);
}

/** The lyrics of a line without its chords and remarks. */
function lyricText(line: Extract<ChordProLine, { kind: "lyrics" }>) {
  return line.segments
    .map((segment) => segment.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The paragraphs of a section on as few slides as possible: each must fit at
 * the smallest text size. The lines are spread evenly over the slides.
 */
export function splitSection(
  paragraphs: string[][],
  aspectRatio: number,
  layout: SlideLayout = SLIDE_LAYOUT,
): string[][][] {
  const clean = paragraphs.filter((paragraph) => paragraph.length > 0);
  const lines = clean.flatMap((paragraph, index) =>
    paragraph.map((text, line) => ({ text, newParagraph: index > 0 && line === 0 })),
  );
  if (fits(clean, aspectRatio, layout.minFont, undefined, layout)) return [clean];

  for (let count = 2; count < lines.length; count++) {
    const parts = spread(lines, count, aspectRatio, layout);
    if (parts.every((part) => fits(part, aspectRatio, layout.minFont, undefined, layout)))
      return parts;
  }
  // Each line on its own slide. The screen makes a very long line smaller.
  return lines.map(({ text }) => [[text]]);
}

type Line = { text: string; newParagraph: boolean };

/** The lines in `count` parts with about the same height. A part starts at a paragraph when one is near. */
function spread(
  lines: Line[],
  count: number,
  aspectRatio: number,
  layout: SlideLayout,
): string[][][] {
  const rowsPerChar = 1 / charsPerRow(aspectRatio, layout.minFont, layout);
  const heights = lines.map(({ text }) => Math.max(1, Math.ceil(text.length * rowsPerChar)));
  const total = heights.reduce((sum, height) => sum + height, 0);

  const parts: Line[][] = [];
  let part: Line[] = [];
  let partHeight = 0;
  let done = 0;
  lines.forEach((line, index) => {
    const remaining = count - parts.length;
    const target = (total - done) / remaining;
    // A new part at the target height, or one line before it at the start of a paragraph.
    const full =
      partHeight >= target || (line.newParagraph && partHeight + heights[index]! > target);
    if (part.length > 0 && remaining > 1 && full) {
      parts.push(part);
      done += partHeight;
      part = [];
      partHeight = 0;
    }
    part.push(line);
    partHeight += heights[index]!;
  });
  parts.push(part);

  return parts.map((partLines) => {
    const paragraphs: string[][] = [];
    partLines.forEach((line, index) => {
      if (index === 0 || line.newParagraph) paragraphs.push([line.text]);
      else paragraphs[paragraphs.length - 1]!.push(line.text);
    });
    return paragraphs;
  });
}

/** About how many characters fit in one row of a slide at the text size `font`. */
function charsPerRow(aspectRatio: number, font: number, layout: SlideLayout) {
  const width = aspectRatio - 2 * layout.padding;
  return Math.max(1, Math.floor(width / (font * layout.charWidth)));
}

/**
 * Whether the paragraphs fit on a slide at the text size `font` (a part of
 * the screen height). An estimate. `space`: the height for the text, as a
 * part of the screen height; by default all but the padding. `layout`: the
 * layout of the look of the slide (see `slideLayout`).
 */
export function fits(
  paragraphs: string[][],
  aspectRatio: number,
  font: number,
  space?: number,
  layout: SlideLayout = SLIDE_LAYOUT,
): boolean {
  return textHeight(paragraphs, aspectRatio, font, layout) <= (space ?? 1 - 2 * layout.padding);
}

/**
 * The largest text size from `low` to `high` at which `fitsAt` is true, or
 * `low`: a binary search, for the screens that measure their text.
 */
export function largestFit(low: number, high: number, fitsAt: (size: number) => boolean): number {
  if (fitsAt(high)) return high;
  for (let step = 0; step < 12; step++) {
    const middle = (low + high) / 2;
    if (fitsAt(middle)) low = middle;
    else high = middle;
  }
  return low;
}

/** The estimated height of the paragraphs at the text size `font`, as a part of the screen height (see `fits`). */
function textHeight(
  paragraphs: string[][],
  aspectRatio: number,
  font: number,
  layout: SlideLayout,
): number {
  const perRow = charsPerRow(aspectRatio, font, layout);
  const rows = paragraphs
    .flat()
    .reduce((sum, text) => sum + Math.max(1, Math.ceil(text.length / perRow)), 0);
  const gaps = Math.max(0, paragraphs.length - 1);
  return (rows * layout.lineHeight + gaps * layout.paragraphGap) * font;
}

/** The size of the highlighted text of a text slide, in em of its other text. */
export const HIGHLIGHT_SCALE = 1.25;

/**
 * The paragraphs of a text that a user typed: an empty line starts a new
 * paragraph. Without the empty lines and the spaces at the ends of the lines.
 */
export function textParagraphs(text: string | null): string[][] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== ""),
    )
    .filter((paragraph) => paragraph.length > 0);
}

/**
 * The slides of a text slide: its description and its highlighted text, each
 * split as a section of a song (see `splitSection`), the highlighted text at
 * its larger size. Its first part goes on the last part of the description
 * when it fits there. Without either, no slides.
 */
export function textSlideParts(
  description: string[][],
  highlight: string[][],
  aspectRatio: number,
  layout: SlideLayout = SLIDE_LAYOUT,
): Extract<ProjectionSlide, { kind: "text" }>[] {
  const parts = description.length > 0 ? splitSection(description, aspectRatio, layout) : [];
  const slides = parts.map((paragraphs) => ({
    kind: "text" as const,
    paragraphs,
    highlight: [] as string[][],
  }));
  if (highlight.length === 0) return slides;
  const highlightLayout = { ...layout, minFont: layout.minFont * HIGHLIGHT_SCALE };
  const [first, ...rest] = splitSection(highlight, aspectRatio, highlightLayout) as [
    string[][],
    ...string[][][],
  ];
  const last = slides.at(-1);
  if (last && fitsTextSlide({ ...last, highlight: first }, aspectRatio, layout.minFont, layout))
    last.highlight = first;
  else slides.push({ kind: "text", paragraphs: [], highlight: first });
  return [
    ...slides,
    ...rest.map((paragraphs) => ({ kind: "text" as const, paragraphs: [], highlight: paragraphs })),
  ];
}

/** Whether a text slide fits at the text size `font`, with its highlighted text larger (see `fits`). */
export function fitsTextSlide(
  slide: Extract<ProjectionSlide, { kind: "text" }>,
  aspectRatio: number,
  font: number,
  layout: SlideLayout = SLIDE_LAYOUT,
): boolean {
  const gap =
    slide.paragraphs.length > 0 && slide.highlight.length > 0 ? layout.paragraphGap * font : 0;
  const height =
    textHeight(slide.paragraphs, aspectRatio, font, layout) +
    gap +
    textHeight(slide.highlight, aspectRatio, font * HIGHLIGHT_SCALE, layout);
  return height <= 1 - 2 * layout.padding;
}

/** The tiles of all items in order, for the keys that go to the next and the previous slide. */
export function tileSequence(
  items: ProjectionItem[],
): { item: ProjectionItem; tile: ProjectionTile }[] {
  return items.flatMap((item) => item.tiles.map((tile) => ({ item, tile })));
}

/**
 * The tile of `tileId` in the item, or the nearest: another controller can
 * split a long section in another way, e.g. for another aspect ratio.
 */
export function findTile(item: ProjectionItem, tileId: string): ProjectionTile | null {
  const exact = item.tiles.find((tile) => tile.id === tileId);
  if (exact) return exact;
  const [section, part] = tileId.split(".");
  const sameSection = item.tiles.filter((tile) => tile.id.split(".")[0] === section);
  return sameSection[Math.min(Number(part) || 0, sameSection.length - 1)] ?? null;
}

/**
 * The tile of a section of a live session (see `sectionAnchors`), or the
 * title slide. `written`: the leader's sheet shows the sections as written,
 * so the number in the anchor does not count the repeats of the arrangement.
 * Then it is the first section with that label from the section of `from`
 * (the tile on the screens), else the first one.
 */
export function tileOfAnchor(
  item: ProjectionItem,
  anchor: string | null,
  { written = false, from = null }: { written?: boolean; from?: ProjectionTile | null } = {},
): ProjectionTile {
  if (!anchor) return item.tiles[0]!;
  if (!written) return item.tiles.find((tile) => tile.anchor === anchor) ?? item.tiles[0]!;
  const label = anchorLabel(anchor);
  const sections = item.tiles.filter(
    (tile) => tile.part === 0 && tile.anchor !== null && anchorLabel(tile.anchor) === label,
  );
  const start = from ? sectionIndex(from) : -1;
  return sections.find((tile) => sectionIndex(tile) >= start) ?? sections[0] ?? item.tiles[0]!;
}

/** "chorus" for "chorus#2". */
function anchorLabel(anchor: string): string {
  return anchor.slice(0, anchor.lastIndexOf("#"));
}

/** The section of a tile in the playing order (see `ProjectionTile.id`). -1 for a title or a blank slide. */
function sectionIndex(tile: ProjectionTile): number {
  const section = Number(tile.id.split(".")[0]);
  return Number.isInteger(section) ? section : -1;
}
