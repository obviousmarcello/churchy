# Site builder: URL -> draft church site (D-34, SDD ADR-21)

Platform operators paste the address of a church's existing public website and get a **draft site** in Churchy's own
content model (pages, news, announcements, locations, service schedule, images). Nothing is published; the church
reviews and publishes. **Operators only** for now: there is no public or anonymous access, and the landing page box
stays a teaser (no network calls from the public landing).

## Pipeline

```
crawl (SSRF-safe fetcher, robots.txt)  ->  extract (parse5, JSON-LD, meta, patterns)  ->  scrub personal data
   ->  plan (Claude, strict tool use, Zod)  ->  verify every claim against the crawl  ->  draft (site_drafts)
   ->  operator review (switch items off)  ->  apply
```

Code: `apps/web/server/site-builder/` (pure logic, no secrets), `server/site-builder-*.ts` (wiring, actions, platform
database), `app/(platform)/platform/webhely-epito/` (operator UI and the streaming route), `server/jobs/site-builder-purge.ts`.

### Guardrails (each is a unit test)

- **Fetcher** (`fetcher.ts`, `ssrf.ts`): http(s) only, ports 80/443, no credentials in URLs, no single-label or `.local/.internal`
  hosts, no private/loopback/link-local/metadata/multicast/reserved addresses (IPv4, IPv6, IPv4-mapped, NAT64, 6to4,
  Teredo). **Every hop** (first request and each of at most 5 redirects) is re-checked. The address check runs inside the
  connection's own DNS `lookup`, so the socket connects only to an address the guard validated (no DNS-rebinding window); a
  mixed answer (public + private) is refused. Timeouts, a byte cap on the *decompressed* body (zip bombs), content-type
  allow-lists, no cookies, no auth headers, user agent `ChurchySiteBuilder/1.0`.
- **Scope** (`site-fetcher.ts`, `domain.ts`): one registrable domain per run (hand-maintained second-level and shared-hosting
  suffix lists, so two churches on `*.blogspot.com` are different sites), at most 30 pages, 60 images, 64 MiB; images
  from other domains are listed but never downloaded.
- **robots.txt** (`robots.ts`, RFC 9309): the `ChurchySiteBuilder` group wins over `*`, longest match wins, `Crawl-delay`
  honoured (capped at 5 s, 0.5 s minimum between requests per origin). 404 = no rules, 401/403/5xx/unreachable = do not
  crawl. `noindex`/`noai` pages are skipped. Redirects are checked against robots again.
- **Personal data** (`personal-data.ts`): only institutional contact data stays (generic mailboxes such as `iroda@`, JSON-LD
  organisation contacts, phones on office-labelled lines). All other e-mails and phones, health and bereavement
  paragraphs, and name lists (members, baptisms, name days) are removed **before** anything goes to the model or the
  draft. Names of clergy in their institutional role are kept as text (decision of the owner); their personal contacts
  are not. Rite information (funerals, confession times) is kept. No personal data in logs: the route logs nothing, the
  audit entry has ids, counts and the host only.
- **Model** (`llm.ts`, `plan-schema.ts`, `prompt.ts`): `claude-sonnet-5-5`, effort `medium`, cached system prompt,
  strict `submit_plan` tool (forced tool choice is not supported on this model), server-side fallback beta; output
  validated with Zod. The model only decides and condenses (roles of pages, facts, short Churchy-written copy in neutral
  informal Hungarian); the church's own page texts are carried over by the extractor, never re-emitted. Crawled text is data
  inside `<crawl>` tags; the only output channel is the schema, URLs outside the crawl are dropped, service times need the
  same weekday and time on their source page, addresses must appear in the crawl.
- **Cost cap**: the prompt is shrunk in steps until its estimated cost fits; if it cannot, the run fails before any call.
  `SITE_BUILDER_MAX_COST_USD` (default 1) and `SITE_BUILDER_MAX_INPUT_TOKENS` (default 120000).
- **Drafts** expire after `SITE_BUILDER_DRAFT_TTL_HOURS` (default 24, 1-168) and the hourly worker job `site-builder-purge`
  deletes the expired, not applied ones.
- **Consent**: the operator confirms "the church asked us to prepare its site from this address". The build refuses without
  it; the draft metadata records the statement and time, the audit log entry `site_builder.build` the fact (not the note).

## Access

`platform.siteBuilder.use` (`packages/policy`): granted to `PlatformActor` only; denied to tenant, organization,
anonymous and impersonating support actors. UI (`can()` hides the page: 404), the route (`withPolicyRoute`) and the actions
(`withPolicy`) use it. **Real operators** need Phase B auth to resolve a `PlatformActor` in `server/session.ts` (today only the
demo persona *Üzemeltető* does); until then the console is reachable in demo mode only.

## Apply

- **New church** (operator): `createTenant` with `allowReserved` and the drafted `site_config`, and a `seed` hook that
  runs the content INSERTs, marks the draft applied and writes the `site_builder.apply` audit entry (with the source URL of
  every page and post) **in the same transaction**. Everything lands unpublished. Needs the owner's `auth.users` id.
  Migration 0027 admits those INSERTs for a tenant created in the last ten minutes only.
- **Existing church** (owner): the operator creates the draft with a target church; the owner applies it in *Beállítás*
  (`/admin/inditas`) under their own context through the repositories (`applyDraftWithRepositories`): additive only (slugs
  get a suffix, an existing announcement week is skipped, the schedule is only filled when empty, identity and theme stay),
  unpublished. The draft is read through the platform role filtered by `target_tenant_id` (no tenant-role grant on drafts).
  No impersonation anywhere.
- **Images** are carried over only when the draft is applied, and only the ones the operator kept (images from other
  domains are never downloaded; photos flagged *may show people* travel only if the operator left them on, and
  arrive with `people_consent = false`). Flow (`media-carry.ts`, `media-sink.ts`): download through the SSRF-safe
  `SiteFetcher` (robots, scope, budgets, jpeg/png/webp/gif/avif <= 8 MiB, no SVG) -> sharp re-encode to webp (EXIF/ICC
  stripped, longest side <= 2400 px, decoder pixel cap, content sniffed so a lying content type fails) -> upload to the
  private Storage bucket `site-media` as `t/<tenant_id>/media/<uuid>.webp` -> `media` row (alt from the draft, else
  marked decorative) -> image blocks point at the new media ids; blocks of failed images are dropped.
  - New church: download and encode run before the platform transaction; the upload and the `media` INSERTs run inside the
    seed of the same transaction. Storage is not transactional, so if the transaction rolls back the uploaded objects are
    removed again (best effort).
  - Existing church: through `repos.media.create`; if the apply fails afterwards the objects and rows are removed again.
  - A failing image (fetch, decode, size, upload) is only counted (`summary.mediaFailed`); the apply goes on. The
    result shows *N kép* and how many images did not make it. Not logged: bytes, URLs of images, upstream error bodies.
  - Without Supabase env the sink is absent and images stay listed candidates (the apply reports the count). Demo mode
    uses the fixture site and an in-memory sink (no network). The church logo: new church: the tenant id is chosen
    before `createTenant`, the logo is uploaded first and its media id is written into the drafted `site_config.identity.logoMediaId`
    at the tenant INSERT (the platform role stays INSERT-only on `tenants`), the media row with that id is inserted in the seed; if the logo
    fails, `logoMediaId` stays unset and the result says so (`logoMissing`). Existing church: `identity.logoMediaId` is set through the
    tenant repository only when the church has no logo yet.
  - **Who writes to Storage:** a server-minted, 60-second tenant JWT (`mintTenantToken`, role claim `churchy_site_media`,
    `tenant_id` of the church) through the Storage REST API (supabase-js). No service-role key. Migration
    `0028_site_media` creates the NOLOGIN role (no table grants; granted to `authenticator`) and, where the `storage`
    schema exists, the bucket (private, 10 MB, `image/webp`) and policies on `storage.objects` (SELECT, INSERT, DELETE; no
    UPDATE, so no overwrite) limited to bucket `site-media` and `t/<claim tenant>/media/<uuid>.webp`. The platform apply
    uses the same token for the freshly created tenant; the policy cannot additionally require "fresh tenant" (the role
    has no read access to `tenants`, and a SECURITY DEFINER helper was judged more surface than value): the token is only
    minted by these two server paths. Serving the media publicly is a later media route (not part of this).

## Why a route handler, not a pg-boss job

A run is short (<= 30 pages, one model call), the operator waits and watches the stages (NDJSON stream), the result is a
draft that expires anyway, and a job would need its own status table. The route allows 300 s (`maxDuration`) and two builds at
a time per server. If runs ever get longer or run unattended, move `buildDraft` into a `site-builder` pg-boss queue; the
pipeline has no request dependencies (progress callback and abort signal only).

## Configuration

| Variable | Needed for |
| --- | --- |
| `DATABASE_URL_PLATFORM` | drafts, church creation (live mode) |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWT_SECRET` | image carry-over to Storage (same variables as the music module) |
| `ANTHROPIC_API_KEY` | the plan call (the platform key, like the music research) |
| `SITE_BUILDER_MAX_COST_USD`, `SITE_BUILDER_MAX_INPUT_TOKENS`, `SITE_BUILDER_DRAFT_TTL_HOURS` | optional limits |

Modes (`server/site-builder-mode.ts`): **demo** (`DEMO_MODE`): the fictitious fixture church (`site-builder/fixtures.ts`) from memory
and a fake model, a notice says so, no network/key/DB. **live**: platform DB and key present. **off**: the page says what is
missing. Tests and e2e use the in-memory transport and the fake planner; loopback fixtures exist only as a code-level option of
`fetchPublic` that throws in production and is not reachable from env or config (tested).

## Dependency

`parse5` (apps/web, exact pin): a spec-compliant HTML5 parser with no dependencies and no DOM or scripting; imported only in
`site-builder/html.ts`. Needed because the stack has no HTML parser and regex extraction of real-world pages is unsafe.

## Deploying migration 0027

Forward migration, applied to the dev/staging project `churchy` through the Supabase MCP (verbatim SQL minus comments); the platform
login role needs no change (`churchy_platform` gains the grants). Verify: `site_drafts` RLS enabled and forced, no grant to `anon`,
`authenticated`, `churchy_app`, `churchy_music`; `churchy_platform` has INSERT only on the seven content tables.

## Deploying migration 0028 (site media)

Applied to the dev/staging project `churchy` with `apply_migration` (`0028_site_media`, verbatim SQL minus comments). It creates the
role `churchy_site_media`, the bucket `site-media` and the four storage policies (`site_media_select/insert/delete`,
`site_media_buckets_read`). Verified live (a DO block that ends in a deliberate exception, so nothing persists): own-tenant
insert allowed; another tenant's prefix, another bucket, a non-uuid/`.png` name and `public.media` denied. Down:
`migrations/down/0028_site_media.sql` (the bucket and its objects are kept). A real upload needs the server env above.
