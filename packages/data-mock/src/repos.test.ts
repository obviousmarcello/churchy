/** Mock-specific behaviour beyond the contract suites (cascades, scoping edge cases). */
import type { Repositories } from "@churchy/contracts";
import { isContractError } from "@churchy/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockRepositories } from "./repositories";
import type { MockStore } from "./store";
import { CONTRACT_ENV, seedContractFixtures } from "./testing/fixtures";

const env = CONTRACT_ENV;
const ctxA = { tenantId: env.tenantA, actor: env.actorA };
const ctxB = { tenantId: env.tenantB, actor: env.actorB };
const anonA = { tenantId: env.tenantA, actor: { userId: null, personId: null } };
const orgCtx = { orgId: env.orgId, actor: env.orgActor };
const platform = { actor: env.platformActor };

let store: MockStore;
let repos: Repositories;
const NOW = new Date("2026-11-13T10:00:00+01:00");

beforeEach(() => {
  store = seedContractFixtures({ now: () => NOW });
  repos = createMockRepositories(store);
});

async function code(promise: Promise<unknown>): Promise<string | undefined> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  return isContractError(error) ? error.code : undefined;
}

describe("scoping rules shared by all repositories", () => {
  it("rejects anonymous writes with FORBIDDEN and org writes with CONTEXT", async () => {
    expect(await code(repos.locations.upsert(anonA, { name: "X", slug: "x", kind: "egyeb" }))).toBe(
      "FORBIDDEN",
    );
    expect(await code(repos.people.upsert(orgCtx, { familyName: "X", givenName: "Y" }))).toBe(
      "CONTEXT",
    );
    expect(
      await code(repos.tenants.create(ctxA, { slug: "uj", name: "Új", denomination: "rk" })),
    ).toBe("CONTEXT");
  });

  it("reads zero rows for platform and org contexts outside HR", async () => {
    expect(await repos.tenants.listDomains(platform)).toEqual([]);
    expect(await repos.billing.getBillingAccount(platform)).toBeNull();
    expect(await repos.organizations.listLinks(platform)).toEqual([]);
    expect(await repos.organizations.listDelegations(platform)).toEqual([]);
    expect(await repos.organizations.listParishStatus(ctxA)).toEqual([]);
    expect(await repos.songs.listHymnals(orgCtx)).toEqual([]);
    expect(await repos.servicePlans.listTemplates(orgCtx)).toEqual([]);
    expect(await repos.media.usage(orgCtx)).toEqual({ bytes: 0, count: 0 });
  });
});

describe("tenants, members, billing, organizations", () => {
  it("updates tenant fields and creates tenants from an org context for that org", async () => {
    const updated = await repos.tenants.update(ctxA, {
      wsTier: "s50",
      launchedAt: NOW.toISOString(),
    });
    expect(updated).toMatchObject({ wsTier: "s50", launchedAt: NOW.toISOString() });
    const created = await repos.tenants.create(orgCtx, {
      slug: "filia",
      name: "Filia Plébánia",
      denomination: "rk",
    });
    expect(created.organizationId).toBe(env.orgId);
    expect(await repos.tenants.findBySlug(platform, "nincs")).toBeNull();
    expect(await repos.tenants.findByHostname(platform, "nincs.example.test")).toBeNull();
  });

  it("resolves workspace plans and an active deal as entitlement sources", async () => {
    await repos.tenants.update(ctxA, { wsTier: "m150" });
    store.data.tenants[0]!.organizationId = env.orgId;
    await repos.organizations.upsertDeal(platform, env.orgId, {
      planKeys: ["teljes"],
      parishLimit: 10,
      priceTerms: { monthlyPerParish: null, yearlyPerParish: null, note: null },
      validFrom: "2026-01-01",
      validTo: null,
    });
    const sources = await repos.billing.getEntitlementSources(anonA);
    expect(sources.workspacePlan?.key).toBe("ws_m150");
    expect(sources.deal?.planKeys).toEqual(["teljes"]);
    expect(await code(repos.billing.getEntitlementSources(orgCtx))).toBe("CONTEXT");
  });

  it("deactivating a non-owner is fine; membership lists are sorted and own-only", async () => {
    const editor = await repos.members.invite(ctxA, {
      email: "Szerkeszto@Example.test",
      name: "Ábel Szerkesztő",
      role: "editor",
    });
    // The same e-mail (any case) is the same user in another tenant.
    const again = await repos.members.invite(ctxB, {
      email: "szerkeszto@example.test",
      name: "Ábel",
      role: "editor",
    });
    expect(again.userId).toBe(editor.userId);
    expect((await repos.members.update(ctxA, editor.userId, { active: false })).active).toBe(false);
    expect((await repos.members.list(ctxA)).map((m) => m.user.name)).toEqual([
      "Ábel Szerkesztő",
      "Minta Anna",
    ]);
    expect(await repos.members.listOwnMemberships(platform)).toEqual([]);
  });

  it("billing rejects subscriptions without an account or for another tenant", async () => {
    const sub = {
      planKey: "teljes" as const,
      tenantId: env.tenantA,
      period: "monthly" as const,
      status: "active" as const,
      currentPeriodEnd: "2027-01-01T00:00:00+01:00",
    };
    expect(await code(repos.billing.createSubscription(ctxA, sub))).toBe("NOT_FOUND");
    await repos.billing.upsertBillingAccount(ctxA, {
      name: "Minta",
      address: { postalCode: "1011", city: "Budapest", line1: "Minta utca 1.", line2: null },
      email: "szamla@example.test",
      paymentMethod: "card",
    });
    expect(
      await code(repos.billing.createSubscription(ctxA, { ...sub, tenantId: env.tenantB })),
    ).toBe("NOT_FOUND");
    expect(await code(repos.billing.upsertBillingAccount(platform, {} as never))).toBe("CONTEXT");
    expect(await repos.billing.listInvoices(ctxA)).toEqual([]);
  });

  it("links: tenant-initiated requests, revoked links and parish status", async () => {
    const link = await repos.organizations.requestLink(ctxA, { orgId: env.orgId });
    expect(link).toMatchObject({ status: "requested", approvedByParish: env.actorA.userId });
    expect(await code(repos.organizations.requestLink(ctxA, { orgId: "nincs" }))).toBe("NOT_FOUND");
    expect(await code(repos.organizations.requestLink(platform, { orgId: env.orgId }))).toBe(
      "CONTEXT",
    );
    const active = await repos.organizations.approveLink(orgCtx, link.id);
    expect(active.status).toBe("active");
    const status = await repos.organizations.listParishStatus(orgCtx);
    expect(status).toEqual([
      {
        tenantId: env.tenantA,
        name: "Minta Plébánia",
        slug: "minta-plebania",
        launched: false,
        linkStatus: "active",
      },
    ]);
    const revoked = await repos.organizations.revokeLink(orgCtx, link.id);
    expect(await repos.organizations.revokeLink(orgCtx, link.id)).toEqual(revoked);
    expect(await code(repos.organizations.approveLink(ctxA, link.id))).toBe("CONFLICT");
    expect((await repos.organizations.listParishStatus(orgCtx))[0]?.linkStatus).toBe("revoked");
    expect(await code(repos.organizations.upsertDeal(platform, "nincs", {} as never))).toBe(
      "NOT_FOUND",
    );
  });
});

describe("content and workspace cascades", () => {
  it("deleting a person removes availability and team memberships", async () => {
    const person = await repos.people.upsert(ctxA, {
      familyName: "Kiss",
      givenName: "Ilona",
      userId: env.actorA.userId,
    });
    expect((await repos.people.getByUserId(ctxA, env.actorA.userId))?.id).toBeDefined();
    const team = await repos.teams.upsert(ctxA, { name: "Lektorok", kind: "liturgy" });
    await repos.teams.upsertMember(ctxA, { teamId: team.id, personId: person.id });
    await repos.people.addAvailability(ctxA, {
      personId: person.id,
      from: "2026-12-01T09:00:00+01:00",
      to: "2026-12-01T10:00:00+01:00",
    });
    await repos.people.delete(ctxA, person.id);
    expect(await repos.teams.listMembers(ctxA, { teamId: team.id })).toEqual([]);
    expect(store.data.availabilityBlocks).toEqual([]);
    expect(await code(repos.teams.removeMember(ctxA, team.id, person.id))).toBe("NOT_FOUND");
  });

  it("orders public staff by group, then sort, then name; reorders people", async () => {
    const b = await repos.people.upsert(ctxA, {
      familyName: "Bodnár",
      givenName: "Béla",
      isPublic: true,
      staffGroup: "staff",
    });
    const a = await repos.people.upsert(ctxA, {
      familyName: "Ács",
      givenName: "Ádám",
      isPublic: true,
      staffGroup: "staff",
    });
    const p = await repos.people.upsert(ctxA, {
      familyName: "Pap",
      givenName: "Pál",
      isPublic: true,
      staffGroup: "clergy",
    });
    expect((await repos.people.listPublicStaff(anonA)).map((x) => x.id)).toEqual([
      p.id,
      a.id,
      b.id,
    ]);
    await repos.people.reorder(ctxA, [b.id, a.id]);
    expect((await repos.people.listPublicStaff(anonA)).map((x) => x.id)).toEqual([
      p.id,
      b.id,
      a.id,
    ]);
    expect((await repos.people.list(ctxA, { ids: [a.id], active: true })).map((x) => x.id)).toEqual(
      [a.id],
    );
  });

  it("deleting a room with future bookings conflicts; past ones do not block", async () => {
    const loc = await repos.locations.upsert(ctxA, { name: "Ház", slug: "haz", kind: "egyeb" });
    const room = await repos.rooms.upsert(ctxA, { locationId: loc.id, name: "Terem" });
    await repos.rooms.upsertServiceBlock(ctxA, {
      locationId: loc.id,
      serviceType: "szentmise",
      roomIds: [room.id],
    });
    const future = await repos.bookings.create(ctxA, {
      roomId: room.id,
      startsAt: "2030-01-01T10:00:00+01:00",
      endsAt: "2030-01-01T11:00:00+01:00",
      title: "Jövőbeli",
    });
    expect(await code(repos.rooms.delete(ctxA, room.id))).toBe("CONFLICT");
    await repos.bookings.cancel(ctxA, future.id);
    await repos.rooms.delete(ctxA, room.id);
    expect(await repos.rooms.listServiceBlocks(ctxA)).toEqual([]);
  });

  it("bookings: update keeps itself out of the conflict check; decided bookings cannot be decided again", async () => {
    const loc = await repos.locations.upsert(ctxA, { name: "Ház", slug: "haz", kind: "egyeb" });
    const room = await repos.rooms.upsert(ctxA, { locationId: loc.id, name: "Terem" });
    const booking = await repos.bookings.create(ctxA, {
      roomId: room.id,
      startsAt: "2032-05-10T10:00:00+02:00",
      endsAt: "2032-05-10T11:00:00+02:00",
      title: "Eredeti",
    });
    const moved = await repos.bookings.update(ctxA, booking.id, {
      endsAt: "2032-05-10T11:30:00+02:00",
      status: "approved",
    });
    expect(moved).toMatchObject({ status: "approved", endsAt: "2032-05-10T11:30:00+02:00" });
    expect(await code(repos.bookings.decide(ctxA, booking.id, "rejected"))).toBe("CONFLICT");
    expect(
      await code(repos.bookings.update(ctxA, booking.id, { endsAt: "2032-05-10T09:00:00+02:00" })),
    ).toBe("VALIDATION");
  });

  it("requests: reopening clears the closure; purge counts only expired ones", async () => {
    await repos.requests.upsertForm(ctxA, {
      key: "temetes",
      title: "Temetési bejelentés",
      referencePrefix: "TEM",
      retentionDays: 30,
      fields: [{ type: "text", key: "nev", label: "Név", required: true }],
    });
    const submit = () =>
      repos.requests.submit(anonA, {
        formKey: "temetes",
        data: { nev: "Fiktív Név" },
        consent: true,
        consentTextHash: "sha256-v1-minta",
      });
    const first = await submit();
    const second = await submit();
    expect(first.reference).toBe("TEM-2026-0001");
    expect(second.reference).toBe("TEM-2026-0002");
    await repos.requests.setStatus(ctxA, first.id, "lezart");
    const reopened = await repos.requests.setStatus(ctxA, first.id, "folyamatban");
    expect(reopened).toMatchObject({ closedAt: null, purgeAfter: null });
    expect(await repos.requests.purgeExpired(ctxA, "2099-01-01T00:00:00+01:00")).toBe(0);
    expect(await code(repos.requests.assign(ctxA, first.id, "idegen-felhasznalo"))).toBe(
      "NOT_FOUND",
    );
    expect(await code(repos.requests.addNote(ctxA, first.id, "   "))).toBe("VALIDATION");
    expect(await repos.requests.getForm(ctxA, "temetes")).not.toBeNull();
  });

  it("hr: purges expired closed tickets with their messages and approvals", async () => {
    const category = await repos.hr.upsertCategory(ctxA, {
      key: "egyeb",
      name: "Egyéb",
      retentionDays: 1,
      slaHours: 24,
    });
    const ticket = await repos.hr.createTicket(ctxA, {
      categoryId: category.id,
      requesterPersonId: env.actorA.personId,
      subject: "Fiktív kérés",
    });
    expect(ticket.dueAt).toBe("2026-11-14T09:00:00.000Z");
    await repos.hr.addMessage(ctxA, ticket.id, { body: "Üzenet" });
    await repos.hr.recordApproval(ctxA, ticket.id, {
      step: 0,
      approverPersonId: env.actorA.personId,
      decision: "approved",
    });
    await repos.hr.updateTicket(ctxA, ticket.id, { status: "lezart" });
    expect(await repos.hr.purgeExpired(ctxA, "2026-11-13T12:00:00+01:00")).toBe(0);
    expect(await repos.hr.purgeExpired(ctxA, "2026-11-20T12:00:00+01:00")).toBe(1);
    expect(store.data.hrTicketMessages).toEqual([]);
    expect(store.data.hrApprovals).toEqual([]);
    expect(await repos.hr.listMessages(ctxA, ticket.id)).toEqual([]);
    expect(await repos.hr.listApprovals(ctxA, ticket.id)).toEqual([]);
  });

  it("absences: an org reads linked parishes' staff profiles; workday calendar is per year", async () => {
    const person = await repos.people.upsert(ctxA, { familyName: "Nagy", givenName: "Erzsébet" });
    await repos.absences.upsertStaffProfile(ctxA, {
      personId: person.id,
      position: "sekrestyés",
      employmentType: "munkaviszony",
      startDate: "2020-03-01",
      weeklyHours: 40,
    });
    expect(await repos.absences.listStaffProfiles(orgCtx)).toEqual([]);
    const link = await repos.organizations.requestLink(orgCtx, { tenantId: env.tenantA });
    await repos.organizations.approveLink(ctxA, link.id);
    expect((await repos.absences.listStaffProfiles(orgCtx)).map((p) => p.personId)).toEqual([
      person.id,
    ]);
    expect((await repos.absences.listWorkdayCalendar(anonA, 2026)).map((e) => e.date)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-03-15",
    ]);
    expect(await repos.absences.listWorkdayCalendar(anonA, 2027)).toEqual([]);
    expect(await repos.absences.getEntitlement(ctxA, person.id, 2026)).toBeNull();
  });

  it("notifications: limit and per-user preferences", async () => {
    for (let i = 0; i < 3; i += 1) {
      await repos.notifications.create(ctxA, {
        userId: env.actorA.userId,
        kind: "mention",
        link: "/munkater",
      });
    }
    expect(await repos.notifications.list(ctxA, { limit: 2 })).toHaveLength(2);
    expect(
      await code(repos.notifications.create(ctxA, { userId: "nincs", kind: "mention", link: "/" })),
    ).toBe("NOT_FOUND");
    await repos.notifications.setPref(ctxA, {
      kind: "mention",
      channels: ["in_app"],
      digest: true,
    });
    await repos.notifications.setPref(ctxA, { kind: "mention", channels: ["push"], digest: false });
    expect(await repos.notifications.getPrefs(ctxA)).toEqual([
      { userId: env.actorA.userId, kind: "mention", channels: ["push"], digest: false },
    ]);
    expect(await repos.notifications.getPrefs(anonA)).toEqual([]);
  });

  it("songs: platform hymnals are read-only and hymnal references are searchable", async () => {
    expect(
      await code(
        repos.songs.upsertHymnal(ctxA, { id: "hymnal-re", abbreviation: "RÉ", name: "X" }),
      ),
    ).toBe("NOT_FOUND");
    const song = await repos.songs.upsert(ctxA, {
      title: "Erős vár a mi Istenünk",
      altTitles: ["Ein feste Burg"],
      seasons: ["reformacio"],
      hymnalRefs: [{ hymnalId: "hymnal-re", number: "390" }],
    });
    expect((await repos.songs.search(ctxA, { query: "RÉ 390" })).map((s) => s.id)).toEqual([
      song.id,
    ]);
    expect((await repos.songs.search(ctxA, { query: "feste" })).map((s) => s.id)).toEqual([
      song.id,
    ]);
    expect(await repos.songs.search(ctxA, { season: "advent" })).toEqual([]);
  });
});
