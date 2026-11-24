/**
 * In-memory stand-in for Supabase Storage in the music module's local mode (demo, Phase A, e2e):
 * the requests storage-js sends (`createSignedUploadUrl`, the signed PUT of the browser,
 * `createSignedUrl` and its GET, `download`, `info`, `upload`, `remove`). Nothing is persisted;
 * files are kept per process up to `MAX_BYTES` (the oldest go first). Keys are the full object
 * keys (`t/<tenant>/<path>`, prefixed by the client's `tenantStorageFetch`). Seeded demo files
 * (`seedLocalFile`) are found by their file name for every session's copy of a church, so the
 * per-session copies of the demo songs keep their fictitious files.
 */
import { randomBytes } from "node:crypto";

interface StoredFile {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}
interface Ticket {
  readonly bucket: string;
  readonly key: string;
  readonly kind: "upload" | "read";
  readonly expires: number;
}

const MAX_BYTES = 200 * 1024 * 1024;
const TICKET_MS = 2 * 60 * 60 * 1000;

const KEY = Symbol.for("churchy.db.localStorage");
type State = {
  files: Map<string, StoredFile>;
  seed: Map<string, StoredFile>;
  tickets: Map<string, Ticket>;
  bytes: number;
};
function state(): State {
  const g = globalThis as typeof globalThis & { [KEY]?: State };
  g[KEY] ??= { files: new Map(), seed: new Map(), tickets: new Map(), bytes: 0 };
  return g[KEY];
}

const id = (bucket: string, key: string) => `${bucket}/${key}`;
/** Where a seeded file is found: its file name (a fresh uuid), whatever tenant and song the copy has. */
const seedKey = (key: string) => key.slice(key.lastIndexOf("/") + 1);

function put(bucket: string, key: string, file: StoredFile): void {
  const s = state();
  const old = s.files.get(id(bucket, key));
  if (old) s.bytes -= old.bytes.byteLength;
  s.files.set(id(bucket, key), file);
  s.bytes += file.bytes.byteLength;
  for (const [k, f] of s.files) {
    if (s.bytes <= MAX_BYTES) break;
    s.files.delete(k);
    s.bytes -= f.bytes.byteLength;
  }
}

function get(bucket: string, key: string): StoredFile | undefined {
  const s = state();
  return s.files.get(id(bucket, key)) ?? s.seed.get(id(bucket, seedKey(key)));
}

/** A fictitious demo file, found under every tenant prefix (`bucket`, tenant-relative `path`). */
export function seedLocalFile(
  bucket: string,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): void {
  state().seed.set(id(bucket, seedKey(path)), { bytes, contentType });
}

function ticket(bucket: string, key: string, kind: Ticket["kind"]): string {
  const token = randomBytes(18).toString("base64url");
  state().tickets.set(token, { bucket, key, kind, expires: Date.now() + TICKET_MS });
  return token;
}

function useTicket(
  token: string | null,
  bucket: string,
  key: string,
  kind: Ticket["kind"],
): boolean {
  if (!token) return false;
  const t = state().tickets.get(token);
  if (!t || t.expires < Date.now() || t.bucket !== bucket || t.key !== key || t.kind !== kind)
    return false;
  if (kind === "upload") state().tickets.delete(token);
  return true;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const notFound = () =>
  json(404, { statusCode: "404", error: "not_found", message: "Object not found" });

async function bodyOf(request: Request): Promise<StoredFile> {
  const type = request.headers.get("content-type") ?? "application/octet-stream";
  if (type.startsWith("multipart/form-data")) {
    const form = await request.formData();
    const file = [...form.values()].find((v): v is File => typeof v !== "string");
    if (!file) throw new Error("no file in the form");
    return {
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
    };
  }
  return { bytes: new Uint8Array(await request.arrayBuffer()), contentType: type };
}

function fileResponse(file: StoredFile, download: string | null): Response {
  const headers: Record<string, string> = {
    "content-type": file.contentType,
    "content-length": String(file.bytes.byteLength),
    "cache-control": "private, no-store",
  };
  if (download !== null) {
    headers["content-disposition"] =
      `attachment; filename*=UTF-8''${encodeURIComponent(download || "file")}`;
  }
  return new Response(file.bytes as unknown as BodyInit, { status: 200, headers });
}

/**
 * Answers one Storage request. `basePath` is the client's path before `/storage/v1` (the local
 * client lives under an app route, so the browser can use the signed URLs). `browser`: the request
 * comes from outside (signed URLs only).
 */
export async function localStorageRequest(request: Request, browser = false): Promise<Response> {
  const url = new URL(request.url);
  const at = url.pathname.indexOf("/storage/v1/object/");
  if (at < 0) return notFound();
  const rest = decodeURIComponent(url.pathname.slice(at + "/storage/v1/object/".length));
  const m = /^(sign\/|upload\/sign\/|info\/|authenticated\/)?([^/]+)\/?(.*)$/.exec(rest);
  if (!m) return notFound();
  const [, op = "", bucket = "", key = ""] = m;
  const method = request.method;
  const token = url.searchParams.get("token");

  if (op === "upload/sign/" && method === "POST" && !browser) {
    const t = ticket(bucket, key, "upload");
    return json(200, { url: `/object/upload/sign/${bucket}/${key}?token=${t}` });
  }
  if (op === "upload/sign/" && method === "PUT") {
    if (!useTicket(token, bucket, key, "upload"))
      return json(400, { statusCode: "403", message: "invalid token" });
    if (get(bucket, key) && request.headers.get("x-upsert") !== "true") {
      return json(400, { statusCode: "409", message: "The resource already exists" });
    }
    put(bucket, key, await bodyOf(request));
    return json(200, { Key: `${bucket}/${key}` });
  }
  if (op === "sign/" && method === "POST" && !browser) {
    if (!get(bucket, key)) return notFound();
    return json(200, {
      signedURL: `/object/sign/${bucket}/${key}?token=${ticket(bucket, key, "read")}`,
    });
  }
  if (op === "sign/" && method === "GET") {
    const file = get(bucket, key);
    if (!file || !useTicket(token, bucket, key, "read")) return notFound();
    return fileResponse(file, url.searchParams.get("download"));
  }
  if (browser) return notFound();
  if (op === "info/" && method === "GET") {
    const file = get(bucket, key);
    return file
      ? json(200, { size: file.bytes.byteLength, content_type: file.contentType, name: key })
      : notFound();
  }
  if ((op === "" || op === "authenticated/") && method === "GET") {
    const file = get(bucket, key);
    return file ? fileResponse(file, null) : notFound();
  }
  if (op === "" && (method === "POST" || method === "PUT") && key) {
    put(bucket, key, await bodyOf(request));
    return json(200, { Key: `${bucket}/${key}`, Id: key });
  }
  if (op === "" && method === "DELETE" && !key) {
    const { prefixes } = (await request.json()) as { prefixes: string[] };
    const s = state();
    const removed = prefixes.filter((p) => {
      const file = s.files.get(id(bucket, p));
      if (file) s.bytes -= file.bytes.byteLength;
      return s.files.delete(id(bucket, p));
    });
    return json(
      200,
      removed.map((name) => ({ name, bucket_id: bucket })),
    );
  }
  return json(400, { statusCode: "400", message: `unsupported storage request ${method} ${rest}` });
}
