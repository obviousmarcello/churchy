/** Every email/push-producing action writes an outbox entry — one test per action type. */
import type { Repositories } from "@churchy/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import type { OutboxEntry } from "./outbox";
import { createMockRepositories } from "./repositories";
import type { MockStore } from "./store";
import { CONTRACT_ENV, seedContractFixtures } from "./testing/fixtures";

const env = CONTRACT_ENV;
const ctxA = { tenantId: env.tenantA, actor: env.actorA };
const anonA = { tenantId: env.tenantA, actor: { userId: null, personId: null } };
const orgCtx = { orgId: env.orgId, actor: env.orgActor };

let store: MockStore;
let repos: Repositories;

beforeEach(() => {
  store = seedContractFixtures();
  repos = createMockRepositories(store);
});

const templates = (entries: OutboxEntry[]) => entries.map((e) => `${e.channel}:${e.template}`);
/** Recursively collects every string value of the outbox (to prove no content leaks). */
const allText = () => JSON.stringify(store.listOutbox());

async function person(givenName: string) {
  return repos.people.upsert(ctxA, { familyName: "Teszt", givenName });
}

describe("outbox", () => {
  it("requests.submit → office notification + requester confirmation, reference only", async () => {
    await repos.requests.upsertForm(ctxA, {
      key: "keresztelo",
      title: "Keresztelési bejelentés",
      referencePrefix: "KER",
      fields: [
        { type: "text", key: "gyermekNeve", label: "A gyermek neve", required: true },
        { type: "email", key: "email", label: "E-mail", required: true },
      ],
    });
    const receipt = await repos.requests.submit(anonA, {
      formKey: "keresztelo",
      data: { gyermekNeve: "Minta Bence", email: "szulo@example.test" },
      consent: true,
      consentTextHash: "sha256-v1-minta",
    });
    const entries = store.listOutbox();
    expect(templates(entries)).toEqual([
      "email:request.officeNotification",
      "email:request.confirmation",
    ]);
    expect(entries[0]).toMatchObject({
      tenantId: env.tenantA,
      recipient: { kind: "persona", persona: "office" },
      params: { reference: receipt.reference, link: `/admin/kerelmek/${receipt.id}` },
    });
    expect(entries[1]?.params).toEqual({ reference: receipt.reference });
    expect(allText()).not.toContain("Minta Bence");
    expect(allText()).not.toContain("szulo@example.test");
  });

  it("contact.submit → one message to the office carrying the message, nothing to the sender", async () => {
    const message = "Szeretnék érdeklődni.\n".repeat(20).trim();
    const receipt = await repos.contact.submit(anonA, {
      name: "Minta Mária",
      email: "minta.maria@example.test",
      phone: "",
      subject: "Érdeklődés",
      message,
      consent: true,
    });
    expect(receipt.reference).toMatch(/^KAP-\d{4}-\d{4}$/);
    const entries = store.listOutbox();
    expect(templates(entries)).toEqual(["email:contact.message"]);
    expect(entries[0]).toMatchObject({
      tenantId: env.tenantA,
      recipient: { kind: "persona", persona: "office" },
      params: {
        reference: receipt.reference,
        name: "Minta Mária",
        email: "minta.maria@example.test",
        phone: null,
        subject: "Érdeklődés",
        message,
      },
    });
    // Longer than ordinary params (200), allowed only for this template's message.
    expect(message.length).toBeGreaterThan(200);
    expect(() =>
      store.appendOutbox({
        channel: "email",
        template: "request.officeNotification",
        recipient: { kind: "persona", persona: "office" },
        tenantId: env.tenantA,
        params: { message },
      }),
    ).toThrow(TypeError);
  });

  it("hr.createTicket / updateTicket / addMessage → handler + requester messages, reference only", async () => {
    const handler = await person("Kezelő");
    const category = await repos.hr.upsertCategory(ctxA, {
      key: "panasz",
      name: "Panasz",
      handlerPersonIds: [handler.id],
      fields: [{ type: "textarea", key: "leiras", label: "Leírás", required: true }],
    });
    const ticket = await repos.hr.createTicket(ctxA, {
      categoryId: category.id,
      requesterPersonId: env.actorA.personId,
      subject: "Bizalmas tárgy (fiktív)",
      data: { leiras: "Bizalmas tartalom (fiktív)" },
    });
    expect(templates(store.listOutbox())).toEqual([
      "email:hr.ticketCreated",
      "email:hr.ticketReceived",
    ]);
    expect(store.listOutbox()[0]?.recipient).toEqual({ kind: "person", personId: handler.id });
    store.clearOutbox();

    await repos.hr.updateTicket(ctxA, ticket.id, { status: "folyamatban" });
    expect(templates(store.listOutbox())).toEqual([
      "email:hr.ticketUpdated",
      "push:hr.ticketUpdated",
    ]);
    store.clearOutbox();
    await repos.hr.updateTicket(ctxA, ticket.id, { currentStep: 1 }); // no status change → silent
    await repos.hr.addMessage(ctxA, ticket.id, { body: "Belső", internal: true }); // internal → silent
    expect(store.listOutbox()).toEqual([]);

    const otherCtx = {
      tenantId: env.tenantA,
      actor: { userId: env.actorA.userId, personId: handler.id },
    };
    await repos.hr.addMessage(otherCtx, ticket.id, { body: "Válasz a kérelmezőnek (fiktív)" });
    expect(templates(store.listOutbox())).toEqual([
      "email:hr.ticketUpdated",
      "push:hr.ticketUpdated",
    ]);
    for (const entry of store.listOutbox()) {
      expect(entry.params).toEqual({
        reference: ticket.reference,
        link: `/munkater/hr/${ticket.id}`,
      });
      expect(entry.recipient).toEqual({ kind: "person", personId: env.actorA.personId });
    }
    expect(allText()).not.toContain("Bizalmas");
  });

  it("hr tickets without handlers notify the HR handler persona; anonymous ones get no receipt", async () => {
    const category = await repos.hr.upsertCategory(ctxA, {
      key: "nevtelen",
      name: "Névtelen panasz",
      allowAnonymous: true,
    });
    await repos.hr.createTicket(ctxA, {
      categoryId: category.id,
      requesterPersonId: null,
      anonymous: true,
      subject: "Névtelen bejelentés (fiktív)",
    });
    expect(store.listOutbox()).toHaveLength(1);
    expect(store.listOutbox()[0]?.recipient).toEqual({ kind: "persona", persona: "hrHandlers" });
  });

  describe("assignments", () => {
    async function setup() {
      const team = await repos.teams.upsert(ctxA, { name: "Zenei szolgálat", kind: "music" });
      const position = await repos.teams.upsertPosition(ctxA, { teamId: team.id, name: "Gitár" });
      const anna = await person("Anna");
      const bence = await person("Bence");
      const loc = await repos.locations.upsert(ctxA, {
        name: "Templom",
        slug: "templom",
        kind: "templom",
      });
      const occ = await repos.schedule.ensureOccurrence(ctxA, {
        locationId: loc.id,
        startsAt: "2032-06-06T10:00:00+02:00",
        serviceType: "szentmise",
      });
      const [assignment] = await repos.assignments.create(ctxA, [
        {
          occurrenceId: occ.id,
          teamId: team.id,
          positionId: position.id,
          personId: anna.id,
          startsAt: "2032-06-06T10:00:00+02:00",
          endsAt: "2032-06-06T11:00:00+02:00",
        },
      ]);
      return { assignment: assignment!, anna, bence };
    }

    it("create → assignment.requested email + push to the person", async () => {
      const { assignment, anna } = await setup();
      expect(templates(store.listOutbox())).toEqual([
        "email:assignment.requested",
        "push:assignment.requested",
      ]);
      expect(store.listOutbox()[0]).toMatchObject({
        recipient: { kind: "person", personId: anna.id },
        params: { assignmentId: assignment.id },
      });
    });

    it("requestSwap → assignment.swapRequested; acceptSwap → assignment.swapAccepted", async () => {
      const { assignment, anna, bence } = await setup();
      store.clearOutbox();
      await repos.assignments.requestSwap(ctxA, assignment.id, bence.id);
      expect(templates(store.listOutbox())).toEqual([
        "email:assignment.swapRequested",
        "push:assignment.swapRequested",
      ]);
      expect(store.listOutbox()[0]?.recipient).toEqual({ kind: "person", personId: bence.id });
      store.clearOutbox();
      await repos.assignments.acceptSwap(ctxA, assignment.id, bence.id);
      expect(templates(store.listOutbox())).toEqual([
        "email:assignment.swapAccepted",
        "push:assignment.swapAccepted",
      ]);
      expect(store.listOutbox()[0]?.recipient).toEqual({ kind: "person", personId: anna.id });
    });

    it("an open swap request goes to the team persona", async () => {
      const { assignment } = await setup();
      store.clearOutbox();
      await repos.assignments.requestSwap(ctxA, assignment.id);
      expect(store.listOutbox()[0]?.recipient).toEqual({ kind: "persona", persona: "team" });
    });
  });

  it("bookings.create (pending) → booking.requested; decide → booking.decided email + push", async () => {
    const manager = await person("Teremfelelős");
    const loc = await repos.locations.upsert(ctxA, {
      name: "Plébániaház",
      slug: "haz",
      kind: "egyeb",
    });
    const managed = await repos.rooms.upsert(ctxA, {
      locationId: loc.id,
      name: "Kórusterem",
      managerPersonIds: [manager.id],
    });
    const unmanaged = await repos.rooms.upsert(ctxA, { locationId: loc.id, name: "Hittanterem" });
    const booking = await repos.bookings.create(ctxA, {
      roomId: managed.id,
      startsAt: "2032-05-10T17:00:00+02:00",
      endsAt: "2032-05-10T18:00:00+02:00",
      title: "Kóruspróba",
    });
    await repos.bookings.create(ctxA, {
      roomId: unmanaged.id,
      startsAt: "2032-05-10T17:00:00+02:00",
      endsAt: "2032-05-10T18:00:00+02:00",
      title: "Jóváhagyott",
      status: "approved",
    });
    expect(store.listOutbox()).toHaveLength(1);
    expect(store.listOutbox()[0]).toMatchObject({
      template: "booking.requested",
      recipient: { kind: "person", personId: manager.id },
    });
    store.clearOutbox();
    await repos.bookings.decide(ctxA, booking.id, "approved");
    expect(templates(store.listOutbox())).toEqual([
      "email:booking.decided",
      "push:booking.decided",
    ]);
    expect(store.listOutbox()[0]).toMatchObject({
      recipient: { kind: "person", personId: env.actorA.personId },
      params: { bookingId: booking.id, decision: "approved" },
    });
    store.clearOutbox();
    await repos.bookings.create(ctxA, {
      roomId: unmanaged.id,
      startsAt: "2032-05-11T17:00:00+02:00",
      endsAt: "2032-05-11T18:00:00+02:00",
      title: "Függő",
    });
    expect(store.listOutbox()[0]?.recipient).toEqual({ kind: "persona", persona: "roomManagers" });
  });

  it("service plans: in_review → plan.reviewRequested, approved → plan.approved, mentions → plan.mention", async () => {
    const loc = await repos.locations.upsert(ctxA, {
      name: "Templom",
      slug: "templom",
      kind: "templom",
    });
    const occ = await repos.schedule.ensureOccurrence(ctxA, {
      locationId: loc.id,
      startsAt: "2032-06-06T10:00:00+02:00",
      serviceType: "szentmise",
    });
    const plan = await repos.servicePlans.upsert(ctxA, {
      occurrenceId: occ.id,
      title: "Vasárnapi szentmise",
      leaderPersonId: env.actorA.personId,
    });
    await repos.servicePlans.setStatus(ctxA, plan.id, "in_review");
    expect(templates(store.listOutbox())).toEqual([
      "email:plan.reviewRequested",
      "push:plan.reviewRequested",
    ]);
    store.clearOutbox();
    await repos.servicePlans.setStatus(ctxA, plan.id, "approved");
    expect(store.listOutbox()).toMatchObject([
      {
        channel: "push",
        template: "plan.approved",
        recipient: { kind: "person", personId: env.actorA.personId },
      },
    ]);
    store.clearOutbox();
    const kantor = await person("Kántor");
    await repos.servicePlans.addComment(ctxA, {
      planId: plan.id,
      body: "Kérlek, nézd meg.",
      mentions: [kantor.id, kantor.id],
    });
    expect(store.listOutbox()).toMatchObject([
      {
        channel: "push",
        template: "plan.mention",
        recipient: { kind: "person", personId: kantor.id },
      },
    ]);
  });

  it("members.invite → member.invitation email to the user", async () => {
    const member = await repos.members.invite(ctxA, {
      email: "uj.szerkeszto@example.test",
      name: "Új Szerkesztő",
      role: "editor",
    });
    expect(store.listOutbox()).toMatchObject([
      {
        channel: "email",
        template: "member.invitation",
        recipient: { kind: "user", userId: member.userId },
      },
    ]);
  });

  it("billing payment failure → billing.paymentFailed (organization accounts carry no tenant)", async () => {
    await repos.billing.upsertBillingAccount(orgCtx, {
      name: "Minta Egyházmegye",
      address: { postalCode: "1011", city: "Budapest", line1: "Minta utca 1.", line2: null },
      email: "szamlazas@example.test",
      paymentMethod: "transfer",
    });
    store.setSwitches({ paymentFailure: true });
    await expect(
      repos.billing.createSubscription(orgCtx, {
        planKey: "teljes",
        tenantId: null,
        quantity: 10,
        period: "yearly",
        status: "active",
        currentPeriodEnd: "2027-12-31T00:00:00+01:00",
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_FAILED" });
    expect(store.listOutbox()).toMatchObject([
      {
        template: "billing.paymentFailed",
        tenantId: null,
        recipient: { kind: "persona", persona: "billingContact" },
      },
    ]);
  });
});
