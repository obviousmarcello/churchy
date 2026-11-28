import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SearchXIcon } from "lucide-react";

import { AttachmentDetails } from "@/components/music/attachment-details";
import { ImageViewer } from "@/components/music/image-viewer";
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
import { safeNextPath } from "@/lib/music/next-path";
import { requirePageUser } from "@/server/music/auth";
import { requireWorkspaceModule } from "@/server/workspace-nav";

type PageArgs = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
import { getSongImage } from "@/server/music/models/images";
import { getSong } from "@/server/music/models/songs";

// An image of a song, for every signed-in user (see `imageHref`). Its back
// link goes to `from`, e.g. the sheet, or to the song.

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.songs.imageView.title };
}

export default async function ImagePage({ params, searchParams }: PageArgs) {
  await requireWorkspaceModule("ws.music.songs.images");
  const { m } = await getI18n();

  return (
    <>
      <main className="flex flex-1 flex-col">
        {/* Reads the session cookie and the URL, so it renders at request time. */}
        <Suspense
          fallback={
            <>
              <PageHeader title={m.songs.imageView.title} />
              <p className="px-4 py-6 text-sm text-muted sm:px-6">{m.songs.imageView.loading}</p>
            </>
          }
        >
          <ImageGate params={params} searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function ImageGate({ params, searchParams }: PageArgs) {
  const [{ id }, { from }, { m }] = await Promise.all([params, searchParams, getI18n()]);
  await requirePageUser();

  const image = await getSongImage(id);
  const song = image ? await getSong(image.songId) : null;
  const back =
    typeof from === "string"
      ? { href: safeNextPath(from), label: m.songs.imageView.back }
      : {
          href: song ? `/munkater/enektar?song=${song.id}` : "/munkater/enektar",
          label: m.common.nav.songs,
        };

  if (!image || !song) {
    return (
      <>
        <PageHeader title={m.songs.imageView.title} back={back} />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>{m.songs.imageView.notFound.title}</EmptyTitle>
            <EmptyDescription>{m.songs.imageView.notFound.description}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/munkater/enektar" className={buttonVariants({ variant: "outline" })}>
              {m.songs.edit.goToSongs}
            </Link>
          </EmptyContent>
        </Empty>
      </>
    );
  }

  return (
    <ImageViewer
      pages={image.pages}
      header={{
        title: image.name,
        details: (
          <AttachmentDetails
            songTitle={song.title}
            attachment={image}
            arrangements={song.arrangements}
          />
        ),
        back,
      }}
    />
  );
}
