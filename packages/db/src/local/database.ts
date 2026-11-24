/**
 * In-process Postgres (PGlite, WASM) for the music module's local mode: demo deployments
 * (`DEMO_MODE`, no credentials), Phase A development and e2e (docs/music-merge/PLAN.md §14).
 * One database per process: the Churchy migrations and the D-91 demo seed (fictitious data) are
 * loaded once; every demo session gets its own copies of the demo churches' tenant rows and music
 * rows under fresh tenant ids (`tenantFor`), so visitors never see each other's changes while RLS
 * keeps them apart — one PGlite per session would cost about 300 MB each.
 *
 * Never used with real data: no connection string, nothing persisted, nothing leaves the process.
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { drizzle } from "drizzle-orm/pglite";
import type { Db } from "../client";
import * as schema from "../schema";
import { demoUuid, prepareDemoDataset, seedDataset } from "../seed";
import { MUSIC_TABLES } from "../table-scopes";
import { AUTH_STUB_SQL, MIGRATION_SQL } from "./sql.generated";
import { seedLocalFile } from "./storage";

export interface LocalSqlRunner {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
export interface LocalDatabase extends LocalSqlRunner {
  transaction<T>(fn: (tx: LocalSqlRunner) => Promise<T>): Promise<T>;
  /** The tenant id that `sessionKey` uses for the demo church `fixtureTenantId` (readable id). */
  tenantFor(sessionKey: string, fixtureTenantId: string): Promise<string>;
  /** Drops the copies of a session (demo *Visszaállítás* or eviction). */
  dropSession(sessionKey: string): Promise<void>;
}

const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** A one-page PDF with a fictitious heading: the demo's PDF chart. */
function demoPdf(title: string): Uint8Array {
  const text = title.replace(/[^\x20-\x7e]/g, "?").replace(/[()\\]/g, "");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "", // contents, below
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 24 Tf 72 760 Td (${text}) Tj ET`;
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

/**
 * Fictitious files of the demo churches (music phase 2b): a PDF chart and a link on their first
 * song, the PDF in the in-memory Storage (`seedLocalFile`).
 */
async function seedSongFiles(db: PGlite): Promise<void> {
  const firsts = await db.query<{ tenant_id: string; id: string; title: string }>(
    `select distinct on (tenant_id) tenant_id, id, title from songs order by tenant_id, title`,
  );
  for (const song of firsts.rows) {
    const file = demoUuid(`demo-pdf:${song.id}`);
    const path = `${song.id}/${file}.pdf`;
    const bytes = demoPdf(song.title);
    seedLocalFile("pdfs", path, bytes, "application/pdf");
    await db.query(
      `insert into song_pdfs (tenant_id, song_id, name, file_name, path, size_bytes)
       values ($1, $2, 'Kottakép (bemutató)', 'kotta-bemutato.pdf', $3, $4)`,
      [song.tenant_id, song.id, path, bytes.byteLength],
    );
    await db.query(
      `insert into song_links (tenant_id, song_id, name, url) values ($1, $2, 'Felvétel (példa)', 'https://example.org/felvetel')`,
      [song.tenant_id, song.id],
    );
  }
}

/** The session key of the shared default data (no demo session). */
export const DEFAULT_SESSION = "default";
/** Sessions with their own copies; the least recently used one is dropped beyond this. */
const MAX_SESSIONS = 100;

/** Database id of a fixture id (users → profiles, tenants), as the seed maps them. */
export const localId = demoUuid;

async function migrate(db: PGlite): Promise<void> {
  // PGlite has ICU but not the predefined ICU collations of a full build.
  await db.exec(`CREATE COLLATION IF NOT EXISTS "hu-HU-x-icu" (provider = icu, locale = 'hu-HU')`);
  await db.exec(AUTH_STUB_SQL);
  for (const { statements } of MIGRATION_SQL) {
    for (const statement of statements) await db.exec(statement);
  }
}

async function create(now: Date): Promise<LocalDatabase> {
  const db = new PGlite({ extensions: { unaccent, btree_gist, pg_trgm } });
  await migrate(db);
  const orm = drizzle(db, { schema, casing: "snake_case" });
  await seedDataset(orm as unknown as Db, prepareDemoDataset(now));
  await seedSongFiles(db);

  const tableColumns = new Map<string, string[]>();
  const columnsOf = async (tx: Pick<PGlite, "query">, table: string) => {
    let cols = tableColumns.get(table);
    if (!cols) {
      const res = await tx.query<{ name: string }>(
        `select a.attname as name from pg_attribute a join pg_class c on c.oid = a.attrelid
          where c.relname = $1 and c.relnamespace = 'public'::regnamespace and a.attnum > 0
            and not a.attisdropped and a.attgenerated = '' order by a.attnum`,
        [table],
      );
      tableColumns.set(table, (cols = res.rows.map((r) => r.name)));
    }
    return cols;
  };

  const sessions = new Map<string, Map<string, Promise<string>>>();

  const dropSession = async (key: string) => {
    const copies = sessions.get(key);
    sessions.delete(key);
    if (!copies) return;
    const ids = await Promise.all([...copies.values()].map((p) => p.catch(() => null)));
    await db.query(`delete from tenants where id = any($1::uuid[])`, [ids.filter(Boolean)]);
  };

  /** Copies the tenant row and its music rows under fresh ids (`mapped`). */
  const copyTenant = async (key: string, source: string, target: string) => {
    const mapped = (id: string) => demoUuid(`session:${key}:${id}`);
    await db.transaction(async (tx) => {
      // Skips FK triggers while the rows go in table by table (superuser, same transaction).
      await tx.query(`set local session_replication_role = replica`);
      const tables = ["tenants", ...MUSIC_TABLES];
      const rowsByTable = new Map<string, Record<string, unknown>[]>();
      const known = new Set<string>([source]);
      for (const table of tables) {
        const col = table === "tenants" ? "id" : "tenant_id";
        const res = await tx.query<{ r: Record<string, unknown> }>(
          `select to_jsonb(t) as r from ${table} t where ${col} = $1`,
          [source],
        );
        const rows = res.rows.map((x) => x.r);
        for (const row of rows) if (typeof row.id === "string") known.add(row.id);
        rowsByTable.set(table, rows);
      }
      const map = (value: unknown): unknown => {
        if (typeof value === "string") {
          if (value === source) return target;
          if (known.has(value)) return mapped(value);
          // Storage paths name their song (`<song_id>/<file>.pdf`).
          return value.replace(UUIDS, (u) => (known.has(u) ? mapped(u) : u));
        }
        if (Array.isArray(value)) return value.map(map);
        if (value !== null && typeof value === "object") {
          return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, map(v)]));
        }
        return value;
      };
      for (const [table, rows] of rowsByTable) {
        if (rows.length === 0) continue;
        const copies = rows.map((row) => {
          const copy = map(row) as Record<string, unknown>;
          // Unique, readable columns of a church get a session suffix.
          if (table === "tenants") copy.slug = `${String(row.slug)}-${target.slice(0, 8)}`;
          return copy;
        });
        const cols = (await columnsOf(tx, table)).map((c) => `"${c}"`).join(", ");
        await tx.query(
          `insert into ${table} (${cols}) select ${cols} from jsonb_populate_recordset(null::${table}, $1::jsonb)`,
          [JSON.stringify(copies)],
        );
      }
    });
  };

  return {
    query: (sql, params) => db.query(sql, params),
    transaction: (fn) =>
      db.transaction((tx) => fn({ query: (sql, params) => tx.query(sql, params) })),
    dropSession,
    async tenantFor(key, fixtureTenantId) {
      const source = demoUuid(fixtureTenantId);
      if (key === DEFAULT_SESSION) return source;
      let copies = sessions.get(key);
      if (copies) {
        sessions.delete(key); // re-insert: most recently used last
      } else {
        copies = new Map();
        if (sessions.size >= MAX_SESSIONS) {
          const oldest = sessions.keys().next().value;
          if (oldest !== undefined) await dropSession(oldest);
        }
      }
      sessions.set(key, copies);
      let target = copies.get(source);
      if (!target) {
        const id = demoUuid(`session:${key}:${source}`);
        target = copyTenant(key, source, id).then(() => id);
        copies.set(source, target);
        target.catch(() => copies!.delete(source));
      }
      return target;
    },
  };
}

const KEY = Symbol.for("churchy.db.localDatabase");
type GlobalWithDb = typeof globalThis & { [KEY]?: Promise<LocalDatabase> };

/** The process-wide local database (created on first use; kept across dev hot reloads). */
export function localDatabase(now: Date = new Date()): Promise<LocalDatabase> {
  const g = globalThis as GlobalWithDb;
  g[KEY] ??= create(now).catch((error: unknown) => {
    delete g[KEY];
    throw error;
  });
  return g[KEY];
}
