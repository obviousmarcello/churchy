import { describe, expect, it } from "vitest";
import { chainProgress, resolveChain, type ChainContext, type ChainStep } from "./chain";

const MANAGER: ChainStep = { kind: "manager" };
const LEADER: ChainStep = { kind: "role", role: "leader", any: true };
const HR: ChainStep = { kind: "role", role: "hrHandler", any: true };

const ctx = (over: Partial<ChainContext> = {}): ChainContext => ({
  requesterId: "emp",
  managerId: "boss",
  leaderIds: ["boss"],
  hrHandlerIds: ["hr1"],
  absentIds: new Set(),
  deputyOf: new Map(),
  ...over,
});

describe("resolveChain", () => {
  it("resolves manager, role and person steps to approvers", () => {
    const steps = resolveChain([MANAGER, LEADER, HR, { kind: "person", personId: "pat" }], ctx());
    expect(steps.map((s) => [s.outcome, s.approverIds])).toEqual([
      ["approver", ["boss"]],
      ["approver", ["boss"]],
      ["approver", ["hr1"]],
      ["approver", ["pat"]],
    ]);
  });

  it("skips a step whose only approver is the requester", () => {
    const steps = resolveChain([MANAGER, LEADER], ctx({ requesterId: "boss", managerId: "boss" }));
    expect(steps.map((s) => s.outcome)).toEqual(["skippedSelf", "skippedSelf"]);
    expect(steps[0]?.approverIds).toEqual([]);
  });

  it("keeps a role step when other people can decide it", () => {
    const [step] = resolveChain([LEADER], ctx({ requesterId: "boss", leaderIds: ["boss", "co"] }));
    expect(step).toMatchObject({ outcome: "approver", approverIds: ["co"] });
  });

  it("routes a step without a resolvable approver to HR", () => {
    const [step] = resolveChain([MANAGER], ctx({ managerId: null }));
    expect(step).toMatchObject({ outcome: "routedToHr", approverIds: ["hr1"] });
  });

  it("never routes to HR handlers who are the requester", () => {
    const [step] = resolveChain(
      [MANAGER],
      ctx({ managerId: null, requesterId: "hr1", hrHandlerIds: ["hr1", "hr2"] }),
    );
    expect(step?.approverIds).toEqual(["hr2"]);
  });

  it("delegates an absent approver to the deputy", () => {
    const [step] = resolveChain(
      [MANAGER],
      ctx({ absentIds: new Set(["boss"]), deputyOf: new Map([["boss", "dep"]]) }),
    );
    expect(step).toMatchObject({
      outcome: "delegated",
      approverIds: ["dep"],
      delegatedFrom: ["boss"],
    });
  });

  it("routes an absent approver without deputy to HR", () => {
    const [step] = resolveChain([MANAGER], ctx({ absentIds: new Set(["boss"]) }));
    expect(step).toMatchObject({ outcome: "routedToHr", delegatedFrom: ["boss"] });
  });

  it("does not use a deputy who is absent or the requester", () => {
    const absentDeputy = resolveChain(
      [MANAGER],
      ctx({ absentIds: new Set(["boss", "dep"]), deputyOf: new Map([["boss", "dep"]]) }),
    );
    expect(absentDeputy[0]?.outcome).toBe("routedToHr");
    const selfDeputy = resolveChain(
      [MANAGER],
      ctx({ absentIds: new Set(["boss"]), deputyOf: new Map([["boss", "emp"]]) }),
    );
    expect(selfDeputy[0]?.outcome).toBe("routedToHr");
  });

  it("keeps the present approvers of a role step when some are absent", () => {
    const [step] = resolveChain(
      [LEADER],
      ctx({ leaderIds: ["boss", "co"], absentIds: new Set(["boss"]) }),
    );
    expect(step).toMatchObject({ outcome: "approver", approverIds: ["co"] });
  });

  it("works for anonymous requesters and an empty chain", () => {
    expect(resolveChain([], ctx())).toEqual([]);
    const [step] = resolveChain([HR], ctx({ requesterId: null }));
    expect(step?.approverIds).toEqual(["hr1"]);
  });
});

describe("chainProgress", () => {
  const steps = resolveChain([MANAGER, LEADER, HR], ctx({ leaderIds: ["boss", "other"] }));

  it("waits for the first undecided step", () => {
    const p = chainProgress(steps, []);
    expect(p.state === "waiting" && p.step.index).toBe(0);
  });

  it("moves on after an approval and skips delegated log entries", () => {
    const p = chainProgress(steps, [
      { step: 0, decision: "approved" },
      { step: 1, decision: "delegated" },
    ]);
    expect(p.state === "waiting" && p.step.index).toBe(1);
  });

  it("is approved when every step is approved", () => {
    expect(
      chainProgress(steps, [
        { step: 0, decision: "approved" },
        { step: 1, decision: "approved" },
        { step: 2, decision: "approved" },
      ]),
    ).toEqual({ state: "approved" });
  });

  it("any rejection ends the chain", () => {
    expect(chainProgress(steps, [{ step: 0, decision: "rejected" }])).toEqual({
      state: "rejected",
    });
  });

  it("skipped steps need no decision, an empty chain is approved", () => {
    const skipped = resolveChain([MANAGER, HR], ctx({ requesterId: "boss" }));
    const p = chainProgress(skipped, []);
    expect(p.state === "waiting" && p.step.index).toBe(1);
    expect(chainProgress([], [])).toEqual({ state: "approved" });
  });
});
