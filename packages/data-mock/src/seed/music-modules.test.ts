import { WorkspaceModuleKeySchema } from "@churchy/contracts";
import { describe, expect, it } from "vitest";
import { DEMO_MUSIC_MODULES } from "./build-site";
import { WS_S50 } from "./platform";

const MUSIC = WorkspaceModuleKeySchema.options.filter((k) => k.startsWith("ws.music."));

describe("music modules in the demo seeds", () => {
  it("switches every music module on for the demo churches", () => {
    expect([...DEMO_MUSIC_MODULES].sort()).toEqual([...MUSIC].sort());
  });

  it("includes every music module in the platform's smallest workspace tier", () => {
    for (const key of MUSIC) expect(WS_S50).toContain(key);
  });
});
