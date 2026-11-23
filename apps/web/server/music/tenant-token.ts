import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Per-request tenant JWT for the music module (docs/music-merge/PLAN.md §4.2, SDD ADR-20).
 *
 * The music module keeps its supabase-js models; they reach Postgres through PostgREST, which
 * verifies this token with the project's JWT secret and exposes its claims to SQL as
 * `request.jwt.claims`. `app.current_tenant_id()` (migration 0004) reads `tenant_id` from it, but
 * only when `iss` is {@link TENANT_TOKEN_ISSUER}, so the canonical `tenant_isolation` policies
 * apply unchanged. The token is minted on the server after Churchy resolved the actor (session +
 * membership) and never leaves the server.
 */
export const TENANT_TOKEN_ISSUER = "churchy";
/** Short-lived: one request, plus clock skew. */
export const TENANT_TOKEN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 300;
const MIN_SECRET_LENGTH = 32;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE = /^[a-z_][a-z0-9_]*$/;

export interface TenantTokenClaims {
  readonly iss: typeof TENANT_TOKEN_ISSUER;
  readonly aud: "authenticated";
  /** Supabase auth user id (= Churchy `profiles.id`); `auth.uid()` reads it. */
  readonly sub: string;
  readonly tenant_id: string;
  /** The Postgres role PostgREST switches to. */
  readonly role: string;
  readonly iat: number;
  readonly exp: number;
}

export interface MintTenantTokenInput {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: string;
  readonly secret: string;
  readonly now?: Date;
  readonly ttlSeconds?: number;
}

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");
const sign = (input: string, secret: string) =>
  createHmac("sha256", secret).update(input).digest("base64url");

function assertSecret(secret: string): void {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error("tenant token: JWT secret too short");
}

/** HS256 JWT with the tenant claim. Throws on malformed ids, role, TTL or secret. */
export function mintTenantToken(input: MintTenantTokenInput): string {
  const { userId, tenantId, role, secret } = input;
  const ttl = input.ttlSeconds ?? TENANT_TOKEN_TTL_SECONDS;
  if (!UUID.test(userId) || !UUID.test(tenantId))
    throw new Error("tenant token: ids must be uuids");
  if (!ROLE.test(role)) throw new Error("tenant token: invalid role");
  if (!Number.isInteger(ttl) || ttl <= 0 || ttl > MAX_TTL_SECONDS) {
    throw new Error("tenant token: invalid ttl");
  }
  assertSecret(secret);
  const iat = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const claims: TenantTokenClaims = {
    iss: TENANT_TOKEN_ISSUER,
    aud: "authenticated",
    sub: userId,
    tenant_id: tenantId,
    role,
    iat,
    exp: iat + ttl,
  };
  const unsigned = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
  return `${unsigned}.${sign(unsigned, secret)}`;
}

/** Verifies signature, algorithm, issuer and expiry; `null` for any invalid token. */
export function verifyTenantToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): TenantTokenClaims | null {
  assertSecret(secret);
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  const expected = Buffer.from(sign(`${header}.${payload}`, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const h = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg?: unknown };
    const c = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TenantTokenClaims;
    if (h.alg !== "HS256" || c.iss !== TENANT_TOKEN_ISSUER) return null;
    if (typeof c.exp !== "number" || c.exp <= Math.floor(now.getTime() / 1000)) return null;
    if (!UUID.test(String(c.tenant_id)) || !UUID.test(String(c.sub))) return null;
    return c;
  } catch {
    return null;
  }
}
