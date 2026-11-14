import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERSONA,
  DEMO_PERSONAS,
  DEMO_PERSONA_KEYS,
  ORG_PERSONA,
  decodeSelection,
  defaultSelection,
  demoSelectionSchema,
  encodeSelection,
  selectContext,
  selectPersona,
  type DemoDirectory,
} from "./personas";

const directory: DemoDirectory = {
  contexts: [
    { kind: "tenant", id: "t-a", name: "A" },
    { kind: "tenant", id: "t-b", name: "B" },
    { kind: "org", id: "org-x", name: "X" },
  ],
  defaultTenantId: "t-a",
};

describe("demo personas", () => {
  it("has at least 10 personas incl. the visitor and the diocesan HR (D-92 AC1)", () => {
    expect(DEMO_PERSONAS.length).toBeGreaterThanOrEqual(10);
    expect(DEMO_PERSONA_KEYS).toEqual(
      expect.arrayContaining([
        "latogato",
        "tulajdonos",
        "szerkeszto",
        "iroda",
        "vezeto",
        "onkentes",
        "zenei",
        "terem",
        "hr",
        "egyhazmegyeiHr",
      ]),
    );
    expect(new Set(DEMO_PERSONA_KEYS).size).toBe(DEMO_PERSONA_KEYS.length);
  });

  it("starts as the visitor in the default church", () => {
    expect(defaultSelection(directory)).toEqual({ persona: DEFAULT_PERSONA, contextId: "t-a" });
  });

  it("keeps the context when the persona fits it", () => {
    const current = { persona: "latogato", contextId: "t-b" } as const;
    expect(selectPersona(directory, current, "iroda")).toEqual({
      persona: "iroda",
      contextId: "t-b",
    });
  });

  it("moves a diocesan persona to the diocese and a church persona back to a church", () => {
    const inChurch = { persona: "iroda", contextId: "t-b" } as const;
    expect(selectPersona(directory, inChurch, ORG_PERSONA)).toEqual({
      persona: ORG_PERSONA,
      contextId: "org-x",
    });
    const inDiocese = { persona: ORG_PERSONA, contextId: "org-x" } as const;
    expect(selectPersona(directory, inDiocese, "tulajdonos")).toEqual({
      persona: "tulajdonos",
      contextId: "t-a",
    });
    // The visitor can look at either.
    expect(selectPersona(directory, inDiocese, "latogato")).toEqual({
      persona: "latogato",
      contextId: "org-x",
    });
  });

  it("switching the context keeps a fitting persona and replaces one that does not fit", () => {
    expect(selectContext(directory, { persona: "hr", contextId: "t-a" }, "t-b")).toEqual({
      persona: "hr",
      contextId: "t-b",
    });
    expect(selectContext(directory, { persona: "hr", contextId: "t-a" }, "org-x")).toEqual({
      persona: ORG_PERSONA,
      contextId: "org-x",
    });
    expect(selectContext(directory, { persona: ORG_PERSONA, contextId: "org-x" }, "t-b")).toEqual({
      persona: DEFAULT_PERSONA,
      contextId: "t-b",
    });
    expect(() => selectContext(directory, defaultSelection(directory), "t-zzz")).toThrow(
      RangeError,
    );
  });

  it("round-trips the cookie value", () => {
    const selection = { persona: "zenei", contextId: "t-b" } as const;
    expect(decodeSelection(directory, encodeSelection(selection))).toEqual(selection);
  });

  it("falls back to the default for missing, malformed, unknown or extra cookie data", () => {
    const fallback = defaultSelection(directory);
    for (const raw of [
      undefined,
      "",
      "%E0%A4%A",
      "not-json",
      encodeURIComponent("[]"),
      encodeURIComponent(JSON.stringify({ persona: "admin", contextId: "t-a" })),
      encodeURIComponent(JSON.stringify({ persona: "iroda", contextId: "t-other" })),
      encodeURIComponent(JSON.stringify({ persona: "iroda", contextId: "t-a", role: "owner" })),
    ]) {
      expect(decodeSelection(directory, raw), String(raw)).toEqual(fallback);
    }
  });

  it("repairs an inconsistent cookie (church persona in the diocese)", () => {
    const raw = encodeSelection({ persona: "iroda", contextId: "org-x" });
    expect(decodeSelection(directory, raw)).toEqual({ persona: "iroda", contextId: "t-a" });
  });

  it("validates selections against the directory", () => {
    const schema = demoSelectionSchema(directory);
    expect(schema.safeParse({ persona: "terem", contextId: "t-b" }).success).toBe(true);
    expect(schema.safeParse({ persona: "terem", contextId: "nope" }).success).toBe(false);
    expect(schema.safeParse({ persona: "root", contextId: "t-b" }).success).toBe(false);
  });
});
