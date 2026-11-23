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
| DB role for the token | SQL (migration, phase 1b) | `GRANT <role> TO authenticator` so PostgREST can switch to it; grants on music tables/functions only; `USAGE` on schema `app` and `EXECUTE` on `app.current_tenant_id()`. Which role is open (see PLAN.md phase 1b questions). |
| Exposed schemas | Dashboard → API | `public` (music tables live there). Churchy tables stay ungranted to that role. |
| Custom access token hook | Dashboard → Auth → Hooks | **Not needed** for the tenant claim (per-request tokens are minted by Churchy). The music app's `custom_access_token_hook` goes away with its login (PLAN §11 "Login"). |
| Realtime (live sessions, projection) | — | Open (phases 3 and 5): Realtime verifies its own JWTs; decide transport first. |

## Local testing (plain Postgres)

No PostgREST/Supabase is needed: the isolation suite (`TEST_DATABASE_URL=… pnpm test:isolation`)
sets `request.jwt.claims` the way PostgREST does, connected as `churchy_app`, and checks that a
`churchy` claim for tenant A sees only A's rows of every tenant table, cannot write B's rows, that
other issuers yield no tenant, and that conflicting settings raise. Token minting/verification and
the client header are unit-tested in `apps/web/server/music/tenant-token.test.ts`.
