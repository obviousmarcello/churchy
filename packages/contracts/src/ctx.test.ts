import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_ACTOR,
  CtxSchema,
  assertValidCtx,
  ctxScope,
  isAnonymous,
  orgCtx,
  platformCtx,
  requireOrgId,
  requirePlatform,
  requireTenantId,
  tenantCtx,
} from "./ctx";
import type { Ctx } from "./ctx";
import { isContractError } from "./errors";

const staff = { userId: "u-1", personId: "p-1" };

function contextError(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (error) {
    return isContractError(error, "CONTEXT");
  }
}

describe("Ctx", () => {
  it("never carries both tenantId and orgId", () => {
    const both = { tenantId: "t-1", orgId: "o-1", actor: staff };
    expect(CtxSchema.safeParse(both).success).toBe(false);
    expect(contextError(() => assertValidCtx(both))).toBe(true);
    expect(contextError(() => ctxScope(both))).toBe(true);
    expect(contextError(() => requireTenantId(both))).toBe(true);
  });

  it("rejects malformed contexts", () => {
    expect(contextError(() => assertValidCtx({ tenantId: "t-1" }))).toBe(true);
    expect(contextError(() => assertValidCtx({ tenantId: "", actor: staff }))).toBe(true);
    expect(contextError(() => assertValidCtx(null))).toBe(true);
  });

  it("tells the scope of a context", () => {
    expect(ctxScope(tenantCtx("t-1", staff))).toEqual({ kind: "tenant", tenantId: "t-1" });
    expect(ctxScope(orgCtx("o-1", staff))).toEqual({ kind: "org", orgId: "o-1" });
    expect(ctxScope(platformCtx(staff))).toEqual({ kind: "platform" });
  });

  it("requires the right kind of context", () => {
    const t: Ctx = tenantCtx("t-1", staff);
    const o: Ctx = orgCtx("o-1", staff);
    const p: Ctx = platformCtx(staff);
    expect(requireTenantId(t)).toBe("t-1");
    expect(requireOrgId(o)).toBe("o-1");
    expect(() => requirePlatform(p)).not.toThrow();
    expect(contextError(() => requireTenantId(o))).toBe(true);
    expect(contextError(() => requireTenantId(p))).toBe(true);
    expect(contextError(() => requireOrgId(t))).toBe(true);
    expect(contextError(() => requirePlatform(t))).toBe(true);
  });

  it("treats a null userId as an anonymous visitor", () => {
    expect(isAnonymous(tenantCtx("t-1"))).toBe(true);
    expect(tenantCtx("t-1").actor).toBe(ANONYMOUS_ACTOR);
    expect(isAnonymous(tenantCtx("t-1", staff))).toBe(false);
  });
});
