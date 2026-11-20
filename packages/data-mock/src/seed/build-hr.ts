/** HR (SDD §25): categories, tickets, absences, staff profiles, leave; plus notifications. */
import type {
  Absence,
  ApprovalStep,
  HrCategory,
  HrTicket,
  NotificationKind,
} from "@churchy/contracts";
import { publicHolidays } from "@churchy/calendar";
import { addDays, isoWeekday } from "@churchy/hu";
import type { Build } from "./context";
import { dateOf, relData } from "./context";
import { plusMinutesIso } from "./clock";
import type { When } from "./types";

function step(s: "manager" | "leader" | "hrHandler"): ApprovalStep {
  return s === "manager" ? { kind: "manager" } : { kind: "role", role: s, any: true };
}

export function buildHr(b: Build): void {
  const { spec, c, ds, tid, k } = b;
  const year = c.today.slice(0, 4);

  // Categories.
  for (const cat of spec.hrCategories) {
    const id = `hrc-${k}-${cat.key}`;
    b.hrCategoryId.set(cat.key, id);
    const hc: HrCategory = {
      id,
      tenantId: tid,
      key: cat.key,
      name: cat.name,
      fields: cat.fields,
      whoCanSubmit: cat.whoCanSubmit,
      handlerPersonIds: cat.handlers.map((h) => b.personId.get(h) as string),
      approvalChain: cat.chain.map(step),
      slaHours: cat.slaHours,
      confidential: cat.confidential ?? false,
      allowAnonymous: cat.allowAnonymous ?? false,
      createsAbsence: cat.absenceType !== undefined,
      absenceType: cat.absenceType ?? null,
      retentionDays: cat.retentionDays ?? 3 * 365,
      active: true,
      templateId: null,
      templateVersion: null,
    };
    ds.hrCategories.push(hc);
  }
  const hrUser = ds.memberships.find(
    (m) => m.tenantId === tid && m.userId === b.personaUser.get("hr"),
  );
  if (hrUser)
    hrUser.hrCategoryIds = ds.hrCategories
      .filter((x) => x.tenantId === tid && !x.confidential)
      .map((x) => x.id);
  const confUser = ds.memberships.find(
    (m) => m.tenantId === tid && m.userId === b.personaUser.get("bizalmas"),
  );
  if (confUser)
    confUser.hrCategoryIds = ds.hrCategories
      .filter((x) => x.tenantId === tid && x.confidential)
      .map((x) => x.id);

  // Working-day calculation (SDD §25.3): work pattern minus public holidays, half days −0.5.
  const holidayDates = new Set<string>();
  for (const y of [Number(year) - 1, Number(year), Number(year) + 1]) {
    for (const h of publicHolidays(y)) holidayDates.add(h.date);
  }
  const patternOf = (personKey: string): number[] =>
    spec.people.find((p) => p.key === personKey)?.employment?.days ?? [1, 2, 3, 4, 5];
  const workingDays = (
    personKey: string,
    start: string,
    end: string,
    halfStart: boolean,
    halfEnd: boolean,
  ): number => {
    const pattern = patternOf(personKey);
    let days = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (pattern.includes(isoWeekday(d)) && !holidayDates.has(d)) days++;
    }
    if (halfStart) days -= 0.5;
    if (halfEnd && end !== start) days -= 0.5;
    else if (halfEnd && !halfStart) days -= 0.5;
    return Math.max(0, days);
  };

  const absenceBase = (
    key: string,
    person: string,
    start: When,
    days: number,
    type: string,
    status: Absence["status"],
    ticketId: string | null,
    halfDayEnd: boolean,
  ): void => {
    const startDate = dateOf(b, start);
    const endDate = addDays(startDate, days - 1);
    ds.absences.push({
      id: `abs-${k}-${key}`,
      tenantId: tid,
      personId: b.personId.get(person) as string,
      startDate,
      endDate,
      halfDayStart: false,
      halfDayEnd,
      type,
      workingDays: workingDays(person, startDate, endDate, false, halfDayEnd),
      ticketId,
      status,
      createdAt: c.at(addDays(startDate, -20), "10:00"),
    });
  };

  // Tickets: references are numbered by age.
  const order = spec.hrTickets.map((t, i) => ({ i, t })).sort((x, y) => y.t.daysAgo - x.t.daysAgo);
  const numberOf = new Map(order.map((o, idx) => [o.i, idx + 7]));
  const refs: string[] = [];
  spec.hrTickets.forEach((t, i) => {
    const cat = ds.hrCategories.find((x) => x.id === b.hrCategoryId.get(t.category)) as HrCategory;
    const id = `hrt-${k}-${i + 1}`;
    const reference = `HR-${year}-${String(numberOf.get(i)).padStart(4, "0")}`;
    refs[i] = reference;
    const createdAt = c.ago(t.daysAgo, "09:40");
    const closed = t.status === "lezart";
    const closedAt = closed
      ? plusMinutesIso(createdAt, Math.max(1, Math.min(t.daysAgo, 4)) * 24 * 60)
      : null;
    const handlerKey = t.assignee ?? cat.handlerPersonIds[0];
    const assignee = t.assignee
      ? (b.personId.get(t.assignee) ?? null)
      : (cat.handlerPersonIds[0] ?? null);
    void handlerKey;
    const chainLen = cat.approvalChain.length;
    const ticket: HrTicket = {
      id,
      tenantId: tid,
      reference,
      categoryId: cat.id,
      categoryKey: cat.key,
      requesterPersonId: t.anonymous
        ? null
        : t.requester
          ? (b.personId.get(t.requester) ?? null)
          : null,
      anonymous: t.anonymous ?? false,
      subject: t.subject,
      data: relData(b, t.data),
      status: t.status,
      currentStep:
        t.step ??
        (t.status === "jovahagyasra_var"
          ? 0
          : t.status === "jovahagyva" || t.status === "elutasitva"
            ? Math.max(0, chainLen - 1)
            : 0),
      assigneePersonId: t.status === "uj" ? null : assignee,
      dueAt: cat.slaHours ? plusMinutesIso(createdAt, cat.slaHours * 60) : null,
      confidential: cat.confidential,
      handover: t.handover
        ? {
            recipient: t.handover.recipient,
            date: c.day(-t.handover.daysAgo),
            summary: t.handover.summary,
          }
        : null,
      closedAt,
      purgeAfter: closedAt ? c.at(addDays(c.dateOf(closedAt), cat.retentionDays), "03:00") : null,
      createdAt,
      updatedAt: closedAt ?? c.ago(Math.max(0, t.daysAgo - 1), "11:00"),
    };
    ds.hrTickets.push(ticket);
    (t.messages ?? []).forEach((m, j) => {
      ds.hrTicketMessages.push({
        id: `hrm-${k}-${i + 1}-${j + 1}`,
        tenantId: tid,
        ticketId: id,
        authorPersonId: m.by ? (b.personId.get(m.by) ?? null) : null,
        body: m.body,
        internal: m.internal ?? false,
        attachmentMediaIds: [],
        createdAt: c.ago(m.daysAgo, "10:15"),
      });
    });
    (t.approvals ?? []).forEach((a, j) => {
      ds.hrApprovals.push({
        id: `hra-${k}-${i + 1}-${j + 1}`,
        tenantId: tid,
        ticketId: id,
        step: a.step,
        approverPersonId: b.personId.get(a.by) as string,
        decision: a.decision,
        comment: a.comment ?? null,
        decidedAt: c.ago(a.daysAgo, "16:05"),
      });
    });
    if (t.absence) {
      absenceBase(
        `t${i + 1}`,
        t.requester as string,
        t.absence.start,
        t.absence.days,
        t.absence.type,
        t.absence.status,
        id,
        false,
      );
    }
  });

  spec.absences.forEach((a, i) => {
    absenceBase(
      `s${i + 1}`,
      a.person,
      a.start,
      a.days,
      a.type,
      a.status,
      null,
      a.halfDayEnd ?? false,
    );
  });

  // Staff profiles and leave entitlements.
  for (const s of spec.people) {
    const e = s.employment;
    if (!e) continue;
    ds.staffProfiles.push({
      tenantId: tid,
      personId: b.personId.get(s.key) as string,
      position: e.position,
      employmentType: e.type,
      employer: e.employer ?? "parish",
      startDate: addDays(c.today, -Math.round(365.25 * e.startYearsAgo)),
      endDate: null,
      managerPersonId: e.manager ? (b.personId.get(e.manager) ?? null) : null,
      weeklyHours: e.hours,
      workPattern: { weekdays: e.days },
    });
    if (e.type === "munkaviszony" || e.type === "egyhazi_szolgalati") {
      for (const y of [Number(year) - 1, Number(year)]) {
        ds.leaveEntitlements.push({
          tenantId: tid,
          personId: b.personId.get(s.key) as string,
          year: y,
          daysTotal: e.leaveDays ?? 25,
          carriedOver: y === Number(year) ? (e.carriedOver ?? 0) : 0,
          adjustments:
            y === Number(year) && (e.leaveDays ?? 25) > 25
              ? [{ days: (e.leaveDays ?? 25) - 25, reason: "Pótszabadság" }]
              : [],
          note: null,
        });
      }
    }
  }

  buildNotifications(b, refs);
}

function buildNotifications(b: Build, refs: string[]): void {
  const { c, ds, tid, k } = b;
  let n = 0;
  const add = (
    persona: string,
    kind: NotificationKind,
    link: string,
    payload: Record<string, string | number | boolean | null>,
    hoursAgo: number,
    read: boolean,
  ): void => {
    const userId = b.personaUser.get(persona);
    if (!userId) return;
    n++;
    const createdAt = plusMinutesIso(c.nowIso, -hoursAgo * 60);
    ds.notifications.push({
      id: `ntf-${k}-${n}`,
      tenantId: tid,
      userId,
      kind,
      payload,
      link,
      createdAt,
      readAt: read ? plusMinutesIso(createdAt, 45) : null,
    });
  };
  const nextSunday = c.sunday;
  add("onkentes", "assignmentRequest", "/munkater/beosztasom", { date: nextSunday }, 20, false);
  add("onkentes", "assignmentReminder", "/munkater/beosztasom", { date: nextSunday }, 5, false);
  add("onkentes", "planChanged", "/munkater/beosztasom", { date: nextSunday }, 70, true);
  add("zenei", "planReview", "/munkater/enekrend", { date: nextSunday }, 30, false);
  add("zenei", "mention", "/munkater/enekrend", { date: nextSunday }, 52, false);
  add("zenei", "swapRequest", "/munkater/beosztas", { date: nextSunday }, 90, true);
  add("vezeto", "planReview", "/munkater/enekrend", { date: nextSunday }, 26, false);
  add("vezeto", "bookingRequested", "/munkater/foglalasok", { count: 2 }, 40, true);
  add("terem", "bookingRequested", "/munkater/foglalasok", { count: 2 }, 28, false);
  add("terem", "bookingConflict", "/munkater/foglalasok", { count: 1 }, 14, false);
  add("terem", "facilityDailyList", "/munkater/termek", { date: c.today }, 6, true);
  add("hr", "hrTicketUpdate", "/munkater/hr", { reference: refs[0] ?? null }, 10, false);
  add("hr", "hrTicketUpdate", "/munkater/hr", { reference: refs[1] ?? null }, 34, true);
  add("iroda", "eventReminder", "/munkater/naptar", { date: c.today }, 3, false);
  add("tulajdonos", "occurrenceMoved", "/munkater/naptar", { date: nextSunday }, 48, true);

  const prefKinds: NotificationKind[] = [
    "assignmentRequest",
    "assignmentReminder",
    "planReview",
    "bookingRequested",
    "hrTicketUpdate",
  ];
  for (const [, userId] of b.personaUser) {
    for (const kind of prefKinds) {
      ds.notificationPrefs.push({
        userId,
        kind,
        channels: kind === "assignmentReminder" ? ["in_app", "push"] : ["in_app", "email"],
        digest: kind === "bookingRequested",
      });
    }
  }
}
