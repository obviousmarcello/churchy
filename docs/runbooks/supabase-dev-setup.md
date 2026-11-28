# Supabase dev/staging project setup (S1-a)

Status: **S1-a complete** (migrations 0000..0024 applied, storage set up, advisors reviewed, schema verified). Open items are listed under [Owner steps still needed](#owner-steps-still-needed). Security-review label applies (RLS, roles, storage policies).

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

### Progress: migrations 0009-0012 applied to the dev project

- Applied in order, all successful: `0009_music_files`, `0010_music_sheet`, `0011_music_events`, `0012_music_setlists` (each as a single migration, SQL unchanged).
- `0011` and `0012` drop and recreate existing objects as the migrations themselves state (`tenant_isolation` policies on `events`/`calendars`; `service_plans_setlist_id_fkey`). No other drops.
- Checks after applying: every public table has RLS enabled and forced; `music_scope` restrictive policies exist on `events` and `calendars` for `churchy_music`; the only SECURITY DEFINER function in `public` is `share_song_rights`; `anon`/`authenticated` hold no table grants in `public`.
- Next migration: `0013_music_stats`.

### Progress: 0013-0015 applied (dev project)

Applied in order: 0013_music_stats, 0014_events_tenant_default, 0015_music_areas (p1-p3). Replaced `filter_songs` (9-arg) by the 10-arg version per 0013. Checked: all 116 public tables have RLS enabled and forced, the only SECURITY DEFINER function in public is `share_song_rights`, and anon/authenticated hold no table grants. Next: 0016_music_images_announcements (2 parts), then 0017_music_projection.

### Progress: 0016-0017 applied (dev project)

Applied in order: 0016_music_images_announcements (_p1, _p2; split at the last statement-breakpoint, p2 is the unmarked tail) and 0017_music_projection (one piece, SQL unchanged). The realtime policies in 0017 were created without errors (`music participants can receive`, `can track presence`, `can broadcast` on `realtime.messages`). Checked: all 121 public tables have RLS enabled and forced, the only SECURITY DEFINER function in public is `share_song_rights`, and anon/authenticated hold no table grants. Next: 0018_music_live.

### Progress: 0018-0023 applied (dev project) - schema complete

Applied in order, all successful: 0018_music_live, 0019_music_scripture, 0020_music_hymnal_refs, 0021_music_courses (_p1-_p3, split at statement boundaries, SQL unchanged), 0022_music_notifications, 0023_music_rights_batch. `0019` drops `app_config.scripture_ruf` and its check constraint as the migration states (checked first: `app_config`, `scripture_books` and `scripture_verse_cache` were empty, no view depended on the column). `realtime.send` exists on this project, so `notify_event` is active. Checked: 38 migration records (parts counted), all 124 public tables have RLS enabled and forced, SECURITY DEFINER functions in public are exactly `share_song_rights` and `notify_event`, anon/authenticated hold no table grants, the scripture catalog tables exist, 118 policies in public. All migrations are applied.

## Final state (S1-a)

- Migrations 0000..0024 applied (0024 = `0024_revoke_definer_exec`, added after the advisors run). 124 public tables, RLS enabled and forced on all, 118 policies in `public`, 2 in `storage`.
- No seed data, nothing dropped or reset. `anon`/`authenticated`: no table grants in `public`, no EXECUTE on the two SECURITY DEFINER functions.
- `churchy_app` and `churchy_music` are NOLOGIN (checked: `rolcanlogin` false).

## Advisors (run after 0023, re-checked decisions below)

Security:

| Finding | Count | Decision |
| --- | --- | --- |
| `rls_enabled_no_policy` (INFO) | 13 | Accepted. Platform tables (`audit_log`, `billing_accounts`, `deals`, `invoices`, `notification_prefs`, `org_memberships`, `organizations`, `payment_events`, `plans`, `profiles`, `subscriptions`, `tenants`, `workday_calendar`) are intentionally deny-all for every non-owner role; only the migration role (BYPASSRLS) touches them. |
| `anon/authenticated_security_definer_function_executable` (WARN) | 2 functions x 2 roles | Fixed by `0024_revoke_definer_exec`: Supabase default privileges had granted EXECUTE on `share_song_rights()` and `notify_event(uuid,text)` to anon/authenticated/service_role (REVOKE FROM PUBLIC does not remove those). Revoked from anon and authenticated; churchy_app/churchy_music keep `notify_event`; the trigger function needs no caller grant. `service_role` is left as is (server-only key, not used by Churchy). Both functions already had `search_path=""`. RLS semantics unchanged. |

Performance:

| Finding | Count | Decision |
| --- | --- | --- |
| `unindexed_foreign_keys` (INFO) | 129 | Deferred. Tables are empty, no query evidence yet. Indexes belong in `src/schema/*.ts` (so `db:generate` stays free of drift) and are chosen from real access patterns in the backend slices S2-S7. Revisit with real query plans before production. |
| `unused_index` (INFO) | 208 | Accepted: nothing has run yet; re-evaluate after load. |
| `multiple_permissive_policies` (WARN) | 8 | Accepted: `catalog_read` + `tenant_isolation` on catalog tables are the designed semantics (D-03); merging them would change RLS. |
| `no_primary_key` (INFO) | 3 | Deferred: `scripture_books`, `scripture_verse_cache`, `user_file_views` keep the music app's composite unique keys; adding PKs is a schema change for the music-module owner. |

## Storage (operator step, not a Churchy migration)

Applied with `execute_sql` as the `postgres` role, no ownership error. Policy SQL is exactly the block in `docs/music-merge/SUPABASE-SETUP.md` (grants on `storage.objects`/`storage.buckets` to `churchy_music`, policies `music_tenant_objects` and `music_buckets_read`). Buckets (all `public = false`):

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
('pdfs','pdfs',false,52428800,array['application/pdf']),
('scores','scores',false,52428800,array['application/pdf','image/png','image/jpeg','image/webp']),
('sound-files','sound-files',false,52428800,array['audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/ogg','audio/webm','audio/aac']),
('song-images','song-images',false,10485760,array['image/png','image/jpeg','image/webp']),
('avatars','avatars',false,5242880,array['image/png','image/jpeg','image/webp']),
('branding','branding',false,5242880,array['image/png','image/jpeg','image/webp','image/svg+xml']),
('course-images','course-images',false,10485760,array['image/png','image/jpeg','image/webp']),
('event-images','event-images',false,10485760,array['image/png','image/jpeg','image/webp']),
('projection-backgrounds','projection-backgrounds',false,20971520,array['image/png','image/jpeg','image/webp']),
('projection-videos','projection-videos',false,52428800,array['video/mp4','video/webm'])
on conflict (id) do nothing;
```

The music app's original limits are not in this repository, so these are conservative assumptions; 50 MB is also the default global upload cap of a Supabase free project (raise it in Dashboard > Storage > Settings together with the per-bucket limits when needed; adjust with `update storage.buckets`).

Verified read-only: 10 buckets all private with the limits above; policies on `storage.objects`: `music_tenant_objects` (ALL, churchy_music); on `storage.buckets`: `music_buckets_read` (SELECT, churchy_music). The expression requires `(storage.foldername(name))[1] = 't'` and `[2] = app.current_tenant_id()::text`, so a tenant's token only matches its own `t/<tenant_id>/...` keys. A functional cross-tenant write test was not run on the live project (it needs a signed claim and would write to `storage.objects`); run the check in `SUPABASE-SETUP.md` once from the SQL editor.

## Schema verification (read-only)

One query compared `TABLE_SCOPES`/`MUSIC_TABLES` (generated from `packages/db/src/table-scopes.ts`, 124 entries) with the live catalog. Result: 124 live = 124 classified, none missing either way; RLS enabled and forced on all; every tenant/catalog table has a `tenant_isolation` policy and SELECT for `churchy_app`; every `MUSIC_TABLES` table has SELECT for `churchy_music` and its policy names that role; no non-music table is readable by `churchy_music`; the 13 platform tables have no policy and neither role can SELECT them (`has_table_privilege` false). **No mismatches.**

## Environment variables

Never committed, never in the demo (demo mode refuses to start when any of them is set). The owner sets them in the Vercel project (Settings > Environment Variables; Preview and Production separately; mark as Sensitive). `APP_ENV` is not a secret but must be set on every deployment.

| Variable | Secret | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | no | Project API URL (`https://lsduqjfpeksznhgtwhvm.supabase.co` for dev) |
| `SUPABASE_PUBLISHABLE_KEY` | no (public) but not committed | Client key for supabase-js (music module) |
| `SUPABASE_JWT_SECRET` | **yes, server only** | Signs the per-request `churchy` tenant tokens (ADR-20); only if the project verifies HS256, see owner steps |
| `DATABASE_URL` | **yes** | App DB connection as `churchy_app_login` (below) |
| `PGBOSS_DATABASE_URL` | **yes** | pg-boss worker connection (session mode/direct; the worker needs LISTEN and advisory locks, not the transaction pooler) |
| `VAPID_PUBLIC_KEY` | no (public) | Web push |
| `VAPID_PRIVATE_KEY` | **yes** | Web push |
| `VAPID_SUBJECT` | no | `mailto:` or `https:` contact for push |
| `ANTHROPIC_API_KEY` | **yes** | Song-rights research |
| `APP_ENV` | no | `staging` / `production`; required on every deployment |

### Database roles and connection

`churchy_app` and `churchy_music` are NOLOGIN group-style roles. Do not give them a password. The migration role (`postgres`) is for migrations only, never in `DATABASE_URL` of a deployment. Recommended, done by the owner once in the Supabase SQL editor (the password never enters git, a migration or a log):

```sql
CREATE ROLE churchy_app_login LOGIN PASSWORD '<generated in the SQL editor>' INHERIT NOBYPASSRLS;
GRANT churchy_app TO churchy_app_login;
```

The login role is created with `INHERIT`, so it holds the privileges of `churchy_app` directly (`churchy_app` itself is NOINHERIT and gets nothing from other roles). Verify with `select current_user, has_table_privilege(current_user,'public.people','SELECT')` that the login role is subject to RLS (it has no BYPASSRLS and owns no table). `DATABASE_URL` points at this login role through the session-mode pooler or the direct connection (`...pooler.supabase.com:5432`); `withContext` uses transaction-local `set_config`, so the transaction pooler (6543) is also acceptable for the web app, but not for the pg-boss worker.

## Owner steps still needed

Not done by Claude; listed for the owner.

1. **JWT signing check.** Dashboard > Project Settings > JWT Keys (or JWT Settings). If the project still uses the legacy HS256 shared secret, copy it to Vercel as `SUPABASE_JWT_SECRET` (server only) and the music tokens work as designed. If it uses asymmetric signing keys (ECC/RSA) and the legacy secret is revoked, PostgREST will not accept HS256 tokens minted by Churchy: either keep the legacy secret active, or switch the token minting to a custom JWT signing key imported in that screen. Record the result in `docs/music-merge/SUPABASE-SETUP.md`.
2. **Realtime** enabled (Dashboard > Project Settings > API/Realtime; private channels/"Allow public access" off). The policies on `realtime.messages` exist; Realtime verifies its own JWTs, so step 1 decides the transport.
3. **Auth settings** (Dashboard > Authentication):
   - URL configuration: Site URL, Redirect URLs including the Vercel preview domain pattern.
   - Email templates in Hungarian, informal (tegező); sender/SMTP configured.
   - Magic link / OTP expiry 15 minutes (D-04).
   - Password minimum length (set per D-04) and leaked-password protection.
   - TOTP MFA enabled.
   - Disable new signups if only invited users should exist.
4. **Vercel env vars** from the table above; create the `churchy_app_login` role.
5. Raise the storage upload limits if files above 50 MB are expected.
