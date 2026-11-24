import type { Metadata } from "next";
import Link from "next/link";
import { LockIcon, SearchXIcon } from "lucide-react";

import { PageHeader } from "@/components/music/page-header";
import { buttonVariants } from "@/components/music/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { getI18n } from "@/i18n/music/server";
import { requirePageUser } from "@/server/music/auth";
import { getArrangement } from "@/server/music/models/arrangements";
import { findSharedSongRights, getSong, listSongTags } from "@/server/music/models/songs";
import { EditSongForm } from "./edit-song-form";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.songs.edit.title, robots: { index: false, follow: false } };
}

// Music Sheet DB's edit page. Left out until their phases: the file attachments (scores, PDFs,
// images, sound files, links; music phase 2, second slice), the projection theme (phase 5) and
// the page transition. The session check is Churchy's (`requirePageUser`).
export default async function EditSongPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ m }, user] = await Promise.all([getI18n(), requirePageUser()]);
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title={m.songs.edit.title}
        back={{ href: "/munkater/enektar", label: m.common.nav.songs }}
      />
      {user.canEditSongs ? (
        <EditSongGate params={params} />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LockIcon />
            </EmptyMedia>
            <EmptyTitle>{m.songs.edit.forbidden.title}</EmptyTitle>
            <EmptyDescription>{m.songs.edit.forbidden.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </main>
  );
}

// This only hides the form. `updateSongWithArrangement` checks the song admin role again on save.
async function EditSongGate({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { m }] = await Promise.all([params, getI18n()]);
  const [song, tagOptions] = await Promise.all([getSong(id), listSongTags()]);
  // The default arrangement is first.
  const arrangement = song?.arrangements[0] ? await getArrangement(song.arrangements[0].id) : null;

  if (!song || !arrangement) {
    const empty = song ? m.songs.edit.noArrangement : m.songs.edit.notFound;
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>{empty.title}</EmptyTitle>
          <EmptyDescription>{empty.description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/munkater/enektar" className={buttonVariants({ variant: "outline" })}>
            {m.songs.edit.goToSongs}
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  const sharedRights = await findSharedSongRights(song);
  return (
    <EditSongForm
      song={{
        id: song.id,
        title: song.title,
        artist: song.artist,
        tags: song.tags,
        copyright: song.copyright,
        songbook: song.songbook,
        authors: song.authors,
        originalTitle: song.originalTitle,
        translator: song.translator,
        rightsStatus: song.rightsStatus,
        rightsNote: song.rightsNote,
        arrangement,
      }}
      tagOptions={tagOptions}
      sharedRights={sharedRights}
    />
  );
}
