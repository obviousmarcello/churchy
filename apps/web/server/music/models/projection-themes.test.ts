// @vitest-environment node
import huMessages from "@messages/hu.json";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  /** The result of the next `rpc()`. */
  rpcResult: {
    data: true as unknown,
    error: null as { code: string; hint: string; message: string } | null,
  },
  rpcs: [] as { name: string; args: Record<string, unknown> }[],
  /** The row of `maybeSingle()`. */
  row: null as Record<string, unknown> | null,
  /** The removed files, by bucket. */
  removed: [] as { bucket: string; paths: string[] }[],
  uploaded: [] as { bucket: string; path: string }[],
  signed: [] as { path: string; seconds: number }[],
  /** The stored files, by path. */
  files: new Map<string, Uint8Array<ArrayBuffer>>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/i18n/music/server", () => ({ getRequestI18n: vi.fn() }));
vi.mock("@/server/music/auth", () => ({
  requireEventAdmin: vi.fn(async () => ({ id: "3e4f5a6b-7c8d-4e9f-8a0b-2c3d4e5f6a7b" })),
  requireUser: vi.fn(async () => undefined),
  requireSuperadmin: vi.fn(async () => undefined),
  requirePrivateFileAccess: vi.fn(async () => true),
}));
// The images and the bookkeeping of unused files have their own tests; here only the calls count.
vi.mock("./images", () => ({
  readImageSource: async (file: File | undefined) => file,
  storedImage: async () => ({ bytes: new Uint8Array([1, 2, 3]) }),
}));
vi.mock("./stray-files", () => ({
  startStrayFileUpload: async () => {},
  listOldRows: async () => [],
  removeFilesWithRows: async () => true,
  removeUnusedFiles: async (bucket: string, paths: string[]) => {
    if (paths.length > 0) db.removed.push({ bucket, paths });
  },
  removeUploadedFiles: async (bucket: string, files: { path: string }[]) => {
    if (files.length > 0) db.removed.push({ bucket, paths: files.map((file) => file.path) });
  },
}));
vi.mock("@/server/music/db", () => ({
  getMusicSupabase: async () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: db.row, error: null }),
      };
      return query;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      db.rpcs.push({ name, args });
      return db.rpcResult;
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: async (path: string) => ({
          data: { signedUrl: `https://storage.example/upload/${path}?token=u` },
          error: null,
        }),
        upload: async (path: string) => {
          db.uploaded.push({ bucket, path });
          return { error: null };
        },
        info: async (path: string) => {
          const bytes = db.files.get(path);
          return bytes
            ? { data: { size: bytes.length }, error: null }
            : { data: null, error: { message: "Object not found" } };
        },
        download: (path: string) => ({
          asStream: async () => {
            const bytes = db.files.get(path);
            if (!bytes) return { data: null, error: { message: "Object not found" } };
            return { data: new Blob([bytes]).stream(), error: null };
          },
        }),
        createSignedUrl: async (path: string, seconds: number) => {
          db.signed.push({ path, seconds });
          return { data: { signedUrl: `https://storage.example/${path}?token=t` }, error: null };
        },
      }),
    },
  }),
}));

import { createI18n } from "@/i18n/music/i18n";
import { ValidationError } from "@/server/music/errors";
import {
  getProjectionVideoUrl,
  setProjectionThemeVideo,
  startProjectionVideoUpload,
} from "./projection-themes";

const THEME_ID = "0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d";
const OTHER_ID = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const PATH = `${THEME_ID}/${OTHER_ID}.mp4`;
const OLD_POSTER = `${THEME_ID}/2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a.webp`;
const OLD_VIDEO = `${THEME_ID}/3e4f5a6b-7c8d-4e9f-8a0b-2c3d4e5f6a7b.webm`;
const bytes = (text: string) => new Uint8Array([...text].map((char) => char.charCodeAt(0)));
// The start of an MP4 file: the size of the `ftyp` box, its type and the brand.
const MP4 = new Uint8Array([0, 0, 0, 0x18, ...bytes("ftypisom"), 0, 0, 2, 0]);
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 1, 0x42, 0xf7, 0x81]);
const POSTER = new File([new Uint8Array([0xff, 0xd8, 0xff])], "poster.jpg", { type: "image/jpeg" });

/** The messages of a validation error, in English. */
async function issues(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(ValidationError);
  const i18n = createI18n(huMessages.music);
  return (error as ValidationError).issues.map((issue) => issue.message(i18n));
}

beforeEach(() => {
  db.rpcResult = { data: true, error: null };
  db.rpcs = [];
  db.row = { background_image_path: null, background_video_path: null };
  db.removed = [];
  db.uploaded = [];
  db.signed = [];
  db.files = new Map();
});

describe("startProjectionVideoUpload", () => {
  it("gives a path in the folder of the theme with the extension of the type", async () => {
    const upload = await startProjectionVideoUpload(THEME_ID, "video/webm");
    expect(upload?.path).toMatch(new RegExp(`^${THEME_ID}/[0-9a-f-]{36}\\.webm$`));
    expect(db.rpcs).toEqual([
      {
        name: "start_projection_video_upload",
        args: expect.objectContaining({ p_path: upload?.path, p_max: 5 }),
      },
    ]);
  });

  it("refuses another type, and gives null for a theme that does not exist", async () => {
    expect(await issues(startProjectionVideoUpload(THEME_ID, "video/quicktime"))).toEqual([
      "MP4 vagy WebM videót használj",
    ]);
    db.row = null;
    expect(await startProjectionVideoUpload(THEME_ID, "video/mp4")).toBeNull();
    expect(db.rpcs).toEqual([]);
  });
});

describe("setProjectionThemeVideo", () => {
  it("sets the checked video with its poster, and removes the old background", async () => {
    db.files.set(PATH, MP4);
    db.row = { background_image_path: OLD_POSTER, background_video_path: OLD_VIDEO };
    expect(await setProjectionThemeVideo(THEME_ID, PATH, POSTER)).toBe(true);

    const poster = db.uploaded[0];
    expect(poster).toEqual({
      bucket: "projection-backgrounds",
      path: expect.stringMatching(new RegExp(`^${THEME_ID}/.+\\.webp$`)),
    });
    expect(db.rpcs).toEqual([
      {
        name: "set_projection_theme_video",
        args: { p_theme_id: THEME_ID, p_video_path: PATH, p_poster_path: poster!.path },
      },
    ]);
    expect(db.removed).toEqual([
      { bucket: "projection-backgrounds", paths: [OLD_POSTER] },
      { bucket: "projection-videos", paths: [OLD_VIDEO] },
    ]);
  });

  it("refuses and removes a file that is not a video, or a video of another format than its path", async () => {
    db.files.set(PATH, bytes("%PDF-1.7 lorem ipsum"));
    expect(await issues(setProjectionThemeVideo(THEME_ID, PATH, POSTER))).toEqual([
      "MP4 vagy WebM videót használj",
    ]);
    db.files.set(PATH, WEBM);
    expect(await issues(setProjectionThemeVideo(THEME_ID, PATH, POSTER))).toEqual([
      "MP4 vagy WebM videót használj",
    ]);
    expect(db.removed).toEqual([
      { bucket: "projection-videos", paths: [PATH] },
      { bucket: "projection-videos", paths: [PATH] },
    ]);
    expect(db.rpcs).toEqual([]);
    expect(db.uploaded).toEqual([]);
  });

  it("refuses a video that is too large", async () => {
    const large = new Uint8Array(50 * 1024 * 1024 + 1);
    large.set(MP4);
    db.files.set(PATH, large);
    expect(await issues(setProjectionThemeVideo(THEME_ID, PATH, POSTER))).toEqual([
      "Legfeljebb 50 MB-os videót használj",
    ]);
  });

  it("refuses the upload of another theme, and a missing upload", async () => {
    const message = "A feltöltés nem fejeződött be. Válaszd ki újra a videót.";
    expect(await issues(setProjectionThemeVideo(OTHER_ID, PATH, POSTER))).toEqual([message]);
    expect(await issues(setProjectionThemeVideo(THEME_ID, PATH, POSTER))).toEqual([message]);
  });

  it("removes the video and the poster when the theme does not exist anymore", async () => {
    db.files.set(PATH, MP4);
    db.rpcResult = { data: false, error: null };
    expect(await setProjectionThemeVideo(THEME_ID, PATH, POSTER)).toBe(false);
    expect(db.removed).toEqual([
      { bucket: "projection-backgrounds", paths: [db.uploaded[0]!.path] },
      { bucket: "projection-videos", paths: [PATH] },
    ]);
  });
});

describe("getProjectionVideoUrl", () => {
  it("signs the video of a theme for 12 hours", async () => {
    db.row = { id: THEME_ID };
    expect(await getProjectionVideoUrl(PATH)).toBe(`https://storage.example/${PATH}?token=t`);
    expect(db.signed).toEqual([{ path: PATH, seconds: 12 * 60 * 60 }]);
  });

  it("gives null for a bad path and for a file that no theme has", async () => {
    expect(await getProjectionVideoUrl(`${THEME_ID}/../a.mp4`)).toBeNull();
    db.row = null;
    expect(await getProjectionVideoUrl(PATH)).toBeNull();
    expect(db.signed).toEqual([]);
  });
});
