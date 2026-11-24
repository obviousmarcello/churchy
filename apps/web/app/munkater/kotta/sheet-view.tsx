"use client";

import Link from "next/link";
import { SearchXIcon } from "lucide-react";

import { MusicModulesProvider } from "@/components/music/app-config";
import { buttonVariants } from "@/components/music/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { useI18n } from "@/i18n/music/client";
import { useBrowserValue } from "@/lib/music/browser";
import { safeNextPath } from "@/lib/music/next-path";
import type { SheetNotFound, SheetPageData } from "./data";
import { SheetViewer } from "./sheet-viewer";

type Result = { data: SheetPageData } | { notFound: SheetNotFound };

// Music Sheet DB's `SheetView` kept the page in an offline copy and followed events and live
// sessions; Churchy renders the data on the server per request. The sheet covers the workspace
// shell: it is a full-screen page.
export function SheetView({ result, from }: { result: Result; from?: string }) {
  const { m } = useI18n();
  // The hydration uses the server's values: the sheet would first show the desktop layout and the
  // default settings, then jump to the device's. So it waits for the browser's values.
  const hydrated = useBrowserValue(() => true, false);

  if ("notFound" in result) return <NotFound reason={result.notFound} from={from} />;
  if (!hydrated) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface">
        <p className="text-sm text-muted">{m.sheet.page.loading}</p>
      </div>
    );
  }
  const { viewerKey, title, songs, canEditSongs, backHref, modules } = result.data;
  return (
    <div className="fixed inset-0 z-50 bg-surface">
      <MusicModulesProvider modules={modules}>
        <SheetViewer
          key={viewerKey}
          cacheKey=""
          placeKey={viewerKey}
          isFresh
          canEditSongs={canEditSongs}
          title={title}
          songs={songs}
          backHref={from ? safeNextPath(from) : backHref}
        />
      </MusicModulesProvider>
    </div>
  );
}

function NotFound({ reason, from }: { reason: SheetNotFound; from?: string }) {
  const { m } = useI18n();
  const { notFound } = m.sheet;
  const content = {
    noArrangement: {
      title: notFound.noArrangementTitle,
      description: notFound.noArrangementDescription,
    },
    song: { title: notFound.songTitle, description: notFound.songDescription },
    songs: { title: notFound.songsTitle, description: notFound.songsDescription },
  }[reason];
  const backHref = from ? safeNextPath(from) : "/munkater/enektar";

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{content.title}</EmptyTitle>
          <EmptyDescription>{content.description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href={backHref} className={buttonVariants({ variant: "outline" })}>
            {from ? notFound.goBack : notFound.goToSongs}
          </Link>
        </EmptyContent>
      </Empty>
    </main>
  );
}
