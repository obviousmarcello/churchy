import { expect, it } from "vitest";
import type { Ctx } from "../../ctx";
import type { Repositories } from "../../registry";
import { PAST, defineContractSuite, expectContractError, ids } from "../harness";
import { locationFor } from "./rooms";

async function room(repos: Pick<Repositories, "locations" | "rooms">, ctx: Ctx) {
  const loc = await locationFor(repos.locations, ctx);
  return repos.rooms.upsert(ctx, { locationId: loc.id, name: "Közösségi terem", capacity: 60 });
}

const at = (hhmm: string) => `2032-05-10T${hhmm}:00+02:00`;
const RANGE = { from: at("00:00"), to: at("23:59") };

export const bookingsContract = defineContractSuite("bookings", (t) => {
  const deps = () => ({ locations: t.need("locations"), rooms: t.need("rooms") });

  it("creates, approves and lists bookings", async () => {
    const r = await room(deps(), t.ctx.a);
    const booking = await t.repo.create(t.ctx.a, {
      roomId: r.id,
      startsAt: at("17:00"),
      endsAt: at("18:30"),
      title: "Kóruspróba",
      attendees: 25,
    });
    expect(booking).toMatchObject({
      status: "pending",
      source: "user",
      bufferBeforeMin: 0,
      decidedAt: null,
    });
    const approved = await t.repo.decide(t.ctx.a, booking.id, "approved");
    expect(approved.status).toBe("approved");
    expect(approved.decidedAt).not.toBeNull();
    expect(ids(await t.repo.list(t.ctx.a, { ...RANGE, roomIds: [r.id] }))).toEqual([booking.id]);
    expect(
      await t.repo.list(t.ctx.a, { ...RANGE, roomIds: [r.id], statuses: ["rejected"] }),
    ).toEqual([]);
  });

  it("rejects overlapping bookings (buffers included) and frees cancelled slots", async () => {
    const r = await room(deps(), t.ctx.a);
    const other = await room(deps(), t.ctx.a);
    const first = await t.repo.create(t.ctx.a, {
      roomId: r.id,
      startsAt: at("10:00"),
      endsAt: at("11:00"),
      title: "Bibliaóra",
    });
    const error = await expectContractError(
      t.repo.create(t.ctx.a, {
        roomId: r.id,
        startsAt: at("10:30"),
        endsAt: at("11:30"),
        title: "Ütközés",
      }),
      "CONFLICT",
    );
    expect(error.details.conflictingBookingId).toBe(first.id);
    await expectContractError(
      t.repo.create(t.ctx.a, {
        roomId: r.id,
        startsAt: at("11:00"),
        endsAt: at("12:00"),
        bufferBeforeMin: 15,
        title: "Pufferrel",
      }),
      "CONFLICT",
    );
    // Half-open periods: back-to-back is fine; other rooms are independent.
    const next = await t.repo.create(t.ctx.a, {
      roomId: r.id,
      startsAt: at("11:00"),
      endsAt: at("12:00"),
      title: "Utána",
    });
    await t.repo.create(t.ctx.a, {
      roomId: other.id,
      startsAt: at("10:00"),
      endsAt: at("11:00"),
      title: "Másik terem",
    });
    await expectContractError(
      t.repo.update(t.ctx.a, next.id, { startsAt: at("10:45") }),
      "CONFLICT",
    );
    await t.repo.cancel(t.ctx.a, first.id);
    const replacement = await t.repo.create(t.ctx.a, {
      roomId: r.id,
      startsAt: at("10:00"),
      endsAt: at("11:00"),
      title: "Helyette",
    });
    expect(replacement.status).toBe("pending");
  });

  it("creates series with conflict reporting and expires holds", async () => {
    const r = await room(deps(), t.ctx.a);
    await t.repo.create(t.ctx.a, {
      roomId: r.id,
      startsAt: "2032-05-17T18:00:00+02:00",
      endsAt: "2032-05-17T19:00:00+02:00",
      title: "Foglalt",
    });
    const occurrences = ["2032-05-10", "2032-05-17", "2032-05-24"].map((d) => ({
      startsAt: `${d}T18:00:00+02:00`,
      endsAt: `${d}T19:00:00+02:00`,
    }));
    const series = {
      roomId: r.id,
      rrule: "FREQ=WEEKLY;BYDAY=MO;COUNT=3",
      dtstart: occurrences[0]!.startsAt,
      durationMin: 60,
      title: "Ifjúsági óra",
    };
    await expectContractError(
      t.repo.createSeries(t.ctx.a, series, occurrences, { skipConflicts: false }),
      "CONFLICT",
    );
    expect(
      (
        await t.repo.list(t.ctx.a, {
          from: occurrences[0]!.startsAt,
          to: occurrences[2]!.endsAt,
          roomIds: [r.id],
        })
      ).length,
    ).toBe(1);
    const result = await t.repo.createSeries(t.ctx.a, series, occurrences, { skipConflicts: true });
    expect(result.created).toHaveLength(2);
    expect(result.conflicts.map((c) => c.startsAt)).toEqual([occurrences[1]!.startsAt]);
    expect(result.created.every((b) => b.seriesId === result.series.id)).toBe(true);

    const held = await t.repo.create(t.ctx.a, {
      roomId: r.id,
      startsAt: at("08:00"),
      endsAt: at("09:00"),
      title: "Függő",
      holdExpiresAt: PAST,
    });
    expect(await t.repo.expireHolds(t.ctx.a, new Date().toISOString())).toBeGreaterThanOrEqual(1);
    expect((await t.repo.get(t.ctx.a, held.id))?.status).toBe("cancelled");
    expect(Array.isArray(await t.repo.listServiceConflicts(t.ctx.a))).toBe(true);
  });

  it("rejects invalid input", async () => {
    const r = await room(deps(), t.ctx.a);
    await expectContractError(
      t.repo.create(t.ctx.a, {
        roomId: r.id,
        startsAt: at("12:00"),
        endsAt: at("12:00"),
        title: "Nulla",
      }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.create(t.ctx.a, {
        roomId: r.id,
        startsAt: at("12:00"),
        endsAt: at("13:00"),
        title: "",
      }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.create(t.ctx.a, {
        roomId: r.id,
        startsAt: at("12:00"),
        endsAt: at("13:00"),
        title: "X",
        status: "rejected" as never,
      }),
      "VALIDATION",
    );
  });

  it("never returns, modifies or books tenant A's rooms from tenant B", async () => {
    const r = await room(deps(), t.ctx.a);
    const booking = await t.repo.create(t.ctx.a, {
      roomId: r.id,
      startsAt: at("14:00"),
      endsAt: at("15:00"),
      title: "Csak A",
    });
    expect(await t.repo.get(t.ctx.b, booking.id)).toBeNull();
    expect(ids(await t.repo.list(t.ctx.b, RANGE))).not.toContain(booking.id);
    expect(await t.repo.list(t.ctx.anonA, RANGE)).toEqual([]);
    await expectContractError(
      t.repo.create(t.ctx.b, {
        roomId: r.id,
        startsAt: at("20:00"),
        endsAt: at("21:00"),
        title: "Idegen",
      }),
      "NOT_FOUND",
    );
    await expectContractError(t.repo.cancel(t.ctx.b, booking.id), "NOT_FOUND");
    await expectContractError(t.repo.decide(t.ctx.b, booking.id, "approved"), "NOT_FOUND");
    expect((await t.repo.get(t.ctx.a, booking.id))?.status).toBe("pending");
  });
});
