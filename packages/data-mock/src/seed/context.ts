/** Shared state while one church is built. */
import type { MockDataset } from "../dataset";
import type { Clock, IsoDate } from "./clock";
import type { ChurchSpec, When } from "./types";
import { addDays } from "@churchy/hu";

export interface Build {
  spec: ChurchSpec;
  c: Clock;
  /** Short key used in ids (`szentkristof`). */
  k: string;
  tid: string;
  ds: MockDataset;
  /** Global set of used e-mail addresses (unique across churches). */
  emails: Set<string>;
  personId: Map<string, string>;
  userId: Map<string, string>;
  personaUser: Map<string, string>;
  personaPerson: Map<string, string>;
  teamId: Map<string, string>;
  positionId: Map<string, string>;
  locationId: Map<string, string>;
  roomId: Map<string, string>;
  ruleId: Map<string, string>;
  calendarId: Map<string, string>;
  hrCategoryId: Map<string, string>;
  formId: Map<string, string>;
  /** Image media ids (placeholder `templom.svg` records) for covers and heroes. */
  imageIds: string[];
  /** Resolved services (incl. cancelled) for the materialized window, by `<ruleKey>|<date>`. */
  serviceByRuleDate: Map<
    string,
    { occurrenceId: string; startsAt: string; endsAt: string; status: string }
  >;
  /** End instant per materialized occurrence id. */
  occEnd: Map<string, string>;
  songId: string[];
  arrangementIds: string[][];
  templateId: string[];
}

export function dateOf(b: Pick<Build, "c">, when: When): IsoDate {
  return "in" in when ? b.c.day(when.in) : b.c.weekday(when.weekday, when.week ?? 0);
}

export const addDaysIso = addDays;

/** Placeholder asset reused for every image record (no binary assets are added). */
export const PLACEHOLDER_IMAGE = "demo/templom.svg";
export const PLACEHOLDER_PDF = "demo/minta-dokumentum.pdf";

/** Sequential unique phone numbers `+36 30 000 xxxx`. */
export function phoneGen(base: number): () => string {
  let n = base;
  return () => `+36 30 000 ${String(n++).padStart(4, "0")}`;
}

type FormVal = string | boolean | string[] | null;

/** Replaces `{+12}` / `{-8}` tokens in form data with the civil date that many days from today. */
export function relData(
  b: Pick<Build, "c">,
  data: Record<string, FormVal>,
): Record<string, FormVal> {
  const out: Record<string, FormVal> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] =
      typeof value === "string"
        ? value.replace(/\{([+-]?\d+)\}/g, (_m, n: string) => b.c.day(Number(n)))
        : value;
  }
  return out;
}
