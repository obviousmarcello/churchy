import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { termsForSiteConfig } from "@/i18n/terms";
import { DEMO_SELECTION_COOKIE, DEMO_SESSION_COOKIE } from "@/lib/demo/cookies";
import { encodeSelection } from "@/lib/demo/personas";
import { termRouteTarget } from "@/lib/term-routes";
import { demoDirectory, repositoriesFor } from "./data-adapters";
import { resolveSiteConfig, siteConfigForRequest } from "./site-config";

const directory = demoDirectory();
const tenants = directory.contexts.filter((c) => c.kind === "tenant");
const [catholic, reformed, baptist] = [tenants[0]!, tenants[1]!, tenants[2]!];
const diocese = directory.contexts.find((c) => c.kind === "org")!;

const repos = repositoriesFor(null);
const serviceSchedule = async (context: { tenantId: string } | { orgId: string }) =>
  termsForSiteConfig(await resolveSiteConfig(repos, context)).term("serviceSchedule");

describe("resolveSiteConfig (via the repository interfaces)", () => {
  it("each demo church gets its own denomination, terms, name and theme", async () => {
    const configs = await Promise.all(
      [catholic, reformed, baptist].map((c) => resolveSiteConfig(repos, { tenantId: c.id })),
    );
    expect(configs.map((c) => [c.tenantId, c.name, c.denomination])).toEqual([
      [catholic.id, catholic.name, "rk"],
      [reformed.id, reformed.name, "ref"],
      [baptist.id, baptist.name, "bapt"],
    ]);
    // The seed gives each church its own brand colours.
    expect(new Set(configs.map((c) => c.theme.colors.primary)).size).toBe(3);

    expect((await serviceSchedule({ tenantId: catholic.id })).slug).toBe("miserend");
    expect(await serviceSchedule({ tenantId: reformed.id })).toMatchObject({
      nom: "Istentiszteleti rend",
      slug: "istentiszteleti-rend",
    });
    expect((await serviceSchedule({ tenantId: baptist.id })).slug).toBe("alkalmaink");
  });

  it("the diocese gets the neutral preset and the organization's name", async () => {
    const config = await resolveSiteConfig(repos, { orgId: diocese.id });
    expect(config).toMatchObject({ tenantId: null, denomination: "general" });
    expect(diocese.name).toContain(config.name);
    expect(termsForSiteConfig(config).term("service").lower).not.toContain("mise");
  });

  it("an unknown tenant falls back to the Catholic default", async () => {
    const config = await resolveSiteConfig(repos, { tenantId: "t-nincs-ilyen" });
    expect(config).toMatchObject({ tenantId: null, denomination: "rk" });
  });

  it("follows a church's own term override, per demo session", async () => {
    const sessionRepos = repositoriesFor("site-config-test-session");
    const ctx = { tenantId: reformed.id, actor: { userId: "u-teszt", personId: null } };
    const tenant = (await sessionRepos.tenants.current(ctx))!;
    await sessionRepos.tenants.updateSiteConfig(ctx, {
      ...tenant.siteConfig,
      terminology: {
        serviceSchedule: {
          nom: "Alkalmaink",
          lower: "alkalmaink",
          slug: "alkalmaink",
          article: "az",
        },
      },
    });
    const config = await resolveSiteConfig(sessionRepos, { tenantId: reformed.id });
    expect(termsForSiteConfig(config).term("serviceSchedule").slug).toBe("alkalmaink");
    // Other sessions keep the seed.
    expect((await serviceSchedule({ tenantId: reformed.id })).slug).toBe("istentiszteleti-rend");
  });
});

describe("siteConfigForRequest (the proxy's view of the request)", () => {
  const previous = process.env.DEMO_MODE;
  beforeEach(() => {
    process.env.DEMO_MODE = "1";
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previous;
  });

  const cookies =
    (values: Record<string, string>) =>
    (name: string): string | undefined =>
      values[name];
  const session = { [DEMO_SESSION_COOKIE]: "site-config-proxy-session" };
  const selecting = (contextId: string) => ({
    ...session,
    [DEMO_SELECTION_COOKIE]: encodeSelection({ persona: "latogato", contextId }),
  });

  it("reads the church chosen in the demo switcher", async () => {
    const config = await siteConfigForRequest(cookies(selecting(reformed.id)));
    expect(config.tenantId).toBe(reformed.id);
    const terms = termsForSiteConfig(config);
    expect(termRouteTarget("/istentiszteleti-rend", terms)?.key).toBe("serviceSchedule");
    expect(termRouteTarget("/miserend", terms)).toBeNull();
  });

  it("the diocese selection has no church", async () => {
    const config = await siteConfigForRequest(
      cookies({
        ...session,
        [DEMO_SELECTION_COOKIE]: encodeSelection({ persona: "latogato", contextId: diocese.id }),
      }),
    );
    expect(config).toMatchObject({ tenantId: null, denomination: "general" });
  });

  it("uses the default church without a selection or with a forged one", async () => {
    for (const values of [
      session,
      { ...session, [DEMO_SELECTION_COOKIE]: "%7Bnope" },
      selecting("t-idegen"),
    ]) {
      expect((await siteConfigForRequest(cookies(values))).tenantId).toBe(catholic.id);
    }
  });

  it("outside demo mode the cookie is ignored", async () => {
    process.env.DEMO_MODE = "0";
    const config = await siteConfigForRequest(cookies(selecting(baptist.id)));
    expect(config.tenantId).toBe(directory.defaultTenantId);
  });
});
