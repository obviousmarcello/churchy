"use client";

import { useEffect, useState } from "react";
import { ChevronRightIcon } from "lucide-react";

import { FormSection } from "@/components/music/form-parts";
import { PageSave, PageSaveBar } from "@/components/music/page-save";
import { useI18n } from "@/i18n/music/client";
import type { Messages } from "@/i18n/music/messages";
import { cn } from "@/lib/music/utils";
import { DeleteSongButton } from "../../delete-song-button";
import type { SharedSongRightsDTO } from "@/server/music/models/songs";
import { SongForm, type SongFormValues } from "../../song-form";
import { usePolicyAction } from "@/lib/music/policy-form";
import { updateSongInPlaceAction } from "./actions";

// The parts of the page in their order. The song form has the ids of its sections.
const parts: { id: string; title: (m: Messages) => string }[] = [
  { id: "song", title: (m) => m.songs.form.song },
  { id: "chart", title: (m) => m.songs.form.chart },
  { id: "playing-order", title: (m) => m.songs.form.playingOrder },
  { id: "details", title: (m) => m.songs.form.details },
  { id: "rights", title: (m) => m.songs.form.rights },
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
}: {
  song: SongFormValues;
  /** The suggestions of the tag field. */
  tagOptions: string[];
  /** The facts of the shared song-rights catalog for this song, if any. */
  sharedRights: SharedSongRightsDTO | null;
}) {
  const { m } = useI18n();
  const t = m.songs.edit.delete;

  return (
    <PageSave savedHref={`/munkater/enektar?song=${song.id}`}>
      <div className="flex flex-1 flex-col md:flex-row">
        <Contents />

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
              />
            </div>
            <PageSaveBar />
          </div>
          <Part id="delete">
            <FormSection
              title={t.title}
              description={t.description}
              className="max-w-3xl rounded-lg border border-danger/30 p-4"
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
function Contents() {
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
  }, []);

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
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors outline-none hover:bg-surface-sunken/60 focus-visible:bg-surface-sunken focus-visible:ring-3 focus-visible:ring-focus/50 focus-visible:ring-inset md:rounded-none md:border-0 md:px-4 md:py-3",
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
