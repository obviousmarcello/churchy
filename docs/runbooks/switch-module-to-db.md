# Runbook: switching a module from the mock to the DB adapter

Used by every backend slice S2–S7 (`docs/03-DELIVERABLES.md` §3, D-90 [BE]). One module per PR
where possible. Background: SDD §4.2 (isolation), §4.4 (data-access layer), `packages/db/README.md`
(_DB adapter_), `packages/contracts/README.md` (contract rules).

## 1. Before you start

- [ ] The module's tables exist in their final shape (D-02) and are classified in
      `packages/db/src/table-scopes.ts`; the isolation suite covers them (`pnpm test:isolation`).
- [ ] Every module the contract suite needs as a prerequisite (`t.need(…)`, e.g. `schedule` →
      `locations`, `bookings` → `locations` + `rooms`) already has a DB adapter, or is switched in
      the same PR.
- [ ] For requests, HR and diocesan access: encryption (D-30) and access logging are available —
      without them the module cannot store its sensitive fields.

## 2. Implement the repository

- [ ] Add `packages/db/src/adapter/<module>.ts` implementing the contract interface, built on the
      adapter base only (`base.read` / `base.write` / `base.run`) — never the raw `Db`, never
      `withContext` directly. The base validates the ctx (no ctx, or tenant + org → `CONTEXT`),
      opens one transaction per call with `app.tenant_id` / `app.org_id` set, refuses privileged
      roles and maps database errors to contract errors.
- [ ] Filter by `tenant_id` explicitly in every query **in addition to** RLS (defence in depth).
- [ ] Run every input through its contract schema (`parseInput`); writes that need a tenant use
      `base.write` (`CONTEXT` for org/platform ctx, `FORBIDDEN` for anonymous).
- [ ] Ids: `asUuid` for lookups (a non-uuid id is simply not found), `requireUuid` for writes and
      references (`NOT_FOUND`). Never send an unchecked id to Postgres.
- [ ] Anonymous reads: express the public predicate in SQL, mirroring the mock
      (`isPubliclyVisible`: published, `published_at <= now()`, not expired).
- [ ] Map rows to the contract shape: `isoInstant` for `timestamptz`, `point` → `{ lat, lng }`,
      `numeric` → number, `time` → `HH:mm`, enum casts (the pg enums are generated from the
      contract enums). Sensitive fields are encrypted/decrypted here (D-30), never in SQL.
- [ ] Register the builder in `BUILDERS` in `packages/db/src/adapter/index.ts`. That adds the
      module to `DB_MODULES`, the registry's `db` factories and the DB contract run.

## 3. Prove it

- [ ] Local disposable Postgres (never Supabase):
      `pnpm --filter @churchy/db db auth-stub`, then
      `DATABASE_URL=… REQUIRE_TEST_DATABASE=1 pnpm test:contract` — the module's suite runs as
      `[db]` and passes 100 % (0 skipped for this module), next to the mock.
- [ ] `TEST_DATABASE_URL=… pnpm --filter @churchy/db test:coverage` and `pnpm test:isolation`.
- [ ] If the suite needs more fixtures, add them to `packages/data-mock/src/testing/fixtures.ts`
      (both adapters load the same `contractDataset()`); never weaken a suite for one adapter.
- [ ] Any contract change keeps **both** adapters green (CLAUDE.md rule 1).
- [ ] CI job _Database_ is green (it runs `pnpm test:contract` against `postgres:17`).

## 4. Zero UI changes (D-90 AC4)

- [ ] The PR diff touches no file under `apps/web/app`, `apps/web/components`, `apps/web/lib` or
      `packages/ui` for the switch itself. Paste `git diff --stat origin/main -- apps/web packages/ui`
      into the PR. For _news_ (S2) link that PR in issue #15.

## 5. Turn it on

- [ ] Security before real data (DoD #10): BE part, tenant isolation, auth (D-04) and — for
      requests, HR, diocesan access — encryption and access logging pass. Label the PR
      `security-review`.
- [ ] Staging first: set `DATA_ADAPTER_<MODULE>=db` and a `DATABASE_URL` for the **`churchy_app`**
      role (the adapter refuses superuser/BYPASSRLS roles). Production only after staging sign-off.
- [ ] The demo deployment never sets `DATA_ADAPTER_*=db` (the demo start-up check refuses it).
- [ ] Selecting `db` for a module without a DB adapter stops the app at start-up
      (`adapterRegistry.assertAvailable()` in `apps/web/server/data-adapters.ts`).
- [ ] Rollback = set the variable back to `mock`. Data written to the database does not flow back
      to the mock store; say so in the release note.

## 6. Docs

- [ ] Add the module to the _DB adapter_ table in `packages/db/README.md` and note any new
      schema ↔ contract mapping there.
