import { describe, expect, it } from "vitest";
import * as C from "@churchy/contracts";
import { bookingsOverlap, isPubliclyVisible, validateFormData } from "@churchy/contracts";
import { liturgicalDay, publicHolidays } from "@churchy/calendar";
import { formatPhone } from "@churchy/hu";
import { nextServices, resolve, upcomingExceptions, type ScheduleInput } from "@churchy/schedule";
import { emptyDataset, type MockDataset } from "../dataset";
import {
  createDemoDataset,
  createDemoDatasetWithPersonas,
  DEMO_ORG_ID,
  DEMO_TENANT_IDS,
} from "./index";
import { createClock, localToIso } from "./clock";

type AnySchema = { safeParse: (v: unknown) => { success: boolean; error?: { issues: unknown[] } } };

/** One contract schema per collection of the dataset (songHymnalRefs are embedded in songs). */
const SCHEMAS: Record<Exclude<keyof MockDataset, "songHymnalRefs">, AnySchema> = {
  tenants: C.TenantSchema,
  domains: C.DomainSchema,
  redirects: C.RedirectSchema,
  users: C.UserSchema,
  memberships: C.MembershipSchema,
  plans: C.PlanSchema,
  billingAccounts: C.BillingAccountSchema,
  subscriptions: C.SubscriptionSchema,
  invoices: C.InvoiceSchema,
  organizations: C.OrganizationSchema,
  orgMemberships: C.OrgMembershipSchema,
  orgLinks: C.OrgLinkSchema,
  orgDelegations: C.OrgDelegationSchema,
  deals: C.DealSchema,
  locations: C.LocationSchema,
  schedulePeriods: C.SchedulePeriodSchema,
  serviceRules: C.ServiceRuleSchema,
  serviceExceptions: C.ServiceExceptionSchema,
  serviceOccurrences: C.ServiceOccurrenceSchema,
  announcements: C.AnnouncementSchema,
  posts: C.PostSchema,
  calendars: C.CalendarSchema,
  events: C.EventSchema,
  pages: C.PageSchema,
  media: C.MediaSchema,
  formDefinitions: C.FormDefinitionSchema,
  pastoralRequests: C.PastoralRequestSchema,
  people: C.PersonSchema,
  availabilityBlocks: C.AvailabilityBlockSchema,
  teams: C.TeamSchema,
  teamPositions: C.TeamPositionSchema,
  teamMembers: C.TeamMemberSchema,
  rooms: C.RoomSchema,
  serviceRoomBlocks: C.ServiceRoomBlockSchema,
  bookings: C.BookingSchema,
  bookingSeries: C.BookingSeriesSchema,
  bookingConflicts: C.BookingConflictSchema,
  hymnals: C.HymnalSchema,
  songs: C.SongSchema,
  arrangements: C.ArrangementSchema,
  attachments: C.AttachmentSchema,
  planTemplates: C.PlanTemplateSchema,
  servicePlans: C.ServicePlanSchema,
  planItems: C.PlanItemSchema,
  planComments: C.PlanCommentSchema,
  assignments: C.AssignmentSchema,
  hrCategories: C.HrCategorySchema,
  hrTickets: C.HrTicketSchema,
  hrTicketMessages: C.HrTicketMessageSchema,
  hrApprovals: C.HrApprovalSchema,
  absences: C.AbsenceSchema,
  staffProfiles: C.StaffProfileSchema,
  leaveEntitlements: C.LeaveEntitlementSchema,
  workdayCalendar: C.WorkdayCalendarEntrySchema,
  notifications: C.NotificationSchema,
  notificationPrefs: C.NotificationPrefSchema,
};

/** Friday, 13 November 2026, 10:00 Budapest. */
const NOW = new Date("2026-11-13T10:00:00+01:00");
const { dataset: DS, personas: PERSONAS } = createDemoDatasetWithPersonas(NOW);

const CHURCHES = [
  { name: "katolikus", id: DEMO_TENANT_IDS.catholic, denomination: "rk" },
  { name: "református", id: DEMO_TENANT_IDS.reformed, denomination: "ref" },
  { name: "baptista", id: DEMO_TENANT_IDS.baptist, denomination: "bapt" },
] as const;

const of = <T extends { tenantId: string | null }>(rows: T[], tenantId: string): T[] =>
  rows.filter((r) => r.tenantId === tenantId);

describe("demo dataset — contract validity (AC2)", () => {
  for (const [collection, schema] of Object.entries(SCHEMAS)) {
    it(`every ${collection} row validates against its @churchy/contracts schema`, () => {
      const rows = DS[collection as keyof MockDataset] as unknown[];
      expect(rows.length).toBeGreaterThan(0);
      const failures: string[] = [];
      rows.forEach((row, i) => {
        const result = schema.safeParse(row);
        if (!result.success)
          failures.push(`${collection}[${i}]: ${JSON.stringify(result.error?.issues)}`);
      });
      expect(failures).toEqual([]);
    });
  }

  it("covers every collection of MockDataset", () => {
    const keys = Object.keys(emptyDataset()).filter((k) => k !== "songHymnalRefs");
    expect(Object.keys(SCHEMAS).sort()).toEqual(keys.sort());
  });

  it("form data of pastoral requests and HR tickets satisfies their form definitions", () => {
    for (const req of DS.pastoralRequests) {
      const form = DS.formDefinitions.find((f) => f.id === req.formId);
      expect(form, req.id).toBeDefined();
      expect(validateFormData(form!.fields, req.data), req.id).toEqual([]);
    }
    for (const t of DS.hrTickets) {
      const cat = DS.hrCategories.find((c) => c.id === t.categoryId);
      expect(cat, t.id).toBeDefined();
      expect(validateFormData(cat!.fields, t.data), t.id).toEqual([]);
    }
  });
});

describe("demo dataset — referential integrity", () => {
  const ids = (rows: { id: string }[]): Set<string> => new Set(rows.map((r) => r.id));

  it("ids are unique per collection", () => {
    for (const key of Object.keys(DS) as (keyof MockDataset)[]) {
      const rows = DS[key] as { id?: string }[];
      const withId = rows.filter((r) => r.id !== undefined).map((r) => r.id);
      expect(new Set(withId).size, key).toBe(withId.length);
    }
  });

  it("e-mail addresses are unique and tenant-owned rows belong to a known tenant", () => {
    const emails = DS.users.map((u) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
    const tenants = ids(DS.tenants);
    for (const key of Object.keys(DS) as (keyof MockDataset)[]) {
      for (const row of DS[key] as { tenantId?: string | null }[]) {
        if (typeof row.tenantId === "string")
          expect(tenants.has(row.tenantId), `${key}.tenantId`).toBe(true);
      }
    }
  });

  it("cross references resolve inside the same tenant", () => {
    const check = <T extends { tenantId: string }>(
      rows: T[],
      ref: (r: T) => string | null,
      target: { id: string; tenantId: string }[],
      label: string,
    ) => {
      for (const r of rows) {
        const id = ref(r);
        if (id === null) continue;
        const found = target.find((t) => t.id === id);
        expect(found, `${label}: ${id}`).toBeDefined();
        expect(found!.tenantId, `${label}: ${id}`).toBe(r.tenantId);
      }
    };
    check(DS.serviceRules, (r) => r.periodId, DS.schedulePeriods, "rule.period");
    check(DS.serviceRules, (r) => r.locationId, DS.locations, "rule.location");
    check(DS.serviceExceptions, (r) => r.ruleId, DS.serviceRules, "exception.rule");
    check(DS.rooms, (r) => r.locationId, DS.locations, "room.location");
    check(DS.bookings, (r) => r.roomId, DS.rooms, "booking.room");
    check(DS.bookings, (r) => r.seriesId, DS.bookingSeries, "booking.series");
    check(DS.bookings, (r) => r.serviceOccurrenceId, DS.serviceOccurrences, "booking.occurrence");
    check(DS.events, (r) => r.calendarId, DS.calendars, "event.calendar");
    check(DS.events, (r) => r.locationId, DS.locations, "event.location");
    check(DS.events, (r) => r.teamId, DS.teams, "event.team");
    check(DS.teamPositions, (r) => r.teamId, DS.teams, "position.team");
    check(DS.teamMembers, (r) => r.teamId, DS.teams, "member.team");
    check(DS.teamMembers, (r) => r.personId, DS.people, "member.person");
    check(DS.servicePlans, (r) => r.occurrenceId, DS.serviceOccurrences, "plan.occurrence");
    check(DS.servicePlans, (r) => r.leaderPersonId, DS.people, "plan.leader");
    check(DS.planItems, (r) => r.planId, DS.servicePlans, "item.plan");
    check(DS.planItems, (r) => r.songId, DS.songs, "item.song");
    check(DS.planItems, (r) => r.arrangementId, DS.arrangements, "item.arrangement");
    check(DS.assignments, (r) => r.occurrenceId, DS.serviceOccurrences, "assignment.occurrence");
    check(DS.assignments, (r) => r.planId, DS.servicePlans, "assignment.plan");
    check(DS.assignments, (r) => r.personId, DS.people, "assignment.person");
    check(DS.assignments, (r) => r.positionId, DS.teamPositions, "assignment.position");
    check(DS.arrangements, (r) => r.songId, DS.songs, "arrangement.song");
    check(DS.hrTickets, (r) => r.categoryId, DS.hrCategories, "ticket.category");
    check(DS.hrTickets, (r) => r.requesterPersonId, DS.people, "ticket.requester");
    check(DS.hrTicketMessages, (r) => r.ticketId, DS.hrTickets, "message.ticket");
    check(DS.hrApprovals, (r) => r.ticketId, DS.hrTickets, "approval.ticket");
    check(DS.absences, (r) => r.personId, DS.people, "absence.person");
    check(DS.absences, (r) => r.ticketId, DS.hrTickets, "absence.ticket");
    check(DS.pastoralRequests, (r) => r.formId, DS.formDefinitions, "request.form");
    check(DS.pages, (r) => r.parentId, DS.pages, "page.parent");
    check(DS.posts, (r) => r.coverMediaId, DS.media, "post.cover");
    check(DS.announcements, (r) => r.pdfMediaId, DS.media, "announcement.pdf");
    check(DS.locations, (r) => r.photoMediaId, DS.media, "location.photo");
    check(DS.attachments, (r) => r.mediaId, DS.media, "attachment.media");
  });

  it("users, memberships and people line up", () => {
    const users = ids(DS.users);
    for (const m of DS.memberships) expect(users.has(m.userId), m.userId).toBe(true);
    for (const p of DS.people) if (p.userId) expect(users.has(p.userId), p.id).toBe(true);
    for (const m of DS.orgMemberships) expect(users.has(m.userId), m.userId).toBe(true);
    // Every tenant user (not diocesan) has a membership.
    const orgUsers = new Set(DS.orgMemberships.map((m) => m.userId));
    const members = new Set(DS.memberships.map((m) => m.userId));
    for (const u of DS.users) expect(members.has(u.id) || orgUsers.has(u.id), u.id).toBe(true);
  });
});

describe("demo dataset — volumes per church (AC1)", () => {
  for (const church of CHURCHES) {
    describe(church.name, () => {
      const tid = church.id;
      const visible = (
        items: { status: string; publishedAt: string | null; expiresAt?: string | null }[],
      ) => items.filter((i) => isPubliclyVisible(i, NOW));

      it("has a full schedule with a seasonal period and at least three exceptions (one tied to a feast)", () => {
        const periods = of(DS.schedulePeriods, tid);
        expect(periods.length).toBeGreaterThanOrEqual(2);
        expect(periods.some((p) => p.yearly)).toBe(true);
        expect(of(DS.serviceRules, tid).length).toBeGreaterThanOrEqual(8);
        const exceptions = of(DS.serviceExceptions, tid);
        expect(exceptions.length).toBeGreaterThanOrEqual(3);
        const holidays = new Set<string>(DS.workdayCalendar.map((h) => h.date));
        const feastLinked = exceptions.filter((e) => e.reason && holidays.has(e.date));
        expect(feastLinked.length).toBeGreaterThanOrEqual(1);
      });

      it("has content volumes", () => {
        expect(visible(of(DS.posts, tid)).length).toBeGreaterThanOrEqual(10);
        expect(of(DS.events, tid).length).toBeGreaterThanOrEqual(15);
        expect(of(DS.events, tid).filter((e) => e.rrule !== null).length).toBeGreaterThanOrEqual(5);
        // Six consecutive weeks (-4 … +1) and an older Easter week (feast week, D-14).
        expect(of(DS.announcements, tid).length).toBe(7);
        const [easterWeek, ...weeks] = of(DS.announcements, tid)
          .map((a) => a.weekSunday)
          .sort();
        expect(liturgicalDay(easterWeek!, "catholic").key).toBe("easterSunday");
        expect(Date.parse(weeks[0]!) - Date.parse(easterWeek!)).toBeGreaterThanOrEqual(
          7 * 86_400_000,
        );
        for (let i = 1; i < weeks.length; i++) {
          expect(Date.parse(weeks[i]!) - Date.parse(weeks[i - 1]!)).toBe(7 * 86_400_000);
        }
        expect(of(DS.announcements, tid).filter((a) => a.pdfMediaId !== null).length).toBe(2);
      });

      it("has people: ≥ 6 staff, ≥ 30 volunteers (3 without login, 2 minors with guardian), ≥ 5 teams with positions", () => {
        const people = of(DS.people, tid);
        expect(
          people.filter((p) => p.staffGroup === "clergy" || p.staffGroup === "staff").length,
        ).toBeGreaterThanOrEqual(6);
        const volunteers = people.filter((p) => p.staffGroup === "volunteer");
        expect(volunteers.length).toBeGreaterThanOrEqual(30);
        expect(
          volunteers.filter((v) => v.userId === null && !v.isMinor).length,
        ).toBeGreaterThanOrEqual(3);
        const minors = volunteers.filter((v) => v.isMinor);
        expect(minors.length).toBeGreaterThanOrEqual(2);
        for (const m of minors) {
          expect(m.guardianEmail).toMatch(/@pelda\.hu$/);
          expect(m.userId).toBeNull();
          expect(m.email).toBeNull();
        }
        const teams = of(DS.teams, tid);
        expect(teams.length).toBeGreaterThanOrEqual(5);
        for (const t of teams) {
          expect(
            DS.teamPositions.filter((p) => p.teamId === t.id).length,
            t.name,
          ).toBeGreaterThanOrEqual(2);
          expect(
            DS.teamMembers.filter((m) => m.teamId === t.id && m.isLeader).length,
            t.name,
          ).toBeGreaterThanOrEqual(1);
        }
      });

      it("has ≥ 4 rooms, a recurring booking series, service blocks and a detected conflict", () => {
        expect(of(DS.rooms, tid).length).toBeGreaterThanOrEqual(4);
        expect(of(DS.bookingSeries, tid).length).toBeGreaterThanOrEqual(1);
        expect(of(DS.serviceRoomBlocks, tid).length).toBeGreaterThanOrEqual(1);
        expect(of(DS.bookings, tid).some((b) => b.source === "service")).toBe(true);
        expect(of(DS.bookingConflicts, tid).length).toBeGreaterThanOrEqual(1);
        const statuses = new Set(
          of(DS.bookings, tid)
            .filter((b) => b.source === "user")
            .map((b) => b.status),
        );
        for (const s of ["pending", "approved", "rejected", "cancelled"])
          expect(statuses.has(s as never), s).toBe(true);
      });

      it("never double-books a room (blocked intervals of pending/approved bookings do not overlap)", () => {
        const byRoom = new Map<string, typeof DS.bookings>();
        for (const b of of(DS.bookings, tid).filter(
          (x) => x.status === "pending" || x.status === "approved",
        )) {
          byRoom.set(b.roomId, [...(byRoom.get(b.roomId) ?? []), b]);
        }
        for (const [room, list] of byRoom) {
          for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
              expect(
                bookingsOverlap(list[i]!, list[j]!),
                `${room}: ${list[i]!.id} vs ${list[j]!.id}`,
              ).toBe(false);
            }
          }
        }
      });

      it("has ≥ 40 songs, arrangements and ≥ 8 service plans in mixed states", () => {
        expect(of(DS.songs, tid).length).toBeGreaterThanOrEqual(40);
        expect(of(DS.arrangements, tid).length).toBeGreaterThanOrEqual(8);
        const plans = of(DS.servicePlans, tid);
        expect(plans.length).toBeGreaterThanOrEqual(8);
        expect(new Set(plans.map((p) => p.status))).toEqual(
          new Set(["draft", "in_review", "approved", "locked"]),
        );
        for (const plan of plans) {
          expect(
            DS.planItems.filter((i) => i.planId === plan.id).length,
            plan.id,
          ).toBeGreaterThanOrEqual(3);
          if (plan.status === "locked" || plan.status === "approved") {
            expect(plan.approvedSnapshot, plan.id).not.toBeNull();
          }
        }
        const states = new Set(of(DS.assignments, tid).map((a) => a.status));
        for (const s of ["requested", "accepted", "declined", "swap_requested"])
          expect(states.has(s as never), s).toBe(true);
      });

      it("has ≥ 10 HR tickets across categories incl. a confidential and an anonymous one", () => {
        const tickets = of(DS.hrTickets, tid);
        expect(tickets.length).toBeGreaterThanOrEqual(10);
        expect(new Set(tickets.map((t) => t.categoryKey)).size).toBeGreaterThanOrEqual(6);
        expect(tickets.some((t) => t.confidential && !t.anonymous)).toBe(true);
        expect(tickets.some((t) => t.anonymous && t.requesterPersonId === null)).toBe(true);
        expect(new Set(tickets.map((t) => t.status)).size).toBeGreaterThanOrEqual(5);
        expect(tickets.some((t) => t.handover !== null)).toBe(true);
        expect(of(DS.absences, tid).length).toBeGreaterThanOrEqual(6);
        expect(of(DS.leaveEntitlements, tid).length).toBeGreaterThanOrEqual(4);
        expect(of(DS.staffProfiles, tid).length).toBeGreaterThanOrEqual(6);
      });

      it("has pages, rite pages with request forms, requests in several statuses and media records", () => {
        const pages = of(DS.pages, tid);
        const slugs = pages.map((p) => p.slug);
        expect(slugs).toContain("rolunk");
        expect(slugs).toContain("tortenetunk");
        const rites = pages.filter((p) => p.riteKey !== null);
        expect(rites.length).toBeGreaterThanOrEqual(4);
        const forms = of(DS.formDefinitions, tid);
        for (const r of rites)
          expect(
            forms.some((f) => f.key === r.riteKey),
            r.slug,
          ).toBe(true);
        const requests = of(DS.pastoralRequests, tid);
        expect(new Set(requests.map((r) => r.status))).toEqual(
          new Set(["uj", "folyamatban", "lezart"]),
        );
        const media = of(DS.media, tid);
        expect(
          media.filter((m) => m.kind === "image").every((m) => m.storageKey === "demo/templom.svg"),
        ).toBe(true);
      });
    });
  }

  it("the diocese, its links/delegations and the two placeholder parishes exist", () => {
    expect(DS.organizations.map((o) => o.id)).toEqual([DEMO_ORG_ID]);
    expect(
      DS.orgLinks.some((l) => l.tenantId === DEMO_TENANT_IDS.catholic && l.status === "active"),
    ).toBe(true);
    expect(
      DS.orgDelegations.filter((d) => d.tenantId === DEMO_TENANT_IDS.catholic).length,
    ).toBeGreaterThanOrEqual(1);
    const placeholders = DS.tenants.filter((t) =>
      DEMO_TENANT_IDS.placeholderParishes.includes(t.id as never),
    );
    expect(placeholders).toHaveLength(2);
    for (const t of [...placeholders, DS.tenants.find((x) => x.id === DEMO_TENANT_IDS.catholic)!]) {
      expect(t.organizationId, t.id).toBe(DEMO_ORG_ID);
      expect(
        DS.subscriptions.some((s) => s.tenantId === t.id && s.dealId !== null),
        t.id,
      ).toBe(true);
    }
    expect(DS.deals).toHaveLength(1);
    expect(DS.tenants).toHaveLength(5);
    const roles = DS.orgMemberships.flatMap((m) => m.roles);
    expect(roles).toEqual(
      expect.arrayContaining(["orgHrAdmin", "orgHrHandler", "orgConfidentialHandler"]),
    );
  });

  it("the plan catalog contains ingyenes, teljes and the workspace tiers", () => {
    expect(DS.plans.map((p) => p.key)).toEqual([
      "ingyenes",
      "teljes",
      "ws_s50",
      "ws_m150",
      "ws_l300",
    ]);
    expect(DS.subscriptions.length).toBeGreaterThanOrEqual(5);
  });
});

describe("demo dataset — personas (D-92)", () => {
  const PERSONA_KEYS = [
    "tulajdonos",
    "szerkeszto",
    "iroda",
    "vezeto",
    "onkentes",
    "zenei",
    "terem",
    "hr",
    "bizalmas",
  ];

  for (const church of CHURCHES) {
    it(`${church.name}: every persona has a user with the matching membership`, () => {
      const personas = PERSONAS.tenants[church.id]!;
      expect(Object.keys(personas).sort()).toEqual([...PERSONA_KEYS].sort());
      const membership = (p: string) =>
        DS.memberships.find((m) => m.tenantId === church.id && m.userId === personas[p])!;
      expect(membership("tulajdonos").role).toBe("owner");
      expect(membership("szerkeszto").role).toBe("editor");
      expect(membership("iroda").role).toBe("office");
      expect(membership("vezeto").role).toBe("admin");
      expect(membership("vezeto").wsRoles).toContain("leader");
      expect(membership("onkentes").role).toBeNull();
      expect(membership("onkentes").wsRoles).toEqual(["volunteer"]);
      expect(membership("zenei").wsRoles).toContain("musicLeader");
      expect(membership("terem").wsRoles).toContain("roomManager");
      expect(membership("terem").roomIds.length).toBeGreaterThanOrEqual(4);
      expect(membership("hr").wsRoles).toContain("hrHandler");
      expect(membership("hr").hrCategoryIds.length).toBeGreaterThanOrEqual(5);
      expect(membership("bizalmas").wsRoles).toContain("confidentialHandler");
      expect(membership("bizalmas").hrCategoryIds).toEqual([
        `hrc-${church.id.slice(2)}-bizalmas-bejelentes`,
      ]);
      // Exactly one active owner (D-26 invariant).
      expect(
        DS.memberships.filter((m) => m.tenantId === church.id && m.role === "owner" && m.active),
      ).toHaveLength(1);
    });
  }

  it("the diocesan HR persona is an organization user without tenant memberships", () => {
    const id = PERSONAS.org["egyhazmegyeiHr"]!;
    expect(DS.orgMemberships.find((m) => m.userId === id)?.roles).toContain("orgHrAdmin");
    expect(DS.memberships.some((m) => m.userId === id)).toBe(false);
  });
});

describe("demo dataset — dates are relative to `now` (AC3)", () => {
  const monday = (clock: ReturnType<typeof createClock>) => clock.monday;

  const scheduleInput = (ds: MockDataset, tenantId: string): ScheduleInput => ({
    locations: of(ds.locations, tenantId),
    periods: of(ds.schedulePeriods, tenantId),
    rules: of(ds.serviceRules, tenantId) as ScheduleInput["rules"],
    exceptions: of(ds.serviceExceptions, tenantId),
  });

  const CASES = [
    ["Friday (the reference date)", "2026-11-13T10:00:00+01:00", "2026-11-15"],
    ["Sunday itself", "2026-11-15T09:00:00+01:00", "2026-11-15"],
    ["Monday just after midnight", "2026-11-16T00:30:00+01:00", "2026-11-22"],
    ["a day in the summer period (CEST)", "2027-07-08T12:00:00+02:00", "2027-07-11"],
    ["the DST switch weekend", "2027-03-27T20:00:00+01:00", "2027-03-28"],
  ] as const;

  for (const [label, iso, expectedSunday] of CASES) {
    describe(label, () => {
      const now = new Date(iso);
      const ds = createDemoDataset(now);
      const clock = createClock(now);

      it("the coming Sunday's announcement is public; six weeks and an Easter week are present", () => {
        expect(clock.sunday).toBe(expectedSunday);
        for (const church of CHURCHES) {
          const announcements = of(ds.announcements, church.id);
          const upcoming = announcements.find((a) => a.weekSunday === expectedSunday);
          expect(upcoming, church.name).toBeDefined();
          expect(isPubliclyVisible(upcoming!, now), church.name).toBe(true);
          const [easterWeek, ...weeks] = announcements.map((a) => a.weekSunday).sort();
          expect(weeks).toEqual([-4, -3, -2, -1, 0, 1].map((k) => clock.sundayPlus(k)));
          expect(liturgicalDay(easterWeek!, "catholic").key, church.name).toBe("easterSunday");
          expect(easterWeek! < clock.sundayPlus(-4)).toBe(true);
          expect(
            isPubliclyVisible(
              announcements.find((a) => a.weekSunday === easterWeek)!,
              now,
            ),
          ).toBe(true);
        }
      });

      it("this week's services resolve with @churchy/schedule, incl. the main Sunday service", () => {
        for (const church of CHURCHES) {
          const services = resolve(scheduleInput(ds, church.id), monday(clock), clock.sunday);
          expect(services.length, church.name).toBeGreaterThanOrEqual(3);
          const sunday = services.filter((s) => s.date === clock.sunday);
          expect(sunday.length, church.name).toBeGreaterThanOrEqual(2);
          expect(services.every((s) => s.date >= monday(clock) && s.date <= clock.sunday)).toBe(
            true,
          );
        }
      });

      it("service plans and assignments sit on materialized occurrences within the window", () => {
        for (const church of CHURCHES) {
          const plans = of(ds.servicePlans, church.id);
          expect(plans.length, church.name).toBeGreaterThanOrEqual(8);
          const occurrences = new Map(ds.serviceOccurrences.map((o) => [o.id, o]));
          for (const plan of plans) {
            const occ = occurrences.get(plan.occurrenceId!)!;
            const day = clock.dateOf(occ.startsAt);
            expect(day >= clock.day(-28) && day <= clock.day(56), plan.id).toBe(true);
          }
          const upcoming = plans.filter(
            (p) => clock.dateOf(occurrences.get(p.occurrenceId!)!.startsAt) >= clock.today,
          );
          expect(upcoming.length, church.name).toBeGreaterThanOrEqual(3);
        }
      });

      it("created/updated timestamps never lie in the future and events are in the future or recurring", () => {
        for (const church of CHURCHES) {
          for (const p of of(ds.people, church.id))
            expect(Date.parse(p.createdAt) <= now.getTime()).toBe(true);
          for (const t of of(ds.hrTickets, church.id))
            expect(Date.parse(t.createdAt) <= now.getTime()).toBe(true);
          for (const r of of(ds.pastoralRequests, church.id))
            expect(Date.parse(r.createdAt) <= now.getTime()).toBe(true);
          const futureOrRecurring = of(ds.events, church.id).filter(
            (e) => e.rrule !== null || Date.parse(e.startsAt) > now.getTime(),
          );
          expect(futureOrRecurring.length, church.name).toBeGreaterThanOrEqual(12);
        }
      });

      it("HR tickets opened last week exist; open ones have SLA due dates", () => {
        for (const church of CHURCHES) {
          const recent = of(ds.hrTickets, church.id).filter(
            (t) =>
              Date.parse(t.createdAt) >= now.getTime() - 14 * 86_400_000 && t.status !== "lezart",
          );
          expect(recent.length, church.name).toBeGreaterThanOrEqual(5);
        }
      });
    });
  }

  it("shifts all dates with `now` and is deterministic", () => {
    const a = JSON.stringify(createDemoDataset(NOW));
    expect(JSON.stringify(createDemoDataset(NOW))).toBe(a);
    const later = createDemoDataset(new Date("2027-02-03T10:00:00+01:00"));
    expect(later.announcements.map((x) => x.weekSunday)).not.toEqual(
      DS.announcements.map((x) => x.weekSunday),
    );
  });

  it("the home page 'next services' and 'upcoming exceptions' have content on the reference date", () => {
    for (const church of CHURCHES) {
      const input = scheduleInput(DS, church.id);
      const next = nextServices(input, NOW.toISOString().replace("Z", "+00:00"));
      expect(next.length, church.name).toBeGreaterThanOrEqual(1);
      const warnings = upcomingExceptions(input, NOW.toISOString().replace("Z", "+00:00"), 21);
      expect(warnings.length, church.name).toBeGreaterThanOrEqual(1);
    }
  });

  it("local time conversion honours daylight saving time", () => {
    expect(localToIso("2026-11-15", "10:00")).toBe("2026-11-15T10:00:00+01:00");
    expect(localToIso("2026-07-12", "10:00")).toBe("2026-07-12T10:00:00+02:00");
    expect(localToIso("2027-03-28", "10:00")).toBe("2027-03-28T10:00:00+02:00");
    expect(localToIso("2026-10-25", "10:00")).toBe("2026-10-25T10:00:00+01:00");
  });
});

describe("demo dataset — terminology per preset (PRD §5.2)", () => {
  const textOf = (tenantId: string): string => {
    const own = (rows: { tenantId?: string | null }[]): unknown[] =>
      rows.filter((r) => r.tenantId === tenantId);
    return JSON.stringify([
      DS.tenants.find((t) => t.id === tenantId),
      own(DS.locations),
      own(DS.serviceRules),
      own(DS.serviceExceptions),
      own(DS.announcements),
      own(DS.posts),
      own(DS.calendars),
      own(DS.events),
      own(DS.pages),
      own(DS.formDefinitions),
      own(DS.pastoralRequests),
      own(DS.people),
      own(DS.teams),
      own(DS.teamPositions),
      own(DS.rooms),
      own(DS.bookings),
      own(DS.songs),
      own(DS.servicePlans),
      own(DS.planItems),
      own(DS.planComments),
      own(DS.planTemplates),
      own(DS.hrCategories),
      own(DS.hrTickets),
      own(DS.hrTicketMessages),
      own(DS.notifications),
    ]).toLowerCase();
  };

  const rk = textOf(DEMO_TENANT_IDS.catholic);
  const ref = textOf(DEMO_TENANT_IDS.reformed);
  const bapt = textOf(DEMO_TENANT_IDS.baptist);

  it("Catholic parish uses szentmise / miserend / plébános / homília", () => {
    for (const w of ["szentmise", "miserend", "plébános", "plébánia", "homília", "ministráns"]) {
      expect(rk, w).toContain(w);
    }
    expect(
      DS.schedulePeriods.filter((p) => p.tenantId === DEMO_TENANT_IDS.catholic).map((p) => p.name),
    ).toContain("Nyári miserend");
    expect(rk).not.toContain("istentiszteleti rend");
    expect(rk).not.toContain("lelkipásztor");
  });

  it("Reformed congregation never mentions szentmise and friends", () => {
    for (const w of [
      "szentmise",
      "miserend",
      "plébános",
      "plébánia",
      "homília",
      "ministráns",
      "rózsafüzér",
      "szentségimádás",
      "káplán",
      "gyónás",
      "gyónási",
    ]) {
      expect(ref, w).not.toContain(w);
    }
    expect(/(^|[^a-záéíóöőúüű])mise([^a-záéíóöőúüű]|$)/.test(ref)).toBe(false);
    for (const w of [
      "istentisztelet",
      "istentiszteleti rend",
      "lelkipásztor",
      "presbit",
      "konfirmáció",
      "igehirdetés",
      "úrvacsora",
    ]) {
      expect(ref, w).toContain(w);
    }
    expect(
      DS.schedulePeriods.filter((p) => p.tenantId === DEMO_TENANT_IDS.reformed).map((p) => p.name),
    ).toContain("Nyári istentiszteleti rend");
  });

  it("Baptist church uses free-church terminology (alkalmaink, imaház, gyülekezetvezetés, bemerítés)", () => {
    for (const w of [
      "szentmise",
      "miserend",
      "plébán",
      "homília",
      "ministráns",
      "templom",
      "presbit",
      "konfirmáció",
      "káplán",
      "kántor",
      "rózsafüzér",
    ]) {
      expect(bapt, w).not.toContain(w);
    }
    for (const w of [
      "istentisztelet",
      "imaház",
      "gyülekezetvezet",
      "bemerítés",
      "lelkipásztor",
      "dicsőítő",
      "bibliaóra",
    ]) {
      expect(bapt, w).toContain(w);
    }
    expect(
      DS.schedulePeriods.filter((p) => p.tenantId === DEMO_TENANT_IDS.baptist).map((p) => p.name),
    ).toContain("Nyári alkalmaink");
  });

  it("service types come from the church's own vocabulary", () => {
    const types = (id: string): Set<string> =>
      new Set(DS.serviceRules.filter((r) => r.tenantId === id).map((r) => r.serviceType));
    expect(types(DEMO_TENANT_IDS.catholic)).toContain("szentmise");
    expect(types(DEMO_TENANT_IDS.reformed)).toContain("istentisztelet");
    expect(types(DEMO_TENANT_IDS.baptist)).toContain("istentisztelet");
    for (const t of [...types(DEMO_TENANT_IDS.reformed), ...types(DEMO_TENANT_IDS.baptist)]) {
      expect(t.includes("mise"), t).toBe(false);
    }
  });

  it("tenants carry the preset key of their denomination", () => {
    expect(DS.tenants.find((t) => t.id === DEMO_TENANT_IDS.catholic)?.denomination).toBe("rk");
    expect(DS.tenants.find((t) => t.id === DEMO_TENANT_IDS.reformed)?.denomination).toBe("ref");
    expect(DS.tenants.find((t) => t.id === DEMO_TENANT_IDS.baptist)?.denomination).toBe("bapt");
  });
});

describe("demo dataset — privacy and copyright rules", () => {
  it("every e-mail address is @pelda.hu and every phone number is +36 30 000 xxxx", () => {
    const emails: string[] = [];
    for (const u of DS.users) emails.push(u.email);
    for (const p of DS.people) {
      if (p.email) emails.push(p.email);
      if (p.guardianEmail) emails.push(p.guardianEmail);
    }
    for (const t of DS.tenants) {
      const c = t.siteConfig.contact?.email;
      if (c) emails.push(c);
    }
    for (const f of DS.formDefinitions) emails.push(...f.notifyEmails);
    for (const r of DS.pastoralRequests)
      if (typeof r.data["email"] === "string") emails.push(r.data["email"]);
    for (const b of DS.billingAccounts) emails.push(b.email);
    expect(emails.length).toBeGreaterThan(100);
    for (const e of emails) expect(e, e).toMatch(/@pelda\.hu$/);

    const phones: string[] = [];
    for (const p of DS.people) if (p.phone) phones.push(p.phone);
    for (const t of DS.tenants)
      if (t.siteConfig.contact?.phone) phones.push(t.siteConfig.contact.phone);
    for (const r of DS.pastoralRequests)
      if (typeof r.data["phone"] === "string") phones.push(r.data["phone"]);
    expect(phones.length).toBeGreaterThan(100);
    for (const p of phones) {
      expect(p, p).toMatch(/^\+36 30 000 \d{4}$/);
      expect(formatPhone(p)).toBe(p);
    }
  });

  it("phone numbers of people are unique", () => {
    const phones = DS.people.map((p) => p.phone).filter((p): p is string => p !== null);
    expect(new Set(phones).size).toBe(phones.length);
  });

  it("demo accounts and tax numbers are obviously fictitious", () => {
    for (const t of DS.tenants) {
      const g = t.siteConfig.giving;
      if (g?.accountNumber) expect(g.accountNumber).toMatch(/^99999999-/);
      const tax = t.siteConfig.legal?.taxNumber;
      if (tax) expect(tax).toMatch(/^99999999-/);
    }
    for (const b of DS.billingAccounts) if (b.taxNumber) expect(b.taxNumber).toMatch(/^99999999-/);
  });

  it("no copyrighted lyrics or scores: lyrics only for public-domain/own songs, chord charts only for own works", () => {
    for (const s of DS.songs) {
      if (s.lyrics !== null) expect(["public_domain", "own"], s.title).toContain(s.licence);
      if (s.licence === "public_domain") expect(s.lyrics, s.title).toBeNull();
      if (s.licence === "licensed" || s.licence === "permission") {
        expect(s.lyrics, s.title).toBeNull();
        expect(s.copyrightHolder, s.title).not.toBeNull();
        expect(s.licenceRef, s.title).not.toBeNull();
      }
      if (s.lyrics !== null) expect(s.lyrics.length, s.title).toBeLessThan(400);
    }
    for (const a of DS.arrangements) {
      if (a.chordpro !== null)
        expect(DS.songs.find((s) => s.id === a.songId)?.licence, a.name).toBe("own");
    }
  });

  it("hymnal references use abbreviation + number only and point at hymnals the tenant may see", () => {
    const hymnals = new Map(DS.hymnals.map((h) => [h.id, h]));
    for (const s of DS.songs) {
      for (const ref of s.hymnalRefs) {
        const h = hymnals.get(ref.hymnalId);
        expect(h, s.title).toBeDefined();
        expect(h!.tenantId === null || h!.tenantId === s.tenantId, s.title).toBe(true);
        expect(ref.versesNote).toBeNull();
      }
    }
    // The platform catalog holds names and abbreviations only.
    expect(
      DS.hymnals
        .filter((h) => h.tenantId === null)
        .map((h) => h.abbreviation)
        .sort(),
    ).toEqual(["BÉ", "EÉ", "KÉ", "RÉ", "ÉE"].sort());
  });

  it("files are records pointing at placeholders; request media and sheet music are private", () => {
    for (const m of DS.media) {
      expect(["demo/templom.svg", "demo/minta-dokumentum.pdf"]).toContain(m.storageKey);
      if (m.kind === "pdf" && m.filename.startsWith("kotta")) expect(m.visibility).toBe("private");
    }
    for (const a of DS.attachments) {
      if (a.url !== null) expect(a.url).toMatch(/^https:\/\/example\.org\//);
    }
  });

  it("HR content is plainly fictional: sick-leave tickets carry no health details; notifications carry no content", () => {
    for (const t of DS.hrTickets.filter((x) => x.categoryKey === "betegszabadsag")) {
      expect(t.data["note"] ?? "").toBe("");
    }
    for (const n of DS.notifications) {
      for (const v of Object.values(n.payload)) {
        if (typeof v === "string") expect(v.length).toBeLessThanOrEqual(20);
      }
    }
  });

  it("generated names are family-name first and demo people never use real-looking contact data", () => {
    for (const p of DS.people) {
      expect(p.familyName.length).toBeGreaterThan(0);
      expect(p.givenName.length).toBeGreaterThan(0);
    }
    expect(DS.users.every((u) => u.email.endsWith("@pelda.hu"))).toBe(true);
  });
});

describe("demo dataset — Hungarian public holidays in the workday calendar", () => {
  it("comes from @churchy/calendar for three years", () => {
    const year = Number(NOW.toISOString().slice(0, 4));
    const expected = [year - 1, year, year + 1].flatMap((y) =>
      publicHolidays(y).map((h) => h.date),
    );
    expect(DS.workdayCalendar.map((w) => w.date)).toEqual(expected);
  });
});
