/** Mock repositories: people, teams, requests. */
import type {
  AvailabilityBlock,
  FormDefinition,
  PastoralRequest,
  Person,
  PersonRepo,
  PublicPerson,
  RequestRepo,
  StaffGroup,
  Team,
  TeamMember,
  TeamPosition,
  TeamRepo,
} from "@churchy/contracts";
import {
  AvailabilityBlockInputSchema,
  FormDefinitionInputSchema,
  IsoDateTimeSchema,
  PastoralRequestSchema,
  PersonInputSchema,
  RequestStatusSchema,
  RequestSubmissionSchema,
  TeamInputSchema,
  TeamMemberInputSchema,
  TeamPositionInputSchema,
  conflict,
  foldForSearch,
  huCollator,
  isAnonymous,
  notFound,
  parseInput,
  requireTenantId,
  validateFormData,
  validationError,
} from "@churchy/contracts";
import type { RepoDeps } from "./helpers";
import {
  actorUserId,
  addDaysIso,
  budapestYear,
  instant,
  nextReference,
  own,
  ownRef,
  readTenant,
  removeWhere,
  save,
  send,
  staffTenant,
  writeTenant,
} from "./helpers";

const byName = (a: Person, b: Person) =>
  huCollator.compare(a.familyName, b.familyName) || huCollator.compare(a.givenName, b.givenName);

const STAFF_GROUP_ORDER: Record<StaffGroup, number> = {
  clergy: 0,
  staff: 1,
  council: 2,
  volunteer: 3,
};

// ---------------------------------------------------------------------------------------------
// people
// ---------------------------------------------------------------------------------------------

export function mockPeople({ store }: RepoDeps): PersonRepo {
  const d = () => store.data;
  const toPublic = (p: Person): PublicPerson => ({
    id: p.id,
    prefix: p.prefix,
    familyName: p.familyName,
    givenName: p.givenName,
    suffix: p.suffix,
    roleTitle: p.roleTitle,
    staffGroup: p.staffGroup,
    bio: p.bio,
    email: p.contactVisibility.email === "public" ? p.email : null,
    phone: p.contactVisibility.phone === "public" ? p.phone : null,
    photoMediaId: p.photoMediaId,
    sort: p.sort,
  });

  return {
    async listPublicStaff(ctx) {
      const tenantId = readTenant(ctx);
      return d()
        .people.filter((p) => p.tenantId === tenantId && p.active && p.isPublic)
        .sort(
          (a, b) =>
            STAFF_GROUP_ORDER[a.staffGroup] - STAFF_GROUP_ORDER[b.staffGroup] ||
            a.sort - b.sort ||
            byName(a, b),
        )
        .map(toPublic);
    },
    async list(ctx, query = {}) {
      const tenantId = staffTenant(ctx);
      const needle = query.query === undefined ? "" : foldForSearch(query.query.trim());
      return d()
        .people.filter((p) => p.tenantId === tenantId)
        .filter(
          (p) =>
            needle === "" ||
            foldForSearch(`${p.familyName} ${p.givenName}`).includes(needle) ||
            foldForSearch(`${p.givenName} ${p.familyName}`).includes(needle),
        )
        .filter((p) => query.skill === undefined || p.skills.includes(query.skill))
        .filter((p) => query.staffGroup === undefined || p.staffGroup === query.staffGroup)
        .filter((p) => query.active === undefined || p.active === query.active)
        .filter((p) => query.ids === undefined || query.ids.includes(p.id))
        .sort(byName);
    },
    async get(ctx, id) {
      const tenantId = staffTenant(ctx);
      return d().people.find((p) => p.tenantId === tenantId && p.id === id) ?? null;
    },
    async getByUserId(ctx, userId) {
      const tenantId = staffTenant(ctx);
      return d().people.find((p) => p.tenantId === tenantId && p.userId === userId) ?? null;
    },
    async upsert(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(PersonInputSchema, input);
      const existing = id === undefined ? undefined : own(d().people, tenantId, id, "Person");
      ownRef(d().media, tenantId, data.photoMediaId, "Media");
      if (data.userId !== null && !d().users.some((u) => u.id === data.userId)) {
        throw notFound("User", data.userId);
      }
      const stamp = store.nowIso();
      const row: Person = {
        ...data,
        id: existing?.id ?? store.nextId("person"),
        tenantId,
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
      };
      return save(d().people, row);
    },
    async delete(ctx, id) {
      const row = own(d().people, writeTenant(ctx), id, "Person");
      removeWhere(d().availabilityBlocks, (b) => b.personId === row.id);
      removeWhere(d().teamMembers, (m) => m.personId === row.id);
      removeWhere(d().people, (p) => p.id === row.id);
    },
    async reorder(ctx, ids) {
      const tenantId = writeTenant(ctx);
      const rows = ids.map((id) => own(d().people, tenantId, id, "Person"));
      rows.forEach((row, index) => save(d().people, { ...row, sort: index }));
    },
    async listAvailability(ctx, query) {
      const tenantId = staffTenant(ctx);
      const from = instant(query.from);
      const to = instant(query.to);
      return d()
        .availabilityBlocks.filter(
          (b) =>
            b.tenantId === tenantId &&
            (query.personIds === undefined || query.personIds.includes(b.personId)) &&
            Date.parse(b.from) <= to &&
            Date.parse(b.to) >= from,
        )
        .sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
    },
    async addAvailability(ctx, input) {
      const tenantId = writeTenant(ctx);
      const data = parseInput(AvailabilityBlockInputSchema, input);
      own(d().people, tenantId, data.personId, "Person");
      const row: AvailabilityBlock = { ...data, id: store.nextId("avail"), tenantId };
      d().availabilityBlocks.push(row);
      return row;
    },
    async removeAvailability(ctx, id) {
      const row = own(d().availabilityBlocks, writeTenant(ctx), id, "AvailabilityBlock");
      removeWhere(d().availabilityBlocks, (b) => b.id === row.id);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// teams
// ---------------------------------------------------------------------------------------------

export function mockTeams({ store }: RepoDeps): TeamRepo {
  const d = () => store.data;
  return {
    async list(ctx) {
      const tenantId = staffTenant(ctx);
      return d()
        .teams.filter((t) => t.tenantId === tenantId)
        .sort((a, b) => huCollator.compare(a.name, b.name));
    },
    async get(ctx, id) {
      const tenantId = staffTenant(ctx);
      return d().teams.find((t) => t.tenantId === tenantId && t.id === id) ?? null;
    },
    async upsert(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(TeamInputSchema, input);
      const existing = id === undefined ? undefined : own(d().teams, tenantId, id, "Team");
      ownRef(d().calendars, tenantId, data.calendarId, "Calendar");
      const row: Team = { ...data, id: existing?.id ?? store.nextId("team"), tenantId };
      return save(d().teams, row);
    },
    async delete(ctx, id) {
      const row = own(d().teams, writeTenant(ctx), id, "Team");
      removeWhere(d().teamPositions, (p) => p.teamId === row.id);
      removeWhere(d().teamMembers, (m) => m.teamId === row.id);
      removeWhere(d().teams, (t) => t.id === row.id);
    },
    async listPositions(ctx, teamId) {
      const tenantId = staffTenant(ctx);
      return d()
        .teamPositions.filter((p) => p.tenantId === tenantId && p.teamId === teamId)
        .sort((a, b) => a.sort - b.sort || huCollator.compare(a.name, b.name));
    },
    async upsertPosition(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(TeamPositionInputSchema, input);
      const existing =
        id === undefined ? undefined : own(d().teamPositions, tenantId, id, "TeamPosition");
      own(d().teams, tenantId, data.teamId, "Team");
      const row: TeamPosition = { ...data, id: existing?.id ?? store.nextId("pos"), tenantId };
      return save(d().teamPositions, row);
    },
    async deletePosition(ctx, id) {
      const row = own(d().teamPositions, writeTenant(ctx), id, "TeamPosition");
      removeWhere(d().teamPositions, (p) => p.id === row.id);
      d().teamMembers = d().teamMembers.map((m) =>
        m.positionIds.includes(row.id)
          ? { ...m, positionIds: m.positionIds.filter((p) => p !== row.id) }
          : m,
      );
    },
    async listMembers(ctx, filter) {
      const tenantId = staffTenant(ctx);
      return d().teamMembers.filter(
        (m) =>
          m.tenantId === tenantId &&
          (filter.teamId === undefined || m.teamId === filter.teamId) &&
          (filter.personId === undefined || m.personId === filter.personId),
      );
    },
    async upsertMember(ctx, input) {
      const tenantId = writeTenant(ctx);
      const data = parseInput(TeamMemberInputSchema, input);
      own(d().teams, tenantId, data.teamId, "Team");
      own(d().people, tenantId, data.personId, "Person");
      data.positionIds.forEach((positionId, index) => {
        const position = d().teamPositions.find(
          (p) => p.id === positionId && p.tenantId === tenantId,
        );
        if (position?.teamId !== data.teamId) {
          throw validationError([
            { path: ["positionIds", index], message: "Position does not belong to the team" },
          ]);
        }
      });
      const row: TeamMember = { ...data, tenantId };
      d().teamMembers = d().teamMembers.filter(
        (m) =>
          !(m.tenantId === tenantId && m.teamId === data.teamId && m.personId === data.personId),
      );
      d().teamMembers.push(row);
      return row;
    },
    async removeMember(ctx, teamId, personId) {
      const tenantId = writeTenant(ctx);
      const removed = removeWhere(
        d().teamMembers,
        (m) => m.tenantId === tenantId && m.teamId === teamId && m.personId === personId,
      );
      if (removed === 0) throw notFound("TeamMember");
    },
  };
}

// ---------------------------------------------------------------------------------------------
// requests
// ---------------------------------------------------------------------------------------------

const NoteBodySchema = PastoralRequestSchema.shape.notes.element.shape.body;

export function mockRequests({ store }: RepoDeps): RequestRepo {
  const d = () => store.data;
  const formOf = (
    tenantId: string | null,
    key: string,
    activeOnly: boolean,
  ): FormDefinition | null =>
    d().formDefinitions.find(
      (f) => f.tenantId === tenantId && f.key === key && (!activeOnly || f.active),
    ) ?? null;

  return {
    async listForms(ctx) {
      const tenantId = readTenant(ctx);
      return d()
        .formDefinitions.filter((f) => f.tenantId === tenantId && f.active)
        .sort((a, b) => huCollator.compare(a.title, b.title));
    },
    async getForm(ctx, key) {
      return formOf(readTenant(ctx), key, isAnonymous(ctx));
    },
    async upsertForm(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(FormDefinitionInputSchema, input);
      const existing =
        id === undefined ? undefined : own(d().formDefinitions, tenantId, id, "FormDefinition");
      if (
        d().formDefinitions.some(
          (f) => f.tenantId === tenantId && f.key === data.key && f.id !== id,
        )
      ) {
        throw conflict("Form key already used", { field: "key" });
      }
      const stamp = store.nowIso();
      const row: FormDefinition = {
        ...data,
        id: existing?.id ?? store.nextId("form"),
        tenantId,
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
      };
      return save(d().formDefinitions, row);
    },
    async deleteForm(ctx, id) {
      const row = own(d().formDefinitions, writeTenant(ctx), id, "FormDefinition");
      if (d().pastoralRequests.some((r) => r.formId === row.id)) {
        throw conflict("Requests still reference this form");
      }
      removeWhere(d().formDefinitions, (f) => f.id === row.id);
    },
    async submit(ctx, input) {
      // The one anonymous write (README rule 4): any tenant ctx may submit.
      const tenantId = requireTenantId(ctx);
      const data = parseInput(RequestSubmissionSchema, input);
      const form = formOf(tenantId, data.formKey, true);
      if (!form) throw notFound("FormDefinition", data.formKey);
      const issues = validateFormData(form.fields, data.data);
      if (issues.length > 0)
        throw validationError(issues.map((i) => ({ ...i, path: ["data", ...i.path] })));
      const stamp = store.nowIso();
      const reference = nextReference(
        form.referencePrefix,
        budapestYear(stamp),
        d()
          .pastoralRequests.filter((r) => r.tenantId === tenantId)
          .map((r) => r.reference),
      );
      const row: PastoralRequest = {
        id: store.nextId("req"),
        tenantId,
        formId: form.id,
        formKey: form.key,
        reference,
        data: data.data,
        status: "uj",
        assigneeUserId: null,
        notes: [],
        consentAt: stamp,
        consentTextHash: data.consentTextHash,
        createdAt: stamp,
        closedAt: null,
        purgeAfter: null,
      };
      d().pastoralRequests.push(row);
      // Only the reference and a link — never the submitted content (CLAUDE.md privacy rules).
      send(store, [
        {
          channel: "email",
          template: "request.officeNotification",
          recipient: { kind: "persona", persona: "office" },
          tenantId,
          params: { reference, link: `/admin/kerelmek/${row.id}` },
        },
        {
          channel: "email",
          template: "request.confirmation",
          recipient: { kind: "persona", persona: "requester" },
          tenantId,
          params: { reference },
        },
      ]);
      return { id: row.id, reference };
    },
    async list(ctx, filter = {}) {
      const tenantId = staffTenant(ctx);
      const from = filter.from === undefined ? -Infinity : Date.parse(filter.from);
      const to = filter.to === undefined ? Infinity : Date.parse(filter.to);
      return d()
        .pastoralRequests.filter(
          (r) =>
            r.tenantId === tenantId &&
            (filter.status === undefined || r.status === filter.status) &&
            (filter.formKey === undefined || r.formKey === filter.formKey) &&
            Date.parse(r.createdAt) >= from &&
            Date.parse(r.createdAt) <= to,
        )
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    },
    async get(ctx, id) {
      const tenantId = staffTenant(ctx);
      return d().pastoralRequests.find((r) => r.tenantId === tenantId && r.id === id) ?? null;
    },
    async setStatus(ctx, id, status) {
      const row = own(d().pastoralRequests, writeTenant(ctx), id, "PastoralRequest");
      const next = parseInput(RequestStatusSchema, status);
      if (next !== "lezart") {
        return save(d().pastoralRequests, {
          ...row,
          status: next,
          closedAt: null,
          purgeAfter: null,
        });
      }
      if (row.status === "lezart") return row;
      const form = d().formDefinitions.find((f) => f.id === row.formId);
      const closedAt = store.nowIso();
      return save(d().pastoralRequests, {
        ...row,
        status: next,
        closedAt,
        purgeAfter: addDaysIso(closedAt, form?.retentionDays ?? 365),
      });
    },
    async assign(ctx, id, userId) {
      const tenantId = writeTenant(ctx);
      const row = own(d().pastoralRequests, tenantId, id, "PastoralRequest");
      if (
        userId !== null &&
        !d().memberships.some((m) => m.tenantId === tenantId && m.userId === userId)
      ) {
        throw notFound("Member", userId);
      }
      return save(d().pastoralRequests, { ...row, assigneeUserId: userId });
    },
    async addNote(ctx, id, body) {
      const row = own(d().pastoralRequests, writeTenant(ctx), id, "PastoralRequest");
      const text = parseInput(NoteBodySchema, typeof body === "string" ? body.trim() : body);
      const note = {
        id: store.nextId("note"),
        authorUserId: actorUserId(ctx),
        body: text,
        createdAt: store.nowIso(),
      };
      return save(d().pastoralRequests, { ...row, notes: [...row.notes, note] });
    },
    async purgeExpired(ctx, now) {
      const tenantId = writeTenant(ctx);
      const limit = Date.parse(parseInput(IsoDateTimeSchema, now));
      return removeWhere(
        d().pastoralRequests,
        (r) => r.tenantId === tenantId && r.purgeAfter !== null && Date.parse(r.purgeAfter) < limit,
      );
    },
  };
}
