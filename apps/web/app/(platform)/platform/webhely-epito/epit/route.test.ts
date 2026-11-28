// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { tenantActor } from "@churchy/policy";
import { DEMO_SELECTION_COOKIE, DEMO_SESSION_COOKIE } from "@/lib/demo/cookies";
import { demoDirectory } from "@/server/data-adapters";
import { resetPolicyAuditSink, setPolicyAuditSink } from "@/server/policy";
import { DEMO_OPERATOR, resetActorResolver, setActorResolver } from "@/server/session";

vi.mock("server-only", () => ({}));
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/platform/webhely-epito/epit", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const lines = async (res: Response) =>
  (await res.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { type: string; code?: string; id?: string });

afterEach(() => {
  resetActorResolver();
  resetPolicyAuditSink();
  vi.unstubAllEnvs();
  jar.clear();
});
void DEMO_SESSION_COOKIE;
void DEMO_SELECTION_COOKIE;

describe("POST /platform/webhely-epito/epit", () => {
  it("is denied to everyone but platform operators (403, empty body, no build)", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    setPolicyAuditSink(() => {});
    const tenant = demoDirectory().defaultTenantId;
    for (const actor of [
      { kind: "anonymous" } as const,
      tenantActor({
        tenantId: tenant,
        userId: "u",
        personId: null,
        websiteRoles: ["owner", "admin"],
        workspaceRoles: [],
      }),
    ]) {
      setActorResolver(() => actor);
      const res = await post({ url: "https://x.example.hu", consent: true });
      expect(res.status).toBe(403);
      expect(await res.text()).toBe("");
    }
  });

  it("is off outside demo mode without the platform database and the key", async () => {
    setActorResolver(() => DEMO_OPERATOR);
    const res = await post({ url: "https://x.example.hu", consent: true });
    expect(res.status).toBe(503);
    expect((await lines(res))[0]).toEqual({ type: "failed", code: "unavailable" });
  });

  it("refuses without the consent field, with a bad address, and on a broken body", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    setActorResolver(() => DEMO_OPERATOR);
    expect(
      (await lines(await post({ url: "https://x.example.hu", consent: false })))[0]!.code,
    ).toBe("no_consent");
    expect((await lines(await post({ url: "https://x.example.hu" })))[0]!.code).toBe("no_consent");
    expect((await lines(await post({ url: "javascript:alert(1)", consent: true })))[0]!.code).toBe(
      "invalid_url",
    );
    expect((await lines(await post("not json")))[0]!.code).toBe("invalid_request");
  });

  it("demo mode streams the stages and stores a draft from the fixture site, never the network", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    setActorResolver(() => DEMO_OPERATOR);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await post({
      url: "https://valodi-egyhaz.example.hu",
      consent: true,
      note: "Kérte az iroda.",
    });
    expect(res.status).toBe(200);
    const events = await lines(res);
    expect(events.filter((e) => e.type === "stage").length).toBeGreaterThan(6);
    const last = events.at(-1)!;
    expect(last.type).toBe("draft");
    expect(last.id).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
