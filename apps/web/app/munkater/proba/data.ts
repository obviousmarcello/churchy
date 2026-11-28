import "server-only";

import { canServer } from "@/lib/permissions/server";
import {
  DEFAULT_EVENT_DURATION_MINUTES,
  listEventsByTime,
  loadEventScopeOptions,
  type EventWithItemCountDTO,
} from "@/server/music/models/events";
import { SETLIST_MAX_ITEMS } from "@/server/music/models/setlists";
import {
  listSongsWithArrangements,
  type SongWithArrangementsDTO,
} from "@/server/music/models/songs";
import { getCurrentUser } from "@/server/music/auth";
import type { SaveOptions } from "./rehearsal-builder";

export type RehearsalPageData = {
  /** Every song with its arrangements, by title. */
  catalog: SongWithArrangementsDTO[];
  maxItems: number;
  canEditSongs: boolean;
  /** Music leaders, event admins can paste the text of a reading into the shared cache (see `cacheVerses()`). */
  canPasteScripture: boolean;
  /** Only for event admins: the list of events changes often. The models check the role again on save. */
  save: SaveOptions | null;
};

// Every user can build a setlist. Only event admins get the save panel.
export async function loadRehearsalPage(): Promise<RehearsalPageData | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const [catalog, events, scope] = await Promise.all([
    listSongsWithArrangements(),
    user.canEditEvents ? listEventsByTime() : null,
    user.canEditEvents ? loadEventScopeOptions() : null,
  ]);

  const save: SaveOptions | null = events &&
    scope && {
      events: [
        ...events.upcoming.map((event) => ({ ...toOption(event), isPast: false })),
        ...events.past.map((event) => ({ ...toOption(event), isPast: true })),
      ],
      defaultDurationMinutes: DEFAULT_EVENT_DURATION_MINUTES,
      scope,
    };

  return {
    catalog,
    maxItems: SETLIST_MAX_ITEMS,
    canEditSongs: user.canEditSongs,
    canPasteScripture: await canServer("music.scripture.translations.manage", {
      tenantId: user.tenantId,
    }),
    save,
  };
}

function toOption({ id, title, startsAt, itemCount }: EventWithItemCountDTO) {
  return { id, title, startsAt, itemCount };
}
