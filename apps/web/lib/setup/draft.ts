import {
  EmailSchema,
  LOW_CONFIDENCE_THRESHOLD,
  PhoneSchema,
  type Denomination,
  type ImportResult,
  type SiteConfigOverridesInput,
} from "@churchy/contracts";
import {
  effectiveConfig,
  forms,
  type EffectiveConfig,
  type TenantConfigSource,
} from "@churchy/presets";
import { canSaveBranding } from "@/lib/appearance/branding";
import type { StoredTheme } from "@/lib/site-config";

/**
 * The draft of the new site while the first-setup wizard runs (D-34). It starts as a copy of the
 * `ImportResult` (the importer's findings), everything in it is editable, and `draftConfig()` turns
 * it into the same effective config the real public site renders with — so the preview shows what
 * the church would get. Pure and framework-free; the wizard only holds it in component state.
 *
 * Item keys name what the importer was unsure about: `name`, `shortName`, `tagline`,
 * `denomination`, `term:<key>`, `serviceTime:<id>`, `location:<id>`, `email`, `phone`, `theme`. People are never flagged: they are opt-in.
 * An item stays flagged until the owner edits or confirms it (`reviewed`).
 */

/** Terms the summary lets the owner rename (SDD §5.3); the rest comes from the preset. */
export const EDITABLE_TERMS = ["serviceSchedule", "leadClergy"] as const;
export type EditableTerm = (typeof EDITABLE_TERMS)[number];

export interface DraftServiceTime {
  id: string;
  label: string;
  /** ISO weekday, 1 = Monday. */
  weekday: number;
  time: string;
  locationId: string | null;
}

export interface DraftLocation {
  id: string;
  name: string;
  postalCode: string;
  city: string;
  line1: string;
}

export interface DraftPerson {
  id: string;
  name: string;
  role: string;
  hasPhoto: boolean;
  /** Opt-in: the person's name and role go on the new site. Off by default. */
  include: boolean;
  /** Opt-in: the photo goes on the new site too (only when `include`). */
  photo: boolean;
  /** The owner confirms they may publish the data (and photo) of this person. */
  consent: boolean;
}

export interface SetupDraft {
  sourceUrl: string;
  name: string;
  shortName: string;
  tagline: string;
  denomination: Denomination;
  /** Renamed terms (`nom`); the others follow the preset. */
  termOverrides: Partial<Record<EditableTerm, string>>;
  serviceTimes: DraftServiceTime[];
  locations: DraftLocation[];
  email: string;
  phone: string;
  theme: StoredTheme;
  staff: DraftPerson[];
  /** Importer confidence per item key. */
  confidence: Record<string, number>;
  /** Item keys the owner has checked or edited. */
  reviewed: Record<string, true>;
}

export function draftFromResult(result: ImportResult): SetupDraft {
  const confidence: Record<string, number> = {
    name: result.church.name.confidence,
    shortName: result.church.shortName.confidence,
    denomination: result.church.denomination.confidence,
    theme: result.theme.confidence,
  };
  if (result.church.tagline) confidence.tagline = result.church.tagline.confidence;
  if (result.contact.email) confidence.email = result.contact.email.confidence;
  if (result.contact.phone) confidence.phone = result.contact.phone.confidence;

  const termOverrides: Partial<Record<EditableTerm, string>> = {};
  for (const key of EDITABLE_TERMS) {
    const found = result.terminology[key];
    if (found) {
      termOverrides[key] = found.value.nom;
      confidence[`term:${key}`] = found.confidence;
    }
  }
  for (const s of result.serviceTimes) confidence[`serviceTime:${s.id}`] = s.confidence;
  for (const l of result.locations) confidence[`location:${l.id}`] = l.confidence;

  return {
    sourceUrl: result.sourceUrl,
    name: result.church.name.value,
    shortName: result.church.shortName.value,
    tagline: result.church.tagline?.value ?? "",
    denomination: result.church.denomination.value,
    termOverrides,
    serviceTimes: result.serviceTimes.map((s) => ({
      id: s.id,
      label: s.label,
      weekday: s.weekday,
      time: s.time,
      locationId: s.location,
    })),
    locations: result.locations.map((l) => ({
      id: l.id,
      name: l.name,
      postalCode: l.address.postalCode,
      city: l.address.city,
      line1: l.address.line1,
    })),
    email: result.contact.email?.value ?? "",
    phone: result.contact.phone?.value ?? "",
    theme: result.theme.value,
    staff: result.staff.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      hasPhoto: p.hasPhoto,
      include: false,
      photo: false,
      consent: false,
    })),
    confidence,
    reviewed: {},
  };
}

/** Marks items as checked (an edit, or the owner's *Rendben*). */
export function markReviewed(draft: SetupDraft, ...keys: string[]): SetupDraft {
  const reviewed = { ...draft.reviewed };
  for (const key of keys) reviewed[key] = true;
  return { ...draft, reviewed };
}

export const isFlagged = (draft: SetupDraft, key: string): boolean => {
  const confidence = draft.confidence[key];
  return confidence !== undefined && confidence < LOW_CONFIDENCE_THRESHOLD && !draft.reviewed[key];
};

/** Keys still waiting for the owner's attention, in a stable order. */
export function flaggedKeys(draft: SetupDraft): string[] {
  return Object.keys(draft.confidence).filter((key) => isFlagged(draft, key));
}

/** The effective config source: the draft as stored overrides on top of the preset. */
export function draftSource(draft: SetupDraft): TenantConfigSource {
  const terminology: NonNullable<SiteConfigOverridesInput["terminology"]> = {};
  for (const key of EDITABLE_TERMS) {
    const nom = draft.termOverrides[key]?.trim();
    if (nom) terminology[key] = forms(nom);
  }
  const firstLocation = draft.locations.find(
    (l) => /^\d{4}$/.test(l.postalCode) && l.city && l.line1,
  );
  const siteConfig: SiteConfigOverridesInput = {
    identity: {
      name: draft.name.trim() || draft.shortName.trim() || "…",
      shortName: draft.shortName.trim() || draft.name.trim() || "…",
      ...(draft.tagline.trim() ? { tagline: draft.tagline.trim() } : {}),
    },
    theme: draft.theme,
    terminology,
    contact: {
      ...(EmailSchema.safeParse(draft.email).success ? { email: draft.email } : {}),
      ...(PhoneSchema.safeParse(draft.phone).success ? { phone: draft.phone } : {}),
      ...(firstLocation
        ? {
            address: {
              postalCode: firstLocation.postalCode,
              city: firstLocation.city,
              line1: firstLocation.line1,
              line2: null,
            },
          }
        : {}),
    },
  };
  return {
    name: draft.name.trim() || "…",
    denomination: draft.denomination,
    siteConfig,
  };
}

export function draftConfig(draft: SetupDraft): EffectiveConfig {
  return effectiveConfig(draftSource(draft));
}

/** People whose data is included without the owner's confirmation. */
export function staffNeedingConsent(draft: SetupDraft): DraftPerson[] {
  return draft.staff.filter((p) => p.include && !p.consent);
}

/** The people (and photos) that go on the new site: opted in and confirmed. */
export function includedStaff(draft: SetupDraft): DraftPerson[] {
  return draft.staff.filter((p) => p.include && p.consent);
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * What blocks the step *Átnézés*: names, a saveable theme (4.5:1), valid service times and the
 * rights confirmation of every person taken over. Flagged items do not block (the owner may
 * leave them and fix them later in the admin).
 */
export function reviewProblems(draft: SetupDraft): string[] {
  const problems: string[] = [];
  if (!draft.name.trim()) problems.push("name");
  if (!draft.shortName.trim()) problems.push("shortName");
  if (!canSaveBranding(draft.theme)) problems.push("theme");
  if (draft.serviceTimes.some((s) => !s.label.trim() || !TIME.test(s.time))) {
    problems.push("serviceTimes");
  }
  if (staffNeedingConsent(draft).length > 0) problems.push("consent");
  return problems;
}
