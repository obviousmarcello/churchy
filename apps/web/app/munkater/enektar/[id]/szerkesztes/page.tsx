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
import {
  IMAGE_MAX_SIDE_PX,
  IMAGE_NAME_MAX_LENGTH,
  IMAGE_PAGES_MAX,
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGES_PER_SONG_MAX,
} from "@/server/music/models/images";
import { LINK_NAME_MAX_LENGTH, LINKS_PER_SONG_MAX } from "@/server/music/models/links";
import { PDF_MAX_BYTES, PDF_NAME_MAX_LENGTH, PDFS_PER_SONG_MAX } from "@/server/music/models/pdfs";
import {
  SCORE_MAX_BYTES,
  SCORE_NAME_MAX_LENGTH,
  SCORES_PER_SONG_MAX,
} from "@/server/music/models/scores";
import {
  SOUND_FILE_MAX_BYTES,
  SOUND_FILE_NAME_MAX_LENGTH,
  SOUND_FILES_PER_SONG_MAX,
} from "@/server/music/models/sound-files";
import { findSharedSongRights, getSong, listSongTags } from "@/server/music/models/songs";
import { FileDropArea } from "@/components/music/file-drop";
import { songFileModules } from "../../data";
import { EditSongForm } from "./edit-song-form";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.songs.edit.title, robots: { index: false, follow: false } };
}

// Music Sheet DB's edit page. Left out until their phases: the projection theme (phase 5) and
// the page transition. File parts show when their `ws.music.songs.*` module is on. The session check is Churchy's (`requirePageUser`).
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

  const [sharedRights, files] = await Promise.all([findSharedSongRights(song), songFileModules()]);
  return (
    // Files dropped anywhere on the page go to the scores, the PDF files, the images, the sound files or the chart.
    <FileDropArea>
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
        files={files}
        scores={song.scores}
        scoreLimits={{
          maxBytes: SCORE_MAX_BYTES,
          maxScores: SCORES_PER_SONG_MAX,
          nameMaxLength: SCORE_NAME_MAX_LENGTH,
        }}
        pdfs={{
          pdfs: song.pdfs,
          arrangements: song.arrangements,
          limits: {
            maxBytes: PDF_MAX_BYTES,
            maxPdfs: PDFS_PER_SONG_MAX,
            nameMaxLength: PDF_NAME_MAX_LENGTH,
          },
        }}
        images={{
          images: song.images,
          arrangements: song.arrangements,
          limits: {
            maxImages: IMAGES_PER_SONG_MAX,
            maxPages: IMAGE_PAGES_MAX,
            maxBytes: IMAGE_UPLOAD_MAX_BYTES,
            maxSide: IMAGE_MAX_SIDE_PX,
            nameMaxLength: IMAGE_NAME_MAX_LENGTH,
          },
        }}
        soundFiles={{
          soundFiles: song.soundFiles,
          arrangements: song.arrangements,
          limits: {
            maxBytes: SOUND_FILE_MAX_BYTES,
            maxSoundFiles: SOUND_FILES_PER_SONG_MAX,
            nameMaxLength: SOUND_FILE_NAME_MAX_LENGTH,
          },
        }}
        links={{
          links: song.links,
          arrangements: song.arrangements,
          limits: { maxLinks: LINKS_PER_SONG_MAX, nameMaxLength: LINK_NAME_MAX_LENGTH },
        }}
      />
    </FileDropArea>
  );
}
