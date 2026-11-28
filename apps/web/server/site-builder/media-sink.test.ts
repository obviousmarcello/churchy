// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { verifyTenantToken } from "@/server/music/tenant-token";
import {
  SITE_MEDIA_BUCKET,
  SITE_MEDIA_DB_ROLE,
  SupabaseMediaSink,
  mediaStorageKey,
  supabaseSinkConfigured,
} from "./media-sink";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U = "22222222-2222-4222-8222-222222222222";
const SECRET = "x".repeat(40);
const env = {
  SUPABASE_URL: "https://proj.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk_test",
  SUPABASE_JWT_SECRET: SECRET,
};
const ctx = { tenantId: T, actor: { userId: U, personId: null } };
const KEY = `t/${T}/media/00000000-0000-4000-8000-000000000001.webp`;

afterEach(() => vi.unstubAllGlobals());

describe("SupabaseMediaSink (fake Storage over fetch)", () => {
  it("uploads with a tenant token of the site media role, to the media bucket, without upsert", async () => {
    const calls: { url: string; method: string; auth: string; upsert: string | null }[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      calls.push({
        url: req.url,
        method: req.method,
        auth: req.headers.get("authorization") ?? "",
        upsert: req.headers.get("x-upsert"),
      });
      return new Response(JSON.stringify({ Key: "k" }), { status: 200 });
    });
    await new SupabaseMediaSink(U, env).put(ctx, KEY, Buffer.from("webp"));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${env.SUPABASE_URL}/storage/v1/object/${SITE_MEDIA_BUCKET}/${KEY}`);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.upsert).toBe("false");
    const claims = verifyTenantToken(calls[0]!.auth.replace("Bearer ", ""), SECRET)!;
    expect(claims).toMatchObject({
      tenant_id: T,
      role: SITE_MEDIA_DB_ROLE,
      sub: U,
      iss: "churchy",
    });
  });

  it("a failed upload throws without leaking the response body", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ message: "SECRET-DETAIL", statusCode: "403" }), {
          status: 403,
        }),
    );
    const err = await new SupabaseMediaSink(U, env).put(ctx, KEY, Buffer.from("x")).catch((e) => e);
    expect(String(err.message)).not.toMatch(/SECRET-DETAIL|webp/);
  });

  it("refuses foreign keys before any request and reports removal failures as keys", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const sink = new SupabaseMediaSink(U, env);
    const other = KEY.replace(T, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    await expect(sink.put(ctx, other, Buffer.from("x"))).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await sink.remove(ctx, [KEY])).toEqual([KEY]);
    expect(await sink.remove(ctx, [])).toEqual([]);
  });

  it("is configured only with URL, key and secret; keys follow the tenant layout", () => {
    expect(supabaseSinkConfigured(env)).toBe(true);
    expect(supabaseSinkConfigured({ ...env, SUPABASE_JWT_SECRET: "" })).toBe(false);
    expect(mediaStorageKey(ctx, "00000000-0000-4000-8000-000000000001")).toBe(KEY);
  });
});
