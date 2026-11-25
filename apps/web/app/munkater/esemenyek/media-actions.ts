"use server";

import { errorState, text } from "@/server/music/form-state";
import {
  createAnnouncement,
  refreshAnnouncementNow,
  removeEntry,
  saveEntrySettings,
  saveManualEntry,
  updateAnnouncement,
} from "@/server/music/models/announcements";
import {
  saveAnnouncementCalendar,
  removeAnnouncementCalendar,
} from "@/server/music/models/announcement-calendars";
import { addEventItems } from "@/server/music/models/events";
import {
  addEventImage,
  createEventImageSet,
  removeEventImage,
} from "@/server/music/models/event-images";
import { syncPlansFromSetlist } from "@/server/music/plan-link";
import { musicEventIn, musicEvents } from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";

// Images and announcements of an event (modules `ws.music.events.images` / `.announcements`): the
// same permission as the items (`music.event.manage`, with the event's areas); the models check
// the event again. Calendars of the announcements (sources) are for the superadmins (the model).

const inModule =
  (module: "images" | "announcements") =>
  async (scope: PolicyScope, ...args: unknown[]) =>
    (await isWorkspaceModuleOn(`ws.music.events.${module}`)) ? musicEventIn(scope, ...args) : null;

type Result = { ok: boolean; id?: string | null; message?: string | null };

async function afterItems(eventId: string): Promise<void> {
  try {
    await syncPlansFromSetlist(eventId);
  } catch (error) {
    console.error("[music] plan sync failed:", error);
  }
}

/** A new set of images, as a program point at the end of the items. */
export const createImageSetAction = withPolicy(
  "music.event.manage",
  inModule("images"),
  async (_scope, formData: FormData): Promise<Result> => {
    const eventId = text(formData, "id");
    const setId = await createEventImageSet(eventId);
    if (setId === null) return { ok: false };
    const added = await addEventItems(eventId, {
      items: [{ kind: "text", title: text(formData, "title") || "Képek", imageSetId: setId }],
      afterKey: null,
    });
    if (added === "added") await afterItems(eventId);
    return { ok: added === "added", id: setId };
  },
);

export const addImageAction = withPolicy(
  "music.event.manage",
  inModule("images"),
  async (_scope, formData: FormData): Promise<Result> => {
    const file = formData.get("file");
    try {
      const image = await addEventImage(
        text(formData, "setId"),
        file instanceof File ? file : undefined,
        text(formData, "name"),
      );
      return { ok: image !== null, id: image?.id ?? null };
    } catch (error) {
      return {
        ok: false,
        message: (await errorState(error, ({ m }) => m.events.media.failed)).message,
      };
    }
  },
);

export const removeImageAction = withPolicy(
  "music.event.manage",
  inModule("images"),
  async (_scope, formData: FormData): Promise<Result> => ({
    ok: await removeEventImage(text(formData, "imageId")),
  }),
);

/** A new announcement of the event, as a program point at the end of the items. */
export const createAnnouncementAction = withPolicy(
  "music.event.manage",
  inModule("announcements"),
  async (_scope, formData: FormData): Promise<Result> => {
    const eventId = text(formData, "id");
    const id = await createAnnouncement(eventId);
    if (id === null) return { ok: false };
    const added = await addEventItems(eventId, {
      items: [{ kind: "text", title: text(formData, "title") || "Hirdetések", announcementId: id }],
      afterKey: null,
    });
    if (added === "added") await afterItems(eventId);
    return { ok: added === "added", id };
  },
);

/** The calendars of an announcement (`calendarId` fields; none: all that are on) and a read now. */
export const saveAnnouncementAction = withPolicy(
  "music.event.manage",
  inModule("announcements"),
  async (_scope, formData: FormData): Promise<Result> => {
    const announcementId = text(formData, "announcementId");
    const calendarIds = formData.getAll("calendarId").map(String);
    const saved = await updateAnnouncement(announcementId, {
      calendarIds: calendarIds.length > 0 ? calendarIds : null,
    });
    if (saved && formData.get("refresh") === "on") await refreshAnnouncementNow(announcementId);
    return { ok: saved };
  },
);

export const refreshAnnouncementAction = withPolicy(
  "music.event.manage",
  inModule("announcements"),
  async (_scope, formData: FormData): Promise<Result> => ({
    ok: await refreshAnnouncementNow(text(formData, "announcementId")),
  }),
);

/** Leaves a calendar entry out of the announcement, or takes it back. */
export const excludeEntryAction = withPolicy(
  "music.event.manage",
  inModule("announcements"),
  async (_scope, formData: FormData): Promise<Result> => ({
    ok: await saveEntrySettings(
      text(formData, "announcementId"),
      {
        calendarId: text(formData, "calendarId"),
        uid: text(formData, "uid"),
        occurrence: text(formData, "occurrence"),
      },
      { excluded: formData.get("excluded") === "true" },
    ),
  }),
);

export const addManualEntryAction = withPolicy(
  "music.event.manage",
  inModule("announcements"),
  async (_scope, formData: FormData): Promise<Result> => {
    const day = text(formData, "date");
    return {
      ok: await saveManualEntry(text(formData, "announcementId"), null, {
        title: text(formData, "title"),
        startsAt: null,
        endsAt: null,
        startDate: day || null,
        endDate: null,
        location: text(formData, "location"),
        description: null,
      }),
    };
  },
);

export const removeEntryAction = withPolicy(
  "music.event.manage",
  inModule("announcements"),
  async (_scope, formData: FormData): Promise<Result> => ({
    ok: await removeEntry(text(formData, "announcementId"), text(formData, "entryId")),
  }),
);

// Calendar sources: no event, `music.group.manage` and the module.
export const saveCalendarAction = withPolicy(
  "music.group.manage",
  async (scope, ...args: unknown[]) =>
    (await isWorkspaceModuleOn("ws.music.events.announcements"))
      ? musicEvents(scope, ...args)
      : null,
  async (_scope, formData: FormData): Promise<Result> => {
    try {
      const id = text(formData, "id");
      return {
        ok: await saveAnnouncementCalendar(id === "" ? null : id, {
          name: text(formData, "name"),
          url: text(formData, "url"),
          enabled: formData.get("enabled") !== "off",
        }),
      };
    } catch (error) {
      return {
        ok: false,
        message: (await errorState(error, ({ m }) => m.events.media.failed)).message,
      };
    }
  },
);

export const removeCalendarAction = withPolicy(
  "music.group.manage",
  async (scope, ...args: unknown[]) =>
    (await isWorkspaceModuleOn("ws.music.events.announcements"))
      ? musicEvents(scope, ...args)
      : null,
  async (_scope, formData: FormData): Promise<Result> => ({
    ok: await removeAnnouncementCalendar(text(formData, "id")),
  }),
);
