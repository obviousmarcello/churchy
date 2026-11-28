import type { Metadata } from "next";

import { getI18n } from "@/i18n/music/server";
import { firstParam } from "@/lib/music/song-filters";
import { requirePageUser } from "@/server/music/auth";
import { isWorkspaceModuleOn, requireWorkspaceModule } from "@/server/workspace-nav";
import { getEvent, getEventDetail } from "@/server/music/models/events";
import { getMySetlistItem } from "@/server/music/models/my-setlists";
import {
  canStartEventLiveSession,
  getEventLiveSession,
  getLiveConnection,
  getLiveSession,
} from "@/server/music/models/live-sessions";
import { listPeople } from "@/server/music/models/profiles";
import { loadSheetPage } from "./data";
import type { LiveSessionProps } from "./live-session";
import type { StartLive } from "./start-live-control";
import { SheetView } from "./sheet-view";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.sheet.page.metadataTitle, robots: { index: false, follow: false } };
}

// A full-screen chord sheet (*kotta*, music merge phase 3). Open it with one of:
// - `?arrangement=<id>`: one arrangement; repeat it for several, in playing order (a list that is
//   not saved). With one `key` for each arrangement, the key to play it in ("" for the key of the
//   chart),
// - `?song=<id>`: the song's default arrangement.
// Each song shows with the signed-in user's capo, key, layout and marks for its arrangement.
// - `?item=<setlist item id>`: one song of an event, in the key of its slot (`my-setlists`).
// - `?event=<id>`: the songs of an event, in its order and keys (phase 4; the per-slot annotations
//   of the music app stay with the arrangement for now).
// `from` is the page that the close button goes back to. Live sessions (`?session=`) come with the
// realtime decision.
export default async function SheetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireWorkspaceModule("ws.music.sheet");
  const user = await requirePageUser();
  let params = await searchParams;
  // A live session (`?session=<id>`): its event or its list of arrangements is what the sheet shows.
  const liveModuleOn = await isWorkspaceModuleOn("ws.music.sheet.live");
  const sessionId = firstParam(params.session);
  let live: LiveSessionProps | undefined;
  if (sessionId !== undefined && liveModuleOn) {
    const session = await getLiveSession(sessionId);
    if (session) {
      const [people, connection] = await Promise.all([listPeople([user.id]), getLiveConnection()]);
      // The name that the other participants see: never the email.
      live = { session, me: { id: user.id, name: people[0]?.name ?? "" }, connection };
      params = session.eventId
        ? { ...params, event: session.eventId }
        : {
            ...params,
            arrangement: session.arrangementIds,
            key: session.musicalKeys.map((key) => key ?? ""),
          };
    } else if (firstParam(params.event) === undefined) {
      return <SheetView result={{ notFound: "session" }} from={firstParam(params.from)} />;
    }
  }
  const eventId = firstParam(params.event);
  if (eventId !== undefined && (await getEvent(eventId)) !== null) {
    // An event's songs in playing order, each in the key of its item (text items are skipped).
    const songs = ((await getEventDetail(eventId))?.items ?? []).filter(
      (item) => item.kind === "song",
    );
    params = {
      ...params,
      arrangement: songs.map((item) => item.arrangement.id),
      key: songs.map((item) => item.musicalKey ?? ""),
      // The setlist slots: the notes of the slot show on its song.
      slot: songs.map((item) => item.id),
      from: params.from ?? `/munkater/esemenyek/${eventId}`,
    };
  }
  const itemId = firstParam(params.item);
  if (itemId !== undefined) {
    // One program point of an event (a song) with the user's own settings for it.
    const item = await getMySetlistItem(itemId);
    if (item?.kind === "song") {
      params = {
        ...params,
        arrangement: [item.arrangement.id],
        key: [item.slotKey ?? ""],
        slot: [item.id],
      };
    }
  }
  // Without a session: how the user can start or join one.
  let startLive: StartLive | undefined;
  if (live === undefined && liveModuleOn) {
    if (eventId !== undefined) {
      const [running, canStart] = await Promise.all([
        getEventLiveSession(eventId),
        canStartEventLiveSession(eventId),
      ]);
      if (running) startLive = { kind: "join", sessionId: running.id, eventId };
      else if (canStart) startLive = { kind: "event", eventId };
    } else {
      const arrangementIds = [params.arrangement ?? []].flat();
      if (arrangementIds.length > 0) {
        const keys = [params.key ?? []].flat();
        startLive = {
          kind: "rehearsal",
          arrangementIds,
          musicalKeys: arrangementIds.map((_, index) => keys[index] || null),
        };
      }
    }
  }
  return (
    <SheetView
      result={await loadSheetPage(user, params)}
      from={firstParam(params.from)}
      live={live}
      startLive={startLive}
    />
  );
}
