"use server";

import { errorState, file, runUpdate, text, type FormState } from "@/server/music/form-state";
import {
  exportSongsForLocalResearch,
  importResearchFindings,
  researchSongNow,
  runResearchNow,
} from "@/server/music/models/song-rights-research";
import { musicTenant } from "@/server/music/policy";
import { withPolicy } from "@/server/policy";

export type SongRightsFormState = FormState;

// The model checks the user again and validates the input. These actions only turn the form
// fields into its input and its errors into form state. Churchy: `music.songRights.manage`
// through `withPolicy`. The AI research uses the platform key (`ANTHROPIC_API_KEY`) within the
// plan's monthly cap; the music app's provider, API key and test forms are left out.

/** The `findings` field is the JSON file of a local research. */
export const uploadFindingsAction = withPolicy(
  "music.songRights.manage",
  musicTenant,
  async (
    _scope,
    _previous: SongRightsFormState,
    formData: FormData,
  ): Promise<SongRightsFormState> => {
    let outcome = { imported: 0, skipped: [] as string[] };
    return runUpdate(
      {
        success: ({ m, format, plural }) =>
          [
            plural(m.songRights.upload.imported, outcome.imported),
            outcome.skipped.length > 0
              ? format(m.songRights.upload.skipped, {
                  count: outcome.skipped.length,
                  songs: outcome.skipped.join(", "),
                })
              : "",
          ]
            .filter(Boolean)
            .join(" "),
        failure: ({ m }) => m.songRights.upload.failed,
        notFound: ({ m }) => m.songRights.upload.failed,
      },
      async () => {
        outcome = await importResearchFindings(file(formData, "findings"));
        return true;
      },
    );
  },
);

export type SongsExportResult =
  { status: "success"; json: string } | { status: "error"; message: string };

/** The open songs as a JSON text, for the download. */
export const exportSongsAction = withPolicy(
  "music.songRights.manage",
  musicTenant,
  async (): Promise<SongsExportResult> => {
    try {
      return {
        status: "success",
        json: JSON.stringify(await exportSongsForLocalResearch(), null, 2),
      };
    } catch (error) {
      const state = await errorState(error, ({ m }) => m.songRights.upload.downloadFailed);
      return { status: "error", message: state.message ?? "" };
    }
  },
);

/** "Research now": the `count` field is the number of songs (at most what is left of the month). */
export const runNowAction = withPolicy(
  "music.songRights.manage",
  musicTenant,
  async (
    _scope,
    _previous: SongRightsFormState,
    formData: FormData,
  ): Promise<SongRightsFormState> => {
    let counts = { researched: 0, failed: 0 };
    return runUpdate(
      {
        success: ({ m, format }) =>
          counts.researched + counts.failed === 0
            ? m.songRights.runNow.nothing
            : format(m.songRights.runNow.result, counts),
        failure: ({ m }) => m.songRights.runNow.failed,
        notFound: ({ m }) => m.songRights.runNow.failed,
      },
      async () => {
        counts = await runResearchNow({ count: text(formData, "count") });
        return true;
      },
    );
  },
);

/** "Research again": the `id` field is the song, `title` its title for the message. */
export const researchSongAction = withPolicy(
  "music.songRights.manage",
  musicTenant,
  async (
    _scope,
    _previous: SongRightsFormState,
    formData: FormData,
  ): Promise<SongRightsFormState> => {
    const title = text(formData, "title");
    return runUpdate(
      {
        success: ({ m, format }) => format(m.songRights.closed.againDone, { title }),
        failure: ({ m }) => m.songRights.closed.againFailed,
        notFound: ({ m }) => m.songRights.closed.againFailed,
      },
      () => researchSongNow(text(formData, "id")),
    );
  },
);
