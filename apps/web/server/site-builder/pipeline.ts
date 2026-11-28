import type { ImportStage } from "@churchy/contracts";
import { crawlSite } from "./crawl";
import { registrableDomain } from "./domain";
import { SiteDraftSchema, DRAFT_VERSION, type DraftWarning, type SiteDraft } from "./draft-schema";
import type { ExtractedPage } from "./extract";
import { costUsd, PRICE, PlannerError, type Planner } from "./llm";
import {
  collectImages,
  denominationVote,
  officeFacts,
  sundayOnOrAfter,
  toDraftBlocks,
  toRichText,
  uniqueSlug,
  validIsoDate,
  verifyAddress,
  verifyServiceTime,
} from "./map";
import { officeContactsOf, scrubBlocks } from "./personal-data";
import { buildUserPrompt, estimateTokens } from "./prompt";
import type { PageRole } from "./plan-schema";
import type { SiteFetcher } from "./site-fetcher";

/**
 * crawl -> extract -> scrub personal data -> plan with the model -> verify and map -> draft.
 * The model only sees scrubbed text and only decides/condenses; every claim is verified against
 * the crawl before it enters the draft. No images are downloaded here (apply does that).
 */

export interface RunBudget {
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxCostUsd: number;
}
export const DEFAULT_RUN_BUDGET: RunBudget = {
  maxInputTokens: 120_000,
  maxOutputTokens: 16_000,
  maxCostUsd: 1,
};

/** `SITE_BUILDER_MAX_COST_USD` (default 1) and `SITE_BUILDER_MAX_INPUT_TOKENS` (default 120000). */
export function runBudgetFromEnv(env: Record<string, string | undefined> = process.env): RunBudget {
  const num = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    ...DEFAULT_RUN_BUDGET,
    maxCostUsd: num(env.SITE_BUILDER_MAX_COST_USD, DEFAULT_RUN_BUDGET.maxCostUsd),
    maxInputTokens: Math.floor(
      num(env.SITE_BUILDER_MAX_INPUT_TOKENS, DEFAULT_RUN_BUDGET.maxInputTokens),
    ),
  };
}

export const CONSENT_STATEMENT = "The church asked us to prepare its site from this address.";

export interface BuildInput {
  readonly startUrl: string;
  readonly operatorId: string;
  /** Must be true: the operator's confirmation, recorded in the draft and the audit log. */
  readonly consent: boolean;
  readonly consentNote?: string | null;
  readonly now?: Date;
  readonly ttlHours?: number;
}
export interface BuildDeps {
  readonly fetcher: SiteFetcher;
  readonly planner: Planner;
  readonly budget?: Partial<RunBudget>;
  readonly onProgress?: (e: {
    stage: ImportStage;
    status: "started" | "completed";
    count?: number;
  }) => void;
  readonly signal?: AbortSignal;
}
export type BuildFailure =
  | "no_consent"
  | "robots_blocked"
  | "unreachable"
  | "cost_cap"
  | "model_failed"
  | "invalid_plan"
  | "aborted";
export type BuildResult =
  | { readonly ok: true; readonly draft: SiteDraft }
  | { readonly ok: false; readonly code: BuildFailure };

/** `SITE_BUILDER_DRAFT_TTL_HOURS`, default 24, kept between 1 hour and 7 days. */
export function draftTtlHours(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.SITE_BUILDER_DRAFT_TTL_HOURS);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 168) : 24;
}

const CHARS_STEPS = [2500, 1500, 800, 400];

export async function buildDraft(input: BuildInput, deps: BuildDeps): Promise<BuildResult> {
  if (input.consent !== true) return { ok: false, code: "no_consent" };
  const now = input.now ?? new Date();
  const budget: RunBudget = { ...DEFAULT_RUN_BUDGET, ...deps.budget };
  const emit = deps.onProgress ?? (() => {});
  const warnings: DraftWarning[] = [];

  emit({ stage: "fetched", status: "started" });
  const crawl = await crawlSite(input.startUrl, deps.fetcher, {
    signal: deps.signal,
    onPage: (n) => emit({ stage: "pages", status: "started", count: n }),
  });
  if (deps.signal?.aborted) return { ok: false, code: "aborted" };
  if (crawl.startFailure) return { ok: false, code: crawl.startFailure };
  emit({ stage: "fetched", status: "completed" });
  for (const w of crawl.warnings) warnings.push({ code: w.code, url: w.url, count: null });

  const office = officeContactsOf(crawl.pages);
  let removedContacts = 0;
  let droppedParagraphs = 0;
  const pages: ExtractedPage[] = crawl.pages.map((p) => {
    const scrubbed = scrubBlocks(p.blocks, office);
    removedContacts += scrubbed.stats.contactsRemoved;
    droppedParagraphs += scrubbed.stats.paragraphsDropped;
    return { ...p, blocks: scrubbed.blocks };
  });
  if (removedContacts + droppedParagraphs > 0) {
    warnings.push({
      code: "personal_data_removed",
      url: null,
      count: removedContacts + droppedParagraphs,
    });
  }
  emit({ stage: "pages", status: "completed", count: pages.length });

  // Prompt, shrunk until the estimate fits the token and cost cap.
  const vote = denominationVote(pages);
  const hint = { denomination: vote?.value ?? null, startUrl: input.startUrl };
  let prompt = "";
  let fits = false;
  for (const chars of CHARS_STEPS) {
    prompt = buildUserPrompt(pages, hint, chars);
    const inTokens = estimateTokens(prompt) + 1500;
    const cost =
      (inTokens * PRICE.inputPerM + budget.maxOutputTokens * PRICE.outputPerM) / 1_000_000;
    if (inTokens <= budget.maxInputTokens && cost <= budget.maxCostUsd) {
      fits = true;
      break;
    }
  }
  if (!fits) return { ok: false, code: "cost_cap" };

  emit({ stage: "draft", status: "started" });
  let planned;
  try {
    planned = await deps.planner.plan(prompt, deps.signal);
  } catch (error) {
    if (deps.signal?.aborted) return { ok: false, code: "aborted" };
    return {
      ok: false,
      code:
        error instanceof PlannerError && error.kind === "invalid" ? "invalid_plan" : "model_failed",
    };
  }
  const { plan, usage } = planned;
  const spent = costUsd(usage);
  if (spent > budget.maxCostUsd) warnings.push({ code: "cost_cap", url: null, count: null });

  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const known = (url: string) => byUrl.has(url);
  let unknownUrls = 0;

  // Roles by URL, only for crawled pages.
  const roles = new Map<string, { role: PageRole; title: string; slug: string; riteKey: string }>();
  for (const p of plan.pages) {
    if (!known(p.url)) {
      unknownUrls++;
      continue;
    }
    roles.set(p.url, p);
  }
  const scope =
    registrableDomain(new URL(input.startUrl).hostname) ??
    new URL(input.startUrl).hostname.toLowerCase();

  const slugs = new Set<string>();
  const pageEntries = pages
    .map((page) => ({ page, role: (roles.get(page.url)?.role ?? "skip") as PageRole }))
    .filter((e) => e.role !== "skip");
  const imageIndex = collectImages(
    pageEntries.filter((e) =>
      ["about", "rite", "group", "history", "gallery", "event", "other", "home"].includes(e.role),
    ),
    scope,
    deps.fetcher.limits.maxImages,
    warnings,
  );

  const KEEP_AS_PAGE: PageRole[] = [
    "about",
    "rite",
    "group",
    "history",
    "gallery",
    "event",
    "other",
  ];
  const draftPages: SiteDraft["pages"] = [];
  for (const { page, role } of pageEntries) {
    if (!KEEP_AS_PAGE.includes(role)) continue;
    const decision = roles.get(page.url)!;
    const blocks = toDraftBlocks(decision.title, page.blocks, imageIndex);
    if (blocks.length === 0) continue;
    draftPages.push({
      id: `page-${draftPages.length + 1}`,
      sourceUrl: page.url,
      include: true,
      slug: uniqueSlug(decision.slug, decision.title, slugs),
      title: decision.title.slice(0, 500),
      kind: role === "rite" ? "rite" : "page",
      riteKey: role === "rite" && decision.riteKey ? decision.riteKey.slice(0, 60) : null,
      blocks,
    });
  }

  const posts: SiteDraft["posts"] = [];
  for (const p of plan.posts) {
    const page = byUrl.get(p.url);
    if (!page) {
      unknownUrls++;
      continue;
    }
    const body = toRichText(
      page.blocks.filter((b) => b.type !== "image" && !(b.type === "heading" && b.level === 1)),
    );
    if (body.content.length === 0) continue;
    posts.push({
      id: `post-${posts.length + 1}`,
      sourceUrl: page.url,
      include: true,
      slug: uniqueSlug("", p.title, slugs),
      title: p.title.slice(0, 500),
      lead: p.lead,
      body,
      publishedAt:
        validIsoDate(p.publishedAt) ?? (page.publishedAt ? validIsoDate(page.publishedAt) : null),
    });
  }

  const announcements: SiteDraft["announcements"] = [];
  for (const a of plan.announcements) {
    const page = byUrl.get(a.url);
    if (!page) {
      unknownUrls++;
      continue;
    }
    const given = validIsoDate(a.weekSunday);
    const published = page.publishedAt ? validIsoDate(page.publishedAt) : null;
    const week = given ? sundayOnOrAfter(given) : published ? sundayOnOrAfter(published) : null;
    const body = toRichText(page.blocks.filter((b) => b.type !== "image"));
    if (!week || body.content.length === 0) {
      warnings.push({ code: "low_confidence", url: page.url, count: null });
      continue;
    }
    announcements.push({
      id: `ann-${announcements.length + 1}`,
      sourceUrl: page.url,
      include: true,
      weekSunday: week,
      body,
    });
  }
  if (unknownUrls > 0)
    warnings.push({ code: "dropped_unknown_url", url: null, count: unknownUrls });

  const locations: SiteDraft["locations"] = [];
  for (const l of plan.locations) {
    const address = verifyAddress(l, pages);
    if (!address && (l.postalCode || l.line1))
      warnings.push({ code: "unverified_address", url: l.sourceUrl || null, count: null });
    locations.push({
      id: `loc-${locations.length + 1}`,
      sourceUrl: known(l.sourceUrl) ? l.sourceUrl : input.startUrl,
      include: true,
      name: l.name,
      kind: l.kind,
      address,
      confidence: address ? l.confidence : Math.min(l.confidence, 0.5),
    });
  }
  emit({ stage: "serviceTimes", status: "started" });
  const serviceTimes: SiteDraft["serviceTimes"] = [];
  for (const st of plan.serviceTimes) {
    if (!verifyServiceTime(st, byUrl.get(st.sourceUrl))) {
      warnings.push({ code: "unverified_service_time", url: st.sourceUrl || null, count: null });
      continue;
    }
    const loc = locations.find((l) => l.name.toLowerCase() === st.locationName.toLowerCase());
    serviceTimes.push({
      id: `st-${serviceTimes.length + 1}`,
      label: st.label,
      weekday: st.weekday,
      time: st.time,
      location: loc?.id ?? null,
      confidence: st.confidence,
      sourceUrl: st.sourceUrl,
      include: true,
    });
  }
  emit({ stage: "serviceTimes", status: "completed", count: serviceTimes.length });

  emit({ stage: "contacts", status: "started" });
  const facts = officeFacts(office);
  const officeAddress = locations.find((l) => l.address)?.address ?? null;
  emit({ stage: "contacts", status: "completed" });

  emit({ stage: "theme", status: "started" });
  const start = pages[0];
  const theme = hexOf(start?.themeColor ?? null);
  emit({ stage: "theme", status: "completed" });

  emit({ stage: "preset", status: "started" });
  let denomConf = plan.church.denominationConfidence;
  if (vote && vote.value !== plan.church.denomination && vote.hits >= 3) {
    warnings.push({ code: "denomination_disagrees", url: null, count: null });
    denomConf = Math.min(denomConf, 0.5);
  }
  emit({ stage: "preset", status: "completed" });

  const ttl = (input.ttlHours ?? draftTtlHours()) * 3_600_000;
  const draft: SiteDraft = {
    version: DRAFT_VERSION,
    meta: {
      sourceUrl: input.startUrl,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl).toISOString(),
      operatorId: input.operatorId,
      consent: { confirmed: true, statement: CONSENT_STATEMENT, at: now.toISOString() },
      consentNote: input.consentNote?.slice(0, 300) ?? null,
      model: deps.planner.model,
      usage: {
        pages: deps.fetcher.usage.pages,
        images: imageIndex.images.filter((i) => i.include).length,
        bytes: deps.fetcher.usage.bytes,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: Math.round(spent * 10_000) / 10_000,
      },
    },
    church: {
      name: {
        value: plan.church.name,
        confidence: plan.church.name ? 0.9 : 0,
        sourceUrl: known(plan.church.nameSourceUrl) ? plan.church.nameSourceUrl : input.startUrl,
      },
      shortName: { value: plan.church.shortName, confidence: 0.8 },
      tagline: plan.church.tagline || null,
      denomination: { value: plan.church.denomination, confidence: denomConf },
      welcome: plan.church.welcome || null,
    },
    theme: { primary: theme, source: theme ? "meta" : "none" },
    contact: { email: facts.email, phone: facts.phone, address: officeAddress },
    locations,
    serviceTimes,
    pages: draftPages,
    posts,
    announcements,
    images: imageIndex.images,
    warnings,
  };
  const parsed = SiteDraftSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, code: "invalid_plan" };
  emit({ stage: "draft", status: "completed" });
  return { ok: true, draft: parsed.data };
}

function hexOf(color: string | null): string | null {
  if (!color) return null;
  const c = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  return short
    ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
    : null;
}
