/**
 * In-memory store of one demo session (SDD §4.4): a deep clone of a `MockDataset`, the session's
 * simulation switches and its outbox. Repositories (`createMockRepositories`) read and write
 * `store.data`; `reset()` restores the original dataset exactly (*Visszaállítás*).
 */
import type { MockDataset } from "./dataset";
import type { OutboxDraft, OutboxEntry, OutboxFilter } from "./outbox";
import { assertSafeParams } from "./outbox";
import type { SimulationSwitches } from "./simulation";
import { DEFAULT_SWITCHES, MockOfflineError, mergeSwitches } from "./simulation";

export type MockStoreOptions = {
  /** Clock used for timestamps and visibility checks (default: real time). */
  now?: () => Date;
  /** Initial simulation switches (also restored by `reset()`). */
  switches?: Partial<SimulationSwitches>;
  /** Sleep used for simulated latency (tests inject a fake). */
  sleep?: (ms: number) => Promise<void>;
};

export interface MockStore {
  /** The live, mutable dataset. Only repositories should write to it. */
  readonly data: MockDataset;
  /** Current clock reading. */
  now(): Date;
  /** Current time as an ISO instant. */
  nowIso(): string;
  /** A new id, unique within the store (`<prefix>-m<n>`; deterministic after `reset()`). */
  nextId(prefix: string): string;

  /** Current simulation switches. */
  readonly switches: Readonly<SimulationSwitches>;
  /** Change some switches; returns the new set. RangeError for latency outside 0–2,000 ms. */
  setSwitches(patch: Partial<SimulationSwitches>): Readonly<SimulationSwitches>;
  /** Back to the switches the store was created with. */
  resetSwitches(): void;
  /** Consumes the one-shot `bookingConflictOnNext` switch; true if it was on. */
  takeBookingConflict(): boolean;
  /** Applied before every repository call: offline rejection, then latency. */
  beforeCall(): Promise<void>;

  /** Append a message that would have been sent. */
  appendOutbox(draft: OutboxDraft): OutboxEntry;
  /** Outbox entries, oldest first (copies). */
  listOutbox(filter?: OutboxFilter): OutboxEntry[];
  clearOutbox(): void;

  /** Deep copy of the current dataset. */
  snapshot(): MockDataset;
  /** Restore the original dataset exactly, clear the outbox and restore the initial switches. */
  reset(): void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Creates a store holding a deep clone of `dataset` (the argument is never mutated). */
export function createMockStore(dataset: MockDataset, options: MockStoreOptions = {}): MockStore {
  const original = structuredClone(dataset);
  const initialSwitches = mergeSwitches({ ...DEFAULT_SWITCHES }, options.switches ?? {});
  const clock = options.now ?? (() => new Date());
  const sleep = options.sleep ?? defaultSleep;

  let data = structuredClone(original);
  let switches: SimulationSwitches = { ...initialSwitches };
  let outbox: OutboxEntry[] = [];
  let seq = 0;

  const store: MockStore = {
    get data() {
      return data;
    },
    now: () => clock(),
    nowIso: () => clock().toISOString(),
    nextId(prefix) {
      seq += 1;
      return `${prefix}-m${seq}`;
    },

    get switches() {
      return { ...switches };
    },
    setSwitches(patch) {
      switches = mergeSwitches(switches, patch);
      return { ...switches };
    },
    resetSwitches() {
      switches = { ...initialSwitches };
    },
    takeBookingConflict() {
      if (!switches.bookingConflictOnNext) return false;
      switches = { ...switches, bookingConflictOnNext: false };
      return true;
    },
    async beforeCall() {
      if (switches.offline) throw new MockOfflineError();
      if (switches.latencyMs > 0) await sleep(switches.latencyMs);
      // The switch may have been turned on while the call was "in flight".
      if (switches.offline) throw new MockOfflineError();
    },

    appendOutbox(draft) {
      assertSafeParams(draft.params);
      const entry: OutboxEntry = {
        ...structuredClone(draft),
        id: store.nextId("out"),
        at: store.nowIso(),
      };
      outbox.push(entry);
      return structuredClone(entry);
    },
    listOutbox(filter = {}) {
      return outbox
        .filter((e) => filter.tenantId === undefined || e.tenantId === filter.tenantId)
        .filter((e) => filter.channel === undefined || e.channel === filter.channel)
        .filter((e) => filter.template === undefined || e.template === filter.template)
        .map((e) => structuredClone(e));
    },
    clearOutbox() {
      outbox = [];
    },

    snapshot: () => structuredClone(data),
    reset() {
      data = structuredClone(original);
      switches = { ...initialSwitches };
      outbox = [];
      seq = 0;
    },
  };
  return store;
}
