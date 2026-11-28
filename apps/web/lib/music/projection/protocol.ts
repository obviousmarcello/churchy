import { z } from "zod";

import { MAX_PASSAGE_VERSES } from "@/lib/music/scripture/passage";
import { eventImageUrlSchema, imageAdjustSchema } from "./images";
import {
  ROLL_CONTEXT,
  ROLL_TEXT_SIZE_DEFAULT,
  ROLL_TEXT_SIZES,
  SCRIPTURE_REFERENCE_MAX_LENGTH,
  type ProjectionSlide,
} from "./slides";
import { backgroundUrlSchema, FALLBACK_LOOK, lookSchema, type ProjectionLook } from "./themes";

// The messages between the controllers and the screens of a projection. They
// go on a `BroadcastChannel` (the windows of one browser) and, for an event,
// also on the Realtime channel `projection:event:<event id>` (other devices;
// see the migration `projection`). A message can come on both, so each
// device ignores a state that is not newer than the one it has.
//
// The controller sends the whole state with the slide in it, so a screen
// needs no data of its own. The screens keep the last state: a controller
// that opens asks for it (`sync`). Each screen tells that it is open
// (`screen`), so the controllers can count the screens and use their aspect
// ratio. A screen can also ask for the next slide (`command`): the
// controllers do it. The data comes from other browsers, so each device
// checks it.
//
// A stream overlay (`/project/overlay`) only shows the states. It asks for
// the state (`sync`) and tells that it is open (`overlay`), so the
// controllers can count the overlays. It is not a screen: its shape does not
// change the split of the slides, and it sends no commands. It does not
// answer `sync`. Controllers and screens of an older version ignore its
// messages. With the parts of the lyrics (`stream`), the overlay shows only a
// part of the slide; an overlay of an older version shows the whole slide.
// With the roll view of the verses (`scriptureRoll`), a scripture slide has
// the verses around them too; a screen of an older version shows the page.

/** The current slide and its mode. From a controller, and from a screen that answers `sync`. */
export const PROJECTION_STATE_EVENT = "state";
/** From a controller that opens and from a screen that connects again: the others send their state. */
export const PROJECTION_SYNC_EVENT = "sync";
/** From a screen, every `SCREEN_HEARTBEAT_MS` and when its size changes. */
export const PROJECTION_SCREEN_EVENT = "screen";
/** From a screen that closes. */
export const PROJECTION_SCREEN_CLOSED_EVENT = "screen-closed";
/** From a controller, on the `BroadcastChannel` only: the screens of this browser close their windows. */
export const PROJECTION_CLOSE_EVENT = "close";
/** From a screen: a click, a swipe or a key on it. The controllers do the command, as with their own keys. */
export const PROJECTION_COMMAND_EVENT = "command";
/** From a controller that saved a change of the projection themes: the other controllers load them again. */
export const PROJECTION_THEMES_EVENT = "themes";
/** From a controller that saved a change of an image of the gallery: the other controllers load the images again. */
export const PROJECTION_IMAGES_EVENT = "images";
/** From a stream overlay, every `SCREEN_HEARTBEAT_MS`. */
export const PROJECTION_OVERLAY_EVENT = "overlay";
/** From a stream overlay that closes. */
export const PROJECTION_OVERLAY_CLOSED_EVENT = "overlay-closed";
/** From the server, when a superadmin turns the module "projection" off (see `end_projections()`): the pages load again. */
export const PROJECTION_MODULE_OFF_EVENT = "module-off";

export const SCREEN_HEARTBEAT_MS = 3000;
/** A controller forgets a screen that has not told it is open for this time. */
export const SCREEN_TIMEOUT_MS = 8000;

/** "black": the screen is black. "clear": no text, but the background stays. */
export type ProjectionMode = "show" | "black" | "clear";

/**
 * The tile on the screens: an item of the setlist and a tile of it (see
 * `ProjectionTile.id`). `streamPart`: the part of the lyrics on the overlay
 * (see `streamParts`), from 0. Left out without the parts.
 */
export type ProjectionPosition =
  { itemKey: string; tileId: string; streamPart?: number } | { end: true };

export type ProjectionState = {
  /** Increases with each change. A device ignores a state with a lower number. */
  seq: number;
  mode: ProjectionMode;
  slide: ProjectionSlide;
  /** For the controllers: the tile to mark. Null before the first slide, e.g. after "Black". */
  position: ProjectionPosition | null;
  /** The look of the projection theme of the slide. */
  look: ProjectionLook;
  /** The background image of the next slide, so the screens load it before it shows. */
  preload: string | null;
  /**
   * The image of the next slide, if it is an image of the event. Not in
   * `preload`: a screen of an older version refuses the whole state when
   * `preload` has a URL that it does not know.
   */
  preloadImage: string | null;
  /**
   * The lines of the part of the lyrics slide that the stream overlay shows
   * (see `streamParts`). Left out: the overlay shows the whole slide. The
   * screens ignore it.
   */
  stream?: string[];
  /**
   * The parts of the lyrics are on: the lines of a part (see `streamParts`).
   * In the state, so that all the controllers split the slides in the same
   * way, e.g. for a command of a screen. Left out: one step for each slide.
   */
  streamLines?: number;
  /**
   * The roll view of the verses is on, with this text size (see
   * `ROLL_TEXT_SIZES`): the scripture slides have the verses around them (see
   * `scriptureRollSlide`). In the state, so that all the controllers show the
   * verses in the same way. Left out: the page view.
   */
  scriptureRoll?: number;
};

export type ScreenInfo = {
  /** Random, one per window of a screen. */
  id: string;
  /** Width / height. */
  aspectRatio: number;
  /** The item of the slide on the screen, e.g. for the mark on the page of the event. Not from an older screen. */
  liveItemKey?: string | null;
};

export type OverlayInfo = {
  /** Random, one per window of an overlay. */
  id: string;
};

/** What a key, a click or a swipe does, on a controller and on a screen. */
export type ProjectionCommand = "next" | "previous" | "black" | "clear";

export type ProjectionCommandMessage = {
  command: ProjectionCommand;
  /**
   * The `seq` of the state on the screen, null before the first slide. A
   * controller with another state ignores the command: else each controller,
   * and each copy of the message, goes one slide further.
   */
  baseSeq: number | null;
};

/** The keys of a presenter remote: → ↓ Space PageDown, ← ↑ PageUp, B and C. */
export const PROJECTION_KEYS: Record<string, ProjectionCommand> = {
  ArrowRight: "next",
  ArrowDown: "next",
  " ": "next",
  PageDown: "next",
  ArrowLeft: "previous",
  ArrowUp: "previous",
  PageUp: "previous",
  b: "black",
  B: "black",
  c: "clear",
  C: "clear",
};

// The limits of the texts in the database, which counts code points. `.max`
// counts UTF-16 units: up to two for each code point, e.g. for an emoji.
const text = (codePoints: number) => z.string().max(2 * codePoints);
/** A line of a chart: at most `CHORDPRO_MAX_LENGTH`. */
const lineSchema = text(50000);

/** A QR code: a web address or a short text (see the migration `announcements`). */
const qrSchema = z.object({ text: text(500).min(1), caption: text(200).nullable() });

/** The details of an announcement: its place and its description. */
const detailsSchema = z.array(text(2000)).max(2);

const rollTextSizeSchema = z
  .number()
  .int()
  .min(ROLL_TEXT_SIZES[0])
  .max(ROLL_TEXT_SIZES[ROLL_TEXT_SIZES.length - 1]!);

/** A verse around the live verses of the roll view. */
const rollVerseSchema = z.object({ id: text(40), label: text(20), text: text(2000) });

const slideSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("title"), title: text(200), copyright: text(500).nullable() }),
  z.object({
    kind: z.literal("lyrics"),
    paragraphs: z.array(z.array(lineSchema).max(200)).max(200),
  }),
  z.object({
    kind: z.literal("scripture"),
    // A slide has a part of a passage: at most `MAX_PASSAGE_VERSES`. The longest verse has about 600 characters.
    verses: z.array(z.object({ label: text(20), text: text(2000) })).max(MAX_PASSAGE_VERSES),
    // The reference (an item title) and the short name of the translation.
    reference: text(SCRIPTURE_REFERENCE_MAX_LENGTH),
    // Only a help: with a bad roll, the screen shows the page view. A tile id is e.g. "3:16" or "1Chr.29:30".
    roll: z
      .object({
        ids: z.array(text(40)).max(MAX_PASSAGE_VERSES),
        before: z.array(rollVerseSchema).max(ROLL_CONTEXT),
        after: z.array(rollVerseSchema).max(ROLL_CONTEXT),
        // A size of a newer controller, e.g. a new step, is the default size.
        textSize: rollTextSizeSchema.catch(ROLL_TEXT_SIZE_DEFAULT),
      })
      .optional()
      .catch(undefined),
  }),
  z.object({
    kind: z.literal("image"),
    url: eventImageUrlSchema,
    width: z.number().int().min(1).max(10000),
    height: z.number().int().min(1).max(10000),
    adjust: imageAdjustSchema,
    // Only a help, as `preload`: a bad QR code does not refuse the image.
    qr: qrSchema
      .extend({ side: z.enum(["start", "end"]) })
      .optional()
      .catch(undefined),
  }),
  z.object({
    kind: z.literal("announcements"),
    heading: text(200),
    range: text(100),
    // A list has the entries that fit on a slide; an announcement has at most 100 manual entries.
    entries: z
      .array(
        z.object({
          when: text(100),
          title: text(200),
          details: detailsSchema,
          accent: z.boolean(),
        }),
      )
      .max(500),
  }),
  z.object({
    kind: z.literal("announcement"),
    title: text(200),
    when: text(100).nullable(),
    details: detailsSchema,
  }),
  z.object({ kind: z.literal("qr"), ...qrSchema.shape }),
  // A part of a text slide: lines of a description and of a highlighted text.
  z.object({
    kind: z.literal("text"),
    paragraphs: z.array(z.array(text(2000)).max(200)).max(200),
    highlight: z.array(z.array(text(500)).max(100)).max(100),
  }),
  // The caption is the title of a text item. A screen of an older version drops it.
  z.object({ kind: z.literal("blank"), caption: text(200).optional() }),
]);

// The most lines of a part of the lyrics on the overlay. More than
// `STREAM_LINES`: a later version can show more lines at a time.
const STREAM_MAX_LINES = 10;

const stateSchema = z.object({
  seq: z.number().int().nonnegative(),
  mode: z.enum(["show", "black", "clear"]),
  slide: slideSchema,
  position: z
    // The tile of an image is the id of the image: 36 characters.
    .union([
      z.object({ end: z.literal(true) }),
      z.object({
        itemKey: z.string().max(100),
        tileId: z.string().max(40),
        // A slide has at most 200 paragraphs of 200 lines.
        streamPart: z.number().int().nonnegative().max(40000).optional().catch(undefined),
      }),
    ])
    .nullable(),
  // A controller of an older version sends no look.
  look: lookSchema.default(FALLBACK_LOOK),
  // Only a help: a bad or unknown URL, e.g. of a newer controller, does not
  // refuse the slide. A controller of an older version sends no image.
  preload: backgroundUrlSchema.nullable().catch(null),
  preloadImage: eventImageUrlSchema.nullable().catch(null),
  // Only a help too: with a bad part, the overlay shows the whole slide.
  stream: z.array(lineSchema).min(1).max(STREAM_MAX_LINES).optional().catch(undefined),
  streamLines: z.number().int().min(1).max(STREAM_MAX_LINES).optional().catch(undefined),
  scriptureRoll: rollTextSizeSchema.optional().catch(undefined),
});

const MIN_SCREEN_ASPECT_RATIO = 0.2;
const MAX_SCREEN_ASPECT_RATIO = 5;

const screenSchema = z.object({
  id: z.string().min(1).max(100),
  aspectRatio: z.number().min(MIN_SCREEN_ASPECT_RATIO).max(MAX_SCREEN_ASPECT_RATIO),
  liveItemKey: z.string().min(1).max(100).nullable().optional(),
});

const overlaySchema = z.object({ id: z.string().min(1).max(100) });

const commandSchema = z.object({
  command: z.enum(["next", "previous", "black", "clear"]),
  baseSeq: z.number().int().nonnegative().nullable(),
});

/** Null for a message that is not a valid state. */
export function parseProjectionState(payload: unknown): ProjectionState | null {
  const result = stateSchema.safeParse(payload);
  return result.success ? result.data : null;
}

/** The aspect ratio of a screen window, within the limits of the message: a very wide window still counts. */
export function screenAspectRatio(width: number, height: number): number {
  return Math.min(
    MAX_SCREEN_ASPECT_RATIO,
    Math.max(MIN_SCREEN_ASPECT_RATIO, width / Math.max(1, height)),
  );
}

/** Null for a message that is not a valid screen. */
export function parseScreenInfo(payload: unknown): ScreenInfo | null {
  const result = screenSchema.safeParse(payload);
  return result.success ? result.data : null;
}

/** Null for a message that is not a valid overlay. */
export function parseOverlayInfo(payload: unknown): OverlayInfo | null {
  const result = overlaySchema.safeParse(payload);
  return result.success ? result.data : null;
}

/** Null for a message that is not a valid command. */
export function parseProjectionCommand(payload: unknown): ProjectionCommandMessage | null {
  const result = commandSchema.safeParse(payload);
  return result.success ? result.data : null;
}

/** The newer of two states. The same message can come twice: from the `BroadcastChannel` and from Realtime. */
export function newerProjectionState(
  current: ProjectionState | null,
  incoming: ProjectionState,
): ProjectionState {
  return current && current.seq >= incoming.seq ? current : incoming;
}

/**
 * The number of the next state. From the time, so a controller that opens
 * later still sends a newer state; at least one more than the last state.
 */
export function nextSeq(current: ProjectionState | null, now: number): number {
  return Math.max((current?.seq ?? 0) + 1, Math.round(now));
}

/**
 * The aspect ratio for the split of the slides: the narrowest of the open
 * screens, so the text fits on each. Null without screens.
 */
export function narrowestAspectRatio(screens: ScreenInfo[]): number | null {
  return screens.length > 0 ? Math.min(...screens.map((screen) => screen.aspectRatio)) : null;
}

/** The topic of the Realtime channel of an event's projection. Keep it in sync with the migration `projection`. */
export function projectionTopic(eventId: string): string {
  return `projection:event:${eventId}`;
}

/** The name of the `BroadcastChannel`: one per event, and one for the rehearsal of the browser. */
export function projectionChannelName(eventId: string | null): string {
  return eventId ? projectionTopic(eventId) : "projection:rehearsal";
}

/**
 * A random id for a window, e.g. a screen. Not `crypto.randomUUID()`: it
 * needs https, and a test on the local network has plain http.
 */
export function newWindowId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
