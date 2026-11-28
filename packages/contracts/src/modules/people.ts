import { z } from "zod";
import type { Ctx } from "../ctx";
import {
  EmailSchema,
  IdSchema,
  IsoDateTimeSchema,
  PhoneSchema,
  TextSchema,
  TimestampsShape,
} from "../primitives";

/**
 * Who may see a contact field (D-51 AC3, four levels):
 * `public` website visitors · `workspace` all workspace users · `team` members of a shared team ·
 * `private` leaders/HR only.
 */
export const ContactVisibilitySchema = z.enum(["public", "workspace", "team", "private"]);
export type ContactVisibility = z.infer<typeof ContactVisibilitySchema>;

export const StaffGroupSchema = z.enum(["clergy", "staff", "council", "volunteer"]);
export type StaffGroup = z.infer<typeof StaffGroupSchema>;

/**
 * `people` (SDD §8.2, §21.1) — the single person record for the public staff page AND the
 * workspace directory. Names are stored split; `packages/hu` renders family name first.
 */
export const PersonSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  /** Login link; null for people without an account (children, some elderly volunteers). */
  userId: IdSchema.nullable(),
  prefix: z.string().max(40).nullable(),
  familyName: TextSchema,
  givenName: TextSchema,
  suffix: z.string().max(40).nullable(),
  roleTitle: z.string().max(120).nullable(),
  staffGroup: StaffGroupSchema,
  /** Shown on the public staff page (*Munkatársaink*). */
  isPublic: z.boolean(),
  bio: z.string().max(4000).nullable(),
  email: EmailSchema.nullable(),
  phone: PhoneSchema.nullable(),
  contactVisibility: z.object({
    email: ContactVisibilitySchema,
    phone: ContactVisibilitySchema,
  }),
  skills: z.array(z.string().min(1).max(60)),
  photoMediaId: IdSchema.nullable(),
  /** Under-18 volunteers: contact hidden from non-leaders by default (SDD §28). */
  isMinor: z.boolean(),
  guardianEmail: EmailSchema.nullable(),
  active: z.boolean(),
  sort: z.number().int(),
  ...TimestampsShape,
});
export type Person = z.infer<typeof PersonSchema>;

export const PersonInputSchema = z.object({
  id: IdSchema.optional(),
  userId: IdSchema.nullable().default(null),
  prefix: z.string().max(40).nullable().default(null),
  familyName: TextSchema,
  givenName: TextSchema,
  suffix: z.string().max(40).nullable().default(null),
  roleTitle: z.string().max(120).nullable().default(null),
  staffGroup: StaffGroupSchema.default("volunteer"),
  isPublic: z.boolean().default(false),
  bio: z.string().max(4000).nullable().default(null),
  email: EmailSchema.nullable().default(null),
  phone: PhoneSchema.nullable().default(null),
  contactVisibility: PersonSchema.shape.contactVisibility.default({
    email: "workspace",
    phone: "workspace",
  }),
  skills: z.array(z.string().min(1).max(60)).default([]),
  photoMediaId: IdSchema.nullable().default(null),
  isMinor: z.boolean().default(false),
  guardianEmail: EmailSchema.nullable().default(null),
  active: z.boolean().default(true),
  sort: z.number().int().default(0),
});
export type PersonInput = z.input<typeof PersonInputSchema>;

/**
 * Public projection for the website staff page. `email`/`phone` are null unless that field's
 * visibility is `public`.
 */
export const PublicPersonSchema = PersonSchema.pick({
  id: true,
  prefix: true,
  familyName: true,
  givenName: true,
  suffix: true,
  roleTitle: true,
  staffGroup: true,
  bio: true,
  email: true,
  phone: true,
  photoMediaId: true,
  sort: true,
});
export type PublicPerson = z.infer<typeof PublicPersonSchema>;

/** `availability_blocks` (SDD §21.1) — self-declared unavailability (*„Nem érek rá”*). */
export const AvailabilityBlockSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  personId: IdSchema,
  from: IsoDateTimeSchema,
  to: IsoDateTimeSchema,
  rrule: z.string().max(500).nullable(),
  note: z.string().max(300).nullable(),
});
export type AvailabilityBlock = z.infer<typeof AvailabilityBlockSchema>;

export const AvailabilityBlockInputSchema = AvailabilityBlockSchema.omit({
  id: true,
  tenantId: true,
})
  .extend({
    rrule: z.string().max(500).nullable().default(null),
    note: z.string().max(300).nullable().default(null),
  })
  .refine((b) => Date.parse(b.to) > Date.parse(b.from), {
    message: "to must be after from",
    path: ["to"],
  });
export type AvailabilityBlockInput = z.input<typeof AvailabilityBlockInputSchema>;

export type PersonQuery = {
  /** Accent-insensitive match on given/family name. */
  query?: string;
  skill?: string;
  staffGroup?: StaffGroup;
  active?: boolean;
  ids?: string[];
};

/**
 * Module `people` — persons and their availability. Lists are sorted by family name, then given
 * name (Hungarian collation), except the public staff list which uses `sort`.
 */
export interface PersonRepo {
  /** @public Active, `isPublic` people as `PublicPerson`, by `staffGroup` then `sort`. */
  listPublicStaff(ctx: Ctx): Promise<PublicPerson[]>;
  /** Workspace directory (anonymous: empty). Contact-field filtering per viewer is `can()`'s job. */
  list(ctx: Ctx, query?: PersonQuery): Promise<Person[]>;
  /** One by id (anonymous: null). */
  get(ctx: Ctx, id: string): Promise<Person | null>;
  /** The person linked to a login in the ctx tenant (anonymous: null). */
  getByUserId(ctx: Ctx, userId: string): Promise<Person | null>;
  /** Tenant ctx: create/update. */
  upsert(ctx: Ctx, input: PersonInput): Promise<Person>;
  /** Tenant ctx: delete. */
  delete(ctx: Ctx, id: string): Promise<void>;
  /** Tenant ctx: set `sort` to the index in `ids` (staff page ordering). */
  reorder(ctx: Ctx, ids: string[]): Promise<void>;

  /** Availability blocks overlapping [from, to], optionally for some people (anonymous: empty). */
  listAvailability(
    ctx: Ctx,
    range: { from: string; to: string; personIds?: string[] },
  ): Promise<AvailabilityBlock[]>;
  /** Tenant ctx: add a block. NOT_FOUND for a person outside the tenant. */
  addAvailability(ctx: Ctx, input: AvailabilityBlockInput): Promise<AvailabilityBlock>;
  /** Tenant ctx: remove a block. */
  removeAvailability(ctx: Ctx, id: string): Promise<void>;
}
