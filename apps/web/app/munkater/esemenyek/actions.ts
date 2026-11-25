"use server";

import { redirect } from "next/navigation";
import { errorState, text, type FormState } from "@/server/music/form-state";
import { churchTime } from "@/lib/music/church-time";
import {
  addEventArrangement,
  addEventItems,
  changeOccurrence,
  createEvent,
  deleteEvent,
  getEventDetail,
  removeEventItem,
  setEventItems,
  skipOccurrence,
  updateEvent,
} from "@/server/music/models/events";
import { createEventBlock, deleteEventBlock } from "@/server/music/models/event-blocks";
import { itemsToInput } from "@/server/music/models/setlists";
import { musicEvents } from "@/server/music/policy";
import { withPolicy } from "@/server/policy";

// Every action: `music.event.manage` (leader, music leader), the events module must be on, and the
// models check the role again. Dates: a `datetime-local` value is Budapest wall-clock time.

const RRULES: Record<string, string | null> = {
  none: null,
  weekly: "FREQ=WEEKLY",
  biweekly: "FREQ=WEEKLY;INTERVAL=2",
  monthly: "FREQ=MONTHLY",
};

function parseLocal(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as number[];
  return churchTime(y!, mo!, d!, h!, mi!).toISOString();
}

function readEventFields(formData: FormData) {
  const startsAt = parseLocal(text(formData, "startsAt"));
  return {
    title: text(formData, "title"),
    startsAt: startsAt ?? "",
    durationMinutes: Number(text(formData, "durationMinutes")) || 90,
    youtubeUrl: text(formData, "youtubeUrl"),
    isPrivate: formData.get("isPrivate") === "on",
  };
}

export const createEventAction = withPolicy(
  "music.event.manage",
  musicEvents,
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    const rrule = RRULES[text(formData, "recurrence")] ?? null;
    let id: string;
    try {
      id = (await createEvent({ ...readEventFields(formData), rrule })).id;
    } catch (error) {
      return errorState(error, ({ m }) => m.events.errors.saveFailed);
    }
    redirect(`/munkater/esemenyek/${id}`);
  },
);

export const updateEventAction = withPolicy(
  "music.event.manage",
  musicEvents,
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    const id = text(formData, "id");
    const recurrenceId = text(formData, "recurrenceId");
    try {
      const fields = readEventFields(formData);
      const saved = recurrenceId
        ? await changeOccurrence({ masterId: id, recurrenceId }, fields)
        : await updateEvent(id, fields);
      if (saved === null) return errorState(new Error("gone"), ({ m }) => m.events.errors.notFound);
      redirect(`/munkater/esemenyek/${saved.id}`);
    } catch (error) {
      if (isRedirect(error)) throw error;
      return errorState(error, ({ m }) => m.events.errors.saveFailed);
    }
  },
);

function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}

export const deleteEventAction = withPolicy(
  "music.event.manage",
  musicEvents,
  async (_scope, formData: FormData): Promise<FormState> => {
    try {
      await deleteEvent(text(formData, "id"));
    } catch (error) {
      return errorState(error, ({ m }) => m.events.errors.saveFailed);
    }
    redirect("/munkater/esemenyek");
  },
);

export const skipOccurrenceAction = withPolicy(
  "music.event.manage",
  musicEvents,
  async (_scope, formData: FormData): Promise<FormState> => {
    try {
      await skipOccurrence({
        masterId: text(formData, "id"),
        recurrenceId: text(formData, "recurrenceId"),
      });
    } catch (error) {
      return errorState(error, ({ m }) => m.events.errors.saveFailed);
    }
    redirect("/munkater/esemenyek");
  },
);

type ItemsResult = { ok: boolean; message: "full" | "ended" | "noArrangement" | "changed" | null };

/** Adds one song (an arrangement) at the end of the event's items. */
export const addSongAction = withPolicy(
  "music.event.manage",
  musicEvents,
  async (_scope, formData: FormData): Promise<ItemsResult> => {
    const result = await addEventArrangement({
      eventId: text(formData, "id"),
      arrangementId: text(formData, "arrangementId"),
      musicalKey: text(formData, "musicalKey") || null,
    });
    if (result === "added") return { ok: true, message: null };
    return {
      ok: false,
      message:
        result === "too_many_items" ? "full" : result === "ended" ? "ended" : "noArrangement",
    };
  },
);

export const addTextItemAction = withPolicy(
  "music.event.manage",
  musicEvents,
  async (_scope, formData: FormData): Promise<ItemsResult> => {
    const result = await addEventItems(text(formData, "id"), {
      items: [
        {
          kind: "text",
          title: text(formData, "title"),
          notes: text(formData, "notes") || null,
        },
      ],
      afterKey: null,
    });
    return result === "added"
      ? { ok: true, message: null }
      : { ok: false, message: result === "too_many_items" ? "full" : "noArrangement" };
  },
);

export const removeItemAction = withPolicy(
  "music.event.manage",
  musicEvents,
  async (_scope, formData: FormData): Promise<ItemsResult> => {
    const removed = await removeEventItem(text(formData, "id"), text(formData, "key"));
    return { ok: removed, message: removed ? null : "changed" };
  },
);

/** Moves one item up or down by saving the items again in the new order. */
export const moveItemAction = withPolicy(
  "music.event.manage",
  musicEvents,
  async (_scope, formData: FormData): Promise<ItemsResult> => {
    const event = await getEventDetail(text(formData, "id"));
    if (event === null) return { ok: false, message: "changed" };
    const items = itemsToInput(event.items);
    const from = items.findIndex((item) => item.key === text(formData, "key"));
    const to = from + (text(formData, "direction") === "up" ? -1 : 1);
    if (from < 0 || to < 0 || to >= items.length) return { ok: false, message: "changed" };
    [items[from], items[to]] = [items[to]!, items[from]!];
    const saved = await setEventItems(event.id, { items, baseSetlistId: event.setlistId });
    return saved?.status === "saved"
      ? { ok: true, message: null }
      : { ok: false, message: "changed" };
  },
);

export const createBlockAction = withPolicy(
  "music.event.manage",
  musicEvents,
  async (_scope, formData: FormData): Promise<{ ok: boolean; message: string | null }> => {
    try {
      await createEventBlock(text(formData, "id"), {
        itemKeys: formData.getAll("itemKeys").map(String),
        details: { name: text(formData, "name"), countdown: "off" },
      });
      return { ok: true, message: null };
    } catch (error) {
      const state = await errorState(error, ({ m }) => m.events.errors.saveFailed);
      return { ok: false, message: state.message };
    }
  },
);

export const deleteBlockAction = withPolicy(
  "music.event.manage",
  musicEvents,
  async (_scope, formData: FormData): Promise<{ ok: boolean }> => ({
    ok: await deleteEventBlock(text(formData, "id"), text(formData, "key")),
  }),
);
