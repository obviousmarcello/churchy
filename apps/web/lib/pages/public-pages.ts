import type { Media, PageBlock, PageSummary, PublicPerson, StaffGroup } from "@churchy/contracts";
import type { BlockImage } from "@churchy/ui";
import { publicFile, type PublicFile } from "@/lib/announcements/view";
import { termRoutePath, type TermSlugs } from "@/lib/term-routes";

/**
 * Pure helpers of the public static, staff and rite pages (D-16, SDD §6, §7.4–7.5).
 */

/**
 * First path segments that are never a static page (`/<page-slug>`, SDD §6): the app's own
 * top-level routes and the fixed public sections. Term-driven sections are reserved through
 * {@link SECTION_TERM_KEYS} with the tenant's own slugs.
 */
export const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set([
  // App areas and internals.
  "admin",
  "munkater",
  "egyhazmegye",
  "fejlesztes",
  "term",
  "api",
  "demo",
  "belepes",
  "uj-egyhaz",
  "site-home",
  // Public sections and pages with fixed paths (SDD §6).
  "hirek",
  "esemenyek",
  "templomaink",
  "kozossegeink",
  "elo",
  "galeria",
  "dokumentumok",
  "tamogatas",
  "kapcsolat",
  "kereses",
  "impresszum",
  "adatkezeles",
  "akadalymentesseg",
  "sitemap",
  "robots",
]);

/** Section terms whose slug is a public URL (the about page is a static page itself). */
export const SECTION_TERM_KEYS = [
  "homePage",
  "serviceSchedule",
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
  "contactPage",
] as const;

/**
 * Whether `slug` is taken by a route or a section of this church, so a static page with that slug
 * could never be shown at `/<slug>` (the admin rejects such slugs; the page route ignores them).
 */
export function isReservedPageSlug(slug: string, terms: TermSlugs): boolean {
  if (RESERVED_PAGE_SLUGS.has(slug)) return true;
  return SECTION_TERM_KEYS.some((key) => terms.term(key).slug === slug);
}

/** Public path of a static page. */
export const pagePath = (slug: string): string => `/${slug}`;

/** Public path of the rites section (`/szentsegek`, Reformed `/alkalmak`, …). */
export const ritesPath = (terms: TermSlugs): string => termRoutePath(terms, "ritesSection");

/** Public path of a rite information page (`/szentsegek/keresztelo`). */
export const ritePath = (terms: TermSlugs, riteKey: string): string =>
  `${ritesPath(terms)}/${riteKey}`;

/** Public path of a rite's request form (`/szentsegek/keresztelo/bejelentes`, SDD §6; D-28). */
export const riteRequestPath = (terms: TermSlugs, riteKey: string): string =>
  `${ritePath(terms, riteKey)}/bejelentes`;

/** Ids of the pages that hold rite pages (the rites section's own intro page). */
function riteParentIds(pages: readonly PageSummary[]): Set<string> {
  return new Set(
    pages.filter((p) => p.riteKey !== null && p.parentId !== null).map((p) => p.parentId as string),
  );
}

/** The intro page of the rites section: the parent of the rite pages, if any. */
export function ritesSectionPage(pages: readonly PageSummary[]): PageSummary | null {
  const parents = riteParentIds(pages);
  return pages.find((p) => parents.has(p.id)) ?? null;
}

/**
 * Where a visible page is shown: rite pages at their rite path, the rites intro page at the
 * section path, other pages at `/<slug>`. Null for a page whose slug is reserved (never shown).
 */
export function canonicalPagePath(
  page: PageSummary,
  pages: readonly PageSummary[],
  terms: TermSlugs,
): string | null {
  if (page.riteKey !== null) return ritePath(terms, page.riteKey);
  if (riteParentIds(pages).has(page.id)) return ritesPath(terms);
  return isReservedPageSlug(page.slug, terms) ? null : pagePath(page.slug);
}

/**
 * Static pages for the *Rólunk* menu (SDD §6): top-level, not rite pages, not the rites intro page,
 * not reserved, in `sort` order (the repository's order).
 */
export function aboutPages(pages: readonly PageSummary[], terms: TermSlugs): PageSummary[] {
  const parents = riteParentIds(pages);
  return pages.filter(
    (p) =>
      p.parentId === null &&
      p.riteKey === null &&
      !parents.has(p.id) &&
      !isReservedPageSlug(p.slug, terms),
  );
}

/** Media ids that page blocks refer to (images, galleries, files). */
export function blockMediaIds(blocks: readonly PageBlock[]): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.type === "image" || block.type === "file") ids.add(block.mediaId);
    else if (block.type === "gallery") for (const id of block.mediaIds) ids.add(id);
  }
  return [...ids];
}

/**
 * Where a public image is served. Phase A only knows the demo placeholders under `public/demo/`;
 * object storage (CDN variants, SDD §13) arrives with the BE part, until then other images are
 * not shown.
 */
export function publicImage(media: Media | null | undefined): BlockImage | null {
  if (!media || media.visibility !== "public" || media.kind !== "image") return null;
  if (!/^demo\/[a-z0-9][a-z0-9.-]*$/.test(media.storageKey)) return null;
  return {
    src: `/${media.storageKey}`,
    alt: media.decorative ? "" : (media.alt ?? ""),
    width: media.width,
    height: media.height,
  };
}

/** Public images and files of the given media, keyed by id, for `<PageBlocks>`. */
export function blockMedia(media: readonly Media[]): {
  images: Record<string, BlockImage>;
  files: Record<string, PublicFile>;
} {
  const images: Record<string, BlockImage> = {};
  const files: Record<string, PublicFile> = {};
  for (const m of media) {
    const image = publicImage(m);
    if (image) images[m.id] = image;
    const file = publicFile(m);
    if (file) files[m.id] = file;
  }
  return { images, files };
}

/** Whether the blocks already link to `href` with a call-to-action button. */
export function hasCtaTo(blocks: readonly PageBlock[], href: string): boolean {
  return blocks.some((b) => b.type === "cta" && b.href === href);
}

/** Order of the staff page groups (SDD §7.5): clergy, staff, council, then volunteers. */
export const STAFF_GROUPS: readonly StaffGroup[] = ["clergy", "staff", "council", "volunteer"];

/** Public people grouped for the staff page; empty groups are left out, order is kept. */
export function groupStaff(
  people: readonly PublicPerson[],
): { group: StaffGroup; people: PublicPerson[] }[] {
  return STAFF_GROUPS.map((group) => ({
    group,
    people: people.filter((p) => p.staffGroup === group),
  })).filter((g) => g.people.length > 0);
}
