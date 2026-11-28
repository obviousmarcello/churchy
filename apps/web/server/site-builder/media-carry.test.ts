// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import sharp from "sharp";
import type { FetchResult } from "./fetcher";
import type { SiteDraft, DraftImage } from "./draft-schema";
import { MemoryMediaSink } from "./media-sink";
import {
  MEDIA_MAX_SIDE_PX,
  mediaFilename,
  prepareImages,
  reencode,
  storeImages,
  type ImageFetcher,
} from "./media-carry";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ctx = { tenantId: T, actor: { userId: null, personId: null } };

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#7a1f2b" } })
    .png()
    .toBuffer();

const img = (id: string, extra: Partial<DraftImage> = {}): DraftImage => ({
  id,
  sourceUrl: `https://plebania.example.hu/img/${id}.png`,
  pageUrls: [],
  alt: `Kép ${id}`,
  role: "content",
  width: null,
  height: null,
  include: true,
  offsite: false,
  mayShowPeople: false,
  ...extra,
});
const draftWith = (images: DraftImage[]) => ({ images }) as SiteDraft;

const ok = (body: Buffer): FetchResult => ({
  ok: true,
  url: "https://plebania.example.hu/x",
  status: 200,
  contentType: "image/png",
  body,
  redirects: [],
});

describe("reencode", () => {
  it("makes webp, caps the longest side and strips EXIF/metadata", async () => {
    const withExif = await sharp({
      create: { width: 3000, height: 1000, channels: 3, background: "#fff" },
    })
      .withExif({ IFD0: { Copyright: "Titkos Szerző", Artist: "Valaki" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const out = await reencode(withExif);
    expect(out).not.toBeNull();
    const meta = await sharp(out!.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.width).toBe(MEDIA_MAX_SIDE_PX);
    expect(meta.height).toBe(800);
    expect(out!.data.includes(Buffer.from("Titkos"))).toBe(false);
  });

  it("does not enlarge small images and refuses garbage and SVG", async () => {
    const out = await reencode(await png(10, 6));
    expect(out).toMatchObject({ width: 10, height: 6 });
    expect(await reencode(Buffer.from("nem kép"))).toBeNull();
    expect(
      await reencode(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"/>')),
    ).toBeNull();
  });
});

describe("mediaFilename", () => {
  it("slugs the source file name", () => {
    expect(mediaFilename("https://x.example.hu/img/Templom%20Bel%C3%BCl.JPG?v=2")).toBe(
      "templom-belul.webp",
    );
    expect(mediaFilename("https://x.example.hu/")).toBe("kep.webp");
    expect(mediaFilename("nonsense")).toBe("kep.webp");
  });
});

describe("prepareImages", () => {
  it("fetches only kept, on-site images through the given fetcher and counts failures", async () => {
    const seen: string[] = [];
    const good = await png(20, 20);
    const fetcher: ImageFetcher = {
      async fetchImage(url) {
        seen.push(url);
        if (url.includes("bad")) return { ok: false, code: "bad_status", url, status: 404 };
        if (url.includes("junk")) return ok(Buffer.from("junk"));
        if (url.includes("throws")) throw new Error("socket");
        return ok(good);
      },
    };
    const res = await prepareImages(
      draftWith([
        img("a"),
        img("people", { mayShowPeople: true }),
        img("off", { offsite: true }),
        img("dropped", { include: false }),
        img("bad"),
        img("junk"),
        img("throws"),
        img("empty-alt", { alt: "  " }),
      ]),
      fetcher,
    );
    expect(res.prepared.map((p) => p.draftImageId)).toEqual(["a", "people", "empty-alt"]);
    expect(res.failed).toBe(3);
    expect(seen.some((u) => u.includes("/off.") || u.includes("/dropped."))).toBe(false);
    expect(res.prepared[2]!.alt).toBeNull();
    expect(res.prepared[0]!.data.subarray(8, 12).toString()).toBe("WEBP");
  });
});

describe("storeImages", () => {
  it("uploads under t/<tenant>/media/<uuid>.webp and skips a failed upload", async () => {
    const data = (await reencode(await png(8, 8)))!.data;
    const prepared = ["a", "b"].map((id, i) => ({
      draftImageId: id,
      filename: `${id}.webp`,
      alt: i === 0 ? "Kép" : null,
      width: 8,
      height: 8,
      data,
    }));
    const sink = new MemoryMediaSink();
    const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
    sink.failOn = new Set([sink.keyFor(ctx, ids[1]!)]);
    let n = 0;
    const res = await storeImages(ctx, prepared, sink, () => ids[n++]!);
    expect(res.failed).toBe(1);
    expect(res.stored).toHaveLength(1);
    expect(res.stored[0]).toMatchObject({
      id: ids[0],
      storageKey: `t/${T}/media/${ids[0]}.webp`,
      mimeType: "image/webp",
      decorative: false,
      alt: "Kép",
    });
    expect([...sink.objects.keys()]).toEqual([`t/${T}/media/${ids[0]}.webp`]);
    expect(res.keys).toEqual([...sink.objects.keys()]);
  });

  it("the memory sink refuses another tenant's or a non-media key", async () => {
    const sink = new MemoryMediaSink();
    const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await expect(
      sink.put(ctx, `t/${other}/media/00000000-0000-4000-8000-000000000001.webp`, Buffer.from("x")),
    ).rejects.toThrow();
    await expect(sink.put(ctx, `t/${T}/pdf/x.webp`, Buffer.from("x"))).rejects.toThrow();
  });
});
