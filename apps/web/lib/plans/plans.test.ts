import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import type { EntitlementSources, Plan } from "@churchy/contracts";
import {
  entitlements,
  isUpgrade,
  limitStatus,
  planChangeFor,
  type Entitlements,
} from "./entitlements";
import {
  WEBSITE_MODULE_KEYS,
  WORKSPACE_MODULE_KEYS,
  applyModuleToggles,
  websiteModuleRows,
  websiteField,
  workspaceField,
  workspaceModuleRows,
} from "./modules";

const base = {
  customDomain: false,
  storageGb: 0,
  maxEditors: null,
  modules: [],
  footerCredit: false,
  workspaceAllowed: false,
  wsTier: "none" as const,
  wsModules: [],
  maxWorkspaceUsers: null,
  musicResearchPerMonth: 0,
};
const free: Plan = {
  key: "ingyenes",
  name: "Ingyenes",
  kind: "website",
  priceMonthly: 0,
  priceYearly: 0,
  entitlements: {
    ...base,
    storageGb: 1,
    maxEditors: 3,
    modules: ["news", "events"],
    footerCredit: true,
  },
};
const full: Plan = {
  key: "teljes",
  name: "Teljes",
  kind: "website",
  priceMonthly: 4990,
  priceYearly: 49900,
  entitlements: {
    ...base,
    customDomain: true,
    storageGb: 20,
    modules: ["news", "events", "gallery", "giving"],
    workspaceAllowed: true,
  },
};
const ws: Plan = {
  key: "ws_s50",
  name: "Munkatér S",
  kind: "workspace",
  priceMonthly: 9900,
  priceYearly: 99000,
  entitlements: {
    ...base,
    workspaceAllowed: true,
    wsTier: "s50",
    wsModules: ["ws.calendar", "ws.rooms"],
    maxWorkspaceUsers: 50,
  },
};
const sources = (over: Partial<EntitlementSources>): EntitlementSources => ({
  websitePlan: full,
  workspacePlan: ws,
  deal: null,
  ...over,
});

describe("entitlements()", () => {
  it("merges the website plan and the workspace add-on", () => {
    const e = entitlements(sources({}));
    expect(e).toMatchObject({
      customDomain: true,
      storageGb: 20,
      wsTier: "s50",
      maxWorkspaceUsers: 50,
      workspacePlanName: "Munkatér S",
      coveredByDeal: false,
    });
    expect(e.wsModules).toEqual(["ws.calendar", "ws.rooms"]);
  });

  it("switches the workspace off when the website plan does not allow it (downgrade)", () => {
    const e = entitlements(sources({ websitePlan: free }));
    expect(e).toMatchObject({ wsTier: "none", wsModules: [], maxWorkspaceUsers: null });
    expect(e.workspacePlanName).toBeNull();
    expect(e.footerCredit).toBe(true);
    expect(e.maxEditors).toBe(3);
  });

  it("recognises a diocesan deal that covers one of the plans", () => {
    const deal = { id: "d", planKeys: ["teljes" as const], validFrom: "2026-01-01", validTo: null };
    expect(entitlements(sources({ deal })).coveredByDeal).toBe(true);
    expect(entitlements(sources({ deal: { ...deal, planKeys: ["ws_s50"] } })).coveredByDeal).toBe(
      true,
    );
    expect(entitlements(sources({ deal: { ...deal, planKeys: [] } })).coveredByDeal).toBe(false);
  });
});

describe("limitStatus() (D-87 AC2: warn at 90 %, block at 100 %)", () => {
  it("is ok below 90 %", () => {
    expect(limitStatus(2, 3)).toMatchObject({ level: "ok" });
    expect(limitStatus(8, 10)).toMatchObject({ level: "ok", allowsMore: true });
  });
  it("warns from 90 % and still allows more", () => {
    expect(limitStatus(9, 10)).toMatchObject({ level: "warning", allowsMore: true, percent: 90 });
  });
  it("blocks at 100 %", () => {
    expect(limitStatus(10, 10)).toMatchObject({ level: "full", allowsMore: false, percent: 100 });
    expect(limitStatus(12, 10).percent).toBe(100);
  });
  it("is unlimited without a cap", () => {
    expect(limitStatus(500, null)).toMatchObject({ level: "unlimited", allowsMore: true });
  });
});

describe("plan changes", () => {
  it("a website plan without the workspace also switches the workspace off", () => {
    expect(planChangeFor(free)).toEqual({ planKey: "ingyenes", wsTier: "none" });
    expect(planChangeFor(full)).toEqual({ planKey: "teljes" });
    expect(planChangeFor(ws)).toEqual({ wsTier: "s50" });
  });
  it("tells upgrades by price", () => {
    expect(isUpgrade(full, free)).toBe(true);
    expect(isUpgrade(free, full)).toBe(false);
    expect(isUpgrade(free, null)).toBe(true);
  });
});

describe("module toggles (D-25 test matrix: every module on and off)", () => {
  const everything: Entitlements = entitlements(
    sources({
      websitePlan: {
        ...full,
        entitlements: { ...full.entitlements, modules: [...WEBSITE_MODULE_KEYS] },
      },
      workspacePlan: {
        ...ws,
        entitlements: { ...ws.entitlements, wsModules: [...WORKSPACE_MODULE_KEYS] },
      },
    }),
  );

  it("switches each website module on and off independently", () => {
    for (const key of WEBSITE_MODULE_KEYS) {
      const on = applyModuleToggles({}, { [websiteField(key)]: "on" }, everything);
      expect(on.modules?.[key], key).toBe(true);
      const off = applyModuleToggles(on, {}, everything);
      expect(off.modules?.[key], key).toBe(false);
    }
  });

  it("switches each workspace module on and off independently", () => {
    for (const key of WORKSPACE_MODULE_KEYS) {
      const on = applyModuleToggles({}, { [workspaceField(key)]: "on" }, everything);
      expect(on.workspaceModules?.[key], key).toBe(true);
      expect(applyModuleToggles(on, {}, everything).workspaceModules?.[key], key).toBe(false);
    }
  });

  it("leaves modules outside the plan untouched, so an upgrade restores them", () => {
    const e = entitlements(sources({ websitePlan: free, workspacePlan: null }));
    const stored = {
      modules: { gallery: true, news: true },
      workspaceModules: { "ws.hr": true as const },
    };
    const next = applyModuleToggles(stored, {}, e);
    expect(next.modules).toEqual({ gallery: true, news: false, events: false });
    expect(next.workspaceModules).toEqual({ "ws.hr": true });
  });

  it("rows say what is locked, on and off", () => {
    const e = entitlements(sources({}));
    const rows = websiteModuleRows({ news: true, gallery: true }, e);
    expect(rows.find((r) => r.key === "news")).toMatchObject({ entitled: true, enabled: true });
    expect(rows.find((r) => r.key === "events")).toMatchObject({ entitled: true, enabled: false });
    expect(rows.find((r) => r.key === "sermons")).toMatchObject({ entitled: false });
    const wsRows = workspaceModuleRows("s50", { "ws.rooms": false }, e);
    expect(wsRows.find((r) => r.key === "ws.calendar")).toMatchObject({
      entitled: true,
      enabled: true,
    });
    expect(wsRows.find((r) => r.key === "ws.rooms")).toMatchObject({
      entitled: true,
      enabled: false,
    });
    expect(wsRows.find((r) => r.key === "ws.board")).toMatchObject({
      entitled: false,
      enabled: false,
    });
  });
});

describe("no direct plan-key checks (D-87 AC1)", () => {
  /** Source files of the web app; only `entitlements()` and the plan-change mapping touch keys. */
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (name === "node_modules" || name === ".next" || name === "e2e") return [];
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it("never compares planKey or a plan literal outside entitlements()", () => {
    const root = join(__dirname, "../..");
    const offenders = sourceFiles(root)
      .filter((f) => !f.endsWith(join("lib", "plans", "entitlements.ts")))
      .filter((f) => {
        const text = readFileSync(f, "utf8");
        return (
          /planKey\s*[!=]==?\s*["'`]/.test(text) ||
          /["'`](ingyenes|teljes|ws_s50|ws_m150|ws_l300)["'`]\s*[!=]==?/.test(text) ||
          /[!=]==?\s*["'`](ingyenes|teljes|ws_s50|ws_m150|ws_l300)["'`]/.test(text)
        );
      })
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });
});
