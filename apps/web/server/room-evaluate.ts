import type { Room } from "@churchy/contracts";
import {
  checkRules,
  decideApproval,
  expandWeekly,
  findAlternatives,
  findClash,
  localToInstant,
  seriesHorizon,
  type Occurrence,
  type Occupancy,
} from "@churchy/booking";
import { can } from "@churchy/policy";
import type {
  BlockedOccurrence,
  BookingCheck,
  BookingFormInput,
  ClashInfo,
} from "@/lib/rooms/types";
import { getActorWorkspaceRoles } from "@/server/session";
import { loadOccupancy } from "@/server/rooms";
import type { WorkspaceEnv } from "@/server/workspace";

/**
 * The one evaluation of a booking request (D-60, D-61): the room's rules, clashes with bookings
 * and service blocks, alternatives, the series expansion and the starting status. The live check
 * of the form and the save use it, so what the form promised is what the save does.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface Evaluation {
  check: BookingCheck;
  room: Room | null;
  /** Occurrences that can be booked (one for a single booking). */
  free: Occurrence[];
  total: number;
  holdExpiresAt: string | null;
}

const empty = (problem: BookingCheck["problem"]): BookingCheck => ({
  ready: false,
  problem,
  violations: [],
  clash: null,
  alternativeRooms: [],
  alternativeSlots: [],
  series: null,
  status: "pending",
  holdHours: null,
});

function clashInfo(o: Occupancy, personId: string | null, mineIds: Set<string>): ClashInfo {
  return {
    title: o.title,
    startsAt: o.startsAt,
    endsAt: o.endsAt,
    source: o.source,
    mine: personId !== null && mineIds.has(o.id),
  };
}

export async function evaluateBooking(
  env: WorkspaceEnv,
  input: BookingFormInput,
): Promise<Evaluation> {
  const { repos, ctx, now, actor, tenantId } = env;
  const room = await repos.rooms.get(ctx, input.roomId);
  if (room === null || !room.active)
    return { check: empty("room"), room: null, free: [], total: 0, holdExpiresAt: null };
  if (
    !DATE.test(input.date) ||
    !TIME.test(input.startTime) ||
    !TIME.test(input.endTime) ||
    input.endTime <= input.startTime
  ) {
    return { check: empty("time"), room, free: [], total: 0, holdExpiresAt: null };
  }
  const weekly = input.repeat === "weekly";
  if (weekly && (input.weekdays.length === 0 || !DATE.test(input.until))) {
    return { check: empty("weekdays"), room, free: [], total: 0, holdExpiresAt: null };
  }

  const today = env.today;
  const occurrences: Occurrence[] = weekly
    ? expandWeekly({
        from: input.date,
        until: input.until < input.date ? input.date : input.until,
        weekdays: input.weekdays,
        startTime: input.startTime,
        endTime: input.endTime,
        today,
      })
    : [
        {
          startsAt: localToInstant(input.date, input.startTime),
          endsAt: localToInstant(input.date, input.endTime),
        },
      ];
  if (occurrences.length === 0)
    return { check: empty("weekdays"), room, free: [], total: 0, holdExpiresAt: null };

  const lastDate = weekly
    ? input.until < seriesHorizon(today)
      ? input.until
      : seriesHorizon(today)
    : input.date;
  const { occupancies, bookings } = await loadOccupancy(
    env,
    input.date,
    lastDate < input.date ? input.date : lastDate,
  );
  const personId = ctx.actor.personId;
  const mineIds = new Set(
    bookings
      .filter((b) => personId !== null && b.requestedByPersonId === personId)
      .map((b) => b.id),
  );

  const blocked: BlockedOccurrence[] = [];
  const free: Occurrence[] = [];
  let firstClash: Occupancy | undefined;
  for (const occ of occurrences) {
    const violations = checkRules(room.rules, occ, now);
    const clash = findClash(occupancies, room.id, occ);
    if (!firstClash && clash) firstClash = clash;
    if (violations.length === 0 && !clash) {
      free.push(occ);
    } else {
      blocked.push({
        startsAt: occ.startsAt,
        title: clash?.title ?? null,
        rule: violations[0]?.rule ?? null,
        detail: violations[0]?.detail ?? null,
        source: clash?.source ?? null,
      });
    }
  }

  // Alternatives only when the (first) slot clashes: other rooms of the place and nearby times.
  let alternativeRooms: BookingCheck["alternativeRooms"] = [];
  let alternativeSlots: BookingCheck["alternativeSlots"] = [];
  if (firstClash) {
    const rooms = await repos.rooms.list(ctx, { activeOnly: true });
    const attendees = Number.parseInt(input.attendees, 10);
    const alt = findAlternatives({
      rooms,
      occupancies,
      roomId: room.id,
      slot: occurrences[0]!,
      attendees: Number.isFinite(attendees) && attendees > 0 ? attendees : null,
      features: room.features,
      accept: (r, slot) =>
        checkRules(r.rules, slot, now).length === 0 &&
        can(actor, "room.book", { tenantId, roomId: r.id, whoCanRequest: r.rules.whoCanRequest }),
    });
    alternativeRooms = alt.rooms.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity }));
    alternativeSlots = alt.slots.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt }));
  }

  const approval = decideApproval(
    room.approvalPolicy,
    {
      roles: await getActorWorkspaceRoles(),
      teamIds: actorTeamIds(env),
      mayApprove: can(actor, "booking.approve", { tenantId, roomId: room.id }),
    },
    input.teamId === "" ? null : input.teamId,
    now,
  );

  return {
    room,
    free,
    total: occurrences.length,
    holdExpiresAt: approval.holdExpiresAt,
    check: {
      ready: true,
      problem: null,
      violations: weekly ? [] : checkRules(room.rules, occurrences[0]!, now),
      clash: !weekly && firstClash ? clashInfo(firstClash, personId, mineIds) : null,
      alternativeRooms,
      alternativeSlots,
      series: weekly ? { total: occurrences.length, blocked } : null,
      status: approval.status,
      holdHours: approval.status === "pending" ? room.approvalPolicy.holdHours : null,
    },
  };
}

/** Teams the actor belongs to (policy actor scope, never a role list). */
function actorTeamIds(env: WorkspaceEnv): readonly string[] {
  return env.me?.memberTeamIds ?? [];
}
