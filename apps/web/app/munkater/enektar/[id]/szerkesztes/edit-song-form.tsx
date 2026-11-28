"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRightIcon } from "lucide-react";

import { FormSection } from "@/components/music/form-parts";
import { PageSave, PageSaveBar } from "@/components/music/page-save";
import { useI18n } from "@/i18n/music/client";
import type { Messages } from "@/i18n/music/messages";
import { cn } from "@/lib/music/utils";
import { DeleteSongButton } from "../../delete-song-button";
import type { SharedSongRightsDTO } from "@/server/music/models/songs";
import { SongForm, type ChartHandle, type SongFormValues } from "../../song-form";
import { usePolicyAction } from "@/lib/music/policy-form";
import { updateSongInPlaceAction } from "./actions";
import type { SongFileModules } from "../../data";
import type { SongScoreDTO } from "@/server/music/models/scores";
import { SongImages } from "./song-images";
import { SongLinks } from "./song-links";
import { SongPdfs } from "./song-pdfs";
import { SongScores } from "./song-scores";
import { SongSoundFiles } from "./song-sound-files";

// The parts of the page in their order. The song form has the ids of its sections.
const allParts: { id: string; title: (m: Messages) => string; module?: keyof SongFileModules }[] = [
  { id: "song", title: (m) => m.songs.form.song },
  { id: "chart", title: (m) => m.songs.form.chart },
  { id: "playing-order", title: (m) => m.songs.form.playingOrder },
  { id: "details", title: (m) => m.songs.form.details },
  { id: "rights", title: (m) => m.songs.form.rights },
  { id: "scores", title: (m) => m.songs.scores.title, module: "scores" },
  { id: "pdfs", title: (m) => m.songs.pdfs.title, module: "pdfs" },
  { id: "images", title: (m) => m.songs.images.title, module: "images" },
  { id: "sound-files", title: (m) => m.songs.soundFiles.title, module: "soundFiles" },
  { id: "links", title: (m) => m.songs.links.title, module: "links" },
  { id: "delete", title: (m) => m.songs.edit.delete.title },
];

/**
 * All the parts of the song on one long page on the right. The list on the
 * left goes to a part and marks the part at the top of the window. One save
 * button at the bottom of the window saves all the parts with changes.
 */
export function EditSongForm({
  song,
  tagOptions,
  sharedRights,
  files,
  scores,
  scoreLimits,
  pdfs,
  images,
  soundFiles,
  links,
}: {
  song: SongFormValues;
  /** The file modules that are on (`ws.music.songs.*`): the file parts that show. */
  files: SongFileModules;
  scores: SongScoreDTO[];
  scoreLimits: React.ComponentProps<typeof SongScores>["limits"];
  pdfs: Omit<React.ComponentProps<typeof SongPdfs>, "songId">;
  images: Omit<React.ComponentProps<typeof SongImages>, "songId" | "chart">;
  soundFiles: Omit<React.ComponentProps<typeof SongSoundFiles>, "songId">;
  links: Omit<React.ComponentProps<typeof SongLinks>, "songId">;
  /** The suggestions of the tag field. */
  tagOptions: string[];
  /** The facts of the shared song-rights catalog for this song, if any. */
  sharedRights: SharedSongRightsDTO | null;
}) {
  const { m } = useI18n();
  const t = m.songs.edit.delete;
  const chart = useRef<ChartHandle>(null);
  const parts = useMemo(
    () => allParts.filter((part) => !part.module || files[part.module]),
    [files],
  );

  return (
    <PageSave savedHref={`/munkater/enektar?song=${song.id}`}>
      <div className="flex flex-1 flex-col md:flex-row">
        <Contents parts={parts} />

        <div className="flex min-w-0 flex-1 flex-col divide-y">
          {/* The save bar stays at the bottom of the window only next to the parts that it saves. */}
          <div className="flex flex-col divide-y">
            {/* The parts use the full width: each puts its preview next to its content when it has room. */}
            <div className="px-4 py-8 sm:px-6">
              <SongForm
                action={usePolicyAction(updateSongInPlaceAction)}
                song={song}
                card={false}
                tagOptions={tagOptions}
                sharedRights={sharedRights}
                embedded
                chartHandle={chart}
                images={files.images ? images.images : undefined}
              />
            </div>
            {files.scores && (
              <Part id="scores">
                <SongScores songId={song.id} scores={scores} limits={scoreLimits} />
              </Part>
            )}
            {files.pdfs && (
              <Part id="pdfs">
                <SongPdfs songId={song.id} {...pdfs} />
              </Part>
            )}
            {files.images && (
              <Part id="images">
                <SongImages
                  songId={song.id}
                  {...images}
                  chart={{
                    isEmpty: () => chart.current?.isEmpty() ?? true,
                    insert: (text, replace) => chart.current?.insert(text, replace),
                  }}
                />
              </Part>
            )}
            {files.soundFiles && (
              <Part id="sound-files">
                <SongSoundFiles songId={song.id} {...soundFiles} />
              </Part>
            )}
            {files.links && (
              <Part id="links">
                <SongLinks songId={song.id} {...links} />
              </Part>
            )}
            <PageSaveBar />
          </div>
          <Part id="delete">
            <FormSection
              title={t.title}
              description={t.description}
              className="max-w-3xl rounded-card border border-danger/30 p-4"
            >
              <DeleteSongButton songId={song.id} title={song.title} />
            </FormSection>
          </Part>
        </div>
      </div>
    </PageSave>
  );
}

function Part({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    // The sticky page header covers the top of the window. The previews fit the width of the part.
    <div id={id} className="@container scroll-mt-25 px-4 py-8 sm:px-6">
      {children}
    </div>
  );
}

/** The list of the parts, as the list of the email notifications page looks. */
function Contents({ parts }: { parts: typeof allParts }) {
  const { m } = useI18n();
  const [current, setCurrent] = useState(parts[0]!.id);

  useEffect(() => {
    const elements = parts.map(({ id }) => document.getElementById(id));
    const last = elements[elements.length - 1];
    let lastShown = false;

    function update() {
      // The last part that starts above a third of the window.
      const line = window.innerHeight / 3;
      let next = parts[0]!.id;
      parts.forEach(({ id }, index) => {
        const top = elements[index]?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) next = id;
      });
      // The last parts can be too short to get to the line.
      if (lastShown && document.documentElement.scrollTop > 0) next = parts[parts.length - 1]!.id;
      setCurrent(next);
    }

    // The page reads the positions only when a part crosses the line or the
    // top of the window, not on each scroll: the previews make the layout slow.
    const lineObserver = new IntersectionObserver(update, { rootMargin: "0px 0px -66.667% 0px" });
    for (const element of elements) if (element) lineObserver.observe(element);
    const lastObserver = new IntersectionObserver(
      (entries) => {
        lastShown = entries[entries.length - 1]!.intersectionRatio >= 1;
        update();
      },
      { threshold: 1 },
    );
    if (last) lastObserver.observe(last);

    update();
    window.addEventListener("resize", update);
    return () => {
      lineObserver.disconnect();
      lastObserver.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [parts]);

  return (
    <nav
      aria-label={m.songs.edit.contents}
      className="shrink-0 border-b md:w-56 md:border-r md:border-b-0 xl:w-72"
    >
      {/* Under the sticky page header. Small screens: the parts are chips that wrap, so the list does not push the form far down. */}
      <ul className="flex flex-wrap gap-2 px-4 py-3 sm:px-6 md:sticky md:top-25 md:block md:divide-y md:p-0">
        {parts.map(({ id, title }) => {
          const isCurrent = id === current;
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={isCurrent ? "location" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-card border px-3 py-2 text-left transition-colors outline-none hover:bg-surface-sunken/60 focus-visible:bg-surface-sunken focus-visible:ring-3 focus-visible:ring-focus/50 focus-visible:ring-inset md:rounded-none md:border-0 md:px-4 md:py-3",
                  isCurrent && "bg-surface-sunken",
                )}
              >
                <span
                  className={cn(
                    "min-w-0 flex-1 text-sm",
                    isCurrent && "font-medium",
                    id === "delete" && "text-danger",
                  )}
                >
                  {title(m)}
                </span>
                <ChevronRightIcon className="hidden size-4 shrink-0 text-muted md:block" />
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
