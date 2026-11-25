import "server-only";

import type { PlanItemInput } from "@churchy/contracts";
import { isContractError } from "@churchy/contracts";

import { takeSongs, type SongRef } from "@/lib/music/plan-sync";
import { getMemberEnv } from "@/server/workspace";
import { applyEventItems, getEventDetail } from "./models/events";
import { itemsToInput, type SetlistItemInput } from "./models/setlists";

// The two-way sync of the songs of a service plan and the setlist of its event (PLAN §17-§19): a
// plan belongs to a music event through `service_plans.event_id`. The side that was just edited
// wins; the other side takes over the song sequence and keeps everything else (`takeSongs`).
// Both functions never throw for a plan they cannot change (a locked or approved plan stays as it
// is) and do nothing without a linked plan or event.

/** After a change of the event's items: the songs of its plans follow. */
export async function syncPlansFromSetlist(eventId: string): Promise<void> {
  const event = await getEventDetail(eventId);
  if (event === null) return;
  const songs: SongRef[] = event.items.flatMap((item) =>
    item.kind === "song"
      ? [
          {
            arrangementId: item.arrangement.id,
            songId: item.song.id,
            title: item.song.title,
            musicalKey: item.musicalKey,
          },
        ]
      : [],
  );
  const { repos, ctx } = await getMemberEnv();
  for (const plan of await repos.servicePlans.list(ctx, { eventIds: [eventId] })) {
    const loaded = await repos.servicePlans.get(ctx, plan.id);
    if (loaded === null) continue;
    const items = takeSongs<PlanItemInput>(loaded.items, songs, {
      isSong: (item) => item.type === "song" && Boolean(item.arrangementId),
      arrangementOf: (item) => item.arrangementId ?? "",
      withSong: (song, previous) =>
        previous ?? {
          type: "song",
          title: song.title,
          songId: song.songId,
          arrangementId: song.arrangementId,
          keyOverride: song.musicalKey,
        },
    });
    try {
      await repos.servicePlans.setItems(ctx, plan.id, items);
    } catch (error) {
      if (!isContractError(error)) throw error;
    }
  }
}

/** After a change of a plan's items: the songs of its event follow. */
export async function syncSetlistFromPlan(
  eventId: string | null,
  planItems: readonly PlanItemInput[],
): Promise<void> {
  if (eventId === null) return;
  const event = await getEventDetail(eventId);
  if (event === null) return;
  const songs: SongRef[] = planItems.flatMap((item) =>
    item.type === "song" && item.arrangementId && item.songId
      ? [
          {
            arrangementId: item.arrangementId,
            songId: item.songId,
            title: item.title,
            musicalKey: item.keyOverride ?? null,
          },
        ]
      : [],
  );
  const items = takeSongs<SetlistItemInput>(itemsToInput(event.items), songs, {
    isSong: (item) => item.kind === "song",
    arrangementOf: (item) => (item.kind === "song" ? item.arrangementId : ""),
    withSong: (song, previous) =>
      previous ?? { kind: "song", arrangementId: song.arrangementId, musicalKey: song.musicalKey },
  });
  await applyEventItems(eventId, items);
}
