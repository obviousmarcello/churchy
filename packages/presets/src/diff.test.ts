import { describe, expect, it } from "vitest";
import { configDiff, effectiveConfig, presetDiff } from "./config";
import { forms } from "./forms";

const noms = (list: { forms: { nom: string } }[]) => list.map((r) => r.forms.nom);

describe("presetDiff rk → ref", () => {
  const diff = presetDiff("rk", "ref");

  it("lists every changed term with old and new forms", () => {
    expect(Object.fromEntries(diff.terms.map((t) => [t.key, [t.from.nom, t.to.nom]]))).toEqual({
      community: ["Plébánia", "Egyházközség"],
      service: ["Szentmise", "Istentisztelet"],
      serviceSchedule: ["Miserend", "Istentiszteleti rend"],
      leadClergy: ["Plébános", "Lelkipásztor"],
      office: ["Plébániai iroda", "Lelkészi hivatal"],
      sermon: ["Homília", "Igehirdetés"],
      layCouncil: ["Képviselő-testület", "Presbitérium"],
      support: ["Egyházi hozzájárulás", "Egyházfenntartói járulék"],
      worshipTeam: ["Zenei szolgálat / Kórus", "Kántori szolgálat / Kórus"],
      ritesSection: ["Szentségek", "Alkalmak"],
      sermonsSection: ["Homíliák", "Igehirdetések"],
    });
    expect(diff.from).toBe("rk");
    expect(diff.to).toBe("ref");
  });

  it("lists module changes", () => {
    expect(diff.modules).toEqual([
      { key: "sermons", from: false, to: true },
      { key: "massIntentions", from: true, to: false },
    ]);
  });

  it("lists added, removed and kept rites", () => {
    expect(noms(diff.rites.added)).toEqual(["Konfirmáció", "Házasságkötés"]);
    expect(noms(diff.rites.removed)).toEqual([
      "Elsőáldozás",
      "Bérmálás",
      "Házasság",
      "Betegek kenete",
    ]);
    expect(diff.rites.renamed).toEqual([]);
  });

  it("lists service types, calendar family and the 301 redirects to create", () => {
    expect(diff.serviceTypes.removed.map((s) => s.key)).toEqual([
      "szentmise",
      "gyermekmise",
      "igeliturgia",
      "szentsegimadas",
      "litania",
    ]);
    expect(diff.serviceTypes.added.map((s) => s.key)).toContain("istentisztelet");
    expect(diff.calendarFamily).toEqual({ from: "catholic", to: "protestant" });
    expect(diff.redirects).toEqual([
      { fromPath: "/miserend", toPath: "/istentiszteleti-rend" },
      { fromPath: "/szentsegek", toPath: "/alkalmak" },
      { fromPath: "/homiliak", toPath: "/igehirdetesek" },
      { fromPath: "/szentsegek/keresztelo", toPath: "/alkalmak/keresztelo" },
      { fromPath: "/szentsegek/temetes", toPath: "/alkalmak/temetes" },
    ]);
  });

  it("keeps the church's overrides out of the change list", () => {
    const withOverrides = presetDiff("rk", "ref", {
      terminology: { community: forms("Közösség") },
      modules: { sermons: true },
    });
    const keys = withOverrides.terms.map((t) => t.key);
    expect(keys).not.toContain("community");
    expect(keys).toContain("service");
    expect(withOverrides.keptOverrides).toEqual(["community"]);
    expect(withOverrides.modules).toEqual([{ key: "massIntentions", from: true, to: false }]);
  });
});

describe("presetDiff bapt → general", () => {
  const diff = presetDiff("bapt", "general");

  it("lists the changed terms only", () => {
    expect(Object.fromEntries(diff.terms.map((t) => [t.key, [t.from.nom, t.to.nom]]))).toEqual({
      layCouncil: ["Gyülekezetvezetés", "Vezetőség"],
      worshipTeam: ["Dicsőítő csapat", "Zenei szolgálat"],
      musicPlan: ["Dicsőítési terv", "Énekrend"],
    });
  });

  it("lists module and rite changes", () => {
    expect(diff.modules).toEqual([{ key: "livestream", from: true, to: false }]);
    expect(noms(diff.rites.removed)).toEqual(["Bemerítés", "Gyermekbemutatás"]);
    expect(noms(diff.rites.added)).toEqual(["Keresztelő"]);
    expect(diff.rites.renamed).toEqual([]);
    expect(diff.calendarFamily).toBeNull();
    expect(diff.redirects).toEqual([]);
  });

  it("an override that equals neither preset is reported as kept", () => {
    const d = presetDiff("bapt", "general", { terminology: { musicPlan: forms("Zenei terv") } });
    expect(d.keptOverrides).toEqual(["musicPlan"]);
    expect(d.terms.map((t) => t.key)).toEqual(["layCouncil", "worshipTeam"]);
  });
});

describe("presetDiff for related presets", () => {
  it("rk → gk reports the renamed baptism rite", () => {
    const diff = presetDiff("rk", "gk");
    expect(diff.rites.renamed.map((r) => [r.key, r.from.forms.nom, r.to.forms.nom])).toEqual([
      ["keresztelo", "Keresztelő", "Keresztelő (krizmálással)"],
    ]);
    expect(diff.calendarFamily).toBeNull();
  });

  it("a preset compared with itself has no changes", () => {
    const diff = presetDiff("ev", "ev");
    expect(diff.terms).toEqual([]);
    expect(diff.modules).toEqual([]);
    expect(diff.rites).toEqual({ added: [], removed: [], renamed: [] });
    expect(diff.redirects).toEqual([]);
  });
});

describe("configDiff for a term override (FR-102)", () => {
  it("yields the 301 redirect from the old slug", () => {
    const before = effectiveConfig({ name: "X", denomination: "rk" });
    const after = effectiveConfig({
      name: "X",
      denomination: "rk",
      siteConfig: { terminology: { ritesSection: forms("Életünk ünnepei") } },
    });
    expect(configDiff(before, after).redirects).toEqual([
      { fromPath: "/szentsegek", toPath: "/eletunk-unnepei" },
      ...before.rites.map((r) => ({
        fromPath: `/szentsegek/${r.key}`,
        toPath: `/eletunk-unnepei/${r.key}`,
      })),
    ]);
  });
});
