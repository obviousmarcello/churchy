"use client";

import { useSearchParams } from "next/navigation";

import { useI18n } from "@/i18n/music/client";
import { NEW_TITLE_PARAM } from "@/lib/music/next-path";
import { SongForm } from "../song-form";
import { usePolicyAction } from "@/lib/music/policy-form";
import { createSongAction } from "./actions";

/** `tagOptions`: the suggestions of the tag field. A `title` in the URL fills in the title (see `newSongHref`). */
export function NewSongForm({ tagOptions }: { tagOptions: string[] }) {
  const { m } = useI18n();
  const title = useSearchParams().get(NEW_TITLE_PARAM) ?? undefined;

  return (
    // As on the edit page: without the narrow card, the chart preview goes next to the chart on a wide screen.
    <div className="px-4 py-8 sm:px-6">
      <SongForm
        action={usePolicyAction(createSongAction)}
        submitLabel={m.songs.new.submit}
        pendingLabel={m.songs.new.pending}
        cancel="/munkater/enektar"
        card={false}
        tagOptions={tagOptions}
        initialTitle={title}
      />
    </div>
  );
}
