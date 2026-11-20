/** Kind of a Hungarian phone number. */
export type PhoneKind = "budapest" | "mobile" | "landline";

/** A parsed Hungarian phone number (country code 36). */
export interface PhoneParts {
  kind: PhoneKind;
  /** Area / mobile prefix without trunk zero: `1`, `30`, `22`. */
  areaCode: string;
  /** Subscriber digits: 7 for Budapest and mobile, 6 for other area codes. */
  subscriber: string;
}

const MOBILE_PREFIXES = new Set(["20", "30", "31", "50", "70"]);

/**
 * Parses a Hungarian phone number written in any common way
 * (`06 30 1234567`, `+36301234567`, `0036 (30) 123-4567`, `+36/1/234-5678`).
 * Numbers with another country code, or with the wrong number of digits, give `null`.
 */
export function parsePhone(input: string): PhoneParts | null {
  let s = input.trim().replace(/[\s().\-/]/g, "");
  if (s.startsWith("+")) {
    if (!s.startsWith("+36")) return null;
    s = s.slice(3);
  } else if (s.startsWith("0036")) {
    s = s.slice(4);
  } else if (s.startsWith("06")) {
    s = s.slice(2);
  } else if (s.startsWith("36")) {
    s = s.slice(2);
  } else {
    return null;
  }
  if (!/^\d+$/.test(s)) return null;

  if (s.length === 8 && s.startsWith("1")) {
    return { kind: "budapest", areaCode: "1", subscriber: s.slice(1) };
  }
  const prefix = s.slice(0, 2);
  if (s.length === 9 && MOBILE_PREFIXES.has(prefix)) {
    return { kind: "mobile", areaCode: prefix, subscriber: s.slice(2) };
  }
  if (s.length === 8 && /^[2-9]/.test(s) && !MOBILE_PREFIXES.has(prefix)) {
    return { kind: "landline", areaCode: prefix, subscriber: s.slice(2) };
  }
  return null;
}

/**
 * Normalises a Hungarian phone number, or returns `null` if it is not valid.
 *
 * @example normalizePhone("06 30 1234567") // "+36 30 123 4567"
 * @example normalizePhone("+3612345678") // "+36 1 234 5678"
 * @example normalizePhone("06-22/123-456") // "+36 22 123 456"
 */
export function normalizePhone(input: string): string | null {
  const p = parsePhone(input);
  if (!p) return null;
  const s = p.subscriber;
  const head = s.slice(0, 3);
  const tail = s.slice(3);
  return `+36 ${p.areaCode} ${head} ${tail}`;
}

/**
 * Like {@link normalizePhone}, but unparseable input (e.g. a foreign number) is returned trimmed
 * instead of `null`, so it can be displayed as entered.
 */
export function formatPhone(input: string): string {
  return normalizePhone(input) ?? input.trim();
}

/** `true` if the input is a valid Hungarian phone number. */
export function isValidPhone(input: string): boolean {
  return parsePhone(input) !== null;
}

/**
 * E.164 form for `tel:` links and storage, or `null` if invalid.
 * @example phoneToE164("06 30 123 4567") // "+36301234567"
 */
export function phoneToE164(input: string): string | null {
  const p = parsePhone(input);
  return p ? `+36${p.areaCode}${p.subscriber}` : null;
}
