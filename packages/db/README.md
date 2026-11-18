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
```

## Migrations

| File                   | Source                    | Content                                                                                             |
| ---------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| `0000_extensions.sql`  | hand-written (`--custom`) | `unaccent`, `btree_gist` (schema `extensions`), checks for `hu-HU-x-icu` + `hungarian`, SQL helpers |
| `0001_schema.sql`      | `drizzle-kit generate`    | enums, 59 tables, indexes, checks, FKs, `ENABLE ROW LEVEL SECURITY`                                 |
| `0002_constraints.sql` | hand-written (`--custom`) | `bookings_no_overlap` exclusion constraint, `profiles.id → auth.users(id)`                          |
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
- **RLS.** Every `public` table has RLS enabled (Supabase requirement); with no policies yet, nothing
  but the owner can read them. Policies keyed on `app.tenant_id` (+ the diocesan `app.org_id` branch
  on `HR_TABLES`) and the dedicated non-owner app role are **D-03**.
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
