// @vitest-environment node
/**
 * The platform-db module against a real, DISPOSABLE Postgres (TEST_DATABASE_URL, migrated by
 * `pnpm --filter @churchy/db test`; skipped without it or without the role churchy_platform).
 * The module connects as the platform role (`options=-c role=churchy_platform`), fixtures are
 * written with the owner connection.
 */
import { randomUUID } from "node:crypto";
import { createPlatformPool } from "@churchy/db/platform";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as PlatformDbModule from "./index";

vi.mock("server-only", () => ({}));

const ownerUrl = process.env.TEST_DATABASE_URL;
const unsafe = ["staging", "production"].includes(process.env.APP_ENV ?? "");

describe.skipIf(!ownerUrl || unsafe)("platform-db on a real database", () => {
  const owner = ownerUrl ? createPlatformPool(ownerUrl) : undefined;
  const users: string[] = [];
  const slugs: string[] = [];
  let ready = false;
  let oldEntitlements: unknown;
  let mod: typeof PlatformDbModule;

  beforeAll(async () => {
    const role = await owner!.query("select 1 from pg_roles where rolname = 'churchy_platform'");
    ready = role.rowCount === 1;
    if (!ready) return;
    // The free plan with a valid entitlement document (other suites may have left a placeholder).
    const old = await owner!.query<{ entitlements: unknown }>(
      "select entitlements from plans where key = 'ingyenes'",
    );
    oldEntitlements = old.rows[0]?.entitlements;
    const doc = JSON.stringify({
      customDomain: false,
      storageGb: 1,
      maxEditors: 3,
      modules: ["news"],
      footerCredit: true,
      workspaceAllowed: false,
    });
    await owner!.query(
      `insert into plans (key, name, kind, price_monthly, price_yearly, entitlements)
       values ('ingyenes', 'Ingyenes', 'website', 0, 0, $1::jsonb)
       on conflict (key) do update set entitlements = excluded.entitlements`,
      [doc],
    );
    const url = new URL(ownerUrl!);
    url.searchParams.set("options", "-c role=churchy_platform");
    vi.stubEnv("DATABASE_URL_PLATFORM", url.toString());
    vi.stubEnv("DATABASE_URL", ownerUrl!);
    mod = await import("./index");
  });

  afterAll(async () => {
    for (const slug of slugs) await owner?.query("delete from tenants where slug = $1", [slug]);
    for (const id of users) {
      await owner?.query("delete from profiles where id = $1", [id]);
      await owner?.query("delete from auth.users where id = $1", [id]);
    }
    await owner?.query("delete from audit_log where diff ->> 'via' = 'platform-db'");
    if (ready && oldEntitlements !== undefined) {
      await owner?.query("update plans set entitlements = $1::jsonb where key = 'ingyenes'", [
        JSON.stringify(oldEntitlements),
      ]);
    }
    await owner?.end();
    vi.unstubAllEnvs();
  });

  async function user(): Promise<{ id: string; email: string }> {
    const id = randomUUID();
    const email = `${id}@example.test`;
    await owner!.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
    users.push(id);
    return { id, email };
  }

  it("creates a church, resolves its hosts, profile and entitlements", async (ctx) => {
    if (!ready) return ctx.skip();
    const u = await user();
    const slug = `proba-${u.id.slice(0, 8)}`;
    slugs.push(slug);
    expect(mod.platformDbEnabled()).toBe(true);
    // A miss is cached ...
    expect(await mod.resolveHost(`${slug}.churchy.hu`)).toEqual({ kind: "unknown" });

    const result = await mod.createTenant({
      name: "Próba Plébánia",
      slug,
      denomination: "rk",
      owner: { authUserId: u.id, email: u.email, name: "dr. Próba Péter" },
    });
    expect(result).toMatchObject({ ok: true, slug, profileExisted: false });
    if (!result.ok) return;

    // ... and createTenant invalidates it.
    expect(await mod.resolveHost(`${slug}.churchy.hu`)).toMatchObject({
      kind: "app",
      tenantId: result.tenantId,
      suspended: false,
    });
    const profile = await mod.getProfileByAuthUser(u.id);
    expect(profile).toMatchObject({ id: u.id, email: u.email, orgMemberships: [] });
    const sources = await mod.getEntitlementsRow(result.tenantId);
    expect(sources?.websitePlan.key).toBe("ingyenes");

    const [counts] = (
      await owner!.query(
        `select (select count(*) from memberships where tenant_id = $1 and user_id = $2 and role = 'owner') as m,
                (select count(*) from people where tenant_id = $1 and family_name = 'Próba' and prefix = 'dr.') as p,
                (select count(*) from subscriptions where tenant_id = $1 and plan_key = 'ingyenes') as s,
                (select count(*) from audit_log where tenant_id = $1 and action = 'tenant.create') as a`,
        [result.tenantId, u.id],
      )
    ).rows;
    expect(counts).toEqual({ m: "1", p: "1", s: "1", a: "1" });
  });

  it("reports a duplicate slug and a taken e-mail as results and leaves nothing behind", async (ctx) => {
    if (!ready) return ctx.skip();
    const a = await user();
    const slug = `dup-${a.id.slice(0, 8)}`;
    slugs.push(slug);
    const input = {
      name: "Első",
      slug,
      denomination: "ref" as const,
      owner: { authUserId: a.id, email: a.email, name: "Első Elek" },
    };
    expect(await mod.createTenant(input)).toMatchObject({ ok: true });

    const b = await user();
    expect(
      await mod.createTenant({
        ...input,
        owner: { authUserId: b.id, email: b.email, name: "Második Mari" },
      }),
    ).toEqual({ ok: false, reason: "slug_taken" });
    expect((await owner!.query("select 1 from profiles where id = $1", [b.id])).rowCount).toBe(0);

    const other = `mail-${a.id.slice(0, 8)}`;
    expect(
      await mod.createTenant({
        ...input,
        slug: other,
        owner: { authUserId: b.id, email: a.email, name: "Második Mari" },
      }),
    ).toEqual({ ok: false, reason: "email_taken" });
    expect((await owner!.query("select 1 from tenants where slug = $1", [other])).rowCount).toBe(0);
  });

  it("the same owner can found a second church (profile exists)", async (ctx) => {
    if (!ready) return ctx.skip();
    const a = await user();
    const mk = (slug: string) =>
      mod.createTenant({
        name: "Egyház",
        slug,
        denomination: "gk",
        owner: { authUserId: a.id, email: a.email, name: "Dupla Dénes" },
      });
    const s1 = `egy-${a.id.slice(0, 8)}`;
    const s2 = `ketto-${a.id.slice(0, 8)}`;
    slugs.push(s1, s2);
    expect(await mk(s1)).toMatchObject({ ok: true, profileExisted: false });
    expect(await mk(s2)).toMatchObject({ ok: true, profileExisted: true });
  });
});
