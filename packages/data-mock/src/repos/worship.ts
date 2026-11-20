/** Mock repositories: songs, attachments, servicePlans, assignments. */
import type {
  Arrangement,
  Assignment,
  AssignmentRepo,
  Attachment,
  AttachmentOwnerType,
  AttachmentRepo,
  Ctx,
  Hymnal,
  PlanComment,
  PlanItem,
  PlanTemplate,
  ServicePlan,
  ServicePlanInput,
  ServicePlanRepo,
  Song,
  SongRepo,
} from "@churchy/contracts";
import {
  ArrangementInputSchema,
  AssignmentInputSchema,
  AssignmentSchema,
  AttachmentInputSchema,
  ContractError,
  HymnalInputSchema,
  PlanCommentInputSchema,
  PlanItemInputSchema,
  PlanStatusSchema,
  PlanTemplateInputSchema,
  ServicePlanInputSchema,
  SongInputSchema,
  conflict,
  foldForSearch,
  huCollator,
  notFound,
  parseInput,
  validationError,
} from "@churchy/contracts";
import type { OutboxDraft } from "../outbox";
import type { RepoDeps } from "./helpers";
import { own, ownRef, removeWhere, save, send, staffTenant, writeTenant } from "./helpers";

/** The ctx actor's person (authors of comments, approvers); FORBIDDEN without one. */
function actorPerson(ctx: Ctx): string {
  if (ctx.actor.personId === null) {
    throw new ContractError("FORBIDDEN", "The actor has no person record in this tenant");
  }
  return ctx.actor.personId;
}

// ---------------------------------------------------------------------------------------------
// songs
// ---------------------------------------------------------------------------------------------

const HYMNAL_REF_QUERY = /^(.+?)\s+(\d{1,4}[a-zA-Z]?)$/;

export function mockSongs({ store }: RepoDeps): SongRepo {
  const d = () => store.data;
  const hymnalsOf = (tenantId: string | null): Hymnal[] =>
    tenantId === null
      ? []
      : d().hymnals.filter((h) => h.tenantId === null || h.tenantId === tenantId);

  return {
    async listHymnals(ctx) {
      return hymnalsOf(staffTenant(ctx)).sort((a, b) =>
        huCollator.compare(a.abbreviation, b.abbreviation),
      );
    },
    async upsertHymnal(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(HymnalInputSchema, input);
      // Platform rows (tenantId null) are read-only: `own` reports them as NOT_FOUND.
      const existing = id === undefined ? undefined : own(d().hymnals, tenantId, id, "Hymnal");
      const row: Hymnal = { ...data, id: existing?.id ?? store.nextId("hymnal"), tenantId };
      return save(d().hymnals, row);
    },
    async search(ctx, query = {}) {
      const tenantId = staffTenant(ctx);
      const text = query.query?.trim() ?? "";
      const needle = foldForSearch(text);
      const refMatch = HYMNAL_REF_QUERY.exec(text);
      const refHymnals = refMatch
        ? hymnalsOf(tenantId).filter(
            (h) => foldForSearch(h.abbreviation) === foldForSearch(refMatch[1]!),
          )
        : [];
      const matches = (s: Song) =>
        needle === "" ||
        [s.title, ...s.altTitles, s.firstLine ?? ""].some((t) =>
          foldForSearch(t).includes(needle),
        ) ||
        s.hymnalRefs.some(
          (r) =>
            refHymnals.some((h) => h.id === r.hymnalId) &&
            r.number.toLowerCase() === refMatch![2]!.toLowerCase(),
        );
      return d()
        .songs.filter((s) => s.tenantId === tenantId)
        .filter(matches)
        .filter((s) => query.theme === undefined || s.themes.includes(query.theme))
        .filter((s) => query.season === undefined || s.seasons.includes(query.season))
        .sort((a, b) => huCollator.compare(a.title, b.title));
    },
    async get(ctx, id) {
      const tenantId = staffTenant(ctx);
      return d().songs.find((s) => s.tenantId === tenantId && s.id === id) ?? null;
    },
    async upsert(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(SongInputSchema, input);
      const existing = id === undefined ? undefined : own(d().songs, tenantId, id, "Song");
      const visible = hymnalsOf(tenantId);
      for (const ref of data.hymnalRefs) {
        if (!visible.some((h) => h.id === ref.hymnalId)) throw notFound("Hymnal", ref.hymnalId);
      }
      const stamp = store.nowIso();
      const row: Song = {
        ...data,
        id: existing?.id ?? store.nextId("song"),
        tenantId,
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
      };
      return save(d().songs, row);
    },
    async delete(ctx, id) {
      const row = own(d().songs, writeTenant(ctx), id, "Song");
      removeWhere(d().arrangements, (a) => a.songId === row.id);
      removeWhere(d().songs, (s) => s.id === row.id);
    },
    async listArrangements(ctx, songId) {
      const tenantId = staffTenant(ctx);
      return d()
        .arrangements.filter((a) => a.tenantId === tenantId && a.songId === songId)
        .sort((a, b) => huCollator.compare(a.name, b.name));
    },
    async upsertArrangement(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(ArrangementInputSchema, input);
      const existing =
        id === undefined ? undefined : own(d().arrangements, tenantId, id, "Arrangement");
      own(d().songs, tenantId, data.songId, "Song");
      const row: Arrangement = { ...data, id: existing?.id ?? store.nextId("arr"), tenantId };
      return save(d().arrangements, row);
    },
    async deleteArrangement(ctx, id) {
      const row = own(d().arrangements, writeTenant(ctx), id, "Arrangement");
      removeWhere(d().arrangements, (a) => a.id === row.id);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// attachments
// ---------------------------------------------------------------------------------------------

export function mockAttachments({ store }: RepoDeps): AttachmentRepo {
  const d = () => store.data;
  const assertOwner = (tenantId: string, ownerType: AttachmentOwnerType, ownerId: string) => {
    const rows: readonly { id: string; tenantId: string }[] = {
      song: d().songs,
      arrangement: d().arrangements,
      plan: d().servicePlans,
      plan_item: d().planItems,
    }[ownerType];
    own(rows, tenantId, ownerId, ownerType);
  };

  return {
    async listByOwner(ctx, owner, options = {}) {
      const tenantId = staffTenant(ctx);
      const rows = d().attachments.filter(
        (a) =>
          a.tenantId === tenantId &&
          a.ownerType === owner.ownerType &&
          a.ownerId === owner.ownerId &&
          (options.includeDisabled || !a.disabled),
      );
      const latest = options.history
        ? rows
        : rows.filter((a) => !rows.some((b) => b.label === a.label && b.version > a.version));
      return latest.sort((a, b) => huCollator.compare(a.label, b.label) || b.version - a.version);
    },
    async get(ctx, id) {
      const tenantId = staffTenant(ctx);
      return d().attachments.find((a) => a.tenantId === tenantId && a.id === id) ?? null;
    },
    async create(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { rightsConfirmed: _confirmed, ...data } = parseInput(AttachmentInputSchema, input);
      assertOwner(tenantId, data.ownerType, data.ownerId);
      ownRef(d().media, tenantId, data.mediaId, "Media");
      own(d().people, tenantId, data.rightsConfirmedBy, "Person");
      const previous = d()
        .attachments.filter(
          (a) =>
            a.tenantId === tenantId &&
            a.ownerType === data.ownerType &&
            a.ownerId === data.ownerId &&
            a.label === data.label,
        )
        .sort((a, b) => b.version - a.version)[0];
      const row: Attachment = {
        ...data,
        id: store.nextId("att"),
        tenantId,
        version: (previous?.version ?? 0) + 1,
        supersedesId: previous?.id ?? null,
        disabled: false,
        createdAt: store.nowIso(),
      };
      d().attachments.push(row);
      return row;
    },
    async disableByHash(ctx, contentHash) {
      const tenantId = writeTenant(ctx);
      let count = 0;
      for (const [i, a] of d().attachments.entries()) {
        if (a.tenantId === tenantId && a.contentHash === contentHash) {
          d().attachments[i] = { ...a, disabled: true };
          count += 1;
        }
      }
      return count;
    },
    async delete(ctx, id) {
      const row = own(d().attachments, writeTenant(ctx), id, "Attachment");
      removeWhere(d().attachments, (a) => a.id === row.id);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// servicePlans
// ---------------------------------------------------------------------------------------------

export function mockServicePlans({ store }: RepoDeps): ServicePlanRepo {
  const d = () => store.data;
  const itemsOf = (planId: string) =>
    d()
      .planItems.filter((i) => i.planId === planId)
      .sort((a, b) => a.position - b.position);
  const editable = (ctx: Ctx, id: string) => {
    const tenantId = writeTenant(ctx);
    const plan = own(d().servicePlans, tenantId, id, "ServicePlan");
    if (plan.status === "locked") throw conflict("The plan is locked");
    return { tenantId, plan };
  };
  const visibleTemplate = (tenantId: string, id: string): PlanTemplate => {
    const template = d().planTemplates.find(
      (t) => t.id === id && (t.tenantId === null || t.tenantId === tenantId),
    );
    if (!template) throw notFound("PlanTemplate", id);
    return template;
  };
  const checkPlanRefs = (
    tenantId: string,
    data: {
      occurrenceId: string | null;
      eventId: string | null;
      leaderPersonId: string;
      templateId: string | null;
    },
  ) => {
    ownRef(d().serviceOccurrences, tenantId, data.occurrenceId, "ServiceOccurrence");
    ownRef(d().events, tenantId, data.eventId, "Event");
    own(d().people, tenantId, data.leaderPersonId, "Person");
    if (data.templateId !== null) visibleTemplate(tenantId, data.templateId);
  };
  const writeItems = (tenantId: string, plan: ServicePlan, inputs: unknown): PlanItem[] => {
    const parsed = parseInput(PlanItemInputSchema.array(), inputs);
    const items = parsed.map((item, position): PlanItem => {
      ownRef(d().songs, tenantId, item.songId, "Song");
      ownRef(d().arrangements, tenantId, item.arrangementId, "Arrangement");
      ownRef(d().people, tenantId, item.responsiblePersonId, "Person");
      const keepId =
        item.id !== undefined &&
        d().planItems.some((x) => x.id === item.id && x.planId === plan.id);
      return {
        ...item,
        id: keepId ? item.id! : store.nextId("item"),
        tenantId,
        planId: plan.id,
        position,
      };
    });
    removeWhere(d().planItems, (i) => i.planId === plan.id);
    d().planItems.push(...items);
    save(d().servicePlans, { ...plan, updatedAt: store.nowIso() });
    return items;
  };
  const createPlan = (ctx: Ctx, input: ServicePlanInput): ServicePlan => {
    const tenantId = writeTenant(ctx);
    const { id, ...data } = parseInput(ServicePlanInputSchema, input);
    checkPlanRefs(tenantId, data);
    if (id !== undefined) {
      const { plan } = editable(ctx, id);
      return save(d().servicePlans, { ...plan, ...data, updatedAt: store.nowIso() });
    }
    const plan: ServicePlan = {
      ...data,
      id: store.nextId("plan"),
      tenantId,
      status: "draft",
      approvedByPersonId: null,
      approvedAt: null,
      approvedSnapshot: null,
      lockedAt: null,
      updatedAt: store.nowIso(),
    };
    d().servicePlans.push(plan);
    return plan;
  };

  return {
    async list(ctx, filter = {}) {
      const tenantId = staffTenant(ctx);
      return d()
        .servicePlans.filter(
          (p) =>
            p.tenantId === tenantId &&
            (filter.status === undefined || p.status === filter.status) &&
            (filter.occurrenceIds === undefined ||
              (p.occurrenceId !== null && filter.occurrenceIds.includes(p.occurrenceId))) &&
            (filter.eventIds === undefined ||
              (p.eventId !== null && filter.eventIds.includes(p.eventId))),
        )
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    },
    async get(ctx, id) {
      const tenantId = staffTenant(ctx);
      const plan = d().servicePlans.find((p) => p.tenantId === tenantId && p.id === id);
      return plan ? { plan, items: itemsOf(plan.id) } : null;
    },
    async upsert(ctx, input) {
      return createPlan(ctx, input);
    },
    async createFromTemplate(ctx, templateId, input) {
      const tenantId = writeTenant(ctx);
      const template = visibleTemplate(tenantId, templateId);
      const { id: _id, ...rest } = input as ServicePlanInput;
      const plan = createPlan(ctx, { ...rest, templateId: template.id });
      const items = writeItems(tenantId, plan, template.items);
      return { plan: own(d().servicePlans, tenantId, plan.id, "ServicePlan"), items };
    },
    async setItems(ctx, planId, items) {
      const { tenantId, plan } = editable(ctx, planId);
      return writeItems(tenantId, plan, items);
    },
    async setStatus(ctx, id, status) {
      const { plan } = editable(ctx, id);
      const next = parseInput(PlanStatusSchema, status);
      const stamp = store.nowIso();
      let updated: ServicePlan = { ...plan, status: next, updatedAt: stamp };
      if (next === "approved") {
        updated = {
          ...updated,
          approvedByPersonId: actorPerson(ctx),
          approvedAt: stamp,
          approvedSnapshot: itemsOf(plan.id),
        };
      }
      if (next === "locked") updated = { ...updated, lockedAt: stamp };
      save(d().servicePlans, updated);
      const params = { planId: plan.id, link: `/munkater/szolgalatok/${plan.id}` };
      if (next === "in_review" && plan.status !== "in_review") {
        send(store, [
          {
            channel: "email",
            template: "plan.reviewRequested",
            recipient: { kind: "persona", persona: "planApprovers" },
            tenantId: plan.tenantId,
            params,
          },
          {
            channel: "push",
            template: "plan.reviewRequested",
            recipient: { kind: "persona", persona: "planApprovers" },
            tenantId: plan.tenantId,
            params,
          },
        ]);
      }
      if (next === "approved" && plan.status !== "approved") {
        send(store, {
          channel: "push",
          template: "plan.approved",
          recipient: { kind: "person", personId: plan.leaderPersonId },
          tenantId: plan.tenantId,
          params,
        });
      }
      return updated;
    },
    async delete(ctx, id) {
      const { plan } = editable(ctx, id);
      removeWhere(d().planItems, (i) => i.planId === plan.id);
      removeWhere(d().planComments, (c) => c.planId === plan.id);
      removeWhere(d().servicePlans, (p) => p.id === plan.id);
    },
    async listTemplates(ctx, serviceType) {
      const tenantId = staffTenant(ctx);
      if (tenantId === null) return [];
      return d()
        .planTemplates.filter(
          (t) =>
            (t.tenantId === null || t.tenantId === tenantId) &&
            (serviceType === undefined || t.serviceType === serviceType),
        )
        .sort((a, b) => huCollator.compare(a.name, b.name));
    },
    async upsertTemplate(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(PlanTemplateInputSchema, input);
      const existing =
        id === undefined ? undefined : own(d().planTemplates, tenantId, id, "PlanTemplate");
      const row: PlanTemplate = { ...data, id: existing?.id ?? store.nextId("tpl"), tenantId };
      return save(d().planTemplates, row);
    },
    async listComments(ctx, planId) {
      const tenantId = staffTenant(ctx);
      return d()
        .planComments.filter((c) => c.tenantId === tenantId && c.planId === planId)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    },
    async addComment(ctx, input) {
      const tenantId = writeTenant(ctx);
      const data = parseInput(PlanCommentInputSchema, input);
      const plan = own(d().servicePlans, tenantId, data.planId, "ServicePlan");
      if (
        data.itemId !== null &&
        !d().planItems.some((i) => i.id === data.itemId && i.planId === plan.id)
      ) {
        throw notFound("PlanItem", data.itemId);
      }
      for (const personId of data.mentions) own(d().people, tenantId, personId, "Person");
      const comment: PlanComment = {
        ...data,
        id: store.nextId("comment"),
        tenantId,
        authorPersonId: actorPerson(ctx),
        resolvedAt: null,
        createdAt: store.nowIso(),
      };
      d().planComments.push(comment);
      send(
        store,
        [...new Set(data.mentions)].map((personId) => ({
          channel: "push",
          template: "plan.mention",
          recipient: { kind: "person", personId },
          tenantId,
          params: { planId: plan.id, link: `/munkater/szolgalatok/${plan.id}` },
        })),
      );
      return comment;
    },
    async setCommentResolved(ctx, id, resolved) {
      const row = own(d().planComments, writeTenant(ctx), id, "PlanComment");
      return save(d().planComments, { ...row, resolvedAt: resolved ? store.nowIso() : null });
    },
  };
}

// ---------------------------------------------------------------------------------------------
// assignments
// ---------------------------------------------------------------------------------------------

const DeclineReasonSchema = AssignmentSchema.shape.declineReason;

export function mockAssignments({ store }: RepoDeps): AssignmentRepo {
  const d = () => store.data;
  const notify = (
    a: Assignment,
    template: OutboxDraft["template"],
    recipient: OutboxDraft["recipient"],
  ) => {
    const params = { assignmentId: a.id, startsAt: a.startsAt, link: `/munkater/beosztas/${a.id}` };
    send(store, [
      { channel: "email", template, recipient, tenantId: a.tenantId, params },
      { channel: "push", template, recipient, tenantId: a.tenantId, params },
    ]);
  };

  return {
    async list(ctx, filter) {
      const tenantId = staffTenant(ctx);
      const from = filter.from === undefined ? -Infinity : Date.parse(filter.from);
      const to = filter.to === undefined ? Infinity : Date.parse(filter.to);
      return d()
        .assignments.filter(
          (a) =>
            a.tenantId === tenantId &&
            (filter.personId === undefined || a.personId === filter.personId) &&
            (filter.teamId === undefined || a.teamId === filter.teamId) &&
            (filter.occurrenceId === undefined || a.occurrenceId === filter.occurrenceId) &&
            (filter.eventId === undefined || a.eventId === filter.eventId) &&
            (filter.statuses === undefined || filter.statuses.includes(a.status)) &&
            Date.parse(a.startsAt) <= to &&
            Date.parse(a.endsAt) >= from,
        )
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    },
    async get(ctx, id) {
      const tenantId = staffTenant(ctx);
      return d().assignments.find((a) => a.tenantId === tenantId && a.id === id) ?? null;
    },
    async create(ctx, inputs) {
      const tenantId = writeTenant(ctx);
      const parsed = parseInput(AssignmentInputSchema.array(), inputs);
      // Validate every input before writing any (all-or-nothing).
      parsed.forEach((input, index) => {
        own(d().teams, tenantId, input.teamId, "Team");
        const position = own(d().teamPositions, tenantId, input.positionId, "TeamPosition");
        if (position.teamId !== input.teamId) {
          throw validationError([
            { path: [index, "positionId"], message: "Position does not belong to the team" },
          ]);
        }
        own(d().people, tenantId, input.personId, "Person");
        ownRef(d().serviceOccurrences, tenantId, input.occurrenceId, "ServiceOccurrence");
        ownRef(d().events, tenantId, input.eventId, "Event");
        ownRef(d().servicePlans, tenantId, input.planId, "ServicePlan");
        ownRef(d().people, tenantId, input.requestedByPersonId, "Person");
      });
      const created = parsed.map((input): Assignment => ({
        ...input,
        id: store.nextId("asg"),
        tenantId,
        status: "requested",
        requestedByPersonId: input.requestedByPersonId ?? ctx.actor.personId,
        respondedAt: null,
        declineReason: null,
        swapWithPersonId: null,
        createdAt: store.nowIso(),
      }));
      d().assignments.push(...created);
      for (const a of created)
        notify(a, "assignment.requested", { kind: "person", personId: a.personId });
      return created;
    },
    async respond(ctx, id, response) {
      const row = own(d().assignments, writeTenant(ctx), id, "Assignment");
      const accept: unknown = response.accept;
      if (typeof accept !== "boolean") {
        throw validationError([{ path: ["accept"], message: "Expected a boolean" }]);
      }
      const declineReason =
        parseInput(DeclineReasonSchema.optional(), response.declineReason) ?? null;
      if (row.status !== "requested") throw conflict("The assignment was already answered");
      return save(d().assignments, {
        ...row,
        status: accept ? "accepted" : "declined",
        declineReason: accept ? null : declineReason,
        respondedAt: store.nowIso(),
      });
    },
    async requestSwap(ctx, id, swapWithPersonId = null) {
      const tenantId = writeTenant(ctx);
      const row = own(d().assignments, tenantId, id, "Assignment");
      ownRef(d().people, tenantId, swapWithPersonId, "Person");
      if (row.status !== "accepted" && row.status !== "requested") {
        throw conflict("Only requested or accepted assignments can be swapped");
      }
      const updated = save(d().assignments, {
        ...row,
        status: "swap_requested",
        swapWithPersonId: swapWithPersonId ?? null,
      });
      notify(
        updated,
        "assignment.swapRequested",
        swapWithPersonId
          ? { kind: "person", personId: swapWithPersonId }
          : { kind: "persona", persona: "team" },
      );
      return updated;
    },
    async acceptSwap(ctx, id, personId) {
      const tenantId = writeTenant(ctx);
      const row = own(d().assignments, tenantId, id, "Assignment");
      own(d().people, tenantId, personId, "Person");
      if (row.status !== "swap_requested") throw conflict("The swap is no longer open");
      save(d().assignments, { ...row, status: "cancelled" });
      const stamp = store.nowIso();
      const taken: Assignment = {
        ...row,
        id: store.nextId("asg"),
        personId,
        status: "accepted",
        respondedAt: stamp,
        declineReason: null,
        swapWithPersonId: null,
        createdAt: stamp,
      };
      d().assignments.push(taken);
      notify(taken, "assignment.swapAccepted", { kind: "person", personId: row.personId });
      return taken;
    },
    async cancel(ctx, id) {
      const row = own(d().assignments, writeTenant(ctx), id, "Assignment");
      return save(d().assignments, { ...row, status: "cancelled" });
    },
  };
}
