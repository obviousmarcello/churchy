// The shared clock of a live session: the server's clock, as each device
// measures it. The clocks of phones and laptops can be 10 to 100 ms apart, or
// more, so a device cannot use its own `Date.now()` for the shared beat grid.
//
// It works like NTP. The device asks `/api/time` for the server time and
// notes when the request left and when the answer came. The server read its
// clock between these two times, so the offset is correct to half the round
// trip or better. The fastest answers give the best results.

/** The answers of one sync. */
export const SYNC_SAMPLES = 10;
/** The time between two syncs, in ms. */
export const SYNC_INTERVAL_MS = 30_000;
/** Older answers are not used. In ms. */
const SAMPLE_MAX_AGE_MS = 5 * 60_000;
/** The estimate uses the best answers of this number. */
const BEST_SAMPLES = 3;
/**
 * How fast the device clock can drift from the server clock: 100 ppm. An
 * answer becomes less accurate with its age, by 0.1 ms per second.
 */
const MAX_DRIFT = 100e-6;

export const SERVER_TIME_URL = "/api/time";

export type ClockSample = {
  /** `performance.now()` when the request left. */
  sent: number;
  /** `performance.now()` when the answer came. */
  received: number;
  /** The server time in the answer, in ms. */
  server: number;
};

export type ClockEstimate = {
  /** Server time = `performance.now()` + `offset`. In ms. */
  offset: number;
  /** The largest possible error, in ms. */
  error: number;
};

/** The largest possible error of one answer at the time `now`. */
function sampleError(sample: ClockSample, now: number) {
  return (sample.received - sample.sent) / 2 + Math.max(0, now - sample.received) * MAX_DRIFT;
}

function sampleOffset(sample: ClockSample) {
  // `Date.now()` on the server rounds down to a whole ms: the time is 0.5 ms later on average.
  return sample.server + 0.5 - (sample.sent + sample.received) / 2;
}

/**
 * The offset from the answers with the smallest possible error: the median
 * of the best three. Null without answers.
 */
export function estimateOffset(samples: ClockSample[], now: number): ClockEstimate | null {
  const valid = samples.filter(
    (sample) => sample.received >= sample.sent && Number.isFinite(sample.server),
  );
  if (valid.length === 0) return null;
  const best = valid
    .map((sample) => ({ offset: sampleOffset(sample), error: sampleError(sample, now) }))
    .sort((a, b) => a.error - b.error)
    .slice(0, BEST_SAMPLES);
  const offsets = best.map((sample) => sample.offset).sort((a, b) => a - b);
  return {
    offset: offsets[Math.floor((offsets.length - 1) / 2)]!,
    error: best[best.length - 1]!.error,
  };
}

async function fetchServerTime(): Promise<number> {
  const response = await fetch(SERVER_TIME_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`The server time request failed: ${response.status}`);
  const { now } = (await response.json()) as { now: number };
  return now;
}

/**
 * The server clock on this device. Before the first sync, it uses the device
 * clock. `start` syncs at once, then every 30 s and when the tab shows again.
 */
export class ServerClock {
  private samples: ClockSample[] = [];
  private estimate: ClockEstimate | null = null;
  private syncing: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly fetchTime: () => Promise<number> = fetchServerTime,
    private readonly localNow: () => number = () => performance.now(),
  ) {}

  /** Null before the first answer. */
  getEstimate = () => this.estimate;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The time of the server now, in ms. */
  now() {
    return this.localNow() + this.offset();
  }

  /** The `performance.now()` time of a server time. */
  toLocal(serverTime: number) {
    return serverTime - this.offset();
  }

  /** Asks the server `count` times, one after the other. A sync that runs already is not started again. */
  sync(count = SYNC_SAMPLES): Promise<void> {
    this.syncing ??= this.measure(count).finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  /** Syncs now, then again and again. Returns the function that stops it. */
  start() {
    void this.sync();
    const timer = setInterval(() => void this.sync(), SYNC_INTERVAL_MS);
    // A hidden tab can stop the timers, and the device can sleep.
    const onVisible = () => {
      if (document.visibilityState === "visible") void this.sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }

  private offset() {
    // `performance.timeOrigin + performance.now()` is the device clock.
    return this.estimate?.offset ?? performance.timeOrigin;
  }

  private async measure(count: number) {
    for (let index = 0; index < count; index++) {
      const sent = this.localNow();
      let server: number;
      try {
        server = await this.fetchTime();
      } catch {
        // Offline for a moment: the next sync tries again.
        break;
      }
      this.samples.push({ sent, received: this.localNow(), server });
    }
    const now = this.localNow();
    this.samples = this.samples.filter((sample) => now - sample.received <= SAMPLE_MAX_AGE_MS);
    const estimate = estimateOffset(this.samples, now);
    if (
      estimate &&
      (estimate.offset !== this.estimate?.offset || estimate.error !== this.estimate.error)
    ) {
      this.estimate = estimate;
      this.listeners.forEach((listener) => listener());
    }
  }
}
