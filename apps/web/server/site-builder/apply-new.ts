import { randomUUID } from "node:crypto";
import {
  SiteConfigOverridesSchema,
  type PageBlock,
  type SiteConfigOverrides,
} from "@churchy/contracts";
import { slugify } from "@churchy/hu";
import { getPreset, PLATFORM_DEFAULTS } from "@churchy/presets";
import type { DraftBlock, SiteDraft } from "./draft-schema";
import { uniqueSlug } from "./map";

/**
 * Applying a draft to a NEW church: the site config for the tenant row and the INSERT statements of
 * the content, run by the platform role in the same transaction as the tenant (`createTenant`'s
 * `seed` hook; the fresh-tenant policies of 0027_site_builder admit exactly these inserts). Everything
 * lands as a DRAFT (unpublished): nothing is live until the church's owner publishes it. Items the
 * operator switched off in the review are not applied.
 */

export interface Statement {
  readonly text: string;
  readonly values: readonly unknown[];
}

/** A downloaded, re-encoded image with its media row data (only when a media sink is configured). */
export interface StoredImage {
  readonly draftImageId: string;
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly storageKey: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly alt: string | null;
  /** No alt text known: marked decorative (an image needs one or the other). */
  readonly decorative: boolean;
}

export interface ApplySummary {
  readonly pages: number;
  readonly posts: number;
  readonly announcements: number;
  readonly locations: number;
  readonly serviceRules: number;
  readonly media: number;
  /** Included images that could not be carried over (download, decode or upload failed). */
  readonly mediaFailed: number;
  /** Service times that could not be placed (no location at all). */
  readonly skippedServiceTimes: number;
}

const ACCESSIBILITY = {
  wheelchair: false,
  accessibleToilet: false,
  hearingLoop: false,
  parking: false,
  note: null,
};

/** `tenants.site_config` for the church: identity, preset-neutral theme, office contact. */
export function siteConfigFromDraft(draft: SiteDraft, logoMediaId?: string): SiteConfigOverrides {
  const config: Record<string, unknown> = {
    identity: {
      name: draft.church.name.value,
      shortName: draft.church.shortName.value,
      ...(draft.church.tagline ? { tagline: draft.church.tagline } : {}),
      ...(logoMediaId ? { logoMediaId } : {}),
    },
    denomination: draft.church.denomination.value,
  };
  if (draft.theme.primary) {
    config.theme = {
      colors: { primary: draft.theme.primary, secondary: PLATFORM_DEFAULTS.theme.colors.secondary },
    };
  }
  const contact: Record<string, unknown> = {};
  if (draft.contact.email) contact.email = draft.contact.email;
  if (draft.contact.phone) contact.phone = draft.contact.phone;
  if (draft.contact.address) contact.address = draft.contact.address;
  if (Object.keys(contact).length > 0) config.contact = contact;
  return SiteConfigOverridesSchema.parse(config);
}

function pageBlocks(
  blocks: readonly DraftBlock[],
  media: ReadonlyMap<string, string>,
): PageBlock[] {
  const out: PageBlock[] = [];
  for (const b of blocks) {
    if (b.type === "image") {
      const mediaId = media.get(b.imageId);
      if (mediaId) out.push({ type: "image", mediaId, caption: b.caption });
    } else if (b.type === "heading") out.push({ type: "heading", text: b.text, level: b.level });
    else if (b.type === "text") out.push({ type: "text", content: b.content });
    else out.push({ type: "quote", text: b.text, source: b.source });
  }
  return out;
}

/** The service type key: the denomination preset's own type when the label matches it, else a slug. */
export function serviceTypeKey(label: string, draft: SiteDraft): string {
  const wanted = slugify(label);
  const types = getPreset(draft.church.denomination.value).serviceTypes;
  const hit = types.find(
    (t) => wanted === t.key || wanted.startsWith(t.key) || t.key.startsWith(wanted),
  );
  return hit?.key ?? (wanted || "alkalom");
}

export function seedStatements(
  draft: SiteDraft,
  tenantId: string,
  images: readonly StoredImage[] = [],
  newId: () => string = randomUUID,
): { statements: Statement[]; summary: ApplySummary } {
  const statements: Statement[] = [];
  const media = new Map(images.map((i) => [i.draftImageId, i.id]));
  for (const i of images) {
    statements.push({
      text: `insert into media (id, tenant_id, kind, filename, mime_type, storage_key, width, height, bytes, alt, decorative, people_consent, visibility)
             values ($1, $2, 'image', $3, $4, $5, $6, $7, $8, $9, $10, false, 'public')`,
      values: [
        i.id,
        tenantId,
        i.filename,
        i.mimeType,
        i.storageKey,
        i.width,
        i.height,
        i.bytes,
        i.alt,
        i.decorative,
      ],
    });
  }

  const slugs = new Set<string>();
  let pages = 0;
  draft.pages
    .filter((p) => p.include)
    .forEach((p, index) => {
      const slug = uniqueSlug(p.slug, p.title, slugs);
      statements.push({
        text: `insert into pages (id, tenant_id, slug, title, blocks, rite_key, seo, sort)
             values ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8)`,
        values: [
          newId(),
          tenantId,
          slug,
          p.title,
          JSON.stringify(pageBlocks(p.blocks, media)),
          p.kind === "rite" ? p.riteKey : null,
          JSON.stringify({ title: p.title.slice(0, 70), description: null, ogImageMediaId: null }),
          index,
        ],
      });
      pages++;
    });

  const postSlugs = new Set<string>();
  let posts = 0;
  for (const p of draft.posts.filter((x) => x.include)) {
    statements.push({
      text: `insert into posts (id, tenant_id, slug, title, lead, body) values ($1, $2, $3, $4, $5, $6::jsonb)`,
      values: [
        newId(),
        tenantId,
        uniqueSlug(p.slug, p.title, postSlugs),
        p.title,
        p.lead,
        JSON.stringify(p.body),
      ],
    });
    posts++;
  }

  const weeks = new Set<string>();
  let announcements = 0;
  for (const a of draft.announcements.filter((x) => x.include)) {
    if (weeks.has(a.weekSunday)) continue; // unique per week
    weeks.add(a.weekSunday);
    statements.push({
      text: `insert into announcements (id, tenant_id, week_sunday, body) values ($1, $2, $3, $4::jsonb)`,
      values: [newId(), tenantId, a.weekSunday, JSON.stringify(a.body)],
    });
    announcements++;
  }

  const locSlugs = new Set<string>();
  const locationIds = new Map<string, string>();
  const locationList = draft.locations.filter((l) => l.include);
  const locationRows: { id: string; name: string; kind: string; address: unknown }[] = [];
  for (const [index, l] of locationList.entries()) {
    const id = newId();
    locationIds.set(l.id, id);
    locationRows.push({ id, name: l.name, kind: l.kind, address: l.address });
    statements.push({
      text: `insert into locations (id, tenant_id, name, slug, kind, address, accessibility, sort)
             values ($1, $2, $3, $4, $5::location_kind, $6::jsonb, $7::jsonb, $8)`,
      values: [
        id,
        tenantId,
        l.name,
        uniqueSlug("", l.name, locSlugs),
        l.kind,
        l.address ? JSON.stringify(l.address) : null,
        JSON.stringify(ACCESSIBILITY),
        index,
      ],
    });
  }

  const times = draft.serviceTimes.filter((s) => s.include);
  let serviceRules = 0;
  let skippedServiceTimes = 0;
  if (times.length > 0) {
    // Service rules need a place: use the first location, or one named after the church.
    let fallbackId = locationRows[0]?.id ?? null;
    if (fallbackId === null) {
      fallbackId = newId();
      statements.push({
        text: `insert into locations (id, tenant_id, name, slug, kind, address, accessibility, sort)
               values ($1, $2, $3, $4, 'templom'::location_kind, $5::jsonb, $6::jsonb, 0)`,
        values: [
          fallbackId,
          tenantId,
          draft.church.shortName.value,
          uniqueSlug("", draft.church.shortName.value, locSlugs),
          draft.contact.address ? JSON.stringify(draft.contact.address) : null,
          JSON.stringify(ACCESSIBILITY),
        ],
      });
    }
    const periodId = newId();
    statements.push({
      text: `insert into schedule_periods (id, tenant_id, name) values ($1, $2, $3)`,
      values: [periodId, tenantId, "Alap"],
    });
    for (const s of times) {
      const locationId = (s.location ? locationIds.get(s.location) : undefined) ?? fallbackId;
      if (!locationId) {
        skippedServiceTimes++;
        continue;
      }
      statements.push({
        text: `insert into service_rules (id, tenant_id, period_id, location_id, weekday, time, service_type, title)
               values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        values: [
          newId(),
          tenantId,
          periodId,
          locationId,
          s.weekday,
          s.time,
          serviceTypeKey(s.label, draft),
          s.label,
        ],
      });
      serviceRules++;
    }
  }

  return {
    statements,
    summary: {
      pages,
      posts,
      announcements,
      locations: locationRows.length,
      serviceRules,
      media: images.length,
      mediaFailed: 0,
      skippedServiceTimes,
    },
  };
}

/** Attribution kept in the audit entry: where each applied page and post came from. */
export function attribution(
  draft: SiteDraft,
): { kind: "page" | "post"; slug: string; sourceUrl: string }[] {
  return [
    ...draft.pages
      .filter((p) => p.include)
      .map((p) => ({ kind: "page" as const, slug: p.slug, sourceUrl: p.sourceUrl })),
    ...draft.posts
      .filter((p) => p.include)
      .map((p) => ({ kind: "post" as const, slug: p.slug, sourceUrl: p.sourceUrl })),
  ];
}
