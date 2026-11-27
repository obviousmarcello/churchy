import { z } from "zod";

// The event projections that run on this device, for the menu item that goes
// back to the controller (see `useRunningProjections`). The controllers and
// the screens of an event tell the other windows of this browser that they
// are open, on the `BroadcastChannel` `RUNNING_CHANNEL`: every
// `RUNNING_HEARTBEAT_MS`, and at once when a window asks. They also tell when
// they close. A rehearsal projection does not show in the menu.
//
// A controller also keeps its event in `localStorage` (`LastController`).
// After it closes, e.g. when the user goes to another page, the menu listens
// on the channel of the event: while a screen of the event is open on any
// device, the projection runs.

export const RUNNING_CHANNEL = "projection:running";
export const RUNNING_HEARTBEAT_MS = 5000;
/**
 * A window that has not told it is open for this time is closed, e.g. after a
 * crash. More than a minute: Chrome runs the timers of a hidden tab only once
 * a minute, and a hidden controller is still open.
 */
export const RUNNING_TIMEOUT_MS = 75_000;
/** The menu forgets the last controller of this browser after this time. */
export const LAST_CONTROLLER_MS = 12 * 60 * 60 * 1000;

/** A controller or a screen of an event in a window of this browser. */
export type RunningWindow = {
  /** Random, one per window. */
  id: string;
  eventId: string;
  /** The title of the event. Null from a screen: it does not know the title. */
  title: string | null;
};

export type RunningMessage =
  | { type: "open"; window: RunningWindow }
  | { type: "closed"; id: string }
  /** From a window that opens: the others tell that they are open. */
  | { type: "ask" };

/** The last controller of an event in this browser. */
export type LastController = {
  eventId: string;
  title: string;
  /** When the controller opened or closed, in milliseconds. */
  seenAt: number;
  /** A screen of the event was open at `seenAt`. */
  screens: boolean;
};

/** A running projection of an event, for the menu. */
export type RunningProjection = { eventId: string; title: string | null };

const idSchema = z.string().min(1).max(100);
const titleSchema = z.string().max(400);

const messageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("open"),
    window: z.object({ id: idSchema, eventId: z.uuid(), title: titleSchema.nullable() }),
  }),
  z.object({ type: z.literal("closed"), id: idSchema }),
  z.object({ type: z.literal("ask") }),
]);

const lastControllerSchema = z.object({
  eventId: z.uuid(),
  title: titleSchema,
  seenAt: z.number().int().nonnegative(),
  screens: z.boolean(),
});

/** Null for a message that is not valid, e.g. of another version of the app. */
export function parseRunningMessage(data: unknown): RunningMessage | null {
  const result = messageSchema.safeParse(data);
  return result.success ? result.data : null;
}

/** The stored last controller. Null when there is none, it is not valid or it is older than `LAST_CONTROLLER_MS`. */
export function parseLastController(
  value: string | null | undefined,
  now: number,
): LastController | null {
  if (!value) return null;
  let data: unknown;
  try {
    data = JSON.parse(value);
  } catch {
    return null;
  }
  const result = lastControllerSchema.safeParse(data);
  if (!result.success || now - result.data.seenAt > LAST_CONTROLLER_MS) return null;
  return result.data;
}

/**
 * The running projections, one per event, in the order of their first window.
 * The title comes from a controller; else from the last controller of the
 * event, else it is null.
 */
export function runningProjections(
  windows: Iterable<RunningWindow>,
  last: LastController | null,
): RunningProjection[] {
  const byEvent = new Map<string, RunningProjection>();
  for (const { eventId, title } of windows) {
    const known = byEvent.get(eventId);
    if (!known) byEvent.set(eventId, { eventId, title });
    else if (known.title === null && title !== null) byEvent.set(eventId, { eventId, title });
  }
  return [...byEvent.values()].map((projection) =>
    projection.title === null && last?.eventId === projection.eventId
      ? { ...projection, title: last.title }
      : projection,
  );
}
