import "server-only";

import type { I18n } from "@/i18n/music/i18n";
import { fieldError, text } from "@/server/music/form-state";

/** The field that `EventGroupsField` sends with its groups: also when no group is selected. */
export const AREA_IDS_FIELD = "areaIdsField";

/**
 * The title, start time, duration, YouTube link, privacy and groups from the event
 * fields (see `EventFields`), or an error state for the fields that the model
 * cannot explain well. The messages are in the language of `i18n` (in a Server
 * Action: `await getRequestI18n()`).
 */
export function readEventInput(formData: FormData, { m }: I18n) {
  const title = text(formData, "title");
  if (!title.trim()) return fieldError("title", m.events.fields.titleRequired);

  // The browser converts the local date and time to UTC (see `StartsAtField`).
  const startsAt = text(formData, "startsAt");
  if (!startsAt) return fieldError("startsAt", m.events.fields.startsAtRequired);

  const duration = text(formData, "durationMinutes").trim();
  if (!/^\d{1,4}$/.test(duration))
    return fieldError("durationMinutes", m.events.fields.durationInvalid);

  return {
    title,
    startsAt,
    durationMinutes: Number(duration),
    // The model checks the link.
    youtubeUrl: text(formData, "youtubeUrl"),
    // An unchecked box sends nothing.
    isPrivate: formData.get("isPrivate") === "on",
    // One field for each group (see `EventGroupsField`). The model checks them.
    // Without the groups field (a page of the previous version): no change.
    areaIds: formData.has(AREA_IDS_FIELD)
      ? formData.getAll("areaIds").filter((value) => typeof value === "string")
      : undefined,
  };
}
