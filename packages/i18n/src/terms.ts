import type { Denomination, TermForms } from "@churchy/contracts";

/**
 * Denomination terminology (SDD §5.3, CLAUDE.md "Generated text").
 *
 * UI copy never hard-codes denomination words: a Reformed church has no *szentmise*. Terms are
 * looked up by key (`service`, `serviceSchedule`, …) and carry every grammatical form the UI needs,
 * so nothing is suffixed at runtime.
 */

/** Grammatical forms a message placeholder or code can ask for (keys of `TermForms`). */
export const TERM_FORM_NAMES = ["nom", "lower", "slug", "plural", "article"] as const;
export type TermFormName = (typeof TERM_FORM_NAMES)[number];

/** A term key as defined by `packages/presets` (`service`, `serviceSchedule`, `leadClergy`, …). */
export type TermKey = string;

/** All terms of one tenant, by key. */
export type TermMap = Readonly<Record<TermKey, TermForms>>;

/**
 * Where default terms come from. The real implementation is `presetTermSource`
 * (`@churchy/presets`, D-23); tests can pass their own.
 */
export interface TermSource {
  /** Preset terms of a denomination, or `undefined` when the denomination is unknown. */
  termsFor(denomination: Denomination): TermMap | undefined;
}

/** Thrown when code or a message asks for a term or form that the effective terminology lacks. */
export class MissingTermError extends Error {
  constructor(
    readonly key: string,
    readonly form?: TermFormName,
  ) {
    super(form ? `Missing term form "${key}.${form}"` : `Missing term "${key}"`);
    this.name = "MissingTermError";
  }
}

/** The effective terminology of a tenant: preset terms with the church's own overrides on top. */
export interface Terms {
  readonly denomination: Denomination;
  /** `t.term('serviceSchedule').nom` — all forms of a term. */
  term(key: TermKey): TermForms;
  /** One form of a term; `plural` throws {@link MissingTermError} when the term has none. */
  form(key: TermKey, form: TermFormName): string;
  has(key: TermKey): boolean;
  /** Plain, serialisable map of every term (for passing to client components). */
  all(): TermMap;
  /** Stable identity of the effective terminology (cache key for resolved catalogs). */
  readonly fingerprint: string;
}

export interface ResolveTermsInput {
  source: TermSource;
  denomination: Denomination;
  /** Tenant overrides (`siteConfig.terminology`), merged per key over the preset. */
  overrides?: Readonly<Record<TermKey, TermForms>>;
}

/** Terms from an already resolved map, e.g. on the client after the server passed `terms.all()`. */
export function termsFromMap(denomination: Denomination, map: TermMap): Terms {
  return resolveTerms({ source: { termsFor: () => map }, denomination });
}

/** Terms of an effective site config (`effectiveConfig()` from `@churchy/presets`). */
export function termsFromConfig(config: {
  denomination: Denomination;
  terminology: TermMap;
}): Terms {
  return termsFromMap(config.denomination, config.terminology);
}

export function resolveTerms({ source, denomination, overrides }: ResolveTermsInput): Terms {
  const preset = source.termsFor(denomination) ?? {};
  const merged: TermMap = { ...preset, ...(overrides ?? {}) };

  const term = (key: TermKey): TermForms => {
    const forms = Object.hasOwn(merged, key) ? merged[key] : undefined;
    if (!forms) throw new MissingTermError(key);
    return forms;
  };

  return {
    denomination,
    term,
    form(key, form) {
      const value = term(key)[form];
      if (value === undefined) throw new MissingTermError(key, form);
      return value;
    },
    has: (key) => Object.hasOwn(merged, key),
    all: () => merged,
    fingerprint: `${denomination}:${JSON.stringify(merged)}`,
  };
}

/** Matches `{service.plural}`, `{serviceSchedule.nom}` … */
const TERM_PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\.(nom|lower|slug|plural|article)\}/g;

/** Term placeholders used by a message, as `[key, form]` pairs. */
export function termPlaceholders(message: string): Array<[TermKey, TermFormName]> {
  return [...message.matchAll(TERM_PLACEHOLDER)].map(
    (m) => [m[1] as TermKey, m[2] as TermFormName] as [TermKey, TermFormName],
  );
}

/** Escape text so ICU MessageFormat treats it literally. */
export function escapeIcu(text: string): string {
  return text.replace(/'/g, "''").replace(/[{}<>]/g, (c) => `'${c}'`);
}

/**
 * Replace term placeholders in one message. The result is still an ICU message: substituted values
 * are escaped, so a term containing an apostrophe or brace cannot break formatting.
 *
 * @example interpolateTerms("Következő {service.plural}", terms) // "Következő szentmisék"
 */
export function interpolateTerms(message: string, terms: Terms): string {
  return message.replace(TERM_PLACEHOLDER, (_all, key: string, form: TermFormName) =>
    escapeIcu(terms.form(key, form)),
  );
}

/** Nested catalog (`messages/hu.json`). */
export type MessageTree = { [key: string]: string | MessageTree };

/** Resolve term placeholders in every message of a catalog. Pure; the input is not modified. */
export function resolveCatalogTerms<T extends MessageTree>(catalog: T, terms: Terms): T {
  const walk = (node: MessageTree): MessageTree =>
    Object.fromEntries(
      Object.entries(node).map(([k, v]) => [
        k,
        typeof v === "string" ? interpolateTerms(v, terms) : walk(v),
      ]),
    );
  return walk(catalog) as T;
}

/**
 * Wrap a translator function with `.term()`, so components write
 * `t("title")` and `t.term("serviceSchedule").nom` from the same object.
 */
export function withTerms<F extends (...args: never[]) => unknown>(
  translator: F,
  terms: Terms,
): F & { term: Terms["term"] } {
  const wrapped = ((...args: Parameters<F>) => translator(...args)) as F;
  // Copy `rich`, `markup`, `raw`, `has` … so the wrapper is a drop-in replacement.
  Object.assign(wrapped, translator);
  return Object.assign(wrapped, { term: terms.term });
}
