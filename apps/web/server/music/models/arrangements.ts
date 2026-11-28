import "server-only";

import { z } from "zod";

import { parseChordPro, parseChordProSections, setChordProDirective } from "@/lib/music/chordpro";
import {
  KEY_PATTERN,
  OTHER_KEYS_DIRECTIVE,
  canonicalKey,
  OTHER_KEYS_MAX,
  keyShift,
  parseKey,
  playableOtherKeys,
  splitKeys,
} from "@/lib/music/chords/key";
import {
  NOTATIONS,
  NOTATION_DIRECTIVE,
  chartNotation,
  detectNotation,
  toEnglish,
  type Notation,
} from "@/lib/music/chords/notation";
import { convertPlainChart } from "@/lib/music/chords-over-lyrics";
import { formatMinutesSeconds } from "@/lib/music/format";
import { requireSongAdmin, requireUser } from "@/server/music/auth";
import { ConflictError, ValidationError } from "@/server/music/errors";
import { getMusicSupabase } from "@/server/music/db";
import { zodMessage } from "@/server/music/zod-i18n";
import { databaseError, idSchema, isId, parseInput, requiredText } from "./shared";

// An arrangement is one version of a song: a ChordPro chart plus the order to
// play its sections in (e.g. Verse 1, Chorus, Verse 2, Chorus, Bridge).
// Clone one to make a variant, e.g. for one event. Only song admins and
// superadmins can change them.

// The musical metadata comes from the chart's directives, so the chart stays
// the single source of truth. Inputs may set these fields directly: the model
// writes them into the chart. The chart's `{capo}` is only the default: each
// user can choose their own capo (see `my-arrangements.ts`).
export type ArrangementMetaDTO = {
  /** `{key: G}`, in English note names (the chart can use German ones, see `notation`). */
  key: string | null;
  /**
   * `{x_other_keys: E, A}`: more keys to play the chart in, in English note
   * names. The sheet moves the chords. Only keys in the mode of `key`; empty
   * without `key`.
   */
  otherKeys: string[];
  /** The note names of the chart: `{x_notation: german}`, else German when it has an H. */
  notation: Notation;
  /** `{tempo: 72}` */
  bpm: number | null;
  /** `{time: 3/4}` */
  timeSignature: string | null;
  /** `{duration: 4:05}` or `{duration: 245}` */
  durationSeconds: number | null;
};

export type ArrangementSummaryDTO = ArrangementMetaDTO & {
  id: string;
  name: string;
  isDefault: boolean;
  /** The projection theme of the arrangement. Null: the theme of the event (see `resolveTheme`). */
  themeId: string | null;
};

export type ArrangementDTO = ArrangementSummaryDTO & {
  songId: string;
  chordpro: string;
  /** Section labels in playing order. Empty means "as written". */
  sectionOrder: string[];
  /** Labels of the sections in the chart, in document order. */
  sections: string[];
};

export const CHORDPRO_MAX_LENGTH = 50000;
export const SECTION_ORDER_MAX_LENGTH = 50;

const KEY_FORMAT = zodMessage(({ m }) => m.server.arrangements.keyFormat);
const TOO_MANY_OTHER_KEYS = zodMessage(({ m, format }) =>
  format(m.server.arrangements.tooManyOtherKeys, { max: OTHER_KEYS_MAX }),
);
const OTHER_KEYS_NEED_KEY = zodMessage(({ m }) => m.server.arrangements.otherKeysNeedKey);
const OTHER_KEYS_MODE = zodMessage(({ m }) => m.server.arrangements.otherKeysMode);
const TIME_SIGNATURE_FORMAT = zodMessage(({ m }) => m.server.arrangements.timeSignatureFormat);
const CHART_TOO_LONG = zodMessage(({ m }) => m.server.arrangements.chartTooLong);
const UNKNOWN_SECTION = zodMessage(({ m, format }, params) =>
  format(m.server.arrangements.unknownSection, { section: String(params.section) }),
);

// Each field: a value sets the directive, null removes it, and leaving it out
// keeps the chart as it is. The patterns also stop directive injection.
const metaShape = {
  key: z.string().trim().regex(KEY_PATTERN, { message: KEY_FORMAT }).nullish(),
  otherKeys: z
    .array(z.string().trim().regex(KEY_PATTERN, { message: KEY_FORMAT }))
    .max(OTHER_KEYS_MAX, { message: TOO_MANY_OTHER_KEYS })
    .nullish(),
  // The keys and chords of the chart use these note names. Null: from the chords.
  notation: z.enum(NOTATIONS).nullish(),
  bpm: z.number().int().min(1).max(400).nullish(),
  timeSignature: z
    .string()
    .trim()
    .regex(/^\d{1,2}\/\d{1,2}$/, { message: TIME_SIGNATURE_FORMAT })
    .nullish(),
  durationSeconds: z.number().int().min(1).max(5999).nullish(),
};

type MetaInput = { [K in keyof typeof metaShape]?: z.output<(typeof metaShape)[K]> };

const META_DIRECTIVES: Record<keyof MetaInput, string> = {
  key: "key",
  otherKeys: OTHER_KEYS_DIRECTIVE,
  notation: NOTATION_DIRECTIVE,
  bpm: "tempo",
  timeSignature: "time",
  durationSeconds: "duration",
};

const chordproInput = z.string().max(CHORDPRO_MAX_LENGTH);

/** Chart, section order and metadata. Also used by `createSong` for the default arrangement. */
export const arrangementContentShape = {
  chordpro: chordproInput.default(""),
  // Plain section headers (`VERSE 1`) in the chart become ChordPro sections, and
  // chord lines above the lyrics go into the lyrics. True keeps them as written,
  // e.g. after the user undoes the conversion in the song form.
  keepPlainSections: z.boolean().default(false),
  sectionOrder: z.array(requiredText(100)).max(SECTION_ORDER_MAX_LENGTH).default([]),
  ...metaShape,
};

/**
 * Converts the plain section headers and the chord lines above the lyrics of
 * the chart (unless `keepPlainSections`),
 * writes the metadata fields into it, then checks that every entry of the
 * section order names a section of the chart (case-insensitive) and stores it
 * with the chart's spelling.
 */
export function normalizeContent<
  T extends { chordpro: string; sectionOrder: string[]; keepPlainSections: boolean } & MetaInput,
>(content: T, ctx: z.RefinementCtx): Omit<T, keyof MetaInput | "keepPlainSections"> {
  const {
    key,
    otherKeys,
    notation,
    bpm,
    timeSignature,
    durationSeconds,
    keepPlainSections,
    ...rest
  } = content;
  const meta: MetaInput = { key, otherKeys, notation, bpm, timeSignature, durationSeconds };

  let chordpro = keepPlainSections ? rest.chordpro : convertPlainChart(rest.chordpro).chordpro;
  for (const [field, directive] of Object.entries(META_DIRECTIVES) as [keyof MetaInput, string][]) {
    const value = meta[field];
    if (value === undefined || field === "otherKeys" || field === "notation") continue;
    const text =
      value === null
        ? null
        : field === "durationSeconds"
          ? formatMinutesSeconds(Number(value))
          : String(value);
    chordpro = setChordProDirective(chordpro, directive, text);
  }
  if (notation !== undefined) {
    // The directive only when the chords do not show the notation.
    const shown = detectNotation(setChordProDirective(chordpro, NOTATION_DIRECTIVE, null));
    chordpro = setChordProDirective(
      chordpro,
      NOTATION_DIRECTIVE,
      notation === null || notation === shown ? null : notation,
    );
  }
  chordpro = normalizeOtherKeys(chordpro, otherKeys, ctx);
  if (chordpro.length > CHORDPRO_MAX_LENGTH) {
    ctx.addIssue({ code: "custom", path: ["chordpro"], message: CHART_TOO_LONG });
  }

  const labels = new Map(
    parseChordProSections(chordpro).map((s) => [s.label.toLowerCase(), s.label]),
  );
  const sectionOrder = rest.sectionOrder.map((entry, index) => {
    const label = labels.get(entry.toLowerCase());
    if (!label) {
      ctx.addIssue({
        code: "custom",
        path: ["sectionOrder", index],
        message: UNKNOWN_SECTION,
        params: { section: entry },
      });
    }
    return label ?? entry;
  });

  return { ...rest, chordpro, sectionOrder };
}

/**
 * Writes `otherKeys` into the chart (null or an empty list removes them), then
 * checks the other keys of the chart against its key: the sheet can only move
 * the chords between keys of the same mode. Leaves out repeats and the key of
 * the chart.
 */
function normalizeOtherKeys(
  chordpro: string,
  otherKeys: string[] | null | undefined,
  ctx: z.RefinementCtx,
) {
  const directives = parseChordPro(chordpro).meta;
  const written = directives.key;
  const notation = chartNotation(chordpro);
  const keys =
    otherKeys === undefined ? splitKeys(directives[OTHER_KEYS_DIRECTIVE]) : (otherKeys ?? []);
  if (keys.length === 0) {
    return otherKeys === undefined
      ? chordpro
      : setChordProDirective(chordpro, OTHER_KEYS_DIRECTIVE, null);
  }

  if (!parseKey(written, notation)) {
    ctx.addIssue({ code: "custom", path: ["otherKeys"], message: OTHER_KEYS_NEED_KEY });
    return chordpro;
  }
  const index = keys.findIndex((other) => keyShift(written, other, notation) === null);
  if (index >= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["otherKeys", index],
      message: parseKey(keys[index], notation) ? OTHER_KEYS_MODE : KEY_FORMAT,
    });
    return chordpro;
  }
  if (otherKeys === undefined) return chordpro;
  const playable = playableOtherKeys(written, keys, notation);
  return setChordProDirective(
    chordpro,
    OTHER_KEYS_DIRECTIVE,
    playable.length > 0 ? playable.join(", ") : null,
  );
}

/**
 * A key to play the chart in, e.g. for an event slot or a user, in English
 * note names. It becomes the usual name of the key, e.g. "A#" is "Bb".
 */
export const playKeySchema = z
  .string()
  .trim()
  .max(10)
  .transform((value, ctx) => {
    const key = canonicalKey(value);
    if (key === null) {
      ctx.addIssue({ code: "custom", message: KEY_FORMAT });
      return z.NEVER;
    }
    return key;
  });

export const arrangementInputSchema = z
  .strictObject({ name: requiredText(200), ...arrangementContentShape })
  .transform(normalizeContent);

/** The stored arrangement with the patch. `updateArrangement` converts only a chart in the patch. */
const arrangementUpdateSchema = z
  .strictObject({ ...arrangementContentShape, name: requiredText(200), chordpro: chordproInput })
  .transform(normalizeContent);

/** Every field is optional: send only what changes, e.g. `{ bpm: 76 }`. */
export const arrangementPatchSchema = z.strictObject({
  name: requiredText(200).optional(),
  chordpro: chordproInput.optional(),
  keepPlainSections: z.boolean().optional(),
  sectionOrder: z.array(requiredText(100)).max(SECTION_ORDER_MAX_LENGTH).optional(),
  ...metaShape,
  // Not part of the chart. Null: the theme of the event.
  themeId: z.uuid().nullable().optional(),
});

export type ArrangementInput = z.input<typeof arrangementInputSchema>;
export type ArrangementPatch = z.input<typeof arrangementPatchSchema>;

export const ARRANGEMENT_SUMMARY_COLUMNS =
  "id, name, is_default, musical_key, other_keys, chord_notation, tempo_bpm, time_signature, duration_seconds, projection_theme_id";
export const ARRANGEMENT_COLUMNS = `${ARRANGEMENT_SUMMARY_COLUMNS}, song_id, chordpro, section_order`;

export const arrangementSummaryRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  is_default: z.boolean(),
  musical_key: z.string().nullable(),
  other_keys: z.array(z.string()),
  chord_notation: z.enum(NOTATIONS),
  tempo_bpm: z.number().int().nullable(),
  time_signature: z.string().nullable(),
  duration_seconds: z.number().int().nullable(),
  projection_theme_id: z.uuid().nullable(),
});

export const arrangementRowSchema = arrangementSummaryRowSchema.extend({
  song_id: z.uuid(),
  // No parser runs on a longer text.
  chordpro: z.string().max(CHORDPRO_MAX_LENGTH),
  section_order: z.array(z.string()),
});

const unknownTheme = () =>
  new ValidationError([
    { path: "themeId", message: ({ m }) => m.server.arrangements.unknownTheme },
  ]);

const unknownSong = () =>
  new ValidationError([{ path: "songId", message: ({ m }) => m.server.arrangements.unknownSong }]);

export async function getArrangement(id: string): Promise<ArrangementDTO | null> {
  // Also here, not only in the proxy (see the reads in `./songs.ts`).
  await requireUser();
  if (!isId(id)) return null;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("arrangements")
    .select(ARRANGEMENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw databaseError("get arrangement", error);

  return data ? toArrangement(arrangementRowSchema.parse(data)) : null;
}

/** Adds an arrangement to a song. It does not become the default. */
export async function createArrangement(songId: string, input: unknown): Promise<ArrangementDTO> {
  await requireSongAdmin();
  if (!isId(songId)) throw unknownSong();
  const arrangement = parseInput(arrangementInputSchema, input);

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("arrangements")
    .insert({
      song_id: songId,
      name: arrangement.name,
      chordpro: arrangement.chordpro,
      section_order: arrangement.sectionOrder,
    })
    .select(ARRANGEMENT_COLUMNS)
    .single();
  if (error) throw databaseError("create arrangement", error, { "23503": unknownSong });

  return toArrangement(arrangementRowSchema.parse(data));
}

/**
 * Changes only the given fields. The section order is checked against the
 * resulting chart. Returns null if there is no such arrangement.
 */
export async function updateArrangement(
  id: string,
  patch: unknown,
): Promise<ArrangementDTO | null> {
  await requireSongAdmin();
  if (!isId(id)) return null;
  const { themeId, ...changes } = parseInput(arrangementPatchSchema, patch);

  const current = await getArrangement(id);
  if (!current) return null;

  const next = parseInput(arrangementUpdateSchema, {
    ...changes,
    name: changes.name ?? current.name,
    chordpro: changes.chordpro ?? current.chordpro,
    // A save that does not send the chart keeps the stored chart as it is.
    keepPlainSections: changes.chordpro === undefined || changes.keepPlainSections === true,
    sectionOrder: changes.sectionOrder ?? current.sectionOrder,
  });

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("arrangements")
    .update({
      name: next.name,
      chordpro: next.chordpro,
      section_order: next.sectionOrder,
      ...(themeId !== undefined && { projection_theme_id: themeId }),
    })
    .eq("id", id)
    .select(ARRANGEMENT_COLUMNS)
    .maybeSingle();
  // The only foreign key that the update can break: e.g. another user deleted the theme.
  if (error) throw databaseError("update arrangement", error, { "23503": unknownTheme });

  return data ? toArrangement(arrangementRowSchema.parse(data)) : null;
}

/** Copies an arrangement under a new name. Returns null if there is no such arrangement. */
export async function cloneArrangement(id: string, name?: string): Promise<ArrangementDTO | null> {
  await requireSongAdmin();
  if (!isId(id)) return null;
  const parsedName = parseInput(requiredText(200).optional(), name);

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("clone_arrangement", {
    p_id: id,
    p_name: parsedName ?? null,
  });
  if (error) throw databaseError("clone arrangement", error);

  return data ? getArrangement(idSchema.parse(data)) : null;
}

/** Makes this arrangement its song's default. Returns false if there is no such arrangement. */
export async function setDefaultArrangement(id: string): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(id)) return false;

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("set_default_arrangement", { p_id: id });
  if (error) throw databaseError("set default arrangement", error);

  return z.boolean().parse(data);
}

/**
 * Returns false if there is no such arrangement. Fails for the default
 * arrangement, for arrangements that an event uses, and for the only
 * arrangement of a PDF or an image.
 */
export async function deleteArrangement(id: string): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(id)) return false;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("arrangements")
    .delete()
    .eq("id", id)
    .eq("is_default", false)
    .select("id");
  if (error) {
    throw databaseError("delete arrangement", error, {
      "23503": () => new ConflictError(({ m }) => m.server.arrangements.usedByEvent),
      "P0001:arrangement_attachments": () =>
        new ConflictError(({ m }) => m.server.arrangements.usedByAttachment),
    });
  }
  if (data.length > 0) return true;

  if (await getArrangement(id)) {
    throw new ConflictError(({ m }) => m.server.arrangements.isDefault);
  }
  return false;
}

export function toArrangementSummary(
  row: z.infer<typeof arrangementSummaryRowSchema>,
): ArrangementSummaryDTO {
  const key = row.musical_key === null ? null : toEnglish(row.musical_key, row.chord_notation);
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
    key,
    otherKeys: playableOtherKeys(
      key,
      row.other_keys.map((other) => toEnglish(other, row.chord_notation)),
    ),
    notation: row.chord_notation,
    bpm: row.tempo_bpm,
    timeSignature: row.time_signature,
    durationSeconds: row.duration_seconds,
    themeId: row.projection_theme_id,
  };
}

export function toArrangement(row: z.infer<typeof arrangementRowSchema>): ArrangementDTO {
  return {
    ...toArrangementSummary(row),
    songId: row.song_id,
    chordpro: row.chordpro,
    sectionOrder: row.section_order,
    sections: parseChordProSections(row.chordpro).map((section) => section.label),
  };
}
