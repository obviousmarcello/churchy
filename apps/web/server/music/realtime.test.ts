import { vi } from "vitest";
import { describe, expect, it } from "vitest";

import { verifyTenantToken } from "./tenant-token";
import { getRealtimeConnection, mintRealtimeToken } from "./realtime";

vi.mock("server-only", () => ({}));

const USER = {
  id: "33333333-3333-4333-8333-333333333333",
  tenantId: "11111111-1111-4111-8111-111111111111",
};
const ENV = {
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk",
  SUPABASE_JWT_SECRET: "s".repeat(40),
};

describe("the realtime token", () => {
  it("is local without a Supabase project, and gives no token", () => {
    expect(getRealtimeConnection(USER, {})).toEqual({
      mode: "local",
      tenantId: USER.tenantId,
      userId: USER.id,
    });
    expect(mintRealtimeToken(USER, { receive: ["event:a"], send: [] }, {})).toBeNull();
  });

  it("names the tenant's topics, and sends only on topics it also receives", () => {
    expect(getRealtimeConnection(USER, ENV)).toMatchObject({
      mode: "supabase",
      url: ENV.SUPABASE_URL,
    });
    const minted = mintRealtimeToken(
      USER,
      { receive: ["event:a", "live:b"], send: ["live:b", "live:c"] },
      ENV,
    );
    const claims = verifyTenantToken(minted!.token, ENV.SUPABASE_JWT_SECRET);
    expect(claims).toMatchObject({ role: "authenticated", tenant_id: USER.tenantId, sub: USER.id });
    expect(claims?.rt_topics).toEqual([`t:${USER.tenantId}:event:a`, `t:${USER.tenantId}:live:b`]);
    expect(claims?.rt_send).toEqual([`t:${USER.tenantId}:live:b`]);
    expect(minted!.expiresInMs).toBe(300_000);
  });
});
