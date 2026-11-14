/**
 * Unit tests for schema invariants (refinements) and shared helpers. Repository behaviour is
 * covered by the contract suites (`src/testing/suites`).
 */
import { describe, expect, it } from "vitest";
import { AbsenceInputSchema, StaffProfileInputSchema } from "./absences";
import { AnnouncementInputSchema } from "./announcements";
import { AssignmentInputSchema } from "./assignments";
import { AttachmentInputSchema } from "./attachments";
import { BookingInputSchema, bookingsOverlap, blockedInterval } from "./bookings";
import { EventInputSchema } from "./events";
import { HrCategoryInputSchema, HrTicketInputSchema } from "./hr";
import { MediaCreateInputSchema } from "./media";
import { InviteMemberInputSchema } from "./members";
import { PostInputSchema } from "./news";
import { NotificationInputSchema } from "./notifications";
import { DealInputSchema } from "./organizations";
import { PageBlockSchema } from "./pages";
import { AvailabilityBlockInputSchema, PersonInputSchema } from "./people";
import { FormDefinitionInputSchema, validateFormData } from "./requests";
import type { FormField } from "./requests";
import { RoomInputSchema } from "./rooms";
import {
  SchedulePeriodInputSchema,
  ServiceExceptionInputSchema,
  ServiceRuleInputSchema,
} from "./schedule";
import { ServicePlanInputSchema } from "./service-plans";
import { SongInputSchema } from "./songs";
import { TeamPositionInputSchema } from "./teams";
import { DomainSchema, SiteConfigOverridesSchema, TenantCreateInputSchema } from "./tenants";

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

const doc = { type: "doc", content: [] };

describe("schedule schemas", () => {
  it("validates periods", () => {
    expect(ok(SchedulePeriodInputSchema, { name: "Általános" })).toBe(true);
    expect(
      ok(SchedulePeriodInputSchema, {
        name: "Nyári",
        validFrom: "2026-06-01",
        validTo: "2026-05-01",
      }),
    ).toBe(false);
    expect(
      ok(SchedulePeriodInputSchema, {
        name: "Téli",
        yearly: true,
        validFrom: "2026-12-01",
        validTo: "2026-02-28",
      }),
    ).toBe(true);
    expect(
      ok(SchedulePeriodInputSchema, { name: "Évente", yearly: true, validFrom: "2026-12-01" }),
    ).toBe(false);
  });

  it("applies rule defaults and constraints", () => {
    const rule = ServiceRuleInputSchema.parse({
      periodId: "p",
      locationId: "l",
      weekday: 5,
      nthWeek: -1,
      time: "18:00",
      serviceType: "szentmise",
    });
    expect(rule).toMatchObject({
      nthWeek: -1,
      durationMin: 60,
      language: "hu",
      title: null,
      livestream: false,
    });
    expect(ok(ServiceRuleInputSchema, { ...rule, nthWeek: 0 })).toBe(false);
  });

  it("validates exceptions per kind", () => {
    expect(ok(ServiceExceptionInputSchema, { date: "2026-12-24", kind: "cancel" })).toBe(true);
    expect(ok(ServiceExceptionInputSchema, { date: "2026-12-24", kind: "modify" })).toBe(false);
    expect(
      ok(ServiceExceptionInputSchema, {
        date: "2026-12-24",
        kind: "modify",
        ruleId: "r",
        time: "08:30",
      }),
    ).toBe(true);
    expect(
      ok(ServiceExceptionInputSchema, {
        date: "2026-12-24",
        kind: "add",
        locationId: "l",
        time: "23:30",
      }),
    ).toBe(false);
    expect(
      ok(ServiceExceptionInputSchema, {
        date: "2026-12-24",
        kind: "add",
        locationId: "l",
        time: "23:30",
        serviceType: "ejfeli-mise",
      }),
    ).toBe(true);
  });
});

describe("content schemas", () => {
  it("ties announcements to a Sunday with text or PDF", () => {
    expect(ok(AnnouncementInputSchema, { weekSunday: "2026-11-15", body: doc })).toBe(true);
    expect(ok(AnnouncementInputSchema, { weekSunday: "2026-11-15", pdfMediaId: "m-1" })).toBe(true);
    expect(ok(AnnouncementInputSchema, { weekSunday: "2026-11-14", body: doc })).toBe(false);
    expect(ok(AnnouncementInputSchema, { weekSunday: "2026-11-15" })).toBe(false);
  });

  it("applies post defaults", () => {
    expect(PostInputSchema.parse({ slug: "advent", title: "Advent", body: doc })).toMatchObject({
      lead: "",
      categories: [],
      coverMediaId: null,
      expiresAt: null,
    });
    expect(ok(PostInputSchema, { slug: "advent", title: "Advent" })).toBe(false);
  });

  it("validates events", () => {
    const base = {
      calendarId: "c",
      visibility: "public",
      slug: "est",
      title: "Est",
      startsAt: "2026-11-20T19:00:00+01:00",
    };
    expect(ok(EventInputSchema, base)).toBe(true);
    expect(ok(EventInputSchema, { ...base, endsAt: "2026-11-20T18:00:00+01:00" })).toBe(false);
    expect(ok(EventInputSchema, { ...base, rrule: "RRULE:FREQ=WEEKLY;BYDAY=TU,TH" })).toBe(true);
    expect(ok(EventInputSchema, { ...base, rrule: "hetente" })).toBe(false);
    expect(ok(EventInputSchema, { ...base, parentEventId: "e-1" })).toBe(false);
    expect(
      ok(EventInputSchema, {
        ...base,
        parentEventId: "e-1",
        recurrenceId: "2026-11-27T19:00:00+01:00",
      }),
    ).toBe(true);
  });

  it("allows only allow-listed page blocks", () => {
    expect(
      ok(PageBlockSchema, {
        type: "embed",
        provider: "youtube",
        url: "https://www.youtube.com/watch?v=x",
      }),
    ).toBe(true);
    expect(
      ok(PageBlockSchema, { type: "embed", provider: "tiktok", url: "https://example.test" }),
    ).toBe(false);
    expect(ok(PageBlockSchema, { type: "html", html: "<script>" })).toBe(false);
  });

  it("requires alt text on images unless decorative", () => {
    const base = {
      kind: "image",
      filename: "a.jpg",
      mimeType: "image/jpeg",
      storageKey: "k",
      bytes: 1,
    };
    expect(ok(MediaCreateInputSchema, base)).toBe(false);
    expect(ok(MediaCreateInputSchema, { ...base, alt: "  " })).toBe(false);
    expect(ok(MediaCreateInputSchema, { ...base, alt: "Templom" })).toBe(true);
    expect(ok(MediaCreateInputSchema, { ...base, decorative: true })).toBe(true);
    expect(ok(MediaCreateInputSchema, { ...base, kind: "pdf", mimeType: "application/pdf" })).toBe(
      true,
    );
  });
});

describe("tenant and member schemas", () => {
  it("validates tenants, overrides and domains", () => {
    expect(
      TenantCreateInputSchema.parse({ slug: "minta", name: "Minta", denomination: "ev" }),
    ).toMatchObject({
      planKey: "ingyenes",
      organizationId: null,
      siteConfig: {},
    });
    expect(
      ok(SiteConfigOverridesSchema, { modules: { news: false }, theme: { radius: "large" } }),
    ).toBe(true);
    expect(ok(SiteConfigOverridesSchema, { modules: { tiktok: true } })).toBe(false);
    expect(ok(SiteConfigOverridesSchema, { giving: { accountNumber: "11773016-11111018" } })).toBe(
      true,
    );
    expect(DomainSchema.shape.hostname.parse("WWW.Minta-Plebania.HU")).toBe(
      "www.minta-plebania.hu",
    );
  });

  it("needs a website or workspace role for invitations", () => {
    expect(
      ok(InviteMemberInputSchema, { email: "a@example.test", name: "A", role: "office" }),
    ).toBe(true);
    expect(
      ok(InviteMemberInputSchema, { email: "a@example.test", name: "A", wsRoles: ["volunteer"] }),
    ).toBe(true);
    expect(ok(InviteMemberInputSchema, { email: "a@example.test", name: "A" })).toBe(false);
  });

  it("orders deal windows", () => {
    const base = {
      planKeys: ["teljes"],
      parishLimit: 10,
      priceTerms: { monthlyPerParish: 1, yearlyPerParish: null, note: null },
      validFrom: "2027-01-01",
    };
    expect(ok(DealInputSchema, { ...base, validTo: null })).toBe(true);
    expect(ok(DealInputSchema, { ...base, validTo: "2026-12-31" })).toBe(false);
  });
});

describe("workspace schemas", () => {
  it("validates people and availability", () => {
    expect(PersonInputSchema.parse({ familyName: "Kiss", givenName: "Anna" })).toMatchObject({
      staffGroup: "volunteer",
      contactVisibility: { email: "workspace", phone: "workspace" },
    });
    const block = {
      personId: "p",
      from: "2026-12-01T10:00:00+01:00",
      to: "2026-12-01T12:00:00+01:00",
    };
    expect(ok(AvailabilityBlockInputSchema, block)).toBe(true);
    expect(ok(AvailabilityBlockInputSchema, { ...block, to: block.from })).toBe(false);
  });

  it("validates positions, rooms, bookings and plans", () => {
    expect(
      ok(TeamPositionInputSchema, { teamId: "t", name: "Ének", minCount: 2, maxCount: 4 }),
    ).toBe(true);
    expect(
      ok(TeamPositionInputSchema, { teamId: "t", name: "Ének", minCount: 2, maxCount: 1 }),
    ).toBe(false);
    expect(RoomInputSchema.parse({ locationId: "l", name: "Terem" }).rules.whoCanRequest).toBe(
      "all_workspace",
    );
    const booking = {
      roomId: "r",
      title: "Próba",
      startsAt: "2026-11-20T17:00:00+01:00",
      endsAt: "2026-11-20T18:00:00+01:00",
    };
    expect(ok(BookingInputSchema, booking)).toBe(true);
    expect(ok(BookingInputSchema, { ...booking, endsAt: booking.startsAt })).toBe(false);
    expect(
      ok(ServicePlanInputSchema, { title: "Terv", leaderPersonId: "p", occurrenceId: "o" }),
    ).toBe(true);
    expect(
      ok(ServicePlanInputSchema, {
        title: "Terv",
        leaderPersonId: "p",
        occurrenceId: "o",
        eventId: "e",
      }),
    ).toBe(false);
    expect(
      ok(SongInputSchema, { title: "Ének", hymnalRefs: [{ hymnalId: "h", number: "42a" }] }),
    ).toBe(true);
    expect(
      ok(SongInputSchema, {
        title: "Ének",
        hymnalRefs: [{ hymnalId: "h", number: "negyvenkettő" }],
      }),
    ).toBe(false);
  });

  it("validates assignments and attachments", () => {
    const a = {
      teamId: "t",
      positionId: "p",
      personId: "x",
      eventId: "e",
      startsAt: "2026-11-20T17:00:00+01:00",
      endsAt: "2026-11-20T18:00:00+01:00",
    };
    expect(ok(AssignmentInputSchema, a)).toBe(true);
    expect(ok(AssignmentInputSchema, { ...a, endsAt: a.startsAt })).toBe(false);
    expect(ok(AssignmentInputSchema, { ...a, occurrenceId: "o" })).toBe(false);
    const att = {
      ownerType: "song",
      ownerId: "s",
      kind: "audio",
      label: "Felvétel",
      mediaId: "m",
      rightsConfirmed: true,
      rightsConfirmedBy: "p",
    };
    expect(ok(AttachmentInputSchema, att)).toBe(true);
    expect(ok(AttachmentInputSchema, { ...att, url: "https://example.test/a.mp3" })).toBe(false);
    expect(ok(AttachmentInputSchema, { ...att, rightsConfirmed: false })).toBe(false);
  });

  it("validates HR, absences and notifications", () => {
    expect(
      ok(HrCategoryInputSchema, {
        key: "szabadsag",
        name: "Szabadság",
        createsAbsence: true,
        absenceType: "rendes_szabadsag",
      }),
    ).toBe(true);
    expect(
      ok(HrCategoryInputSchema, { key: "szabadsag", name: "Szabadság", createsAbsence: true }),
    ).toBe(false);
    expect(
      ok(HrTicketInputSchema, { categoryId: "c", requesterPersonId: "p", subject: "Kérés" }),
    ).toBe(true);
    expect(
      ok(HrTicketInputSchema, {
        categoryId: "c",
        requesterPersonId: null,
        anonymous: true,
        subject: "Panasz",
      }),
    ).toBe(true);
    expect(
      ok(HrTicketInputSchema, { categoryId: "c", requesterPersonId: null, subject: "Kérés" }),
    ).toBe(false);
    const absence = {
      personId: "p",
      startDate: "2026-12-21",
      endDate: "2026-12-23",
      type: "rendes_szabadsag",
      workingDays: 2.5,
    };
    expect(ok(AbsenceInputSchema, absence)).toBe(true);
    expect(ok(AbsenceInputSchema, { ...absence, endDate: "2026-12-20" })).toBe(false);
    expect(
      StaffProfileInputSchema.parse({
        personId: "p",
        position: "kántor",
        employmentType: "megbizasi",
        startDate: "2024-01-01",
        weeklyHours: 10,
      }).workPattern,
    ).toEqual({ weekdays: [1, 2, 3, 4, 5] });
    expect(ok(NotificationInputSchema, { userId: "u", kind: "mention", link: "/munkater" })).toBe(
      true,
    );
    expect(
      ok(NotificationInputSchema, {
        userId: "u",
        kind: "mention",
        link: "/munkater",
        payload: { nested: { a: 1 } },
      }),
    ).toBe(false);
  });
});

describe("validateFormData", () => {
  const fields: FormField[] = [
    { type: "text", key: "nev", label: "Név", required: true, help: null },
    { type: "email", key: "email", label: "E-mail", required: false, help: null },
    { type: "date", key: "datum", label: "Dátum", required: false, help: null },
    { type: "checkbox", key: "hozzajarul", label: "Hozzájárulok", required: true, help: null },
    {
      type: "select",
      key: "helyszin",
      label: "Helyszín",
      required: false,
      help: null,
      multiple: false,
      options: [{ value: "templom", label: "Templom" }],
    },
    {
      type: "select",
      key: "napok",
      label: "Napok",
      required: false,
      help: null,
      multiple: true,
      options: [
        { value: "h", label: "Hétfő" },
        { value: "k", label: "Kedd" },
      ],
    },
  ];

  it("accepts valid data", () => {
    expect(
      validateFormData(fields, {
        nev: "Minta Anna",
        email: "a@example.test",
        datum: "2026-12-01",
        hozzajarul: true,
        helyszin: "templom",
        napok: ["h", "k"],
      }),
    ).toEqual([]);
    expect(
      validateFormData(fields, { nev: "Minta Anna", hozzajarul: true, email: null, napok: [] }),
    ).toEqual([]);
  });

  it("reports missing, mistyped and unknown fields", () => {
    const issues = validateFormData(fields, {
      email: "nem-email",
      datum: "2026-13-01",
      hozzajarul: "igen",
      helyszin: "kapolna",
      napok: ["sz"],
      extra: 1,
    });
    expect(issues.map((i) => i.path[0]).sort()).toEqual(
      ["datum", "email", "extra", "helyszin", "hozzajarul", "napok", "nev"].sort(),
    );
    expect(validateFormData(fields, { nev: 42, hozzajarul: true }).map((i) => i.path[0])).toEqual([
      "nev",
    ]);
  });

  it("rejects duplicate field keys in form definitions", () => {
    const def = {
      key: "keresztelo",
      title: "Keresztelő",
      referencePrefix: "KER",
      fields: [fields[0], fields[0]],
    };
    expect(ok(FormDefinitionInputSchema, def)).toBe(false);
    expect(ok(FormDefinitionInputSchema, { ...def, fields: [fields[0]] })).toBe(true);
  });
});

describe("booking overlap", () => {
  const b = (start: string, end: string, before = 0, after = 0) => ({
    startsAt: `2026-11-20T${start}:00+01:00`,
    endsAt: `2026-11-20T${end}:00+01:00`,
    bufferBeforeMin: before,
    bufferAfterMin: after,
  });

  it("uses half-open intervals extended by buffers", () => {
    expect(blockedInterval(b("10:00", "11:00", 30, 15))).toEqual([
      Date.parse("2026-11-20T09:30:00+01:00"),
      Date.parse("2026-11-20T11:15:00+01:00"),
    ]);
    expect(bookingsOverlap(b("10:00", "11:00"), b("10:30", "11:30"))).toBe(true);
    expect(bookingsOverlap(b("10:00", "11:00"), b("11:00", "12:00"))).toBe(false);
    expect(bookingsOverlap(b("10:00", "11:00", 0, 15), b("11:00", "12:00"))).toBe(true);
    expect(bookingsOverlap(b("10:00", "11:00"), b("11:00", "12:00", 1))).toBe(true);
  });
});
