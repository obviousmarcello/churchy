import { afterEach, describe, expect, it } from "vitest";
import { can, tenantActor } from "@churchy/policy";
import { canServer } from "@/lib/permissions/server";
import { getActor, getRequestContext, resetActorResolver, setActorResolver } from "./session";

afterEach(resetActorResolver);

describe("session seam", () => {
  it("is anonymous by default", async () => {
    expect(await getActor()).toEqual({ kind: "anonymous" });
    expect(await canServer("news.publish", { tenantId: "t-1" })).toBe(false);
    expect((await getRequestContext()).tenantId).toBeTruthy();
  });

  it("uses an installed resolver (what the role switcher does)", async () => {
    const owner = tenantActor({
      tenantId: "t-1",
      userId: "u",
      personId: null,
      websiteRoles: ["owner"],
    });
    setActorResolver(() => owner);
    expect(await canServer("news.publish", { tenantId: "t-1" })).toBe(true);
    expect(can(await getActor(), "news.publish", { tenantId: "t-2" })).toBe(false);
  });
});
