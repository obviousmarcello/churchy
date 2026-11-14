import { describe, expect, it } from "vitest";
import { can } from "@churchy/policy";
import { buildAppNav, type NavKey } from "@/lib/app-nav";
import { DEMO_PERSONA_KEYS, personaScope, type DemoPersonaKey } from "@/lib/demo/personas";
import { filterNav } from "@/lib/permissions/nav";
import { demoDirectory, demoIdentity } from "./data-adapters";
import { actorFromIdentity } from "./session";

const directory = demoDirectory();
const tenants = directory.contexts.filter((c) => c.kind === "tenant");
const org = directory.contexts.find((c) => c.kind === "org")!;

const actorOf = (persona: DemoPersonaKey, contextId: string) =>
  actorFromIdentity(demoIdentity(null, persona, contextId));

/** Visible nav ids (areas and sections) for a persona, decided by the real `can()`. */
function visible(persona: DemoPersonaKey, contextId: string): string[] {
  const ctx = contextId === org.id ? { orgId: contextId } : { tenantId: contextId };
  const items = filterNav(
    buildAppNav((key: NavKey) => key),
    actorOf(persona, contextId),
    ctx,
  );
  return items.flatMap((area) => [area.id, ...(area.children ?? []).map((c) => c.id)]);
}

describe("demo directory", () => {
  it("offers the 3 demo churches and the diocese, the Catholic parish first", () => {
    expect(tenants.map((c) => c.id)).toEqual(["t-szenttivadar", "t-reformatus", "t-baptista"]);
    expect(org.id).toBe("org-dunavolgyi");
    expect(directory.defaultTenantId).toBe("t-szenttivadar");
    for (const c of directory.contexts) expect(c.name.length).toBeGreaterThan(0);
  });
});

describe("persona → actor (from the demo memberships)", () => {
  it("the visitor is anonymous everywhere", () => {
    for (const c of directory.contexts)
      expect(actorOf("latogato", c.id)).toEqual({ kind: "anonymous" });
  });

  for (const church of tenants) {
    it(`${church.name}: every church persona is a tenant actor of that church`, () => {
      for (const persona of DEMO_PERSONA_KEYS.filter((p) => personaScope(p) === "tenant")) {
        const actor = actorOf(persona, church.id);
        expect(actor.kind, persona).toBe("tenant");
        expect(actor.tenantId, persona).toBe(church.id);
      }
      // A church persona has no diocesan membership, the diocesan HR none in a church.
      expect(actorOf("tulajdonos", org.id)).toEqual({ kind: "anonymous" });
      expect(actorOf("egyhazmegyeiHr", church.id)).toEqual({ kind: "anonymous" });
    });

    it(`${church.name}: scopes come from the data (rooms, HR categories, teams)`, () => {
      const t = { tenantId: church.id };
      const terem = actorOf("terem", church.id);
      const hr = actorOf("hr", church.id);
      const bizalmas = actorOf("bizalmas", church.id);
      expect(terem.kind === "tenant" && terem.managedRoomIds!.length).toBeGreaterThanOrEqual(4);
      expect(hr.kind === "tenant" && hr.hrCategoryIds).not.toEqual([]);
      expect(hr.kind === "tenant" && hr.confidentialCategoryIds).toEqual([]);
      expect(bizalmas.kind === "tenant" && bizalmas.confidentialCategoryIds).toHaveLength(1);
      expect(bizalmas.kind === "tenant" && bizalmas.hrCategoryIds).toEqual([]);
      expect(can(actorOf("tulajdonos", church.id), "site.domain.manage", t)).toBe(true);
      expect(can(actorOf("vezeto", church.id), "site.domain.manage", t)).toBe(false);
      expect(can(actorOf("zenei", church.id), "song.edit", t)).toBe(true);
      // Never across churches.
      const other = tenants.find((c) => c.id !== church.id)!;
      expect(can(actorOf("tulajdonos", church.id), "news.publish", { tenantId: other.id })).toBe(
        false,
      );
    });
  }

  it("the diocesan HR is an organization actor with the parish links of the diocese", () => {
    const actor = actorOf("egyhazmegyeiHr", org.id);
    expect(actor.kind).toBe("org");
    if (actor.kind !== "org") return;
    expect(actor.orgId).toBe(org.id);
    expect(actor.categoryScopes).toBe("*");
    expect(actor.links).toContainEqual({
      tenantId: "t-szenttivadar",
      status: "active",
      delegatedCategoryKeys: ["munkaugyi-kerdes", "bizalmas-bejelentes"],
    });
    expect(can(actor, "org.portal.open", { orgId: org.id })).toBe(true);
    expect(can(actor, "directory.open", { tenantId: "t-szenttivadar" })).toBe(false);
  });
});

/**
 * What each persona sees in the Catholic demo parish (and the diocese): at least one item visible
 * and one hidden, all decided by `can()` — the same expectations the E2E test checks in the UI.
 */
const EXPECTED: Record<DemoPersonaKey, { visible: string[]; hidden: string[] }> = {
  latogato: { visible: [], hidden: ["workspace", "admin", "organization"] },
  tulajdonos: {
    visible: ["admin", "domain", "users", "workspace"],
    hidden: ["songs", "hr", "organization"],
  },
  szerkeszto: { visible: ["admin", "news"], hidden: ["appearance", "requests", "domain"] },
  iroda: { visible: ["announcements", "requests", "schedule"], hidden: ["news", "appearance"] },
  vezeto: { visible: ["appearance", "users", "songs"], hidden: ["domain", "hr"] },
  onkentes: { visible: ["workspace", "calendar", "directory"], hidden: ["rooms", "admin"] },
  zenei: { visible: ["songs", "rooms"], hidden: ["admin", "hr"] },
  terem: { visible: ["rooms"], hidden: ["songs", "admin"] },
  hr: { visible: ["hr", "absences"], hidden: ["songs", "admin"] },
  bizalmas: { visible: ["calendar", "absences"], hidden: ["hr", "admin"] },
  egyhazmegyeiHr: {
    visible: ["organization", "orgOverview", "orgLinks", "orgTemplates", "orgMembers"],
    hidden: ["workspace", "admin"],
  },
};

describe("menus per persona come from can()", () => {
  for (const persona of DEMO_PERSONA_KEYS) {
    it(`${persona}`, () => {
      const contextId = personaScope(persona) === "org" ? org.id : directory.defaultTenantId;
      const ids = visible(persona, contextId);
      const { visible: shown, hidden } = EXPECTED[persona];
      for (const id of shown) expect(ids, `${persona} sees ${id}`).toContain(id);
      for (const id of hidden) expect(ids, `${persona} does not see ${id}`).not.toContain(id);
      expect(shown.length + hidden.length).toBeGreaterThan(0);
    });
  }
});
