"use server";

import { revalidatePath } from "next/cache";
import { isContractError, type Booking } from "@churchy/contracts";
import {
  checkRules,
  findClash,
  retime,
  scopeTargets,
  weeklyRule,
  localParts,
  type Occupancy,
} from "@churchy/booking";
import { can } from "@churchy/policy";
import type {
  BookingCheck,
  BookingFormInput,
  CreateOutcome,
  EditInput,
  EditOutcome,
} from "@/lib/rooms/types";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { evaluateBooking } from "@/server/room-evaluate";
import { bookResource, loadOccupancy } from "@/server/rooms";
import { getRequestRepositories } from "@/server/repositories";
import { getRequestContext } from "@/server/session";
import { getWorkspaceEnv } from "@/server/workspace";

/**
 * Mutations of room booking (D-60, D-61). Each one goes through `withPolicy()`: requesting,
 * changing and cancelling need `room.book` for the room (its own `whoCanRequest`), deciding needs
 * `booking.approve`. Changing or cancelling a booking additionally needs to be its requester or an
 * approver of the room — the policy has no "own booking" notion, so the handlers check it with
 * `can()` for the approver case.
 */

const refreshPaths = () => {
  revalidatePath("/munkater/foglalas", "layout");
  revalidatePath("/munkater");
};

/** Policy resource of a request that names a room. */
async function requestRoom(scope: PolicyScope, input: { roomId: string }) {
  const { tenantId } = await getRequestContext();
  if (tenantId === undefined) return null;
  const room = await (await getRequestRepositories()).rooms.get(scope.ctx, input.roomId);
  return room === null ? null : bookResource(tenantId, room);
}

/** Policy resource of an existing booking's room. */
async function bookingRoom(scope: PolicyScope, id: string, ..._rest: unknown[]) {
  const { tenantId } = await getRequestContext();
  if (tenantId === undefined) return null;
  const repos = await getRequestRepositories();
  const booking = await repos.bookings.get(scope.ctx, id);
  if (booking === null) return null;
  const room = await repos.rooms.get(scope.ctx, booking.roomId);
  return room === null ? null : bookResource(tenantId, room);
}

async function approvalResource(scope: PolicyScope, id: string, ..._rest: unknown[]) {
  const { tenantId } = await getRequestContext();
  if (tenantId === undefined) return null;
  const booking = await (await getRequestRepositories()).bookings.get(scope.ctx, id);
  return booking === null ? null : { tenantId, roomId: booking.roomId };
}

/** Live check of the booking form: rules, clashes, alternatives, series, starting status. */
export const checkBooking = withPolicy(
  "room.book",
  requestRoom,
  async (_scope, input: BookingFormInput): Promise<BookingCheck> => {
    const env = await getWorkspaceEnv();
    return (await evaluateBooking(env, input)).check;
  },
);

const attendeesOf = (s: string): number | null => {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const textOrNull = (s: string): string | null => (s.trim() === "" ? null : s.trim());

/** Books a room (a single slot or a weekly series, SDD §23.3). */
export const createBooking = withPolicy(
  "room.book",
  requestRoom,
  async (scope, input: BookingFormInput): Promise<CreateOutcome> => {
    const env = await getWorkspaceEnv();
    const title = input.title.trim();
    if (title === "") return { result: "missing", fields: ["title"] };
    const evaluation = await evaluateBooking(env, input);
    const { check, room } = evaluation;
    if (!check.ready || room === null) return { result: "missing", fields: ["time"] };
    const blockedCount = check.series?.blocked.length ?? 0;
    const refuse = check.violations.length > 0 || check.clash !== null;
    if (refuse || evaluation.free.length === 0) return { result: "refused", check };
    // A series with clashing occurrences needs the explicit "leave them out" (SDD §23.3).
    if (blockedCount > 0 && !input.skipConflicts) return { result: "refused", check };

    const repos = await getRequestRepositories();
    const team = input.teamId === "" ? null : input.teamId;
    const base = {
      status: check.status,
      title,
      purpose: textOrNull(input.purpose),
      teamId: team,
      requestedByPersonId: scope.ctx.actor.personId,
    };
    try {
      if (input.repeat === "weekly") {
        const result = await repos.bookings.createSeries(
          scope.ctx,
          {
            roomId: room.id,
            rrule: weeklyRule(input.weekdays, input.until),
            dtstart: evaluation.free[0]!.startsAt,
            durationMin: Math.round(
              (Date.parse(evaluation.free[0]!.endsAt) - Date.parse(evaluation.free[0]!.startsAt)) /
                60_000,
            ),
            ...base,
          },
          evaluation.free,
          { skipConflicts: true },
        );
        refreshPaths();
        const first = result.created[0];
        return {
          result: "created",
          id: first?.id ?? "",
          created: result.created.length,
          skipped: evaluation.total - result.created.length,
          status: check.status,
        };
      }
      const slot = evaluation.free[0]!;
      const booking = await repos.bookings.create(scope.ctx, {
        roomId: room.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        ...base,
        attendees: attendeesOf(input.attendees),
        setupNotes: textOrNull(input.setupNotes),
        holdExpiresAt: evaluation.holdExpiresAt,
      });
      refreshPaths();
      return { result: "created", id: booking.id, created: 1, skipped: 0, status: check.status };
    } catch (error) {
      // Someone else was faster (the exclusion constraint): answer with fresh alternatives.
      if (isContractError(error, "CONFLICT")) {
        return { result: "refused", check: (await evaluateBooking(env, input)).check };
      }
      throw error;
    }
  },
);

/** A booking the actor may change: their own, or any in a room they approve. */
async function mayChange(scope: PolicyScope, booking: Booking): Promise<boolean> {
  const { tenantId } = await getRequestContext();
  if (tenantId === undefined || booking.source !== "user") return false;
  if (
    booking.requestedByPersonId !== null &&
    booking.requestedByPersonId === scope.ctx.actor.personId
  ) {
    return true;
  }
  return can(scope.actor, "booking.approve", { tenantId, roomId: booking.roomId });
}

/** Moves / edits a booking, or this and the following / all of its series. */
export const updateBooking = withPolicy(
  "room.book",
  bookingRoom,
  async (scope, id: string, input: EditInput): Promise<EditOutcome> => {
    const env = await getWorkspaceEnv();
    const { repos, now } = env;
    const booking = await repos.bookings.get(scope.ctx, id);
    if (booking === null || !(await mayChange(scope, booking))) return { result: "notAllowed" };
    const room = await repos.rooms.get(scope.ctx, booking.roomId);
    if (room === null) return { result: "notAllowed" };
    const title = input.title.trim();
    if (title === "") return { result: "missing", fields: ["title"] };
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
      !/^\d{2}:\d{2}$/.test(input.startTime) ||
      input.endTime <= input.startTime
    ) {
      return { result: "missing", fields: ["time"] };
    }

    const window = { from: "2000-01-01T00:00:00Z", to: "2100-01-01T00:00:00Z" };
    const all = (
      booking.seriesId === null
        ? [booking]
        : await repos.bookings.list(scope.ctx, { ...window, statuses: ["pending", "approved"] })
    ).filter((b) => b.seriesId === booking.seriesId || b.id === booking.id);
    const targets = scopeTargets(all, booking, input.scope);
    const deltaDays = Math.round(
      (Date.parse(`${input.date}T00:00:00Z`) -
        Date.parse(`${localParts(booking.startsAt).date}T00:00:00Z`)) /
        86_400_000,
    );

    // Check everything first so a series edit is all-or-nothing.
    const first = Math.min(...targets.map((t) => Date.parse(t.startsAt)));
    const last = Math.max(...targets.map((t) => Date.parse(t.endsAt)));
    const { occupancies } = await loadOccupancy(
      env,
      localParts(first - 86_400_000).date,
      localParts(last + (deltaDays + 1) * 86_400_000).date,
    );
    const others: Occupancy[] = occupancies.filter((o) => !targets.some((t) => t.id === o.id));
    const planned = targets.map((t) => ({
      booking: t,
      slot: retime(t, { deltaDays, startTime: input.startTime, endTime: input.endTime }),
    }));
    for (const { booking: t, slot } of planned) {
      const violations = checkRules(room.rules, slot, now);
      if (violations.length > 0) return { result: "refused", violations, clash: null };
      const clash = findClash(others, room.id, {
        ...slot,
        bufferBeforeMin: t.bufferBeforeMin,
        bufferAfterMin: t.bufferAfterMin,
      });
      if (clash) {
        return {
          result: "refused",
          violations: [],
          clash: {
            title: clash.title,
            startsAt: clash.startsAt,
            endsAt: clash.endsAt,
            source: clash.source,
            mine: false,
          },
        };
      }
    }
    try {
      for (const { booking: t, slot } of planned) {
        await repos.bookings.update(scope.ctx, t.id, {
          ...slot,
          title,
          purpose: textOrNull(input.purpose),
          attendees: attendeesOf(input.attendees),
          setupNotes: textOrNull(input.setupNotes),
        });
      }
    } catch (error) {
      if (isContractError(error, "CONFLICT")) {
        return { result: "refused", violations: [], clash: null };
      }
      throw error;
    }
    refreshPaths();
    return { result: "saved", count: planned.length };
  },
);

/** Cancels a booking, or this and the following / all upcoming ones of its series. */
export const cancelBooking = withPolicy(
  "room.book",
  bookingRoom,
  async (
    scope,
    id: string,
    editScope: "this" | "following" | "all",
  ): Promise<"ok" | "notAllowed"> => {
    const { repos, now } = await getWorkspaceEnv();
    const booking = await repos.bookings.get(scope.ctx, id);
    if (booking === null || !(await mayChange(scope, booking))) return "notAllowed";
    const window = { from: "2000-01-01T00:00:00Z", to: "2100-01-01T00:00:00Z" };
    const all =
      booking.seriesId === null
        ? [booking]
        : (
            await repos.bookings.list(scope.ctx, { ...window, statuses: ["pending", "approved"] })
          ).filter((b) => b.seriesId === booking.seriesId);
    const upcoming = scopeTargets(all, booking, editScope).filter(
      (b) => b.id === booking.id || Date.parse(b.startsAt) >= now.getTime(),
    );
    for (const target of upcoming) await repos.bookings.cancel(scope.ctx, target.id);
    refreshPaths();
    return "ok";
  },
);

/** Approves or rejects a pending request (`booking.approve`: the leader or the room's manager). */
export const decideBooking = withPolicy(
  "booking.approve",
  approvalResource,
  async (scope, id: string, decision: "approved" | "rejected"): Promise<"ok" | "invalid"> => {
    const repos = await getRequestRepositories();
    try {
      await repos.bookings.decide(scope.ctx, id, decision);
    } catch (error) {
      if (isContractError(error)) return "invalid";
      throw error;
    }
    refreshPaths();
    return "ok";
  },
);
