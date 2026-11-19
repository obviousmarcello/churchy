import { z } from "zod";
import {
  AddressSchema,
  EmailSchema,
  IsoDateTimeSchema,
  PhoneSchema,
  TextSchema,
} from "../primitives";
import { DenominationSchema, SiteThemeSchema, TermFormsSchema } from "./tenants";

/**
 * First-setup import (D-34): the client pastes the address of their existing website, an import
 * job reads it and returns a *draft* of the new site — the `ImportResult`. The wizard shows the
 * draft for review; nothing here is stored in the tenant until the owner confirms.
 *
 * `ImportJob` is the seam of the importer: the mock adapter (`packages/data-mock`) replays a
 * scripted fixture and never touches the network; a real importer (fetching, reading pages and
 * extracting with rules or a model) implements the same interface and replaces it in
 * `apps/web/server/data-adapters.ts`.
 */

/** Below this confidence an item is flagged for the owner's attention in the wizard. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

/** A value the importer found on the old site, with how sure it is (0–1). */
export const detected = <T extends z.ZodType>(value: T) =>
  z.object({ value, confidence: z.number().min(0).max(1) });
export type Detected<T> = { value: T; confidence: number };

export const isLowConfidence = (item: { confidence: number }): boolean =>
  item.confidence < LOW_CONFIDENCE_THRESHOLD;

const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

/** A recurring service found on the old site. `location` refers to `ImportedLocation.id`. */
export const ImportedServiceTimeSchema = z.object({
  id: z.string().min(1),
  /** Name of the occasion as written on the old site (e.g. `Istentisztelet`). */
  label: TextSchema,
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: z.number().int().min(1).max(7),
  time: TimeOfDaySchema,
  location: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1),
});
export type ImportedServiceTime = z.infer<typeof ImportedServiceTimeSchema>;

export const ImportedLocationSchema = z.object({
  id: z.string().min(1),
  name: TextSchema,
  address: AddressSchema,
  confidence: z.number().min(0).max(1),
});
export type ImportedLocation = z.infer<typeof ImportedLocationSchema>;

/** A person listed on the old site. Names and photos are only taken over with an explicit opt-in. */
export const ImportedPersonSchema = z.object({
  id: z.string().min(1),
  name: TextSchema,
  role: TextSchema,
  /** Whether the old site shows a photo of the person (the image itself is not part of the result). */
  hasPhoto: z.boolean(),
  confidence: z.number().min(0).max(1),
});
export type ImportedPerson = z.infer<typeof ImportedPersonSchema>;

export const ImportResultSchema = z.object({
  sourceUrl: z.string().min(1),
  importedAt: IsoDateTimeSchema,
  pagesRead: z.number().int().min(0),
  church: z.object({
    name: detected(TextSchema),
    shortName: detected(TextSchema),
    tagline: detected(z.string().max(200)).optional(),
    /** Denomination preset chosen from the wording of the old site. */
    denomination: detected(DenominationSchema),
  }),
  /** Term overrides on top of the preset (`TermKey` → forms). */
  terminology: z.record(z.string(), detected(TermFormsSchema)).default({}),
  serviceTimes: z.array(ImportedServiceTimeSchema),
  locations: z.array(ImportedLocationSchema),
  contact: z.object({
    email: detected(EmailSchema).optional(),
    phone: detected(PhoneSchema).optional(),
  }),
  theme: z.object({
    value: SiteThemeSchema,
    confidence: z.number().min(0).max(1),
  }),
  staff: z.array(ImportedPersonSchema),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;

/** The stages of an import, in the order a job reports them. */
export const IMPORT_STAGES = [
  "fetched",
  "pages",
  "serviceTimes",
  "contacts",
  "theme",
  "preset",
  "draft",
] as const;
export const ImportStageSchema = z.enum(IMPORT_STAGES);
export type ImportStage = z.infer<typeof ImportStageSchema>;

/**
 * What a job streams: each stage `started` then `completed` (with a count where it makes sense,
 * e.g. pages read), then exactly one terminal event — `result` or `failed`.
 */
export const ImportEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stage"),
    stage: ImportStageSchema,
    status: z.enum(["started", "completed"]),
    count: z.number().int().min(0).optional(),
  }),
  z.object({ type: z.literal("result"), result: ImportResultSchema }),
  z.object({ type: z.literal("failed"), code: z.enum(["invalid_url", "unreachable"]) }),
]);
export type ImportEvent = z.infer<typeof ImportEventSchema>;

export interface ImportJob {
  /**
   * Starts importing `url` (as typed by the client, see `parseImportUrl`) and streams the events.
   * The stream ends after its terminal event; aborting `signal` ends it early.
   */
  start(url: string, options?: { signal?: AbortSignal }): AsyncIterable<ImportEvent>;
}

/**
 * Normalises what the client typed into the website field: trims, adds `https://` when no scheme
 * was given. Returns `null` for anything that is not a plausible web address. Pure; shared by the
 * wizard and every importer.
 */
export function parseImportUrl(input: string): string | null {
  const text = input.trim();
  if (text === "" || /\s/.test(text)) return null;
  // `mailto:…`, `javascript:…` and the like are not web addresses (`host:8080` is).
  if (!text.includes("://") && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text)) return null;
  const withScheme = text.includes("://") ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
