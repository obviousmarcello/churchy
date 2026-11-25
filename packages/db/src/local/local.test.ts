import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { DEMO_TENANT_IDS } from "@churchy/data-mock";
import { DEFAULT_SESSION, localDatabase, localId, type LocalDatabase } from "./database";
import { loadCatalog, localPostgrestFetch, parseSelect, type Catalog } from "./postgrest";
import { localSqlSource } from "./sql-source";
import { localStorageRequest, seedLocalFile } from "./storage";
import { readFileSync } from "node:fs";

let db: LocalDatabase;
let catalog: Promise<Catalog>;

function client(tenantId: string): SupabaseClient {
  const fetch = localPostgrestFetch({
    db,
    catalog: () => catalog,
    role: "churchy_music",
    claims: { iss: "churchy", sub: localId("u-demo"), tenant_id: tenantId, role: "churchy_music" },
  });
  return createClient("http://music.local", "local", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
}

beforeAll(async () => {
  db = await localDatabase(new Date("2026-11-24T10:00:00Z"));
  catalog = loadCatalog(db);
}, 120_000);

describe("sql.generated.ts", () => {
  it("matches the migrations (pnpm --filter @churchy/db local:sql)", () => {
    expect(readFileSync(new URL("./sql.generated.ts", import.meta.url), "utf8")).toBe(
      localSqlSource(),
    );
  });
});

describe("parseSelect", () => {
  it("parses columns, aliases and embeds", () => {
    expect(parseSelect("id, song:songs!inner (id, title), arrangements(id)")).toEqual([
      { kind: "column", name: "id", alias: "id" },
      {
        kind: "embed",
        rel: "songs",
        alias: "song",
        hint: null,
        inner: true,
        items: [
          { kind: "column", name: "id", alias: "id" },
          { kind: "column", name: "title", alias: "title" },
        ],
      },
      {
        kind: "embed",
        rel: "arrangements",
        alias: "arrangements",
        hint: null,
        inner: false,
        items: [{ kind: "column", name: "id", alias: "id" }],
      },
    ]);
  });
});

describe("local PostgREST", () => {
  it("reads a tenant's songs with embedded arrangements, count and single objects", async () => {
    const tenant = await db.tenantFor(DEFAULT_SESSION, DEMO_TENANT_IDS.catholic);
    const music = client(tenant);
    const { data, error, count } = await music
      .from("songs")
      .select("id, title, arrangements (id, name, is_default)", { count: "exact" })
      .order("title")
      .range(0, 1);
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(count).toBeGreaterThanOrEqual(data!.length);
    expect(Array.isArray(data![0]!.arrangements)).toBe(true);

    const one = await music.from("songs").select("id").eq("id", data![0]!.id).maybeSingle();
    expect(one.data).toEqual({ id: data![0]!.id });
    const none = await music.from("songs").select("id").eq("id", localId("nothing")).maybeSingle();
    expect(none).toMatchObject({ data: null, error: null });

    const arr = await music
      .from("arrangements")
      .select("id, song_id, song:songs (id, title)")
      .limit(1)
      .single();
    expect(arr.error).toBeNull();
    expect(arr.data!.song).toMatchObject({ id: arr.data!.song_id });
  });

  it("writes through RLS and keeps sessions apart", async () => {
    const shared = await db.tenantFor(DEFAULT_SESSION, DEMO_TENANT_IDS.catholic);
    const mine = await db.tenantFor("s-test", DEMO_TENANT_IDS.catholic);
    expect(mine).not.toBe(shared);
    const music = client(mine);
    const inserted = await music
      .from("songs")
      .insert({ title: "Teszt ének" })
      .select("id, title")
      .single();
    expect(inserted.error).toBeNull();
    const updated = await music
      .from("songs")
      .update({ artist: "Valaki" })
      .eq("id", inserted.data!.id)
      .select("artist");
    expect(updated.data).toEqual([{ artist: "Valaki" }]);
    const elsewhere = await client(shared).from("songs").select("id").eq("id", inserted.data!.id);
    expect(elsewhere.data).toEqual([]);
    const foreign = await music.from("songs").insert({ title: "x", tenant_id: shared });
    expect(foreign.error?.code).toBe("42501");
    const shared1 = await music.rpc("shared_song_rights", {
      p_title: "Teszt ének",
      p_authors: null,
      p_copyright: null,
    });
    expect(shared1.data).toEqual([]);
    await music
      .from("songs")
      .update({ authors: "Kitalált Szerző", copyright: "CCLI 7654321" })
      .eq("id", inserted.data!.id);
    const shared2 = await client(shared).rpc("shared_song_rights", {
      p_title: "x",
      p_authors: null,
      p_copyright: "CCLI 7654321",
    });
    expect(shared2.data).toMatchObject([{ authors: "Kitalált Szerző", ccli_number: "7654321" }]);
    const deleted = await music.from("songs").delete().eq("id", inserted.data!.id).select("id");
    expect(deleted.data).toHaveLength(1);
    await db.dropSession("s-test");
  });

  it("calls functions and reports unsupported shapes", async () => {
    const tenant = await db.tenantFor(DEFAULT_SESSION, DEMO_TENANT_IDS.catholic);
    const music = client(tenant);
    const key = await music.rpc("canonical_key", { p_key: "Asz", p_notation: "hu" });
    expect(key.error).toBeNull();
    const found = await music.rpc("filter_songs", {
      p_query: "aldas",
      p_key: null,
      p_time_signature: null,
      p_bpm_min: null,
      p_bpm_max: null,
      p_tag: null,
      p_sort: "title",
      p_limit: 10,
      p_offset: 0,
    });
    expect(found.error).toBeNull();
    expect(found.data).toMatchObject({ total: expect.any(Number) });
    const bad = await music
      .from("songs")
      .select("id")
      .filter("and", "eq", "(title.eq.a,title.eq.b)");
    expect(bad.error?.message).toMatch(/unsupported/);
    // A top-level `or` (also with an `and(…)` term) is supported.
    const either = await music
      .from("songs")
      .select("id")
      .or("title.eq.nincs-ilyen,and(title.eq.x,artist.is.null)");
    expect(either.error).toBeNull();
    expect(either.data).toEqual([]);
    // Array values with commas inside an `or` term.
    const arrays = await music
      .from("events")
      .select("id")
      .or("and(is_private.is.false,area_ids.ov.{a1,b2}),created_by.eq.u");
    expect(arrays.error?.message ?? "").not.toMatch(/unsupported/);
  });
});

describe("local Storage", () => {
  const storage = () =>
    createClient("http://music.local/base", "local", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => localStorageRequest(new Request(input, init)) },
    }).storage.from("pdfs");

  it("signs an upload, takes the browser's PUT once, signs a download and removes", async () => {
    const up = await storage().createSignedUploadUrl("t/x/a.pdf");
    expect(up.error).toBeNull();
    const put = () =>
      localStorageRequest(
        new Request(up.data!.signedUrl, { method: "PUT", body: "%PDF-1.4" }),
        true,
      );
    expect((await put()).status).toBe(200);
    expect((await put()).status).toBe(400); // one-time ticket
    const info = await storage().info("t/x/a.pdf");
    expect(info.data?.size).toBe(8);
    const signed = await storage().createSignedUrl("t/x/a.pdf", 60, { download: "a.pdf" });
    const got = await localStorageRequest(new Request(signed.data!.signedUrl), true);
    expect(await got.text()).toBe("%PDF-1.4");
    expect(got.headers.get("content-disposition")).toContain("a.pdf");
    // Without the ticket, a browser gets nothing.
    expect(
      (
        await localStorageRequest(
          new Request("http://music.local/base/storage/v1/object/pdfs/t/x/a.pdf"),
          true,
        )
      ).status,
    ).toBe(404);
    expect((await storage().remove(["t/x/a.pdf"])).data).toHaveLength(1);
    expect((await storage().info("t/x/a.pdf")).error).not.toBeNull();
  });

  it("finds a seeded demo file under any tenant and song", async () => {
    seedLocalFile("pdfs", "song-a/file-1.pdf", new TextEncoder().encode("demo"), "application/pdf");
    const file = await storage().download("t/any/song-b/file-1.pdf");
    expect(await file.data?.text()).toBe("demo");
  });
});
