/** Mock repositories: locations, schedule, announcements, news, events, pages, media. */
import type {
  Announcement,
  AnnouncementRepo,
  Calendar,
  Ctx,
  DateRange,
  Event,
  EventRepo,
  Location,
  LocationRepo,
  Media,
  MediaRepo,
  Page,
  PageRepo,
  Post,
  PostRepo,
  SchedulePeriod,
  ScheduleRepo,
  ServiceException,
  ServiceOccurrence,
  ServiceRule,
} from "@churchy/contracts";
import {
  AnnouncementInputSchema,
  CalendarInputSchema,
  EnsureOccurrenceInputSchema,
  EventInputSchema,
  EventStatusSchema,
  IdSchema,
  IsoDateSchema,
  LocationInputSchema,
  MediaCreateInputSchema,
  MediaUpdateInputSchema,
  PageInputSchema,
  PostInputSchema,
  SchedulePeriodInputSchema,
  ServiceExceptionInputSchema,
  ServiceOccurrenceSchema,
  ServiceRuleInputSchema,
  conflict,
  huCollator,
  isAnonymous,
  isPubliclyVisible,
  parseInput,
  validationError,
} from "@churchy/contracts";
import { MockSimulationError } from "../simulation";
import type { RepoDeps } from "./helpers";
import {
  emptyPage,
  instant,
  own,
  ownRef,
  pageOf,
  readTenant,
  removeWhere,
  save,
  staffTenant,
  writeTenant,
} from "./helpers";

// ---------------------------------------------------------------------------------------------
// locations
// ---------------------------------------------------------------------------------------------

export function mockLocations({ store }: RepoDeps): LocationRepo {
  const d = () => store.data;
  const visible = (ctx: Ctx) => {
    const tenantId = readTenant(ctx);
    return d()
      .locations.filter((r) => r.tenantId === tenantId)
      .sort((a, b) => a.sort - b.sort || huCollator.compare(a.name, b.name));
  };
  return {
    async list(ctx) {
      return visible(ctx);
    },
    async get(ctx, id) {
      return visible(ctx).find((r) => r.id === id) ?? null;
    },
    async getBySlug(ctx, slug) {
      return visible(ctx).find((r) => r.slug === slug) ?? null;
    },
    async upsert(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(LocationInputSchema, input);
      const existing = id === undefined ? undefined : own(d().locations, tenantId, id, "Location");
      ownRef(d().media, tenantId, data.photoMediaId, "Media");
      if (
        d().locations.some((r) => r.tenantId === tenantId && r.slug === data.slug && r.id !== id)
      ) {
        throw conflict("Slug already used", { field: "slug" });
      }
      const stamp = store.nowIso();
      const row: Location = {
        ...data,
        id: existing?.id ?? store.nextId("loc"),
        tenantId,
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
      };
      return save(d().locations, row);
    },
    async delete(ctx, id) {
      const row = own(d().locations, writeTenant(ctx), id, "Location");
      removeWhere(d().locations, (r) => r.id === row.id);
    },
    async reorder(ctx, ids) {
      const tenantId = writeTenant(ctx);
      const rows = ids.map((id) => own(d().locations, tenantId, id, "Location"));
      rows.forEach((row, index) => save(d().locations, { ...row, sort: index }));
    },
  };
}

// ---------------------------------------------------------------------------------------------
// schedule
// ---------------------------------------------------------------------------------------------

export function mockSchedule({ store }: RepoDeps): ScheduleRepo {
  const d = () => store.data;
  const range = (r: DateRange) => ({
    from: parseInput(IsoDateSchema, r.from),
    to: parseInput(IsoDateSchema, r.to),
  });
  const newRule = (tenantId: string, input: unknown, existing?: ServiceRule): ServiceRule => {
    const { id: _id, ...data } = parseInput(ServiceRuleInputSchema, input);
    own(d().schedulePeriods, tenantId, data.periodId, "SchedulePeriod");
    own(d().locations, tenantId, data.locationId, "Location");
    return { ...data, id: existing?.id ?? store.nextId("rule"), tenantId };
  };

  return {
    async getScheduleData(ctx) {
      const tenantId = readTenant(ctx);
      return {
        periods: d().schedulePeriods.filter((r) => r.tenantId === tenantId),
        rules: d().serviceRules.filter((r) => r.tenantId === tenantId),
        exceptions: d().serviceExceptions.filter((r) => r.tenantId === tenantId),
      };
    },
    async listExceptions(ctx, query) {
      const tenantId = readTenant(ctx);
      const { from, to } = range(query);
      return d()
        .serviceExceptions.filter((r) => r.tenantId === tenantId && r.date >= from && r.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    async upsertPeriod(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(SchedulePeriodInputSchema, input);
      const existing =
        id === undefined ? undefined : own(d().schedulePeriods, tenantId, id, "SchedulePeriod");
      const row: SchedulePeriod = { ...data, id: existing?.id ?? store.nextId("period"), tenantId };
      return save(d().schedulePeriods, row);
    },
    async deletePeriod(ctx, id) {
      const row = own(d().schedulePeriods, writeTenant(ctx), id, "SchedulePeriod");
      removeWhere(d().serviceRules, (r) => r.periodId === row.id);
      removeWhere(d().schedulePeriods, (r) => r.id === row.id);
    },
    async upsertRule(ctx, input) {
      const tenantId = writeTenant(ctx);
      const id = (input as { id?: string }).id;
      const existing =
        id === undefined ? undefined : own(d().serviceRules, tenantId, id, "ServiceRule");
      return save(d().serviceRules, newRule(tenantId, input, existing));
    },
    async deleteRule(ctx, id) {
      const row = own(d().serviceRules, writeTenant(ctx), id, "ServiceRule");
      removeWhere(d().serviceRules, (r) => r.id === row.id);
    },
    async replaceRules(ctx, periodId, locationId, rules) {
      const tenantId = writeTenant(ctx);
      own(d().schedulePeriods, tenantId, periodId, "SchedulePeriod");
      own(d().locations, tenantId, locationId, "Location");
      // Validate everything before writing anything (atomic save).
      const created = rules.map((rule) => newRule(tenantId, { ...rule, periodId, locationId }));
      removeWhere(
        d().serviceRules,
        (r) => r.tenantId === tenantId && r.periodId === periodId && r.locationId === locationId,
      );
      d().serviceRules.push(...created);
      return created;
    },
    async upsertException(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(ServiceExceptionInputSchema, input);
      const existing =
        id === undefined ? undefined : own(d().serviceExceptions, tenantId, id, "ServiceException");
      ownRef(d().locations, tenantId, data.locationId, "Location");
      ownRef(d().serviceRules, tenantId, data.ruleId, "ServiceRule");
      const row: ServiceException = { ...data, id: existing?.id ?? store.nextId("exc"), tenantId };
      return save(d().serviceExceptions, row);
    },
    async deleteException(ctx, id) {
      const row = own(d().serviceExceptions, writeTenant(ctx), id, "ServiceException");
      removeWhere(d().serviceExceptions, (r) => r.id === row.id);
    },
    async ensureOccurrence(ctx, input) {
      const tenantId = writeTenant(ctx);
      const data = parseInput(EnsureOccurrenceInputSchema, input);
      own(d().locations, tenantId, data.locationId, "Location");
      ownRef(d().serviceRules, tenantId, data.ruleId, "ServiceRule");
      ownRef(d().serviceExceptions, tenantId, data.exceptionId, "ServiceException");
      const at = Date.parse(data.startsAt);
      const existing = d().serviceOccurrences.find(
        (o) =>
          o.tenantId === tenantId &&
          o.locationId === data.locationId &&
          o.serviceType === data.serviceType &&
          Date.parse(o.startsAt) === at,
      );
      if (existing) return existing;
      const row: ServiceOccurrence = {
        ...data,
        id: store.nextId("occ"),
        tenantId,
        status: "scheduled",
        movedToId: null,
      };
      d().serviceOccurrences.push(row);
      return row;
    },
    async listOccurrences(ctx, query) {
      const tenantId = staffTenant(ctx);
      const from = instant(query.from);
      const to = instant(query.to);
      return d()
        .serviceOccurrences.filter(
          (o) =>
            o.tenantId === tenantId &&
            (query.locationId === undefined || o.locationId === query.locationId) &&
            Date.parse(o.startsAt) >= from &&
            Date.parse(o.startsAt) <= to,
        )
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    },
    async updateOccurrence(ctx, id, patch) {
      const tenantId = writeTenant(ctx);
      const row = own(d().serviceOccurrences, tenantId, id, "ServiceOccurrence");
      const data = parseInput(
        ServiceOccurrenceSchema.pick({ status: true, movedToId: true }).partial({
          movedToId: true,
        }),
        patch,
      );
      ownRef(d().serviceOccurrences, tenantId, data.movedToId, "ServiceOccurrence");
      return save(d().serviceOccurrences, {
        ...row,
        status: data.status,
        movedToId: data.movedToId === undefined ? row.movedToId : data.movedToId,
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Publishable content (announcements, news, pages)
// ---------------------------------------------------------------------------------------------

type Publishable = { id: string; tenantId: string; status: string; publishedAt: string | null };

function publishing<T extends Publishable>(
  store: RepoDeps["store"],
  rows: () => T[],
  entity: string,
) {
  return {
    async publish(ctx: Ctx, id: string, at?: string) {
      const row = own(rows(), writeTenant(ctx), id, entity);
      const publishedAt = at === undefined ? store.nowIso() : new Date(instant(at)).toISOString();
      save(rows(), { ...row, status: "published", publishedAt, updatedAt: store.nowIso() });
    },
    async unpublish(ctx: Ctx, id: string) {
      const row = own(rows(), writeTenant(ctx), id, entity);
      save(rows(), { ...row, status: "draft", publishedAt: null, updatedAt: store.nowIso() });
    },
    async delete(ctx: Ctx, id: string) {
      const row = own(rows(), writeTenant(ctx), id, entity);
      removeWhere(rows(), (r) => r.id === row.id);
    },
  };
}

export function mockAnnouncements({ store }: RepoDeps): AnnouncementRepo {
  const d = () => store.data;
  const visible = (ctx: Ctx) => {
    const tenantId = readTenant(ctx);
    return d()
      .announcements.filter((r) => r.tenantId === tenantId)
      .filter((r) => !isAnonymous(ctx) || isPubliclyVisible(r, store.now()))
      .sort((a, b) => b.weekSunday.localeCompare(a.weekSunday));
  };
  return {
    async latest(ctx) {
      return visible(ctx)[0] ?? null;
    },
    async byWeek(ctx, sunday) {
      return visible(ctx).find((r) => r.weekSunday === sunday) ?? null;
    },
    async list(ctx, page) {
      return pageOf(visible(ctx), page);
    },
    async get(ctx, id) {
      return visible(ctx).find((r) => r.id === id) ?? null;
    },
    async upsert(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(AnnouncementInputSchema, input);
      const existing =
        id === undefined ? undefined : own(d().announcements, tenantId, id, "Announcement");
      ownRef(d().media, tenantId, data.pdfMediaId, "Media");
      if (
        d().announcements.some(
          (r) => r.tenantId === tenantId && r.weekSunday === data.weekSunday && r.id !== id,
        )
      ) {
        throw conflict("An announcement already exists for this week", { field: "weekSunday" });
      }
      const stamp = store.nowIso();
      const row: Announcement = {
        ...data,
        id: existing?.id ?? store.nextId("ann"),
        tenantId,
        status: existing?.status ?? "draft",
        publishedAt: existing?.publishedAt ?? null,
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
      };
      return save(d().announcements, row);
    },
    ...publishing(store, () => d().announcements, "Announcement"),
  };
}

export function mockNews({ store }: RepoDeps): PostRepo {
  const d = () => store.data;
  const tenantRows = (ctx: Ctx) => d().posts.filter((r) => r.tenantId === readTenant(ctx));
  const isVisible = (r: Post) => isPubliclyVisible(r, store.now());
  const byPublished = (a: Post, b: Post) =>
    Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? "");
  const listed = (ctx: Ctx) => tenantRows(ctx).filter((r) => !isAnonymous(ctx) || isVisible(r));
  return {
    async listPublished(ctx, query) {
      const rows = tenantRows(ctx)
        .filter(isVisible)
        .filter((r) => query?.category === undefined || r.categories.includes(query.category))
        .sort(byPublished);
      return pageOf(rows, query);
    },
    async getBySlug(ctx, slug) {
      return tenantRows(ctx).find((r) => r.slug === slug && isVisible(r)) ?? null;
    },
    async list(ctx, query) {
      const rows = listed(ctx)
        .filter((r) => query?.status === undefined || r.status === query.status)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      return pageOf(rows, query);
    },
    async get(ctx, id) {
      return listed(ctx).find((r) => r.id === id) ?? null;
    },
    async upsert(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(PostInputSchema, input);
      const existing = id === undefined ? undefined : own(d().posts, tenantId, id, "Post");
      ownRef(d().media, tenantId, data.coverMediaId, "Media");
      if (d().posts.some((r) => r.tenantId === tenantId && r.slug === data.slug && r.id !== id)) {
        throw conflict("Slug already used", { field: "slug" });
      }
      const stamp = store.nowIso();
      const row: Post = {
        ...data,
        id: existing?.id ?? store.nextId("post"),
        tenantId,
        status: existing?.status ?? "draft",
        publishedAt: existing?.publishedAt ?? null,
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
      };
      return save(d().posts, row);
    },
    ...publishing(store, () => d().posts, "Post"),
  };
}

export function mockPages({ store }: RepoDeps): PageRepo {
  const d = () => store.data;
  const ordered = (rows: Page[]) =>
    rows.sort((a, b) => a.sort - b.sort || huCollator.compare(a.title, b.title));
  const isVisible = (r: Page) => isPubliclyVisible(r, store.now());
  const listed = (ctx: Ctx) =>
    d().pages.filter((r) => r.tenantId === readTenant(ctx) && (!isAnonymous(ctx) || isVisible(r)));
  return {
    async getBySlug(ctx, slug) {
      const tenantId = readTenant(ctx);
      return (
        d().pages.find((r) => r.tenantId === tenantId && r.slug === slug && isVisible(r)) ?? null
      );
    },
    async listPublished(ctx) {
      const tenantId = readTenant(ctx);
      return ordered(d().pages.filter((r) => r.tenantId === tenantId && isVisible(r))).map(
        ({ id, slug, title, parentId, riteKey, sort }) => ({
          id,
          slug,
          title,
          parentId,
          riteKey,
          sort,
        }),
      );
    },
    async list(ctx) {
      return ordered(listed(ctx));
    },
    async get(ctx, id) {
      return listed(ctx).find((r) => r.id === id) ?? null;
    },
    async upsert(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(PageInputSchema, input);
      const existing = id === undefined ? undefined : own(d().pages, tenantId, id, "Page");
      ownRef(d().pages, tenantId, data.parentId, "Page");
      if (data.parentId !== null && data.parentId === id) {
        throw validationError([{ path: ["parentId"], message: "A page cannot be its own parent" }]);
      }
      if (d().pages.some((r) => r.tenantId === tenantId && r.slug === data.slug && r.id !== id)) {
        throw conflict("Slug already used", { field: "slug" });
      }
      const stamp = store.nowIso();
      const row: Page = {
        ...data,
        id: existing?.id ?? store.nextId("page"),
        tenantId,
        status: existing?.status ?? "draft",
        publishedAt: existing?.publishedAt ?? null,
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
      };
      return save(d().pages, row);
    },
    ...publishing(store, () => d().pages, "Page"),
  };
}

// ---------------------------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------------------------

export function mockEvents({ store }: RepoDeps): EventRepo {
  const d = () => store.data;
  const isPublic = (e: Event) => e.visibility === "public" && e.status === "published";
  const inWindow = (e: Event, from: number, to: number) => {
    const start = Date.parse(e.startsAt);
    if (e.rrule !== null) return start <= to;
    const end = e.endsAt === null ? start : Date.parse(e.endsAt);
    return start <= to && end >= from;
  };
  const byStart = (a: Event, b: Event) => Date.parse(a.startsAt) - Date.parse(b.startsAt);
  const listed = (ctx: Ctx) =>
    d().events.filter((e) => e.tenantId === readTenant(ctx) && (!isAnonymous(ctx) || isPublic(e)));

  return {
    async listPublic(ctx, window) {
      const from = instant(window.from);
      const to = instant(window.to);
      return d()
        .events.filter((e) => e.tenantId === readTenant(ctx) && isPublic(e))
        .filter((e) => inWindow(e, from, to))
        .filter((e) => window.category === undefined || e.category === window.category)
        .sort(byStart);
    },
    async getPublicBySlug(ctx, slug) {
      const tenantId = readTenant(ctx);
      return (
        d().events.find((e) => e.tenantId === tenantId && e.slug === slug && isPublic(e)) ?? null
      );
    },
    async list(ctx, window) {
      const from = instant(window.from);
      const to = instant(window.to);
      return listed(ctx)
        .filter((e) => inWindow(e, from, to))
        .filter(
          (e) => window.calendarIds === undefined || window.calendarIds.includes(e.calendarId),
        )
        .sort(byStart);
    },
    async get(ctx, id) {
      return listed(ctx).find((e) => e.id === id) ?? null;
    },
    async upsert(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(EventInputSchema, input);
      const existing = id === undefined ? undefined : own(d().events, tenantId, id, "Event");
      own(d().calendars, tenantId, data.calendarId, "Calendar");
      ownRef(d().locations, tenantId, data.locationId, "Location");
      ownRef(d().events, tenantId, data.parentEventId, "Event");
      ownRef(d().teams, tenantId, data.teamId, "Team");
      ownRef(d().media, tenantId, data.coverMediaId, "Media");
      if (d().events.some((e) => e.tenantId === tenantId && e.slug === data.slug && e.id !== id)) {
        throw conflict("Slug already used", { field: "slug" });
      }
      const stamp = store.nowIso();
      const row: Event = {
        ...data,
        id: existing?.id ?? store.nextId("event"),
        tenantId,
        status: existing?.status ?? "draft",
        createdBy: existing?.createdBy ?? ctx.actor.userId,
        externalRef: existing?.externalRef ?? null,
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
      };
      return save(d().events, row);
    },
    async setStatus(ctx, id, status) {
      const row = own(d().events, writeTenant(ctx), id, "Event");
      save(d().events, {
        ...row,
        status: parseInput(EventStatusSchema, status),
        updatedAt: store.nowIso(),
      });
    },
    async delete(ctx, id) {
      const row = own(d().events, writeTenant(ctx), id, "Event");
      removeWhere(d().events, (e) => e.id === row.id || e.parentEventId === row.id);
    },
    async listCalendars(ctx) {
      const tenantId = staffTenant(ctx);
      return d()
        .calendars.filter((c) => c.tenantId === tenantId)
        .sort((a, b) => huCollator.compare(a.name, b.name));
    },
    async upsertCalendar(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(CalendarInputSchema, input);
      const existing = id === undefined ? undefined : own(d().calendars, tenantId, id, "Calendar");
      ownRef(d().people, tenantId, data.ownerPersonId, "Person");
      ownRef(d().teams, tenantId, data.teamId, "Team");
      const row: Calendar = { ...data, id: existing?.id ?? store.nextId("cal"), tenantId };
      return save(d().calendars, row);
    },
    async deleteCalendar(ctx, id) {
      const row = own(d().calendars, writeTenant(ctx), id, "Calendar");
      if (d().events.some((e) => e.calendarId === row.id)) {
        throw conflict("The calendar still contains events");
      }
      removeWhere(d().calendars, (c) => c.id === row.id);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// media
// ---------------------------------------------------------------------------------------------

export function mockMedia({ store }: RepoDeps): MediaRepo {
  const d = () => store.data;
  const visible = (ctx: Ctx) =>
    d().media.filter(
      (m) => m.tenantId === readTenant(ctx) && (!isAnonymous(ctx) || m.visibility === "public"),
    );
  const needsAlt = (m: Pick<Media, "kind" | "decorative" | "alt">) =>
    m.kind === "image" && !m.decorative && (m.alt ?? "").trim().length === 0;

  return {
    async get(ctx, id) {
      return visible(ctx).find((m) => m.id === id) ?? null;
    },
    async getMany(ctx, ids) {
      parseInput(IdSchema.array(), ids);
      const rows = visible(ctx);
      return ids.flatMap((id) => rows.filter((m) => m.id === id));
    },
    async list(ctx, query) {
      const tenantId = staffTenant(ctx);
      if (tenantId === null) return emptyPage(query);
      const rows = d()
        .media.filter((m) => m.tenantId === tenantId)
        .filter((m) => query?.kind === undefined || m.kind === query.kind)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      return pageOf(rows, query);
    },
    async create(ctx, input) {
      const tenantId = writeTenant(ctx);
      const data = parseInput(MediaCreateInputSchema, input);
      if (store.switches.uploadFailure) {
        throw new MockSimulationError("UPLOAD_FAILED", "Simulated upload failure");
      }
      const row: Media = {
        ...data,
        id: store.nextId("media"),
        tenantId,
        uploadedBy: ctx.actor.userId,
        createdAt: store.nowIso(),
      };
      d().media.push(row);
      return row;
    },
    async update(ctx, id, patch) {
      const row = own(d().media, writeTenant(ctx), id, "Media");
      const data = parseInput(MediaUpdateInputSchema, patch);
      const defined = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      const next = { ...row, ...defined };
      if (needsAlt(next)) {
        throw validationError([
          { path: ["alt"], message: "Images need alt text or must be marked decorative" },
        ]);
      }
      return save(d().media, next);
    },
    async delete(ctx, id) {
      const row = own(d().media, writeTenant(ctx), id, "Media");
      removeWhere(d().media, (m) => m.id === row.id);
    },
    async usage(ctx) {
      const tenantId = staffTenant(ctx);
      const rows = d().media.filter((m) => m.tenantId === tenantId);
      return { bytes: rows.reduce((sum, m) => sum + m.bytes, 0), count: rows.length };
    },
  };
}
