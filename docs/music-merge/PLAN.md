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

### 11.3 Decisions for phase 2 (2026-11-24)

| # | Decision |
|---|---|
| Demo / e2e data | The copied models run against in-process Postgres (PGlite) through a supabase-js → SQL translator; no credentials. |
| Roles | `music.song.view`: every workspace role; `music.song.manage` and `music.songRights.manage` (shared rights catalog, research pages): leader + music leader. |
| Scope | SongPraise import and the song-rights / rights-proposals pages now; AI research off in demo with a notice; real mode: platform key + per-plan cap. |
| Slices | Slice 1: catalog, rights, local mode, pages. Slice 2: song files (PDF, image, MusicXML, sound, links). |

## 14. Phase 2 progress (music-02-songs, slice 1)

Done:
- **Local mode** (`@churchy/db/local`, used through `apps/web/server/data-adapters.ts` only):
  one PGlite per process with the Churchy migrations (bundled as strings,
  `pnpm --filter @churchy/db local:sql`) and the D-91 demo seed; every demo session gets its own
  copies of the demo churches' tenant row and music rows under fresh tenant ids, so visitors stay
  apart and RLS keeps them apart (one PGlite per session would be ~300 MB each; this is the
  "per-visitor isolation" of the decision with one instance). *Visszaállítás* drops the copies.
  `postgrest.ts` answers supabase-js requests (select with embeds/`!inner`/aliases, filters incl.
  on embeds, order/limit/range/count, single, insert/upsert/update/delete, RPC) in a transaction as
  the token's role with `request.jwt.claims`; unsupported shapes fail as `unsupported` (none met so
  far; `or()`/`and()` are not implemented). `getMusicSupabase()` (`apps/web/server/music/db.ts`)
  picks Supabase when configured, otherwise local mode (never in staging/production).
- Storage keys `t/<tenant>/…`: the real client's `fetch` rewrites every Storage path
  (`tenantStorageFetch`); local mode has no Storage yet (slice 2).
- Migration `0008_music_songs` (+ down): `tenant_id DEFAULT app.current_tenant_id()` on all music
  tables; the phase-2 song functions and the rights-proposal functions (SECURITY INVOKER, see
  FUNCTIONS.md); triggers `set_updated_at`, attachment-link check; shared catalog `song_rights`
  (catalog scope, platform rows; key CCLI number from the copyright text, else folded title +
  authors), fed by the songs trigger `share_song_rights()`; `shared_song_rights()` lookup.
- Policy actions `music.song.view|manage`, `music.songRights.manage` (MATRIX.md); workspace modules
  `ws.music.songs` (+ `.pdfs .images .scores .sound-files .links .songpraise .ocr`) and
  `ws.music.song-rights`: off by default, a child needs its parent, in every workspace tier (the
  demo churches switched them on); labels in `/admin/modulok`.
- Their hu messages `common, components, songs, songRights, server, modules` folded into `music.*`
  (informal; the catalog test's formal-address check skips `music.`). Their `m.x.y` accessor is
  kept through `apps/web/i18n/music/*` (reads the request's next-intl messages).
- Copied (imports, routes, tokens edited): models `songs, arrangements, shared, song-rights-research`
  (+ the file models `pdfs, images, scores, sound-files, links, stray-files, stored-files` for the
  song reads), `errors, form-state, zod-i18n, songpraise, musicxml, rights-research/{prompt,result,local-files}`,
  their libs, components and `ui` primitives (button on Churchy's `buttonClasses`, shadcn tokens
  mapped to Churchy tokens). Pages: `/munkater/enektar` (list, search, details), `/uj`,
  `/[id]/szerkesztes` (song, chart, order, details, rights, delete; "Fill from the shared catalog"),
  `/jogok` (local research upload/download, closed researches, AI notice), `/jogi-javaslatok`.
  Server actions through `withPolicy` (`usePolicyAction` gives the forms their state back).
- Demo lyrics are in the default arrangement's chart; songs without an arrangement got an
  `Alapváltozat` (key + first line). Churchy's old song library screens and actions are removed.

Left out (with the phase that brings them): song files and their storage (2b); chart preview, sheet
link (3); play history, "Add to event", `recent`/`oldest` sorts (4); projection theme (5); OCR
"Read from image" (7); AI research settings/key/test/run (8, see questions); their offline page
cache and page transitions (not ported). Churchy's plan editor still uses the mock song repository
in demo mode, so its song picker and `/munkater/enektar` show different copies of the demo songs.

Open questions:
1. AI research in real mode: where is the platform key configured (env name) and what is the
   per-plan cap (unit: songs per month? per night?; which plans)? Kept off until answered.
2. `share_song_rights()` is SECURITY DEFINER so the shared rows stay read-only for the app roles
   (the catalog rule of `rls.ts`); alternative: a new "shared catalog" class with write policies.
   Its owner must bypass RLS (Supabase `postgres`). OK?
3. Which plans include the music modules? They are in every workspace tier now (default off).

### 11.4 Decisions after phase 2 slice 1 (2026-11-24)

| # | Decision |
|---|---|
| AI research | Platform key `ANTHROPIC_API_KEY`; cap 20 researches per month per tenant on Plus+ plans, through `entitlements()`; off in demo. |
| Shared catalog | SECURITY DEFINER `share_song_rights()` accepted. |
| Music modules | In every workspace tier, default off. |

## 15. Phase 2b progress (music-02b-files)

Done:
- Migration `0009_music_files` (+ down): the song-file functions of FUNCTIONS.md (PDFs, images,
  pages, MusicXML scores, sound files, links, upload tickets, arrangement links), the stray-file
  triggers (their rows name their own tenant; nothing is kept when the church itself is deleted),
  `set_updated_at` and `prevent_song_id_update` on the file tables, and the AI research claims
  (`claim_song_for_rights_research`, `claim_songs_for_rights_research_now`,
  `close_crashed_song_rights_research`) plus `count_song_rights_researches_this_month()`.
- Copied: the edit page parts `song-pdfs, song-images, song-scores, song-sound-files, song-links`
  (+ `use-attachment-form`), `file-drop, song-media, attachment-details/fields, image-viewer,
  pdf-viewer, image-chooser, preview-layout`, `lib/{file-view,image-resize,pdfjs,pinch-zoom}`, the
  viewers `/munkater/enektar/pdf/[id]` and `/kep/[id]`, the private file routes
  `/munkater/enektar/fajl/{pdf,kep,kotta,hang}/…` and `server/music/private-file.ts`. The file
  actions go through `withPolicy("music.song.manage", musicFiles(<module>))`
  (`[id]/szerkesztes/file-actions.ts`, client signatures in `file-actions-client.ts`). Each part,
  section, viewer and route follows its `ws.music.songs.*` module.
- Local mode Storage (`@churchy/db/local/storage.ts`): in memory, one-time tickets for the signed
  upload/download URLs, which the browser reaches through `/munkater/enektar/fajl/helyi/storage/v1/…`
  (PUT through `withPolicyRoute`); per-session copies of the demo songs keep their seeded files.
  Seed: each demo church's first song has a fictitious one-page PDF and an example.org link.
- AI research (from phase 8): Anthropic only, key `ANTHROPIC_API_KEY` (server env; the demo
  refuses to start with it, `lib/demo/safety.ts` category `ai`); "Research now" and "Research
  again" on `/munkater/enektar/jogok`, at most `entitlements().musicResearchPerMonth` per calendar
  month (new plan entitlement, default 0; 20 on the workspace plans). The model is the saved one of
  `song_rights_research_settings` or `claude-opus-5-5`.

Left out: the MusicXML preview on the edit page (verovio, sheet phase 3: the score shows as a
link), OCR "Read text" of an image (phase 7), the nightly research job (phase 8, pg-boss), their
provider/API-key/test forms (platform key instead).

Open question: which plans are "Plus+"? Churchy has `ingyenes`, `teljes` (website) and
`ws_s50/m150/l300` (workspace add-ons); the cap of 20 is set on the three workspace plans for now
(data only, `packages/data-mock/src/seed/platform.ts`).

## 16. Phase 3 progress (music-03-chordsheet)

Scope (owner brief): chord sheet viewer, ChordPro rendering, transposition and capo, Hungarian H/B notation,
metronome (+ MIDI clock out), marks, chord diagrams, the MusicXML preview on the song edit page, the chart
preview of the song form. The chord sheet replaces the removed old song page (`/munkater/enektar/[id]`
arrangement view with transposition, capo and H/B).

Done:
- Route `/munkater/kotta` (`?song=<id>` or `?arrangement=<id>` repeated, `&key=` per arrangement, `&from=`),
  full screen over the workspace shell, rendered on the server per request (no browser page cache).
  The song details link every arrangement to it. Copied from `src/app/[lang]/sheet`: viewer, chord sheet,
  contents, pages and columns, key/capo/layout settings, text zoom, PDF/image/score views with zoom, print,
  marks (pen, highlighter, eraser), rehearsal panel with guitar and keys chord diagrams, metronome (tempo,
  tap, beats, volume, latency, haptics, tempo from the chart, save tempo to the arrangement), MIDI clock out,
  score view and player (verovio, `types/verovio.d.ts`).
- Pure libs copied with their tests: `lib/music/{chords/*, metronome/*, sheet-*, score/*, live/*, syllable,
  device-type, screen, swipe}`. The AudioWorklet is bundled by `scripts/build-worklet.mjs` (entry
  `lib/music/metronome/processor.ts`, now present) to `public/metronome-processor.js`.
- Models `my-arrangements`, `my-file-views`, `sheet-marks`, `annotations` (supabase-js through
  `getMusicSupabase()`, RLS by `tenant_isolation`; `onConflict` lists name `tenant_id`). Migration
  `0010_music_sheet` (+ down): trigger `annotations_check_setlist_item`. No other function is needed.
- Policy: `music.sheet.personalize` (own capo, key, layout, zoom, marks: every workspace role), the tempo
  save uses `music.song.manage`; all sheet actions are `withPolicy` (`sheet-actions.ts`). MATRIX regenerated.
- Modules (default off, child needs parent): `ws.music.sheet` (parent `songs`), `.metronome`,
  `.midi-out` (parent `.metronome`), `.marks`, `.chord-diagrams`; in `/admin/modulok`, every workspace tier,
  and switched on in the demo churches.
- Messages `music.sheet` (informal). Chart preview restored in the song form; MusicXML preview on the edit page.
- New runtime deps (apps/web): `verovio` 6.3.0 (score engraving, WASM, as in the music app), `dompurify`
  3.4.17 (cleans verovio's SVG before it is injected).
- e2e `music-sheet.spec.ts` (sheet, key change saved, metronome, not-found, chart and score preview; axe).
  Its first run found a real bug: the upserts named `user_id,…` but the keys are `(tenant_id, user_id, …)`.

Left out, with the reason:
- Live sessions (`sheet.live`, `lib/music/live` is copied but unused): realtime transport is undecided
  (see questions). `app/munkater/kotta/live-session.ts` is a stub with the real hook's shape; the sheet never has a session.
- Events/setlist sheets (`?event=`, `?item=`, blocks, countdown, `my-setlists`): phase 4. Scripture
  readings on the sheet: phase 6. Mixer sync field of the metronome: phase 7 (`ModuleGate id="mixer"` removed).
- OCR chart reading (`chordpro-ocr`): phase 7. The `/proba` rehearsal page: not in this brief.
- Their dark theme variants of the sheet paper (Churchy has no dark theme): light paper and mark colors only
  (`app/music-sheet.css`). The offline copy of the page, page transitions.

Open questions:
1. Realtime transport for live sessions and the shared metronome grid (Supabase Realtime with the tenant
   JWT, or SSE/pg-boss, or none)? Until answered the live session stays out.
2. Which workspace roles may use the sheet's personal settings? Now every role that has `music.song.view`.

## 17. Phase 4 progress (music-04-events)

Owner decisions (2026-11-24): events mapping accepted (internal music calendar per tenant, new nullable columns on
Churchy `events`); event access area-based in SQL/RLS inside the music models, `can()` gates actions; series map onto
Churchy RRULE recurrence (`parent_event_id`/`rrule`), `copy_event`/sync stay; `service_plans.setlist_id` with two-way
song sync between plan song items and setlist items. Slices: 4a-1 schema and events core, 4a-2 setlists, 4a-3 UI, sheet
links and play statistics; 4b teams, volunteers, feed, announcements (questions 5-7 asked after 4a).

### 4a-1 (done)
- Migration `0011_music_events` (+ down): `events.setlist_id` (unique per tenant, composite FK), `youtube_url`,
  `is_private`; `service_plans.setlist_id` (unique, composite FK); `calendars.is_music` (one per tenant).
  Duration is `ends_at - starts_at` (no `duration_minutes` column).
- Music role on Churchy tables: `calendars` and `events` are in `MUSIC_TABLES` (also `MUSIC_SHARED_TABLES`); the
  `tenant_isolation` policies apply to `churchy_app, churchy_music`, plus a RESTRICTIVE `music_scope` policy for
  `churchy_music` (only the music calendar and its events). `rls.ts` checks that policy; isolation tests extended.
  Security-review label: yes (RLS, new grants).
- `music_calendar_id()` (SECURITY INVOKER) gets or creates the calendar "Zenei események" (shared, staff).
- Contract `Event`: `setlistId`, `youtubeUrl`, `isPrivate` (input: `youtubeUrl`, `isPrivate`); mock adapter and seed updated.
- Model `server/music/models/events.ts`: list, occurrences (expanded with `@churchy/events`), get, create (single or
  series via `rrule`), update, delete, change one occurrence (child event), skip one occurrence (`exdate`). Private
  events: creator and `music.event.manage` only. Libs `lib/music/{youtube,event-time}.ts` with tests.
- Policy `music.event.view` (every workspace role), `music.event.manage` (leader, music leader); MATRIX regenerated.
  Module `ws.music.events` (parent `ws.music.songs`, default off, every tier, on in the demo churches).

Deviations: no `event-series.ts` (series is an RRULE, not N copies); event areas (`area_ids`) and volunteer access come
with the volunteer tables in 4b, until then every music-event admin sees all events and members see non-private ones;
`copy_event` and the item RPCs wait for setlists (4a-2); no pages or server actions yet (4a-3).

### 4a-2 (done): setlists on events
- Migration `0012_music_setlists` (+ down): tables `event_blocks` (+ `duration_seconds`), `setlist_item_blocks`
  (both RLS, MUSIC_TABLES); functions (SECURITY INVOKER, in `public`, no `private` schema): `set_event_items`
  (without the volunteer, image-set and announcement parts, which return with their tables), `add_event_items`,
  `remove_event_item`, `add_event_arrangement`, block functions, `normalize_event_blocks`, `setlist_items_input`;
  triggers: setlists never change (`prevent_setlist_update`), unused setlist deleted when an event drops it,
  deferred `setlists_check`. `service_plans.setlist_id` FK is `ON DELETE SET NULL` (a setlist is replaced on every
  item change, the app re-points the plan).
- Models: `setlists.ts` (items, input schemas, `readSetlistItems`), `event-blocks.ts`, and in `events.ts`:
  `getEventDetail`, `setEventItems`, `addEventItems`, `removeEventItem`, `addEventArrangement`. Libs
  `lib/music/{event-items,event-items-merge,event-blocks,event-timing,church-time}` with tests.
- Plan sync: `lib/music/plan-sync.ts` (`takeSongs`, pure, tested). Rule: the side just edited wins; the other side takes
  the song sequence over and keeps its other items. The server wiring (plan editor and event page actions) is 4a-3.
- DB tests: item save/replace/delete of the old setlist, blocks, commit-time check; fixtures have an event and blocks.
- Deferred: `copy_event` (needs volunteers/images/announcements copies, 4b), scripture reference detection (phase 6,
  `looksLikeScriptureReference` left out), item volunteers (4b), image sets and announcements (projection phase).

### 4a-3 (done): pages, sheet link, statistics
- Migrations: `0013_music_stats` (`song_play_stats` and the `recent`/`oldest` sorts of `filter_songs`, which gets `p_user_id`;
  a private event counts for its creator only), `0014_events_tenant_default` (`events.tenant_id` defaults to the JWT tenant,
  so the music role can insert without naming it).
- Local PostgREST (PGlite demo layer) supports a top-level `or=(…)` filter (with `and(…)` terms).
- Pages `/munkater/esemenyek` (upcoming/past list), `/uj`, `/[id]` (setlist: search and add songs, text items, remove,
  move up/down, blocks, link to the sheet), `/[id]/szerkesztes` (edit, one occurrence via `?alkalom=`, delete). Server
  actions are `withPolicy("music.event.manage", musicEvents, …)`; nav item `musicEvents` (module `ws.music.events`,
  `music.event.view`). Strings under `music.events`. Sheet: `/munkater/kotta?event=<id>` plays an event's songs in order.
  The song details show the play history (recent, planned).
- e2e `music-events.spec.ts` (create series, songs, text item, reorder, sheet, edit, delete, read-only role; axe 0).

Deviations / not done (decisions needed marked Q):
- The events UI is new and compact (Churchy design system), NOT a copy of the music app's event pages (drag and drop
  editor, bulk series form, volunteer/teams panel, images, announcements, projection controls). Those parts belong to
  4b and the projection phase; the copy-edit of their editor can follow there. (Q: accept, or copy their editor now?)
- Plan sync is the pure rule (`takeSongs`); the actions that call it (plan editor ⇄ setlist) are not wired yet.
  (Q: the plan editor is on the mock adapter in Phase A; wire it when the plan page edits real plan items?)
- Per-slot annotations on the sheet of an event (`setlist_item_id`) and `my-setlists` stay for later; `copy_event`,
  event sync (calendar `event-sync`) and the calendar feed wait for 4b.

## 18. Phase 4b progress

Owner decisions (2026-11-25): copy their event editor in 4b (4b-2), replacing the compact pages step by step; a SEPARATE
music area tree (no `teams.parent_id`, no HR or plan contract change), area-based event access on it; keep `ical.js`, token
routes per tenant and user; play statistics count linked plan items too; wire the plan sync now; also `copy_event`,
`my-setlists`, event images, announcements, volunteers on items, calendar sync. Slices: 4b-1 areas/teams/volunteers/access/
copy_event, 4b-2 editor + images + announcements, 4b-3 feed, sync wiring, statistics, my-setlists.

### 4b-1 (done): areas, volunteers, event access, copy_event
- Migration `0015_music_areas` (+ down): tables `service_areas` (tree, per tenant, one root "Mindenki" created on first use by
  `music_root_area_id()`), `service_area_paths`, `service_area_members`, `service_area_roles`, `course_areas`,
  `volunteer_templates` (+ `_areas`, `_members`), `event_volunteers`, `event_volunteer_areas`, `event_area_notes`,
  `event_team_notes`, `setlist_item_volunteers`; `events.area_ids` (empty = everyone; a music event with none gets the root)
  and `events.volunteer_template_id`. ~40 functions ported (areas, member rights, event teams, templates, replies, access:
  `member_area_ids`, `event_member_access`, `can_see_event(.., p_is_admin)`), `set_event_items` again with volunteers
  (image sets and announcements: 4b-2), `copy_event` (items, blocks, team; images and announcements: 4b-2).
- Deletes without a tenant context (deleting a tenant) skip the "root stays / has sub-groups" checks.
- Models: `groups.ts`, `volunteer-templates.ts`, `event-teams.ts`, `event-access.ts`, `profiles.ts` (people with a login, from
  Churchy `people`), events: area access in `listEvents`/`getEvent`, `areaIds` on create/update with rights check, `copyEvent`,
  `setMyReply`. Libs `lib/music/{groups,volunteer-templates,team-grid,event-series,event-scopes}`. Auth: `leadsGroups`,
  `getLedGroupIds`, `requireGroupManager`.
- Local PostgREST: `or` terms with `{…}` array values.
- Area roles (`service_area_roles`) are stored and keep their move/delete safeguards but grant nothing through `can()` yet.
  (Q: map an area role to `music.*` actions, or drop the roles?)
- Pages, server actions with `withPolicy` and the `music.group.manage` action for groups come with the editor (4b-2).

### 4b-2a (done): area roles through can(), groups and teams UI
- Area roles (`service_area_roles`) map to actions: `song_admin` → `music.song.manage`, `event_admin` → `music.event.manage`,
  `music_leader` → both; `course_admin` waits for the courses phase. `TenantActor.musicAreaGrants` (roles of the areas the user
  belongs to, ancestors included) and `MusicAreaResource.areaIds`: `can()` allows the action when the tenant-wide matrix does
  not and a grant sits in one of the resource's areas. No area context, no area grant. MATRIX section "Music area roles".
- `withPolicy` has an actor enricher (`setPolicyActorEnricher`): for a resource with `areaIds` the music layer loads the grants
  (`server/music/area-grants.ts`). Models check through `CurrentUser.canManageIn()` / `requireEventAdminOf(eventId)` (the
  event's areas); `musicEventIn` resolves the areas of the event of an action.
- New action `music.group.manage` (leader, music leader). Pages `/munkater/esemenyek/csoportok` (tree, create, delete,
  members and leaders) and the Team section of the event page (team per area, volunteer's reply).
- Left for the next slices of 4b: the copy of their drag-and-drop editor, bulk series form, event images, announcements,
  area-role editor UI, feed, plan sync wiring, `my-setlists`, calendar sync, statistics over plan items.

### 4b-3a (done): area-role editor and feed
- Area roles are edited on the groups page (superadmin = `music.songRights.manage` only, as in the music app); area-role users
  get "Új esemény" with an area picker limited to their areas, and edit/delete events of their areas.
- iCal feed: their `ical.ts` builder (no dependency; `ical.js` is for announcement calendars, 4b-3d), token per tenant and user
  (`calendar_feeds`, SHA-256 only, consent required), page `/munkater/esemenyek/naptar`, route `/api/music/calendar/<token>.ics`
  (tenant from the host; no session; 404 in demo mode, where the data lives in a session). A volunteer's yes/unanswered events
  of the last 90 days, with the song titles.
- "Calendar sync": music events already live in Churchy's `events` table (internal music calendar), so the Churchy calendar
  shows them. The realtime part of `event-sync` (topics, projection controllers) belongs to the live-session batch.

### 4b-3c (done): plan sync
- A plan belongs to a music event through `service_plans.event_id` (button on the event page; the plan page is Churchy's).
  `server/music/plan-link.ts`: `syncPlansFromSetlist(eventId)` after every item change of an event (actions), and
  `syncSetlistFromPlan(eventId, items)` after `savePlanItems` (worship actions, module `ws.music.events` on). Rule
  `takeSongs`: the edited side wins, the other keeps its non-song items and the details of songs that stay; locked plans stay.
  Because the setlist is replaced on every change, the link is the plan's `event_id` (not `setlist_id`, which the DB keeps
  as an optional mirror and `ON DELETE SET NULL`).
- In demo mode the mock adapter's events do not contain music events (they live in the in-process music database), so a
  plan cannot be linked there; the sync is tested with mocked repositories (`plan-link.test.ts`) and works in Phase B (one DB).
- Play statistics count the setlists of events; a linked plan mirrors its event, so it adds no further plays. Plans of the
  schedule that are not linked to a music event are not counted (needs a plan read grant for the music role: open question).
- `my-setlists` (per-slot personal data of the event sheet) and the realtime part of event sync are not copied.

### 4c (done): event images, announcements, my-setlists
- Migration `0016_music_images_announcements` (+ down): `event_image_sets`, `event_images`, `event_announcements`,
  `event_announcement_entries`; 14 functions (images, announcements, `church_day` = Europe/Budapest), `set_event_items` and
  `copy_event` replaced (image sets and announcements are copied, `p_files` maps the old image paths to the copies in Storage);
  triggers (stray files bucket `event-images`, "used" marks, updated_at, calendar removal from snapshots).
- Models: `event-images.ts` (server-side WebP conversion with `sharp`, as the song images), `announcements.ts` (calendar read with
  `ical.js` and the SSRF guard `lib/music/public-address.ts`), `announcement-calendars.ts`, `my-setlists.ts` (personal view of an
  event's items; embeds replaced by reads by item id). Libs `lib/music/announcements/*`, `projection-images.ts`. Dependency:
  `ical.js` 2.2.1 (announcement calendars; the music app used the same version).
- `copyEvent` copies image files first and `deleteEvent` removes them; `?item=<id>` of the chord sheet plays one slot with the user's
  key (my-setlists).
- UI on the event page: image sets (upload, remove) and announcements (calendars, read now, exclude entries, manual entries) as
  program points; `/munkater/esemenyek/hirdetesek` (calendar sources, superadmins). Modules `ws.music.events.images` and
  `.announcements` (children of `ws.music.events`, default off). Route `/munkater/esemenyek/fajl/kep/...` serves the images.
- Left for the projection phase: `present.ts` (announcement slides) and the image adjust editor; per-slot annotations of
  `my-setlists` on the sheet.

### 4d (done): editor features
- Event items: drag and drop reorder (Up/Down buttons stay for the keyboard; a block keeps one run, `withBlocksAfterReorder`), a
  volunteer per song item (volunteers of the event; `setlist_item_volunteers` are read and written again), bulk series form
  `/munkater/esemenyek/uj/sorozat` (one weekly RRULE series per time slot; at most 200 occurrences).
- Not copied: the projection controls and announcement slides / image adjust editor (phase 5), the per-slot annotations of
  `my-setlists` on the sheet (the sheet shows no annotations yet; the annotation UI is its own piece of work).


## 19. Phase 5 progress (music-05-projection)

Owner decision (2026-11-25): realtime transport = Supabase Realtime with the tenant JWT; channels namespaced per tenant,
authorization by policies on `realtime.messages`; the PGlite demo gets a local `BroadcastChannel` transport with the same
interface. Slices: 5a projection themes/viewer/controller, 5b live sessions + realtime + shared metronome, 5c announcement
slides, image adjust, event-editor controls.

### 5a (done): themes, controller, screen, overlay
- Migration `0017_music_projection` (+ down): `events.projection_theme_id` (composite FK, `ON DELETE SET NULL (col)`),
  table `event_projection_controllers` (RLS, `table-scopes`, isolation fixture), theme triggers (updated_at, stray files for
  image and video), `keep_default_projection_theme` (per tenant, deferred), `set_default_projection_theme`,
  `default_projection_theme_id()` (gets or creates the tenant's default theme), `set_event_item_theme`, video upload
  functions, `touch_projection_controller` (5 rows per user and event), `can_project_event(event, user, is_admin)`,
  `check_open_projection_before_delete` (header `x-app-end-projections`; skipped without tenant context), `copy_event`
  replaced (copies the event theme). All SECURITY INVOKER.
- Realtime authorization: `public.music_realtime_allowed(topic, send)` compares the topic with the claims `rt_topics` /
  `rt_send` of a short-lived token minted by the server (`server/music/realtime.ts`, after `can()` and the models decided:
  `authorizeRealtimeTopics`); policies on `realtime.messages` are created only where that table exists. No table read, so no
  `security definer` (the music app used definer functions reading `event_volunteers`/`user_roles`; deviation).
  Topics: `t:<tenant id>:projection:event:<id>`, `…:event:<id>`, `…:live:<id>`.
  Client: `lib/music/realtime/{client,browser}.ts` (supabase-js or local BroadcastChannel; same channel subset the copied
  hooks use). Server action `realtimeTokenAction`. NOT verifiable here: a real Supabase Realtime project must accept the
  token (role `authenticated`, HS256 with the project secret) - see open questions.
- Policy: `music.projection.use` (every role; the model checks volunteer / event admin through `can_project_event`),
  `music.projection.themes.manage`, `music.projection.themes.setDefault` (leader, music leader). MATRIX regenerated.
- Modules (default off, child needs parent): `ws.music.projection` (parent `ws.music.events`) with `.themes`,
  `.text-slides`, `.overlay`, `.countdown`, `.pptx-export`; nav item "Vetítési témák".
- Copied (imports, routes, strictness edited): libs `lib/music/projection/*` (slides, protocol, themes, overlay, images,
  quick-items, pptx, videos, fonts, running) and `lib/music/scripture/{passage,books,reference,translations,...}` (pure, the
  slide model needs them), `lib/music/announcements/present.ts`, `xml`, `zip`, `pending-saves`; models
  `projection-themes`, `projections`, `event-sync`, `realtime-access`; components `event-changes`, `block-*`, `user-avatar`,
  `row-menu`, `color-field`; pages `/munkater/vetites` (controller), `/kepernyo`, `/overlay`, `/munkater/vetitesi-temak`
  (themes, background image and video), file routes `fajl/hatter`, `fajl/video`. Messages `music.project`,
  `music.projectionThemes`. Projection files are served under `/munkater/...` paths; the URL patterns of the libs follow.
- Server actions are `withPolicy` and unwrapped for the client by `actions-client.ts` files.
- Tests: copied lib tests, themes model tests, DB tests (default theme, controllers, delete block, realtime claims),
  e2e `music-projection.spec.ts` (axe 0).

Left out in 5a, with the reason:
- Bible panel, scripture text, paste dialog, roll slides: phase 6 (stubs `bible*.ts`, `scripture*.ts` keep the copied
  controller's shape).
- Quick add and the items editor ("edit" mode) of the controller: they are built on the event editor components -> 5c.
- Rehearsal projection (`?rehearsal`) and the mixer sync button: the rehearsal page / mixer are later phases.
- `check_projection_users` (loss of access of an open projection): needs roles in SQL; the controller revalidates on each
  heartbeat instead.

### 5b (done): live sessions, event sync, shared metronome
- Migration `0018_music_live` (+ down): table `live_sessions` (event xor rehearsal list, one running session per event,
  RLS, scopes, isolation fixture and DB test) and the event-sync notices: `public.notify_event` (SECURITY DEFINER, the one
  exception: the music role cannot reach the `realtime` schema; it reads only the event's tenant and does nothing where
  `realtime.send` does not exist) with invoker triggers on events and their parts, sending `{kind, author}` to
  `t:<tenant>:event:<id>`.
- Model `live-sessions.ts` (start event/rehearsal session, join, hand over, take lead, end; access: volunteers of the event, event
  admins who can see it; only a volunteer starts an event session). Realtime topic `live:<id>`: the leader's token has `rt_send`.
  The sheet (`?session=<id>`) shows the session's event or list of arrangements; `useLiveSession` is the copied hook over the
  transport; header controls `LiveControl` / `StartLiveControl`; the shared metronome grid, the leader's key and place are the
  copied pure libs (`lib/music/live/*`). The event page refreshes on notices (`EventSync`), the projection controller follows the
  leader of the event's session (`leader.ts`).
- Policy `music.live.join`, `music.live.lead` (every role; the model decides); module `ws.music.sheet.live`.
- e2e `music-live.spec.ts` (start, lead, join in a second window, unknown session; axe 0). The local transport carries it in
  the demo (windows of one browser).
- Left out: web-push on session start (notifications phase), the rate limit of rehearsal sessions, the live session in the search
  palette, `check_projection_users`. The sheet of an event session uses the occurrence ids of the sheet (arrangement id and
  number) for the leader's place and keys, the same for every participant.

### 5c (done, in part): event-editor controls, announcement slides, image adjust
- Announcement slides: `announcementSource` (`lib/music/announcements/present.ts`, copied with its tests) builds the slides of an
  announcements item in the projection model (`getEventProjection`); the image-adjust editor (`image-adjust-dialog.tsx`,
  `updateEventImageAction`) opens from the controller's gallery. Both were copied in 5a because the controller needs them.
- Event page: the projection theme of the event and of each item (`ThemeSelect`, `setEventThemeAction` /
  `setItemThemeAction`, module `ws.music.projection.themes`; users who may project the event and event admins), the
  "Kivetítés" button, delete with "end the open projection" (`deleteEvent(id, { endProjections })`, header
  `x-app-end-projections`; `ProjectionOpenError` from the database hint). The default theme of a church is made on the first read.
- e2e: theme chosen on the event page and kept (axe 0).

Not done (needs a decision or the copy of the whole event editor, which is still the compact Churchy page):
- Quick add of the controller (`QuickAddBox`: song, text slide, images, announcements while projecting) and the items editor
  ("edit" mode of the controller): they are built on `AddItemBox`, `setlist-rows`, the image upload (images, PDF, PowerPoint
  pages) and `AnnouncementItem` of the music app's event editor. Copying that editor (about 6k lines) is its own slice; the
  controller has a stub (`quick-add.tsx`) with the copied shape. Module `ws.music.projection.quick-add` is not registered until then.
- Per-slot annotations of `my-setlists` on the sheet: not small (an annotation UI in the chord sheet viewer, the `annotations`
  model exists): left for the editor slice.
- Rehearsal projection (`?rehearsal`) and the mixer sync button (rehearsal page / mixer phases).

### Open questions (phase 5)
1. Realtime with the minted token: please confirm on a real Supabase project that Realtime accepts an HS256 token signed with the
   project JWT secret with `role: authenticated` and extra claims `rt_topics` / `rt_send`, and that `realtime.messages` policies
   created by migration 0017 apply (`realtime.send` is used by `notify_event` as a SECURITY DEFINER function).
2. Copy the music app's event editor (drag-and-drop editor, `AddItemBox`, quick add, per-slot annotations) now, as one slice?
3. Live sessions: web-push on start and the rate limit of rehearsal sessions wait for the notifications phase (OK?).

## 20. Phase 5d: rehearsal-session rate limit; push (open)
- Rehearsal sessions: at most 20 per user and hour (`REHEARSAL_SESSIONS_PER_HOUR`, in-memory limiter as the request forms;
  moves to the DB/edge with the request limiter in Phase B). Test `live-sessions.test.ts`.
### 5d-2 (done): web push for live sessions  [security-review]
- New runtime dependency `web-push` 3.6.7 (+ `@types/web-push`): VAPID signing and the encrypted push protocol; nothing in the
  stack covers it, and the music app used the same library.
- Configuration only from the environment: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` or `https:`); never
  committed. Without all three push is off. The demo refuses to start with `VAPID_*` set (`lib/demo/safety.ts`, existing rule) and
  shows the notice "not switched on (demo)" on the page.
- Service worker `/munkater/sw.js` (route handler, `Service-Worker-Allowed: /munkater/`): shows the push, opens its link; no cache,
  no fetch handler. Public hosts never register it.
- Page `/munkater/ertesitesek` (module `ws.music.sheet.live`, action `music.live.join`): this device on/off (subscription of the
  browser into `push_subscriptions`, at most 10 per user) and the preference `notification_preferences.live_session` (default yes).
- Sending: `notifyLiveSessionStarted` after a NEW event session starts, to the volunteers of the event except the leader, those who
  replied "no" and those who switched it off; endpoints that the push service reports gone (404/410) are removed. The payload is a
  fixed title and text, the link `/munkater/kotta?session=<id>` and a tag: no name, no event title. A failure never fails the start.
- Tenant isolation: the tables are tenant tables with RLS; the volunteers' user ids are the music profile ids, the same space as
  `push_subscriptions.user_id`, so no id mapping is needed. `endpoint` is unique across tenants: a device registered in another
  church is refused, not taken over.
- Tests: `push.test.ts` (config, send, gone endpoints, link guard), e2e `music-notifications.spec.ts`.
- Needs a real device and a real Supabase project to verify end to end (not possible here).

## 21. Phase 5e-1: the event editor (copy-edit)
The compact event page (`items-panel`, `media-panel`, `team-panel`, `theme-select`, `event-sync`) is replaced by the music app's
event editor, copied with its imports, strictness and routes edited (`app/munkater/esemenyek/editor/*`, `components/music/{setlist-rows,
add-item-box,text-kind-menu,run-sheet,people-picker,confirm-action-button,volunteer-reply,print-setlist,group-option,date-badge,avatar-picker}`,
`lib/music/{volunteer-replies,pptx-slides,pdf-pages,modules/*}`, `app/munkater/enektar/edit-song-dialog.tsx`): summary with edit-details and
more-menu (copy, delete with "end the open projection"), items form (drag and drop with pointer and keyboard, blocks with countdowns, selection,
volunteer per item, theme per item, print), image items (upload of images, PDF and PowerPoint pages), announcements items, teams dialog,
volunteers list and replies, edit-song dialog, live-session join link, projection status, `EventTheme` select.
- Data layer: `editor/data.ts` resolves the page on the server (`loadEventPage(id)` -> `{ data, transient }`, always fresh): there is no
  browser page cache, `loadPage` or stale copy notice; `EventView` takes plain props. The page wraps it in `MusicModulesProvider` with the
  music-app module ids (`projection`, `projection.themes`, `projection.images`, `projection.announcements`, `projection.text-slides`,
  `sheet`, `sheet.live`; `scripture` is off until phase 6). Whoever may manage the event in its areas (`canManageIn`) gets the edit controls.
- New model functions (`events.ts`): `listEventVolunteers`, `addEventVolunteer`, `removeEventVolunteer`, `listUpcomingEventsForVolunteer`,
  `listGroupLabels`, `loadEventScopeOptions`, `usedGroupLabels`; `setEventItems` returns the current items when the setlist changed;
  `updateEvent` takes `endProjections`. Plus `getSongFormValuesAction` for the edit-song dialog.
- Server actions are `withPolicy` (`music.event.manage`, `music.event.view` for replies and teams) with `*-client.ts` unwrappers; the image
  and announcement actions use the module-only resolver `musicEventModule`.
- Messages: the source `events`, `announcements` (and the notification settings) parts are merged into `music.*` where keys were missing;
  `events.items.full` is the source's plural form now.
- e2e `music-events.spec.ts` rewritten for the editor (add song and text item by the combobox, autosave and reload, edit and delete through the
  dialogs, images and announcements items, drag with the handle); an a11y fix of the row select button (its name starts with the visible number).
- Left for 5e-2: quick add and the controller edit mode (still the stub), and the scripture reference detection (phase 6,
  `looksLikeScriptureReference` returns false). 5e-3: per-slot annotations.

## 22. Phase 5e-2: quick add and the controller's edit mode
- `vetites/quick-add.tsx` is the copy of the music app's quick add (song search and add, text slide, images, PDF/PowerPoint pages,
  announcements, new song, SongPraise) over the copied `AddItemBox`, `event-image-upload` and `announcement-item`; `vetites/items-editor.tsx`
  is the "edit" mode of the controller (the event page's items form inside the controller) with `eventItemsEditorAction` and the reload of its
  parts after each change notice (`useEditorReload` in `event-controller.tsx`).
- Actions (`withPolicy`, `*-client` unwrappers): `listQuickAddCatalogAction`, `listRehearsalSongsAction` (module `.quick-add`),
  `eventItemsEditorAction` (`music.event.manage`, the event's areas), `createSongInPlaceAction` (`music.song.manage`).
- New module `ws.music.projection.quick-add` (child of `ws.music.projection`, default off, in the demo seeds and `/admin/modulok`).
- e2e: the controller's quick add adds a song to the event (axe 0).
- Left: the rehearsal projection (`?rehearsal`) still waits for the rehearsal page.

## 23. Phase 5e-3: the user's notes on the chord sheet
The music app has the `annotations` table and reads them in `my-setlists`, but its sheet shows no notes (there is no UI to copy), so this
is new, small UI over the existing model: `kotta/annotations-button.tsx` (header popover of the song on the sheet: the notes with their
section and "this slot only", add, edit, delete), server actions `annotation-actions.ts` (`withPolicy` `music.sheet.personalize`, `*-client`
unwrapper), messages `music.sheet.annotations`. Event sheets pass the setlist slot of each song (`slot` parameters from the event and item
routes), so a note can belong to one slot (`setlist_item_id`, checked by the existing trigger); the sheet data loads the user's notes of the
songs (`listMyAnnotations`) and keeps those of every arrangement plus those of the slot. Notes are not drawn inline in the chart yet.
e2e `music-annotations.spec.ts` (add, see, reload, delete; axe 0).

## 24. Phase 6: scripture and psalms

Decisions by the product owner (2026-11-27): Károli 1908 is the platform catalog, committed as the
static files `apps/web/public/bible/karoli1908/<book>.json` (4.2 MB, `{ "chapters": string[][] }`, from
the SWORD `HunKar` module by `apps/web/scripts/import-bible.mts`). **Its public-domain status is
asserted by the owner and not verified here** (the module's `.conf` is not in the repository). Other
translations are per church, under the church's own licence (no real copyrighted translation text in the
repository; fixtures use fictitious text). Tenants upload full text in the same JSON format. Source links
become optional per-translation mappings. Hungarian only.

### 6a (done): catalog, models, parsing
- Migration `0019_music_scripture` (+ down): table `scripture_translations` (per tenant: id, name, short
  name, notice, source `pasted` | `database`, deuterocanon, enabled, `source_links`; id `karoli1908`
  reserved), composite FKs from `scripture_books` / `scripture_verse_cache` (platform rows with
  `tenant_id` null are not affected), `tenant_id` default of both, `app_config.scripture_ruf` dropped
  (the hard-coded RÚF mode is replaced by translation rows; `scripture_karoli` stays), RLS + grants,
  `table-scopes.ts` (`tenant`). Platform rows (Károli, if ever stored) are readable by every tenant
  (`catalog_read`) and written by the owner only. `put_scripture_cache_verses` is tenant-aware
  SECURITY INVOKER (limits: 331 verses per church, less than half a book, 24 h; the pg_cron expiry of
  the source is not migrated: reads filter expired verses and every paste deletes them). No SECURITY DEFINER.
- Pure libs copied: `lib/music/scripture/{paste,search,load,more,cache-limits}` (+ tests);
  `translations.ts` rewritten for the model above (`ScriptureConfig = { karoli, own }`, no `RUF`);
  `cache-limits` without the daily-psalm share. `looksLikeScriptureReference` now parses references.
  Text of a "database" translation is served by `/munkater/biblia-szoveg/<translation>/<book>`.
- Models `scripture-translations`, `scripture-books`, `scripture-cache` (supabase-js, RLS, rate limit
  30 pastes / 15 min / user); policy actions `music.scripture.use` (every role) and
  `music.scripture.translations.manage` (leader, music leader), MATRIX regenerated; modules
  `ws.music.scripture` (child of `ws.music.events`) and `ws.music.projection.bible-panel`, default off.
- Tests: translations, cache-limits (against the files), paste, search, more, reference, model schema;
  isolation suite (translation per tenant, reserved id, cache limits, cross-tenant cache); PGlite bundle regenerated (+7 KB).
- Not yet (6b): Bible panel, paste dialog, roll slides, readings UI, translations page. (6c): daily psalm,
  sheet scripture items. `lib/psalms/hu.ts` of the source is 169 verses of RÚF 2014 (copyrighted) and is NOT copied.

### 6b (done): Bible panel, paste dialog, roll slides, translations page
- The 5a stubs are replaced by the copies of the music app (`vetites/{bible,scripture,bible-panel,paste-scripture-dialog,scripture-roll}`,
  `components/music/scripture-translation-select`), copy-edited for imports and strictness; the language select shows only when a church has a
  text in a second language (Hungarian only). The controller, the event editor, the print view and the add-item box read the church's translations
  from `MusicModulesProvider` (`scripture` prop, `useScriptureTranslations`); the layout of `/munkater/vetites`, the event page and `projections.ts`
  `onModules()` use the real module flags (`ws.music.scripture`, `ws.music.projection.bible-panel`).
- New server actions `cachedVersesAction` / `cacheVersesAction` (`withPolicy` `music.scripture.use`, resolver `musicScripture`, `actions-client` unwrappers).
- Page `/munkater/biblia-forditasok` (nav "Bibliafordítások", module `ws.music.scripture`, action `music.scripture.translations.manage`): the Károli switch,
  add/edit/delete the church's translations (id, names, notice, source pasted/database, optional site mappings), JSON upload of a book of a "database"
  translation. Messages `music.bibleTranslations`; the messages that told a superadmin to use the Configuration tab and that spoke of a shared cache now speak of the church.
- Fixes found by e2e/axe: dialogs got `z-50` (`dialog-parts`: a dialog opened over the projection controller, itself `z-50`, was unreachable);
  the book buttons of the Bible panel have an accessible name that starts with their visible abbreviation.
- e2e `music-scripture.spec.ts` (translations page with upload and delete, Károli text of a reading on the controller, pasted translation through the
  controller dialog and cache; axe 0). The existing projection, events and live specs still pass.

### 6c (done): daily psalm and the scripture items of the chord sheet
- Daily psalm: `lib/music/daily-psalm.ts` (the day's psalm number as in the music app, plus `psalmExcerpt`) and `components/music/daily-psalm.tsx`. The text comes
  from **Károli 1908** (`public/bible/karoli1908/Ps.json`): from the first verse on, up to three verses and about 260 characters. The curated RÚF excerpts
  of the music app (`lib/psalms/hu.ts`) are not copied (copyrighted). Shown on the workspace home (Ma) with the module `ws.music.scripture.daily-psalm`
  (child of `ws.music.scripture`, default off, in the demo seeds and `/admin/modulok`); collapsible per day like in the music app. Messages: reference
  "(Károli)", new "failed".
- Chord sheet: an event sheet (`?event=`, a live session of an event) now shows the event's text items between the songs, in the order of the event
  (`withEventTextItems`, `toSheetText` of the music app; text items of modules that are off are hidden; an event with text items only works too). A scripture reading shows
  its verses under the reference (`ScriptureVerses`, loading, failed, needs-text with retry, notice) from the church's translations (`SheetPageData.scripture`
  via `MusicModulesProvider`); a single slot (`?item=`) still shows its song only.
- Tests: `daily-psalm.test.ts`, e2e `music-scripture.spec.ts` (sheet with reading between songs, psalm of the day with collapse, axe 0); sheet, live, annotations and workspace specs still pass.
- Deviation from the music app: the daily psalm is not curated (the first verses of the day's psalm, so a title verse can be the excerpt); a curated Károli list can replace `psalmExcerpt` later.

## 25. Phase 7a: OCR "Read text" (copy-edit)
- Copied (imports, tokens, strictness edited): `lib/music/ocr/*` (engine, Tesseract.js engine in a Web Worker, fake engine, `readChart`) and
  `lib/music/chordpro-ocr.ts` (+ tests), `app/munkater/enektar/read-chart-dialog.tsx`. Messages were already in `music.songs.form.ocr`
  and `music.songs.images.readText`.
- UI: "Beolvasás képről" on the chart field of the song form (shows the song's images as page sources) and "Szöveg beolvasása" on each image
  row of the edit page; the result goes into the chart with the existing "Visszavonás" (`BeforeInsert` source `ocr`). Gated by the module
  `ws.music.songs.ocr` (child of songs, default off, already in the registry, demo seeds and `/admin/modulok`). `MusicModulesProvider` now
  merges with its parent and the new `MusicModuleFlags` in the `/munkater` layout gives `songs.ocr` to every page that renders a song form
  (event editor, projection quick add, edit dialog).
- **Hungarian only** (PLAN 11.1): the engine loads `hun` only; `scripts/copy-tesseract.mjs` copies `hun.traineddata.gz` only and the
  `@tesseract.js-data/eng` dependency is removed (lockfile -8 lines). The worker, WASM core and `best_int` data are served from
  `/tesseract/` (git-ignored, copied by `dev`/`build`); there is no CSP in Churchy to widen.
- The recognition runs on the device: no server action, no table, no migration, so no new policy action (the form that hosts it is already
  behind `music.songs.*` and the module).
- Tests: `chordpro-ocr.test.ts`, `ocr/read-chart.test.ts`, `ocr/tesseract-engine.test.ts`; e2e `music-ocr.spec.ts` (draws a Hungarian line on a
  canvas, reads it with the real engine, inserts it; axe 0).
- Licensing, to confirm by the owner: Tesseract.js (Apache-2.0), tesseract.js-core (Apache-2.0) and the `best_int` Hungarian data from
  tessdata_best (Apache-2.0) are bundled as shipped by npm; nothing is downloaded from a CDN.

## 26. Phase 7b: songbook to hymnal refs, production import script
- Migration `0020_music_hymnal_refs` (+ down): `public.merge_songbook_hymnal_refs(p_dry_run boolean default false)`, SECURITY INVOKER,
  tenant from `app.current_tenant_id()`, granted to `churchy_app` only (the music role has no grant on `hymnals`). It splits the
  songbook text of every song of the tenant on `;`, reads `<name or abbreviation> <number>`, matches accent- and case-insensitively
  (`search_key`) a hymnal of the platform catalog or of the church, and inserts `song_hymnal_refs` (`ON CONFLICT DO NOTHING`).
  The text stays; unmatched entries are ignored; it returns one row per match with `inserted`. No schema change, so no table-scopes entry.
  Isolation suite: dry run writes nothing, a run inserts, the second run inserts nothing, another tenant sees nothing, no tenant fails.
- No UI and no policy action yet: it is an operator/SQL tool, run after the import (`docs/music-merge/IMPORT.md`). A button on the
  songbook field can call it through a `withPolicy` action later (needs an owner decision on who may press it).
- `packages/db/scripts/import-music-prod.ts` (`pnpm --filter @churchy/db import:music`): see `IMPORT.md`. Test `import-music.db.test.ts`.

## 27. Phase 7c-1: the mixer (browser side)
- The "mixer" of the music app is the sync of the **tempo to a digital mixing desk** (X32/M32 delay effects over OSC or MIDI SysEx, Allen & Heath
  SQ taps), not an audio mixer for sound files; there is no such mixer in the source.
- Copied (imports, tokens, strictness edited): `lib/music/mixer/*` (settings, x32, sq, osc, chart-tempo, desktop-bridge, tests), the page
  `/munkater/keverpult` (setup form, `mixer-sync.tsx` with `useMixerSync` / `MixerSyncField`), `vetites/mixer-sync-button.tsx`; the model
  `server/music/models/mixer-settings.ts` now uses `getMusicSupabase()` (table `mixer_settings`, one row per church, RLS).
- Module `ws.music.mixer` (child of songs, default off, nav "Keverőpult", `/admin/modulok`, demo seeds). The metronome popover shows the
  sync field (`ModuleGate id="mixer"`), the projection controller the sync button; both use the flag `mixer` of the page's modules.
- Policy: `music.mixer.use` (every role; read the setup) and `music.mixer.setup` (leader, music leader), MATRIX regenerated; actions
  `mixerSettingsAction` / `saveMixerSettingsAction` (`withPolicy`, `musicMixer` resolver). The page gate uses `can()`, not role flags.
- **Live sync**: the desk follows the leader's beat grid of a live session, which already travels over the phase 5 realtime transport
  (per-tenant channels, tenant token, demo BroadcastChannel stub); `useMixerSync` takes that grid and clock. No new channel was needed.
- **Desktop app**: browser side only. `desktop-bridge.ts` keeps the interface (`window.desktopApp.x32/sq`); without the Electron app the
  bridge is null, so network desks cannot be reached (MIDI desks work through Web MIDI). The Electron main-process code is not copied.
- Messages `music.mixer.*`, `admin.modules.workspace.items.music_mixer`, nav `musicMixer`. Tests: the copied unit tests of `lib/music/mixer`,
  policy matrix, e2e `music-mixer.spec.ts` (setup saved and kept after reload, volunteer sees no form; axe 0).

## 28. Phase 7c-2: rehearsal page and `?rehearsal` projection; Toaster
- Toaster: `components/music/ui/toast` (Churchy tokens, base-ui Toast, `lib/music/toast`) is mounted once in the `/munkater` layout, so the
  copied forms show their saved/error toasts ("Elmentve."); the mixer e2e asserts it.
- Page `/munkater/proba` (nav "Próba", module `ws.music.rehearsal`, child of songs, default off, `/admin/modulok`, demo seeds): copy-edit of the
  rehearsal route (`rehearsal-builder`, `song-catalog`, `draft` in localStorage, header). The page cache layer of the source (`PageResult`,
  `usePageData`, `StaleCopyNotice`, `page-keys`) is not used: Churchy renders the page on the server (`data.ts`), the builder keeps the draft in the browser.
- "Save to event": `saveSetlistAction` (`withPolicy` `music.event.manage`, `musicEvents`); an existing event gets the items after its own
  (`addEventItems`), a new one is created. New models `listEventsByTime` (events by time with the item count of their setlist) and
  `createEventWithItems`. Churchy has no `create_event_with_items` function (not migrated, no migration added): the event is created, then its
  items are set, and the event is removed if setting them fails (not one transaction).
- Projection `?rehearsal` on `/munkater/vetites` and `/munkater/vetites/kepernyo`: `RehearsalProjectionController` (copy-edit) reads the draft of the
  browser, loads the songs with `rehearsalSongsAction` and the default look with `defaultProjectionLookAction` (both `music.projection.use`,
  resolver `musicRehearsal`: module `rehearsal` instead of the quick-add child). Channel stays local (BroadcastChannel); the module off is a 404.
- Policy: no new action (page view `music.song.view`, saving `music.event.manage`, projection `music.projection.use`).
- Not ported: the source's search palette (Churchy has its own navigation; its Bible/rehearsal entries have no counterpart), its offline page copies.
- Tests: e2e `music-rehearsal.spec.ts` (setlist built, kept after reload, saved as a new event, `?rehearsal` controller; volunteer has no save panel; axe 0).

## 29. Phase 8a: courses
- Owner decisions for phase 8: pg-boss is added as a runtime dependency for the nightly jobs (8c; reason: the stack names it, there is no
  other job runner); the per-DB AI key functions (`set_song_rights_research_api_key`, `song_rights_research_api_key`) are dropped in favour
  of the platform `ANTHROPIC_API_KEY` and a per-tenant cap; notification kinds become `music.*` kinds on Churchy's outbox and push stack
  (payload = reference + link); Resend is dropped (email through `packages/email` and the outbox).
- Migration `0021_music_courses` (down included): the tables existed since phase 1/4b; this adds `courses.position` identity, the updated_at
  and stray-file triggers, and the functions of the courses migrations in their final form as SECURITY INVOKER `public.*`. Admin checks
  take `p_is_admin` (no `user_roles` view): the server derives it. New helpers: `can_read_course_image`, `purge_removed_courses`,
  `remove_unused_course_images` (the pg_cron bodies, run per tenant by the 8c job). Isolation test added; PGlite bundle regenerated.
- Policy: `music.course.view` and `music.course.edit` (every role; the model checks, a leader of the groups of a course edits it) and
  `music.course.manage` (leader, or a `course_admin` area role of any group: the resolver names all the actor's groups). MATRIX regenerated.
- Module `ws.music.courses` (child of songs, `/admin/modulok`, demo seeds, nav "Tudástér"), pages under `/munkater/kepzesek`, image route
  `/munkater/kepzesek/kep/<path>`; copy-edit of the course models, editor, list and lesson pages; messages `music.courses.*`.
- `apps/web` now declares `@tiptap/pm`, `@tiptap/react`, `@tiptap/starter-kit` (`^3.34.0`, the versions `packages/ui` already uses; no new
  packages in the lockfile) for the copied rich-text editor. `removed_courses()` replaces the `draft->>title` select (the local PostgREST of
  the demo cannot do it). `ws.music.courses` is on in the demo seeds, off for real tenants until switched on.
- Tests: isolation test (draft/publish/visibility/area delete/purge, per tenant), copied `rich-text.test.ts`, policy matrix, e2e
  `music-courses.spec.ts` (leader creates a course, volunteer cannot; axe 0; desktop and mobile).

## 30. Phase 8b: notifications (outbox, push for the remaining kinds)
- Kinds (as in the source): `event_added`, `event_reminder`, `setlist`; `live_session` (push only) came with phase 5d. The source `welcome` kind
  is dropped (Churchy has its own `member.invitation` mail). Each kind goes to the **outbox** (email, `packages/email`, new template keys
  `music.eventAdded`, `music.eventReminder`, `music.setlist`, visible in the outbox viewer) and, on the devices with the push consent, to
  web push. Resend, the DB-stored email templates and their superadmin editor are **not ported** (decision: email only through the outbox
  and React Email templates); the `email_templates` table stays unused. Churchy has no mail transport yet, so nothing is delivered by mail.
- Privacy: the email and the push carry **no names, no event title and no setlist content**: the email has the event start time and an app
  link (`/munkater/esemenyek/<id>`, the setlist `/munkater/kotta?event=<id>`), the push a fixed text and the link. The source put the title,
  the setlist items and the volunteers' names into them. Outbox params are the event id, the start time and the link (short scalars).
- Migration `0022_music_notifications` (down included): table `notification_deliveries` (tenant table, RLS, scopes; deleted with the volunteer),
  `list_due_notifications`, `reset_notification_deliveries` + trigger on `events.starts_at`. `consume_cron_token` is dropped (pg-boss, 8c).
- `server/music/notifications.ts` (copy-edit of the source `notifications.ts`): `queueEventAddedNotifications` (called after teams are set, a
  volunteer is added and a copy keeps volunteers; never for oneself), `notifyEventAdded`, `sendDueNotifications(db, tenantId)`. They take
  the client of one church (`db`) so the 8c job can run them per church; `sendPush` now also returns `sent` and `failed`.
- Preferences: `models/notification-preferences.ts` and the form on `/munkater/ertesitesek`: emails, the three kinds, the days
  and hours; no time zone field (the church's zone). The page now needs the events module (nav likewise); device registration no longer needs
  the live module. `music.notifications.*` lost the template editor keys.
- Tests: unit (`notifications.test.ts`: added, started event, due run, told-when-added), isolation (`list_due_notifications` windows, deliveries,
  reset on a new start time, volunteer cascade, other church), e2e (preferences saved and kept, axe). Not verified: real push delivery (no VAPID).

## 31. Phase 8c: background jobs (pg-boss), nightly rights research
- **New runtime dependency `pg-boss` 12.38.2** (apps/web; owner decision 2026-11-28): the SDD stack names it as the job runner and nothing
  else in the repo can schedule per-church work; it replaces pg_cron, pg_net and `consume_cron_token`. Node 22.12+ (already required).
- **Worker** `apps/web/server/jobs` (`pnpm worker`, runbook `docs/runbooks/jobs-worker.md`): `config.ts` (demo off with a notice,
  `PGBOSS_DATABASE_URL` else `DATABASE_URL`), `handlers.ts` (each job for every church in turn, failures isolated and logged without data),
  `steps.ts` (the work), `main.ts` (queues, schedules, graceful stop). The models run in a church's scope with `runWithMusicClient`
  (an `AsyncLocalStorage` that `getMusicSupabase()` honours) and `createMusicJobClient(tenantId)` (a tenant token per request, since a
  research run lasts minutes).
- Jobs: due notifications (15 min), rights research (10 min, 00:00-04:59), hourly cleanup (stray files, unused sets/announcements, closed
  projection controllers, expired verse cache), nightly cleanup (`purge_removed_courses`, `remove_unused_course_images`).
- **Rights research**: migration `0023_music_rights_batch`: `claim_songs_for_rights_research` (nightly limit and advisory lock), and the
  `enabled` check no longer needs a saved key (the platform key is used; `song_rights_research_settings.api_key_hint` stays unused). The
  per-database key functions `set_song_rights_research_api_key` / `song_rights_research_api_key` are **not ported** (decision: platform
  `ANTHROPIC_API_KEY` + per-tenant cap). `runScheduledResearch(limit)`: needs the setting on, the key, `musicResearchPerMonth > 0` and what
  is left of the month. The song-rights page got the on/off switch and the songs per night (`saveResearchSettings`).
- **Security (label `security-review`)**: the worker holds a database role that can read `tenants` and create the `pgboss` schema, and the
  Supabase JWT secret (to mint tenant tokens with `sub` = a fixed job id); church data is reached only through tenant tokens and RLS;
  no personal data in logs; the demo refuses the worker's URL. The AI key is an environment secret, never stored per church.
- Tests: `config.test.ts`, `handlers.test.ts` (per-church isolation, caps), isolation test for the batch claim. e2e: adding a volunteer queues the
  "added" mail in the outbox viewer (subject with the time, no title). Not verified: a real Supabase project, a real push, the Anthropic call.

## 32. Phase 9a: permission mapping audit (PROPOSAL, nothing changed; owner decision needed)

Matrix columns: L leader, E employee, V volunteer, TL teamLeader, ML musicLeader, RM, HR, CH (`packages/policy/MATRIX.md`, "Music:" rows). Churchy has no
role named after the source's five; today every tenant-wide music "manage" action is `{ leader, musicLeader }`, plus area roles (`service_area_roles`).

### 32.1 The source's five roles (`music-sheet-db-main/src/lib/roles.ts`) and what Churchy does now
| Source role | Source could | Today in Churchy (tenant-wide) | Today via area role (`musicAreaGrants`, only in that area) |
|---|---|---|---|
| (member, no role) | see songs, events of own groups, own notes | `*.view`, `sheet.personalize`, `projection.use`, `scripture.use`, `mixer.use`, `live.join/lead`, `course.view/edit`: every workspace role | -- |
| `song_admin` | add/change/delete songs | `music.song.manage`: L, ML | `song_admin`, `music_leader` area role |
| `event_admin` | events, items, volunteers, setlists; mixer setup | `music.event.manage`, `music.group.manage`, projection themes manage/setDefault, mixer.setup, translations.manage: L, ML | `event_admin`, `music_leader` area role (event.manage only) |
| `music_leader` | join/lead every live session; mixer setup | ML column = same as L for all music actions (it is ALSO the source's event_admin + song_admin + superadmin-lite, see 32.3) | `music_leader` area role = event.manage + song.manage |
| `course_admin` | manage all courses | `music.course.manage`: L only | `course_admin` area role of any group |
| `superadmin` | all roles + users, email templates, Bible translations, song rights/research, sees all events, edits area roles | `music.songRights.manage`: L, ML (used as `isSuperadmin`) | any area role (matrix row "any area role" for songRights) |

Source roles are not stored in Churchy: the two systems meet only through workspace roles (L, ML) and the area roles (song_admin, event_admin, music_leader, course_admin) of `service_area_roles`, which the source also had ("groups"). So the 5 roles map as: song_admin, event_admin, music_leader, course_admin -> area roles (same names, scoped to a group and its descendants, as in the source); superadmin -> L (and ML, see Q1).

### 32.2 Places that decide by something other than `can()` (all in `apps/web`)
| # | Where | Mechanism | Derived from |
|---|---|---|---|
| 1 | `server/music/auth.ts` `CurrentUser.isSuperadmin` | alias of `can(music.songRights.manage)` | used for: group-area role editing + emails of people (`models/groups.ts`, `event-teams.ts`, `events.ts` reply names), `unnamedHidden`, announcements admin page + calendars (`announcements`, `announcement-calendars.ts`), song-rights page, projection theme default (`projection-themes.ts`, `vetitesi-temak/page.tsx` `canSetDefault`), `esemenyek/page.tsx` links |
| 2 | `CurrentUser.canEditSongs` / `canEditEvents` | `can(song.manage / event.manage)`, tenant-wide only | `requireSongAdmin`, `requireEventAdmin`, and ~15 model checks (`canEditEvents` also feeds the SQL `p_is_admin` / `p_any_user` of `can_see_event`, `can_project_event`, visible events, live sessions) |
| 3 | `CurrentUser.leadsGroups` (`led_area_ids`, is_leader of `service_area_members`) | membership flag, not a can() action | `requireGroupManager` (groups page, teams of own areas), `esemenyek/page.tsx`, `csoportok/page.tsx`, `event-teams.ts`, `groups.ts` `canManageGroup(rights, id)` (`lib/music/groups.ts`) |
| 4 | `CurrentUser.leadsCourseGroups` + `courses.ts` `can_edit_course` / `visible_course_ids` | group leader flag (+ SQL) | course create/edit/list gating (`kepzesek/*`). Policy has `music.course.edit` = every role, model decides |
| 5 | `CurrentUser.canEditCourses` | `can(course.manage)` incl. area roles | OK (can()), but passed as `p_is_admin` to SQL |
| 6 | `canProjectEvent`, `canSeeEvent`, `can_see_event`, `can_project_event`, `can_edit_event` (SQL) | volunteer-of-event, event creator (`created_by`), `is_private`, group membership | event visibility and projection/live/scripture access; `music.projection.use`, `live.join/lead`, `scripture.use` are `every role` in the matrix and the model really decides |
| 7 | `event-access.ts` `createdBy === user.id` | creator may see/edit own private event | -- |
| 8 | Live sessions: `row.leader_id === user.id` | session leader | only the session leader sends |
| 9 | Module flags (`isWorkspaceModuleOn`) | entitlements, intended | -- |
| 10 | `requirePrivateFileAccess` | any music user | per-tenant Storage RLS |
| 11 | `music.projection.themes.setDefault` | action exists and the server action uses it, but the page/model use `isSuperadmin` (`songRights.manage`) | inconsistency, same L/ML today |
| 12 | `notifications`, `mixer-settings` (`mixer.setup`), translations manage | callers check can() | OK |

No role string, `workspaceRoles`, or `websiteRoles` access exists in the music code (lint-enforced). All items above are can()-derived flags or membership/ownership data (areas, leaders, volunteers, creator), which is data-scoped authorisation that cannot be a plain role matrix.

### 32.3 Findings that widen or narrow access vs. the source (DECISIONS NEEDED, not implemented)
- Q1 **ML = superadmin for rights.** In the source, `music_leader` could only lead live sessions (+ mixer). Churchy gives musicLeader song/event/group/projection-theme/translation/mixer manage and (via `songRights.manage`) the superadmin-only features: song-rights research, emails of people, area-role editing, announcements, theme default. Options: (a) keep (documented owner decision 2026-11-24 mapped superadmin to L+ML); (b) `songRights.manage`, `group roles`, `announcements`, `themes.setDefault`, emails: L only (narrows ML); (c) split new actions (`music.group.roles.manage`, `music.announcement.manage`, `music.people.emails.view`) so each can be set separately (no behaviour change until matrix edited).
- Q2 **Any area role grants `songRights.manage`** (matrix row "any area role"): a song_admin of one small group can run rights research and set the research quota for the whole church. The source needed superadmin. Options: keep / L+ML only.
- Q3 **Area role `music_leader` = event + song manage in its area**; in the source a music_leader could not edit songs or events. Keep (documented in 4b-2a) or reduce to `music.live.lead` only (no can() action for live is area-scoped today).
- Q4 **Leader flag of a group (`leadsGroups`)** grants managing the teams of own areas and (leadsCourseGroups) courses of own groups. Same as source. Proposal: keep as data-scoped rule, but expose it as can() actions: `music.group.manage` with `areaIds` resource and `music.course.edit` with `areaIds` (add `ledAreaIds` to the actor enricher), so UI and withPolicy ask one place. Not access-changing if done exactly; needs the enricher touched. Ask before.
- Q5 **`mixer.setup`, `translations.manage`, `themes.manage`** are L+ML; the source gave mixer to event_admin + music_leader, translations to superadmin only. Translations: ML now wider than source.
- Q6 **`music.course.manage`**: L only + area `course_admin`; source: course_admin + superadmin. ML cannot. Consistent; confirm.
- Q7 **teamLeader / employee / volunteer** have no music manage rights (only the member read actions), as intended for "member". Confirm that every workspace role is a "member" of the music module (EVERY_ROLE view actions; RM, HR, CH too).
- Q8 **Owner/admin (website roles)** with no workspace role: confirm they get `leader` workspace role in prod (outside music scope).

Proposed mapping to ratify: member -> EVERY_ROLE read actions; song_admin/event_admin/course_admin -> area roles (no tenant-wide role); music_leader -> workspace `musicLeader` (tenant-wide) AND area role; superadmin -> `leader`; Q1(c) to decouple the rights without changing today's grants. MATRIX review: section "Music" and "Music area roles" regenerated from `role-matrix.fixtures.ts`; nothing changed in 9a, `pnpm --filter @churchy/policy matrix` yields no diff.
