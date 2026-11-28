import type { Address } from "@churchy/contracts";
import { normalizePhone, slugify } from "@churchy/hu";
import { PhoneSchema } from "@churchy/contracts";
import { registrableDomain } from "./domain";
import { timesIn, weekdaysIn, type ExtractedPage, type TextBlock } from "./extract";
import type { OfficeContacts } from "./personal-data";
import type { DraftBlock, DraftImage, DraftWarning, SiteDraft } from "./draft-schema";
import type { PageRole } from "./plan-schema";

/**
 * Maps the crawl and the validated model plan onto the draft. Everything the model said is checked
 * against the crawl (URLs, times, addresses); the church's own texts come from the extractor.
 */

type RichNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  text?: string;
};
const textNode = (text: string): RichNode => ({ type: "text", text });
const para = (text: string): RichNode => ({ type: "paragraph", content: [textNode(text)] });

/** Text/list/heading blocks as Tiptap JSON. */
export function toRichText(blocks: readonly TextBlock[]): { type: "doc"; content: RichNode[] } {
  const content: RichNode[] = [];
  for (const b of blocks) {
    if (b.type === "paragraph") content.push(para(b.text));
    else if (b.type === "quote") content.push({ type: "blockquote", content: [para(b.text)] });
    else if (b.type === "list") {
      content.push({
        type: "bulletList",
        content: b.items.map((i) => ({ type: "listItem", content: [para(i)] })),
      });
    } else if (b.type === "heading") {
      content.push({
        type: "heading",
        attrs: { level: b.level <= 2 ? 2 : 3 },
        content: [textNode(b.text)],
      });
    }
  }
  return { type: "doc", content };
}

export interface ImageIndex {
  readonly byUrl: ReadonlyMap<string, string>;
  readonly images: DraftImage[];
}

const PEOPLE_ROLES = new Set<PageRole>(["gallery", "group", "event", "about", "other", "history"]);

/** Draft images from the included pages (same-site ones included, others listed only), capped. */
export function collectImages(
  pages: readonly { page: ExtractedPage; role: PageRole }[],
  scope: string,
  maxImages: number,
  warnings: DraftWarning[],
): ImageIndex {
  const byUrl = new Map<string, string>();
  const images: DraftImage[] = [];
  let hasLogo = false;
  let offsite = 0;
  for (const { page, role } of pages) {
    for (const img of page.images) {
      const existing = byUrl.get(img.src);
      if (existing) {
        const d = images.find((i) => i.id === existing)!;
        if (!d.pageUrls.includes(page.url) && d.pageUrls.length < 10) d.pageUrls.push(page.url);
        continue;
      }
      if ((img.width !== null && img.width < 48) || (img.height !== null && img.height < 48))
        continue;
      if (images.length >= maxImages) continue;
      let host = "";
      try {
        host = new URL(img.src).hostname;
      } catch {
        continue;
      }
      const same = (registrableDomain(host) ?? host) === scope;
      if (!same) offsite++;
      const isLogo = same && img.hint === "logo" && !hasLogo;
      if (isLogo) hasLogo = true;
      const isHero = same && img.hint === "og" && role === "home";
      const id = `img-${images.length + 1}`;
      byUrl.set(img.src, id);
      images.push({
        id,
        sourceUrl: img.src,
        pageUrls: [page.url],
        alt: img.alt.slice(0, 300),
        role: isLogo ? "logo" : isHero ? "hero" : "content",
        width: img.width,
        height: img.height,
        include: same,
        offsite: !same,
        mayShowPeople: !isLogo && PEOPLE_ROLES.has(role),
      });
    }
  }
  if (offsite > 0) warnings.push({ code: "offsite_image", url: null, count: offsite });
  if (!hasLogo) warnings.push({ code: "no_logo", url: null, count: null });
  const people = images.filter((i) => i.include && i.mayShowPeople).length;
  if (people > 0) warnings.push({ code: "people_images", url: null, count: people });
  return { byUrl, images };
}

/** Page blocks of the draft: headings, rich text runs, images (only draft-listed, included ones). */
export function toDraftBlocks(
  title: string,
  blocks: readonly TextBlock[],
  index: ImageIndex,
): DraftBlock[] {
  const out: DraftBlock[] = [];
  let run: TextBlock[] = [];
  const flush = () => {
    if (run.length === 0) return;
    out.push({ type: "text", content: toRichText(run) });
    run = [];
  };
  for (const b of blocks) {
    if (b.type === "heading") {
      if (b.level === 1 && b.text.trim().toLowerCase() === title.trim().toLowerCase()) continue;
      flush();
      out.push({ type: "heading", text: b.text.slice(0, 500), level: b.level <= 2 ? 2 : 3 });
    } else if (b.type === "image") {
      const id = index.byUrl.get(b.src);
      const img = id ? index.images.find((i) => i.id === id) : undefined;
      if (!img || !img.include) continue;
      flush();
      out.push({ type: "image", imageId: img.id, caption: b.alt ? b.alt.slice(0, 300) : null });
    } else if (b.type === "quote" && b.text.length <= 1000) {
      flush();
      out.push({ type: "quote", text: b.text, source: null });
    } else {
      run.push(b);
    }
  }
  flush();
  return out.slice(0, 300);
}

export function uniqueSlug(wanted: string, title: string, taken: Set<string>): string {
  let base = slugify(wanted || title) || slugify(title) || "oldal";
  base = base.slice(0, 60).replace(/-+$/, "") || "oldal";
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Denomination from wording (hint for the model and a cross-check of its answer). */
export function denominationVote(
  pages: readonly ExtractedPage[],
): { value: SiteDraft["church"]["denomination"]["value"]; hits: number } | null {
  const text = fold(
    pages
      .map(
        (p) =>
          `${p.title} ${p.blocks.map((b) => (b.type === "list" ? b.items.join(" ") : b.type === "image" ? "" : b.text)).join(" ")}`,
      )
      .join(" "),
  );
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  const votes: [SiteDraft["church"]["denomination"]["value"], number][] = [
    ["rk", count(/szentmise|plebanos|plebania|rozsafuzer|romai katolikus/g)],
    ["gk", count(/szent liturgia|parokus|gorogkatolikus|ikonosztaz/g)],
    ["ref", count(/reformatus|presbiter|lelkesz|konfirmacio|ur vacsora/g)],
    ["ev", count(/evangelikus|luther/g)],
    ["bapt", count(/baptista|bemerites/g)],
    ["unit", count(/unitarius/g)],
  ];
  votes.sort((a, b) => b[1] - a[1]);
  const [top, second] = votes;
  if (!top || top[1] < 2 || (second && second[1] === top[1])) return null;
  return { value: top[0], hits: top[1] };
}

export function validIsoDate(s: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s.slice(0, 10)
    ? null
    : s.slice(0, 10);
}

/** The Sunday on or after an ISO date. */
export function sundayOnOrAfter(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

/** A service time stays only if its page shows that time next to that weekday. */
export function verifyServiceTime(
  st: { weekday: number; time: string },
  page: ExtractedPage | undefined,
): boolean {
  if (!page) return false;
  return page.schedule.some(
    (m) => timesIn(m.text).includes(st.time) && weekdaysIn(m.text).includes(st.weekday),
  );
}

export function verifyAddress(
  a: { postalCode: string; city: string; line1: string },
  pages: readonly ExtractedPage[],
): Address | null {
  if (!/^\d{4}$/.test(a.postalCode) || !a.city || !a.line1) return null;
  const known = pages.flatMap((p) => p.addresses);
  const hit = known.some((k) => k.postalCode === a.postalCode && fold(k.city) === fold(a.city));
  return hit ? { postalCode: a.postalCode, city: a.city, line1: a.line1, line2: null } : null;
}

export function officeFacts(office: OfficeContacts): {
  email: string | null;
  phone: string | null;
} {
  const email = [...office.emails][0] ?? null;
  let phone: string | null = null;
  for (const raw of office.phoneTexts) {
    const n = normalizePhone(raw);
    if (n && PhoneSchema.safeParse(n).success) {
      phone = n;
      break;
    }
  }
  return { email, phone };
}
