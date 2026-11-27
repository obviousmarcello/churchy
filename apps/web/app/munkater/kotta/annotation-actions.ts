"use server";

import { errorState, type FormState } from "@/server/music/form-state";
import {
  createAnnotation,
  deleteAnnotation,
  updateAnnotation,
} from "@/server/music/models/annotations";
import { musicSheet } from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";

// The user's own notes on a song (of a section, of a setlist slot): every role that may use the chord
// sheet has them (`music.sheet.personalize`); the model only touches the user's own rows.

const OK: FormState = { status: "success", message: null, fieldErrors: {} };

export const createAnnotationAction = withPolicy(
  "music.sheet.personalize",
  musicSheet(),
  async (_scope: PolicyScope, input: unknown): Promise<FormState> => {
    try {
      await createAnnotation(input);
      return OK;
    } catch (error) {
      return errorState(error, ({ m }) => m.sheet.annotations.saveFailed);
    }
  },
);

export const updateAnnotationAction = withPolicy(
  "music.sheet.personalize",
  musicSheet(),
  async (_scope: PolicyScope, id: string, patch: unknown): Promise<FormState> => {
    try {
      const saved = await updateAnnotation(id, patch);
      return saved ? OK : errorState(new Error("gone"), ({ m }) => m.sheet.annotations.gone);
    } catch (error) {
      return errorState(error, ({ m }) => m.sheet.annotations.saveFailed);
    }
  },
);

export const deleteAnnotationAction = withPolicy(
  "music.sheet.personalize",
  musicSheet(),
  async (_scope: PolicyScope, id: string): Promise<FormState> => {
    try {
      await deleteAnnotation(id);
      return OK;
    } catch (error) {
      return errorState(error, ({ m }) => m.sheet.annotations.saveFailed);
    }
  },
);
