# @churchy/db

Drizzle schema, versioned SQL migrations and the demo seed (D-02, SDD §8.2, §19, §21–§26).
Database: **Supabase Postgres 17** (SDD §3). The DB adapter base and the first DB repositories are
D-90 [BE] (see [DB adapter](#db-adapter-d-90-be)); further modules follow in S2–S7.

```bash
pnpm --filter @churchy/db db:generate      # drizzle-kit: diff src/schema → migrations/NNNN_*.sql (no DB)
pnpm --filter @churchy/db db:check         # drizzle-kit consistency check of migrations/meta
pnpm --filter @churchy/db db up            # apply pending migrations   (DATABASE_URL from env)
pnpm --filter @churchy/db db down [n]      # revert the newest n migrations (default 1)
pnpm --filter @churchy/db db reset         # revert all
pnpm --filter @churchy/db db status
pnpm --filter @churchy/db db auth-stub     # plain Postgres only: minimal auth.users (never on Supabase)
pnpm --filter @churchy/db db seed          # D-91 demo fixtures (refused when APP_ENV=production)
TEST_DATABASE_URL=… pnpm --filter @churchy/db test   # + integration tests on a DISPOSABLE database
TEST_DATABASE_URL=… pnpm test:isolation              # D-03 RLS catalog check + tenant isolation suite
DATABASE_URL=… pnpm test:contract                    # D-90 contract suites: mock + DB adapter (DISPOSABLE db)
```

## Migrations

| File                       | Source                    | Content                                                                                             |
| -------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| `0000_extensions.sql`      | hand-written (`--custom`) | `unaccent`, `btree_gist` (schema `extensions`), checks for `hu-HU-x-icu` + `hungarian`, SQL helpers |
| `0001_schema.sql`          | `drizzle-kit generate`    | enums, 59 tables, indexes, checks, FKs, `ENABLE ROW LEVEL SECURITY`                                 |
| `0002_constraints.sql`     | hand-written (`--custom`) | `bookings_no_overlap` exclusion constraint, `profiles.id → auth.users(id)`                          |
| `0003_rls.sql`             | hand-written (`--custom`) | role `churchy_app`, `app.current_tenant_id()`, FORCE RLS, per-table policies + grants (D-03)        |
| `0004_tenant_claim.sql`    | hand-written (`--custom`) | `app.current_tenant_id()` also reads the `tenant_id` claim of `churchy` JWTs (music, ADR-20)        |
| `0005_music_functions.sql` | hand-written (`--custom`) | pg_trgm, `simple_unaccent`, helper functions of the music tables' generated columns/CHECKs          |
| `0006_music_schema.sql`    | `drizzle-kit generate`    | music tables (`src/schema/music.ts`); replaces Churchy's `songs` / `arrangements`                   |
| `0007_music_rls.sql`       | hand-written (`--custom`) | role `churchy_music`, RLS + grants of the music tables, SET NULL (col) FKs, partial/deferrable keys |
| `0025`–`0027`              | hand-written + generated  | platform role (0025, 0026), site builder drafts + fresh-tenant seeding grants (0027, SDD ADR-21)    |
| `down/<tag>.sql`           | hand-written              | Drizzle has no down migrations; `db down` runs these and removes the journal row                    |

Change the schema in `src/schema/*.ts`, run `db:generate`, commit the SQL **and** add the matching
`down/<tag>.sql`. CI (job _Database_) fails on drift, runs `up → down → up`, the live schema checks
and the seed against `postgres:17`.

## Conventions

- **Tenancy (SDD §4.2).** Every tenant-owned table has `tenant_id uuid not null` (FK → `tenants`,
  cascade) and an index on it; `src/table-scopes.ts` classifies every table (`tenant`, `catalog`,
  `platform`) and the schema check fails on an unclassified table. References between tenant tables
  are composite FKs `(tenant_id, x_id) → parent(tenant_id, id)`, so a row can never point at another
  tenant's row.
- **RLS (D-03).** See [Row-level security](#row-level-security-d-03) below.
- **Context.** `withContext(db, ctx, fn)` opens a transaction and sets `app.tenant_id` / `app.org_id`
  with `set_config(…, true)` (transaction-local, safe behind the Supabase transaction pooler). A ctx
  never carries both.
- **Auth.** Supabase Auth owns `auth.users` (credentials, MFA, sessions). The app's `profiles` row is
  keyed on the auth user id (FK, cascade). `memberships`, `org_memberships`, `notifications` etc.
  reference `profiles`.
- **Hungarian.** Name/title columns use `text COLLATE "hu-HU-x-icu"`. `posts.search` and
  `songs.search` are generated `tsvector`s built with `public.hu_tsvector()` (= `to_tsvector('hungarian',
unaccent(…))` through an IMMUTABLE wrapper); query with `search @@ public.hu_tsquery('ujev')`.
- **Encryption.** Special-category content exists only as `*_enc bytea` (pastoral requests, HR
  tickets/messages/approval comments). Encryption itself is D-30.
- **Casing.** Drizzle keys are camelCase, columns snake_case (`casing: "snake_case"`).

## Row-level security (D-03)

SDD §4.2, §25.7. Migration `0003_rls.sql`, checked by `src/rls.ts` and `src/isolation.db.test.ts`.

**Roles.**

| Role                                         | Used by                                                              | RLS                                                                                                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| migration role (Supabase `postgres`, CI su.) | `db up/down/seed`; owns all tables                                   | bypasses (superuser / BYPASSRLS) — never used by the app                                                                                                                                         |
| `churchy_app`                                | the app (Drizzle, `DATABASE_URL`)                                    | **subject to every policy**: no SUPERUSER, no BYPASSRLS, not the owner, NOINHERIT                                                                                                                |
| `churchy_music`                              | music module via PostgREST (JWT)                                     | subject to the policies of `MUSIC_TABLES` only; no grant on any other table (`0007_music_rls`)                                                                                                   |
| `churchy_platform`                           | platform DB (`apps/web/server/platform-db`, `DATABASE_URL_PLATFORM`) | no SUPERUSER, no BYPASSRLS, NOINHERIT, not the owner; reads platform tables + host-lookup columns of `domains`, **INSERT-only** church bootstrap, never reads church data (`0025_platform_role`) |
| `anon`, `authenticated` (Supabase PostgREST) | nothing — Churchy uses no PostgREST                                  | all grants on `public` and their default privileges revoked; no policy names them                                                                                                                |

The migration creates `churchy_app` as **NOLOGIN**. To let the app connect, an operator runs
`ALTER ROLE churchy_app LOGIN PASSWORD '…'` out-of-band (Supabase SQL editor / secrets manager) and
puts the resulting URL into the deployment's `DATABASE_URL`. The password is never in git, a
migration or a log. The migration role's URL is only used for migrations and the seed.

**Platform role (`0025_platform_role`, narrowed by `0026_platform_role_narrow`: no billing_accounts/subscriptions access).** Host → tenant resolution, profile bootstrap, plan
lookups and church creation have no tenant context, so they use `churchy_platform` (NOLOGIN, NOINHERIT,
NOBYPASSRLS). The owner creates a login role out-of-band (`churchy_platform_login`, see
`docs/runbooks/supabase-dev-setup.md`). The exact grants are `PLATFORM_ROLE_ACCESS` in
`src/table-scopes.ts`; `rlsViolations()` fails when the live grants or policies differ:

| Table                                                | Grant                                                                     | Policy (all `TO churchy_platform`, PERMISSIVE)                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plans`, `organizations`, `org_memberships`, `deals` | SELECT                                                                    | `platform_read`                                                                                                                                  |
| `tenants`, `profiles`, `subscriptions`               | SELECT, INSERT                                                            | `platform_read`; `platform_insert` (tenants: free plan, active, no workspace/organization, not launched; subscriptions: free plan, fresh tenant) |
| `billing_accounts`, `audit_log`                      | INSERT                                                                    | `platform_insert` (billing: tenant owner, fresh tenant)                                                                                          |
| `memberships`, `people`                              | INSERT                                                                    | `platform_insert` (role `owner` / linked person; **fresh tenant only**: not launched, created < 10 min ago)                                      |
| `domains`                                            | SELECT of `tenant_id, hostname, is_primary, verified_at, tls_status` only | `platform_host_lookup`                                                                                                                           |

No UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER anywhere, no SELECT on any other tenant or
catalog table, no `SECURITY DEFINER` function. Host lookup uses a column grant plus a policy on
`domains` rather than a view: a view would run with its owner's rights (the migration role bypasses
RLS), the catalog check could not see what it exposes, and the isolation suite verifies columns
and policies directly.

**Policies.** RLS is enabled **and forced** on every `public` table.

| Scope (`table-scopes.ts`) | Grant to `churchy_app`         | Policies                                                                                                 |
| ------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `tenant`                  | SELECT, INSERT, UPDATE, DELETE | `tenant_isolation` FOR ALL: `USING` + `WITH CHECK` `tenant_id = (SELECT app.current_tenant_id())`        |
| `catalog`                 | SELECT, INSERT, UPDATE, DELETE | `tenant_isolation` as above + `catalog_read` FOR SELECT: platform rows, **only inside a tenant context** |
| `platform`                | none                           | none for `churchy_app` — denied by default; `churchy_platform` has its own narrow policies (above)       |

`app.current_tenant_id()` returns `app.tenant_id` as uuid, `NULL` without a context (⇒ 0 rows,
writes rejected) and **raises** (`42501`) when `app.tenant_id` and `app.org_id` are both set.
`churchy_app` also has `USAGE` on schema `extensions` (the generated search columns call
`unaccent`).

**HR tables** (`HR_TABLES`) have the same `tenant_isolation` policy. The diocesan `app.org_id`
branch (SDD §25.7) is added in **D-84** as a separate permissive policy on these tables only; until
then a diocesan (org-only) session reads 0 rows everywhere. The RLS check allows extra policies on
`HR_TABLES` only.

**Adding a table.** Classify it in `src/table-scopes.ts`; for a tenant/catalog table add, in the
same migration, `ALTER TABLE … FORCE ROW LEVEL SECURITY`, the grant and the canonical
`tenant_isolation` policy (copy from `0003_rls.sql`), and their reverse in `down/<tag>.sql`. The
suite then covers it automatically; it fails when the table is unclassified, not forced, lacks the
policy, has a non-canonical one, has rows for fewer than two test tenants (add fixtures in
`supplementFixtures()`), or grants anything to `anon` / `authenticated` / `PUBLIC`.

**Isolation suite** (`pnpm test:isolation`, also part of the CI _Database_ job). Seeds the demo
tenants and, connected as `churchy_app`, checks for **every** tenant and catalog table: cross-tenant
SELECT returns 0 rows, INSERT for another tenant and moving a row to another tenant are rejected by
RLS, UPDATE/DELETE of the other tenant's rows affect 0 rows (with positive controls on the own
rows); no context and org-only contexts read 0 rows; both settings together raise; platform tables
and the PostgREST roles get `permission denied`; the catalog check (`rlsViolations`) is empty and
reports fixture tables without a (canonical) policy.

**Object storage.** Keys are `t/<tenant_id>/…`: build them with `tenantStorageKey(ctx, …)` and
check every incoming key with `assertTenantStorageKey(ctx, key)` (rejects other tenants, missing
prefix, `..`, empty segments, `\`, `%`, control characters, org/platform contexts).

## DB adapter (D-90 [BE])

SDD §4.4. `src/adapter/` implements the contract repositories (`@churchy/contracts`) on Postgres.
Switching a further module: [`docs/runbooks/switch-module-to-db.md`](../../docs/runbooks/switch-module-to-db.md).

| Module          | Repository        | Since |
| --------------- | ----------------- | ----- |
| `locations`     | `dbLocations`     | D-90  |
| `announcements` | `dbAnnouncements` | D-90  |

**Adapter base** (`src/adapter/base.ts`, `createDbAdapterBase(db)`). Repositories only query
through it:

- `run(ctx, fn)` — one transaction per repository call (`withContext`), `app.tenant_id` /
  `app.org_id` set transaction-locally from the ctx. The ctx is validated **before** a connection
  is taken: a missing/malformed ctx or one with both `tenantId` and `orgId` throws `CONTEXT`.
- `read(ctx, empty, fn)` — tenant-scoped read; organization/platform contexts get `empty`.
- `write(ctx, fn)` — tenant-scoped write; `CONTEXT` without a tenant ctx, `FORBIDDEN` when anonymous.
- Before the first query it checks that the connected role is neither superuser nor BYPASSRLS
  (`assertAppRole`) and throws `UnsafeDatabaseRoleError` otherwise — the app must connect as
  `churchy_app`, so a wrong `DATABASE_URL` cannot switch tenant isolation off.
- Errors are mapped by `mapDbError` (`src/adapter/errors.ts`): unique/exclusion → `CONFLICT`,
  foreign key and RLS `WITH CHECK` → `NOT_FOUND` (no existence leak), not-null/check/bad value →
  `VALIDATION`, other privilege errors → `FORBIDDEN`; anything else becomes a `DbAdapterError`
  with only the SQLSTATE, constraint and table (never the driver message, which can hold row
  values). Non-uuid ids are "not found" (`asUuid` / `requireUuid`), never sent to Postgres.

**Registry.** `@churchy/db/register` (`registerDbAdapter()`) registers a `db` factory for every
module in `DB_MODULES`; the pool is created from `DATABASE_URL` on first use. Only
`apps/web/server/data-adapters.ts` imports it; it then calls `adapterRegistry.assertAvailable()`,
so `DATA_ADAPTER_<MODULE>=db` for a module without a DB adapter stops the app at start-up. Every
module not set to `db` stays on the mock adapter.

**Contract suites** (`src/db.contract.test.ts`, part of `pnpm test:contract` and of this package's
tests). With `DATABASE_URL` (or `TEST_DATABASE_URL`) pointing at a disposable database it applies
the auth stub if needed, migrates, loads the contract fixtures (`contractDataset()` from
`@churchy/data-mock/testing`, ids mapped like the seed, `seedDataset`) as the migration role, and
runs the suite of every module in `DB_MODULES` with repositories connected as **`churchy_app`**
(`-c role=churchy_app`, RLS on); the other modules are reported as skipped. Without a database the
file is skipped, unless `REQUIRE_TEST_DATABASE=1` (CI job _Database_), which fails it.

```bash
DATABASE_URL=postgresql://postgres@localhost:5432/churchy_test pnpm --filter @churchy/db db auth-stub
DATABASE_URL=postgresql://postgres@localhost:5432/churchy_test pnpm test:contract
```

## Demo seed

`db seed` loads `createDemoDataset(now)` from `@churchy/data-mock` — the same fixtures the mock adapter
serves — after validating every row with the contract Zod schemas (before and after id mapping).
Readable fixture ids become deterministic UUIDv5s (`seedId("t-szenttivadar")`), so re-seeding is
repeatable: the demo tenants, billing accounts and diocese are deleted (cascade) and re-inserted. Demo
users get a credential-less `auth.users` row. Without a D-30 encryptor the encrypted collections
(pastoral requests, HR tickets, messages, approvals) are **skipped**, never written as plaintext.

## Schema ↔ contract differences

In addition to the deviations listed in `packages/contracts/README.md`:

1. `users` → **`profiles`** keyed on `auth.users.id`; no `password_hash` / `totp_secret_enc` (Supabase
   Auth); `two_factor_enabled` mirrors the Supabase MFA state (D-04).
2. Ids are `uuid`; the mock's readable ids are mapped by the seed.
3. `availability_blocks` `from`/`to` → `from_at`/`to_at`; `locations.geo` is `point` (x = lng, y = lat).
4. `Song.hymnalRefs` is the table `song_hymnal_refs` (with `tenant_id`).
5. Encrypted columns: `data_enc`, `notes_enc` (pastoral requests); `subject_enc`, `data_enc`,
   `handover_enc` (HR tickets — `handover_enc` is new: the _Átadás_ summary is sensitive);
   `body_enc`; `comment_enc`.
6. `bookings.blocked_period` is a generated `tstzrange` (incl. buffers) for the exclusion constraint.
7. `tenants.plan_key` is the `plan_key` enum with an FK to `plans` (contract: string).
8. `absences.working_days` and `leave_entitlements.days_total`/`carried_over` are `numeric(6,1)`;
   `service_rules.time` is `time` — the adapter maps these to numbers / `HH:mm`.
9. `hymnals` and `plan_templates` have a nullable `tenant_id` (platform catalog rows).
10. `events.group_id` has no FK yet (groups are P1); `hr_categories.template_id` likewise (D-86).
11. DB-internal tables without a contract entity: `payment_events` (§19.2) and `audit_log` (§8.2, with
    `actor_user_id` / `actor_org_id`).
12. `media.storage_key` is not unique (the demo shares placeholder files).
