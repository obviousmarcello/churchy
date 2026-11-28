import type { Metadata } from "next";
import { LockIcon } from "lucide-react";

import { PageHeader } from "@/components/music/page-header";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { getI18n } from "@/i18n/music/server";
import { requirePageUser } from "@/server/music/auth";
import { listSongTags } from "@/server/music/models/songs";
import { NewSongForm } from "./new-song-form";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.songs.new.title, robots: { index: false, follow: false } };
}

// This only hides the form. `createSong` checks the song admin role again on save.
export default async function NewSongPage() {
  const [user, { m }] = await Promise.all([requirePageUser(), getI18n()]);
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title={m.songs.new.title}
        back={{ href: "/munkater/enektar", label: m.common.nav.songs }}
      />
      {user.canEditSongs ? (
        <NewSongForm tagOptions={await listSongTags()} />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LockIcon />
            </EmptyMedia>
            <EmptyTitle>{m.songs.new.forbidden.title}</EmptyTitle>
            <EmptyDescription>{m.songs.new.forbidden.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </main>
  );
}
