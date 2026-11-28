"use server";

import { musicEventModule } from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";

import { refresh } from "next/cache";

import type { Text } from "@/i18n/music/i18n";
import { getRequestI18n } from "@/i18n/music/server";
import type {
  AnnouncementSettingsInput,
  EntrySettingsInput,
  ManualEntryInput,
} from "@/lib/music/announcements/schema";
import { errorState, runSave, type SaveResult } from "@/server/music/form-state";
import {
  copyAnnouncement,
  createAnnouncement,
  listAnnouncementSources,
  refreshAnnouncementNow,
  removeEntry,
  saveEntrySettings,
  saveManualEntry,
  setEntryAttachment,
  updateAnnouncement,
  type AnnouncementSourceDTO,
  type EntryTarget,
} from "@/server/music/models/announcements";

// The announcements items of an event (see `announcements.ts`). The model
// checks the role and the input. These actions only turn its results and
// errors into values for the editor of the item.

const NOT_FOUND: Text = ({ m }) => m.announcements.editor.missing;
const SAVE_FAILED: Text = ({ m }) => m.announcements.editor.saveFailed;

/** After a success, the page shows the new values. */
async function save(failure: Text, change: () => Promise<boolean>): Promise<SaveResult> {
  const result = await runSave({ failure, notFound: NOT_FOUND }, change);
  if (result.status === "success") refresh();
  return result;
}

export type CreateAnnouncementResult =
  { status: "success"; id: string } | { status: "error"; message: string };

/** A new announcement of the event, for a new announcements item, with the first read of its calendars. No refresh: no item uses it yet. */
export const createAnnouncementAction = withPolicy(
  "music.event.manage",
  musicEventModule("announcements"),
  async (_scope: PolicyScope, eventId: string): Promise<CreateAnnouncementResult> => {
    try {
      const id = await createAnnouncement(eventId);
      if (id) return { status: "success", id };
      return { status: "error", message: NOT_FOUND(await getRequestI18n()) };
    } catch (error) {
      const state = await errorState(error, ({ m }) => m.announcements.editor.addFailed);
      return { status: "error", message: state.message ?? "" };
    }
  },
);

export const updateAnnouncementAction = withPolicy(
  "music.event.manage",
  musicEventModule("announcements"),
  async (
    _scope: PolicyScope,
    id: string,
    input: AnnouncementSettingsInput,
  ): Promise<SaveResult> => {
    return save(SAVE_FAILED, () => updateAnnouncement(id, input));
  },
);

export const refreshAnnouncementAction = withPolicy(
  "music.event.manage",
  musicEventModule("announcements"),
  async (_scope: PolicyScope, id: string): Promise<SaveResult> => {
    return save(
      ({ m }) => m.announcements.editor.refreshFailed,
      () => refreshAnnouncementNow(id),
    );
  },
);

export const saveEntrySettingsAction = withPolicy(
  "music.event.manage",
  musicEventModule("announcements"),
  async (
    _scope: PolicyScope,
    announcementId: string,
    target: EntryTarget,
    input: EntrySettingsInput,
  ): Promise<SaveResult> => {
    return save(SAVE_FAILED, () => saveEntrySettings(announcementId, target, input));
  },
);

/** Adds a manual entry (`entryId` null) or changes one. */
export const saveManualEntryAction = withPolicy(
  "music.event.manage",
  musicEventModule("announcements"),
  async (
    _scope: PolicyScope,
    announcementId: string,
    entryId: string | null,
    input: ManualEntryInput,
  ): Promise<SaveResult> => {
    return save(SAVE_FAILED, () => saveManualEntry(announcementId, entryId, input));
  },
);

export const removeEntryAction = withPolicy(
  "music.event.manage",
  musicEventModule("announcements"),
  async (_scope: PolicyScope, announcementId: string, entryId: string): Promise<SaveResult> => {
    return save(SAVE_FAILED, () => removeEntry(announcementId, entryId));
  },
);

/** Gives the set to the entry, or none for null. */
export const setEntryAttachmentAction = withPolicy(
  "music.event.manage",
  musicEventModule("announcements"),
  async (
    _scope: PolicyScope,
    announcementId: string,
    target: EntryTarget,
    setId: string | null,
  ): Promise<SaveResult> => {
    return save(
      SAVE_FAILED,
      async () => (await setEntryAttachment(announcementId, target, setId)) !== null,
    );
  },
);

export type AnnouncementSourcesResult =
  { status: "success"; sources: AnnouncementSourceDTO[] } | { status: "error"; message: string };

/** The other events with announcements, to copy from. */
export const listAnnouncementSourcesAction = withPolicy(
  "music.event.manage",
  musicEventModule("announcements"),
  async (_scope: PolicyScope, eventId: string): Promise<AnnouncementSourcesResult> => {
    try {
      return { status: "success", sources: await listAnnouncementSources(eventId) };
    } catch (error) {
      const state = await errorState(error, ({ m }) => m.announcements.editor.copyFailed);
      return { status: "error", message: state.message ?? "" };
    }
  },
);

export const copyAnnouncementAction = withPolicy(
  "music.event.manage",
  musicEventModule("announcements"),
  async (_scope: PolicyScope, id: string, sourceId: string): Promise<SaveResult> => {
    return save(
      ({ m }) => m.announcements.editor.copyFailed,
      () => copyAnnouncement(id, sourceId),
    );
  },
);
