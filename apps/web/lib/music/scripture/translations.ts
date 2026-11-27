import type { TextSources } from "./source-links";

// The translations of the Bible. Károli 1908 is the platform catalog: public domain, its text is in
// `public/bible/karoli1908/<book>.json` (see `load.ts` and `scripts/import-bible.mts`). Every other
// translation belongs to one church (table `scripture_translations`, PLAN §24) and is shown under that
// church's own licence; the ids of the church's translations are lower case letters and digits.
//
// A "pasted" translation has no stored text: the users paste the text of a reading on the projection
// controller into the church's own cache, which keeps 331 verses for 24 hours (see `cache-limits.ts`
// and the migration `scripture_verse_cache`). Only the items of a setlist can use it, not the Bible
// panel of the controller.
//
// A "database" translation has its full text in the table `scripture_books`, one row per book, for
// the signed-in users of the church only (see `load.ts`).

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
  /** Where the text comes from: the files of the app, the table `scripture_books`, or the cache of the pasted verses. */
  source: TranslationSource;
  /** The websites with the text, for links: the users copy a "pasted" translation from there. */
  sources?: TextSources;
};

/** The translation of the platform catalog. */
export const KAROLI: ScriptureTranslation = {
  id: "karoli1908",
  language: "hu",
  name: "Károli Gáspár revideált fordítása (1908)",
  shortName: "Károli",
  notice: null,
  deuterocanon: false,
  source: "files",
};

export const TRANSLATIONS: ScriptureTranslation[] = [KAROLI];

export const TRANSLATION_ID_PATTERN = /^[a-z0-9]{1,30}$/;

/** For a scripture reading without a translation. */
export const DEFAULT_TRANSLATION = KAROLI.id;

/**
 * The translation of the id: Károli, one of the church's `own` translations, or the default one for
 * null and for an id that the church does not have (anymore). For names, e.g. in a printed setlist.
 */
export function scriptureTranslation(
  id: string | null | undefined,
  own: readonly ScriptureTranslation[] = [],
): ScriptureTranslation {
  return [KAROLI, ...own].find((translation) => translation.id === id) ?? KAROLI;
}

// The settings of a church ----------------------------------------------------

/**
 * Which translations a church shows: Károli (`app_config.scripture_karoli`) and the church's own
 * translations that are on, each with its source ("pasted" or "database").
 */
export type ScriptureConfig = { karoli: boolean; own: ScriptureTranslation[] };

export const DEFAULT_SCRIPTURE_CONFIG: ScriptureConfig = { karoli: true, own: [] };

// One list for each configuration, so the lists keep their identity between renders.
const enabledLists = new WeakMap<ScriptureTranslation[], ScriptureTranslation[]>();
const karoliLists = new WeakMap<ScriptureTranslation[], ScriptureTranslation[]>();

/** The translations that are on: Károli first, then the church's own ones. Empty when all are off. */
export function enabledTranslations(config: ScriptureConfig): ScriptureTranslation[] {
  const lists = config.karoli ? enabledLists : karoliLists;
  let list = lists.get(config.own);
  if (!list) {
    list = config.karoli ? [KAROLI, ...config.own] : [...config.own];
    lists.set(config.own, list);
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
  const language = scriptureTranslation(id, enabled).language;
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
): string | null {
  return (enabled.find((translation) => translation.language === locale) ?? enabled[0])?.id ?? null;
}
