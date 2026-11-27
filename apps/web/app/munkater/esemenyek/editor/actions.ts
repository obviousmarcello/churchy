"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { Text } from "@/i18n/music/i18n";
import { getRequestI18n } from "@/i18n/music/server";
import { ProjectionOpenError, ProjectionUserError } from "@/server/music/errors";
import {
  errorState,
  fieldError,
  runSave,
  runUpdate,
  text,
  type FormState,
  type SaveResult,
} from "@/server/music/form-state";
import {
  addEventVolunteer,
  copyEvent,
  createEvent,
  deleteEvent,
  listUpcomingEventsForVolunteer,
  removeEventVolunteer,
  setEventItems,
  type EventItemsInput,
  setMyReply,
  updateEvent,
  type EventForVolunteerDTO,
} from "@/server/music/models/events";
import {
  createEventBlock,
  deleteEventBlock,
  updateEventBlock,
} from "@/server/music/models/event-blocks";
import { setEventTeams } from "@/server/music/models/event-teams";
import type { SetlistItemDTO } from "@/server/music/models/setlists";
import { sameEventAreas } from "@/lib/music/event-scopes";
import { musicEventIn, musicEvents } from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { readEventInput } from "./event-input";

export type EventFormState = FormState;

const NOT_FOUND: Text = ({ m }) => m.events.actions.notFound;

// The models check the event admin role and validate the input. These actions only
// turn the form fields into their input and their errors into form state.

export const createEventAction = withPolicy(
  "music.event.manage",
  musicEventIn,
  async (
    _scope: PolicyScope,
    _previous: EventFormState,
    formData: FormData,
  ): Promise<EventFormState> => {
    const input = readEventInput(formData, await getRequestI18n());
    if ("status" in input) return input;

    let id: string;
    try {
      const event = await createEvent(input);
      id = event.id;
    } catch (error) {
      return errorState(error, ({ m }) => m.events.actions.saveFailed);
    }

    // Outside the try block: `redirect` throws to stop the action.
    redirect(`/munkater/esemenyek/${id}`);
  },
);

/** Copies the event `id` with the details of the form, and the items and the volunteers if the boxes are on. */
export const copyEventAction = withPolicy(
  "music.event.manage",
  musicEventIn,
  async (
    _scope: PolicyScope,
    _previous: EventFormState,
    formData: FormData,
  ): Promise<EventFormState> => {
    const input = readEventInput(formData, await getRequestI18n());
    if ("status" in input) return input;

    let id: string;
    try {
      const event = await copyEvent(text(formData, "id"), {
        ...input,
        copyItems: formData.get("copyItems") === "on",
        copyVolunteers: formData.get("copyVolunteers") === "on",
      });
      if (!event)
        return { status: "error", message: NOT_FOUND(await getRequestI18n()), fieldErrors: {} };
      id = event.id;
    } catch (error) {
      return errorState(error, ({ m }) => m.events.actions.copyFailed);
    }

    redirect(`/munkater/esemenyek/${id}`);
  },
);

/**
 * The form state of an error. A change that would take an open projection
 * from its user gets the field `endProjections`: the form asks whether to
 * end the projection (see `endingProjections`).
 */
async function changeErrorState(error: unknown, failure: Text): Promise<EventFormState> {
  if (error instanceof ProjectionUserError) {
    return {
      status: "error",
      message: null,
      fieldErrors: { endProjections: [error.text(await getRequestI18n())] },
    };
  }
  return errorState(error, failure);
}

/**
 * Saves the details of the form. With `original` (the values that the form
 * started with), only the fields that the user changed: the others keep the
 * changes of other users in the meantime. With `endProjections`, a change that
 * takes an open projection from its user ends it.
 */
export const updateEventAction = withPolicy(
  "music.event.manage",
  musicEventIn,
  async (
    _scope: PolicyScope,
    _previous: EventFormState,
    formData: FormData,
  ): Promise<EventFormState> => {
    const i18n = await getRequestI18n();
    const input = readEventInput(formData, i18n);
    if ("status" in input) return input;

    try {
      const event = await updateEvent(
        text(formData, "id"),
        changedFields(input, text(formData, "original")),
        {
          endProjections: formData.get("endProjections") === "on",
        },
      );
      if (!event) return { status: "error", message: NOT_FOUND(i18n), fieldErrors: {} };
    } catch (error) {
      return changeErrorState(error, ({ m }) => m.events.actions.saveFailed);
    }

    refresh();
    return { status: "success", message: i18n.m.events.actions.saved, fieldErrors: {} };
  },
);

/** The fields of `input` that differ from the JSON of the values that the form started with. All of them without it. */
function changedFields(
  input: Exclude<ReturnType<typeof readEventInput>, { status: unknown }>,
  originalJson: string,
) {
  let original: Record<string, unknown>;
  try {
    original = JSON.parse(originalJson);
  } catch {
    return input;
  }
  if (typeof original !== "object" || original === null) return input;
  const sameTime =
    typeof original.startsAt === "string" &&
    Date.parse(original.startsAt) === Date.parse(input.startsAt);
  return {
    ...(input.title.trim() !== original.title && { title: input.title }),
    ...(!sameTime && { startsAt: input.startsAt }),
    ...(input.durationMinutes !== original.durationMinutes && {
      durationMinutes: input.durationMinutes,
    }),
    ...((input.youtubeUrl.trim() || null) !== (original.youtubeUrl ?? null) && {
      youtubeUrl: input.youtubeUrl,
    }),
    ...(input.isPrivate !== original.isPrivate && { isPrivate: input.isPrivate }),
    ...(input.areaIds !== undefined &&
      !(Array.isArray(original.areaIds) && sameEventAreas(input.areaIds, original.areaIds)) && {
        areaIds: input.areaIds,
      }),
  };
}

/** With `endProjections`, an open projection of the event ends; without it, the delete asks first. */
export const deleteEventAction = withPolicy(
  "music.event.manage",
  musicEventIn,
  async (
    _scope: PolicyScope,
    _previous: EventFormState,
    formData: FormData,
  ): Promise<EventFormState> => {
    try {
      const deleted = await deleteEvent(text(formData, "id"), {
        endProjections: formData.get("endProjections") === "on",
      });
      if (!deleted)
        return { status: "error", message: NOT_FOUND(await getRequestI18n()), fieldErrors: {} };
    } catch (error) {
      if (error instanceof ProjectionOpenError) {
        return {
          status: "error",
          message: null,
          fieldErrors: { endProjections: [error.text(await getRequestI18n())] },
        };
      }
      return errorState(error, ({ m }) => m.events.actions.deleteFailed);
    }

    redirect("/munkater/esemenyek");
  },
);

/**
 * The result of a save of the items (see `setEventItems`). "changed": the
 * event has other items now, and kept them: merge with `items` and save again.
 */
export type ItemsSaveResult =
  | { status: "saved"; setlistId: string | null }
  | { status: "changed"; setlistId: string | null; items: SetlistItemDTO[] }
  | { status: "error"; message: string };

/**
 * Saves the items, in order, over the setlist `baseSetlistId` (see `ItemsForm`).
 * After a save, the page shows the new values.
 */
export const saveItemsAction = withPolicy(
  "music.event.manage",
  musicEventIn,
  async (
    _scope: PolicyScope,
    eventId: string,
    items: unknown,
    baseSetlistId: string | null,
  ): Promise<ItemsSaveResult> => {
    const i18n = await getRequestI18n();
    try {
      const result = await setEventItems(eventId, {
        items: items as EventItemsInput["items"],
        baseSetlistId,
      });
      if (!result) return { status: "error", message: NOT_FOUND(i18n) };
      if (result.status === "saved") refresh();
      return result;
    } catch (error) {
      const state = await errorState(error, ({ m }) => m.events.actions.itemsSaveFailed);
      return {
        status: "error",
        message:
          Object.values(state.fieldErrors)[0]?.[0] ??
          state.message ??
          i18n.m.events.actions.itemsSaveFailed,
      };
    }
  },
);

export type CreateBlockResult =
  { status: "success"; key: string } | { status: "error"; message: string };

/**
 * A new block of the adjacent items of the keys, with a name and the
 * countdown of its time (see `createEventBlock`). The page shows the block, where the
 * user changes its name and countdown.
 */
export const createEventBlockAction = withPolicy(
  "music.event.manage",
  musicEventIn,
  async (
    _scope: PolicyScope,
    eventId: string,
    itemKeys: unknown,
    name: unknown,
  ): Promise<CreateBlockResult> => {
    try {
      const key = await createEventBlock(eventId, {
        itemKeys,
        details: { name, countdown: "remaining" },
      });
      if (key === null) return { status: "error", message: NOT_FOUND(await getRequestI18n()) };
      refresh();
      return { status: "success", key };
    } catch (error) {
      const state = await errorState(error, ({ m }) => m.events.actions.blockSaveFailed);
      return {
        status: "error",
        message: Object.values(state.fieldErrors).flat()[0] ?? state.message ?? "",
      };
    }
  },
);

/** A new name or countdown of the block. The page shows it: a success has no message. */
export const updateEventBlockAction = withPolicy(
  "music.event.manage",
  musicEventIn,
  async (
    _scope: PolicyScope,
    eventId: string,
    key: string,
    details: unknown,
  ): Promise<EventFormState> => {
    const state = await runUpdate(
      {
        success: () => "",
        failure: ({ m }) => m.events.actions.blockSaveFailed,
        notFound: ({ m }) => m.server.eventBlocks.blockMissing,
      },
      () => updateEventBlock(eventId, key, details),
    );
    return state.status === "success" ? { ...state, message: null } : state;
  },
);

/** "Remove block": the block goes away, its items stay. */
export const deleteEventBlockAction = withPolicy(
  "music.event.manage",
  musicEventIn,
  async (_scope: PolicyScope, eventId: string, key: string): Promise<SaveResult> => {
    const result = await runSave(
      {
        failure: ({ m }) => m.events.actions.blockDeleteFailed,
        notFound: ({ m }) => m.server.eventBlocks.blockMissing,
      },
      () => deleteEventBlock(eventId, key),
    );
    if (result.status === "success") refresh();
    return result;
  },
);

export const addVolunteerAction = withPolicy(
  "music.event.manage",
  musicEventIn,
  async (
    _scope: PolicyScope,
    _previous: EventFormState,
    formData: FormData,
  ): Promise<EventFormState> => {
    const userId = text(formData, "userId");
    if (!userId) return fieldError("userId", (await getRequestI18n()).m.events.actions.selectUser);

    return runUpdate(
      {
        success: ({ m }) => m.events.actions.volunteerAdded,
        failure: ({ m }) => m.events.actions.volunteerAddFailed,
        notFound: NOT_FOUND,
      },
      () => addEventVolunteer(text(formData, "id"), userId),
    );
  },
);

// "Add to event" of a user in the search palette (`src/components/add-volunteer-dialog.tsx`).

/** The upcoming events for the dialog, or null when they did not load. */
export const listEventsForVolunteerAction = withPolicy(
  "music.event.manage",
  musicEvents,
  async (_scope: PolicyScope, userId: string): Promise<EventForVolunteerDTO[] | null> => {
    try {
      return await listUpcomingEventsForVolunteer(typeof userId === "string" ? userId : "");
    } catch (error) {
      console.error("[events] Failed to list the events for a volunteer:", error);
      return null;
    }
  },
);

/** Makes the user a volunteer of the event. A success has no message: the dialog shows it. */
export const addVolunteerToEventAction = withPolicy(
  "music.event.manage",
  musicEventIn,
  async (
    _scope: PolicyScope,
    input: {
      eventId: string;
      userId: string;
    },
  ): Promise<EventFormState> => {
    const eventId = typeof input?.eventId === "string" ? input.eventId : "";
    const userId = typeof input?.userId === "string" ? input.userId : "";
    try {
      if (!(await addEventVolunteer(eventId, userId))) {
        return { status: "error", message: NOT_FOUND(await getRequestI18n()), fieldErrors: {} };
      }
    } catch (error) {
      return errorState(error, ({ m }) => m.events.actions.volunteerAddFailed);
    }

    // The volunteers of the event change.
    refresh();
    return { status: "success", message: null, fieldErrors: {} };
  },
);

export const removeVolunteerAction = withPolicy(
  "music.event.manage",
  musicEventIn,
  async (
    _scope: PolicyScope,
    _previous: EventFormState,
    formData: FormData,
  ): Promise<EventFormState> => {
    try {
      // False if the user is not a volunteer anymore, e.g. after a second click.
      // The result is the same, so this is not an error.
      await removeEventVolunteer(text(formData, "id"), text(formData, "userId"), {
        endProjections: formData.get("endProjections") === "on",
      });
    } catch (error) {
      return changeErrorState(error, ({ m }) => m.events.actions.volunteerRemoveFailed);
    }

    refresh();
    return { status: "success", message: null, fieldErrors: {} };
  },
);

/**
 * The `id` field, the `teams` field (the JSON of `{ templateId, teams }`, see
 * `teamsInputSchema`) and `endProjections`.
 */
export const saveEventTeamsAction = withPolicy(
  "music.event.view",
  musicEventIn,
  async (
    _scope: PolicyScope,
    _previous: EventFormState,
    formData: FormData,
  ): Promise<EventFormState> => {
    const i18n = await getRequestI18n();
    let input: unknown;
    try {
      input = JSON.parse(text(formData, "teams"));
    } catch {
      return { status: "error", message: i18n.m.events.actions.teamsSaveFailed, fieldErrors: {} };
    }

    try {
      if (
        !(await setEventTeams(text(formData, "id"), input, {
          endProjections: formData.get("endProjections") === "on",
        }))
      ) {
        return { status: "error", message: NOT_FOUND(i18n), fieldErrors: {} };
      }
    } catch (error) {
      return changeErrorState(error, ({ m }) => m.events.actions.teamsSaveFailed);
    }

    refresh();
    return { status: "success", message: i18n.m.events.actions.teamsSaved, fieldErrors: {} };
  },
);

/** The reply of the signed-in volunteer: `reply` is "yes", "maybe" or "no". */
export const setReplyAction = withPolicy(
  "music.event.view",
  musicEventIn,
  async (
    _scope: PolicyScope,
    _previous: EventFormState,
    formData: FormData,
  ): Promise<EventFormState> => {
    return runUpdate(
      {
        success: ({ m }) => m.events.actions.replySaved,
        failure: ({ m }) => m.events.actions.replySaveFailed,
        notFound: ({ m }) => m.events.actions.notVolunteer,
      },
      () => setMyReply(text(formData, "id"), { reply: text(formData, "reply") }),
    );
  },
);
