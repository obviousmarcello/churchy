import { ContractError, type Ctx } from "@churchy/contracts";
import { describe, expect, it } from "vitest";
import {
  assertTenantStorageKey,
  StorageKeyError,
  tenantStorageKey,
  tenantStoragePrefix,
} from "./storage-keys";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const actor = { userId: null, personId: null };
const ctxA: Ctx = { tenantId: A, actor };

describe("tenant storage keys (SDD §4.2: t/<tenant_id>/…)", () => {
  it("builds keys under the tenant prefix", () => {
    expect(tenantStoragePrefix(ctxA)).toBe(`t/${A}/`);
    expect(tenantStorageKey(ctxA, "media", "abc", "original.jpg")).toBe(
      `t/${A}/media/abc/original.jpg`,
    );
    expect(tenantStoragePrefix({ tenantId: A.toUpperCase(), actor })).toBe(`t/${A}/`);
  });

  it("accepts keys inside the current tenant's prefix", () => {
    const key = `t/${A}/requests/r-1/melleklet.pdf`;
    expect(assertTenantStorageKey(ctxA, key)).toBe(key);
  });

  it.each([
    ["another tenant", `t/${B}/media/x.jpg`],
    ["no prefix", "media/x.jpg"],
    ["absolute path", `/t/${A}/media/x.jpg`],
    ["prefix without separator", `t/${A}`],
    ["prefix only", `t/${A}/`],
    ["tenant id as a prefix of another", `t/${A}0/x.jpg`],
    ["dot-dot traversal", `t/${A}/../${B}/x.jpg`],
    ["dot segment", `t/${A}/./x.jpg`],
    ["empty segment", `t/${A}//x.jpg`],
    ["backslash", `t/${A}/..\\${B}\\x.jpg`],
    ["encoded separator", `t/${A}/..%2F${B}%2Fx.jpg`],
    ["control character", `t/${A}/x\u0000.jpg`],
  ])("refuses a key with %s", (_case, key) => {
    expect(() => assertTenantStorageKey(ctxA, key)).toThrow(StorageKeyError);
  });

  it.each([[".."], ["."], ["a/b"], [""], ["a\\b"], ["%2e%2e"]])(
    "refuses the segment %j when building",
    (segment) => {
      expect(() => tenantStorageKey(ctxA, "media", segment)).toThrow(StorageKeyError);
    },
  );

  it("needs at least one segment", () => {
    expect(() => tenantStorageKey(ctxA)).toThrow(StorageKeyError);
  });

  it("refuses organization and platform contexts", () => {
    for (const ctx of [{ orgId: A, actor }, { actor }] as Ctx[]) {
      expect(() => tenantStoragePrefix(ctx)).toThrow(ContractError);
      expect(() => assertTenantStorageKey(ctx, `t/${A}/x.jpg`)).toThrow(ContractError);
    }
  });

  it("refuses a context carrying both tenantId and orgId", () => {
    expect(() => tenantStoragePrefix({ tenantId: A, orgId: B, actor })).toThrow(ContractError);
  });

  it("is a FORBIDDEN contract error", () => {
    try {
      assertTenantStorageKey(ctxA, `t/${B}/x.jpg`);
      expect.unreachable();
    } catch (error) {
      expect((error as ContractError).code).toBe("FORBIDDEN");
    }
  });
});
