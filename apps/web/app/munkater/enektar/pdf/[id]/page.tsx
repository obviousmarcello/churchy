import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SearchXIcon } from "lucide-react";

import { AttachmentDetails } from "@/components/music/attachment-details";
import { PageHeader } from "@/components/music/page-header";
import { PdfViewer } from "@/components/music/pdf-viewer";
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
import { getSongPdf } from "@/server/music/models/pdfs";
import { getSong } from "@/server/music/models/songs";

// A PDF file of a song, for every signed-in user (see `pdfHref`). Its back
// link goes to `from`, e.g. the sheet, or to the song.

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.songs.pdfView.title };
}

export default async function PdfPage({ params, searchParams }: PageArgs) {
  await requireWorkspaceModule("ws.music.songs.pdfs");
  const { m } = await getI18n();

  return (
    <>
      <main className="flex flex-1 flex-col">
        {/* Reads the session cookie and the URL, so it renders at request time. */}
        <Suspense
          fallback={
            <>
              <PageHeader title={m.songs.pdfView.title} />
              <p className="px-4 py-6 text-sm text-muted sm:px-6">{m.songs.pdfView.loading}</p>
            </>
          }
        >
          <PdfGate params={params} searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function PdfGate({ params, searchParams }: PageArgs) {
  const [{ id }, { from }, { m }] = await Promise.all([params, searchParams, getI18n()]);
  await requirePageUser();

  const pdf = await getSongPdf(id);
  const song = pdf ? await getSong(pdf.songId) : null;
  const back =
    typeof from === "string"
      ? { href: safeNextPath(from), label: m.songs.pdfView.back }
      : {
          href: song ? `/munkater/enektar?song=${song.id}` : "/munkater/enektar",
          label: m.common.nav.songs,
        };

  if (!pdf || !song) {
    return (
      <>
        <PageHeader title={m.songs.pdfView.title} back={back} />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>{m.songs.pdfView.notFound.title}</EmptyTitle>
            <EmptyDescription>{m.songs.pdfView.notFound.description}</EmptyDescription>
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
    <PdfViewer
      url={pdf.url}
      downloadUrl={`${pdf.url}?download=1`}
      header={{
        title: pdf.name,
        details: (
          <AttachmentDetails
            songTitle={song.title}
            attachment={pdf}
            arrangements={song.arrangements}
          />
        ),
        back,
      }}
    />
  );
}
