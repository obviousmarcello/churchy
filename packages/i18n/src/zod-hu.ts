import { z } from "zod";
import { formatDateLong } from "@churchy/hu";

/**
 * Hungarian validation messages for Zod v4 (PRD L-01, CLAUDE.md "formal address").
 *
 * Short, formal (*Ön*) sentences meant to be shown next to a form field. Constructions that would
 * need suffix harmony after a number or a value ("N-nak", "X-et") are avoided on purpose.
 *
 * Use it per parse for forms: `schema.safeParse(data, { error: huZodErrorMap })`, or globally once
 * with {@link configureZodHungarian}. Messages written into a schema (`z.string().min(1, "…")`)
 * always win over this map.
 */

const nf = new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 10 });
const num = (n: number | bigint): string => nf.format(n);

const REQUIRED = "Ez a mező kötelező.";
const INVALID = "A megadott érték érvénytelen.";

const EXPECTED_TYPE: Record<string, string> = {
  string: "Kérjük, szöveget adjon meg.",
  number: "Kérjük, számot adjon meg.",
  int: "Kérjük, egész számot adjon meg.",
  bigint: "Kérjük, egész számot adjon meg.",
  boolean: "Kérjük, igen vagy nem értéket adjon meg.",
  date: "Kérjük, érvényes dátumot adjon meg.",
  array: "Kérjük, válasszon ki legalább egy elemet.",
  nan: "Kérjük, számot adjon meg.",
};

const FORMAT_MESSAGE: Record<string, string> = {
  email: "Adjon meg érvényes e-mail-címet.",
  url: "Adjon meg érvényes webcímet.",
  uuid: "A megadott azonosító formátuma nem megfelelő.",
  guid: "A megadott azonosító formátuma nem megfelelő.",
  date: "Adjon meg érvényes dátumot.",
  time: "Adjon meg érvényes időpontot.",
  datetime: "Adjon meg érvényes dátumot és időpontot.",
  iban: "Adjon meg érvényes IBAN-számot.",
  e164: "Adjon meg érvényes telefonszámot.",
  ipv4: "Adjon meg érvényes IP-címet.",
  ipv6: "Adjon meg érvényes IP-címet.",
};

function tooSmall(issue: z.core.$ZodIssueTooSmall): string {
  const { origin, minimum, inclusive = true, exact } = issue;
  if (origin === "string") {
    if (exact) return `Pontosan ${num(minimum)} karakter szükséges.`;
    return minimum === 1 && inclusive ? REQUIRED : `Legalább ${num(minimum)} karakter szükséges.`;
  }
  if (origin === "array" || origin === "set") {
    return minimum === 1 && inclusive
      ? "Kérjük, válasszon ki legalább egy elemet."
      : `Legalább ${num(minimum)} elem szükséges.`;
  }
  if (origin === "date") {
    return `A dátum nem lehet korábbi, mint ${formatDateLong(new Date(Number(minimum)))}.`;
  }
  return inclusive
    ? `Az érték nem lehet kisebb, mint ${num(minimum)}.`
    : `Az értéknek nagyobbnak kell lennie, mint ${num(minimum)}.`;
}

function tooBig(issue: z.core.$ZodIssueTooBig): string {
  const { origin, maximum, inclusive = true, exact } = issue;
  if (origin === "string") {
    if (exact) return `Pontosan ${num(maximum)} karakter szükséges.`;
    return `Legfeljebb ${num(maximum)} karakter adható meg.`;
  }
  if (origin === "array" || origin === "set") return `Legfeljebb ${num(maximum)} elem adható meg.`;
  if (origin === "date") {
    return `A dátum nem lehet későbbi, mint ${formatDateLong(new Date(Number(maximum)))}.`;
  }
  return inclusive
    ? `Az érték nem lehet nagyobb, mint ${num(maximum)}.`
    : `Az értéknek kisebbnek kell lennie, mint ${num(maximum)}.`;
}

function invalidFormat(issue: z.core.$ZodIssueInvalidStringFormat): string {
  switch (issue.format) {
    case "starts_with":
      return `A szövegnek ezzel kell kezdődnie: „${(issue as { prefix?: string }).prefix ?? ""}”.`;
    case "ends_with":
      return `A szövegnek ezzel kell végződnie: „${(issue as { suffix?: string }).suffix ?? ""}”.`;
    case "includes":
      return `A szövegnek tartalmaznia kell ezt: „${(issue as { includes?: string }).includes ?? ""}”.`;
    default:
      return FORMAT_MESSAGE[issue.format] ?? "A megadott érték formátuma nem megfelelő.";
  }
}

/** The Zod error map: one Hungarian sentence per issue. */
export const huZodErrorMap: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case "invalid_type":
      if (issue.input === undefined || issue.input === null) return REQUIRED;
      return EXPECTED_TYPE[issue.expected] ?? INVALID;
    case "too_small":
      return tooSmall(issue as z.core.$ZodIssueTooSmall);
    case "too_big":
      return tooBig(issue as z.core.$ZodIssueTooBig);
    case "invalid_format":
      return invalidFormat(issue as z.core.$ZodIssueInvalidStringFormat);
    case "not_multiple_of":
      return `Az érték nem osztható ezzel: ${num(issue.divisor)}.`;
    case "unrecognized_keys": {
      const keys = (issue.keys as string[]).join(", ");
      return issue.keys.length > 1 ? `Ismeretlen mezők: ${keys}.` : `Ismeretlen mező: ${keys}.`;
    }
    case "invalid_value":
      return issue.values.length === 1
        ? "A megadott érték nem fogadható el."
        : "Kérjük, válasszon a felkínált lehetőségek közül.";
    default:
      // invalid_union, invalid_key, invalid_element, custom
      return INVALID;
  }
};

/** Zod locale object: `z.config(huZodLocale())`. */
export function huZodLocale(): { localeError: z.core.$ZodErrorMap } {
  return { localeError: huZodErrorMap };
}

/** Make Hungarian the default error language of every Zod schema in this process. */
export function configureZodHungarian(): void {
  z.config(huZodLocale());
}
