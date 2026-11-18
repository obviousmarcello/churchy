/**
 * Demo seed (D-02 AC4): loads the **same fixtures as the mock adapter** (D-91,
 * `createDemoDataset`) into Postgres — 3 demo churches, 2 placeholder parishes and 1 diocese,
 * entirely fictitious Hungarian data. One source of truth: the fixtures are validated with the
 * contract Zod schemas before and after the id mapping, then written table by table.
 *
 * Special-category content (pastoral requests, HR tickets/messages/approval comments) is stored
 * only as ciphertext. Encryption is D-30, so the seed takes an `encryptor`; without one those
 * collections are skipped (and `absences.ticket_id` is left null) instead of ever writing
 * plaintext into a `*_enc` column.
 */
import { createDemoDataset, type MockDataset } from "@churchy/data-mock";
import { inArray, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db, Tx } from "../client";
import * as s from "../schema";
import { demoUuid, mapIds } from "./ids";
import { validateDataset } from "./validate";

export interface SeedEncryptor {
  /** Returns the ciphertext of `plaintext` under the tenant's data key (D-30). */
  encrypt(tenantId: string, plaintext: string): Buffer | Promise<Buffer>;
}

export type SeedOptions = {
  /** Fixture dates are relative to this instant (Europe/Budapest). Default: now. */
  now?: Date;
  encryptor?: SeedEncryptor;
  /** Environment guard; the seed refuses to run when this is `production`. */
  appEnv?: string;
};

export type SeedReport = {
  /** Rows written per table. */
  counts: Record<string, number>;
  /** Fixture rows not written, per collection (sensitive collections without an encryptor). */
  skipped: Record<string, number>;
  tenantIds: string[];
  organizationIds: string[];
};

/** Demo fixtures with every readable id replaced by its deterministic UUID, validated twice. */
export function prepareDemoDataset(now: Date): MockDataset {
  const fixtures = createDemoDataset(now);
  const before = validateDataset(fixtures);
  if (before.length > 0) throw new Error(`Demo fixtures fail the contracts: ${fmt(before)}`);

  const known = new Set<string>();
  for (const rows of Object.values(fixtures) as unknown[][]) {
    for (const row of rows) {
      const id = (row as { id?: unknown }).id;
      if (typeof id === "string") known.add(id);
    }
  }
  const mapped = mapIds(fixtures, known);
  const after = validateDataset(mapped);
  if (after.length > 0) throw new Error(`Mapped demo data fails the contracts: ${fmt(after)}`);
  return mapped;
}

function fmt(issues: { collection: string; index: number; message: string }[]): string {
  return issues
    .slice(0, 5)
    .map((i) => `${i.collection}[${i.index}] ${i.message}`)
    .join("; ");
}

/** Orders rows so a row referencing another row of the same table comes after it. */
export function parentsFirst<T extends { id: string }>(
  rows: readonly T[],
  parentOf: (row: T) => string | null,
): T[] {
  const ids = new Set(rows.map((r) => r.id));
  const done = new Set<string>();
  const out: T[] = [];
  let pending = [...rows];
  while (pending.length > 0) {
    const next = pending.filter((r) => {
      const parent = parentOf(r);
      return parent === null || !ids.has(parent) || done.has(parent);
    });
    if (next.length === 0) throw new Error("Cyclic self-reference in seed data");
    for (const r of next) {
      out.push(r);
      done.add(r.id);
    }
    pending = pending.filter((r) => !done.has(r.id));
  }
  return out;
}

const CHUNK = 500;

async function insertRows<T extends PgTable>(
  tx: Tx,
  table: T,
  rows: readonly T["$inferInsert"][],
  report: SeedReport,
  name: string,
  onConflictDoNothing = false,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK) as T["$inferInsert"][];
    const q = tx.insert(table).values(chunk);
    await (onConflictDoNothing ? q.onConflictDoNothing() : q);
  }
  report.counts[name] = (report.counts[name] ?? 0) + rows.length;
}

/**
 * Writes the demo dataset. Re-runnable: the demo tenants, billing accounts and organization
 * (fixed UUIDs) are deleted first — cascading to all their rows — and platform rows (plans,
 * catalog hymnals/templates, profiles, workday calendar) are inserted with ON CONFLICT DO NOTHING.
 * Must run as the schema owner (bypasses RLS); never as the app role.
 */
export async function seedDemo(db: Db, options: SeedOptions = {}): Promise<SeedReport> {
  if ((options.appEnv ?? process.env.APP_ENV) === "production") {
    throw new Error("Refusing to seed demo data into production");
  }
  const ds = prepareDemoDataset(options.now ?? new Date());
  const enc = options.encryptor;
  const report: SeedReport = {
    counts: {},
    skipped: {},
    tenantIds: ds.tenants.map((t) => t.id),
    organizationIds: ds.organizations.map((o) => o.id),
  };

  await db.transaction(async (tx) => {
    // 1. Remove a previous demo seed (cascades through every tenant-owned table).
    await tx.delete(s.tenants).where(inArray(s.tenants.id, report.tenantIds));
    const accountIds = ds.billingAccounts.map((b) => b.id);
    if (accountIds.length > 0) {
      await tx.delete(s.billingAccounts).where(inArray(s.billingAccounts.id, accountIds));
    }
    await tx.delete(s.organizations).where(inArray(s.organizations.id, report.organizationIds));

    // 2. Platform rows.
    await insertRows(tx, s.plans, ds.plans, report, "plans", true);
    await insertRows(tx, s.workdayCalendar, ds.workdayCalendar, report, "workday_calendar", true);
    await insertRows(tx, s.organizations, ds.organizations, report, "organizations");
    await insertRows(
      tx,
      s.tenants,
      ds.tenants.map((t) => ({ ...t, planKey: t.planKey as (typeof s.plans.$inferInsert)["key"] })),
      report,
      "tenants",
    );
    // Supabase Auth users (fictitious, no credentials) + app profiles keyed on them.
    for (const u of ds.users) {
      await tx.execute(
        sql`insert into auth.users (id, email, aud, role) values (${u.id}, ${u.email}, 'authenticated', 'authenticated') on conflict (id) do nothing`,
      );
    }
    report.counts["auth.users"] = ds.users.length;
    await insertRows(tx, s.profiles, ds.users, report, "profiles", true);
    await insertRows(tx, s.memberships, ds.memberships, report, "memberships");
    await insertRows(tx, s.orgMemberships, ds.orgMemberships, report, "org_memberships");
    await insertRows(tx, s.orgLinks, ds.orgLinks, report, "org_links");
    await insertRows(tx, s.orgDelegations, ds.orgDelegations, report, "org_delegations");
    await insertRows(tx, s.deals, ds.deals, report, "deals");
    await insertRows(tx, s.billingAccounts, ds.billingAccounts, report, "billing_accounts");
    await insertRows(tx, s.subscriptions, ds.subscriptions, report, "subscriptions");
    await insertRows(tx, s.invoices, ds.invoices, report, "invoices");
    await insertRows(tx, s.domains, ds.domains, report, "domains");
    await insertRows(tx, s.redirects, ds.redirects, report, "redirects");

    // 3. Website.
    await insertRows(tx, s.media, ds.media, report, "media");
    await insertRows(
      tx,
      s.locations,
      ds.locations.map((l) => ({
        ...l,
        geo: l.geo === null ? null : { x: l.geo.lng, y: l.geo.lat },
      })),
      report,
      "locations",
    );
    await insertRows(tx, s.schedulePeriods, ds.schedulePeriods, report, "schedule_periods");
    await insertRows(tx, s.serviceRules, ds.serviceRules, report, "service_rules");
    await insertRows(tx, s.serviceExceptions, ds.serviceExceptions, report, "service_exceptions");
    await insertRows(
      tx,
      s.serviceOccurrences,
      parentsFirst(ds.serviceOccurrences, (o) => o.movedToId),
      report,
      "service_occurrences",
    );
    await insertRows(tx, s.announcements, ds.announcements, report, "announcements");
    await insertRows(tx, s.posts, ds.posts, report, "posts");
    await insertRows(
      tx,
      s.pages,
      parentsFirst(ds.pages, (p) => p.parentId),
      report,
      "pages",
    );
    await insertRows(tx, s.formDefinitions, ds.formDefinitions, report, "form_definitions");

    // 4. People, teams, calendars, events (teams ↔ calendars reference each other).
    await insertRows(tx, s.people, ds.people, report, "people");
    await insertRows(
      tx,
      s.availabilityBlocks,
      ds.availabilityBlocks.map((b) => ({ ...b, fromAt: b.from, toAt: b.to })),
      report,
      "availability_blocks",
    );
    await insertRows(
      tx,
      s.teams,
      ds.teams.map((t) => ({ ...t, calendarId: null })),
      report,
      "teams",
    );
    await insertRows(tx, s.calendars, ds.calendars, report, "calendars");
    for (const team of ds.teams.filter((t) => t.calendarId !== null)) {
      await tx
        .update(s.teams)
        .set({ calendarId: team.calendarId })
        .where(sql`${s.teams.id} = ${team.id}`);
    }
    await insertRows(tx, s.teamPositions, ds.teamPositions, report, "team_positions");
    await insertRows(tx, s.teamMembers, ds.teamMembers, report, "team_members");
    await insertRows(
      tx,
      s.events,
      parentsFirst(ds.events, (e) => e.parentEventId),
      report,
      "events",
    );

    // 5. Rooms & bookings.
    await insertRows(tx, s.rooms, ds.rooms, report, "rooms");
    await insertRows(tx, s.serviceRoomBlocks, ds.serviceRoomBlocks, report, "service_room_blocks");
    await insertRows(tx, s.bookingSeries, ds.bookingSeries, report, "booking_series");
    await insertRows(tx, s.bookings, ds.bookings, report, "bookings");
    await insertRows(tx, s.bookingConflicts, ds.bookingConflicts, report, "booking_conflicts");

    // 6. Worship.
    await insertRows(tx, s.hymnals, ds.hymnals, report, "hymnals", true);
    await insertRows(tx, s.songs, ds.songs, report, "songs");
    const refs = ds.songs.flatMap((song) =>
      song.hymnalRefs.map((r) => ({ ...r, tenantId: song.tenantId, songId: song.id })),
    );
    await insertRows(tx, s.songHymnalRefs, refs, report, "song_hymnal_refs");
    await insertRows(tx, s.arrangements, ds.arrangements, report, "arrangements");
    await insertRows(
      tx,
      s.attachments,
      parentsFirst(ds.attachments, (a) => a.supersedesId),
      report,
      "attachments",
    );
    await insertRows(tx, s.planTemplates, ds.planTemplates, report, "plan_templates", true);
    await insertRows(tx, s.servicePlans, ds.servicePlans, report, "service_plans");
    await insertRows(tx, s.planItems, ds.planItems, report, "plan_items");
    await insertRows(tx, s.planComments, ds.planComments, report, "plan_comments");
    await insertRows(tx, s.assignments, ds.assignments, report, "assignments");

    // 7. HR (+ pastoral requests): ciphertext only.
    await insertRows(tx, s.hrCategories, ds.hrCategories, report, "hr_categories");
    if (enc === undefined) {
      report.skipped["pastoralRequests"] = ds.pastoralRequests.length;
      report.skipped["hrTickets"] = ds.hrTickets.length;
      report.skipped["hrTicketMessages"] = ds.hrTicketMessages.length;
      report.skipped["hrApprovals"] = ds.hrApprovals.length;
    } else {
      const requests = [];
      for (const r of ds.pastoralRequests) {
        requests.push({
          ...r,
          dataEnc: await enc.encrypt(r.tenantId, JSON.stringify(r.data)),
          notesEnc:
            r.notes.length === 0 ? null : await enc.encrypt(r.tenantId, JSON.stringify(r.notes)),
        });
      }
      await insertRows(tx, s.pastoralRequests, requests, report, "pastoral_requests");
      const tickets = [];
      for (const t of ds.hrTickets) {
        tickets.push({
          ...t,
          subjectEnc: await enc.encrypt(t.tenantId, t.subject),
          dataEnc: await enc.encrypt(t.tenantId, JSON.stringify(t.data)),
          handoverEnc:
            t.handover === null ? null : await enc.encrypt(t.tenantId, JSON.stringify(t.handover)),
        });
      }
      await insertRows(tx, s.hrTickets, tickets, report, "hr_tickets");
      const messages = [];
      for (const m of ds.hrTicketMessages) {
        messages.push({ ...m, bodyEnc: await enc.encrypt(m.tenantId, m.body) });
      }
      await insertRows(tx, s.hrTicketMessages, messages, report, "hr_ticket_messages");
      const approvals = [];
      for (const a of ds.hrApprovals) {
        approvals.push({
          ...a,
          commentEnc: a.comment === null ? null : await enc.encrypt(a.tenantId, a.comment),
        });
      }
      await insertRows(tx, s.hrApprovals, approvals, report, "hr_approvals");
    }
    await insertRows(
      tx,
      s.absences,
      ds.absences.map((a) => ({
        ...a,
        workingDays: String(a.workingDays),
        ticketId: enc === undefined ? null : a.ticketId,
      })),
      report,
      "absences",
    );
    await insertRows(tx, s.staffProfiles, ds.staffProfiles, report, "staff_profiles");
    await insertRows(
      tx,
      s.leaveEntitlements,
      ds.leaveEntitlements.map((l) => ({
        ...l,
        daysTotal: String(l.daysTotal),
        carriedOver: String(l.carriedOver),
      })),
      report,
      "leave_entitlements",
    );

    // 8. Notifications.
    await insertRows(tx, s.notifications, ds.notifications, report, "notifications");
    await insertRows(
      tx,
      s.notificationPrefs,
      ds.notificationPrefs,
      report,
      "notification_prefs",
      true,
    );
  });

  return report;
}

/** UUID the seed gives a fixture id (e.g. `seedId("t-szenttivadar")`). */
export const seedId = demoUuid;
