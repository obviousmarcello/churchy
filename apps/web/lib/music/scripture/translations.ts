import type { TextSources } from "./source-links";

// The translations of the Bible that the app has. The text of a "files"
// translation is in `public/bible/<id>/<book>.json` (see `load.ts` and
// `scripts/import-bible.mts`). Only translations that the app can show
// without a licence: public domain, or with a permission for this use. The
// `scripture_translation` migration checks the form of the ids.
//
// A "pasted" translation has no files: the app may quote only a few of its
// verses. The users paste the text of a reading on the projection
// controller, into a shared cache that keeps 331 verses for 24 hours (see
// `cache-limits.ts` and the migration `scripture_verse_cache`). Only the
// items of a setlist can use it, not the Bible panel of the controller.
//
// A "database" translation has its text in the table `scripture_books`, one
// row per book, for the signed-in users only (see `load.ts`): a translation
// with a permit, not public domain.
//
// A superadmin turns the translations on and off on the Bible translations tab of Configuration
// (`ScriptureConfig`, in `app_config`). RÚF 2014 is "pasted" without a
// written permit of the Hungarian Bible Society, and "database" with one.

/** The copyright notice of RÚF 2014: the short form from point 7 of the policy of the Hungarian Bible Society. */
export const RUF_NOTICE = "RÚF 2014 © 2014 Magyar Bibliatársulat. Minden jog fenntartva.";

export type TranslationSource = "files" | "database" | "pasted";

export type ScriptureTranslation = {
  /** Lower case letters and digits, e.g. "karoli1908". */
  id: string;
  /** The language of the text, e.g. "hu". */
  language: string;
  /** The full name, in the language of the text. On the title slide. */
  name: string;
  /** A short name, e.g. "Károli". After the reference. */
  shortName: string;
  /** The copyright notice to show with the text. Null for public domain. */
  notice: string | null;
  /** The translation has the deuterocanonical books (see `DEUTEROCANONICAL_BOOKS`). */
  deuterocanon: boolean;
  /** Where the text comes from: the files of the app, the table `scripture_books`, or the shared cache of the pasted verses. */
  source: TranslationSource;
  /** The websites with the text, for links: the users copy a "pasted" translation from there. */
  sources?: TextSources;
};

export const TRANSLATIONS = [
  {
    id: "karoli1908",
    language: "hu",
    name: "Károli Gáspár revideált fordítása (1908)",
    shortName: "Károli",
    notice: null,
    deuterocanon: false,
    source: "files",
  },
  {
    id: "ruf2014",
    language: "hu",
    name: "Revideált új fordítás (2014)",
    shortName: "RÚF",
    notice: RUF_NOTICE,
    deuterocanon: false,
    source: "pasted",
    sources: {
      szentiras: "RUF",
      bibliaMindenkie: "uj",
      bibleCom: { id: 920, abbreviation: "RÚF" },
    },
  },
] as const satisfies ScriptureTranslation[];

export type TranslationId = (typeof TRANSLATIONS)[number]["id"];

export const TRANSLATION_IDS = TRANSLATIONS.map((translation) => translation.id) as [
  TranslationId,
  ...TranslationId[],
];

/** For a scripture reading without a translation. */
export const DEFAULT_TRANSLATION: TranslationId = "karoli1908";

/** The translation of the id, on or off, or the default one for null and for an id that the app does not have (anymore). For names, e.g. in a printed setlist. */
export function scriptureTranslation(id: string | null | undefined): ScriptureTranslation {
  return (
    TRANSLATIONS.find((translation) => translation.id === id) ??
    TRANSLATIONS.find(({ id }) => id === DEFAULT_TRANSLATION)!
  );
}

// The settings of the Bible translations tab of Configuration ---------------

/**
 * RÚF 2014: "off"; "pasted" without a permit (the shared cache, at most 500
 * verses with the daily psalm, see `cache-limits.ts`); "permit" with a written
 * permit of the Hungarian Bible Society (its text is in `scripture_books`).
 */
export const RUF_MODES = ["pasted", "permit", "off"] as const;
export type RufMode = (typeof RUF_MODES)[number];

/** Which translations the app shows (the columns `scripture_*` of `app_config`). */
export type ScriptureConfig = { karoli: boolean; ruf: RufMode };

export const DEFAULT_SCRIPTURE_CONFIG: ScriptureConfig = { karoli: true, ruf: "pasted" };

// One list for each configuration, so the lists keep their identity between renders.
const enabledLists = new Map<string, ScriptureTranslation[]>();

/** The translations that are on, in the order of `TRANSLATIONS`, each with the source of its text. Empty when all are off. */
export function enabledTranslations(config: ScriptureConfig): ScriptureTranslation[] {
  const key = `${config.karoli}/${config.ruf}`;
  let list = enabledLists.get(key);
  if (!list) {
    list = TRANSLATIONS.flatMap((translation): ScriptureTranslation[] => {
      if (translation.id === "karoli1908") return config.karoli ? [translation] : [];
      if (config.ruf === "off") return [];
      return [{ ...translation, source: config.ruf === "permit" ? "database" : "pasted" }];
    });
    enabledLists.set(key, list);
  }
  return list;
}

/**
 * The translation that a reading uses: its own when it is on, else the first
 * one that is on in the same language, else the first one that is on. Null
 * when all are off: the reading shows only its title.
 */
export function resolveTranslation(
  id: string | null | undefined,
  enabled: ScriptureTranslation[],
): ScriptureTranslation | null {
  const own = enabled.find((translation) => translation.id === id);
  if (own) return own;
  const language = scriptureTranslation(id).language;
  return enabled.find((translation) => translation.language === language) ?? enabled[0] ?? null;
}

const fullTextLists = new WeakMap<ScriptureTranslation[], ScriptureTranslation[]>();

/** The translations with their full text, for the Bible panel of the controller: without the "pasted" ones. The same list for the same `enabled`. */
export function fullTextTranslations(enabled: ScriptureTranslation[]): ScriptureTranslation[] {
  let list = fullTextLists.get(enabled);
  if (!list)
    fullTextLists.set(
      enabled,
      (list = enabled.filter((translation) => translation.source !== "pasted")),
    );
  return list;
}

/** The languages of the translations, in their order. */
export function scriptureLanguages(translations: ScriptureTranslation[]): string[] {
  return [...new Set(translations.map((translation) => translation.language))];
}

/** The translations in the language, in their order. */
export function translationsOf(
  translations: ScriptureTranslation[],
  language: string,
): ScriptureTranslation[] {
  return translations.filter((translation) => translation.language === language);
}

/** The translation for a new scripture reading: the first one in the language of the app, else the first one. Null when all are off. */
export function defaultTranslationFor(
  locale: string,
  enabled: ScriptureTranslation[],
): TranslationId | null {
  return (
    ((enabled.find((translation) => translation.language === locale) ?? enabled[0])?.id as
      TranslationId | undefined) ?? null
  );
}
