import { beforeAll, describe, expect, it } from "vitest";
import { ImportEventSchema, type ImportEvent, type ImportResult } from "@churchy/contracts";
import { getImportJob } from "@/server/data-adapters";
import { buildChecklist, checklistProgress } from "./checklist";
import {
  draftConfig,
  draftFromResult,
  flaggedKeys,
  includedStaff,
  markReviewed,
  reviewProblems,
} from "./draft";
import { addInvite, availableRoles, pruneInvites } from "./invites";
import {
  SETUP_MODULES,
  defaultSelection,
  setupEntitlements,
  toggleModule,
  workspaceModuleFlags,
} from "./modules";
import { INITIAL_PROGRESS, reduceProgress, streamImport } from "./progress";

/** The scripted fixture, as the app gets it from the import job (no delay in tests). */
async function fixture(): Promise<ImportResult> {
  for await (const event of getImportJob({ stageDelayMs: 0 }).start(
    "https://pelda.example.test/",
  )) {
    if (event.type === "result") return event.result;
  }
  throw new Error("no result");
}

let result: ImportResult;
beforeAll(async () => {
  result = await fixture();
});
const draft = () => draftFromResult(result);

describe("draft", () => {
  it("flags the uncertain items and clears a flag when the owner checks it", () => {
    const d = draft();
    expect(flaggedKeys(d)).toEqual(
      expect.arrayContaining(["tagline", "term:leadClergy", "serviceTime:st-3", "location:loc-2"]),
    );
    expect(flaggedKeys(d)).not.toContain("name");
    const checked = markReviewed(d, "tagline");
    expect(flaggedKeys(checked)).not.toContain("tagline");
    expect(flaggedKeys(d)).toContain("tagline");
  });

  it("builds the effective config from the preset and the draft's edits", () => {
    const config = draftConfig(draft());
    expect(config.preset.key).toBe("bapt");
    expect(config.identity.name).toBe("Szilvásréti Szabadegyházi Gyülekezet");
    // The importer's term override wins over the preset's term.
    expect(config.terminology.leadClergy.nom).toBe("Pásztor");
    // Denomination terms come from the preset, never hard-coded.
    expect(config.terminology.serviceSchedule.nom).toBe("Alkalmaink");
    expect(config.contact.phone).toBe("+36 30 555 0142");
  });

  it("keeps staff out until they are opted in and confirmed", () => {
    const d = draft();
    expect(includedStaff(d)).toEqual([]);
    expect(reviewProblems(d)).toEqual([]);
    const opted = {
      ...d,
      staff: d.staff.map((p) => (p.id === "p-1" ? { ...p, include: true } : p)),
    };
    expect(reviewProblems(opted)).toContain("consent");
    expect(includedStaff(opted)).toEqual([]);
    const confirmed = {
      ...opted,
      staff: opted.staff.map((p) => (p.id === "p-1" ? { ...p, consent: true } : p)),
    };
    expect(reviewProblems(confirmed)).toEqual([]);
    expect(includedStaff(confirmed).map((p) => p.id)).toEqual(["p-1"]);
  });

  it("blocks a low-contrast brand colour, a nameless service and an empty name", () => {
    const d = draft();
    expect(
      reviewProblems({
        ...d,
        theme: { ...d.theme, colors: { ...d.theme.colors, primary: "#ffee00" } },
      }),
    ).toContain("theme");
    expect(
      reviewProblems({ ...d, serviceTimes: [{ ...d.serviceTimes[0]!, label: " " }] }),
    ).toContain("serviceTimes");
    expect(reviewProblems({ ...d, name: " " })).toContain("name");
  });
});

describe("modules", () => {
  it("switches the sensitive modules on only by choice", () => {
    const e = setupEntitlements("munkater");
    const selection = defaultSelection(e);
    expect(selection).toEqual({
      calendar: true,
      rooms: true,
      worship: true,
      hr: false,
      diocese: false,
    });
    expect(toggleModule(selection, "hr", e).hr).toBe(true);
    expect(workspaceModuleFlags(toggleModule(selection, "hr", e))).toMatchObject({
      "ws.hr": true,
      "ws.hr.leave": true,
      "ws.calendar": true,
    });
  });

  it("cannot switch on a module the plan does not include", () => {
    const e = setupEntitlements("ingyenes");
    const selection = defaultSelection(e);
    expect(Object.values(selection).some(Boolean)).toBe(false);
    for (const m of SETUP_MODULES) expect(toggleModule(selection, m.id, e)).toBe(selection);
  });
});

describe("invites", () => {
  const selection = defaultSelection(setupEntitlements("munkater"));

  it("validates the address, the role and duplicates", () => {
    const first = addInvite([], { email: "ilona@pelda.example.test", role: "editor" }, selection);
    expect(first.ok).toBe(true);
    const list = first.ok ? first.list : [];
    expect(
      addInvite(list, { email: "ILONA@pelda.example.test", role: "office" }, selection),
    ).toEqual({ ok: false, error: "duplicate" });
    expect(addInvite(list, { email: "nem-cim", role: "office" }, selection)).toEqual({
      ok: false,
      error: "email",
    });
    // The HR role needs the HR module.
    expect(
      addInvite(list, { email: "b@pelda.example.test", role: "hrHandler" }, selection),
    ).toEqual({ ok: false, error: "role" });
  });

  it("offers module roles only while the module is on, and drops them when it goes off", () => {
    expect(availableRoles(selection).map((r) => r.key)).toContain("roomManager");
    const off = { ...selection, rooms: false };
    expect(availableRoles(off).map((r) => r.key)).not.toContain("roomManager");
    const list = [{ email: "t@pelda.example.test", role: "roomManager" as const }];
    expect(pruneInvites(list, off)).toEqual([]);
  });
});

describe("checklist", () => {
  it("has the nine steps and ticks what the wizard did", () => {
    const d = draft();
    const items = buildChecklist({
      draft: d,
      modules: defaultSelection(setupEntitlements("munkater")),
      invites: [],
      settings: { notifyEmail: "", comingSoon: true, weeklyReminder: true },
    });
    expect(items).toHaveLength(9);
    const by = Object.fromEntries(items.map((i) => [i.id, i.done]));
    expect(by).toMatchObject({ basics: true, workspace: true, users: false, launch: false });
    // The theme and one service time were flagged and not checked.
    expect(by.appearance).toBe(false);
    expect(by.schedule).toBe(false);
    expect(checklistProgress(items).total).toBe(9);
    for (const i of items) expect(i.href.startsWith("/")).toBe(true);
  });
});

describe("import progress", () => {
  it("folds the job's events into the stages done and the one running", async () => {
    let state = INITIAL_PROGRESS;
    const seen: ImportEvent[] = [];
    for await (const event of getImportJob({ stageDelayMs: 0 }).start("pelda.example.test")) {
      seen.push(event);
      state = reduceProgress(state, event);
      if (event.type === "stage" && event.status === "started")
        expect(state.running).toBe(event.stage);
    }
    expect(state.completed).toHaveLength(7);
    expect(state.running).toBeNull();
    expect(state.counts.pages).toBe(14);
    expect(seen.at(-1)?.type).toBe("result");
  });

  it("reads an NDJSON stream split at arbitrary points and drops bad lines", async () => {
    const lines = [
      JSON.stringify({ type: "stage", stage: "fetched", status: "started" }),
      "not json",
      JSON.stringify({ type: "stage", stage: "fetched", status: "completed" }),
    ].join("\n");
    const encoder = new TextEncoder();
    const chunks = [lines.slice(0, 20), lines.slice(20, 90), lines.slice(90) + "\n"];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
    const events: ImportEvent[] = [];
    for await (const e of streamImport("https://pelda.example.test/", {
      endpoint: "/x",
      fetchImpl: (async () => new Response(body, { status: 200 })) as typeof fetch,
    })) {
      expect(ImportEventSchema.safeParse(e).success).toBe(true);
      events.push(e);
    }
    expect(events.map((e) => (e.type === "stage" ? e.status : e.type))).toEqual([
      "started",
      "completed",
    ]);
  });

  it("reports a failed request as unreachable", async () => {
    const events: ImportEvent[] = [];
    for await (const e of streamImport("https://pelda.example.test/", {
      endpoint: "/x",
      fetchImpl: (async () => new Response(null, { status: 404 })) as typeof fetch,
    })) {
      events.push(e);
    }
    expect(events).toEqual([{ type: "failed", code: "unreachable" }]);
  });
});
