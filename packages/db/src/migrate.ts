/**
 * Versioned migrations (D-02 AC1). `up` is Drizzle's migrator over `migrations/*.sql` (generated
 * by `drizzle-kit generate`, hand-written where Drizzle cannot express the SQL). Drizzle has no
 * down migrations, so every migration has a hand-written counterpart in `migrations/down/` with
 * the same tag; `down` runs the newest applied one and removes its journal row, so the next `up`
 * re-applies it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";
import { createDb } from "./client";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url));
export const MIGRATIONS_SCHEMA = "drizzle";
export const MIGRATIONS_TABLE = "__drizzle_migrations";

type JournalEntry = { idx: number; when: number; tag: string };

export function readJournal(folder: string = MIGRATIONS_FOLDER): JournalEntry[] {
  const raw = readFileSync(`${folder}/meta/_journal.json`, "utf8");
  return (JSON.parse(raw) as { entries: JournalEntry[] }).entries;
}

/** Splits a migration file on Drizzle's `--> statement-breakpoint` markers. */
export function splitStatements(source: string): string[] {
  return source
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.replace(/--[^\n]*\n?/g, "").trim() !== "");
}

export function readDownMigration(tag: string, folder: string = MIGRATIONS_FOLDER): string[] {
  return splitStatements(readFileSync(`${folder}/down/${tag}.sql`, "utf8"));
}

export async function migrateUp(pool: pg.Pool): Promise<void> {
  await migrate(createDb(pool), {
    migrationsFolder: MIGRATIONS_FOLDER,
    migrationsSchema: MIGRATIONS_SCHEMA,
    migrationsTable: MIGRATIONS_TABLE,
  });
}

/** Tags of the applied migrations, oldest first. */
export async function appliedMigrations(pool: pg.Pool): Promise<string[]> {
  const exists = await pool.query<{ ok: boolean }>(`select to_regclass($1) is not null as ok`, [
    `${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`,
  ]);
  if (!exists.rows[0]?.ok) return [];
  const rows = await pool.query<{ created_at: string }>(
    `select created_at from "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" order by created_at`,
  );
  const byWhen = new Map(readJournal().map((e) => [String(e.when), e.tag]));
  return rows.rows.map((r) => byWhen.get(String(r.created_at)) ?? `unknown@${r.created_at}`);
}

/** Reverts the newest `steps` applied migrations (each in its own transaction). */
export async function migrateDown(pool: pg.Pool, steps = 1): Promise<string[]> {
  const journal = readJournal();
  const reverted: string[] = [];
  for (let i = 0; i < steps; i++) {
    const applied = await appliedMigrations(pool);
    const tag = applied.at(-1);
    if (tag === undefined) break;
    const entry = journal.find((e) => e.tag === tag);
    if (entry === undefined) throw new Error(`Applied migration ${tag} is not in the journal`);
    const statements = readDownMigration(tag);
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const statement of statements) await client.query(statement);
      await client.query(
        `delete from "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" where created_at = $1`,
        [entry.when],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    reverted.push(tag);
  }
  return reverted;
}

/** Reverts every applied migration. */
export async function migrateReset(pool: pg.Pool): Promise<string[]> {
  const applied = await appliedMigrations(pool);
  return migrateDown(pool, applied.length);
}
