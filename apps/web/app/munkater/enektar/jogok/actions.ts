"use server";

import { errorState, file, runUpdate, type FormState } from "@/server/music/form-state";
import {
  exportSongsForLocalResearch,
  importResearchFindings,
} from "@/server/music/models/song-rights-research";
import { musicTenant } from "@/server/music/policy";
import { withPolicy } from "@/server/policy";

export type SongRightsFormState = FormState;

// The model checks the user again and validates the input. These actions only turn the form
// fields into its input and its errors into form state. Churchy: `music.songRights.manage`
// through `withPolicy`; the AI research actions (settings, API key, test, research now) wait for
// the platform key and the per-plan cap.

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
