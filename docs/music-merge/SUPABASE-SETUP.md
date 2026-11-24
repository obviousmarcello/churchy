# Music module: Supabase project setup (tenant JWT)

Status: phase 1 (music-01-foundation). Design: [PLAN.md](PLAN.md) §4.2 option B, §11 "Tenant
context"; SDD ADR-20. Code: `apps/web/server/music/tenant-token.ts`, `apps/web/server/music/supabase.ts`,
migration `packages/db/migrations/0004_tenant_claim.sql`.

## How it works

1. Churchy resolves the actor (`getActor()`: session + membership) for the request.
2. The server mints a short-lived (60 s) HS256 JWT: `iss = "churchy"`, `aud = "authenticated"`,
   `sub` = Supabase auth user id (= Churchy `profiles.id`), `tenant_id`, `role` = the Postgres role
   PostgREST switches to.
3. `createMusicSupabaseClient(actor, dbRole)` sends it as `Authorization: Bearer …` with the
   publishable key. The token never reaches the browser and is never stored.
4. PostgREST verifies the signature and sets `request.jwt.claims`; `app.current_tenant_id()` returns
   the `tenant_id` claim (only for `iss = "churchy"`), so every `tenant_isolation` policy applies.
   `app.tenant_id` (Drizzle path) wins; a differing claim or a claim with `app.org_id` raises `42501`.

Supabase Auth's own access tokens have a different `iss`, so a user's session token never yields a
tenant, even if a hook or metadata ever put a `tenant_id` into it.

## What must be configured on the real project

| Item | Where | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | app env (server) | project API URL |
| `SUPABASE_PUBLISHABLE_KEY` | app env (server) | publishable/anon key (`apikey` header) |
| `SUPABASE_JWT_SECRET` | app env (server only, secrets manager) | the project's JWT secret (Dashboard → Settings → JWT Keys, legacy HS256 secret). Never `NEXT_PUBLIC_*`, never in git or the demo (it is in `FORBIDDEN_DEMO_CREDENTIALS`). |
| HS256 verification | Dashboard → JWT Keys | PostgREST must accept HS256 tokens signed with this secret. If the project uses the new asymmetric signing keys, the legacy shared secret must stay a verification key (to verify on the project; otherwise switch minting to an imported signing key). |
| DB role for the token | migration `0007_music_rls` (done, phase 1b) | Role `churchy_music` (NOLOGIN, NOINHERIT, no BYPASSRLS): DML on the music tables only (`MUSIC_TABLES` in `packages/db/src/table-scopes.ts`), `USAGE` on schemas `app`, `public`, `extensions`, `EXECUTE` on `app.current_tenant_id()`. The migration runs `GRANT churchy_music TO authenticator` when `authenticator` exists (Supabase). The token's `role` claim is `churchy_music`. |
| Storage buckets | Dashboard → Storage (not a migration) | See [Storage](#storage-music-files) below. |
| Exposed schemas | Dashboard → API | `public` (music tables live there). Churchy tables stay ungranted to that role. |
| Custom access token hook | Dashboard → Auth → Hooks | **Not needed** for the tenant claim (per-request tokens are minted by Churchy). The music app's `custom_access_token_hook` goes away with its login (PLAN §11 "Login"). |
| Realtime (live sessions, projection) | — | Open (phases 3 and 5): Realtime verifies its own JWTs; decide transport first. |

## Local testing (plain Postgres)

No PostgREST/Supabase is needed: the isolation suite (`TEST_DATABASE_URL=… pnpm test:isolation`)
sets `request.jwt.claims` the way PostgREST does, connected as `churchy_app`, and checks that a
`churchy` claim for tenant A sees only A's rows of every tenant table, cannot write B's rows, that
other issuers yield no tenant, and that conflicting settings raise. Token minting/verification and
the client header are unit-tested in `apps/web/server/music/tenant-token.test.ts`.

## Storage (music files)

Status: phase 1b documents the layout and the policies; the buckets are created on the real
Supabase project (Dashboard → Storage or the SQL below run once by an operator), not by a Churchy
migration (`storage.*` belongs to Supabase, and plain-Postgres CI has no `storage` schema).

- Buckets (all **private**, signed URLs only): `pdfs`, `scores`, `sound-files`, `song-images`,
  `avatars`, `branding`, `course-images`, `event-images`, `projection-backgrounds`,
  `projection-videos` (the music app's buckets; `stray_files.bucket` lists the same names). Size and
  MIME limits as in the music app (`supabase/migrations`, `storage.buckets` inserts).
- Object key: `t/<tenant_id>/<path>`, where `<path>` is the value stored in the music tables
  (`song_pdfs.path` = `<song_id>/<uuid>.pdf`, …; their CHECK constraints stay tenant-relative).
  Build keys with `tenantStorageKey(ctx, …)` and check incoming ones with `assertTenantStorageKey`
  (`packages/db/src/storage-keys.ts`).
- The music app's own storage policies (`auth.uid()` / role helpers) are **not** carried over.

Policies for the music role (the tenant comes from the churchy JWT claim through
`app.current_tenant_id()`; `anon` / `authenticated` get nothing):

```sql
-- once per project, as the postgres role
GRANT USAGE ON SCHEMA storage TO churchy_music;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO churchy_music;
GRANT SELECT ON storage.buckets TO churchy_music;

CREATE POLICY music_tenant_objects ON storage.objects AS PERMISSIVE FOR ALL TO churchy_music
  USING (
    bucket_id = ANY (ARRAY['pdfs', 'scores', 'sound-files', 'song-images', 'avatars', 'branding',
      'course-images', 'event-images', 'projection-backgrounds', 'projection-videos'])
    AND (storage.foldername(name))[1] = 't'
    AND (storage.foldername(name))[2] = (SELECT app.current_tenant_id())::text
  )
  WITH CHECK (
    bucket_id = ANY (ARRAY['pdfs', 'scores', 'sound-files', 'song-images', 'avatars', 'branding',
      'course-images', 'event-images', 'projection-backgrounds', 'projection-videos'])
    AND (storage.foldername(name))[1] = 't'
    AND (storage.foldername(name))[2] = (SELECT app.current_tenant_id())::text
  );

CREATE POLICY music_buckets_read ON storage.buckets AS PERMISSIVE FOR SELECT TO churchy_music
  USING (id = ANY (ARRAY['pdfs', 'scores', 'sound-files', 'song-images', 'avatars', 'branding',
    'course-images', 'event-images', 'projection-backgrounds', 'projection-videos']));
```

Check after setup (SQL editor): with `set local role churchy_music` and a `request.jwt.claims`
of tenant A, `select count(*) from storage.objects where name like 't/<tenant B>/%'` returns 0
and an insert of `t/<tenant B>/x` is rejected.

## Phase 2 notes (music-02-songs)

- Every music table's `tenant_id` defaults to `app.current_tenant_id()` (migration
  `0008_music_songs`): the models insert without naming the tenant; `tenant_isolation` checks it.
- Storage paths: `createMusicSupabaseClient` installs `tenantStorageFetch`, which rewrites the
  object path of every Storage request to `t/<tenant_id>/<path>` (and the `prefixes` of a bulk
  delete).
- `share_song_rights()` (trigger on `songs`) is SECURITY DEFINER: its owner (the migration role)
  must bypass RLS to write the shared `song_rights` rows. On Supabase that is `postgres`.
- AI song-rights research: `ANTHROPIC_API_KEY` (server env, secrets manager; never in the demo,
  which refuses to start with it). The monthly cap comes from the plan
  (`musicResearchPerMonth`).
- Without `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_JWT_SECRET` the music models run
  in local mode (in-process PGlite with the demo data, PLAN §14); staging and production refuse.
