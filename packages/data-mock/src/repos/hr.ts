/**
 * Mock repositories: hr, absences, notifications.
 *
 * HR context rules mirror the RLS branch of SDD §25.7: a tenant ctx sees its own rows; an org
 * ctx sees tickets of parishes with an `active` org link whose delegation covers the ticket's
 * category key (or `*`), and absences/staff data of actively linked parishes (read-only).
 */
import type {
  Absence,
  AbsenceRepo,
  Ctx,
  HrApproval,
  HrCategory,
  HrRepo,
  HrTicket,
  HrTicketMessage,
  LeaveEntitlement,
  Notification,
  NotificationRepo,
  StaffProfile,
} from "@churchy/contracts";
import {
  AbsenceInputSchema,
  AbsenceStatusSchema,
  HrApprovalInputSchema,
  HrCategoryInputSchema,
  HrTicketInputSchema,
  HrTicketMessageInputSchema,
  HrTicketSchema,
  HrTicketUpdateSchema,
  IsoDateSchema,
  LeaveEntitlementInputSchema,
  LeaveEntitlementSchema,
  NotificationInputSchema,
  NotificationPrefInputSchema,
  StaffProfileInputSchema,
  conflict,
  ctxScope,
  huCollator,
  isAnonymous,
  notFound,
  parseInput,
  requireTenantId,
  validateFormData,
  validationError,
} from "@churchy/contracts";
import type { MockStore } from "../store";
import type { RepoDeps } from "./helpers";
import {
  actorUserId,
  addDaysIso,
  budapestYear,
  instant,
  nextReference,
  own,
  ownRef,
  removeWhere,
  save,
  send,
  staffTenant,
  writeTenant,
} from "./helpers";

/** Tenants whose HR rows the org of `ctx` may see (active link), or the ctx tenant. */
function hrTenants(store: MockStore, ctx: Ctx): { tenantIds: Set<string>; orgId: string | null } {
  const scope = ctxScope(ctx);
  if (isAnonymous(ctx)) return { tenantIds: new Set(), orgId: null };
  if (scope.kind === "tenant") return { tenantIds: new Set([scope.tenantId]), orgId: null };
  if (scope.kind === "org") {
    const linked = store.data.orgLinks
      .filter((l) => l.orgId === scope.orgId && l.status === "active")
      .map((l) => l.tenantId);
    return { tenantIds: new Set(linked), orgId: scope.orgId };
  }
  return { tenantIds: new Set(), orgId: null };
}

/** Tenant ctx (writes) — CONTEXT for org/platform, FORBIDDEN for anonymous. */
const tenantWrite = writeTenant;

// ---------------------------------------------------------------------------------------------
// hr
// ---------------------------------------------------------------------------------------------

export function mockHr({ store }: RepoDeps): HrRepo {
  const d = () => store.data;
  const visibleTicket = (ctx: Ctx, ticket: HrTicket): boolean => {
    const { tenantIds, orgId } = hrTenants(store, ctx);
    if (!tenantIds.has(ticket.tenantId)) return false;
    if (orgId === null) return true;
    return d().orgDelegations.some(
      (x) =>
        x.orgId === orgId &&
        x.tenantId === ticket.tenantId &&
        (x.hrCategoryKey === "*" || x.hrCategoryKey === ticket.categoryKey),
    );
  };
  const ticketFor = (ctx: Ctx, id: string): HrTicket => {
    const ticket = d().hrTickets.find((t) => t.id === id);
    if (!ticket || !visibleTicket(ctx, ticket)) throw notFound("HrTicket", id);
    return ticket;
  };
  /** A ticket the ctx may handle: visible, not handed over, and the actor signed in. */
  const handled = (ctx: Ctx, id: string): HrTicket => {
    ctxScope(ctx);
    actorUserId(ctx);
    const ticket = ticketFor(ctx, id);
    if (ticket.handover !== null) throw conflict("The ticket was handed over and is read-only");
    return ticket;
  };
  const link = (ticket: HrTicket) => `/munkater/hr/${ticket.id}`;
  const notifyRequester = (ticket: HrTicket) => {
    if (ticket.requesterPersonId === null) return;
    const recipient = { kind: "person", personId: ticket.requesterPersonId } as const;
    const params = { reference: ticket.reference, link: link(ticket) };
    send(store, [
      {
        channel: "email",
        template: "hr.ticketUpdated",
        recipient,
        tenantId: ticket.tenantId,
        params,
      },
      {
        channel: "push",
        template: "hr.ticketUpdated",
        recipient,
        tenantId: ticket.tenantId,
        params,
      },
    ]);
  };

  return {
    async listCategories(ctx) {
      const tenantId = staffTenant(ctx);
      return d()
        .hrCategories.filter((c) => c.tenantId === tenantId)
        .sort((a, b) => huCollator.compare(a.name, b.name));
    },
    async upsertCategory(ctx, input) {
      const tenantId = tenantWrite(ctx);
      const { id, ...data } = parseInput(HrCategoryInputSchema, input);
      const existing =
        id === undefined ? undefined : own(d().hrCategories, tenantId, id, "HrCategory");
      for (const personId of data.handlerPersonIds) own(d().people, tenantId, personId, "Person");
      if (
        d().hrCategories.some((c) => c.tenantId === tenantId && c.key === data.key && c.id !== id)
      ) {
        throw conflict("Category key already used", { field: "key" });
      }
      const row: HrCategory = { ...data, id: existing?.id ?? store.nextId("hrcat"), tenantId };
      return save(d().hrCategories, row);
    },
    async listTickets(ctx, filter = {}) {
      return d()
        .hrTickets.filter((t) => visibleTicket(ctx, t))
        .filter(
          (t) =>
            (filter.status === undefined || t.status === filter.status) &&
            (filter.categoryId === undefined || t.categoryId === filter.categoryId) &&
            (filter.requesterPersonId === undefined ||
              t.requesterPersonId === filter.requesterPersonId) &&
            (filter.tenantIds === undefined || filter.tenantIds.includes(t.tenantId)),
        )
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    },
    async getTicket(ctx, id) {
      const ticket = d().hrTickets.find((t) => t.id === id);
      return ticket && visibleTicket(ctx, ticket) ? ticket : null;
    },
    async createTicket(ctx, input) {
      const tenantId = tenantWrite(ctx);
      const data = parseInput(HrTicketInputSchema, input);
      const category = d().hrCategories.find(
        (c) => c.id === data.categoryId && c.tenantId === tenantId && c.active,
      );
      if (!category) throw notFound("HrCategory", data.categoryId);
      if (data.anonymous && !category.allowAnonymous) {
        throw validationError([
          { path: ["anonymous"], message: "This category does not allow anonymous tickets" },
        ]);
      }
      ownRef(d().people, tenantId, data.requesterPersonId, "Person");
      const issues = validateFormData(category.fields, data.data);
      if (issues.length > 0)
        throw validationError(issues.map((i) => ({ ...i, path: ["data", ...i.path] })));
      const stamp = store.nowIso();
      const ticket: HrTicket = {
        id: store.nextId("hr"),
        tenantId,
        reference: nextReference(
          "HR",
          budapestYear(stamp),
          d()
            .hrTickets.filter((t) => t.tenantId === tenantId)
            .map((t) => t.reference),
        ),
        categoryId: category.id,
        categoryKey: category.key,
        requesterPersonId: data.requesterPersonId,
        anonymous: data.anonymous,
        subject: data.subject,
        data: data.data,
        status: "uj",
        currentStep: 0,
        assigneePersonId: null,
        dueAt:
          category.slaHours === null
            ? null
            : new Date(Date.parse(stamp) + category.slaHours * 3_600_000).toISOString(),
        confidential: category.confidential,
        handover: null,
        closedAt: null,
        purgeAfter: null,
        createdAt: stamp,
        updatedAt: stamp,
      };
      d().hrTickets.push(ticket);
      const params = { reference: ticket.reference, link: link(ticket) };
      send(
        store,
        category.handlerPersonIds.length > 0
          ? category.handlerPersonIds.map((personId) => ({
              channel: "email" as const,
              template: "hr.ticketCreated" as const,
              recipient: { kind: "person" as const, personId },
              tenantId,
              params,
            }))
          : {
              channel: "email",
              template: "hr.ticketCreated",
              recipient: { kind: "persona", persona: "hrHandlers" },
              tenantId,
              params,
            },
      );
      if (ticket.requesterPersonId !== null) {
        send(store, {
          channel: "email",
          template: "hr.ticketReceived",
          recipient: { kind: "person", personId: ticket.requesterPersonId },
          tenantId,
          params,
        });
      }
      return ticket;
    },
    async updateTicket(ctx, id, patch) {
      const ticket = handled(ctx, id);
      const data = parseInput(HrTicketUpdateSchema, patch);
      ownRef(d().people, ticket.tenantId, data.assigneePersonId, "Person");
      const defined = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      let next: HrTicket = { ...ticket, ...defined, updatedAt: store.nowIso() };
      if (next.status === "lezart" && ticket.status !== "lezart") {
        const category = d().hrCategories.find((c) => c.id === ticket.categoryId);
        next = {
          ...next,
          closedAt: next.updatedAt,
          purgeAfter: addDaysIso(next.updatedAt, category?.retentionDays ?? 3 * 365),
        };
      } else if (next.status !== "lezart") {
        next = { ...next, closedAt: null, purgeAfter: null };
      }
      save(d().hrTickets, next);
      if (next.status !== ticket.status) notifyRequester(next);
      return next;
    },
    async handOver(ctx, id, handover) {
      const ticket = handled(ctx, id);
      const data = parseInput(HrTicketSchema.shape.handover.unwrap(), handover);
      return save(d().hrTickets, { ...ticket, handover: data, updatedAt: store.nowIso() });
    },
    async listMessages(ctx, ticketId, options = {}) {
      const ticket = d().hrTickets.find((t) => t.id === ticketId);
      if (!ticket || !visibleTicket(ctx, ticket)) return [];
      return d()
        .hrTicketMessages.filter(
          (m) => m.ticketId === ticketId && (options.includeInternal || !m.internal),
        )
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    },
    async addMessage(ctx, ticketId, input) {
      const ticket = handled(ctx, ticketId);
      const data = parseInput(HrTicketMessageInputSchema, input);
      for (const mediaId of data.attachmentMediaIds)
        own(d().media, ticket.tenantId, mediaId, "Media");
      const message: HrTicketMessage = {
        ...data,
        id: store.nextId("hrmsg"),
        tenantId: ticket.tenantId,
        ticketId: ticket.id,
        authorPersonId: ctx.actor.personId,
        createdAt: store.nowIso(),
      };
      d().hrTicketMessages.push(message);
      if (!message.internal && message.authorPersonId !== ticket.requesterPersonId)
        notifyRequester(ticket);
      return message;
    },
    async listApprovals(ctx, ticketId) {
      const ticket = d().hrTickets.find((t) => t.id === ticketId);
      if (!ticket || !visibleTicket(ctx, ticket)) return [];
      return d()
        .hrApprovals.filter((a) => a.ticketId === ticketId)
        .sort((a, b) => a.step - b.step || Date.parse(a.decidedAt) - Date.parse(b.decidedAt));
    },
    async recordApproval(ctx, ticketId, input) {
      const ticket = handled(ctx, ticketId);
      const data = parseInput(HrApprovalInputSchema, input);
      if (ctx.tenantId !== undefined)
        own(d().people, ticket.tenantId, data.approverPersonId, "Person");
      const approval: HrApproval = {
        ...data,
        id: store.nextId("hrappr"),
        tenantId: ticket.tenantId,
        ticketId: ticket.id,
        decidedAt: store.nowIso(),
      };
      d().hrApprovals.push(approval);
      return approval;
    },
    async purgeExpired(ctx, now) {
      const tenantId = tenantWrite(ctx);
      const limit = instant(now);
      const expired = new Set(
        d()
          .hrTickets.filter(
            (t) =>
              t.tenantId === tenantId &&
              t.status === "lezart" &&
              t.purgeAfter !== null &&
              Date.parse(t.purgeAfter) < limit,
          )
          .map((t) => t.id),
      );
      removeWhere(d().hrTicketMessages, (m) => expired.has(m.ticketId));
      removeWhere(d().hrApprovals, (a) => expired.has(a.ticketId));
      return removeWhere(d().hrTickets, (t) => expired.has(t.id));
    },
  };
}

// ---------------------------------------------------------------------------------------------
// absences
// ---------------------------------------------------------------------------------------------

export function mockAbsences({ store }: RepoDeps): AbsenceRepo {
  const d = () => store.data;
  const visible = <T extends { tenantId: string }>(ctx: Ctx, rows: T[]): T[] => {
    const { tenantIds } = hrTenants(store, ctx);
    return rows.filter((r) => tenantIds.has(r.tenantId));
  };

  return {
    async list(ctx, query) {
      const from = parseInput(IsoDateSchema, query.from);
      const to = parseInput(IsoDateSchema, query.to);
      return visible(ctx, d().absences)
        .filter(
          (a) =>
            a.startDate <= to &&
            a.endDate >= from &&
            (query.personIds === undefined || query.personIds.includes(a.personId)) &&
            (query.statuses === undefined || query.statuses.includes(a.status)),
        )
        .sort((a, b) => a.startDate.localeCompare(b.startDate));
    },
    async get(ctx, id) {
      return visible(ctx, d().absences).find((a) => a.id === id) ?? null;
    },
    async create(ctx, input) {
      const tenantId = tenantWrite(ctx);
      const data = parseInput(AbsenceInputSchema, input);
      own(d().people, tenantId, data.personId, "Person");
      ownRef(d().hrTickets, tenantId, data.ticketId, "HrTicket");
      const row: Absence = {
        ...data,
        id: store.nextId("abs"),
        tenantId,
        createdAt: store.nowIso(),
      };
      d().absences.push(row);
      return row;
    },
    async setStatus(ctx, id, status) {
      const row = own(d().absences, tenantWrite(ctx), id, "Absence");
      return save(d().absences, { ...row, status: parseInput(AbsenceStatusSchema, status) });
    },
    async getStaffProfile(ctx, personId) {
      return visible(ctx, d().staffProfiles).find((p) => p.personId === personId) ?? null;
    },
    async listStaffProfiles(ctx) {
      return visible(ctx, d().staffProfiles);
    },
    async upsertStaffProfile(ctx, input) {
      const tenantId = tenantWrite(ctx);
      const data = parseInput(StaffProfileInputSchema, input);
      own(d().people, tenantId, data.personId, "Person");
      ownRef(d().people, tenantId, data.managerPersonId, "Person");
      const row: StaffProfile = { ...data, tenantId };
      d().staffProfiles = d().staffProfiles.filter(
        (p) => !(p.tenantId === tenantId && p.personId === data.personId),
      );
      d().staffProfiles.push(row);
      return row;
    },
    async getEntitlement(ctx, personId, year) {
      parseInput(LeaveEntitlementSchema.shape.year, year);
      return (
        visible(ctx, d().leaveEntitlements).find(
          (e) => e.personId === personId && e.year === year,
        ) ?? null
      );
    },
    async upsertEntitlement(ctx, input) {
      const tenantId = tenantWrite(ctx);
      const data = parseInput(LeaveEntitlementInputSchema, input);
      own(d().people, tenantId, data.personId, "Person");
      const row: LeaveEntitlement = { ...data, tenantId };
      d().leaveEntitlements = d().leaveEntitlements.filter(
        (e) => !(e.tenantId === tenantId && e.personId === data.personId && e.year === data.year),
      );
      d().leaveEntitlements.push(row);
      return row;
    },
    async listWorkdayCalendar(ctx, year) {
      ctxScope(ctx);
      parseInput(LeaveEntitlementSchema.shape.year, year);
      return d()
        .workdayCalendar.filter((e) => e.date.startsWith(`${year}-`))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
  };
}

// ---------------------------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------------------------

export function mockNotifications({ store }: RepoDeps): NotificationRepo {
  const d = () => store.data;
  const mine = (ctx: Ctx): Notification[] => {
    const tenantId = staffTenant(ctx);
    return d().notifications.filter(
      (n) => n.tenantId === tenantId && n.userId === ctx.actor.userId,
    );
  };

  return {
    async list(ctx, options = {}) {
      const rows = mine(ctx)
        .filter((n) => !options.unreadOnly || n.readAt === null)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      return options.limit === undefined ? rows : rows.slice(0, Math.max(0, options.limit));
    },
    async unreadCount(ctx) {
      return mine(ctx).filter((n) => n.readAt === null).length;
    },
    async create(ctx, input) {
      const tenantId = writeTenant(ctx);
      const data = parseInput(NotificationInputSchema, input);
      if (!d().users.some((u) => u.id === data.userId)) throw notFound("User", data.userId);
      const row: Notification = {
        ...data,
        id: store.nextId("notif"),
        tenantId,
        createdAt: store.nowIso(),
        readAt: null,
      };
      d().notifications.push(row);
      return row;
    },
    async markRead(ctx, id) {
      writeTenant(ctx);
      const row = mine(ctx).find((n) => n.id === id);
      if (!row) throw notFound("Notification", id);
      if (row.readAt === null) save(d().notifications, { ...row, readAt: store.nowIso() });
    },
    async markAllRead(ctx) {
      writeTenant(ctx);
      const unread = mine(ctx).filter((n) => n.readAt === null);
      const stamp = store.nowIso();
      for (const n of unread) save(d().notifications, { ...n, readAt: stamp });
      return unread.length;
    },
    async getPrefs(ctx) {
      ctxScope(ctx);
      if (isAnonymous(ctx)) return [];
      return d().notificationPrefs.filter((p) => p.userId === ctx.actor.userId);
    },
    async setPref(ctx, input) {
      requireTenantId(ctx);
      const userId = actorUserId(ctx);
      const data = parseInput(NotificationPrefInputSchema, input);
      const row = { ...data, userId };
      d().notificationPrefs = d().notificationPrefs.filter(
        (p) => !(p.userId === userId && p.kind === data.kind),
      );
      d().notificationPrefs.push(row);
      return row;
    },
  };
}
