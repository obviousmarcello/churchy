"use server";

import { getRequestI18n } from "@/i18n/music/server";
import type { QuickItemInput } from "@/lib/music/projection/quick-items";
import { SafeError } from "@/server/music/errors";
import { runSave, type SaveResult } from "@/server/music/form-state";
import { addEventItems, removeEventItem } from "@/server/music/models/events";
import { musicEventIn } from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";

/**
 * Adds the item of the quick add to the event with the key `key`, after the item of `afterKey`
 * (`QUICK_ITEMS_START`: at the start, null: at the end). For the event admins (see `addEventItems`).
 */
export const addQuickItemAction = withPolicy(
  "music.event.manage",
  musicEventIn,
  async (
    _scope: PolicyScope,
    eventId: string,
    afterKey: string | null,
    key: string,
    item: QuickItemInput,
  ): Promise<SaveResult> => {
    const i18n = await getRequestI18n();
    try {
      const result = await addEventItems(eventId, { items: [{ ...item, key }], afterKey });
      if (result === "added") return { status: "success" };
      if (result === "too_many_items")
        return { status: "error", message: i18n.m.project.quickAdd.full };
      return { status: "error", message: i18n.m.project.gate.notFoundDescription };
    } catch (cause) {
      if (cause instanceof SafeError) return { status: "error", message: cause.text(i18n) };
      console.error("[projection] Failed to add the quick item:", cause);
      return { status: "error", message: i18n.m.project.quickAdd.addFailed };
    }
  },
);

/** Removes the item of `key` from the event, e.g. a quick item that the event admin added here. */
export const removeQuickItemAction = withPolicy(
  "music.event.manage",
  musicEventIn,
  async (_scope: PolicyScope, eventId: string, key: string): Promise<SaveResult> =>
    runSave(
      {
        failure: ({ m }) => m.project.quickAdd.removeFailed,
        notFound: ({ m }) => m.project.quickAdd.removeFailed,
      },
      () => removeEventItem(eventId, key),
    ),
);

/**
 * The Realtime channel of the event's running live session, or null without one, so the controller
 * also follows a session that starts after it opened. Undefined when the check fails.
 */
export const eventLiveTopicAction = withPolicy(
  "music.projection.use",
  musicEventIn,
  async (_scope: PolicyScope, _eventId: string): Promise<string | null | undefined> => null,
);
