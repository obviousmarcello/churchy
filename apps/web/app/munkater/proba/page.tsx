import type { Metadata } from "next";

import { getI18n } from "@/i18n/music/server";
import { loadRehearsalPage } from "./data";
import { RehearsalBuilder } from "./rehearsal-builder";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.rehearsal.page.title, robots: { index: false, follow: false } };
}

// The rehearsal setlist is a draft in the browser (`draft.ts`); the page brings the song catalog and,
// for event admins, the events to save it to. The builder has the layout: the songs and the setlist.
export default async function RehearsalPage() {
  const data = await loadRehearsalPage();
  if (!data) return null;
  return (
    <RehearsalBuilder
      catalog={data.catalog}
      maxItems={data.maxItems}
      canEditSongs={data.canEditSongs}
      canPasteScripture={data.canPasteScripture}
      save={data.save}
    />
  );
}
