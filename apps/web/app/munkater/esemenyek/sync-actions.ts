"use server";

import { SafeError } from "@/server/music/errors";
import { getEventSetlistId, listEventAuthors } from "@/server/music/models/event-sync";
import type { PersonDTO } from "@/server/music/models/profiles";
import { musicEvents } from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";

/**
 * The users who made the changes of the event, for the notices of the changes (see
 * `listEventAuthors`). Empty when it fails: the notice then has no name.
 */
export const eventAuthorsAction = withPolicy(
  "music.event.view",
  musicEvents,
  async (_scope: PolicyScope, eventId: string, userIds: string[]): Promise<PersonDTO[]> => {
    try {
      return await listEventAuthors(eventId, userIds);
    } catch (cause) {
      if (!(cause instanceof SafeError))
        console.error("[events] Failed to list the authors of the changes:", cause);
      return [];
    }
  },
);

/** The setlist of the items of the event now (see `getEventSetlistId`). Undefined when it fails. */
export const eventSetlistIdAction = withPolicy(
  "music.event.view",
  musicEvents,
  async (_scope: PolicyScope, eventId: string): Promise<string | null | undefined> => {
    try {
      return await getEventSetlistId(eventId);
    } catch (cause) {
      if (!(cause instanceof SafeError))
        console.error("[events] Failed to read the setlist of the event:", cause);
      return undefined;
    }
  },
);
