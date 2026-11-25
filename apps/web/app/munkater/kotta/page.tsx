import type { Metadata } from "next";

import { getI18n } from "@/i18n/music/server";
import { firstParam } from "@/lib/music/song-filters";
import { requirePageUser } from "@/server/music/auth";
import { requireWorkspaceModule } from "@/server/workspace-nav";
import { getEvent, getEventDetail } from "@/server/music/models/events";
import { loadSheetPage } from "./data";
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
      from: params.from ?? `/munkater/esemenyek/${eventId}`,
    };
  }
  return <SheetView result={await loadSheetPage(user, params)} from={firstParam(params.from)} />;
}
