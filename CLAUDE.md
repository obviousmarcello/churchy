# CLAUDE.md — Churchy

Churchy is a hosted, multi-tenant platform for Hungarian churches. It has two releases built in parallel:

- **R1 — public website** for each church: service schedule, announcements, news, events, rites, giving, and an admin.
- **R2 — internal workspace (*Munkatér*)**: calendars, room booking, worship planning, HR requests, and a diocesan HR portal.

The source of truth is in `docs/`:

| Doc | Use it for |
|---|---|
| `docs/01-PRD.md` | *What* and *why* — requirement IDs `FR-…`, `NFR-…`, `L-…`, `C-…` |
| `docs/02-SDD.md` | *How* — architecture, data model, security design, ADRs |
| `docs/03-DELIVERABLES.md` | *What to build next* — deliverables `D-xx` with acceptance criteria, the hybrid delivery plan (§3) and the Definition of Done (§2) |

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

## Language & locale

- **Product UI is Hungarian only.**
  - All user-visible strings live in `messages/hu.json`; no hard-coded UI text in components (lint rule).
  - Use the formal address (*Ön*).
- **Code, comments, commit messages, PRs and issues are in English.** Hungarian domain terms are fine in identifiers when there is no good English equivalent (e.g. `miserend` in a URL slug).
- Locale `hu-HU`, timezone **`Europe/Budapest`** for all date logic (never the server timezone). Weeks start on **Monday**.
- Always use `packages/hu` for:
  - dates (`2026. november 12., csütörtök`), times (`18:00`)
  - names (family name first), addresses (`1011 Budapest, Fő utca 1.`), phones (`+36 30 123 4567`), bank accounts (8-8-8)
  - slugs (no diacritics), and the article *a/az*
- **Sorting:** Hungarian collation (`Intl.Collator('hu')` / Postgres `hu-HU-x-icu`).
- **Generated text:** never suffix user-provided names. Denomination terminology comes from presets (`t.term('serviceSchedule')`), never hard-coded — a Reformed church has no *szentmise*.
- **Music:** Hungarian H/B notation by default.

## Stack (SDD §3)

| Layer | Choice |
|---|---|
| Language, app | TypeScript (strict) · Next.js App Router (RSC) |
| UI | Tailwind + CSS-variable theme tokens · Radix primitives |
| Data | Drizzle + PostgreSQL 16 (RLS) · Zod for schemas and contracts |
| Jobs | pg-boss |
| Content & media | Tiptap (JSON content) · sharp |
| Auth | Auth.js (magic link + password, TOTP) |
| Tests | Vitest (unit/contract) · Playwright (E2E/visual) · axe-core · k6 |
| Tooling | pnpm workspaces |

Don't add new runtime dependencies without saying why in the PR. Prefer what's already in the stack.

## Repository layout (target, SDD §29)

```
apps/web/            Next.js: public sites, /admin, /munkater, /egyhazmegye, platform console
packages/contracts/  Zod schemas, repository interfaces, contract tests
packages/data-mock/  mock adapter, demo data, simulation switches
packages/db/         Drizzle schema, migrations, RLS policies, DB adapters
packages/schedule/   schedule engine (pure)
packages/calendar/   Easter, feasts, Hungarian holidays, liturgical days (pure)
packages/hu/         Hungarian formatting (pure)
packages/policy/     can() permission policy (pure)
packages/presets/    denomination presets
packages/themes/     design tokens + component variants
packages/ui/         shared accessible components
messages/hu.json     all UI strings
docs/                PRD, SDD, deliverables, ADRs, runbooks
```

## Commands

D-01 creates these; keep this section in sync when you change scripts.

```bash
pnpm install          # install workspace
pnpm dev              # run the app (mock adapters by default in Phase A)
pnpm lint             # eslint incl. no-hardcoded-strings and adapter-import rules
pnpm typecheck        # tsc --noEmit across the workspace
pnpm test             # unit tests (Vitest)
pnpm test:contract    # contract suites against mock (and DB when DATABASE_URL is set)
pnpm e2e              # Playwright — pass --trace off unless debugging
```

## Workflow for agents

1. **Pick an issue.** Pick an open issue whose dependencies are merged. One issue = one branch = one PR. Branch name: `d-05-logic-policy`, `d-91-ui-demo-data`, …
2. **Read first.** Read the deliverable in `docs/03-DELIVERABLES.md` and the SDD sections it traces to.
3. **Copy the acceptance criteria** from the issue into the PR description as a checklist. Tick only what is verified, and say how (test name, screenshot, measurement).
4. **Keep the PR focused.** Split work bigger than about 2–3 days into several PRs.
5. **Write tests with the code.** Domain logic needs unit tests (coverage ≥ 80 % overall, ≥ 90 % for `schedule`/`calendar`). New routes pass axe-core with 0 serious/critical violations.
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
