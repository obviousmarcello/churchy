import { expect, it } from "vitest";
import type { Ctx } from "../../ctx";
import type { OrgLink, OrganizationRepo } from "../../modules/organizations";
import { defineContractSuite, expectContractError, ids, uniq } from "../harness";

/** Ensures an active link between the org and the tenant of `tenantCtx`; returns it. */
export async function activeLink(
  repo: OrganizationRepo,
  orgCtx: Ctx,
  tenantCtx: Ctx,
  tenantId: string,
): Promise<OrgLink> {
  const existing = (await repo.listLinks(tenantCtx)).find(
    (l) => l.orgId === orgCtx.orgId && l.status !== "revoked",
  );
  const link = existing ?? (await repo.requestLink(orgCtx, { tenantId }));
  return link.status === "active" ? link : repo.approveLink(tenantCtx, link.id);
}

export const organizationsContract = defineContractSuite("organizations", (t) => {
  it("resolves the organization of an org context only", async () => {
    const org = await t.repo.current(t.ctx.org);
    expect(org?.id).toBe(t.env.orgId);
    expect(await t.repo.current(t.ctx.a)).toBeNull();
    const created = await t.repo.create(t.ctx.platform, {
      kind: "egyhazmegye",
      name: "Teszt Egyházmegye",
      slug: uniq("egyhazmegye"),
      denomination: "rk",
    });
    expect((await t.repo.findBySlug(t.ctx.platform, created.slug))?.id).toBe(created.id);
    await expectContractError(
      t.repo.create(t.ctx.platform, { ...created, slug: created.slug }),
      "CONFLICT",
    );
    await expectContractError(
      t.repo.create(t.ctx.platform, {
        kind: "puspokseg" as never,
        name: "X",
        slug: uniq("x"),
        denomination: "rk",
      }),
      "VALIDATION",
    );
    await expectContractError(t.repo.create(t.ctx.a, { ...created, slug: uniq("y") }), "CONTEXT");
  });

  it("links a parish only after both sides approve; either side can revoke", async () => {
    for (const l of await t.repo.listLinks(t.ctx.a)) {
      if (l.orgId === t.env.orgId && l.status !== "revoked") await t.repo.revokeLink(t.ctx.a, l.id);
    }
    const requested = await t.repo.requestLink(t.ctx.org, { tenantId: t.env.tenantA });
    expect(requested).toMatchObject({
      status: "requested",
      orgId: t.env.orgId,
      tenantId: t.env.tenantA,
    });
    expect(requested.approvedByOrg).not.toBeNull();
    await expectContractError(
      t.repo.requestLink(t.ctx.org, { tenantId: t.env.tenantA }),
      "CONFLICT",
    );
    const active = await t.repo.approveLink(t.ctx.a, requested.id);
    expect(active.status).toBe("active");
    expect(active.linkedAt).not.toBeNull();
    const status = await t.repo.listParishStatus(t.ctx.org);
    const parish = status.find((p) => p.tenantId === t.env.tenantA);
    expect(parish?.linkStatus).toBe("active");
    expect(Object.keys(parish ?? {}).sort()).toEqual([
      "launched",
      "linkStatus",
      "name",
      "slug",
      "tenantId",
    ]);
    const revoked = await t.repo.revokeLink(t.ctx.a, requested.id);
    expect(revoked.status).toBe("revoked");
  });

  it("lets only the parish set delegations", async () => {
    await activeLink(t.repo, t.ctx.org, t.ctx.a, t.env.tenantA);
    const key = uniq("szabadsag");
    const delegations = await t.repo.setDelegations(t.ctx.a, t.env.orgId, [key]);
    expect(delegations).toEqual([
      { orgId: t.env.orgId, tenantId: t.env.tenantA, hrCategoryKey: key },
    ]);
    expect((await t.repo.listDelegations(t.ctx.org)).map((d) => d.hrCategoryKey)).toContain(key);
    await expectContractError(t.repo.setDelegations(t.ctx.org, t.env.orgId, ["*"]), "CONTEXT");
  });

  it("manages members and deals", async () => {
    const member = await t.repo.upsertMember(t.ctx.org, {
      userId: t.env.orgActor.userId,
      roles: ["orgHrAdmin"],
    });
    expect(member).toMatchObject({ orgId: t.env.orgId, categoryScopes: null, parishScopes: null });
    await expectContractError(
      t.repo.upsertMember(t.ctx.org, { userId: t.env.orgActor.userId, roles: [] }),
      "VALIDATION",
    );
    const deal = await t.repo.upsertDeal(t.ctx.platform, t.env.orgId, {
      planKeys: ["teljes"],
      parishLimit: 50,
      priceTerms: { monthlyPerParish: 4900, yearlyPerParish: null, note: null },
      validFrom: "2027-01-01",
      validTo: "2027-12-31",
    });
    expect(ids(await t.repo.listDeals(t.ctx.org))).toContain(deal.id);
    await expectContractError(
      t.repo.upsertDeal(t.ctx.platform, t.env.orgId, {
        planKeys: ["teljes"],
        parishLimit: 5,
        priceTerms: { monthlyPerParish: null, yearlyPerParish: null, note: null },
        validFrom: "2027-12-31",
        validTo: "2027-01-01",
      }),
      "VALIDATION",
    );
  });

  it("keeps links and delegations scoped to their tenant", async () => {
    const link = await activeLink(t.repo, t.ctx.org, t.ctx.a, t.env.tenantA);
    expect(ids(await t.repo.listLinks(t.ctx.b))).not.toContain(link.id);
    expect((await t.repo.listDelegations(t.ctx.b)).some((d) => d.tenantId === t.env.tenantA)).toBe(
      false,
    );
    await expectContractError(t.repo.approveLink(t.ctx.b, link.id), "NOT_FOUND");
    await expectContractError(t.repo.revokeLink(t.ctx.b, link.id), "NOT_FOUND");
    expect(await t.repo.listMembers(t.ctx.a)).toEqual([]);
    expect(await t.repo.listDeals(t.ctx.a)).toEqual([]);
  });
});
