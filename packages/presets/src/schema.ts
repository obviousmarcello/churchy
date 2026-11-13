import { z } from "zod";
import {
  DenominationSchema,
  HomeSectionSchema,
  ModuleKeySchema,
  PlanItemTypeSchema,
  SlugSchema,
  TermFormsSchema,
  TextSchema,
} from "@churchy/contracts";

// ---------------------------------------------------------------------------------------------
// Term keys (SDD §5.3). The contracts leave the key set open (`Record<string, TermForms>`);
// this package owns it.
// ---------------------------------------------------------------------------------------------

/** Concepts of PRD §5.2 — every preset defines all of them. */
export const DENOMINATIONAL_TERM_KEYS = [
  "community",
  "service",
  "serviceSchedule",
  "leadClergy",
  "office",
  "sermon",
  "layCouncil",
  "support",
  "worshipTeam",
  "musicPlan",
  "serviceRota",
] as const;

/**
 * Section / page names that appear in the navigation, headings and URL map (SDD §6). The platform
 * defaults define all of them; a preset overrides the ones that differ by denomination
 * (e.g. `ritesSection`: *Szentségek* → `/szentsegek` vs. *Alkalmak* → `/alkalmak`).
 */
export const SECTION_TERM_KEYS = [
  "homePage",
  "announcementsSection",
  "newsSection",
  "eventsSection",
  "locationsSection",
  "staffSection",
  "groupsSection",
  "ritesSection",
  "sermonsSection",
  "livestreamSection",
  "gallerySection",
  "documentsSection",
  "givingSection",
  "aboutPage",
  "contactPage",
] as const;

export const TERM_KEYS = [...DENOMINATIONAL_TERM_KEYS, ...SECTION_TERM_KEYS] as const;
export const TermKeySchema = z.enum(TERM_KEYS);
export type TermKey = z.infer<typeof TermKeySchema>;
export type DenominationalTermKey = (typeof DENOMINATIONAL_TERM_KEYS)[number];
export type SectionTermKey = (typeof SECTION_TERM_KEYS)[number];

// ---------------------------------------------------------------------------------------------
// Preset parts
// ---------------------------------------------------------------------------------------------

/**
 * Review state shown in the setup wizard (D-23 AC4):
 * - `reviewed`: signed off by the clergy of a pilot church of that denomination;
 * - `pending-review`: a pilot reviewer exists but has not signed off yet — selectable, no label,
 *   but blocks R1 GA (M4);
 * - `beta`: no pilot reviewer — the wizard labels it *béta*.
 */
export const ReviewStatusSchema = z.enum(["reviewed", "pending-review", "beta"]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

/** Sign-off record, rendered into `docs/presets-review.md`. Role and church, no personal data. */
export const PresetSignOffSchema = z.object({
  reviewer: TextSchema,
  date: z.iso.date(),
  note: z.string().max(500).optional(),
});
export type PresetSignOff = z.infer<typeof PresetSignOffSchema>;

/**
 * A requestable rite (FR-010). `key` is the rite page's `riteKey` and the `FormDefinition.key`
 * (e.g. `keresztelo`); it equals `forms.slug`.
 */
export const RiteSchema = z.object({
  key: SlugSchema,
  forms: TermFormsSchema,
  /** Request reference prefix, e.g. `KER` → `KER-2026-0042`. */
  referencePrefix: z.string().regex(/^[A-Z]{2,5}$/),
});
export type Rite = z.infer<typeof RiteSchema>;

/** A service type (FR-002). `key` is the `serviceType` stored on rules/occurrences. */
export const ServiceTypeSchema = z.object({
  key: SlugSchema,
  forms: TermFormsSchema,
  /** Main service type: the schedule wizard proposes it first and it has a plan template. */
  main: z.boolean(),
});
export type ServiceType = z.infer<typeof ServiceTypeSchema>;

/** One entry of the navigation template; label and path come from the (effective) term. */
const NavTemplateLinkSchema = z.object({
  term: TermKeySchema,
  /** Fixed path instead of `/<term slug>` (only the home page uses `/`). */
  href: z.string().startsWith("/").optional(),
  /** Hidden when this module is switched off (FR-105). */
  module: ModuleKeySchema.optional(),
});
export const NavTemplateItemSchema = NavTemplateLinkSchema.extend({
  children: z.array(NavTemplateLinkSchema).max(20).default([]),
});
export type NavTemplateItem = z.input<typeof NavTemplateItemSchema>;

/** Plan template of a preset (FR-802); stored as a `PlanTemplate` with `tenantId = null`. */
export const PresetPlanTemplateSchema = z.object({
  serviceType: SlugSchema,
  name: TextSchema,
  items: z
    .array(
      z.object({
        type: PlanItemTypeSchema,
        title: TextSchema,
        notes: z.string().max(2000).optional(),
      }),
    )
    .min(1),
});
export type PresetPlanTemplate = z.infer<typeof PresetPlanTemplateSchema>;

const termRecord = <K extends string>(keys: readonly [K, ...K[]]) =>
  z.object(
    Object.fromEntries(keys.map((k) => [k, TermFormsSchema])) as Record<K, typeof TermFormsSchema>,
  );

export const DenominationalTermsSchema = termRecord(DENOMINATIONAL_TERM_KEYS);
export const SectionTermsSchema = termRecord(SECTION_TERM_KEYS);

/** A denomination preset (PRD §5, SDD §5.1). */
export const PresetSchema = z
  .object({
    key: DenominationSchema,
    /** Display name in the setup wizard, e.g. *Római katolikus*. */
    name: TextSchema,
    reviewStatus: ReviewStatusSchema,
    signOff: PresetSignOffSchema.nullable(),
    /** Liturgical calendar shown by `packages/calendar` (gk → catholic, see its README). */
    calendarFamily: z.enum(["catholic", "protestant"]),
    /** All PRD §5.2 concepts, plus section names that differ from the platform defaults. */
    terminology: DenominationalTermsSchema.extend(SectionTermsSchema.partial().shape),
    rites: z.array(RiteSchema).min(1),
    serviceTypes: z.array(ServiceTypeSchema).min(1),
    /** Default positions of the generic rota (FR-812); `plural` is used in lists. */
    rotaPositions: z.array(TermFormsSchema).min(1),
    /** Module defaults that differ from the platform defaults. */
    modules: z.partialRecord(ModuleKeySchema, z.boolean()),
    home: z.array(HomeSectionSchema).min(1),
    navigation: z.array(NavTemplateItemSchema).min(1).max(12),
    planTemplates: z.array(PresetPlanTemplateSchema).min(2),
  })
  .superRefine((p, ctx) => {
    if ((p.reviewStatus === "reviewed") !== (p.signOff !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["signOff"],
        message: "A preset is `reviewed` exactly when it has a sign-off",
      });
    }
    const types = new Set(p.serviceTypes.map((s) => s.key));
    for (const [i, t] of p.planTemplates.entries()) {
      if (!types.has(t.serviceType)) {
        ctx.addIssue({
          code: "custom",
          path: ["planTemplates", i, "serviceType"],
          message: `Unknown service type "${t.serviceType}"`,
        });
      }
    }
    const templated = new Set(p.planTemplates.map((t) => t.serviceType));
    for (const [i, s] of p.serviceTypes.entries()) {
      if (s.main && !templated.has(s.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["serviceTypes", i],
          message: `Main service type "${s.key}" has no plan template`,
        });
      }
    }
    for (const [i, r] of p.rites.entries()) {
      if (r.key !== r.forms.slug) {
        ctx.addIssue({ code: "custom", path: ["rites", i, "key"], message: "key must equal slug" });
      }
    }
    for (const [i, s] of p.serviceTypes.entries()) {
      if (s.key !== s.forms.slug) {
        ctx.addIssue({
          code: "custom",
          path: ["serviceTypes", i, "key"],
          message: "key must equal slug",
        });
      }
    }
  });
export type Preset = z.infer<typeof PresetSchema>;
export type PresetInput = z.input<typeof PresetSchema>;
