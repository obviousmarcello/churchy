import "server-only";

import { firstParam, parsePage, parseSongFilters, parseSongSort } from "@/lib/music/song-filters";
import type { CurrentUser } from "@/server/music/auth";
import {
  findSongs,
  getSongWithPlays,
  listSongFilterOptions,
  type SongFilterOptionsDTO,
  type SongListItemDTO,
  type SongPageDTO,
} from "@/server/music/models/songs";
import { countRightsProposals } from "@/server/music/models/song-rights-research";

export type SongsPageData = {
  /** One page of the songs that match the filters. */
  result: SongPageDTO;
  options: SongFilterOptionsDTO;
  /** This only shows the add and edit links. Saving checks `music.song.manage` again. */
  canEditSongs: boolean;
  /** This only shows "Add to event" (events: phase 4). */
  canEditEvents: boolean;
  /** The rights proposals that wait for a review. Always 0 for users who are not song admins. */
  rightsProposals: number;
  /**
   * The selected song when it is not on this page, e.g. after "Add song" or from a shared link.
   */
  extraSong: SongListItemDTO | null;
};

// Music Sheet DB loaded this page into its offline page cache (`loadPage`, `usePageData`);
// Churchy renders it on the server for each request.
export async function loadSongsPage(
  user: CurrentUser,
  params: Record<string, string | string[] | undefined>,
): Promise<SongsPageData> {
  const [result, options, rightsProposals] = await Promise.all([
    findSongs({
      ...parseSongFilters(params),
      sort: parseSongSort(params),
      page: parsePage(params),
    }),
    listSongFilterOptions(),
    // Only a link: the songs still show when the count fails.
    user.canEditSongs
      ? countRightsProposals().catch((error: unknown) => {
          console.error("[songs] Failed to count the rights proposals:", error);
          return 0;
        })
      : 0,
  ]);
  const selectedId = firstParam(params.song);
  const extraSong =
    selectedId && !result.songs.some((song) => song.id === selectedId)
      ? await getSongWithPlays(selectedId)
      : null;
  return {
    result,
    options,
    canEditSongs: user.canEditSongs,
    canEditEvents: user.canEditEvents,
    rightsProposals,
    extraSong,
  };
}
