import type { Metadata } from "next";

import { getI18n } from "@/i18n/music/server";
import { requirePageUser } from "@/server/music/auth";
import { loadSongsPage } from "./data";
import { SongsView } from "./songs-view";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.common.nav.songs, robots: { index: false, follow: false } };
}

/** *Énektár* (music merge phase 2): Music Sheet DB's song browser. */
export default async function SongsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser();
  const data = await loadSongsPage(user, await searchParams);
  return <SongsView data={data} />;
}
