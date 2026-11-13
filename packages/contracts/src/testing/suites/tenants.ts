import { expect, it } from "vitest";
import { defineContractSuite, expectContractError, ids, uniq } from "../harness";

const hostname = () => `${uniq("plebania")}.example.test`;

export const tenantsContract = defineContractSuite("tenants", (t) => {
  it("returns the ctx tenant (also to anonymous visitors) and nothing for other scopes", async () => {
    expect((await t.repo.current(t.ctx.a))?.id).toBe(t.env.tenantA);
    expect((await t.repo.current(t.ctx.anonA))?.id).toBe(t.env.tenantA);
    expect((await t.repo.current(t.ctx.b))?.id).toBe(t.env.tenantB);
    expect(await t.repo.current(t.ctx.org)).toBeNull();
    expect(await t.repo.current(t.ctx.platform)).toBeNull();
  });

  it("creates tenants from a platform context only", async () => {
    const slug = uniq("teszt");
    const created = await t.repo.create(t.ctx.platform, {
      slug,
      name: "Teszt Református Egyházközség",
      denomination: "ref",
    });
    expect(created).toMatchObject({ slug, status: "active", planKey: "ingyenes", wsTier: "none" });
    expect((await t.repo.findBySlug(t.ctx.platform, slug))?.tenantId).toBe(created.id);
    await expectContractError(
      t.repo.create(t.ctx.platform, { slug, name: "Másik", denomination: "rk" }),
      "CONFLICT",
    );
    await expectContractError(
      t.repo.create(t.ctx.platform, { slug: "Rossz Slug", name: "X", denomination: "rk" }),
      "VALIDATION",
    );
    await expectContractError(t.repo.findBySlug(t.ctx.a, slug), "CONTEXT");
  });

  it("stores site-config overrides and validates them", async () => {
    const updated = await t.repo.updateSiteConfig(t.ctx.a, {
      identity: { shortName: "Belvárosi Plébánia" },
      theme: { themeId: "klasszikus" },
    });
    expect(updated.siteConfig.identity?.shortName).toBe("Belvárosi Plébánia");
    await expectContractError(
      t.repo.updateSiteConfig(t.ctx.a, {
        theme: { colors: { primary: "piros", secondary: "#ffffff" } },
      }),
      "VALIDATION",
    );
    expect((await t.repo.current(t.ctx.b))?.siteConfig.identity?.shortName).not.toBe(
      "Belvárosi Plébánia",
    );
  });

  it("manages domains; only verified ones resolve", async () => {
    const host = hostname();
    const domain = await t.repo.addDomain(t.ctx.a, { hostname: host });
    expect(domain).toMatchObject({
      tenantId: t.env.tenantA,
      verifiedAt: null,
      tlsStatus: "pending",
    });
    expect(await t.repo.findByHostname(t.ctx.platform, host)).toBeNull();
    await t.repo.updateDomain(t.ctx.a, domain.id, {
      verifiedAt: "2026-11-13T10:00:00+01:00",
      tlsStatus: "issued",
    });
    await t.repo.setPrimaryDomain(t.ctx.a, domain.id);
    const resolved = await t.repo.findByHostname(t.ctx.platform, host);
    expect(resolved?.tenantId).toBe(t.env.tenantA);
    expect(resolved?.primaryHostname).toBe(host);
    await expectContractError(t.repo.addDomain(t.ctx.a, { hostname: "nem host" }), "VALIDATION");
  });

  it("keeps domains and redirects tenant-scoped", async () => {
    const host = hostname();
    const domain = await t.repo.addDomain(t.ctx.a, { hostname: host });
    expect(ids(await t.repo.listDomains(t.ctx.b))).not.toContain(domain.id);
    await expectContractError(t.repo.addDomain(t.ctx.b, { hostname: host }), "CONFLICT");
    await expectContractError(t.repo.removeDomain(t.ctx.b, domain.id), "NOT_FOUND");
    await expectContractError(t.repo.setPrimaryDomain(t.ctx.b, domain.id), "NOT_FOUND");
    expect(ids(await t.repo.listDomains(t.ctx.a))).toContain(domain.id);

    const from = `/${uniq("miserend")}`;
    await t.repo.upsertRedirect(t.ctx.a, { fromPath: from, toPath: "/istentiszteleti-rend" });
    expect((await t.repo.findRedirect(t.ctx.anonA, from))?.toPath).toBe("/istentiszteleti-rend");
    expect(await t.repo.findRedirect(t.ctx.anonB, from)).toBeNull();

    await t.repo.removeDomain(t.ctx.a, domain.id);
    expect(ids(await t.repo.listDomains(t.ctx.a))).not.toContain(domain.id);
  });
});
