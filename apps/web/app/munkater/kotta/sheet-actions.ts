"use server";

import { getRequestI18n } from "@/i18n/music/server";
import type { FileView } from "@/lib/music/file-view";
import type { SheetMark } from "@/lib/music/sheet-marks";
import type { DeviceType, SheetView } from "@/lib/music/sheet-view";
import { errorState, runSave, runUpdate } from "@/server/music/form-state";
import { updateArrangement } from "@/server/music/models/arrangements";
import { setMyCapo, setMyKey, setMyView } from "@/server/music/models/my-arrangements";
import { setMyFileView, type FileKind } from "@/server/music/models/my-file-views";
import {
  changeMySheetMarks,
  listMySheetMarks,
  type SheetMarksChange,
} from "@/server/music/models/sheet-marks";
import { musicSheet } from "@/server/music/policy";
import { withPolicy } from "@/server/policy";

// The actions of the chord sheet (Music Sheet DB's `sheet/*-actions.ts`). The models check the
// signed-in user and validate the input; Churchy: `music.sheet.personalize` (own capo, key, layout,
// zoom and marks, for every workspace role) or `music.song.manage` (the tempo of the arrangement)
// first. Call them directly, not with `useActionState`: the sheet shows each change before the result.

export type SaveResult = { status: "success" } | { status: "error"; message: string };

/** Saves the signed-in user's capo for the arrangement. Null uses the chart's `{capo}` again. */
export const setCapo = withPolicy(
  "music.sheet.personalize",
  musicSheet(),
  async (_scope, arrangementId: string, capo: number | null): Promise<SaveResult> =>
    runSave(
      { failure: ({ m }) => m.sheet.capo.saveFailed, notFound: ({ m }) => m.sheet.capo.notFound },
      () => setMyCapo(arrangementId, capo),
    ),
);

/** Saves the signed-in user's key (in English note names) for the arrangement. Null uses the key of the chart again. */
export const setKey = withPolicy(
  "music.sheet.personalize",
  musicSheet(),
  async (_scope, arrangementId: string, key: string | null): Promise<SaveResult> =>
    runSave(
      { failure: ({ m }) => m.sheet.key.saveFailed, notFound: ({ m }) => m.sheet.key.notFound },
      () => setMyKey(arrangementId, key),
    ),
);

/** Saves the signed-in user's layout of the arrangement on a type of device. Null uses the device's settings again. */
export const setView = withPolicy(
  "music.sheet.personalize",
  musicSheet(),
  async (
    _scope,
    arrangementId: string,
    deviceType: DeviceType,
    view: SheetView | null,
  ): Promise<SaveResult> =>
    runSave(
      { failure: ({ m }) => m.sheet.view.saveFailed, notFound: ({ m }) => m.sheet.view.notFound },
      () => setMyView(arrangementId, deviceType, view),
    ),
);

/** Saves the signed-in user's zoom of a PDF file or an image. Null shows the whole page again. */
export const setFileView = withPolicy(
  "music.sheet.personalize",
  musicSheet(),
  async (_scope, kind: FileKind, fileId: string, view: FileView | null): Promise<SaveResult> =>
    runSave(
      { failure: ({ m }) => m.sheet.zoom.saveFailed, notFound: ({ m }) => m.sheet.zoom.notFound },
      () => setMyFileView(kind, fileId, view),
    ),
);

/** Erases and saves marks of the signed-in user on the arrangement. */
export const changeMarks = withPolicy(
  "music.sheet.personalize",
  musicSheet("marks"),
  async (_scope, arrangementId: string, change: SheetMarksChange): Promise<SaveResult> => {
    try {
      if (await changeMySheetMarks(arrangementId, change)) return { status: "success" };
      const { m } = await getRequestI18n();
      return { status: "error", message: m.sheet.marks.notFound };
    } catch (cause) {
      const state = await errorState(cause, ({ m }) => m.sheet.marks.saveFailed);
      // The toolbar has no fields: show the issue, not "correct the fields".
      const fieldError = Object.values(state.fieldErrors).flat()[0];
      return { status: "error", message: fieldError ?? state.message ?? "" };
    }
  },
);

/** The marks that the server has, after a change failed. Null when they do not load. */
export const listMarks = withPolicy(
  "music.sheet.personalize",
  musicSheet("marks"),
  async (_scope, arrangementId: string): Promise<SheetMark[] | null> => {
    try {
      return (await listMySheetMarks([arrangementId])).get(arrangementId) ?? [];
    } catch {
      return null;
    }
  },
);

/** Writes the tempo into the arrangement's chart (`{tempo}`), for all users. The model checks the song admin role. */
export const saveTempo = withPolicy(
  "music.song.manage",
  musicSheet("metronome"),
  async (_scope, arrangementId: string, bpm: number): Promise<SaveResult> => {
    const state = await runUpdate(
      {
        // The sheet shows the new tempo: no message.
        success: () => "",
        failure: ({ m }) => m.sheet.metronome.saveTempoFailed,
        notFound: ({ m }) => m.sheet.metronome.saveTempoNotFound,
      },
      async () => (await updateArrangement(arrangementId, { bpm })) !== null,
    );
    if (state.status === "success") return { status: "success" };
    // The popover has no fields: show the issue, not "correct the fields".
    const fieldError = Object.values(state.fieldErrors).flat()[0];
    return { status: "error", message: fieldError ?? state.message ?? "" };
  },
);
