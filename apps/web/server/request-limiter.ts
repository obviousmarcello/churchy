import { createHash } from "node:crypto";
import { createRateLimiter, type RateLimiter } from "@/lib/requests/rate-limit";

/**
 * The process-wide rate limiter of the public request forms (D-28 AC3) and the key it uses:
 * tenant + a salted hash of the client IP (SDD §13: the address itself is never stored).
 */
const GLOBAL = "__churchyRequestLimiter";

export function requestLimiter(): RateLimiter {
  const store = globalThis as unknown as Record<string, RateLimiter | undefined>;
  return (store[GLOBAL] ??= createRateLimiter());
}

/** The first address of `x-forwarded-for` (set by the edge proxy), or a fixed local marker. */
export function clientAddress(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && forwarded !== "" ? forwarded : "local";
}

export function limiterKey(tenantId: string, address: string): string {
  const salt = process.env["REQUEST_HASH_SALT"] ?? "churchy-demo-salt";
  const hash = createHash("sha256").update(`${salt}|${address}`).digest("hex").slice(0, 32);
  return `${tenantId}|${hash}`;
}

/** The render time stamped into a request form for the time-trap (ms since epoch). */
export const renderStamp = (): number => Date.now();
