import type { Metadata } from "next";

import { getI18n } from "@/i18n/music/server";
import { firstParam } from "@/lib/music/song-filters";
import { requirePageUser } from "@/server/music/auth";
import { requireWorkspaceModule } from "@/server/workspace-nav";
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
// `from` is the page that the close button goes back to. Events (`?event=`) and live sessions
// (`?session=`) of the music app come with the events phase and the realtime decision.
export default async function SheetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireWorkspaceModule("ws.music.sheet");
  const user = await requirePageUser();
  const params = await searchParams;
  return <SheetView result={await loadSheetPage(user, params)} from={firstParam(params.from)} />;
}
