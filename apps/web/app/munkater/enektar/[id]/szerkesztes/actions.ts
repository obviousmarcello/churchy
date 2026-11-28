"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { getRequestI18n } from "@/i18n/music/server";
import { errorState, runUpdate, text, type FormState } from "@/server/music/form-state";
import { getArrangement } from "@/server/music/models/arrangements";
import { readProjectionThemes } from "@/server/music/models/projection-themes";
import { deleteSong, getSong, updateSongWithArrangement } from "@/server/music/models/songs";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";
import type { SongFormValues } from "../../song-form";
import { musicTenant } from "@/server/music/policy";
import { withPolicy } from "@/server/policy";
import { readSongInput } from "../../song-input";

// `updateSongWithArrangement` and `deleteSong` check the song admin role and validate the input.
// These actions only turn the form fields into their input and their errors into form state.
// Churchy: `music.song.manage` through `withPolicy`. Left out until their phases: the actions of
// the song's files (scores, PDFs, images, sound files, links; second slice of phase 2), the
// projection theme of the arrangement (phase 5, kept as it is) and the song dialog's
// `getSongFormValuesAction` (event and projection screens).

/** Saves the song and its arrangement. The page stays and shows the new values. */
export const updateSongInPlaceAction = withPolicy(
  "music.song.manage",
  musicTenant,
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    const input = await readSongInput(formData);
    if ("status" in input) return input;

    return runUpdate(
      {
        success: ({ m }) => m.songs.actions.saved,
        failure: ({ m }) => m.songs.actions.saveFailed,
        notFound: ({ m }) => m.songs.actions.notFound,
      },
      async () =>
        (await updateSongWithArrangement(
          text(formData, "id"),
          text(formData, "arrangementId"),
          input,
          undefined,
        )) !== null,
    );
  },
);

/** Deletes the song with its arrangements, then goes to the song list. */
export const deleteSongAction = withPolicy(
  "music.song.manage",
  musicTenant,
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    const failed = await deleteSongFromForm(formData);
    if (failed) return failed;
    redirect("/munkater/enektar");
  },
);

/** Like `deleteSongAction`, but stays on the page, e.g. in the song list. The caller closes the song. */
export const deleteSongInPlaceAction = withPolicy(
  "music.song.manage",
  musicTenant,
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    const failed = await deleteSongFromForm(formData);
    if (failed) return failed;
    refresh();
    return { status: "success", message: null, fieldErrors: {} };
  },
);

/** Deletes the song of the form. Returns the error state, or null after a delete. */
async function deleteSongFromForm(formData: FormData): Promise<FormState | null> {
  try {
    if (await deleteSong(text(formData, "id"))) return null;
    const { m } = await getRequestI18n();
    return { status: "error", message: m.songs.actions.notFound, fieldErrors: {} };
  } catch (error) {
    return errorState(error, ({ m }) => m.songs.actions.deleteFailed);
  }
}

/** The values for the song form, e.g. in the dialog of the event page. Null if the song or the arrangement does not exist. */
export const getSongFormValuesAction = withPolicy(
  "music.song.manage",
  musicTenant,
  async (_scope, songId: string, arrangementId: string): Promise<SongFormValues | null> => {
    if (typeof songId !== "string" || typeof arrangementId !== "string") return null;
    // Only the names of the themes (the form has no theme field without the module).
    const [song, arrangement, themes] = await Promise.all([
      getSong(songId),
      getArrangement(arrangementId),
      isWorkspaceModuleOn("ws.music.projection.themes").then((on) =>
        on ? readProjectionThemes() : undefined,
      ),
    ]);
    if (!song || !arrangement || arrangement.songId !== song.id) return null;
    return {
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
      themes: themes?.map(({ id, name }) => ({ id, name })),
    };
  },
);
