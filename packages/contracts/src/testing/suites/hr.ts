import { expect, it } from "vitest";
import type { Ctx } from "../../ctx";
import type { HrRepo } from "../../modules/hr";
import { defineContractSuite, expectContractError, ids, uniq } from "../harness";
import { activeLink } from "./organizations";

async function category(repo: HrRepo, ctx: Ctx, overrides: { allowAnonymous?: boolean } = {}) {
  return repo.upsertCategory(ctx, {
    key: uniq("szabadsag"),
    name: "Szabadságkérelem",
    fields: [{ type: "textarea", key: "indoklas", label: "Indoklás", required: true }],
    approvalChain: [{ kind: "manager" }],
    createsAbsence: true,
    absenceType: "rendes_szabadsag",
    ...overrides,
  });
}

export const hrContract = defineContractSuite("hr", (t) => {
  const ticket = (categoryId: string) => ({
    categoryId,
    requesterPersonId: t.env.actorA.personId,
    subject: "Szabadság december végén",
    data: { indoklas: "Családi program (fiktív minta)" },
  });

  it("runs a ticket through messages, approvals and closure", async () => {
    const cat = await category(t.repo, t.ctx.a);
    expect(cat).toMatchObject({ confidential: false, retentionDays: 3 * 365, active: true });
    const created = await t.repo.createTicket(t.ctx.a, ticket(cat.id));
    expect(created.reference).toMatch(/^HR-\d{4}-\d{4,}$/);
    expect(created).toMatchObject({
      status: "uj",
      currentStep: 0,
      categoryKey: cat.key,
      anonymous: false,
    });

    await t.repo.addMessage(t.ctx.a, created.id, { body: "Kérem jóváhagyását." });
    await t.repo.addMessage(t.ctx.a, created.id, { body: "Belső megjegyzés", internal: true });
    expect((await t.repo.listMessages(t.ctx.a, created.id)).map((m) => m.body)).toEqual([
      "Kérem jóváhagyását.",
    ]);
    expect(await t.repo.listMessages(t.ctx.a, created.id, { includeInternal: true })).toHaveLength(
      2,
    );

    await t.repo.updateTicket(t.ctx.a, created.id, { status: "jovahagyasra_var" });
    const approval = await t.repo.recordApproval(t.ctx.a, created.id, {
      step: 0,
      approverPersonId: t.env.actorA.personId,
      decision: "approved",
    });
    expect(ids(await t.repo.listApprovals(t.ctx.a, created.id))).toEqual([approval.id]);
    const closed = await t.repo.updateTicket(t.ctx.a, created.id, { status: "lezart" });
    expect(closed.closedAt).not.toBeNull();
    expect(closed.purgeAfter).not.toBeNull();
  });

  it("makes handed-over tickets read-only", async () => {
    const cat = await category(t.repo, t.ctx.a);
    const created = await t.repo.createTicket(t.ctx.a, ticket(cat.id));
    const handed = await t.repo.handOver(t.ctx.a, created.id, {
      recipient: "Egyházmegyei gyermekvédelmi felelős",
      date: "2026-11-13",
      summary: "Teljes ügyirat átadva.",
    });
    expect(handed.handover?.recipient).toBe("Egyházmegyei gyermekvédelmi felelős");
    await expectContractError(
      t.repo.updateTicket(t.ctx.a, created.id, { status: "folyamatban" }),
      "CONFLICT",
    );
  });

  it("validates tickets against the category", async () => {
    const cat = await category(t.repo, t.ctx.a);
    await expectContractError(
      t.repo.createTicket(t.ctx.a, { ...ticket(cat.id), data: {} }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.createTicket(t.ctx.a, { ...ticket(cat.id), anonymous: true, requesterPersonId: null }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.createTicket(t.ctx.a, { ...ticket(cat.id), anonymous: true }),
      "VALIDATION",
    );
    await expectContractError(t.repo.createTicket(t.ctx.a, ticket("nincs-ilyen")), "NOT_FOUND");
    await expectContractError(
      t.repo.upsertCategory(t.ctx.a, { key: uniq("x"), name: "X", createsAbsence: true }),
      "VALIDATION",
    );
    const anonymousOk = await category(t.repo, t.ctx.a, { allowAnonymous: true });
    const anon = await t.repo.createTicket(t.ctx.a, {
      ...ticket(anonymousOk.id),
      anonymous: true,
      requesterPersonId: null,
    });
    expect(anon.requesterPersonId).toBeNull();
  });

  it("never returns or modifies tenant A's tickets for tenant B, visitors or unlinked dioceses", async () => {
    const cat = await category(t.repo, t.ctx.a);
    const created = await t.repo.createTicket(t.ctx.a, ticket(cat.id));
    expect(await t.repo.getTicket(t.ctx.b, created.id)).toBeNull();
    expect(ids(await t.repo.listTickets(t.ctx.b))).not.toContain(created.id);
    expect(ids(await t.repo.listCategories(t.ctx.b))).not.toContain(cat.id);
    expect(await t.repo.listTickets(t.ctx.anonA)).toEqual([]);
    expect(await t.repo.getTicket(t.ctx.anonA, created.id)).toBeNull();
    await expectContractError(
      t.repo.updateTicket(t.ctx.b, created.id, { status: "lezart" }),
      "NOT_FOUND",
    );
    await expectContractError(
      t.repo.addMessage(t.ctx.b, created.id, { body: "Idegen" }),
      "NOT_FOUND",
    );
    await expectContractError(
      t.repo.createTicket(t.ctx.b, { ...ticket(cat.id), requesterPersonId: t.env.actorB.personId }),
      "NOT_FOUND",
    );

    const orgs = t.need("organizations");
    for (const l of await orgs.listLinks(t.ctx.a)) {
      if (l.orgId === t.env.orgId && l.status !== "revoked") await orgs.revokeLink(t.ctx.a, l.id);
    }
    expect(await t.repo.getTicket(t.ctx.org, created.id)).toBeNull();
    expect(ids(await t.repo.listTickets(t.ctx.org))).not.toContain(created.id);
  });

  it("gives a linked diocese access to delegated categories only, until revoked", async () => {
    const delegated = await category(t.repo, t.ctx.a);
    const other = await category(t.repo, t.ctx.a);
    const visible = await t.repo.createTicket(t.ctx.a, ticket(delegated.id));
    const hidden = await t.repo.createTicket(t.ctx.a, ticket(other.id));
    const orgs = t.need("organizations");
    const link = await activeLink(orgs, t.ctx.org, t.ctx.a, t.env.tenantA);
    await orgs.setDelegations(t.ctx.a, t.env.orgId, [delegated.key]);

    const seen = ids(await t.repo.listTickets(t.ctx.org, { tenantIds: [t.env.tenantA] }));
    expect(seen).toContain(visible.id);
    expect(seen).not.toContain(hidden.id);
    expect(await t.repo.getTicket(t.ctx.org, hidden.id)).toBeNull();
    const handled = await t.repo.updateTicket(t.ctx.org, visible.id, { status: "folyamatban" });
    expect(handled.status).toBe("folyamatban");
    await expectContractError(
      t.repo.updateTicket(t.ctx.org, hidden.id, { status: "folyamatban" }),
      "NOT_FOUND",
    );
    await expectContractError(t.repo.createTicket(t.ctx.org, ticket(delegated.id)), "CONTEXT");

    await orgs.revokeLink(t.ctx.a, link.id);
    expect(await t.repo.getTicket(t.ctx.org, visible.id)).toBeNull();
  });
});
