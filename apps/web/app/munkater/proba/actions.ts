"use server";

import { refresh } from "next/cache";

import { getRequestI18n } from "@/i18n/music/server";
import { errorState, fieldError, text, type FormState } from "@/server/music/form-state";
import { addEventItems, createEventWithItems } from "@/server/music/models/events";
import { musicEvents } from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { readEventInput } from "../esemenyek/editor/event-input";

export type SaveSetlistState = FormState & {
  /** The event that got the items, after a success. */
  eventId: string | null;
};

// The models check the event admin role and validate the input. This action
// only turns the form fields into their input and its errors into form state.

/**
 * Saves the rehearsal setlist as the items of an event: an existing event
 * (`target` is "existing") or a new one. An existing event keeps its items:
 * the setlist goes after them. Call it directly, not with `useActionState`:
 * the page clears the draft after a success.
 */
export const saveSetlistAction = withPolicy(
  "music.event.manage",
  musicEvents,
  async (_scope: PolicyScope, formData: FormData): Promise<SaveSetlistState> => {
    const i18n = await getRequestI18n();
    const { m } = i18n;
    // One `items` field: the JSON list of the items, in playing order (see `RehearsalBuilder`).
    let items: unknown;
    try {
      items = JSON.parse(text(formData, "items"));
    } catch {
      return { ...fieldError("items", m.events.actions.itemsInvalid), eventId: null };
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { ...fieldError("items", m.rehearsal.actions.addItems), eventId: null };
    }

    if (text(formData, "target") === "existing") {
      const eventId = text(formData, "eventId");
      if (!eventId)
        return { ...fieldError("eventId", m.rehearsal.actions.selectEvent), eventId: null };

      try {
        const result = await addEventItems(eventId, { items, afterKey: null });
        if (result === "no_event") {
          return {
            status: "error",
            message: m.rehearsal.actions.eventNotFound,
            fieldErrors: {},
            eventId: null,
          };
        }
        if (result === "too_many_items") {
          return {
            status: "error",
            message: m.rehearsal.actions.tooManyItems,
            fieldErrors: {},
            eventId: null,
          };
        }
      } catch (error) {
        return {
          ...(await errorState(error, ({ m }) => m.rehearsal.actions.itemsNotSaved)),
          eventId: null,
        };
      }
      refresh();
      return {
        status: "success",
        message: m.rehearsal.actions.itemsSaved,
        fieldErrors: {},
        eventId,
      };
    }

    const input = readEventInput(formData, i18n);
    if ("status" in input) return { ...input, eventId: null };

    try {
      const event = await createEventWithItems({ ...input, items });
      refresh();
      return {
        status: "success",
        message: m.rehearsal.actions.eventAdded,
        fieldErrors: {},
        eventId: event.id,
      };
    } catch (error) {
      return {
        ...(await errorState(error, ({ m }) => m.rehearsal.actions.eventNotSaved)),
        eventId: null,
      };
    }
  },
);
