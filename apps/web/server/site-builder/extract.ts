import { elements, findFirst, isEl, parseHtml, textOf, type El } from "./html";

/**
 * Readability-style extraction of one fetched page (pure; no network): the main text as blocks,
 * links, image candidates, meta / OpenGraph / JSON-LD, and Hungarian contact and schedule
 * patterns. Content is untrusted data; nothing here interprets it as instructions.
 */

export type TextBlock =
  | { readonly type: "heading"; readonly level: 1 | 2 | 3 | 4 | 5 | 6; readonly text: string }
  | { readonly type: "paragraph"; readonly text: string }
  | { readonly type: "list"; readonly items: readonly string[] }
  | { readonly type: "quote"; readonly text: string }
  | { readonly type: "image"; readonly src: string; readonly alt: string };

export interface ExtractedLink {
  readonly href: string;
  readonly text: string;
  readonly nav: boolean;
}
export interface ExtractedImage {
  readonly src: string;
  readonly alt: string;
  readonly width: number | null;
  readonly height: number | null;
  /** `logo` when the markup says so (class/id/alt/file name), `og` for the OpenGraph image. */
  readonly hint: "logo" | "og" | "content";
}
export interface ScheduleMention {
  readonly text: string;
  readonly weekdays: readonly number[];
  readonly times: readonly string[];
}

export interface ExtractedPage {
  readonly url: string;
  readonly title: string;
  readonly description: string | null;
  readonly lang: string | null;
  readonly siteName: string | null;
  readonly themeColor: string | null;
  readonly publishedAt: string | null;
  readonly blocks: readonly TextBlock[];
  readonly links: readonly ExtractedLink[];
  readonly images: readonly ExtractedImage[];
  readonly jsonLd: readonly Record<string, unknown>[];
  readonly emails: readonly string[];
  readonly phones: readonly string[];
  readonly addresses: readonly { postalCode: string; city: string; line1: string }[];
  readonly schedule: readonly ScheduleMention[];
  readonly noindex: boolean;
}

const BOILERPLATE_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "form",
  "iframe",
  "nav",
  "footer",
  "aside",
  "select",
  "button",
  "input",
  "textarea",
  "object",
  "embed",
  "canvas",
  "dialog",
]);
const BOILERPLATE_NAMES =
  /(^|[\s_-])(cookie|consent|gdpr|menu|sidebar|breadcrumb|share|social|comment|newsletter|popup|modal|banner|skip-link|search)([\s_-]|$)/i;

const isBoilerplate = (e: El): boolean => {
  if (BOILERPLATE_TAGS.has(e.tag)) return true;
  const role = e.attrs.role;
  if (role === "navigation" || role === "banner" || role === "contentinfo" || role === "search")
    return true;
  if (e.attrs.hidden !== undefined || e.attrs["aria-hidden"] === "true") return true;
  if (/display\s*:\s*none/i.test(e.attrs.style ?? "")) return true;
  return BOILERPLATE_NAMES.test(`${e.attrs.class ?? ""} ${e.attrs.id ?? ""}`);
};

const WEEKDAYS: readonly (readonly [string, number])[] = [
  ["hétfő", 1],
  ["kedd", 2],
  ["szerda", 3],
  ["csütörtök", 4],
  ["péntek", 5],
  ["szombat", 6],
  ["vasárnap", 7],
  ["vasárnapi", 7],
];
const TIME_RE =
  /(?<![\d.:])([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)(?![\d])|(?<![\d.:])([01]?\d|2[0-3])\s*óra(?:kor)?/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<![\d])(?:\+36|06)[\s\-/().]*\d{1,2}[\s\-/().]*\d{3}[\s\-.]*\d{3,4}(?![\d])/g;
const ADDRESS_RE =
  /(\d{4})\s+([\p{Lu}][\p{L}\-. ]{1,40}?),?\s+([\p{Lu}\d][\p{L}\d.' -]{1,50}?\s\d+[\p{L}\d/.-]*)/gu;

export function normalizeTime(h: string, m: string | undefined): string {
  return `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
}

/** Times written as `18:00`, `18.00` or `18 óra` in a text, as `HH:MM`. */
export function timesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(TIME_RE)) {
    out.push(m[1] !== undefined ? normalizeTime(m[1], m[2]) : normalizeTime(m[3]!, undefined));
  }
  return [...new Set(out)];
}

export function weekdaysIn(text: string): number[] {
  const lower = text.toLowerCase();
  const out = new Set<number>();
  for (const [word, n] of WEEKDAYS) if (lower.includes(word)) out.add(n);
  return [...out].sort();
}

/** Removes tracking parameters and the fragment; resolves against `base`. Null for non-web links. */
export function normalizeUrl(href: string, base: string): string | null {
  let u: URL;
  try {
    u = new URL(href.trim(), base);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  for (const key of [...u.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|mc_)/i.test(key)) u.searchParams.delete(key);
  }
  return u.href;
}

function metaContent(head: El[], key: string, attr: "name" | "property"): string | null {
  for (const m of head) {
    if (m.tag === "meta" && m.attrs[attr]?.toLowerCase() === key) {
      const c = m.attrs.content?.trim();
      if (c) return c;
    }
  }
  return null;
}

function jsonLdOf(root: El): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const e of elements(root)) {
    if (e.tag !== "script" || e.attrs.type?.toLowerCase() !== "application/ld+json") continue;
    const raw = e.children.filter((c): c is string => !isEl(c)).join("");
    if (raw.length > 200_000) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items.flatMap((i) => (isGraph(i) ? i["@graph"] : [i]))) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          out.push(item as Record<string, unknown>);
        }
      }
    } catch {
      // invalid JSON-LD is common; ignore
    }
  }
  return out.slice(0, 20);
}
const isGraph = (i: unknown): i is { "@graph": unknown[] } =>
  !!i && typeof i === "object" && Array.isArray((i as Record<string, unknown>)["@graph"]);

function pickMain(body: El): El {
  const candidates: ((e: El) => boolean)[] = [
    (e) => e.tag === "main" || e.attrs.role === "main",
    (e) => e.tag === "article",
    (e) => /^(content|main|main-content|primary)$/i.test(e.attrs.id ?? ""),
    (e) =>
      /(^|\s)(entry-content|post-content|page-content|content|main-content)(\s|$)/i.test(
        e.attrs.class ?? "",
      ),
  ];
  for (const c of candidates) {
    const found = findFirst(body, (e) => c(e) && !isBoilerplate(e));
    if (found && textOf(found, isBoilerplate).length > 120) return found;
  }
  return body;
}

const LOGO_RE = /logo|embl[eé]ma|c[ií]mer/i;

function collectBlocks(root: El, base: string): { blocks: TextBlock[]; images: ExtractedImage[] } {
  const blocks: TextBlock[] = [];
  const images: ExtractedImage[] = [];
  const pushText = (text: string, type: "paragraph" | "quote") => {
    const t = text.replace(/\s+/g, " ").trim();
    if (t.length >= 2) blocks.push({ type, text: t });
  };
  const visit = (e: El): void => {
    if (isBoilerplate(e)) return;
    const level = /^h([1-6])$/.exec(e.tag);
    if (level) {
      const text = textOf(e, isBoilerplate);
      if (text)
        blocks.push({ type: "heading", level: Number(level[1]) as 1 | 2 | 3 | 4 | 5 | 6, text });
      return;
    }
    switch (e.tag) {
      case "p":
      case "figcaption":
      case "dt":
      case "dd":
        pushText(textOf(e, isBoilerplate), "paragraph");
        for (const img of elements(e)) if (img.tag === "img") addImage(img);
        return;
      case "blockquote":
        pushText(textOf(e, isBoilerplate), "quote");
        return;
      case "ul":
      case "ol": {
        const items = e.children
          .filter(isEl)
          .filter((c) => c.tag === "li")
          .map((li) => textOf(li, isBoilerplate))
          .filter((t) => t.length > 0);
        if (items.length) blocks.push({ type: "list", items });
        return;
      }
      case "tr": {
        const cells = e.children
          .filter(isEl)
          .filter((c) => c.tag === "td" || c.tag === "th")
          .map((c) => textOf(c, isBoilerplate))
          .filter(Boolean);
        if (cells.length) pushText(cells.join(" | "), "paragraph");
        return;
      }
      case "img":
        addImage(e);
        return;
      case "picture":
      case "figure":
        for (const img of elements(e)) if (img.tag === "img") addImage(img);
        for (const c of e.children) if (isEl(c) && c.tag !== "img" && c.tag !== "picture") visit(c);
        return;
      default:
    }
    // Loose text directly inside a container becomes a paragraph of its own.
    let loose = "";
    for (const c of e.children) {
      if (!isEl(c)) loose += c;
      else if (
        c.tag === "a" ||
        c.tag === "span" ||
        c.tag === "strong" ||
        c.tag === "em" ||
        c.tag === "b" ||
        c.tag === "i"
      ) {
        loose += " " + textOf(c, isBoilerplate);
      } else if (c.tag === "br") loose += " ";
      else {
        if (loose.trim()) pushText(loose, "paragraph");
        loose = "";
        visit(c);
      }
    }
    if (loose.trim()) pushText(loose, "paragraph");
  };
  const addImage = (img: El) => {
    const raw =
      img.attrs.src ||
      img.attrs["data-src"] ||
      img.attrs["data-lazy-src"] ||
      firstSrcset(img.attrs.srcset);
    if (!raw || raw.startsWith("data:")) return;
    const src = normalizeUrl(raw, base);
    if (!src) return;
    const width = Number(img.attrs.width) || null;
    const height = Number(img.attrs.height) || null;
    const alt = (img.attrs.alt ?? "").trim();
    images.push({
      src,
      alt,
      width,
      height,
      hint: LOGO_RE.test(`${alt} ${img.attrs.class ?? ""} ${img.attrs.id ?? ""} ${src}`)
        ? "logo"
        : "content",
    });
    blocks.push({ type: "image", src, alt });
  };
  visit(root);
  return { blocks, images };
}

function firstSrcset(srcset: string | undefined): string | undefined {
  return srcset?.split(",")[0]?.trim().split(/\s+/)[0];
}

/** Emails, phones, addresses and weekday+time snippets found in the page text. */
export function findPatterns(text: string): Pick<ExtractedPage, "emails" | "phones" | "addresses"> {
  const emails = [...new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))];
  const phones = [...new Set(text.match(PHONE_RE) ?? [])].map((p) => p.replace(/\s+/g, " ").trim());
  const addresses: { postalCode: string; city: string; line1: string }[] = [];
  for (const m of text.matchAll(ADDRESS_RE)) {
    addresses.push({ postalCode: m[1]!, city: m[2]!.trim(), line1: m[3]!.trim() });
  }
  return { emails, phones, addresses: addresses.slice(0, 10) };
}

function scheduleOf(blocks: readonly TextBlock[]): ScheduleMention[] {
  const lines: string[] = [];
  for (const b of blocks) {
    if (b.type === "list") lines.push(...b.items);
    else if (b.type === "paragraph") lines.push(b.text);
  }
  const out: ScheduleMention[] = [];
  for (const line of lines) {
    if (line.length > 400) continue;
    const times = timesIn(line);
    const weekdays = weekdaysIn(line);
    if (
      times.length > 0 &&
      (weekdays.length > 0 ||
        /szentmise|istentisztelet|liturgia|mise|imaóra|ájtatosság|gyóntatás/i.test(line))
    ) {
      out.push({ text: line, weekdays, times });
    }
  }
  return out.slice(0, 40);
}

export function extractPage(html: string, url: string): ExtractedPage {
  const root = parseHtml(html);
  const head = findFirst(root, (e) => e.tag === "head");
  const body = findFirst(root, (e) => e.tag === "body") ?? root;
  const metas = head ? [...elements(head)] : [];
  const titleEl = head ? findFirst(head, (e) => e.tag === "title") : null;
  const og = (k: string) => metaContent(metas, `og:${k}`, "property");
  const h1 = findFirst(body, (e) => e.tag === "h1");
  const title = (og("title") ?? (titleEl ? textOf(titleEl) : "") ?? "") || (h1 ? textOf(h1) : "");
  const mainEl = pickMain(body);
  const { blocks, images } = collectBlocks(mainEl, url);
  const ogImage = og("image");
  const ogSrc = ogImage ? normalizeUrl(ogImage, url) : null;
  if (ogSrc && !images.some((i) => i.src === ogSrc)) {
    images.unshift({ src: ogSrc, alt: "", width: null, height: null, hint: "og" });
  }
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();
  const addLinks = (scope: El, nav: boolean) => {
    for (const a of elements(scope)) {
      if (a.tag !== "a" || !a.attrs.href) continue;
      const href = normalizeUrl(a.attrs.href, url);
      if (!href) continue;
      const key = `${nav}|${href}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ href, text: textOf(a).slice(0, 120), nav });
    }
  };
  const navScopes = [...elements(body)].filter(
    (e) => e.tag === "nav" || e.attrs.role === "navigation" || e.tag === "header",
  );
  for (const n of navScopes) addLinks(n, true);
  addLinks(mainEl, false);
  const plain = [
    title,
    ...blocks.map((b) =>
      b.type === "list" ? b.items.join(" ") : b.type === "image" ? "" : b.text,
    ),
  ].join("\n");
  const footerText = [...elements(body)]
    .filter((e) => e.tag === "footer")
    .map((f) => textOf(f))
    .join("\n");
  const patterns = findPatterns(`${plain}\n${footerText}`);
  const time = findFirst(mainEl, (e) => e.tag === "time" && !!e.attrs.datetime);
  const robotsMeta = metaContent(metas, "robots", "name") ?? "";
  return {
    url,
    title: title.replace(/\s+/g, " ").trim().slice(0, 300),
    description: metaContent(metas, "description", "name") ?? og("description"),
    lang: root.attrs.lang?.toLowerCase() ?? null,
    siteName: og("site_name"),
    themeColor: metaContent(metas, "theme-color", "name"),
    publishedAt:
      metaContent(metas, "article:published_time", "property") ?? time?.attrs.datetime ?? null,
    blocks: blocks.slice(0, 400),
    links: links.slice(0, 400),
    images: images.slice(0, 60),
    jsonLd: jsonLdOf(root),
    ...patterns,
    schedule: scheduleOf(blocks),
    noindex: /noindex|noai/i.test(robotsMeta),
  };
}
