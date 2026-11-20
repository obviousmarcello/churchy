/** DB adapter of module `locations` (`LocationRepo`, SDD §8.2). All reads are public. */
import {
  IdSchema,
  LocationInputSchema,
  parseInput,
  type Location,
  type LocationKind,
  type LocationRepo,
} from "@churchy/contracts";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import type { Tx } from "../client";
import { locations } from "../schema";
import { asUuid, expectRow, isoInstant, requireUuid, type DbAdapterBase } from "./base";

type Row = typeof locations.$inferSelect;

function toLocation(row: Row): Location {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    slug: row.slug,
    kind: row.kind as LocationKind, // the pg enum is generated from LocationKindSchema
    address: row.address ?? null,
    geo: row.geo === null ? null : { lat: row.geo.y, lng: row.geo.x },
    openingHours: row.openingHours,
    accessibility: row.accessibility,
    photoMediaId: row.photoMediaId,
    sort: row.sort,
    createdAt: isoInstant(row.createdAt),
    updatedAt: isoInstant(row.updatedAt),
  };
}

const IdListSchema = IdSchema.array();

export function dbLocations(base: DbAdapterBase): LocationRepo {
  const select = (tx: Tx, tenantId: string, ...where: SQL[]) =>
    tx
      .select()
      .from(locations)
      .where(and(eq(locations.tenantId, tenantId), ...where))
      .orderBy(asc(locations.sort), asc(locations.name));

  const one = async (rows: Promise<Row[]>) => {
    const row = (await rows)[0];
    return row === undefined ? null : toLocation(row);
  };

  return {
    list(ctx) {
      return base.read(ctx, [], async (tx, tenantId) =>
        (await select(tx, tenantId)).map(toLocation),
      );
    },
    get(ctx, id) {
      const uuid = asUuid(id);
      if (uuid === null) return base.read(ctx, null, async () => null);
      return base.read(ctx, null, (tx, tenantId) =>
        one(select(tx, tenantId, eq(locations.id, uuid))),
      );
    },
    getBySlug(ctx, slug) {
      return base.read(ctx, null, (tx, tenantId) =>
        one(select(tx, tenantId, eq(locations.slug, slug))),
      );
    },
    upsert(ctx, input) {
      return base.write(ctx, async (tx, tenantId) => {
        const { id, ...data } = parseInput(LocationInputSchema, input);
        const values = {
          ...data,
          photoMediaId: data.photoMediaId === null ? null : requireUuid(data.photoMediaId, "Media"),
          geo: data.geo === null ? null : { x: data.geo.lng, y: data.geo.lat },
        };
        if (id === undefined) {
          const rows = await tx
            .insert(locations)
            .values({ ...values, tenantId })
            .returning();
          return toLocation(expectRow(rows, "Location", "new"));
        }
        const uuid = requireUuid(id, "Location");
        const rows = await tx
          .update(locations)
          .set({ ...values, updatedAt: sql`now()` })
          .where(and(eq(locations.tenantId, tenantId), eq(locations.id, uuid)))
          .returning();
        return toLocation(expectRow(rows, "Location", id));
      });
    },
    delete(ctx, id) {
      return base.write(ctx, async (tx, tenantId) => {
        const uuid = requireUuid(id, "Location");
        const rows = await tx
          .delete(locations)
          .where(and(eq(locations.tenantId, tenantId), eq(locations.id, uuid)))
          .returning({ id: locations.id });
        expectRow(rows, "Location", id);
      });
    },
    reorder(ctx, ids) {
      return base.write(ctx, async (tx, tenantId) => {
        const list = parseInput(IdListSchema, ids);
        for (const [index, id] of list.entries()) {
          const uuid = requireUuid(id, "Location");
          const rows = await tx
            .update(locations)
            .set({ sort: index, updatedAt: sql`now()` })
            .where(and(eq(locations.tenantId, tenantId), eq(locations.id, uuid)))
            .returning({ id: locations.id });
          expectRow(rows, "Location", id); // rolls the whole reorder back
        }
      });
    },
  };
}
