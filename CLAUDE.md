# CLAUDE.md — Churchy

Churchy is a hosted, multi-tenant platform for Hungarian churches. It has two releases built in parallel:

- **R1 — public website** for each church: service schedule, announcements, news, events, rites, giving, and an admin.
- **R2 — internal workspace (_Munkatér_)**: calendars, room booking, worship planning, HR requests, and a diocesan HR portal.

The source of truth is in `docs/`:

| Doc                       | Use it for                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `docs/01-PRD.md`          | _What_ and _why_ — requirement IDs `FR-…`, `NFR-…`, `L-…`, `C-…`                                                                   |
| `docs/02-SDD.md`          | _How_ — architecture, data model, security design, ADRs                                                                            |
| `docs/03-DELIVERABLES.md` | _What to build next_ — deliverables `D-xx` with acceptance criteria, the hybrid delivery plan (§3) and the Definition of Done (§2) |

Read the deliverable's section and the SDD sections it traces to **before** starting work. If the docs and this file disagree, the docs win; flag the conflict in your PR.

## How we build: hybrid frontend-first

The plan is in `docs/03-DELIVERABLES.md` §3.

1. **Phase A — prototype.** Screens are built for real against a **mock data adapter** (`packages/data-mock`) with fictitious Hungarian demo data, plus a demo-only role switcher.
2. **Phase B — backend slices.** Modules switch from the mock adapter to the DB adapter one at a time (S1–S7). The **security core** (S1: DB, tenant isolation/RLS, auth, server-side permissions, encryption) is built in parallel from week 2.
3. Every deliverable has a **UI part** and/or a **BE part** (and some have a **Logic** or **Infra** part). Each part is a separate GitHub issue. A deliverable is done only when **all** its parts pass.

### Non-negotiable rules

1. **Contract first.**
   - UI and server components import **repository interfaces** from `packages/contracts` only. Never import an adapter directly (enforced by lint).
   - Any change to a schema or interface must keep **both** adapters passing the contract tests.
2. **Real logic, never mocked.** These packages are pure TypeScript and are used by both adapters:
   - the schedule engine and calendar (`packages/schedule`, `packages/calendar`)
   - Hungarian formatting (`packages/hu`)
   - the permission policy `can()` (`packages/policy`)
   - booking and leave rules
3. **Permissions come from `can()`.**
   - UI visibility is decided by `can()`, never by ad-hoc role checks.
   - Server mutations go through the policy wrapper.
   - Never check plan keys directly; use `entitlements(tenant)`.
4. **No real personal data in the prototype or demo.** Demo data is entirely fictitious. Never add real names, emails or phone numbers, and never real pastoral, HR or health content.
5. **Security before real data.** Don't open a module to real users until its BE part, tenant isolation, auth and (for requests, HR, diocesan access) encryption and access logging pass. See DoD #10.
6. **"Demo-complete" is not "done".** Report progress per part. Don't tick acceptance criteria that only work against the mock when they belong to the BE part.

## Permissions in UI (pattern)

Visibility is always decided by `can()` from `@churchy/policy`; the UI never inspects roles.

- **Who is acting:** `getActor()` from `apps/web/server/session.ts` (anonymous in Phase A). It is the only file allowed to read role lists; the demo role switcher plugs in there (`setActorResolver()` / replacing `defaultResolver`).
- **Server components:** `canServer(action, resource)` or `can(await getActor(), …)` from `apps/web/lib/permissions/server.ts`.
- **Client components:** wrap the tree in `<PermissionsProvider actor={await getActor()}>`, then use `useCan(action, resource)` or `<Can action resource fallback>` from `apps/web/lib/permissions/client.tsx`. Resource types come from `ResourceByAction`; without a provider everything is denied.
- **Navigation:** declare `requires: { action }` (plus optional `module` / `entitlement`, stubbed until D-25 / D-87) on each `PermissionNavItem` and filter with `filterNav(items, actor, ctx)`. See `apps/web/lib/app-nav.ts`.
- **Hiding is not enforcing:** server mutations still go through the policy wrapper.
- **Lint:** `eslint.permissions.mjs` forbids role-string comparisons/`includes`/`switch` and `.websiteRoles` / `.workspaceRoles` / `.orgRoles` access in `apps/web` and `packages/ui` (except `server/session.ts`). If you need a new check, add a policy action, not a role test.

## Language & locale

- **Product UI is Hungarian only.**
  - All user-visible strings live in `messages/hu.json`; no hard-coded UI text in components (lint rule).
  - Use the formal address (_Ön_).
- **Code, comments, commit messages, PRs and issues are in English.** Hungarian domain terms are fine in identifiers when there is no good English equivalent (e.g. `miserend` in a URL slug).
- Locale `hu-HU`, timezone **`Europe/Budapest`** for all date logic (never the server timezone). Weeks start on **Monday**.
- Always use `packages/hu` for:
  - dates (`2026. november 12., csütörtök`), times (`18:00`)
  - names (family name first), addresses (`1011 Budapest, Fő utca 1.`), phones (`+36 30 123 4567`), bank accounts (8-8-8)
  - slugs (no diacritics), and the article _a/az_
- **Sorting:** Hungarian collation (`Intl.Collator('hu')` / Postgres `hu-HU-x-icu`).
- **Generated text:** never suffix user-provided names. Denomination terminology comes from presets (`t.term('serviceSchedule')`), never hard-coded — a Reformed church has no _szentmise_.
- **Music:** Hungarian H/B notation by default.

## Stack (SDD §3)

| Layer           | Choice                                                           |
| --------------- | ---------------------------------------------------------------- |
| Language, app   | TypeScript (strict) · Next.js App Router (RSC)                   |
| UI              | Tailwind + CSS-variable theme tokens · Radix primitives          |
| Data            | Drizzle + PostgreSQL 16 (RLS) · Zod for schemas and contracts    |
| Jobs            | pg-boss                                                          |
| Content & media | Tiptap (JSON content) · sharp                                    |
| Auth            | Auth.js (magic link + password, TOTP)                            |
| Tests           | Vitest (unit/contract) · Playwright (E2E/visual) · axe-core · k6 |
| i18n            | next-intl (Hungarian only) · `packages/i18n` for terms & Zod     |
| Tooling         | pnpm workspaces                                                  |

Don't add new runtime dependencies without saying why in the PR. Prefer what's already in the stack.

## Messages & terminology in UI (pattern)

- **Strings:** `messages/hu.json`, namespaces `common`, `public`, `admin`, `munkater`, `portal`, `dev`, `email` (notification templates, `packages/email`). Keys are typed (`apps/web/global.d.ts`), so a wrong key fails `pnpm typecheck`.
- **Server components:** `const t = await getT("public.home")` from `apps/web/i18n/server.ts`. **Client components:** `useT("…")` from `apps/web/i18n/client.tsx`. Both are next-intl translators plus `t.term(key)`.
- **Terminology:** write `{service.plural}`, `{serviceSchedule.nom}`, `{community.article}` … (forms `nom`, `lower`, `slug`, `plural`, `article`) in a message; they are resolved from the tenant's `TermForms` before ICU formatting (`apps/web/i18n/request.ts`). Use `t.term("serviceSchedule").slug` in code. Term data comes through `TermSource` (`apps/web/i18n/terms.ts`, built on `effectiveConfig()` from `@churchy/presets`).
- **Dates, times, names, addresses, phones, bank accounts:** `<FormattedDate>`, `<FormattedTime>`, `<PersonName>`, `<Address>`, `<Phone>`, `<BankAccount>` from `@churchy/ui` (props only, built on `@churchy/hu`).
- **Validation messages:** pass `huZodErrorMap` from `@churchy/i18n` (`schema.safeParse(x, { error: huZodErrorMap })`) or call `configureZodHungarian()` once.
- **Lint:** `i18n/no-hardcoded-text` fails on JSX text and on string literals in user-facing props (`title`, `aria-label`, `alt`, `placeholder`, `label`, `*Label`, `*Title`, …) in `apps/web` and `packages/ui` (tests and e2e exempt). Punctuation/digits, CSS variables, URLs, kebab-case ids and `<code>`/`<kbd>` text are allowed; anything else needs a message, or `// eslint-disable-next-line i18n/no-hardcoded-text -- reason`.

## Repository layout (target, SDD §29)

```
apps/web/            Next.js: public sites, /admin, /munkater, /egyhazmegye, platform console
packages/contracts/  Zod schemas, repository interfaces, contract tests
packages/data-mock/  mock adapter, demo data, simulation switches
packages/db/         Drizzle schema, migrations, RLS policies, DB adapters
packages/schedule/   schedule engine (pure)
packages/calendar/   Easter, feasts, Hungarian holidays, liturgical days (pure)
packages/events/     event recurrence (RRULE), Hungarian rule text, iCalendar (pure)
packages/hu/         Hungarian formatting (pure)
packages/policy/     can() permission policy (pure)
packages/presets/    denomination presets
packages/themes/     design tokens + component variants
packages/ui/         shared accessible components + display components (dates, names, …)
packages/i18n/       terminology (`t.term()`), message term placeholders, Hungarian Zod errors
packages/email/      notification templates (React Email) rendered to HTML + text + push; used by the outbox viewer
packages/eslint-plugin-i18n/  `i18n/no-hardcoded-text` lint rule
messages/hu.json     all UI strings
docs/                PRD, SDD, deliverables, ADRs, runbooks
```

## Commands

Keep this section in sync when you change scripts. Node ≥ 22 (`.nvmrc`), pnpm 10 (`packageManager` in `package.json`).

```bash
pnpm install          # install workspace
pnpm dev              # run the app on http://localhost:3000 (mock adapters by default in Phase A)
DEMO_MODE=1 pnpm dev  # demo mode: role/church switcher, banner, reset (apps/web/lib/demo/)
pnpm build            # production build of apps/web
pnpm lint             # ESLint incl. custom rules: i18n/no-hardcoded-text (D-06), adapter imports (D-90), role checks (D-05)
pnpm format           # Prettier write; `pnpm format:check` in CI
pnpm typecheck        # tsc --noEmit in every package
pnpm test             # unit tests (Vitest) in every package, TZ=Europe/Budapest
pnpm test:coverage    # unit tests with coverage thresholds (80 %; 90 % schedule/calendar/events; 95 % hu/policy)
pnpm --filter @churchy/policy matrix   # regenerate packages/policy/MATRIX.md (a test fails if it is stale)
pnpm test:contract    # contract suites (*.contract.test.ts) against mock (and DB when DATABASE_URL is set)
pnpm e2e              # Playwright against `next start` on :3100 — run `pnpm build` first; pass --trace off unless debugging
```

Demo mode (D-92) refuses to start when `APP_ENV` is staging/production or any DB, storage, email, push or payment credential is set — the list is in `apps/web/lib/demo/safety.ts`. Deployments must set `APP_ENV`.

Pinned toolchain notes: TypeScript is pinned to 5.9 and ESLint to 9 because lint tooling does not yet support the TypeScript 7 (Go) compiler. `@playwright/test` is pinned to the Playwright version installed in the environment.

Workspace packages are consumed as TypeScript source (`exports` → `./src/index.ts`, `transpilePackages` in `apps/web/next.config.ts`). Each package owns its tests under `src/**/*.test.ts` and its own `vitest.config.ts`.

## Workflow for agents

1. **Pick an issue.** Pick an open issue whose dependencies are merged. One issue = one branch = one PR. Branch name: `d-05-logic-policy`, `d-91-ui-demo-data`, …
2. **Read first.** Read the deliverable in `docs/03-DELIVERABLES.md` and the SDD sections it traces to.
3. **Copy the acceptance criteria** from the issue into the PR description as a checklist. Tick only what is verified, and say how (test name, screenshot, measurement).
4. **Keep the PR focused.** Split work bigger than about 2–3 days into several PRs.
5. **Write tests with the code.** Domain logic needs unit tests (coverage ≥ 80 % overall, ≥ 90 % for `schedule`/`calendar`, ≥ 95 % for `hu`/`policy`). New routes pass axe-core with 0 serious/critical violations.
6. **CI must be green.** An agent never merges its own PR. The QA agent reviews first, and a human approves every merge.
7. **Flag security-sensitive changes** with the `security-review` label: auth, RLS, encryption, HR, diocesan access, payments. These need a second human reviewer.
8. **If the docs are ambiguous or wrong**, don't guess silently. Note it in the PR and propose a doc change in the same PR or a follow-up.

## Security & privacy basics

- **Tenant context.** Every repository call takes an explicit context (`tenantId` / `orgId` + actor). The DB adapter sets `app.tenant_id` / `app.org_id` per transaction. Never query tenant data without it.
- **Secrets.** Never commit secrets or put them in the demo environment. Agents have no production credentials.
- **No personal data or sensitive content** in logs, error reports, emails or push payloads. Emails about requests and HR contain only a reference number and a link.
- **Rich text** is stored as JSON and rendered through the allow-list renderer. Never render raw HTML from users.
- **Public hosts** (neutral domain or custom domains) set **no cookies**. Sessions exist only on `*.churchy.hu`.

## Definition of Done (summary — full list in deliverables §2)

- Reviewed PR with green CI: lint, typecheck, unit, contract, integration, E2E.
- Strings in `messages/hu.json`.
- axe 0 serious/critical.
- Tests for domain logic.
- No new high/critical vulnerabilities.
- Works on the 3 demo churches.
- Docs updated where behavior changed.
- RLS and encryption for new tables/fields.
- Both UI and BE parts pass.
- Security before real data.
- Contract tests green for both adapters.
