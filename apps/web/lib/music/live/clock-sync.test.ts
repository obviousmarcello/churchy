import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ServerClock, estimateOffset, type ClockSample } from "./clock-sync";

/** An answer from a server whose clock is `offset` ms ahead, with the given times to and from it. */
function sample(sent: number, offset: number, up: number, down: number): ClockSample {
  // The server rounds down to a whole ms.
  return { sent, received: sent + up + down, server: Math.floor(sent + up + offset) };
}

describe("estimateOffset", () => {
  it("is null without answers", () => {
    expect(estimateOffset([], 0)).toBeNull();
  });

  it("is exact for a symmetric round trip", () => {
    const estimate = estimateOffset([sample(1000, 5000.5, 10, 10)], 1020);
    expect(estimate?.offset).toBeCloseTo(5000.5, 6);
    expect(estimate?.error).toBe(10);
  });

  it("is correct to half the round trip, also when the two ways are different", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.array(
          fc.tuple(
            fc.double({ min: 0, max: 200, noNaN: true }),
            fc.double({ min: 0, max: 200, noNaN: true }),
          ),
          {
            minLength: 1,
            maxLength: 20,
          },
        ),
        (offset, trips) => {
          const samples = trips.map(([up, down], index) =>
            sample(1000 + index * 500, offset, up, down),
          );
          const now = samples.at(-1)!.received;
          const estimate = estimateOffset(samples, now)!;
          // Plus 0.5 ms for the whole ms of the server time.
          expect(Math.abs(estimate.offset - offset)).toBeLessThanOrEqual(
            estimate.error + 0.5 + 1e-6,
          );
        },
      ),
    );
  });

  it("uses the fastest answers, not the slow ones", () => {
    const samples = [
      sample(0, 1000, 2, 2),
      sample(100, 1000, 300, 5),
      sample(500, 1000, 3, 2),
      sample(900, 1000, 1, 250),
      sample(1300, 1000, 2, 3),
    ];
    const estimate = estimateOffset(samples, 1400)!;
    expect(Math.abs(estimate.offset - 1000)).toBeLessThan(2);
    expect(estimate.error).toBeLessThan(3);
  });

  it("prefers new answers to old ones of the same round trip", () => {
    // An old answer from a clock that drifted 60 ms since then.
    const old = { ...sample(0, 1060, 5, 5) };
    const recent = [
      sample(600_000, 1000, 5, 5),
      sample(600_100, 1000, 6, 6),
      sample(600_200, 1000, 6, 5),
    ];
    const estimate = estimateOffset([old, ...recent], 600_300)!;
    expect(Math.abs(estimate.offset - 1000)).toBeLessThan(1);
  });

  it("ignores broken answers", () => {
    expect(estimateOffset([{ sent: 10, received: 5, server: 100 }], 10)).toBeNull();
    expect(estimateOffset([{ sent: 0, received: 5, server: Number.NaN }], 10)).toBeNull();
  });
});

describe("ServerClock", () => {
  /** A device clock and a server 7000 ms ahead, with 4 ms to and 6 ms from it. */
  function fakeServer() {
    let local = 1000;
    const fetchTime = async () => {
      local += 4;
      const server = Math.floor(local + 7000);
      local += 6;
      return server;
    };
    return {
      clock: new ServerClock(fetchTime, () => local),
      advance: (ms: number) => (local += ms),
    };
  }

  it("changes between the server time and the device time", async () => {
    const { clock } = fakeServer();
    await clock.sync();
    // Half the round trip, plus a little for the age of the answers.
    expect(clock.getEstimate()?.error).toBeCloseTo(5, 1);
    // 1 ms of the 2 ms difference between the two ways, plus the whole ms of the server time.
    expect(Math.abs(clock.toLocal(20_000) - 13_000)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(clock.now() - clock.toLocal(clock.now()) - 7000)).toBeLessThanOrEqual(1.5);
  });

  it("tells the listeners about a new estimate", async () => {
    const { clock } = fakeServer();
    let calls = 0;
    clock.subscribe(() => calls++);
    await clock.sync(3);
    expect(calls).toBe(1);
  });

  it("runs one sync at a time", async () => {
    const { clock } = fakeServer();
    const first = clock.sync(3);
    expect(clock.sync(3)).toBe(first);
    await first;
  });

  it("keeps the last estimate when the server does not answer", async () => {
    const { clock } = fakeServer();
    await clock.sync(2);
    const estimate = clock.getEstimate();
    const offline = new ServerClock(async () => {
      throw new Error("offline");
    });
    await offline.sync();
    expect(offline.getEstimate()).toBeNull();
    expect(clock.getEstimate()).toBe(estimate);
  });
});
