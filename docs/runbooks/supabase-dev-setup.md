# Supabase dev/staging project setup (S1-a)

Status: PLAN written before anything was applied (security-review).

Project `churchy` (id `lsduqjfpeksznhgtwhvm`, eu-west-1, Postgres 17.12) is the **dev/staging**
database. Fictitious demo data only. A separate production project is created before any real
church data (rule 5, DoD #10).

## Findings on the empty project (read-only queries)

| Assumption of the migrations | On Supabase |
| --- | --- |
| ICU collation `hu-HU-x-icu`, text search config `hungarian` (0000) | present |
| `unaccent`, `btree_gist`, `pg_trgm` into schema `extensions` (0000, 0005) | available, not yet installed; `extensions` schema exists |
| `auth.users` exists (0002 FK `profiles.id`) | exists, owned by Supabase, 0 rows; no stub (never run `db auth-stub`) |
| roles `churchy_app`, `churchy_music` created by migrations (0003, 0007) | `postgres` is not superuser but has CREATEROLE and BYPASSRLS; roles are created NOLOGIN |
| `GRANT churchy_music TO authenticator` (0007) | `authenticator` exists, so the grant runs |
| `REVOKE` on `anon`/`authenticated` (0003) | both exist, revoked incl. default privileges |
| `realtime.messages` policy (0017) | `realtime` schema exists; policy creation may need table ownership (checked when applying) |
| `storage.*` | owned by Supabase, buckets/policies are an operator step (below), not a migration |

## Plan

1. Apply 0000..0023 in order with `apply_migration`, named like the file tag (`0007_music_rls`).
   Stop at the first error, diagnose, fix forward.
2. Comments and blank lines are stripped from the SQL sent to the MCP (size); statements are
   otherwise identical to the files (`--> statement-breakpoint` markers are comments).
3. `get_advisors` security + performance, fix or document findings.
4. Read-only verification: RLS enabled+forced on every public table with the canonical policy,
   table-scopes classification, roles and grants.
5. Storage buckets and policies as an operator step (SQL recorded below).
6. No demo seed into the project (see "Seed").

Note: the repo's own runner (`db up`) keeps its own journal; on this project the journal is the
Supabase one (`supabase_migrations.schema_migrations`). Do not run `db up` against it afterwards;
add new migrations with `apply_migration` using the same tag.

## Progress log (updated as applied)

Applied so far on project `lsduqjfpeksznhgtwhvm` (Supabase journal names):

| # | Name | Content | Result |
| --- | --- | --- | --- |
| 1 | `0000_extensions` | file 0000 verbatim (comments stripped) | ok |
| 2 | `0001_schema_p1` | file 0001 lines 1-394 of the comment-stripped text: all enums, tables audit_log .. service_exceptions | ok |
| 3 | `0001_schema_p2` | tables service_occurrences .. songs | ok |
| 4 | `0001_schema_p3` | tables absences .. notifications | ok |

`0001` was split into parts only because of the size of the MCP call. Still open from 0001: the
`ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` block (stripped-file lines 937-1179, from
`deals_organization_id_organizations_id_fk` on), the indexes and any later statements. Then
0002..0023 in order. The next session must resume with `0001_schema_p4` (FKs/indexes), verify with
`list_migrations`, and not re-run p1-p3. No error was hit so far; ICU, `hungarian`, `extensions`
schema and `auth.users` all behave as the migrations assume.

Stripped-file generator (comments and blank lines removed, statements unchanged):
`grep -v '^\s*--' f.sql | grep -v '^\s*$'` (the trailing `--> statement-breakpoint` stays on a
line and is a harmless SQL comment, drop it).

### Progress log: migrations 0001_schema_p4 to 0005 (dev project lsduqjfpeksznhgtwhvm)

Applied in order via the Supabase MCP `apply_migration`, with the comment-stripped SQL passed verbatim:

- `0001_schema_p4` (stripped lines 937 to end: foreign keys and indexes)
- `0002_constraints`
- `0003_rls`
- `0004_tenant_claim`
- `0005_music_functions`

Verification: `list_migrations` shows 0000 to 0005 (including p1 to p4) as applied. All 59 public tables have RLS enabled and forced, with 48 policies. Roles: `churchy_app` exists (NOLOGIN, no BYPASSRLS). `anon`, `authenticated` and `authenticator` are present. `churchy_music` does not exist yet (expected: created by a later music migration).

Deviations: none. Next migration to apply: `0006_music_schema`.

### Progress: 0006_music_schema applied (dev project)

- `0006_music_schema` applied as four consecutive parts (`_p1`..`_p4`, split at statement boundaries), all successful.
- It drops and recreates `songs` and `arrangements` (both were empty, no dependent views) and drops the `song_licence` type.
- Public tables: 59 before, 100 after (43 `CREATE TABLE`, 2 of them recreations). RLS is enabled on all 100, and all foreign keys are validated.
- Next migration to apply: `0007_music_rls`.

### Progress: 0007_music_rls and 0008_music_songs applied (dev project)

- `0007_music_rls` applied in one piece. It created the `churchy_music` role (NOLOGIN, NOINHERIT, no BYPASSRLS) and `GRANT churchy_music TO authenticator` succeeded (`pg_has_role('authenticator','churchy_music','member')` is true). It forces RLS and adds the `tenant_isolation` policies (plus `catalog_read` on `scripture_books`, `scripture_verse_cache`).
- `0008_music_songs` applied as four parts (`_p1`..`_p4`, split at statement boundaries): the shared `song_rights` catalog table, song functions and triggers, and the SECURITY DEFINER `share_song_rights()` (EXECUTE revoked from PUBLIC).
- Verification: 101 public tables, all with RLS enabled and forced. 13 have no policy (deny-all for non-owner roles): `audit_log`, `billing_accounts`, `deals`, `invoices`, `notification_prefs`, `org_memberships`, `organizations`, `payment_events`, `plans`, `profiles`, `subscriptions`, `tenants`, `workday_calendar`. The only SECURITY DEFINER function in `public` is `share_song_rights`. `anon` and `authenticated` hold no table grants in `public`.
- Next migration to apply: `0009_music_files`.
