import { afterEach, describe, expect, it, vi } from "vitest";
import { tenantActor } from "@churchy/policy";
import { createMusicSupabaseClient } from "./supabase";
import { mintTenantToken, verifyTenantToken } from "./tenant-token";

const SECRET = "test-secret-that-is-at-least-32-characters";
const USER = "11111111-1111-4111-8111-111111111111";
const TENANT = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-23T10:00:00Z");
const mint = (over: Partial<Parameters<typeof mintTenantToken>[0]> = {}) =>
  mintTenantToken({
    userId: USER,
    tenantId: TENANT,
    role: "music_role",
    secret: SECRET,
    now: NOW,
    ...over,
  });

describe("tenant token", () => {
  it("round-trips the tenant claim with a 60 s lifetime", () => {
    expect(verifyTenantToken(mint(), SECRET, NOW)).toEqual({
      iss: "churchy",
      aud: "authenticated",
      sub: USER,
      tenant_id: TENANT,
      role: "music_role",
      iat: NOW.getTime() / 1000,
      exp: NOW.getTime() / 1000 + 60,
    });
  });

  it("rejects a wrong secret, a tampered payload, an expired token and garbage", () => {
    const token = mint();
    expect(verifyTenantToken(token, `${SECRET}x`, NOW)).toBeNull();
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ iss: "churchy", tenant_id: USER })).toString(
      "base64url",
    );
    expect(verifyTenantToken(`${h}.${forged}.${s}`, SECRET, NOW)).toBeNull();
    expect(verifyTenantToken(token, SECRET, new Date(NOW.getTime() + 61_000))).toBeNull();
    expect(verifyTenantToken("a.b", SECRET, NOW)).toBeNull();
  });

  it("refuses malformed ids, roles, TTLs and short secrets", () => {
    expect(() => mint({ tenantId: "t-demo" })).toThrow(/uuids/);
    expect(() => mint({ role: "x; drop" })).toThrow(/role/);
    expect(() => mint({ ttlSeconds: 3600 })).toThrow(/ttl/);
    expect(() => mint({ secret: "short" })).toThrow(/secret/);
  });
});

describe("createMusicSupabaseClient", () => {
  const env = {
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_PUBLISHABLE_KEY: "publishable",
    SUPABASE_JWT_SECRET: SECRET,
  };
  const actor = tenantActor({ tenantId: TENANT, userId: USER, personId: null });
  afterEach(() => vi.unstubAllGlobals());

  it("requires a signed-in tenant actor and the Supabase settings", () => {
    expect(() => createMusicSupabaseClient({ kind: "anonymous" }, "music_role", env)).toThrow();
    expect(() =>
      createMusicSupabaseClient({ ...actor, userId: null }, "music_role", env),
    ).toThrow();
    expect(() => createMusicSupabaseClient(actor, "music_role", {})).toThrow(/configured/);
  });

  it("sends the minted tenant token, not the publishable key, as the bearer", async () => {
    const fetch = vi.fn(
      async () => new Response("[]", { headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetch);
    await createMusicSupabaseClient(actor, "music_role", env, NOW).from("songs").select("id");
    const headers = new Headers(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
    );
    const token = headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    expect(verifyTenantToken(token, SECRET, NOW)).toMatchObject({ tenant_id: TENANT, sub: USER });
  });
});
