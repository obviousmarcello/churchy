"use server";

import { redirect } from "next/navigation";
import { errorState, text, type FormState } from "@/server/music/form-state";
import { churchTime } from "@/lib/music/church-time";
import { MAX_SERIES_EVENTS } from "@/lib/music/event-series";
import {
  changeOccurrence,
  createEvent,
  deleteEvent,
  getEventDetail,
  updateEvent,
} from "@/server/music/models/events";
import { syncPlansFromSetlist } from "@/server/music/plan-link";
import { musicEventIn } from "@/server/music/policy";
import { withPolicy } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";
import { isContractError } from "@churchy/contracts";

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
  musicEventIn,
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    const rrule = RRULES[text(formData, "recurrence")] ?? null;
    let id: string;
    try {
      const areaIds = formData.getAll("areaIds").map(String);
      id = (
        await createEvent({
          ...readEventFields(formData),
          rrule,
          ...(areaIds.length > 0 && { areaIds }),
        })
      ).id;
    } catch (error) {
      return errorState(error, ({ m }) => m.events.errors.saveFailed);
    }
    redirect(`/munkater/esemenyek/${id}`);
  },
);

export const updateEventAction = withPolicy(
  "music.event.manage",
  musicEventIn,
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
  musicEventIn,
  async (_scope, formData: FormData): Promise<FormState> => {
    try {
      await deleteEvent(text(formData, "id"), {
        endProjections: text(formData, "endProjections") === "1",
      });
    } catch (error) {
      return errorState(error, ({ m }) => m.events.errors.saveFailed);
    }
    redirect("/munkater/esemenyek");
  },
);

/** The linked plans take over the songs of the event after a successful change (never fails the change). */
async function afterItems(eventId: string): Promise<void> {
  try {
    await syncPlansFromSetlist(eventId);
  } catch (error) {
    console.error("[music] plan sync failed:", error);
  }
}

/** A new liturgy plan for the event (`service_plans.event_id`); its songs start from the event's setlist. */
export const createEventPlanAction = withPolicy(
  "servicePlan.edit",
  musicEventIn,
  async (scope, formData: FormData): Promise<{ planId: string | null }> => {
    const eventId = text(formData, "id");
    const event = await getEventDetail(eventId);
    const leaderPersonId = scope.ctx.actor.personId;
    if (event === null || leaderPersonId === null) return { planId: null };
    try {
      const repos = await getRequestRepositories();
      const plan = await repos.servicePlans.upsert(scope.ctx, {
        eventId,
        title: event.title,
        leaderPersonId,
      });
      await afterItems(eventId);
      return { planId: plan.id };
    } catch (error) {
      if (isContractError(error)) return { planId: null };
      throw error;
    }
  },
);

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/**
 * Several events in one go (the bulk form): for each time slot one series (a master with a weekly
 * RRULE on the chosen weekdays, until the last day). Local dates and times are Budapest time.
 */
export const createSeriesAction = withPolicy(
  "music.event.manage",
  musicEventIn,
  async (_scope, formData: FormData): Promise<FormState & { created?: number }> => {
    const from = text(formData, "from");
    const until = text(formData, "until");
    const weekdays = formData
      .getAll("weekday")
      .map(Number)
      .filter((day) => day >= 0 && day <= 6);
    const titles = formData.getAll("slotTitle").map(String);
    const times = formData.getAll("slotTime").map(String);
    const durations = formData.getAll("slotDuration").map(Number);
    const slots = titles.flatMap((title, index) =>
      title.trim() !== "" && /^\d{2}:\d{2}$/.test(times[index] ?? "")
        ? [{ title, time: times[index]!, duration: durations[index] || 90 }]
        : [],
    );
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from);
    const last = /^(\d{4})-(\d{2})-(\d{2})$/.exec(until);
    if (!day || !last || weekdays.length === 0 || slots.length === 0 || until < from) {
      return { status: "error", message: null, fieldErrors: { from: [""] } };
    }
    // The first occurrence on or after `from`, and the cap of `MAX_SERIES_EVENTS` events in all.
    const start = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
    const end = new Date(Date.UTC(Number(last[1]), Number(last[2]) - 1, Number(last[3])));
    let count = 0;
    let first: Date | null = null;
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      if (!weekdays.includes(d.getUTCDay())) continue;
      first ??= new Date(d);
      count += slots.length;
    }
    if (first === null || count > MAX_SERIES_EVENTS) {
      return { status: "error", message: null, fieldErrors: { until: [""] } };
    }
    try {
      for (const slot of slots) {
        const [hour, minute] = slot.time.split(":").map(Number) as [number, number];
        const startsAt = churchTime(
          first.getUTCFullYear(),
          first.getUTCMonth() + 1,
          first.getUTCDate(),
          hour,
          minute,
        ).toISOString();
        await createEvent({
          title: slot.title,
          startsAt,
          durationMinutes: slot.duration,
          rrule: `FREQ=WEEKLY;BYDAY=${weekdays.map((d) => WEEKDAY_CODES[d]).join(",")};UNTIL=${until.replaceAll("-", "")}`,
          ...(formData.get("isPrivate") === "on" && { isPrivate: true }),
        });
      }
    } catch (error) {
      return errorState(error, ({ m }) => m.events.errors.saveFailed);
    }
    redirect("/munkater/esemenyek");
  },
);
