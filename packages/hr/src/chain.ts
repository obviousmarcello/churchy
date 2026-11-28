/**
 * Approval chains (SDD §25.2). Resolution rules, each unit-tested:
 * - a step whose only approver is the requester is skipped (no self-approval);
 * - an approver who is absent today is replaced by the configured deputy (logged by the caller);
 * - a step with no resolvable approver is routed to the HR handlers.
 */

export type ChainStep =
  | { readonly kind: "manager" }
  | { readonly kind: "person"; readonly personId: string }
  | { readonly kind: "role"; readonly role: "leader" | "hrHandler"; readonly any: true };

export interface ChainContext {
  /** Null for anonymous tickets. */
  readonly requesterId: string | null;
  /** `staff_profiles.manager_person_id` of the requester. */
  readonly managerId: string | null;
  /** People who hold the leader role (*Vezető*). */
  readonly leaderIds: readonly string[];
  /** HR handlers of the ticket's category. */
  readonly hrHandlerIds: readonly string[];
  /** People with an approved absence covering today. */
  readonly absentIds: ReadonlySet<string>;
  /** Absent person → deputy. */
  readonly deputyOf: ReadonlyMap<string, string>;
}

export type StepOutcome =
  /** Decided by the named approvers (any one of them). */
  | "approver"
  /** Skipped: the requester would approve their own request. */
  | "skippedSelf"
  /** Approvers were absent; their deputies take over. */
  | "delegated"
  /** No resolvable approver: HR decides. */
  | "routedToHr";

export interface ResolvedStep {
  readonly index: number;
  readonly step: ChainStep;
  readonly outcome: StepOutcome;
  /** Who may decide this step (any one). Empty for a skipped step. */
  readonly approverIds: readonly string[];
  /** For a delegated step: the absent people the deputies replace. */
  readonly delegatedFrom: readonly string[];
}

function candidates(step: ChainStep, ctx: ChainContext): string[] {
  switch (step.kind) {
    case "manager":
      return ctx.managerId === null ? [] : [ctx.managerId];
    case "person":
      return [step.personId];
    case "role":
      return step.role === "leader" ? [...ctx.leaderIds] : [...ctx.hrHandlerIds];
  }
}

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

/** Resolves every step of a chain for one request. */
export function resolveChain(chain: readonly ChainStep[], ctx: ChainContext): ResolvedStep[] {
  const hrWithoutRequester = unique(ctx.hrHandlerIds.filter((id) => id !== ctx.requesterId));
  return chain.map((step, index): ResolvedStep => {
    const raw = unique(candidates(step, ctx));
    const others = raw.filter((id) => id !== ctx.requesterId);
    if (raw.length > 0 && others.length === 0) {
      return { index, step, outcome: "skippedSelf", approverIds: [], delegatedFrom: [] };
    }
    if (others.length === 0) {
      return {
        index,
        step,
        outcome: "routedToHr",
        approverIds: hrWithoutRequester,
        delegatedFrom: [],
      };
    }
    const present = others.filter((id) => !ctx.absentIds.has(id));
    if (present.length > 0) {
      return { index, step, outcome: "approver", approverIds: present, delegatedFrom: [] };
    }
    // Every approver is absent: the deputies take over, else HR.
    const deputies = unique(
      others
        .map((id) => ctx.deputyOf.get(id))
        .filter(
          (id): id is string =>
            id !== undefined && id !== ctx.requesterId && !ctx.absentIds.has(id),
        ),
    );
    if (deputies.length > 0) {
      return { index, step, outcome: "delegated", approverIds: deputies, delegatedFrom: others };
    }
    return {
      index,
      step,
      outcome: "routedToHr",
      approverIds: hrWithoutRequester,
      delegatedFrom: others,
    };
  });
}

export interface RecordedDecision {
  readonly step: number;
  readonly decision: "approved" | "rejected" | "delegated";
}

export type ChainProgress =
  /** The step (index into the resolved chain) waiting for a decision. */
  | { readonly state: "waiting"; readonly step: ResolvedStep }
  | { readonly state: "approved" }
  | { readonly state: "rejected" };

/**
 * Where the chain stands: any rejection ends it; otherwise the first step that is not skipped and
 * has no approval is next; with none left the request is approved. A `delegated` record is a log
 * entry, not a decision.
 */
export function chainProgress(
  steps: readonly ResolvedStep[],
  decisions: readonly RecordedDecision[],
): ChainProgress {
  if (decisions.some((d) => d.decision === "rejected")) return { state: "rejected" };
  const approved = new Set(decisions.filter((d) => d.decision === "approved").map((d) => d.step));
  const next = steps.find((s) => s.outcome !== "skippedSelf" && !approved.has(s.index));
  return next === undefined ? { state: "approved" } : { state: "waiting", step: next };
}

/** Whether the step is decided by the HR handlers (an HR step or one routed to HR). */
export const isHrStep = (step: ResolvedStep): boolean =>
  step.outcome === "routedToHr" || (step.step.kind === "role" && step.step.role === "hrHandler");
