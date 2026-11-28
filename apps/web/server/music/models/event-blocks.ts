import "server-only";

import { z } from "zod";

import {
  BLOCK_COUNTDOWNS,
  EVENT_BLOCK_NAME_MAX_LENGTH,
  type EventBlock,
} from "@/lib/music/event-blocks";
import { EVENT_ITEM_DURATION_MAX_SECONDS } from "@/lib/music/event-timing";
import { requireUser } from "@/server/music/auth";
import { getMusicSupabase } from "@/server/music/db";
import { ConflictError } from "@/server/music/errors";
import { zodMessage } from "@/server/music/zod-i18n";
import { requireEventAdminOf } from "./event-access";
import { databaseError, idSchema, isId, parseInput, requiredText } from "./shared";

// The blocks of the items of an event: a name for some adjacent items, with
// an optional countdown (see `@/lib/event-blocks` and the migration
// `event_blocks`). The event admins make, change and remove them. A user who
// can project the event starts the countdown "remaining" of a block
// (`startEventBlock` in `./projections`).

export type EventBlockDTO = EventBlock;

export const eventBlocksRowSchema = z.array(
  z.object({
    key: z.uuid(),
    name: z.string(),
    countdown: z.enum(BLOCK_COUNTDOWNS),
    // "10:00:00"
    countdown_until: z.string().nullable(),
    duration_seconds: z.number().int().nullable(),
    started_at: z.string().nullable(),
    created_at: z.string(),
  }),
);

export function toEventBlocks(rows: z.infer<typeof eventBlocksRowSchema>): EventBlockDTO[] {
  return rows
    .toSorted((a, b) => a.created_at.localeCompare(b.created_at))
    .map((row) => ({
      key: row.key,
      name: row.name,
      countdown: row.countdown,
      until: row.countdown_until?.slice(0, 5) ?? null,
      durationSeconds: row.duration_seconds,
      startedAt: row.started_at === null ? null : new Date(row.started_at).toISOString(),
    }));
}

const UNTIL_REQUIRED = zodMessage(({ m }) => m.server.eventBlocks.untilRequired);

/** The name and the countdown of a block. `until` only for the countdown "until". */
const blockDetailsSchema = z
  .strictObject({
    name: requiredText(EVENT_BLOCK_NAME_MAX_LENGTH),
    countdown: z.enum(BLOCK_COUNTDOWNS),
    until: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullish(),
    /** The planned time of the whole block. Null or left out: the times of its items. */
    durationSeconds: z.number().int().min(1).max(EVENT_ITEM_DURATION_MAX_SECONDS).nullish(),
  })
  .refine((block) => block.countdown !== "until" || block.until, {
    message: UNTIL_REQUIRED,
    path: ["until"],
  });

const newBlockInputSchema = z.strictObject({
  /** The keys of the items, adjacent in the event. */
  itemKeys: z.array(idSchema).min(1).max(100),
  details: blockDetailsSchema,
});

export type EventBlockDetailsInput = z.input<typeof blockDetailsSchema>;

function detailsArguments(details: z.output<typeof blockDetailsSchema>) {
  return {
    p_name: details.name,
    p_countdown: details.countdown,
    p_until: details.countdown === "until" ? details.until : null,
  };
}

/**
 * A new block of the items of the keys, which must be adjacent in the event.
 * An item in another block leaves it. Returns the key of the block, or null
 * if there is no such event, or the user cannot see it.
 */
export async function createEventBlock(eventId: string, input: unknown): Promise<string | null> {
  if ((await requireEventAdminOf(eventId)) === null) return null;
  const { itemKeys, details } = parseInput(newBlockInputSchema, input);

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("create_event_block", {
    p_event_id: eventId,
    p_item_keys: itemKeys,
    ...detailsArguments(details),
  });
  if (error) throw databaseError("create event block", error);

  const result = z
    .discriminatedUnion("status", [
      z.object({ status: z.literal("created"), key: z.uuid() }),
      z.object({ status: z.literal("no_item") }),
      // An item of a block is not for a new block, e.g. after a change of another user.
      z.object({ status: z.literal("in_block") }),
      z.object({ status: z.literal("apart") }),
    ])
    .nullable()
    .parse(data);
  if (!result) return null;
  if (result.status === "no_item")
    throw new ConflictError(({ m }) => m.server.eventBlocks.itemMissing);
  if (result.status === "in_block")
    throw new ConflictError(({ m }) => m.server.eventBlocks.itemInBlock);
  if (result.status === "apart")
    throw new ConflictError(({ m }) => m.server.eventBlocks.itemsApart);
  return result.key;
}

/** A new name or countdown of the block. Another kind of countdown starts again. False if there is no such block, or the user cannot see the event. */
export async function updateEventBlock(
  eventId: string,
  key: string,
  input: unknown,
): Promise<boolean> {
  if (!isId(key) || (await requireEventAdminOf(eventId)) === null) return false;
  const details = parseInput(blockDetailsSchema, input);

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("update_event_block", {
    p_event_id: eventId,
    p_key: key,
    ...detailsArguments(details),
    p_duration_seconds: details.durationSeconds ?? null,
  });
  if (error) throw databaseError("update event block", error);
  return z.boolean().parse(data);
}

/** "Remove block": the block goes away, its items stay. False if there is no such block, or the user cannot see the event. */
export async function deleteEventBlock(eventId: string, key: string): Promise<boolean> {
  if (!isId(key) || (await requireEventAdminOf(eventId)) === null) return false;

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("delete_event_block", { p_event_id: eventId, p_key: key });
  if (error) throw databaseError("delete event block", error);
  return z.boolean().parse(data);
}

/**
 * The blocks of the event, without its items: after a change of a block, e.g.
 * the start of its countdown. Null if there is no such event. It does not
 * check the session.
 */
export async function readEventBlocks(eventId: string): Promise<EventBlockDTO[] | null> {
  if (!isId(eventId)) return null;
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_blocks")
    .select("key, name, countdown, countdown_until, duration_seconds, started_at, created_at")
    .eq("event_id", eventId);
  if (error) throw databaseError("read event blocks", error);
  return toEventBlocks(eventBlocksRowSchema.parse(data));
}

/** The blocks of the event (see `readEventBlocks`). Null if there is no such event, or the user cannot see it. */
export async function getEventBlocks(eventId: string): Promise<EventBlockDTO[] | null> {
  await requireUser();
  return readEventBlocks(eventId);
}
