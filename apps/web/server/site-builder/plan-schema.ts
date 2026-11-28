import { DenominationSchema, LocationKindSchema } from "@churchy/contracts";
import { z } from "zod";

/**
 * What the model returns (via the `submit_plan` tool) and the pipeline validates with Zod. It only
 * *decides and condenses*: which crawled URL is what, the structured facts, and the short
 * Churchy-written copy. The church's own page texts are never re-emitted by the model; they are
 * carried over deterministically from the extractor, so a prompt-injected page cannot rewrite
 * them, and the output stays small.
 */

export const PAGE_ROLES = [
  "home",
  "about",
  "schedule",
  "contact",
  "rite",
  "group",
  "history",
  "gallery",
  "event",
  "news_index",
  "news_article",
  "announcement",
  "other",
  "skip",
] as const;
export const PageRoleSchema = z.enum(PAGE_ROLES);
export type PageRole = z.infer<typeof PageRoleSchema>;

const conf = z.number().min(0).max(1);

export const LlmPlanSchema = z.object({
  church: z.object({
    name: z.string().min(1).max(200),
    shortName: z.string().min(1).max(80),
    nameSourceUrl: z.string().max(2000),
    denomination: DenominationSchema,
    denominationConfidence: conf,
    /** Short tagline in neutral, informal ("tegező") Hungarian, or empty. */
    tagline: z.string().max(160),
    /** Two or three welcoming sentences in neutral informal Hungarian, written from the facts only. */
    welcome: z.string().max(900),
  }),
  locations: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        kind: LocationKindSchema,
        postalCode: z.string().max(10),
        city: z.string().max(100),
        line1: z.string().max(200),
        sourceUrl: z.string().max(2000),
        confidence: conf,
      }),
    )
    .max(20),
  serviceTimes: z
    .array(
      z.object({
        label: z.string().min(1).max(200),
        weekday: z.number().int().min(1).max(7),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        locationName: z.string().max(200),
        sourceUrl: z.string().max(2000),
        confidence: conf,
      }),
    )
    .max(60),
  pages: z
    .array(
      z.object({
        url: z.string().max(2000),
        role: PageRoleSchema,
        title: z.string().min(1).max(200),
        /** Lowercase ASCII words joined by hyphens. */
        slug: z.string().max(80),
        riteKey: z.string().max(60),
      }),
    )
    .max(40),
  posts: z
    .array(
      z.object({
        url: z.string().max(2000),
        title: z.string().min(1).max(200),
        /** One or two sentence summary in neutral informal Hungarian. */
        lead: z.string().max(500),
        /** ISO date `YYYY-MM-DD` if the page shows one, else empty. */
        publishedAt: z.string().max(20),
      }),
    )
    .max(60),
  announcements: z
    .array(z.object({ url: z.string().max(2000), weekSunday: z.string().max(20) }))
    .max(30),
  /** Things the operator should look at, in English (shown through codes by the app, not verbatim). */
  notes: z.array(z.string().max(300)).max(10),
});
export type LlmPlan = z.infer<typeof LlmPlanSchema>;

const UNSUPPORTED = new Set([
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "$schema",
  "default",
  "title",
]);

/** JSON Schema for the strict tool: Zod's output minus the keywords strict mode does not take. */
export function planJsonSchema(): Record<string, unknown> {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (UNSUPPORTED.has(k) && typeof v !== "object") continue;
        out[k] = strip(v);
      }
      if (out.type === "object" && out.properties) out.additionalProperties = false;
      return out;
    }
    return node;
  };
  return strip(z.toJSONSchema(LlmPlanSchema, { io: "output" })) as Record<string, unknown>;
}
