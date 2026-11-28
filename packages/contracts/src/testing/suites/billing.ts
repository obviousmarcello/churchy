import { expect, it } from "vitest";
import { PlanSchema } from "../../modules/billing";
import type { BillingAccountInput } from "../../modules/billing";
import { defineContractSuite, expectContractError, ids } from "../harness";

const account = (name: string): BillingAccountInput => ({
  name,
  taxNumber: "12345678-1-42",
  address: { postalCode: "1011", city: "Budapest", line1: "Minta utca 1.", line2: null },
  email: "szamlazas@example.test",
  paymentMethod: "transfer",
});

export const billingContract = defineContractSuite("billing", (t) => {
  it("serves the platform plan catalog to any context", async () => {
    const plans = await t.repo.listPlans(t.ctx.anonA);
    expect(plans.map((p) => p.key)).toEqual(expect.arrayContaining(["ingyenes", "teljes"]));
    for (const plan of plans) expect(PlanSchema.safeParse(plan).success).toBe(true);
    const sources = await t.repo.getEntitlementSources(t.ctx.a);
    expect(sources.websitePlan.kind).toBe("website");
  });

  it("manages a tenant billing account and its subscriptions", async () => {
    const acc = await t.repo.upsertBillingAccount(t.ctx.a, account("Minta Plébánia"));
    expect(acc).toMatchObject({ ownerType: "tenant", ownerId: t.env.tenantA });
    const sub = await t.repo.createSubscription(t.ctx.a, {
      planKey: "teljes",
      tenantId: t.env.tenantA,
      period: "yearly",
      status: "active",
      currentPeriodEnd: "2027-11-13T00:00:00+01:00",
    });
    expect(sub.billingAccountId).toBe(acc.id);
    const updated = await t.repo.updateSubscription(t.ctx.a, sub.id, { status: "past_due" });
    expect(updated.status).toBe("past_due");
    expect(Array.isArray(await t.repo.listInvoices(t.ctx.a))).toBe(true);
  });

  it("supports organization billing accounts", async () => {
    const acc = await t.repo.upsertBillingAccount(t.ctx.org, account("Minta Egyházmegye"));
    expect(acc).toMatchObject({ ownerType: "organization", ownerId: t.env.orgId });
  });

  it("rejects invalid input", async () => {
    await expectContractError(
      t.repo.upsertBillingAccount(t.ctx.a, { ...account("X"), taxNumber: "123" }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.upsertBillingAccount(t.ctx.a, { ...account("X"), paymentMethod: "cash" as never }),
      "VALIDATION",
    );
  });

  it("never returns or modifies tenant A's billing data for tenant B", async () => {
    const acc = await t.repo.upsertBillingAccount(t.ctx.a, account("Csak A"));
    const sub = await t.repo.createSubscription(t.ctx.a, {
      planKey: "teljes",
      tenantId: t.env.tenantA,
      period: "monthly",
      status: "active",
      currentPeriodEnd: "2027-01-01T00:00:00+01:00",
    });
    expect((await t.repo.getBillingAccount(t.ctx.b))?.id).not.toBe(acc.id);
    expect(ids(await t.repo.listSubscriptions(t.ctx.b))).not.toContain(sub.id);
    expect(await t.repo.getBillingAccount(t.ctx.anonA)).toBeNull();
    await expectContractError(
      t.repo.updateSubscription(t.ctx.b, sub.id, { status: "cancelled" }),
      "NOT_FOUND",
    );
  });
});
