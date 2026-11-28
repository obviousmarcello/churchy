/**
 * One-off import of the production data of a church from the Music Sheet DB (source Postgres) into
 * one Churchy tenant (PLAN §4: "imported once by a script with tenant_id fill").
 *
 *   SOURCE_DATABASE_URL=… DATABASE_URL=… pnpm --filter @churchy/db import:music \
 *     --tenant <uuid> [--user-map map.json] [--source-schema public] [--dry-run]
 *
 * - Operator tool: run it by hand, against a given tenant. No data is committed to the repository.
 * - `--dry-run`: does everything in one transaction and cancels it; prints the counts.
 * - Idempotent: rows are inserted `ON CONFLICT DO NOTHING`, so a second run adds nothing.
 * - `tenant_id` is set to `--tenant`; generated columns and columns that the source lacks are left
 *   to the target's defaults; columns that the target lacks are dropped (listed in the report).
 * - Users: the source's `auth.users` ids are not Churchy profiles. `--user-map` maps source user id
 *   to Churchy `profiles.id` (a JSON object). An unmapped user reference becomes NULL, or the row is
 *   skipped when the column is NOT NULL (counted in the report).
 * - `events`: the source's events become staff events of the tenant's music calendar.
 * - Not copied: files in the storage buckets (copy them to `t/<tenant>/…` separately), `calendars`,
 *   and the platform/Churchy tables.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { MUSIC_TABLES } from "../src/table-scopes";

export type ImportOptions = {
  tenantId: string;
  userMap?: Record<string, string>;
  sourceSchema?: string;
  dryRun?: boolean;
};
export type TableReport = {
  table: string;
  read: number;
  inserted: number;
  skipped: number;
  note?: string;
};

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
const SKIP = new Set(["calendars", "events"]);

type Meta = { cols: { name: string; generated: boolean; notNull: boolean }[]; userCols: string[] };

async function targetMeta(db: pg.PoolClient, table: string): Promise<Meta> {
  const cols = await db.query<{ name: string; generated: string; notnull: boolean }>(
    `select a.attname as name, a.attgenerated as generated, a.attnotnull as notnull
       from pg_attribute a where a.attrelid = ('public.' || $1)::regclass and a.attnum > 0 and not a.attisdropped
      order by a.attnum`,
    [q(table)],
  );
  const users = await db.query<{ name: string }>(
    `select a.attname as name from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.conrelid = ('public.' || $1)::regclass
        and c.confrelid = 'public.profiles'::regclass and array_length(c.conkey, 1) = 1`,
    [q(table)],
  );
  return {
    cols: cols.rows.map((c) => ({
      name: c.name,
      generated: c.generated !== "",
      notNull: c.notnull,
    })),
    userCols: users.rows.map((u) => u.name),
  };
}

/** Tables in foreign-key order (referenced first); tables in a cycle keep their listed order. */
async function ordered(db: pg.PoolClient, tables: string[]): Promise<string[]> {
  const fk = await db.query<{ child: string; parent: string }>(
    `select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent
       from pg_constraint c where c.contype = 'f'`,
  );
  const set = new Set(tables);
  const strip = (t: string) => t.replace(/^public\./, "").replace(/"/g, "");
  const deps = new Map<string, Set<string>>(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of fk.rows) {
    const [c, p] = [strip(child), strip(parent)];
    if (c !== p && set.has(c) && set.has(p)) deps.get(c)!.add(p);
  }
  const out: string[] = [];
  const left = new Set(tables);
  while (left.size > 0) {
    const next =
      [...left].find((t) => [...deps.get(t)!].every((d) => !left.has(d))) ?? [...left][0]!;
    left.delete(next);
    out.push(next);
  }
  return out;
}

export async function importMusic(
  source: pg.Pool,
  target: pg.Pool,
  options: ImportOptions,
): Promise<TableReport[]> {
  const schema = options.sourceSchema ?? "public";
  const userMap = options.userMap ?? {};
  const report: TableReport[] = [];
  const db = await target.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('app.tenant_id', $1, true)", [options.tenantId]);
    const exists = await db.query("select 1 from tenants where id = $1", [options.tenantId]);
    if (exists.rowCount !== 1) throw new Error(`Tenant ${options.tenantId} does not exist`);

    const tables = await ordered(
      db,
      MUSIC_TABLES.filter((t) => !SKIP.has(t)),
    );
    // `events` refer to `setlists` (setlist_id), and other tables refer to `events`: right after setlists.
    const at = tables.indexOf("setlists") + 1;
    const order = [...tables.slice(0, at), "events", ...tables.slice(at)];

    for (const table of order) {
      const meta = await targetMeta(db, table);
      const src = await source.query<{ name: string }>(
        `select column_name as name from information_schema.columns where table_schema = $1 and table_name = $2`,
        [schema, table],
      );
      if (src.rowCount === 0) {
        report.push({ table, read: 0, inserted: 0, skipped: 0, note: "not in the source" });
        continue;
      }
      const srcCols = new Set(src.rows.map((r) => r.name));
      const cols = meta.cols.filter(
        (c) => !c.generated && c.name !== "tenant_id" && srcCols.has(c.name),
      );
      const dropped = [...srcCols].filter((c) => !meta.cols.some((m) => m.name === c));
      const rows = (
        await source.query(
          `select ${cols.map((c) => q(c.name)).join(", ")} from ${q(schema)}.${q(table)}`,
        )
      ).rows;
      let inserted = 0;
      let skipped = 0;
      for (const row of rows) {
        const params: unknown[] = [options.tenantId];
        let skip = false;
        for (const c of cols) {
          let v: unknown = row[c.name];
          if (v !== null && meta.userCols.includes(c.name)) {
            v = userMap[String(v)] ?? null;
            if (v === null && c.notNull) skip = true;
          }
          params.push(v);
        }
        if (skip) {
          skipped++;
          continue;
        }
        const names = ["tenant_id", ...cols.map((c) => q(c.name))];
        const placeholders = names.map((_, i) => `$${i + 1}`);
        if (table === "events") {
          const day = new Date(String(row.starts_at)).toISOString().slice(0, 10);
          params.push(String(row.title), day, String(row.id).slice(0, 8));
          const n = params.length;
          names.push("calendar_id", "visibility", "status", "slug");
          placeholders.push(
            "public.music_calendar_id()",
            "'staff'",
            "'published'",
            `coalesce(nullif(trim(both '-' from left(regexp_replace(translate(lower($${n - 2}::text), 'áéíóöőúüű', 'aeiooouuu'), '[^a-z0-9]+', '-', 'g'), 60)), ''), 'esemeny') || '-' || $${n - 1}::text || '-' || $${n}::text`,
          );
        }
        const res = await db.query(
          `insert into ${q(table)} (${names.join(", ")}) values (${placeholders.join(", ")}) on conflict do nothing`,
          params,
        );
        inserted += res.rowCount ?? 0;
      }
      report.push({
        table,
        read: rows.length,
        inserted,
        skipped,
        ...(dropped.length > 0 && { note: `columns not in Churchy: ${dropped.join(", ")}` }),
      });
    }
    await db.query(options.dryRun ? "rollback" : "commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
  return report;
}

async function main(argv: string[]): Promise<void> {
  const arg = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const tenantId = arg("tenant");
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;
  if (!tenantId || !sourceUrl || !targetUrl) {
    throw new Error("Needs --tenant <uuid>, SOURCE_DATABASE_URL and DATABASE_URL");
  }
  if (["staging", "production"].includes(process.env.APP_ENV ?? "") && !argv.includes("--yes")) {
    throw new Error("APP_ENV is staging/production: dry-run first, then pass --yes");
  }
  const mapFile = arg("user-map");
  const source = new pg.Pool({ connectionString: sourceUrl, max: 1 });
  const target = new pg.Pool({ connectionString: targetUrl, max: 1 });
  try {
    const report = await importMusic(source, target, {
      tenantId,
      dryRun: argv.includes("--dry-run"),
      sourceSchema: arg("source-schema"),
      userMap: mapFile ? (JSON.parse(readFileSync(mapFile, "utf8")) as Record<string, string>) : {},
    });
    console.table(report);
    console.log(argv.includes("--dry-run") ? "Dry run: nothing was written." : "Imported.");
  } finally {
    await source.end();
    await target.end();
  }
}

if (process.argv[1]?.endsWith("import-music-prod.ts")) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
