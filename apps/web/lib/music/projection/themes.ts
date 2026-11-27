import { z } from "zod";

import { PROJECTION_FONT_IDS, type ProjectionFontId } from "./fonts";

// The look of the projection screens: a projection theme without its name.
// The themes are a shared library (see the migration `projection_themes`). An
// event item uses its own theme, else the theme of its event, else the
// default theme. The controller sends the look of each slide to the screens
// (see `protocol.ts`), so a screen needs no data of its own.

export const TEXT_ALIGNS = ["left", "center", "right"] as const;
export const VERTICAL_ALIGNS = ["top", "center", "bottom"] as const;
export const TEXT_SHADOWS = ["none", "light", "strong"] as const;
export const TRANSITIONS = ["cut", "fade"] as const;

/** The longest name of a theme. */
export const NAME_MAX_LENGTH = 100;
export const BACKGROUND_DIM_MAX = 80;
export const TEXT_SIZE_MIN = 50;
export const TEXT_SIZE_MAX = 150;
export const REFERENCE_SIZE_MIN = 25;
export const REFERENCE_SIZE_MAX = 500;
export const MARGIN_MAX = 15;
export const TRANSITION_MS_MAX = 2000;
/** The move of the roll view of the verses, for a theme from before its own time. */
export const ROLL_MS_DEFAULT = 600;

export type ProjectionLook = {
  background: {
    /** E.g. "#000000". */
    color: string;
    /** A path on this site (see `BACKGROUND_PATH_PATTERN`), or null. Covers the screen. */
    image: string | null;
    /**
     * A path on this site (see `BACKGROUND_VIDEO_PATH_PATTERN`), or null. A
     * muted loop over the image, which is then its poster: a still frame of it.
     */
    video: string | null;
    /** The black over the image or the video, in percent: 0 to `BACKGROUND_DIM_MAX`. */
    dim: number;
  };
  font: ProjectionFontId;
  textColor: string;
  /** The highlighted announcements. Null: the color of the text, in bold, with a marker. */
  accentColor: string | null;
  /** The largest text, in percent of `SLIDE_LAYOUT.maxFont`. */
  textSize: number;
  /** The reference under the verses of a scripture slide, in percent of `SMALL_FONT`. */
  referenceSize: number;
  textAlign: (typeof TEXT_ALIGNS)[number];
  verticalAlign: (typeof VERTICAL_ALIGNS)[number];
  textShadow: (typeof TEXT_SHADOWS)[number];
  /** The space at each side, in percent of the screen height. */
  margin: number;
  /**
   * `kind` and `ms`: the change to the next slide. `rollMs`: the move of
   * the verses in the roll view (see `ScriptureRoll`), also with a cut. 0: no move.
   */
  transition: { kind: (typeof TRANSITIONS)[number]; ms: number; rollMs: number };
};

/** The look from before the themes, when the database has no default theme. */
export const FALLBACK_LOOK: ProjectionLook = {
  background: { color: "#000000", image: null, video: null, dim: 0 },
  font: "inter",
  textColor: "#ffffff",
  accentColor: null,
  textSize: 100,
  referenceSize: 100,
  textAlign: "center",
  verticalAlign: "center",
  textShadow: "none",
  margin: 6,
  transition: { kind: "fade", ms: 150, rollMs: ROLL_MS_DEFAULT },
};

/**
 * The background images, as `/munkater/vetites/fajl/hatter/<theme id>/<random id>.webp`.
 * Only these: a screen must not load a file from another site.
 */
const BACKGROUND_PATH_PATTERN =
  /^\/munkater\/vetites\/fajl\/hatter\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;

/** The background videos, as `/munkater/vetites/fajl/video/<theme id>/<random id>.mp4` (or `.webm`). Only these, as the images. */
const BACKGROUND_VIDEO_PATH_PATTERN =
  /^\/munkater\/vetites\/fajl\/video\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:mp4|webm)$/;

export const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/);

export const backgroundUrlSchema = z.string().regex(BACKGROUND_PATH_PATTERN);

export const backgroundVideoUrlSchema = z.string().regex(BACKGROUND_VIDEO_PATH_PATTERN);

/**
 * A look from another device or from a form. A font that the app does not
 * have (anymore) becomes Inter.
 */
export const lookSchema = z.object({
  background: z.object({
    color: colorSchema,
    image: backgroundUrlSchema.nullable(),
    // A controller of an older version sends none. A bad URL: the poster only.
    video: backgroundVideoUrlSchema.nullable().catch(null),
    dim: z.number().int().min(0).max(BACKGROUND_DIM_MAX),
  }),
  font: z.enum(PROJECTION_FONT_IDS).catch("inter"),
  textColor: colorSchema,
  // A controller of an older version sends none.
  accentColor: colorSchema.nullable().catch(null),
  textSize: z.number().int().min(TEXT_SIZE_MIN).max(TEXT_SIZE_MAX),
  // A controller of an older version sends none.
  referenceSize: z.number().int().min(REFERENCE_SIZE_MIN).max(REFERENCE_SIZE_MAX).catch(100),
  textAlign: z.enum(TEXT_ALIGNS),
  verticalAlign: z.enum(VERTICAL_ALIGNS),
  textShadow: z.enum(TEXT_SHADOWS),
  margin: z.number().int().min(0).max(MARGIN_MAX),
  transition: z.object({
    kind: z.enum(TRANSITIONS),
    ms: z.number().int().min(0).max(TRANSITION_MS_MAX),
    // A controller of an older version sends none.
    rollMs: z.number().int().min(0).max(TRANSITION_MS_MAX).catch(ROLL_MS_DEFAULT),
  }),
});

/** A theme of the library, as the controller and the editors get it. */
export type ProjectionThemeDTO = {
  id: string;
  name: string;
  isDefault: boolean;
  look: ProjectionLook;
};

/** Which theme each item uses: its own, else the theme of its arrangement, else the theme of the event, else the default one. */
export type ProjectionThemeChoice = {
  themes: ProjectionThemeDTO[];
  /** Null: the default theme. */
  eventThemeId: string | null;
  /** The theme of each item, by item key. No entry or null: the theme of the arrangement or of the event. */
  itemThemeIds: Readonly<Record<string, string | null>>;
};

/**
 * The theme of an item: its own, else the theme of its arrangement (songs
 * only), else the theme of the event, else the default theme. A theme that
 * is not in the list (deleted) counts as none. Null only when the list has no
 * default theme.
 *
 * The arrangement theme comes before the event theme on purpose: the look of
 * a song stays the same in all events. An item that must use the look of its
 * event sets that theme as its own theme. That item then does not follow a
 * later change of the event theme.
 */
export function resolveTheme(
  themes: ProjectionThemeDTO[],
  itemThemeId: string | null | undefined,
  eventThemeId: string | null | undefined,
  arrangementThemeId?: string | null,
): ProjectionThemeDTO | null {
  const byId = (id: string | null | undefined) =>
    id ? themes.find((theme) => theme.id === id) : undefined;
  return (
    byId(itemThemeId) ??
    byId(arrangementThemeId) ??
    byId(eventThemeId) ??
    themes.find((theme) => theme.isDefault) ??
    null
  );
}

/** The look of an item (see `resolveTheme`), or the look from before the themes. */
export function resolveLook(
  themes: ProjectionThemeDTO[],
  itemThemeId: string | null | undefined,
  eventThemeId: string | null | undefined,
  arrangementThemeId?: string | null,
): ProjectionLook {
  return resolveTheme(themes, itemThemeId, eventThemeId, arrangementThemeId)?.look ?? FALLBACK_LOOK;
}

/** The CSS `text-shadow` of a look. */
export function textShadowCss(shadow: ProjectionLook["textShadow"]): string | undefined {
  if (shadow === "light") return "0 0.04em 0.12em rgb(0 0 0 / 0.6)";
  if (shadow === "strong") return "0 0 0.06em rgb(0 0 0 / 0.9), 0 0.05em 0.2em rgb(0 0 0 / 0.8)";
  return undefined;
}

/** The duration of the transition to a look, in ms. 0 for a cut. */
export function transitionMs(look: ProjectionLook): number {
  return look.transition.kind === "cut" ? 0 : look.transition.ms;
}
