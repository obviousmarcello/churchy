# @churchy/db

Drizzle schema, versioned SQL migrations and the demo seed (D-02, SDD §8.2, §19, §21–§26).
Database: **Supabase Postgres 17** (SDD §3). DB adapters per module follow in S1–S7.

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
```

## Migrations

| File                   | Source                    | Content                                                                                             |
| ---------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| `0000_extensions.sql`  | hand-written (`--custom`) | `unaccent`, `btree_gist` (schema `extensions`), checks for `hu-HU-x-icu` + `hungarian`, SQL helpers |
| `0001_schema.sql`      | `drizzle-kit generate`    | enums, 59 tables, indexes, checks, FKs, `ENABLE ROW LEVEL SECURITY`                                 |
| `0002_constraints.sql` | hand-written (`--custom`) | `bookings_no_overlap` exclusion constraint, `profiles.id → auth.users(id)`                          |
| `0003_rls.sql`         | hand-written (`--custom`) | role `churchy_app`, `app.current_tenant_id()`, FORCE RLS, per-table policies + grants (D-03)        |
| `down/<tag>.sql`       | hand-written              | Drizzle has no down migrations; `db down` runs these and removes the journal row                    |

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

| Role                                         | Used by                             | RLS                                                                               |
| -------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| migration role (Supabase `postgres`, CI su.) | `db up/down/seed`; owns all tables  | bypasses (superuser / BYPASSRLS) — never used by the app                          |
| `churchy_app`                                | the app (Drizzle, `DATABASE_URL`)   | **subject to every policy**: no SUPERUSER, no BYPASSRLS, not the owner, NOINHERIT |
| `anon`, `authenticated` (Supabase PostgREST) | nothing — Churchy uses no PostgREST | all grants on `public` and their default privileges revoked; no policy names them |

The migration creates `churchy_app` as **NOLOGIN**. To let the app connect, an operator runs
`ALTER ROLE churchy_app LOGIN PASSWORD '…'` out-of-band (Supabase SQL editor / secrets manager) and
puts the resulting URL into the deployment's `DATABASE_URL`. The password is never in git, a
migration or a log. The migration role's URL is only used for migrations and the seed.

**Policies.** RLS is enabled **and forced** on every `public` table.

| Scope (`table-scopes.ts`) | Grant to `churchy_app`         | Policies                                                                                                 |
| ------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `tenant`                  | SELECT, INSERT, UPDATE, DELETE | `tenant_isolation` FOR ALL: `USING` + `WITH CHECK` `tenant_id = (SELECT app.current_tenant_id())`        |
| `catalog`                 | SELECT, INSERT, UPDATE, DELETE | `tenant_isolation` as above + `catalog_read` FOR SELECT: platform rows, **only inside a tenant context** |
| `platform`                | none                           | none — denied by default; reached later through a platform role / dedicated policies of their own slices |

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
