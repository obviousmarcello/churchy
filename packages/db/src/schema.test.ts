import { existsSync, readFileSync } from "node:fs";
import { getTableConfig, isPgEnum, PgTable, type PgColumn } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_FOLDER, readDownMigration, readJournal, splitStatements } from "./migrate";
import * as schema from "./schema";
import { HU_COLLATION } from "./schema/columns";
import { HR_TABLES, MUSIC_TABLES, TABLE_SCOPES, tablesWithScope } from "./table-scopes";

const tables = (Object.values(schema) as unknown[])
  .filter((v): v is PgTable => v instanceof PgTable)
  .map((t) => getTableConfig(t));
const enums = (Object.values(schema) as unknown[]).filter(isPgEnum);
const byName = new Map(tables.map((t) => [t.name, t]));

/** Column keys are camelCase; the DB name is snake_case (`casing: "snake_case"`). */
const snake = (s: string) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

const column = (table: string, name: string): PgColumn | undefined =>
  byName.get(table)?.columns.find((c) => snake(c.name) === name);

/** True when the table has an index, PK or unique key whose first column is `tenant_id`. */
function tenantIdIsIndexed(table: string): boolean {
  const t = byName.get(table)!;
  const first = (cols: { name?: string }[]) => snake(cols[0]?.name ?? "") === "tenant_id";
  return (
    t.indexes.some((i) => first(i.config.columns as { name?: string }[])) ||
    t.primaryKeys.some((pk) => first(pk.columns)) ||
    t.uniqueConstraints.some((u) => first(u.columns))
  );
}

describe("schema check: table classification (SDD §4.2)", () => {
  it("classifies every table of the schema, and nothing else", () => {
    expect(tables.map((t) => t.name).sort()).toEqual(Object.keys(TABLE_SCOPES).sort());
  });

  it("every tenant table has a non-null, indexed tenant_id", () => {
    const tenantTables = tablesWithScope("tenant");
    expect(tenantTables.length).toBeGreaterThan(40);
    for (const name of tenantTables) {
      const tenantId = column(name, "tenant_id");
      expect(tenantId, `${name}.tenant_id`).toBeDefined();
      expect(tenantId!.notNull, `${name}.tenant_id not null`).toBe(true);
      expect(tenantId!.getSQLType(), `${name}.tenant_id type`).toBe("uuid");
      expect(tenantIdIsIndexed(name), `${name}: index on tenant_id`).toBe(true);
    }
  });

  it("catalog tables have a nullable tenant_id (platform rows + tenant rows)", () => {
    for (const name of tablesWithScope("catalog")) {
      const tenantId = column(name, "tenant_id");
      expect(tenantId, name).toBeDefined();
      expect(tenantId!.notNull, name).toBe(false);
    }
  });

  it("platform tables never own rows by tenant (tenant_id, if any, is an optional reference)", () => {
    for (const name of tablesWithScope("platform")) {
      const tenantId = column(name, "tenant_id");
      if (tenantId !== undefined) expect(tenantId.notNull, name).toBe(false);
    }
  });

  it("HR delegation tables are tenant tables", () => {
    for (const name of HR_TABLES) expect(TABLE_SCOPES[name]).toBe("tenant");
  });

  it("enables row-level security on every table (Supabase: all public tables)", () => {
    for (const t of tables) expect(t.enableRLS, t.name).toBe(true);
  });

  it("tenant → tenant foreign keys include tenant_id (no cross-tenant references)", () => {
    let composite = 0;
    for (const t of tables) {
      for (const fk of t.foreignKeys) {
        const ref = fk.reference();
        const target = getTableConfig(ref.foreignTable).name;
        expect(byName.has(target), `${t.name} → ${target}`).toBe(true);
        const local = ref.columns.map((c) => snake(c.name));
        const childIsTenant = TABLE_SCOPES[t.name as keyof typeof TABLE_SCOPES] === "tenant";
        const parentIsTenant = TABLE_SCOPES[target as keyof typeof TABLE_SCOPES] === "tenant";
        if (childIsTenant && parentIsTenant) {
          expect(local[0], `${t.name} → ${target} (${local.join(", ")})`).toBe("tenant_id");
          composite++;
        }
      }
    }
    expect(composite).toBeGreaterThan(60);
  });
});

describe("schema check: shared tables in their final shape (ADR-16)", () => {
  const has = (table: string, cols: string[]) => {
    for (const c of cols) expect(column(table, c), `${table}.${c}`).toBeDefined();
  };

  it("people carries the workspace fields, login link, public flag, contact visibility and skills", () => {
    has("people", [
      "user_id",
      "is_public",
      "contact_visibility",
      "skills",
      "staff_group",
      "is_minor",
      "guardian_email",
      "active",
    ]);
  });

  it("events carries calendar_id and visibility", () => {
    has("events", ["calendar_id", "visibility", "status", "rrule", "parent_event_id"]);
    expect(column("events", "calendar_id")!.notNull).toBe(true);
  });

  it("calendars, teams, team_members and team_positions exist", () => {
    has("calendars", ["kind", "owner_person_id", "team_id", "default_visibility", "editors"]);
    has("teams", ["kind", "calendar_id"]);
    has("team_members", ["team_id", "person_id", "is_leader", "position_ids"]);
    has("team_positions", ["team_id", "min_count", "max_count"]);
  });
});

describe("schema check: Hungarian text (L-03, L-09)", () => {
  it("sorts every name/title column with the hu-HU-x-icu collation", () => {
    const sortColumns = ["name", "title", "family_name", "given_name"];
    let checked = 0;
    for (const t of tables) {
      for (const c of t.columns.filter((col) => sortColumns.includes(snake(col.name)))) {
        expect(c.getSQLType(), `${t.name}.${c.name}`).toBe(`text COLLATE "${HU_COLLATION}"`);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("has generated search vectors on posts and arrangements (SDD §8.2, music module)", () => {
    for (const [table, name] of [
      ["posts", "search"],
      ["arrangements", "search_vector"],
    ] as const) {
      const search = column(table, name)!;
      expect(search.getSQLType()).toBe("tsvector");
      expect(search.generated?.type).toBe("always");
    }
  });

  it("stores special-category content only in *_enc bytea columns (§8.3, §25.1)", () => {
    const encrypted = {
      pastoral_requests: ["data_enc", "notes_enc"],
      hr_tickets: ["subject_enc", "data_enc", "handover_enc"],
      hr_ticket_messages: ["body_enc"],
      hr_approvals: ["comment_enc"],
    };
    for (const [table, cols] of Object.entries(encrypted)) {
      for (const c of cols) expect(column(table, c)?.getSQLType(), `${table}.${c}`).toBe("bytea");
      for (const plain of ["data", "notes", "subject", "body", "comment", "handover"]) {
        expect(column(table, plain), `${table}.${plain} must not exist`).toBeUndefined();
      }
    }
  });
});

describe("migrations", () => {
  const journal = readJournal();

  it("are versioned, in order, and every one has a down migration", () => {
    expect(journal.map((e) => e.tag)).toEqual([
      "0000_extensions",
      "0001_schema",
      "0002_constraints",
      "0003_rls",
      "0004_tenant_claim",
      "0005_music_functions",
      "0006_music_schema",
      "0007_music_rls",
      "0008_music_songs",
      "0009_music_files",
      "0010_music_sheet",
      "0011_music_events",
    ]);
    for (const e of journal) {
      expect(existsSync(`${MIGRATIONS_FOLDER}/${e.tag}.sql`), e.tag).toBe(true);
      expect(readDownMigration(e.tag).length, `down/${e.tag}`).toBeGreaterThan(0);
    }
  });

  it("down of 0001 / 0006 / 0008 drops every table and enum of the schema", () => {
    const down = [
      readDownMigration("0008_music_songs"),
      readDownMigration("0006_music_schema"),
      readDownMigration("0001_schema"),
    ]
      .flat()
      .join("\n");
    for (const t of tables) expect(down, t.name).toContain(`DROP TABLE IF EXISTS "${t.name}"`);
    for (const e of enums) expect(down, e.enumName).toContain(`"public"."${e.enumName}"`);
  });

  it("install unaccent and btree_gist and check the Hungarian collation and search config", () => {
    const sql = readFileSync(`${MIGRATIONS_FOLDER}/0000_extensions.sql`, "utf8");
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS unaccent");
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS btree_gist");
    expect(sql).toContain("hu-HU-x-icu");
    expect(sql).toContain("'hungarian'");
  });

  it("create the booking exclusion constraint and the auth.users link", () => {
    const sql = readFileSync(`${MIGRATIONS_FOLDER}/0002_constraints.sql`, "utf8");
    expect(sql).toMatch(/EXCLUDE USING gist \("room_id" WITH =, "blocked_period" WITH &&\)/);
    expect(sql).toContain(`REFERENCES "auth"."users"("id") ON DELETE CASCADE`);
  });

  describe("RLS policies (D-03; the live catalog is checked by isolation.db.test.ts)", () => {
    const all = journal
      .map((e) => readFileSync(`${MIGRATIONS_FOLDER}/${e.tag}.sql`, "utf8"))
      .join("\n");
    const down = [
      readDownMigration("0008_music_songs"),
      readDownMigration("0007_music_rls"),
      readDownMigration("0003_rls"),
    ]
      .flat()
      .join("\n");
    const tenantExpr = "tenant_id = (SELECT app.current_tenant_id())";
    /** Music tables are granted to churchy_music too (0007_music_rls); no other table is. */
    const roles = (t: string) =>
      (MUSIC_TABLES as readonly string[]).includes(t)
        ? "churchy_app, churchy_music"
        : "churchy_app";

    it("every tenant and catalog table gets the tenant_isolation policy and a grant", () => {
      for (const t of [...tablesWithScope("tenant"), ...tablesWithScope("catalog")]) {
        expect(all, t).toContain(
          `CREATE POLICY "tenant_isolation" ON "${t}" AS PERMISSIVE FOR ALL TO ${roles(t)}\n` +
            `  USING (${tenantExpr})\n  WITH CHECK (${tenantExpr});`,
        );
        expect(all, t).toContain(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "${t}" TO ${roles(t)};`,
        );
        expect(down, t).toContain(`DROP POLICY IF EXISTS "tenant_isolation" ON "${t}";`);
      }
      for (const t of tablesWithScope("catalog")) {
        expect(all, t).toContain(`CREATE POLICY "catalog_read" ON "${t}"`);
      }
    });

    it("forces RLS on every table", () => {
      for (const t of tables) {
        expect(all, t.name).toContain(`ALTER TABLE "${t.name}" FORCE ROW LEVEL SECURITY;`);
        expect(down, t.name).toContain(`ALTER TABLE "${t.name}" NO FORCE ROW LEVEL SECURITY;`);
      }
    });

    it("grants churchy_music the music tables only", () => {
      const granted = [...all.matchAll(/ON TABLE "(\w+)" TO [^;]*churchy_music;/g)].map(
        (m) => m[1],
      );
      expect(granted.sort()).toEqual([...MUSIC_TABLES].sort());
      expect(all).toMatch(/CREATE ROLE churchy_music NOLOGIN NOSUPERUSER[^;]* NOBYPASSRLS;/);
    });

    it("never grants a platform table to the app role", () => {
      for (const t of tablesWithScope("platform")) {
        expect(all, t).not.toMatch(new RegExp(`ON TABLE "${t}" TO churchy_app`));
        expect(all, t).not.toMatch(new RegExp(`CREATE POLICY [^\\n]* ON "${t}"`));
      }
    });

    it("creates the app role without BYPASSRLS and revokes the Supabase PostgREST grants", () => {
      expect(all).toMatch(/CREATE ROLE churchy_app NOLOGIN NOSUPERUSER[^;]* NOBYPASSRLS;/);
      expect(all).toContain("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I");
      expect(all).toContain("ARRAY['anon', 'authenticated']");
      const code = all.replace(/--[^\n]*/g, ""); // SQL without comments
      expect(code).not.toMatch(/(?<!NO)BYPASSRLS/);
      expect(code).not.toMatch(/(?<!NO)SUPERUSER/);
    });

    it("HR tables get the same tenant policy (the D-84 org branch is a separate policy)", () => {
      for (const t of HR_TABLES)
        expect(all, t).toContain(`CREATE POLICY "tenant_isolation" ON "${t}"`);
    });
  });

  it("splitStatements drops comment-only chunks", () => {
    expect(splitStatements("-- a\nSELECT 1;\n--> statement-breakpoint\n-- only\n")).toEqual([
      "-- a\nSELECT 1;",
    ]);
  });
});
