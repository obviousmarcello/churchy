import {
  AddressSchema,
  DenominationSchema,
  EmailSchema,
  HexColorSchema,
  ImportedServiceTimeSchema,
  LocationKindSchema,
  PhoneSchema,
  RichTextSchema,
  SlugSchema,
  TextSchema,
} from "@churchy/contracts";
import { z } from "zod";

/**
 * The draft site (SDD ADR site builder): the review document of an operator, stored as JSON in
 * `site_drafts` until it is applied or purged. It is shaped like Churchy's own content model
 * (pages, news, announcements, locations, schedule, media) so applying it is a mapping, not an
 * interpretation. Image references are draft ids; real media rows exist only after apply.
 */

export const DRAFT_VERSION = 1;

const ConfidenceSchema = z.number().min(0).max(1);

/** Every item keeps the page it came from (attribution) and can be switched off in the review. */
const SourceShape = {
  sourceUrl: z.string().min(1).max(2000),
  include: z.boolean(),
};

export const DraftImageSchema = z.object({
  id: z.string().min(1).max(40),
  sourceUrl: z.string().min(1).max(2000),
  /** Pages the image was seen on. */
  pageUrls: z.array(z.string().max(2000)).max(10),
  alt: z.string().max(300),
  role: z.enum(["logo", "hero", "content"]),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  include: z.boolean(),
  /** Not on the church's own domain: listed, never downloaded unless the operator opts in. */
  offsite: z.boolean(),
  /** Photos may show people: the church confirms consent before publishing (C-06). */
  mayShowPeople: z.boolean(),
});
export type DraftImage = z.infer<typeof DraftImageSchema>;

export const DraftBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heading"),
    text: TextSchema,
    level: z.union([z.literal(2), z.literal(3)]),
  }),
  z.object({ type: z.literal("text"), content: RichTextSchema }),
  z.object({
    type: z.literal("image"),
    imageId: z.string().min(1).max(40),
    caption: z.string().max(300).nullable(),
  }),
  z.object({
    type: z.literal("quote"),
    text: z.string().min(1).max(1000),
    source: z.string().max(200).nullable(),
  }),
]);
export type DraftBlock = z.infer<typeof DraftBlockSchema>;

export const DraftPageSchema = z.object({
  id: z.string().min(1).max(40),
  ...SourceShape,
  slug: SlugSchema,
  title: TextSchema,
  /** `rite` pages map to rite information pages (`riteKey`). */
  kind: z.enum(["page", "rite"]),
  riteKey: z.string().max(60).nullable(),
  blocks: z.array(DraftBlockSchema).max(300),
});
export type DraftPage = z.infer<typeof DraftPageSchema>;

export const DraftPostSchema = z.object({
  id: z.string().min(1).max(40),
  ...SourceShape,
  slug: SlugSchema,
  title: TextSchema,
  /** Churchy-written summary (neutral informal Hungarian); the body below is the church's own text. */
  lead: z.string().max(600),
  body: RichTextSchema,
  publishedAt: z.string().max(40).nullable(),
});
export type DraftPost = z.infer<typeof DraftPostSchema>;

export const DraftAnnouncementSchema = z.object({
  id: z.string().min(1).max(40),
  ...SourceShape,
  weekSunday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  body: RichTextSchema,
});

export const DraftLocationSchema = z.object({
  id: z.string().min(1).max(40),
  ...SourceShape,
  name: TextSchema,
  kind: LocationKindSchema,
  address: AddressSchema.nullable(),
  confidence: ConfidenceSchema,
});
export type DraftLocation = z.infer<typeof DraftLocationSchema>;

export const DraftWarningSchema = z.object({
  /** Machine code; the review UI looks the Hungarian text up by it. */
  code: z.enum([
    "robots_blocked",
    "page_failed",
    "page_budget",
    "image_budget",
    "offsite_image",
    "personal_data_removed",
    "unverified_service_time",
    "unverified_address",
    "low_confidence",
    "dropped_unknown_url",
    "cost_cap",
    "denomination_disagrees",
    "no_logo",
    "people_images",
  ]),
  /** Page or item the warning is about, when there is one. */
  url: z.string().max(2000).nullable(),
  count: z.number().int().nonnegative().nullable(),
});
export type DraftWarning = z.infer<typeof DraftWarningSchema>;

export const DraftMetaSchema = z.object({
  sourceUrl: z.string().min(1).max(2000),
  createdAt: z.string(),
  expiresAt: z.string(),
  /** The operator who ran the build (`auth.users.id`). */
  operatorId: z.string().min(1),
  /** The recorded consent: "the church asked us to prepare its site from this address". */
  consent: z.object({
    confirmed: z.literal(true),
    statement: z.string().min(1).max(500),
    at: z.string(),
  }),
  /** Optional free-text note of the operator on who asked (no personal data of the church's people). */
  consentNote: z.string().max(300).nullable(),
  model: z.string().nullable(),
  usage: z.object({
    pages: z.number().int().nonnegative(),
    images: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
  }),
});

export const SiteDraftSchema = z.object({
  version: z.literal(DRAFT_VERSION),
  meta: DraftMetaSchema,
  church: z.object({
    name: z.object({
      value: TextSchema,
      confidence: ConfidenceSchema,
      sourceUrl: z.string().max(2000),
    }),
    shortName: z.object({ value: TextSchema, confidence: ConfidenceSchema }),
    tagline: z.string().max(200).nullable(),
    denomination: z.object({ value: DenominationSchema, confidence: ConfidenceSchema }),
    /** Churchy-written welcome text (neutral informal Hungarian), for the home page. */
    welcome: z.string().max(1200).nullable(),
  }),
  theme: z.object({
    primary: HexColorSchema.nullable(),
    source: z.enum(["meta", "none"]),
  }),
  contact: z.object({
    email: EmailSchema.nullable(),
    phone: PhoneSchema.nullable(),
    address: AddressSchema.nullable(),
  }),
  locations: z.array(DraftLocationSchema).max(30),
  serviceTimes: z
    .array(
      ImportedServiceTimeSchema.extend({ sourceUrl: z.string().max(2000), include: z.boolean() }),
    )
    .max(80),
  pages: z.array(DraftPageSchema).max(40),
  posts: z.array(DraftPostSchema).max(60),
  announcements: z.array(DraftAnnouncementSchema).max(30),
  images: z.array(DraftImageSchema).max(80),
  warnings: z.array(DraftWarningSchema).max(200),
});
export type SiteDraft = z.infer<typeof SiteDraftSchema>;
