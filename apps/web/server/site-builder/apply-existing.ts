import type { Ctx, PageBlock, Repositories } from "@churchy/contracts";
import type { DraftBlock, SiteDraft } from "./draft-schema";
import { serviceTypeKey, type ApplySummary } from "./apply-new";
import { uniqueSlug } from "./map";

/**
 * Applying a draft to an EXISTING church: done by the church's owner under their own tenant context,
 * through the repository contracts (so both adapters and every rule of the repositories apply).
 * Additive only: nothing the church already has is changed or deleted (slugs get a suffix, a week
 * that already has announcements is skipped, the service schedule is only filled when it is empty,
 * the church's identity and theme stay as they are). Everything lands unpublished.
 */

function pageBlocks(blocks: readonly DraftBlock[]): PageBlock[] {
  // Images are not carried over here: media arrive with the media pipeline (S2); text and structure do.
  const out: PageBlock[] = [];
  for (const b of blocks) {
    if (b.type === "heading") out.push({ type: "heading", text: b.text, level: b.level });
    else if (b.type === "text") out.push({ type: "text", content: b.content });
    else if (b.type === "quote") out.push({ type: "quote", text: b.text, source: b.source });
  }
  return out;
}

export async function applyDraftWithRepositories(
  ctx: Ctx,
  repos: Repositories,
  draft: SiteDraft,
): Promise<ApplySummary> {
  const taken = new Set<string>();
  for (const p of await repos.pages.list(ctx)) taken.add(p.slug);
  let pages = 0;
  for (const [index, p] of draft.pages.filter((x) => x.include).entries()) {
    await repos.pages.upsert(ctx, {
      slug: uniqueSlug(p.slug, p.title, taken),
      title: p.title,
      blocks: pageBlocks(p.blocks),
      riteKey: p.kind === "rite" ? p.riteKey : null,
      seo: { title: p.title.slice(0, 70), description: null, ogImageMediaId: null },
      sort: 1000 + index,
    });
    pages++;
  }

  const postSlugs = new Set<string>();
  for (let page = 1; ; page++) {
    const result = await repos.news.list(ctx, { page, pageSize: 100 });
    for (const post of result.items) postSlugs.add(post.slug);
    if (page * result.pageSize >= result.total) break;
  }
  let posts = 0;
  for (const p of draft.posts.filter((x) => x.include)) {
    await repos.news.upsert(ctx, {
      slug: uniqueSlug(p.slug, p.title, postSlugs),
      title: p.title,
      lead: p.lead,
      body: p.body,
    });
    posts++;
  }

  let announcements = 0;
  for (const a of draft.announcements.filter((x) => x.include)) {
    if (await repos.announcements.byWeek(ctx, a.weekSunday)) continue;
    await repos.announcements.upsert(ctx, { weekSunday: a.weekSunday, body: a.body });
    announcements++;
  }

  const locSlugs = new Set((await repos.locations.list(ctx)).map((l) => l.slug));
  const locationIds = new Map<string, string>();
  let locations = 0;
  for (const l of draft.locations.filter((x) => x.include)) {
    const created = await repos.locations.upsert(ctx, {
      name: l.name,
      slug: uniqueSlug("", l.name, locSlugs),
      kind: l.kind,
      address: l.address,
    });
    locationIds.set(l.id, created.id);
    locations++;
  }

  const times = draft.serviceTimes.filter((x) => x.include);
  let serviceRules = 0;
  let skippedServiceTimes = 0;
  const schedule = await repos.schedule.getScheduleData(ctx);
  if (times.length > 0 && schedule.rules.length === 0) {
    const fallback = locationIds.values().next().value ?? (await repos.locations.list(ctx))[0]?.id;
    if (fallback) {
      const period = await repos.schedule.upsertPeriod(ctx, { name: "Alap" } as never);
      for (const s of times) {
        const locationId = (s.location ? locationIds.get(s.location) : undefined) ?? fallback;
        await repos.schedule.upsertRule(ctx, {
          periodId: period.id,
          locationId,
          weekday: s.weekday,
          time: s.time,
          serviceType: serviceTypeKey(s.label, draft),
          title: s.label,
        } as never);
        serviceRules++;
      }
    } else {
      skippedServiceTimes = times.length;
    }
  } else {
    skippedServiceTimes = times.length;
  }
  return { pages, posts, announcements, locations, serviceRules, media: 0, skippedServiceTimes };
}
