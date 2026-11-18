import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Membership } from "@churchy/contracts";
import type { Action, Actor, WebsiteRole } from "@churchy/policy";
import { orgActor, tenantActor } from "@churchy/policy";
import { DEMO_SELECTION_COOKIE, DEMO_SESSION_COOKIE } from "@/lib/demo/cookies";
import { demoDirectory } from "@/server/data-adapters";
import {
  demoAction,
  publicAction,
  resetPolicyAuditSink,
  setPolicyAuditSink,
  withPolicy,
  withPolicyRoute,
  type PolicyAuditEvent,
} from "./policy";
import { actorFromIdentity, resetActorResolver, setActorResolver } from "./session";

// Request cookies for the demo-session tests (`getDemoState()` reads them via next/headers).
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));

const TENANT = demoDirectory().defaultTenantId;
const OTHER_TENANT = demoDirectory().contexts.find(
  (c) => c.kind === "tenant" && c.id !== TENANT,
)!.id;

let events: PolicyAuditEvent[] = [];
beforeEach(() => {
  events = [];
  setPolicyAuditSink((e) => events.push(e));
});
afterEach(() => {
  resetActorResolver();
  resetPolicyAuditSink();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  jar.clear();
});

const act = (actor: Actor) => setActorResolver(() => actor);

/** A server action guarded by `action` on a resource of the request's tenant. */
function fixture<A extends Action>(action: A, extra: object = {}) {
  const handler = vi.fn(async () => "done");
  const run = withPolicy(
    action,
    ({ context }) => ({ tenantId: context.tenantId, ...extra }) as never,
    handler,
  );
  return { run, handler };
}

/**
 * A membership as the session layer reads it from `memberships` (the same `actorFromIdentity()`
 * the real session resolver uses), for a user in the request's tenant.
 */
function memberActor(role: WebsiteRole, groupIds: string[] = []): Actor {
  const membership: Membership = {
    tenantId: TENANT,
    userId: `user-${role}`,
    role,
    groupIds,
    wsRoles: [],
    teamIds: [],
    roomIds: [],
    hrCategoryIds: [],
    active: true,
    invitedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  return actorFromIdentity({
    kind: "tenant",
    tenantId: TENANT,
    userId: membership.userId,
    personId: `person-${role}`,
    membership,
    teamMembers: [],
    directReportPersonIds: [],
    hrCategories: [],
  });
}

describe("withPolicy — one allow and one deny per website role (server-side)", () => {
  const cases: {
    role: WebsiteRole;
    groups?: string[];
    allow: [Action, object?];
    deny: [Action, object?];
  }[] = [
    { role: "owner", allow: ["site.domain.manage"], deny: ["hr.payroll.export"] },
    { role: "admin", allow: ["site.appearance.edit"], deny: ["site.domain.manage"] },
    { role: "editor", allow: ["news.publish"], deny: ["schedule.edit"] },
    { role: "office", allow: ["schedule.edit"], deny: ["news.publish"] },
    {
      role: "groupLeader",
      groups: ["g-own"],
      allow: ["event.edit", { groupId: "g-own" }],
      deny: ["event.edit", { groupId: "g-other" }],
    },
  ];

  for (const { role, groups, allow, deny } of cases) {
    it(`${role}: allows ${allow[0]}`, async () => {
      act(memberActor(role, groups));
      const { run, handler } = fixture(allow[0], allow[1]);
      expect(await run()).toEqual({ ok: true, value: "done" });
      expect(handler).toHaveBeenCalledOnce();
      expect(events).toEqual([
        expect.objectContaining({ type: "policy.allowed", action: allow[0], tenantId: TENANT }),
      ]);
    });

    it(`${role}: denies ${deny[0]} with 403 and does not run the handler`, async () => {
      act(memberActor(role, groups));
      const { run, handler } = fixture(deny[0], deny[1]);
      expect(await run()).toEqual({ ok: false, status: 403 });
      expect(handler).not.toHaveBeenCalled();
      expect(events).toEqual([
        expect.objectContaining({ type: "policy.denied", status: 403, code: "policy" }),
      ]);
    });
  }

  it("admin may manage users but not owners (resource-dependent decision)", async () => {
    act(memberActor("admin"));
    expect(await fixture("site.users.manage", { targetRoles: ["editor"] }).run()).toMatchObject({
      ok: true,
    });
    expect(await fixture("site.users.manage", { targetRoles: ["owner"] }).run()).toEqual({
      ok: false,
      status: 403,
    });
  });
});

describe("withPolicy — demo sessions through the default session resolver", () => {
  const selectPersona = (persona: string) => {
    vi.stubEnv("DEMO_MODE", "1");
    jar.set(DEMO_SESSION_COOKIE, "00000000-0000-4000-8000-000000000000");
    jar.set(
      DEMO_SELECTION_COOKIE,
      encodeURIComponent(JSON.stringify({ persona, contextId: TENANT })),
    );
  };

  it.each([
    ["szerkeszto", "news.publish", "schedule.edit"],
    ["iroda", "schedule.edit", "news.publish"],
  ] as const)("%s: allows %s, denies %s with 403", async (persona, allowed, denied) => {
    selectPersona(persona);
    expect(await fixture(allowed).run()).toEqual({ ok: true, value: "done" });
    expect(await fixture(denied).run()).toEqual({ ok: false, status: 403 });
  });

  it("tulajdonos: allows site.domain.manage, denies another church's resource with 404", async () => {
    selectPersona("tulajdonos");
    expect(await fixture("site.domain.manage").run()).toEqual({ ok: true, value: "done" });
    const foreign = withPolicy("site.domain.manage", () => ({ tenantId: OTHER_TENANT }), vi.fn());
    expect(await foreign()).toEqual({ ok: false, status: 404 });
  });

  it("the visitor persona is anonymous and denied", async () => {
    selectPersona("latogato");
    expect(await fixture("announcement.create").run()).toEqual({ ok: false, status: 403 });
    expect(events[0]).toMatchObject({ actorKind: "anonymous", code: "policy" });
  });
});

describe("withPolicy — deny by default", () => {
  const owner = () => memberActor("owner");

  it("rejects an action that is not in the policy vocabulary", async () => {
    act(owner());
    const { run, handler } = fixture("site.takeOver" as Action);
    expect(await run()).toEqual({ ok: false, status: 403 });
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects an anonymous actor (no session)", async () => {
    expect(await fixture("news.create").run()).toEqual({ ok: false, status: 403 });
  });

  it("rejects platform actors", async () => {
    act({ kind: "platform", userId: "op-1" });
    expect(await fixture("news.create").run()).toEqual({ ok: false, status: 403 });
  });

  it("answers 404 when the resolver finds nothing", async () => {
    act(owner());
    const handler = vi.fn();
    const run = withPolicy("news.edit", () => null, handler);
    expect(await run()).toEqual({ ok: false, status: 404 });
    expect(handler).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ code: "not_found", status: 404 });
  });

  it("answers 404 when the resolver throws", async () => {
    act(owner());
    const run = withPolicy(
      "news.edit",
      () => {
        throw new Error("boom");
      },
      vi.fn(),
    );
    expect(await run()).toEqual({ ok: false, status: 404 });
    expect(events[0]).toMatchObject({ code: "resolver_error" });
  });

  it("answers 404 for a resource of another tenant", async () => {
    act(owner());
    const run = withPolicy("news.edit", () => ({ tenantId: OTHER_TENANT }), vi.fn());
    expect(await run()).toEqual({ ok: false, status: 404 });
    expect(events[0]).toMatchObject({ code: "foreign_resource" });
  });

  it("answers 404 when the actor belongs to another tenant than the request", async () => {
    act(
      tenantActor({ tenantId: OTHER_TENANT, userId: "u", personId: null, websiteRoles: ["owner"] }),
    );
    const { run, handler } = fixture("news.edit");
    expect(await run()).toEqual({ ok: false, status: 404 });
    expect(handler).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ code: "context_mismatch" });
  });

  it("answers 404 for an organization actor in a tenant request", async () => {
    act(orgActor({ orgId: "org-1", userId: "u", personId: null, orgRoles: ["orgHrAdmin"] }));
    expect(await fixture("news.edit").run()).toEqual({ ok: false, status: 404 });
  });

  it("answers 403 when the session lookup fails", async () => {
    setActorResolver(() => {
      throw new Error("session store down");
    });
    expect(await fixture("news.edit").run()).toEqual({ ok: false, status: 403 });
    expect(events[0]).toMatchObject({ code: "session_error", actorKind: "unknown" });
  });

  it("conceals policy denials as 404 when declared", async () => {
    act(memberActor("editor"));
    const run = withPolicy(
      "schedule.edit",
      ({ context }) => ({ tenantId: context.tenantId! }),
      vi.fn(),
      {
        conceal: true,
      },
    );
    expect(await run()).toEqual({ ok: false, status: 404 });
  });

  it("rejects a malformed resource", async () => {
    act(owner());
    const run = withPolicy("news.edit", () => "x" as never, vi.fn());
    expect(await run()).toEqual({ ok: false, status: 404 });
  });

  it("a failing audit sink never turns a denial into an allow or an error", async () => {
    setPolicyAuditSink(() => {
      throw new Error("sink down");
    });
    expect(await fixture("news.edit").run()).toEqual({ ok: false, status: 403 });
  });
});

describe("withPolicy — scope passed to the handler", () => {
  it("passes the repository ctx, the resource and the action's arguments", async () => {
    act(memberActor("editor"));
    const handler = vi.fn(async (scope: unknown, id: string) => id);
    const run = withPolicy(
      "news.publish",
      ({ context }, id: string) => ({ tenantId: context.tenantId!, id }),
      handler,
    );
    expect(await run("n-1")).toEqual({ ok: true, value: "n-1" });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: { tenantId: TENANT, actor: { userId: "user-editor", personId: "person-editor" } },
        resource: { tenantId: TENANT, id: "n-1" },
      }),
      "n-1",
    );
  });

  it("gives anonymous and platform actors a ctx without a person", async () => {
    act({ kind: "platform", userId: "op-1" });
    const seen: unknown[] = [];
    const run = withPolicy(
      "news.edit",
      (scope) => {
        seen.push(scope.ctx);
        return null;
      },
      vi.fn(),
    );
    await run();
    resetActorResolver();
    await run();
    expect(seen).toEqual([
      { tenantId: TENANT, actor: { userId: "op-1", personId: null } },
      { tenantId: TENANT, actor: { userId: null, personId: null } },
    ]);
  });
});

describe("denial log", () => {
  it("contains no personal data", async () => {
    const lines: string[] = [];
    resetPolicyAuditSink(); // the default sink: structured JSON via console.warn
    vi.spyOn(console, "warn").mockImplementation((line: string) => void lines.push(line));
    act(memberActor("groupLeader", ["g-own"]));
    const run = withPolicy(
      "event.edit",
      ({ context }, input: { title: string; email: string }) => ({
        tenantId: context.tenantId!,
        groupId: `g-${input.title}`,
      }),
      vi.fn(),
    );
    expect(await run({ title: "Kitalált Kálmán", email: "kalman@example.test" })).toEqual({
      ok: false,
      status: 403,
    });

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(entry).toEqual({
      type: "policy.denied",
      action: "event.edit",
      status: 403,
      code: "policy",
      actorKind: "tenant",
      tenantId: TENANT,
      orgId: null,
    });
    for (const secret of [
      "user-groupLeader",
      "person-groupLeader",
      "Kálmán",
      "example.test",
      "g-",
    ]) {
      expect(lines[0]).not.toContain(secret);
    }
  });

  it("does not log allowed decisions by default", async () => {
    resetPolicyAuditSink();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    act(memberActor("owner"));
    await fixture("news.edit").run();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("withPolicyRoute", () => {
  const route = withPolicyRoute(
    "news.delete",
    ({ context }, request: Request) =>
      request.headers.get("x-missing") ? null : { tenantId: context.tenantId! },
    async () => Response.json({ deleted: true }),
  );

  it("runs the handler when allowed", async () => {
    act(memberActor("editor"));
    const res = await route(new Request("http://x/api", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
  });

  it("answers an empty, uncached 403 or 404", async () => {
    act(memberActor("office"));
    const forbidden = await route(new Request("http://x/api", { method: "DELETE" }));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.text()).toBe("");
    expect(forbidden.headers.get("Cache-Control")).toBe("no-store");

    const missing = await route(
      new Request("http://x/api", { method: "DELETE", headers: { "x-missing": "1" } }),
    );
    expect(missing.status).toBe(404);
  });
});

describe("exemptions", () => {
  it("publicAction runs its handler as is", async () => {
    const run = publicAction(async (a: number) => a + 1);
    expect(await run(1)).toBe(2);
  });

  it("demoAction runs in demo mode and in development", async () => {
    const run = demoAction(async () => "ok");
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("HIDE_DEV_ROUTES", "1");
    expect(await run()).toBe("ok");
    vi.stubEnv("DEMO_MODE", "0");
    vi.stubEnv("HIDE_DEV_ROUTES", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(await run()).toBe("ok");
  });

  it("demoAction is a 404 in a production server without demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "0");
    vi.stubEnv("NODE_ENV", "production");
    const handler = vi.fn(async () => "ok");
    await expect(demoAction(handler)()).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
