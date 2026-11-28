import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkspaceModuleKeySchema, type WorkspaceModuleKey } from "@churchy/contracts";
import { workspaceModuleId } from "../plans/modules";
import { musicParent, TIER_MODULES } from "./plan-tier";

const MUSIC = WorkspaceModuleKeySchema.options.filter((k) => k.startsWith("ws.music."));
const messages = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../messages/hu.json"), "utf8"),
);
const modulok = messages.admin.modules.workspace.items as Record<
  string,
  { title: string; help: string }
>;
const labels = messages.admin.plan.modules?.workspace ?? undefined;

describe("music module registry", () => {
  it("has the songs module as the only root", () => {
    expect(MUSIC.filter((k) => musicParent(k) === null)).toEqual(["ws.music.songs"]);
  });

  it("has a registered parent and no cycle for every module", () => {
    for (const key of MUSIC) {
      const seen = new Set<WorkspaceModuleKey>();
      let at: WorkspaceModuleKey | null = key;
      while (at !== null) {
        expect(seen.has(at), `cycle at ${key}`).toBe(false);
        seen.add(at);
        const parent: WorkspaceModuleKey | null = musicParent(at);
        if (parent !== null) expect(MUSIC).toContain(parent);
        at = parent;
      }
      expect(seen.has("ws.music.songs")).toBe(true);
    }
  });

  it("is in every tier that has a workspace, and in none for tier none", () => {
    for (const tier of ["s50", "m150", "l300"] as const) {
      for (const key of MUSIC) expect(TIER_MODULES[tier], `${tier} ${key}`).toContain(key);
    }
    expect(TIER_MODULES.none).toEqual([]);
  });

  it("has a message id, a title and a help text in /admin/modulok", () => {
    for (const key of MUSIC) {
      const id = workspaceModuleId(key);
      const entry = modulok[id];
      expect(entry?.title, `${key} title`).toBeTruthy();
      expect(entry?.help, `${key} help`).toBeTruthy();
    }
    if (labels) for (const key of MUSIC) expect(labels[workspaceModuleId(key)]).toBeTruthy();
  });

  it("has unique message ids", () => {
    const ids = MUSIC.map(workspaceModuleId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
