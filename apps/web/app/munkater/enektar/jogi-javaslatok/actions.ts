"use server";

import { PROPOSAL_TEXT_FIELDS } from "@/lib/music/song-rights-research";
import { runUpdate, text, type FormState } from "@/server/music/form-state";
import { reviewRightsProposal } from "@/server/music/models/song-rights-research";
import { musicTenant } from "@/server/music/policy";
import { withPolicy } from "@/server/policy";

export type ReviewFormState = FormState;

// The model checks the song admin role and validates the input. This action only turns the form
// fields into its input and its errors into form state. Churchy: `music.song.manage`.

/**
 * `decision` is `accept` or `reject`. For each field, `keep-<field>` is the checkbox and
 * `<field>` the value that the reviewer kept.
 */
export const reviewProposalAction = withPolicy(
  "music.song.manage",
  musicTenant,
  async (_scope, _previous: ReviewFormState, formData: FormData): Promise<ReviewFormState> => {
    const accept = text(formData, "decision") === "accept";
    const changes: Record<string, string> = {};
    if (accept) {
      for (const key of [...PROPOSAL_TEXT_FIELDS.map((field) => field.key), "rightsStatus"]) {
        if (formData.get(`keep-${key}`) === "on") changes[key] = text(formData, key);
      }
    }
    return runUpdate(
      {
        success: ({ m }) =>
          accept ? m.songRights.proposals.accepted : m.songRights.proposals.rejected,
        failure: ({ m }) => m.songRights.proposals.reviewFailed,
        notFound: ({ m }) => m.songRights.proposals.gone,
      },
      () => reviewRightsProposal({ id: text(formData, "id"), accept, changes }),
    );
  },
);
