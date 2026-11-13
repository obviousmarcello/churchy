/** A person's name as stored; every part is optional except the family name. */
export interface PersonName {
  /** Family name (*Kovács*). */
  familyName: string;
  /** Given name(s) (*János*). */
  givenName?: string;
  /** Title in front of the name: `dr.`, `P.`, `Fr.`, `ifj.`. */
  prefix?: string;
  /** Suffix after the name: `PhD`, `OSB`. */
  suffix?: string;
}

/** Options for {@link formatPersonName}. */
export interface PersonNameOptions {
  /** Include prefix and suffix. Default `true`; use `false` for sort keys. */
  titles?: boolean;
}

const clean = (s: string | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Hungarian name order: family name first, with optional prefix title and suffix.
 * Whitespace is normalised; the parts are never altered or suffixed (generated text
 * must not inflect user-provided names).
 *
 * @example formatPersonName({ prefix: "dr.", familyName: "Kovács", givenName: "János" }) // "dr. Kovács János"
 * @example formatPersonName({ prefix: "P.", familyName: "Nagy", givenName: "Tamás", suffix: "OSB" }) // "P. Nagy Tamás OSB"
 */
export function formatPersonName(name: PersonName, options: PersonNameOptions = {}): string {
  const titles = options.titles !== false;
  return [
    titles ? clean(name.prefix) : "",
    clean(name.familyName),
    clean(name.givenName),
    titles ? clean(name.suffix) : "",
  ]
    .filter((part) => part !== "")
    .join(" ");
}
