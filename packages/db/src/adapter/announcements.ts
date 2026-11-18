/**
 * DB adapter of module `announcements` (`AnnouncementRepo`, SDD §8.2, D-14). Anonymous contexts
 * only see publicly visible rows — the SQL form of `isPubliclyVisible` (published, `published_at`
 * not in the future); announcements have no expiry.
 */
import {
  AnnouncementInputSchema,
  IsoDateTimeSchema,
  PageRequestSchema,
  isAnonymous,
  parseInput,
  type Announcement,
  type AnnouncementRepo,
  type Ctx,
  type ListPage,
  type PublishStatus,
} from "@churchy/contracts";
import { and, count, desc, eq, lte, sql, type SQL } from "drizzle-orm";
import type { Tx } from "../client";
import { announcements } from "../schema";
import {
  asUuid,
  expectRow,
  isoInstant,
  isoInstantOrNull,
  requireUuid,
  type DbAdapterBase,
} from "./base";

type Row = typeof announcements.$inferSelect;
const ENTITY = "Announcement";

function toAnnouncement(row: Row): Announcement {
  return {
    id: row.id,
    tenantId: row.tenantId,
    weekSunday: row.weekSunday,
    body: row.body ?? null,
    pdfMediaId: row.pdfMediaId,
    status: row.status as PublishStatus, // the pg enum is generated from PublishStatusSchema
    publishedAt: isoInstantOrNull(row.publishedAt),
    createdAt: isoInstant(row.createdAt),
    updatedAt: isoInstant(row.updatedAt),
  };
}

export function dbAnnouncements(base: DbAdapterBase): AnnouncementRepo {
  /** Tenant filter, plus public visibility for anonymous visitors. */
  const visible = (ctx: Ctx, tenantId: string, ...where: SQL[]): SQL | undefined =>
    and(
      eq(announcements.tenantId, tenantId),
      ...(isAnonymous(ctx)
        ? [eq(announcements.status, "published"), lte(announcements.publishedAt, sql`now()`)]
        : []),
      ...where,
    );

  const first = async (tx: Tx, where: SQL | undefined) => {
    const rows = await tx
      .select()
      .from(announcements)
      .where(where)
      .orderBy(desc(announcements.weekSunday))
      .limit(1);
    return rows[0] === undefined ? null : toAnnouncement(rows[0]);
  };

  /** Updates the publishing state of one of the tenant's rows; NOT_FOUND otherwise. */
  const setState = (
    ctx: Ctx,
    id: string,
    state: () => { status: PublishStatus; publishedAt: string | SQL | null },
  ) =>
    base.write(ctx, async (tx, tenantId) => {
      const uuid = requireUuid(id, ENTITY);
      const rows = await tx
        .update(announcements)
        .set({ ...state(), updatedAt: sql`now()` })
        .where(and(eq(announcements.tenantId, tenantId), eq(announcements.id, uuid)))
        .returning({ id: announcements.id });
      expectRow(rows, ENTITY, id);
    });

  return {
    latest(ctx) {
      return base.read(ctx, null, (tx, tenantId) => first(tx, visible(ctx, tenantId)));
    },
    byWeek(ctx, sunday) {
      return base.read(ctx, null, (tx, tenantId) =>
        first(tx, visible(ctx, tenantId, eq(announcements.weekSunday, sunday))),
      );
    },
    get(ctx, id) {
      const uuid = asUuid(id);
      return base.read(ctx, null, async (tx, tenantId) =>
        uuid === null ? null : first(tx, visible(ctx, tenantId, eq(announcements.id, uuid))),
      );
    },
    async list(ctx, page) {
      const { page: number, pageSize } = parseInput(PageRequestSchema, page ?? {});
      const empty: ListPage<Announcement> = { items: [], total: 0, page: number, pageSize };
      return base.read(ctx, empty, async (tx, tenantId) => {
        const where = visible(ctx, tenantId);
        const [total] = await tx.select({ n: count() }).from(announcements).where(where);
        const rows = await tx
          .select()
          .from(announcements)
          .where(where)
          .orderBy(desc(announcements.weekSunday))
          .limit(pageSize)
          .offset((number - 1) * pageSize);
        return { items: rows.map(toAnnouncement), total: total?.n ?? 0, page: number, pageSize };
      });
    },
    upsert(ctx, input) {
      return base.write(ctx, async (tx, tenantId) => {
        const { id, ...data } = parseInput(AnnouncementInputSchema, input);
        const values = {
          weekSunday: data.weekSunday,
          body: data.body,
          pdfMediaId: data.pdfMediaId === null ? null : requireUuid(data.pdfMediaId, "Media"),
        };
        if (id === undefined) {
          // status/publishedAt keep their defaults (draft, null)
          const rows = await tx
            .insert(announcements)
            .values({ ...values, tenantId })
            .returning();
          return toAnnouncement(expectRow(rows, ENTITY, "new"));
        }
        const uuid = requireUuid(id, ENTITY);
        const rows = await tx
          .update(announcements)
          .set({ ...values, updatedAt: sql`now()` }) // publishing state unchanged
          .where(and(eq(announcements.tenantId, tenantId), eq(announcements.id, uuid)))
          .returning();
        return toAnnouncement(expectRow(rows, ENTITY, id));
      });
    },
    publish(ctx, id, at) {
      return setState(ctx, id, () => ({
        status: "published",
        publishedAt:
          at === undefined ? sql`now()` : new Date(parseInput(IsoDateTimeSchema, at)).toISOString(),
      }));
    },
    unpublish(ctx, id) {
      return setState(ctx, id, () => ({ status: "draft", publishedAt: null }));
    },
    delete(ctx, id) {
      return base.write(ctx, async (tx, tenantId) => {
        const uuid = requireUuid(id, ENTITY);
        const rows = await tx
          .delete(announcements)
          .where(and(eq(announcements.tenantId, tenantId), eq(announcements.id, uuid)))
          .returning({ id: announcements.id });
        expectRow(rows, ENTITY, id);
      });
    },
  };
}
