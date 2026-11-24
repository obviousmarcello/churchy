"use client";

import { useSearchParams } from "next/navigation";

import { parseSongFilters, parseSongSort } from "@/lib/music/song-filters";
import type { SongsPageData } from "./data";
import { SongBrowser } from "./song-browser";

/** The URL's search params as a record (their `searchParamsRecord`). */
function paramsRecord(params: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    out[key] = values.length === 1 ? values[0]! : values;
  }
  return out;
}

export function SongsView({ data }: { data: SongsPageData }) {
  const params = paramsRecord(useSearchParams());
  return (
    <SongBrowser
      result={data.result}
      // From the URL, not from the data: the fields follow the URL at once.
      filters={parseSongFilters(params)}
      sort={parseSongSort(params)}
      options={data.options}
      extraSong={data.extraSong}
      canEditSongs={data.canEditSongs}
      canEditEvents={data.canEditEvents}
      rightsProposals={data.rightsProposals}
      isLoading={false}
      failed={false}
      files={data.files}
    />
  );
}
