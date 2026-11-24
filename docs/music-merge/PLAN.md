# Music Sheet DB into Churchy: merge plan (music-00-plan)

Status: PLAN ONLY. No code changed. Source app: `music-sheet-db-main` (v0.1.58). Target: Churchy `apps/web` under `/munkater`.
Facts below were read from the music repo (151 migrations, `src/server/models`, `docs/modules-plan.md`) and Churchy (`packages/db`, `apps/web`). Items marked (?) are unverified and listed in section 7.

Decisions already taken (not re-asked): keep their server models, add `tenant_id` + RLS (documented exception to contract-first, see 4.1); app lives in `apps/web` under `/munkater`; their roles map to `can()` actions; overlap with Churchy worship/song/event/team features decided PER FEATURE by the user; their UI is restyled into the v2 design system (no rewrite); all features come across as dynamic modules (`app_modules` maps to `/admin/modulok` + `entitlements(tenant)`); minimal rewriting (edit parts out).

## 1. Table inventory (state after all 151 migrations)

Counted from `create table` minus dropped: 69 live tables, ~9 `create policy` statements plus RLS enabled on 70 tables (most access is via `security definer` RPC functions, about 150 `public.*` functions). Almost all tables have RLS enabled; policies key on `auth.uid()` and on helper functions (`can_see_event`, `can_edit_course`, `member_area_ids`, `user_access`, `module_enabled`). Exact column lists: read the migration; columns below are indicative.

Legend: RLS = RLS enabled; policy by `auth.uid()` or helper. Most writes are RPC only (`security definer`). Single-row/global tables are marked G (need a per-tenant row).

### 1.1 Identity, config, modules
| Table | Purpose | Key columns | RLS |
|---|---|---|---|
| profiles | display name, avatar | user_id (FK auth.users), display_name, avatar_path | yes, auth.uid |
| admins | superadmin flag | user_id | yes |
| (roles in `auth` app_metadata / groups) | roles song_admin, event_admin, music_leader, course_admin, superadmin via `groups` + `user_role_lists`, `set_user_roles` | | RPC |
| app_config (G, single row `id boolean`) | app name, church name/desc (jsonb per lang), palette, brand colour, icon, time_zone, email sender, GDPR controller fields | | yes |
| app_modules (G) | module id (text, e.g. `songs.pdfs`) + enabled | id, enabled | yes |
| email_templates | event email templates | | yes |
| totp_factor_grants, "private" schema | MFA helper, email MFA codes, rate limit/cron tokens | | internal |
| notification_preferences, notification_deliveries, push_subscriptions | per-user prefs, sent log, web-push endpoints | user_id | yes |

### 1.2 Song catalog and rights
| Table | Purpose | Key columns | RLS |
|---|---|---|---|
| songs | song | id, title, artist, rights fields added later (authors, original title, translator, publisher, CCLI, songbook, death years: (?) exact columns), search helpers (`search_key`, `fold_text`, pg_trgm/unaccent) | yes |
| arrangements | chart per song | song_id, name, chordpro (<=50k), section_order[], is_default, generated musical_key and search_vector | yes |
| song_pdfs, song_pdf_arrangements, song_pdf_uploads | PDF charts + link to arrangements + upload tickets | | yes |
| song_images, song_image_pages, song_image_arrangements | image charts | | yes |
| song_scores | MusicXML scores (verovio) | | yes |
| song_sound_files, song_sound_file_arrangements, song_sound_file_uploads | audio | | yes |
| song_links, song_link_arrangements | external links | | yes |
| stray_files, song_image_stray_files | storage cleanup bookkeeping | | yes |
| song_rights_proposals, song_rights_research_settings | AI/web research proposals and settings (API key stored via `set_song_rights_research_api_key`) | | yes, secrets inside |
| user_arrangements, user_arrangement_views, user_file_views | per-user key/capo, last views | user_id | yes, auth.uid |
| sheet_marks | drawings on sheet | user_id/arrangement | yes |
| annotations | sheet annotations by setlist item | | yes |
| mixer_settings | mixer/tempo sync per user/event | | yes |
| live_sessions | live chord sheet with leader | | yes |

### 1.3 Events, setlists, run sheet, teams
| Table | Purpose | Key columns | RLS |
|---|---|---|---|
| events | event | id, title, starts_at, setlist_id, plus later columns (series, ends, visibility/scope (?)) | yes via `can_see_event` |
| event_attendees | volunteer assignments + replies | | yes |
| event_access / `event_member_access` (function) | event scopes | | fn |
| setlists | setlist (also stores `items jsonb`, `arrangement_ids`) | | yes |
| setlist_items (+ _blocks, _durations, _themes, _volunteers) | setlist rows, run-sheet blocks, per-item projection theme, item volunteers | | yes |
| my-setlists (user_setlist_items dropped) | personal setlists | | yes |
| event_blocks | blocks and run sheet times | | yes |
| event_area_notes, event_team_notes, event_volunteer_areas | per-area notes/teams | | yes |
| service_areas, service_area_members, service_area_roles, service_area_paths | volunteer areas (tree), members, roles | | yes |
| volunteer_templates, volunteer_template_areas (_members dropped) | team templates | | yes |
| calendar_feeds | iCal feed tokens | | yes |
| announcement_calendars, announcement_settings, event_announcements, event_announcement_entries | announcement slides from calendars (ical.js) | | yes |

### 1.4 Projection, images, scripture, courses
| Table | Purpose | RLS |
|---|---|---|
| projection_themes, projection_video_uploads | themes, backgrounds, videos | yes |
| event_projection_controllers | who controls the screen | yes |
| event_images, event_image_sets | slides images, QR, PDF/PPTX imports | yes |
| scripture_books, scripture_verse_cache | Bible books and cached verses (licensed texts) | yes |
| courses, course_areas, course_lessons, course_images | training courses (Tiptap JSON), draft/publish | yes via `can_see_course`/`can_edit_course` |

Storage buckets (8): avatars, branding, course-images, event-images, pdfs, projection-backgrounds, projection-videos, song-images (+ sound files under pdfs/other (?)). Extensions: pg_cron (7 `cron.schedule` jobs: cleanup, notifications due, research), pg_net, pg_trgm, unaccent.

## 2. Overlap matrix

Churchy side (from `packages/db/src/schema/worship.ts`, `table-scopes.ts`): `hymnals` (catalog), `songs` (tenant: title, alt_titles, first_line, lyrics, authors/composers/translators, licence enum, themes, seasons, default_key, tempo, time signature, tsvector search), `song_hymnal_refs`, `arrangements`, `attachments`, `plan_templates`, `service_plans`, `plan_items`, `plan_comments`, `assignments`, plus `teams/team_positions/team_members`, `calendars`, `media`, `notification_prefs`, `tenants`, module toggles in `/admin/modulok` (`apps/web/lib/plans/modules.ts`, `entitlements.ts`). Screens: `/munkater/enektar`, `/munkater/liturgia`, `/munkater/csapatok`, `/munkater/naptar`.

| # | Music feature | Their side | Churchy side | Difference | Question / recommendation |
|---|---|---|---|---|---|
| O1 | Song entity | `songs(title, artist)` + rights columns; search_key/fold_text | `songs` with rich metadata, `licence`, tsvector `hu_tsvector` | Their song is thin, chart lives in arrangements; Churchy song holds lyrics + licence; both have rights data in different shapes | MERGE. Keep one `songs` table (Churchy), add their missing columns (artist, original title, publisher, CCLI, songbook, death years) and map `licence`. Q: which table wins and who owns lyrics (song vs arrangement chordpro)? |
| O2 | Arrangements | `arrangements(chordpro, section_order, is_default, musical_key gen)` | `arrangements` (columns (?) to read before phase 2) | Both exist by name; Churchy's is presentation/key variant, theirs is the ChordPro chart | MERGE: keep Churchy table, add `chordpro`, `section_order`, `is_default`, generated key/search. Q needed. |
| O3 | Hymnals / songbooks | free text songbook in rights | `hymnals` + `song_hymnal_refs` (catalog) | structured vs free text | MERGE: import their songbook text into `song_hymnal_refs` where matching, else keep text. |
| O4 | Song attachments | pdfs/images/scores/sound/links tables with arrangement links, upload tickets, stray cleanup | `attachments`, `media` | theirs are 5 typed families with per-arrangement linking and their own buckets | KEEP theirs (more specific), map file storage to Churchy storage keys (`storage-keys.ts`); Churchy `attachments` stays for non-music use. |
| O5 | Setlist vs service plan | `setlists`, `setlist_items` (arrangement per row, blocks, durations, themes, volunteers, items jsonb), `events.setlist_id` | `service_plans`, `plan_items`, `plan_templates`, `plan_comments` | both model "order of service"; theirs is song/scripture/slide centric with run-sheet blocks and projection themes; Churchy is liturgy-centric with templates and comments | USER DECIDES. Options: (a) keep both, link `setlists` to a `service_plan`; (b) replace setlists by plan_items (rewrite of their setlist models, against "minimal rewriting"); (c) replace plans' song part with setlist. Recommend (a) in phases 1-4, revisit after phase 5. |
| O6 | Song usage / stats | `song_play_stats`, `list_due`; usage derived from events | Churchy `song_usages` (?) not seen in scopes; usage from plan_items | | Q: keep their stats from setlist items; Churchy derives usage? Recommend computing from whichever list wins O5. |
| O7 | Events | `events(title, starts_at, setlist_id)`+blocks, attendees, series, scopes, copy, announcements | Churchy events in `esemenyek` (public) + `calendars`, `events` package (RRULE) | Their event is a rehearsal/worship occasion; Churchy event is public/parish calendar with recurrence and rooms | KEEP SEPARATE as `music_events`? or MERGE? Recommend MERGE into Churchy events with a link `event_id` on setlist/blocks, but their event table is referenced by ~25 tables: cheapest path is keep `events` renamed/namespaced and add an optional FK to Churchy events. Q. |
| O8 | Calendar feed (iCal) | `calendar_feeds`, `/api/calendar` | Churchy calendar contracts, `packages/events` iCalendar | two iCal implementations | MERGE feeds: reuse `packages/events` iCal; keep token table. Q. |
| O9 | Announcement calendars | iCal sources for slides | none | | KEEP (new). |
| O10 | Volunteers/teams | `service_areas` (tree), members, roles, templates, event_volunteer_areas, replies | `teams`, `team_positions`, `team_members`, `assignments` | theirs: areas with hierarchy, per-event teams, accept/decline replies, templates; Churchy: teams/positions/assignments on plans | USER DECIDES; recommend MERGE: service_areas become `teams` (add parent_id, ordering), area roles -> `team_positions`, event teams -> `assignments` with reply status. High rewrite risk, so alternatively keep theirs for music events only. |
| O11 | Users / people | `auth.users` + profiles + groups + roles | `profiles` (platform), people (`people.ts`), `org_memberships`, actors | ids differ: theirs are auth user ids | MERGE: their `user_id` FKs point to Churchy `profiles.id`/auth id (same Supabase auth id if ids equal (?)). Q: is Churchy profile id = auth.users.id? |
| O12 | Notifications | email (Resend), web push, deliveries, prefs | `packages/email` outbox, `notification_prefs`, `notifications.ts` | | MERGE onto Churchy outbox and prefs; keep web-push subscription table (Churchy push status (?)). |
| O13 | Media / images | event_images, course_images, avatars, branding | `media` | | KEEP theirs per feature, store via Churchy storage helper. |
| O14 | app_config | one row per DB | `tenants`, `site_config`, presets | | MERGE: per-tenant row keyed by tenant_id, map fields to site/tenant config, drop duplicated fields (church name, palette, tz, email sender). |
| O15 | app_modules | ids `songs.pdfs` ... 38 modules | `/admin/modulok`, `lib/plans/modules.ts`, `entitlements(tenant)` | | MERGE: register their 38 ids as sub-modules (see 5, phase 9). |
| O16 | Courses | courses, lessons, areas | none (HR/portal has none) | | KEEP (new). |
| O17 | Scripture | books, verse cache, translations tab | none | | KEEP; licensing question (section 7). |
| O18 | Projection | themes, controllers, overlay | none | | KEEP. |
| O19 | Permissions/roles | 5 roles via groups | `can()` actions | | Map (see 5.9). |

## 3. Technical conflicts

| Area | Music | Churchy | Plan |
|---|---|---|---|
| next | 16.4.6 | 16.4.6 | same |
| react | 19.3.0 | ^19.3.1 | bump theirs; no conflict |
| tailwind | v4, `@tailwindcss/turbopack`, tw-animate-css | v4.3.5, CSS-variable tokens | remove their tokens; use Churchy theme variables; keep tw-animate-css only if used |
| UI primitives | `@base-ui/react`, shadcn, class-variance-authority, `cn` | Radix, `packages/ui` | restyle: map their wrappers (shadcn-like components) onto `packages/ui`; keep @base-ui only inside not-yet-ported complex widgets, then replace. New runtime deps need a PR reason (CLAUDE.md). |
| icons | lucide-react 1.x | own icon set (?) | check `packages/ui` icons; adopt lucide only if Churchy already allows it (Q) |
| tiptap | 3.32 starter-kit, link | 3.34 (packages/ui) | align to 3.34 |
| zod | 4.6.5 | 4.6.7 | align |
| sentry | `@sentry/nextjs` 11 | `apps/web/instrumentation.ts` (?) | decide whether Churchy uses Sentry (Q) |
| email | Resend (assumed from "Resend" in brief) + email templates table | `packages/email` outbox + React Email | route all via outbox; drop Resend direct send |
| AI | `@anthropic-ai/sdk`, `@google/genai`, `openai` | none | new dependencies; see AI below |
| Build scripts | `copy-pdfjs.mjs`, `copy-tesseract.mjs` (traineddata eng/hun), `build-worklet.mjs` (esbuild AudioWorklet), `generate-icons.mjs` | none | move scripts to `apps/web/scripts`, wire into `dev`/`build`; static assets under `public/`; keep esbuild devDep; pnpm 12 vs Churchy pnpm 10 (check `packageManager`) |
| Heavy deps | pdfjs-dist 6, tesseract.js 7, verovio 6.3, sharp, html-to-image, uqr, ical.js, web-push, @aiden0z/pptx-renderer, dompurify | sharp already used in Churchy | lazy-load behind modules; check bundle impact |
| Electron | `electron`, `electron-builder`, `electron/app` | none | OUT of scope unless asked (Q) |
| Routing | `app/[lang]/…` with en/hu | no locale segment, hu only | drop `[lang]`; paths under `/munkater/…` (Hungarian slugs? Q) |
| i18n | custom `src/i18n` (en/hu messages, `m.users.roles[...]`, rich) | next-intl, `messages/hu.json`, typed keys, lint `no-hardcoded-text` | delete en, fold hu into `messages/hu.json` namespace `munkater.music` (CLAUDE.md lists namespaces, add `music` or nest; docs change needed); adapt their `m.x.y` accessor via a thin shim or codemod to `useT("munkater.music.x")` (large mechanical edit) |
| Auth | Supabase auth, SSR cookies (`@supabase/ssr`), MFA (TOTP + email codes), custom access token hook, `proxy.ts` | Supabase Auth, `getActor()`, `can()`, sessions on `*.churchy.hu` only, public hosts no cookies | use Churchy login; remove their login/MFA/password pages or keep as thin redirects; their roles from `user_role_lists` replaced by actor |
| Data access | supabase-js with the user's JWT, RLS by `auth.uid()`, RPC functions | Drizzle via `churchy_app` role, `app.tenant_id` per transaction | see 4.2 |
| Storage | 8 Supabase buckets, signed URLs | Churchy `storage-keys.ts` (tenant-prefixed keys) | prefix every path `t/<tenant_id>/…`; storage policy by tenant |
| Jobs | pg_cron + pg_net edge calls, `consume_cron_token`, nightly AI song rights research, stray file cleanup, due notifications | pg-boss | port to pg-boss jobs; drop pg_cron/pg_net, per-tenant loops |
| AI | per-DB API key stored in `song_rights_research_settings` (`set_song_rights_research_api_key`) | no AI | per-tenant key storage must be encrypted (Churchy encryption infra); cost: nightly job x tenants; plan cap per tenant via entitlement; platform-level default key? (Q) |
| Realtime | live sessions / projection controller may use Supabase Realtime (?) | none | check; Churchy hosting must support it (Q) |
| PWA / SW | `src/sw`, `manifest.ts`, web-push | public hosts no cookies | scope SW to `/munkater`; VAPID keys per platform |
| Testing | vitest 5 + DB tests (supabase local), fast-check, Playwright | vitest, contract tests, isolation suite | port tests with their code; DB tests move to `packages/db` harness |
| Env/secrets | `.env.local`, `.env.prod.local`, service role key, Resend, AI keys, VAPID, cron token | Churchy: no secrets in demo, demo refuses credentials | no service-role key in app; AI/VAPID platform secrets; demo mode must stub AI/push |
| Demo data | `seed-dev.mts`, `seed-large.mts` | fictitious Hungarian demo (D-91) | rewrite seeds to tenant-scoped, fictitious only; check no real song/rights/people data from production |

## 4. Multi-tenancy plan

### 4.1 Exception to contract-first
Their models call supabase-js directly. We keep them (user decision) and record in `docs/music-merge/` an ADR: "music module bypasses `packages/contracts`; isolation is enforced by RLS only". The adapter-import lint rule (D-90) and `policy/require-policy-wrapper` need an allow-list for `apps/web/server/music/**` (path TBD) and the music server actions must still go through `withPolicy`. Contract tests do not cover music tables; isolation suite DOES (see 4.4). Needs `security-review` label.

### 4.2 Obtaining tenant context (decision needed)
Options:
- A (recommended): replace their supabase-js client factory with a thin adapter exposing the same query API on top of the `churchy_app` connection (Drizzle/pg) that sets `app.tenant_id` per transaction. Heavy: supabase-js is a REST client (PostgREST); `.from().select()` chains would need a PostgREST-compatible layer. NOT minimal.
- B: keep supabase-js/PostgREST; mint a per-request JWT carrying `tenant_id` claim (and the actor id); RLS reads `current_setting('request.jwt.claims')->>'tenant_id'`. Needs a custom JWT signing secret, and RLS policies using both `auth.uid()` and tenant claim. Their existing `custom_access_token_hook` is already a claim hook, so this is a natural extension. But Churchy's policies use `app.tenant_id`; make a helper `current_tenant()` = `coalesce(nullif(current_setting('app.tenant_id',true),''), jwt claim)` and make the Churchy `tenant_isolation` policy also accept it (security-review).
- C: run their models against a Postgres connection via a tiny supabase-js-compatible shim (e.g. PostgREST service in front of Postgres with `churchy_app`): extra infra.
Recommendation: B for phase 1 spikes; decide by a 1-day spike measuring how many model files use RPC vs `.from()` (their models are RPC-heavy, so a shim for `.rpc()` and `.from().select/insert/update/delete` on top of pg may be smaller than expected; to verify).

### 4.3 Schema work per table
- Add `tenant_id uuid not null references tenants(id)` + btree index; classify in `table-scopes.ts` (`tenant`); `tenant_isolation` policy + grant to `churchy_app` (packages/db README). Backfill: single value for imported data.
- Single-row tables (`app_config`, `app_modules`, `song_rights_research_settings`, `admins`): primary key becomes `tenant_id` (drop `id boolean`). `app_config` fields mostly merge into tenant/site config (O14).
- Per-tenant uniques: `service_areas.name`, `app_modules.id`, profile-ish keys, `(setlist_id, arrangement_id)` is local (already scoped by parent); calendar feed token stays globally unique; announcement/event series names; scripture cache `(translation, book, chapter, verse)` per tenant or shared catalog (Q, licensing); `songs` search keys/uniqueness (?). Find with `grep "unique" supabase/migrations`.
- Derived-child tables (setlist_items, song_*_arrangements): also carry `tenant_id` (RLS cheap via direct column), kept consistent by FK composite `(tenant_id, parent_id)` or trigger.
- Security-definer RPC functions (150): each needs the tenant check inside; either set `search_path` and filter by `current_tenant()` everywhere, or convert to invoker functions. Largest risk: any `security definer` function that ignores tenant leaks across tenants. Plan: automated test in the isolation suite calling each function with two tenants.
- `auth.users` references: map to Churchy profile/user table; `on delete cascade` semantics reviewed.
- pg_cron jobs, extensions (pg_trgm, unaccent): confirm available on Supabase PG17; Churchy already has `hu_tsvector`; reuse.
- Triggers like `keep_one_admin`, `keep_one_superadmin` are per tenant now; or dropped (replaced by Churchy admin roles).
- Migrations: Churchy uses Drizzle (`db:generate`, down migrations in `migrations/down/`). Plan: do NOT replay 151 migrations. Write a consolidated "snapshot" schema for music tables as Drizzle definitions plus SQL for functions/policies/generated columns (Drizzle cannot express everything; allow raw SQL migrations). Existing prod data (their church) imported once by a script with tenant_id fill.
- Storage: paths become `<tenant_id>/<bucket-specific path>`, Storage RLS by first path segment, buckets with `public` flags reviewed (branding?).

### 4.4 What breaks / risks
- `auth.uid()` policies and `security definer` functions assume one church per DB.
- Churchy "public hosts set no cookies" vs their sessions/service worker: music routes are authed only.
- Per-tenant cost of nightly AI job and storage.
- Test DB harness: `TEST_DATABASE_URL` isolation suite must cover every new table.

## 5. Phased merge plan

Each phase = one issue-sized agent job (UI/BE parts as separate issues per CLAUDE.md). Size: S <1 day, M 1-3 days, L 3-5 days.

| Phase | Scope | Entry | Exit | Size |
|---|---|---|---|---|
| 0 | This plan, ADR for contract-first exception, answers to section 7 | user answers Q1-Q12 | PLAN approved, issues created | S |
| 1 Foundation | copy code into `apps/web` under agreed path; deps aligned (react, zod, tiptap) and new deps justified; build scripts (pdfjs, tesseract, worklet) wired; `[lang]` removed; i18n shim + `munkater.music` namespace in hu.json (hu only); tenant context spike (4.2) decided and built; tenant-scoped schema + RLS migrations (all tables) with `table-scopes.ts`; isolation suite passes; storage prefix; lint allow-list | plan approved | `pnpm lint typecheck test test:isolation build` green with music routes returning placeholder behind module flag | L (possibly split 1a deps/build/i18n, 1b schema+RLS+tenant context) |
| 2 Song catalog + rights + files | songs, arrangements merge (O1-O3), rights fields, search, PDFs, images, scores, sound files, links, stray cleanup, uploads | phase 1 | CRUD works tenant-scoped, two-tenant isolation tests, modules `songs.*` gated | L |
| 3 Chart | `/sheet`, ChordPro, transposition, capo, metronome (+ midi-out), marks, chord diagrams, live sessions, rehearsal | 2 | sheet works on 3 demo churches; AudioWorklet build in CI | L |
| 4 Events | events (O7 decision), blocks/run sheet, series, teams/volunteers (O10), calendar feed (O8), announcements, setlists vs plans (O5) | 2 (+3 for sheet links), user decisions O5/O7/O10 | feature parity tests, can() mapping for event admin | L |
| 5 Projection | controller, screen, themes, images/QR/PPTX/PDF import, overlay, countdown, quick add | 4 | projection e2e (Playwright), videos storage | L |
| 6 Scripture / psalm | books, verse cache, Bible panel, daily psalm, Károli licensing | 4/5 | licensing answer applied | M |
| 7 OCR / imports / mixer | tesseract OCR, SongPraise import, mixer | 2/3 | module gated, bundle budget | M |
| 8 Courses, notifications/push, rights research | courses, email templates -> outbox, web push, nightly research on pg-boss with per-tenant AI key + cost cap | 1, outbox | jobs tested, secrets encrypted | L |
| 9 Modules, permissions, restyle | 38 module ids -> `/admin/modulok` + `entitlements`; roles -> `can()` actions (see below); restyle all screens to v2 design system; axe 0 serious; docs update | all | DoD complete | L |

### 5.9 Role mapping (proposal)
`song_admin` -> `music.song.manage` (+ read for members); `event_admin` -> `music.event.manage`; `music_leader` -> `music.live.lead`, `music.setlist.edit`; `course_admin` -> `music.course.manage`; `superadmin` -> tenant admin (Churchy existing admin role). Members: read actions. Add new actions to `packages/policy` + MATRIX.md; UI via `useCan`/`<Can>`. Their `user_access` / `module_enabled` become `can()` + `entitlements`. (Exact Churchy role names to read in phase 9.)

### 5.10 Module mapping (proposal)
Their 38 ids (`songs.pdfs`, `sheet.metronome`, `projection.themes`, `events.blocks`, ... `song-rights.research`) become Churchy module toggle ids under a parent `music`; dependency rules (`requires`, `requiresAny`) kept in their registry, evaluated via `entitlements(tenant)`; `/admin/modulok` shows them grouped; "core" items (songs, events, accounts) belong to parent module `music`.

## 6. Risks
- Licensed content: Károli Bible text (public domain in HU? text editions may carry licences (?)); scripture cache can store licensed translations; song lyrics/charts of copyrighted songs hosted for many tenants (CCLI/SzJSZ-like licences, per-tenant reporting); song-rights research data is third-party web data. Do not ship real song or rights data in seeds.
- Cross-tenant leakage via security-definer RPCs (150 functions).
- Large UI restyle on top of base-ui widgets; regression without tests.
- Churchy CLAUDE.md rules vs their code: hard-coded UI strings (their i18n), role checks in UI (`user_role_lists`), no `can()` yet; lint failures will be many; allow gradual exemptions with tracked removal.
- Demo mode safety: AI/push/email credentials must never load.
- Scope: 69 tables, ~150 functions, 38 modules: all features is months of work.
- Production data of their church: privacy (names/emails of volunteers).

## 7. QUESTIONS FOR THE USER
1. O1/O2: which `songs`/`arrangements` table survives (recommend Churchy's, extended)? Where does the lyrics/chart text live (song.lyrics vs arrangement.chordpro)?
2. O3: do you want their free-text songbook mapped into Churchy `hymnals`?
3. O5: setlists vs service plans: keep both linked, replace, or merge? (recommend keep both for now)
4. O6: song usage/stats: whose source of truth?
5. O7: music events vs Churchy events: merge or link? Does an event need to appear on the public site calendar?
6. O8: one iCal implementation (Churchy `packages/events`) or keep theirs?
7. O10: volunteer areas vs teams/positions/assignments: merge or keep separate? Do volunteer replies (accept/decline) exist in Churchy?
8. O11/O12: confirm Churchy profile id equals auth user id; do you want their email/MFA pages removed (use Churchy login only)?
9. 4.2: are you OK with option B (per-request JWT with tenant claim) or do you prefer A (drop supabase-js)? Should I run the spike first?
10. Is Resend actually in their app and should it disappear in favour of Churchy outbox? Same for Sentry: does Churchy use or want Sentry?
11. Routes: Hungarian slugs under `/munkater` (e.g. `/munkater/enektar`, which already exists in Churchy) or English music paths? How do their `/songs` collide with Churchy `/munkater/enektar` (merge route)?
12. Icons: allowed to add lucide-react, or must everything use the Churchy icon set? Allowed to keep @base-ui/react temporarily?
13. Electron app (`electron/`): drop, keep out of repo, or port?
14. Should English be dropped entirely, including for the `[lang]` URLs of already shared links (redirects)?
15. AI features: who pays? Platform key, per-tenant key (stored encrypted), or both; per-plan caps; allowed providers (Anthropic, Google, OpenAI all in their deps)?
16. Bible texts: which translations ship (Károli only?), source/licence, may the cache be shared across tenants as a platform catalog?
17. Song rights data: shared across tenants as a catalog (needs a `catalog` scope) or tenant-private? May research results from one tenant benefit others?
18. Existing production data of their church: migrate into a tenant? Who is first tenant? Any data that must not enter the repo?
19. Realtime (live sessions, projection controller): what transport does their code use, and is Supabase Realtime acceptable on Churchy hosting?
20. Roles: is the 5-role to `can()` mapping in 5.9 acceptable, and which Churchy roles get `music.*` by default?
21. Priority and order of phases; is a staged release per module (modules default OFF per tenant) wanted (their default is ON)?
22. Documentation: OK to amend CLAUDE.md namespace list (`music`) and add an ADR for the contract-first exception?

## 11. Decisions by the product owner (2026-11-24)

Answers to the open questions. Anything not listed is still open and must be asked, never assumed.

| # | Decision |
|---|---|
| Data layer | Keep Music Sheet DB's supabase-js server models; add `tenant_id` + RLS to their tables. Exception to contract-first, limited to the music module (ADR + CLAUDE.md note). |
| Tenant context | Per-request JWT with a tenant claim; no spike first. |
| Placement | Inside `apps/web` under `/munkater`, Hungarian slugs (`/munkater/enektar`, `/kotta`, `/proba`, `/vetites`, …). |
| Songs/arrangements | Their tables replace Churchy's (`songs`, `arrangements`); our hymnal/plan links are rewired. |
| Setlists vs plans | Keep both, linked (plan references the setlist). |
| Events | One events table: theirs merged into ours. |
| Volunteers | Merge into Churchy teams/positions/assignments. |
| iCal | Keep their iCal feed code for music events. |
| Login | Drop theirs (login, MFA, email-code); Churchy login only. |
| Language | Hungarian only; drop English and `[lang]`; strings under a `music` namespace in `messages/hu.json`. |
| UI kit | `@base-ui/react` and `lucide-react` allowed temporarily; restyle with Churchy design system. |
| AI | Platform key with a per-plan cap. |
| Song rights data | Shared catalog across tenants. |
| Bible text | Platform catalog: Károli 1908 included; other translations per church licence. |
| Email | Through Churchy's outbox/templates (`packages/email`); no Resend. |
| Sentry | Whole application, as the LAST step (not in the merge). |
| Desktop (Electron) | Out of scope; stays in the music repo. |
| Production data | Migrate later as its own task (after the security core). |
| Module defaults | Music modules default OFF; owner switches on per church (/admin/modulok), by plan. |
| Project rules | CLAUDE.md and an ADR may be amended (small edit). |
| Start | Phase 1 foundation first, then songs. |

Still open (ask when reached): realtime transport for live sessions/projection (phases 3 and 5), role mapping of their 5 roles to `can()` actions (phase 9), profile id vs auth user id check (phase 1), phase order after phase 2.

## 12. Phase 1 progress (music-01-foundation, phase 1a)

Done:
- Deps (apps/web): `pdfjs-dist`, `tesseract.js`, `@tesseract.js-data/eng|hun`, `@supabase/supabase-js`, dev `esbuild`. React/zod/tiptap need no change (Churchy is already on equal or newer versions). `ical.js`, `@base-ui/react`, `lucide-react`, AI SDKs, tiptap in apps/web: added with the code that uses them (phases 2+).
- Build scripts copied to `apps/web/scripts/` (`copy-pdfjs`, `copy-tesseract`, `build-worklet`) and run by `dev`/`build`. Outputs are git/eslint-ignored. `build-worklet` builds an entry only once its source exists (metronome: phase 3); the service worker entry is left out (scope open, phase 8).
- i18n: empty `music` namespace in `messages/hu.json` (catalog test + CLAUDE.md list updated).
- Tenant JWT: migration `0004_tenant_claim` (+ down) lets `app.current_tenant_id()` read the `tenant_id` claim of `iss = "churchy"` tokens from `request.jwt.claims`; `apps/web/server/music/{tenant-token,supabase}.ts` mint the token and build the per-request client; isolation suite extended; setup in `SUPABASE-SETUP.md`; ADR-20 in the SDD; CLAUDE.md note.
- Check: Churchy `profiles.id` **is** the Supabase auth user id (`profiles_id_auth_users_fkey`, migration 0002), so their `user_id → auth.users` FKs map to `profiles.id`.

Folding their messages (each phase, with its code): `src/i18n/messages/hu/<part>.ts` → `messages/hu.json` `music.<part>`; English dropped; `Plural {one, other}` → ICU `{count, plural, …}`; rich tags → next-intl `t.rich`; their informal address must become the formal _Ön_ (the catalog test enforces it), so wording changes; `m.x.y` accessor → `useT("music.x")`/`getT`.

Remaining for phase 1b (blocked on the questions in the report): tenant-scoped snapshot schema of their 69 tables (tenant_id, composite FKs, per-tenant uniques, RLS + grants, `table-scopes.ts`, fixtures for two tenants), the songs/arrangements replacement with rewired hymnal/plan references, the DB role of the token, the ~150 security-definer functions, storage prefix/policies, lint allow-list for `apps/web/server/music/**`.

### 11.1 Further decisions (2026-11-24, round 2)

| # | Decision |
|---|---|
| Music DB role | New role `churchy_music`, grants on music tables only. |
| Security-definer functions | Convert to SECURITY INVOKER per feature phase. |
| Their own auth.uid() policies/helpers | Dropped; `tenant_isolation` + `can()`/`withPolicy`. |
| Song contract | Changed to their song shape; Churchy-only extra fields dropped. |
| User admin / storage | Their user admin dropped; storage under `t/<tenant>/` with storage RLS. |
| Address form | Informal (tegező) for the WHOLE product, public sites included. CLAUDE.md updated; a dedicated tone pass converts existing strings and tests (catalog test currently enforces Ön). |
| Service worker | Scoped to `/munkater` (in the phase that needs it). |
| OCR | Hungarian data only. |
| Local Postgres | 16 accepted; real Supabase JWT signing checked on first connection. |

## 13. Phase 1b progress (music-01b-schema)

Done:
- Their final schema (151 migrations applied to a local Postgres with Supabase stubs, read from the
  catalog by a script, not retyped) is in `packages/db/src/schema/music.ts` as 43 tenant-scoped
  tables: `tenant_id` + index, `(tenant_id, …)` primary/unique keys (global: calendar feed token,
  push endpoint), composite `(tenant_id, x_id)` FKs, `auth.users` FKs → `profiles.id`,
  single-row tables keyed by `tenant_id`, `scripture_books` / `scripture_verse_cache` as catalog
  (platform rows = Károli 1908).
- Migrations `0005_music_functions` (pg_trgm, `simple_unaccent`, the 8 INVOKER helpers of
  generated columns/CHECKs; `church_time_zone()` tenant-scoped), `0006_music_schema` (drops
  Churchy's songs/arrangements and the `song_licence` enum, creates the music tables, re-points
  `song_hymnal_refs` / `plan_items`), `0007_music_rls` (role `churchy_music`, FORCE RLS, grants,
  `tenant_isolation` for `churchy_app, churchy_music`, `catalog_read`, the constraints Drizzle
  cannot express), each with a down migration; `up → down → up` checked.
- `rls.ts` knows `churchy_music` (music tables only; policies of exactly those tables name it);
  the isolation suite covers every music table (fixtures `packages/db/sql/music-fixtures.sql`),
  the music role (claims path, cross-tenant writes, permission denied elsewhere) and fails for a
  table without policy or a music grant on a non-music table.
- Song contract = their shape (`title, artist, tags, copyright, songbook, authors, originalTitle,
  translator, rightsStatus, rightsNote`, plus the rewired `hymnalRefs`); arrangements = theirs
  (`chordpro, sectionOrder, isDefault, projectionThemeId` + generated `musicalKey, tempoBpm,
  timeSignature, durationSeconds`). Mock, demo seed, `/munkater/enektar` and the plan editor
  adapted minimally (key lives in the chart's `{key:}`; themes → tags; licence → rights status).
- Function checklist: [FUNCTIONS.md](FUNCTIONS.md). Storage layout/policies: SUPABASE-SETUP.md.

Not in this phase (by decision or plan):
- Events cluster → phase 4 ("events merge into ours"): `events`, `event_announcements`,
  `event_announcement_entries`, `event_area_notes`, `event_blocks`, `event_image_sets`,
  `event_images`, `event_projection_controllers`, `event_team_notes`, `event_volunteer_areas`,
  `event_volunteers`, `live_sessions`, `notification_deliveries`, `setlist_item_blocks`,
  `setlist_item_volunteers`. Their `events` columns (setlist_id, projection_theme_id,
  volunteer_template_id, series/visibility …) are added to Churchy `events` then.
  `setlist_items.announcement_id` / `image_set_id` have no FK until then.
- Volunteers → Churchy teams/positions/assignments (schema note only): `service_areas`
  (→ `teams` + `parent_id`), `service_area_members` (→ `team_members`), `service_area_roles`
  (→ `team_positions`), `service_area_paths` (closure table, maybe a recursive query instead),
  `volunteer_templates`, `volunteer_template_areas`, `course_areas` (course ↔ team), replies
  (→ `assignments.status`).
- Dropped: their `profiles` (Churchy `profiles`), `user_direct_roles`, `totp_factor_grants`, the
  `private` tables (MFA codes/sessions, TOTP attempts, rate limits, cron tokens).
- Triggers and the remaining functions: per phase (FUNCTIONS.md).

Open questions (asked, not assumed):
1. Song rights "shared catalog across tenants" (§11): the rights fields are columns of the
   tenant's `songs` (their shape). What is the shared key (CCLI number? normalized title +
   authors?), and which fields move to a catalog table (`song_rights`?) — and do
   `song_rights_proposals` (per tenant song) feed it? Kept on `songs` until answered.
2. `app_config` (their per-DB settings, now one row per tenant) duplicates tenant/site config
   (church name, palette, time zone, e-mail sender, GDPR controller): merge into
   `tenants`/site config and drop the table, or keep it for music-only fields?
3. Their `notification_preferences` / `push_subscriptions` vs Churchy `notification_prefs`:
   merge (O12 recommendation) or keep separate? Kept separate (tenant tables) for now.
4. Lyrics: Churchy's `songs.lyrics` was dropped with the contract change; the demo's own-song
   lyrics now exist only where the chart (ChordPro) has them. OK, or move them into the default
   arrangement's chart?

### 11.2 Decisions after phase 1b (2026-11-24)

| # | Decision |
|---|---|
| Song-rights catalog key | CCLI number; fallback normalised title + authors. Shared catalog table holds rights facts; research results feed it. |
| `app_config` | Merged into the tenant/site config (music section); table dropped (in the phase that uses it). |
| Notification prefs/push | Merged into Churchy notification preferences (notifications phase). |
| Lyrics | Moved into the default arrangement's chart text (demo songs get lyrics back). |
| Events/volunteer tables | Phase 4 per the plan's phase table (not yet confirmed separately by the owner). |
