/**
 * Simulation switches of the mock adapter (SDD §4.4, deliverables §3.7 rule 7): the mock fakes
 * the hard parts honestly so screens are built for real behaviour. Switches live per store, i.e.
 * per demo session; the dev/demo panel that toggles them is a later issue.
 */

/** Maximum simulated latency (D-91 AC3: 0–2,000 ms). */
export const MAX_LATENCY_MS = 2_000;

export type SimulationSwitches = {
  /** Delay applied to every repository call, 0–2,000 ms. */
  latencyMs: number;
  /** The next booking create/update/series call fails with a `CONFLICT`; then resets itself. */
  bookingConflictOnNext: boolean;
  /** Media uploads (`media.create`) fail with `UPLOAD_FAILED` while on. */
  uploadFailure: boolean;
  /** Every repository call rejects with `MockOfflineError` while on. */
  offline: boolean;
  /** Payments (`billing.createSubscription` / `updateSubscription`) fail with `PAYMENT_FAILED`. */
  paymentFailure: boolean;
};

export const DEFAULT_SWITCHES: Readonly<SimulationSwitches> = Object.freeze({
  latencyMs: 0,
  bookingConflictOnNext: false,
  uploadFailure: false,
  offline: false,
  paymentFailure: false,
});

const BOOLEAN_SWITCHES = [
  "bookingConflictOnNext",
  "uploadFailure",
  "offline",
  "paymentFailure",
] as const;

/** Validates and merges a switch patch; throws `RangeError`/`TypeError` for invalid values. */
export function mergeSwitches(
  current: SimulationSwitches,
  patch: Partial<SimulationSwitches>,
): SimulationSwitches {
  const next = { ...current, ...patch };
  if (!Number.isInteger(next.latencyMs) || next.latencyMs < 0 || next.latencyMs > MAX_LATENCY_MS) {
    throw new RangeError(`latencyMs must be an integer between 0 and ${MAX_LATENCY_MS}`);
  }
  for (const key of BOOLEAN_SWITCHES) {
    if (typeof next[key] !== "boolean") throw new TypeError(`${key} must be a boolean`);
  }
  return next;
}

export type MockSimulationCode = "OFFLINE" | "UPLOAD_FAILED" | "PAYMENT_FAILED";

/**
 * A failure produced by a simulation switch. Deliberately NOT a `ContractError`: it stands for
 * infrastructure failures (network, storage, payment provider) that a real adapter surfaces as
 * thrown errors, not as contract outcomes.
 */
export class MockSimulationError extends Error {
  readonly code: MockSimulationCode;
  constructor(code: MockSimulationCode, message: string) {
    super(message);
    this.name = "MockSimulationError";
    this.code = code;
  }
}

/** Thrown by every repository call while the `offline` switch is on. */
export class MockOfflineError extends MockSimulationError {
  constructor() {
    super("OFFLINE", "Simulated offline: the data service is unreachable");
    this.name = "MockOfflineError";
  }
}

/** Duck-typed check (survives duplicated module instances in bundles). */
export function isMockSimulationError(
  error: unknown,
  code?: MockSimulationCode,
): error is MockSimulationError {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; code?: unknown };
  if (candidate.name !== "MockSimulationError" && candidate.name !== "MockOfflineError") {
    return false;
  }
  return code === undefined || candidate.code === code;
}
