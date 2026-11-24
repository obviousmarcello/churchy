"use server";

import { redirect } from "next/navigation";
import { errorState, type FormState } from "@/server/music/form-state";
import { createSong } from "@/server/music/models/songs";
import { musicTenant } from "@/server/music/policy";
import { withPolicy } from "@/server/policy";
import { readSongInput } from "../song-input";

// `createSong` checks the song admin role and validates the input. This action only turns the
// form fields into its input and its errors into form state. Churchy: `music.song.manage`.
// (Their `createSongInPlaceAction` belongs to the projection controller, phase 5.)

export const createSongAction = withPolicy(
  "music.song.manage",
  musicTenant,
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    const input = await readSongInput(formData);
    if ("status" in input) return input;
    let id: string;
    try {
      const song = await createSong(input);
      id = song.id;
    } catch (error) {
      return errorState(error, ({ m }) => m.songs.actions.saveFailed);
    }
    // Outside the try block: `redirect` throws to stop the action.
    redirect(`/munkater/enektar?song=${id}`);
  },
);
