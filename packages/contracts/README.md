# @churchy/contracts

The data contract of Churchy (D-90, SDD §4.4): **Zod v4 schemas + TypeScript types** for every
launch-scope entity, **one repository interface per module**, the **per-module adapter
registry**, and the **contract test harness** that both adapters (mock — D-91, DB — S1…S7) must
pass.

```ts
import { getRepositories, type Ctx } from "@churchy/contracts";

const repos = getRepositories(); // adapters picked per module from DATA_ADAPTER_<MODULE>
const latest = await repos.announcements.latest(ctx);
```

Zod lives **only** in this package; pure packages (`schedule`, `policy`, `hu`, …) use the
exported plain TS types.

## Conventions

| Topic          | Rule                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Civil dates    | `IsoDate` = `"YYYY-MM-DD"`; times `IsoTime` = `"HH:mm"`; instants `IsoDateTime` = ISO-8601 with offset          |
| Time zone      | All local-time logic is Europe/Budapest. ISO weekday 1 = Monday … 7 = Sunday                                    |
| Ids / fields   | Ids are opaque strings; fields camelCase (snake_case mapping is the DB adapter's job)                           |
| Enum values    | SDD values where the SDD lists them (`templom`, `uj/folyamatban/lezart`, `munkaviszony`…); role keys in English |
| Inputs         | `XInputSchema` / `type XInput = z.input<…>` (defaults optional); entities `XSchema` / `type X`                  |
| Rich text      | ProseMirror/Tiptap JSON (`RichTextSchema`), never HTML                                                          |
| Sensitive data | Pastoral requests and HR are plain typed fields here; encryption is the DB adapter's concern                    |
| Music keys     | Stored in English letter notation (`G`, `F#m`, `Bb`); H/B naming is display-only (L-11)                         |

## Context (`Ctx`) and the rules every adapter implements

```ts
type Ctx = {
  tenantId?: string;
  orgId?: string;
  actor: { userId: string | null; personId: string | null };
};
```

Every repository method takes `ctx` first. Helpers: `ctxScope`, `requireTenantId`,
`requireOrgId`, `requirePlatform`, `assertValidCtx`, `isAnonymous`, builders `tenantCtx`,
`orgCtx`, `platformCtx`.

1. **Exclusive scope.** A ctx never carries both `tenantId` and `orgId` → `CONTEXT` error.
   Tenant ctx = church site/admin/workspace; org ctx = diocesan portal; neither = platform.
2. **Tenant scoping.** Rows of another tenant are invisible: reads return `null`/empty, writes
   and references (`periodId`, `roomId`, `calendarId`, …) throw `NOT_FOUND` — never `FORBIDDEN`
   (no existence leak).
3. **Organization ctx** reads **zero rows** from every non-HR module (mirrors RLS: no
   `app.tenant_id`). Only `hr` and `absences` admit an org ctx, for parishes with an `active`
   org link (and, for HR tickets, a delegation covering the category key or `*`). Writes that
   need a tenant throw `CONTEXT` for org/platform contexts.
4. **Anonymous ctx** (`actor.userId === null`) only ever receives public data: methods marked
   `@public` filter to published/visible rows (`isPubliclyVisible` for content, `visibility =
"public" && status = "published"` for events, `isPublic && active` for staff, `visibility =
"public"` for media); all other reads return `null`/empty. Anonymous writes are allowed only
   where documented (`requests.submit`).
5. **Validation.** Every input goes through its schema (`parseInput`) → `VALIDATION` with
   field issues. Role checks are **not** the repository's job — that is `can()` + the policy
   wrapper.
6. **Errors** are `ContractError` with `code`: `VALIDATION | NOT_FOUND | CONFLICT | CONTEXT |
FORBIDDEN` (see `src/errors.ts`). Check with `isContractError(e, code)`.

## Modules, repositories and adapter selection

Adapter per module: `DATA_ADAPTER_<MODULE>=mock|db` (default `mock`; any other value throws).

| Module          | Env var                      | Interface          | Entities                                                         |
| --------------- | ---------------------------- | ------------------ | ---------------------------------------------------------------- |
| `tenants`       | `DATA_ADAPTER_TENANTS`       | `TenantRepo`       | Tenant, SiteConfig(Overrides), Domain, Redirect                  |
| `members`       | `DATA_ADAPTER_MEMBERS`       | `MembershipRepo`   | User, Membership                                                 |
| `billing`       | `DATA_ADAPTER_BILLING`       | `BillingRepo`      | Plan, Entitlements, BillingAccount, Subscription, Invoice        |
| `organizations` | `DATA_ADAPTER_ORGANIZATIONS` | `OrganizationRepo` | Organization, OrgMembership, OrgLink, OrgDelegation, Deal        |
| `locations`     | `DATA_ADAPTER_LOCATIONS`     | `LocationRepo`     | Location                                                         |
| `schedule`      | `DATA_ADAPTER_SCHEDULE`      | `ScheduleRepo`     | SchedulePeriod, ServiceRule, ServiceException, ServiceOccurrence |
| `announcements` | `DATA_ADAPTER_ANNOUNCEMENTS` | `AnnouncementRepo` | Announcement                                                     |
| `news`          | `DATA_ADAPTER_NEWS`          | `PostRepo`         | Post                                                             |
| `events`        | `DATA_ADAPTER_EVENTS`        | `EventRepo`        | Event, Calendar                                                  |
| `pages`         | `DATA_ADAPTER_PAGES`         | `PageRepo`         | Page, PageBlock                                                  |
| `media`         | `DATA_ADAPTER_MEDIA`         | `MediaRepo`        | Media                                                            |
| `people`        | `DATA_ADAPTER_PEOPLE`        | `PersonRepo`       | Person, PublicPerson, AvailabilityBlock                          |
| `teams`         | `DATA_ADAPTER_TEAMS`         | `TeamRepo`         | Team, TeamPosition, TeamMember                                   |
| `requests`      | `DATA_ADAPTER_REQUESTS`      | `RequestRepo`      | FormDefinition, FormField, PastoralRequest                       |
| `rooms`         | `DATA_ADAPTER_ROOMS`         | `RoomRepo`         | Room, ServiceRoomBlock                                           |
| `bookings`      | `DATA_ADAPTER_BOOKINGS`      | `BookingRepo`      | Booking, BookingSeries, BookingConflict                          |
| `songs`         | `DATA_ADAPTER_SONGS`         | `SongRepo`         | Song, Hymnal, SongHymnalRef, Arrangement                         |
| `attachments`   | `DATA_ADAPTER_ATTACHMENTS`   | `AttachmentRepo`   | Attachment                                                       |
| `servicePlans`  | `DATA_ADAPTER_SERVICE_PLANS` | `ServicePlanRepo`  | ServicePlan, PlanItem, PlanTemplate, PlanComment                 |
| `assignments`   | `DATA_ADAPTER_ASSIGNMENTS`   | `AssignmentRepo`   | Assignment                                                       |
| `hr`            | `DATA_ADAPTER_HR`            | `HrRepo`           | HrCategory, HrTicket, HrTicketMessage, HrApproval                |
| `absences`      | `DATA_ADAPTER_ABSENCES`      | `AbsenceRepo`      | Absence, StaffProfile, LeaveEntitlement, WorkdayCalendarEntry    |
| `notifications` | `DATA_ADAPTER_NOTIFICATIONS` | `NotificationRepo` | Notification, NotificationPref                                   |

## Entity → SDD table mapping

| Entity (schema)                          | SDD table                                     | SDD §          |
| ---------------------------------------- | --------------------------------------------- | -------------- |
| `Tenant`, `SiteConfigOverrides`          | `tenants` (`site_config jsonb`, `ws_tier`)    | 8.2, 5.2, 20.1 |
| `Domain`                                 | `domains`                                     | 8.2            |
| `User`                                   | `users` (no secrets)                          | 8.2            |
| `Membership`                             | `memberships` (+ `ws_roles`, scopes)          | 8.2, 21.2      |
| `Redirect`                               | `redirects`                                   | 8.2            |
| `Plan`, `Entitlements`                   | `plans` (`entitlements jsonb`)                | 19.1           |
| `BillingAccount`                         | `billing_accounts`                            | 19.2           |
| `Subscription`                           | `subscriptions`                               | 19.2           |
| `Invoice`                                | `invoices`                                    | 19.2           |
| `Organization`                           | `organizations`                               | 25.7, 19.3     |
| `OrgMembership`                          | `org_memberships`                             | 25.7           |
| `OrgLink`                                | `org_links`                                   | 25.7           |
| `OrgDelegation`                          | `org_delegations`                             | 25.7           |
| `Deal`                                   | `deals`                                       | 19.3           |
| `Location`                               | `locations`                                   | 8.2            |
| `SchedulePeriod`                         | `schedule_periods`                            | 8.2            |
| `ServiceRule`                            | `service_rules`                               | 8.2            |
| `ServiceException`                       | `service_exceptions`                          | 8.2            |
| `ServiceOccurrence`                      | `service_occurrences`                         | 24.1           |
| `Announcement`                           | `announcements`                               | 8.2            |
| `Post`                                   | `posts`                                       | 8.2            |
| `Event`                                  | `events`                                      | 8.2, 22.1      |
| `Calendar`                               | `calendars`                                   | 22.1           |
| `Page`, `PageBlock`                      | `pages` (`blocks jsonb`)                      | 8.2            |
| `Media`                                  | `media`                                       | 8.2            |
| `Person`, `PublicPerson`                 | `people`                                      | 8.2, 21.1      |
| `AvailabilityBlock`                      | `availability_blocks`                         | 21.1           |
| `Team`                                   | `teams`                                       | 21.1           |
| `TeamPosition`                           | `team_positions`                              | 21.1           |
| `TeamMember`                             | `team_members`                                | 21.1           |
| `FormDefinition`, `FormField`            | `form_definitions` (`fields jsonb`)           | 8.2            |
| `PastoralRequest`                        | `pastoral_requests` (`data_enc`, `notes_enc`) | 8.2, 8.3       |
| `Room`, `ApprovalPolicy`, `BookingRules` | `rooms`                                       | 23.1, 23.2     |
| `ServiceRoomBlock`                       | — ("config", see deviations)                  | 23.4           |
| `Booking`                                | `bookings`                                    | 23.1           |
| `BookingSeries`                          | `booking_series`                              | 23.1           |
| `BookingConflict`                        | `booking_conflicts`                           | 23.4           |
| `Hymnal`                                 | `hymnals`                                     | 24.2           |
| `Song`, `SongHymnalRef`                  | `songs`, `song_hymnal_refs`                   | 24.2           |
| `Arrangement`                            | `arrangements`                                | 24.2           |
| `Attachment`                             | `attachments`                                 | 24.2, 24.5     |
| `PlanTemplate`                           | `plan_templates`                              | 24.2           |
| `ServicePlan`                            | `service_plans`                               | 24.2           |
| `PlanItem`                               | `plan_items`                                  | 24.2           |
| `Assignment`                             | `assignments`                                 | 24.2           |
| `PlanComment`                            | `plan_comments`                               | 24.2           |
| `HrCategory`, `ApprovalStep`             | `hr_categories`                               | 25.1, 25.2     |
| `HrTicket`                               | `hr_tickets` (`subject_enc`, `data_enc`)      | 25.1           |
| `HrTicketMessage`                        | `hr_ticket_messages` (`body_enc`)             | 25.1           |
| `HrApproval`                             | `hr_approvals` (`comment_enc`)                | 25.1           |
| `Absence`                                | `absences`                                    | 25.1           |
| `StaffProfile`                           | `staff_profiles`                              | 25.1, 25.7     |
| `LeaveEntitlement`                       | `leave_entitlements`                          | 25.1           |
| `WorkdayCalendarEntry`                   | `workday_calendar`                            | 25.1           |
| `Notification`                           | `notifications`                               | 26.1           |
| `NotificationPref`                       | `notification_prefs`                          | 26.1           |

**Not in the contract (out of launch scope or not app-facing):** `groups`, `sermons`, albums
(P1 modules FR-011/012/014 — `groupId`/`groupIds` fields are kept for forward compatibility),
`content_versions` (FR-305, P1), `audit_log` (D-40 P1; written by the server/policy layer),
`newsletter_subscribers` (P2), `payment_events` (DB-internal idempotency), `push_subscriptions`
and session/auth/feed-token storage (auth layer, D-04/D-59), `event_invitations`/`event_reminders`
(RSVP/reminders are P1), `song_usages` (written by the DB on lock; reports are P1),
`staff_documents`, `compliance_items`, `checklists` (D-75/D-76, P1), `org_hr_templates`
(D-86, P1 — `HrCategory.templateId/templateVersion` kept), `external_booking_requests` (P2).

## Deviations from the SDD data model

1. **Ranges as two fields.** `tstzrange`/`daterange` columns are `startsAt`/`endsAt`
   (bookings, half-open) and `startDate`/`endDate` (absences, inclusive);
   `availability_blocks.period` → `from`/`to`.
2. **`people.group` → `staffGroup`** (avoids confusion with the groups module); people gain
   `isMinor` and `guardianEmail` (SDD §21.1/§28 require them but §8.2 does not list columns).
3. **`events`** gain `parentEventId` + `recurrenceId` (single-occurrence overrides, SDD §10) and
   `externalRef` (§22.2); `status` is `draft | published | cancelled`.
4. **Publishing** uses `status: draft | published` + `publishedAt` (scheduled = published with a
   future `publishedAt`) for announcements, posts and pages; SDD's `publish_at` on posts is
   `publishedAt`.
5. **`assignments`** carry denormalized `startsAt`/`endsAt` (range queries, overlap filters).
6. **`hr_tickets`** gain `categoryKey` (denormalized, delegation matching), `anonymous` and
   `handover` (SDD §25.4 anonymous mode and _Átadás_); `hr_categories` gain `allowAnonymous`
   and `handlerPersonIds` (SDD's free-form `handler_scope`).
7. **`hr_ticket_messages` / `hr_approvals` / `plan_comments`** use person ids
   (`authorPersonId`, `approverPersonId`) instead of a generic `*_id`.
8. **`pastoral_requests`** gain `formKey` and `reference`; notes are a list of
   `{ id, authorUserId, body, createdAt }` (stored as `notes_enc`); `form_definitions` gain
   `referencePrefix` and `active`.
9. **`media`** gains `filename`, `mimeType`, `decorative` (SDD §16) and `visibility`
   (`public | private`, for request uploads/internal files).
10. **`pages`** gain `riteKey` (rite info pages, FR-010) and `sort`.
11. **`locations.accessibility`** is a typed object; `photo_media_id` → `photoMediaId`.
12. **`service_exceptions`**: input refinements — `modify` needs `ruleId`; `add` needs
    `locationId`, `time`, `serviceType`.
13. **`ServiceRoomBlock`** models the "(location, service_type) → rooms" config of SDD §23.4 as
    rows.
14. **`attachments`** gain `contentHash` and `disabled` (takedown by hash, SDD §24.5).
15. **`billing_accounts.barion_token_ref`** stays DB-internal; **`deals.price_terms`** is typed
    `{ monthlyPerParish, yearlyPerParish, note }`.
16. **`tenants`** gain `organizationId` (deal provisioning) and `launchedAt` (_Oldal
    élesítése_); `plan` → `planKey`.
17. **`notifications.payload`** is restricted to short scalars (D-54 AC4 — no content).
18. **`ApprovalStep.role`** uses role keys `leader | hrHandler` instead of the Hungarian labels.
19. **`absences.status`** values `requested | approved | rejected | cancelled` (SDD lists only
    `status`).

## Contract tests

- Harness: `src/testing/harness.ts` (`defineContractSuite`, `ContractEnv`, `ContractSetup`,
  `expectContractError`, fixtures helpers). One suite per module in `src/testing/suites/`;
  every suite has a **tenant-scoping** test, happy-path and validation-error tests, and
  anonymous-visibility tests where the module has public reads.
- `runContractSuites(adapterName, factory, { modules })` registers **all 23 suites**; modules
  not listed are shown as skipped.
- `pnpm test:contract` (root) runs every `packages/*/src/**/*.contract.test.ts`. Today that is
  `src/testing/reference.contract.test.ts`, which runs the suites against a tiny in-test
  **reference implementation** of `announcements` and `locations` (proof that the harness works;
  not the mock adapter).

### Plugging in an adapter

```ts
// packages/data-mock/src/mock.contract.test.ts
import { runContractSuites, type ContractEnv } from "@churchy/contracts/testing";
import { createMockRepositories, seedContractFixtures } from "./index";

runContractSuites("mock", () => {
  const store = seedContractFixtures(); // fresh store per test
  return { repos: createMockRepositories(store), env: store.contractEnv as ContractEnv };
});
```

- The factory runs **before every test** and returns `{ repos, env, dispose? }`.
- `env` must reference rows that exist in the adapter: two tenants (`tenantA`, `tenantB`), one
  organization (`orgId`), staff actors `actorA`/`actorB` (user + person, with a membership in
  their tenant), an `orgActor` and a `platformActor`. The platform plan catalog (`ingyenes`,
  `teljes`, …) must be seeded.
- A DB adapter passes `modules: [...]` with the modules switched so far (`DATA_ADAPTER_*=db`) and
  runs only when `DATABASE_URL` is set; suites use unique slugs/keys so they can re-run against a
  persistent database.
- Some suites create prerequisites through other modules (`schedule` → `locations`,
  `bookings` → `locations` + `rooms`, `assignments` → `teams`, `people`, `schedule`,
  `hr`/`absences` → `organizations`, `members` → `tenants`).

### Registering an adapter for the app

```ts
// packages/data-mock/src/register.ts
import { registerAdapter } from "@churchy/contracts";
registerAdapter("mock", { announcements: () => announcements(store) /* … */ });

// apps/web/server/data-adapters.ts — the ONLY app file allowed to import adapters
import "@churchy/data-mock/register";
import "@churchy/db/register";
```

The registry never imports adapter packages; adapters register themselves.

## Lint rule

`eslint.config.mjs` forbids importing `@churchy/data-mock` and `@churchy/db` (and relative
paths into `packages/data-mock` / `packages/db`) from `apps/web/**` and `packages/ui/**`, except
the composition root `apps/web/server/data-adapters.ts`. `src/lint/adapter-imports.test.ts`
runs ESLint on fixture sources to prove the rule fires.

## Coverage

`pnpm --filter @churchy/contracts test:coverage` covers schemas, ctx, errors, registry and
helpers (threshold 80 %). `src/testing/**` (harness, suites, reference implementation) is test
code exercised by `pnpm test:contract` and excluded from unit coverage.
