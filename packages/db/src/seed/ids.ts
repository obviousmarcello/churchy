import { createHash } from "node:crypto";

/**
 * The mock fixtures (D-91) use readable ids (`t-szenttivadar`, `p-…`); the database uses `uuid`.
 * The seed maps every fixture id to a deterministic name-based UUID (RFC 9562 version 5), so the
 * same fixture always gets the same id and re-seeding is repeatable.
 */
const NAMESPACE = "6f0b6c2e-4b1d-5f8a-9c4e-636875726368"; // fixed, Churchy demo namespace

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Deterministic UUIDv5 of `name`; values that already are UUIDs are returned unchanged. */
export function demoUuid(name: string): string {
  if (isUuid(name)) return name.toLowerCase();
  const ns = Buffer.from(NAMESPACE.replaceAll("-", ""), "hex");
  const hash = createHash("sha1").update(ns).update(name, "utf8").digest();
  hash[6] = ((hash[6] as number) & 0x0f) | 0x50; // version 5
  hash[8] = ((hash[8] as number) & 0x3f) | 0x80; // RFC 9562 variant
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Replaces every string that is a known entity id — wherever it occurs (columns, arrays, JSON
 * such as `siteConfig.identity.logoMediaId`, page blocks or approval chains) — by its UUID.
 * Matching on values instead of key names keeps references consistent without a list of id
 * fields; other strings (slugs, keys, text) are never equal to an id because fixture ids carry a
 * type prefix.
 */
export function mapIds<T>(value: T, known: ReadonlySet<string>): T {
  if (typeof value === "string") {
    return (known.has(value) ? demoUuid(value) : value) as T;
  }
  if (Array.isArray(value)) return value.map((v) => mapIds(v, known)) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapIds(v, known);
    return out as T;
  }
  return value;
}
