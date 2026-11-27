"use server";

import { refresh } from "next/cache";

import type { Text } from "@/i18n/music/i18n";
import { getRequestI18n } from "@/i18n/music/server";
import {
  errorState,
  file,
  runSave,
  runUpdate,
  text,
  type FormState,
  type SaveResult,
} from "@/server/music/form-state";
import {
  countProjectionThemeUses,
  createProjectionTheme,
  deleteProjectionTheme,
  duplicateProjectionTheme,
  removeProjectionThemeBackground,
  setDefaultProjectionTheme,
  setProjectionThemeBackground,
  setProjectionThemeVideo,
  startProjectionVideoUpload,
  updateProjectionTheme,
  type ThemeUsesDTO,
} from "@/server/music/models/projection-themes";
import { musicProjectionChild } from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";

// The model checks the event admin role (the superadmin role for the default)
// and validates the input. These actions only turn the fields into its input
// and its errors into form state.

export type ThemeFormState = FormState;

/** A new theme, or a copy: its id, so the page can select it. */
export type CreateThemeResult =
  { status: "success"; id: string } | { status: "error"; message: string };

const NOT_FOUND: Text = ({ m }) => m.projectionThemes.actions.notFound;

/** Creates a theme with the look of `fields` (see `themeInputSchema`) and the name of the form. */
export const createThemeAction = withPolicy(
  "music.projection.themes.manage",
  musicProjectionChild("themes"),
  async (_scope: PolicyScope, fields: unknown): Promise<CreateThemeResult> => {
    try {
      const id = await createProjectionTheme(fields);
      refresh();
      return { status: "success", id };
    } catch (error) {
      const state = await errorState(error, ({ m }) => m.projectionThemes.list.createFailed);
      return {
        status: "error",
        message: Object.values(state.fieldErrors).flat()[0] ?? state.message ?? "",
      };
    }
  },
);

/** The `theme` field: the JSON of the fields (see `themeInputSchema`). Field errors use their names, e.g. `name`. */
export const saveThemeAction = withPolicy(
  "music.projection.themes.manage",
  musicProjectionChild("themes"),
  async (
    _scope: PolicyScope,
    _previous: ThemeFormState,
    formData: FormData,
  ): Promise<ThemeFormState> => {
    let fields: unknown;
    try {
      fields = JSON.parse(text(formData, "theme"));
    } catch {
      return {
        status: "error",
        message: (await getRequestI18n()).m.projectionThemes.actions.saveFailed,
        fieldErrors: {},
      };
    }
    return runUpdate(
      {
        success: ({ m }) => m.projectionThemes.actions.saved,
        failure: ({ m }) => m.projectionThemes.actions.saveFailed,
        notFound: NOT_FOUND,
      },
      () => updateProjectionTheme(text(formData, "id"), fields),
    );
  },
);

export const duplicateThemeAction = withPolicy(
  "music.projection.themes.manage",
  musicProjectionChild("themes"),
  async (_scope: PolicyScope, id: string): Promise<CreateThemeResult> => {
    try {
      const copyId = await duplicateProjectionTheme(id);
      const i18n = await getRequestI18n();
      if (!copyId) return { status: "error", message: NOT_FOUND(i18n) };
      refresh();
      return { status: "success", id: copyId };
    } catch (error) {
      const state = await errorState(error, ({ m }) => m.projectionThemes.actions.duplicateFailed);
      return { status: "error", message: state.message ?? "" };
    }
  },
);

/** For `ConfirmDialog`: the `id` field. */
export const deleteThemeAction = withPolicy(
  "music.projection.themes.manage",
  musicProjectionChild("themes"),
  async (
    _scope: PolicyScope,
    _previous: ThemeFormState,
    formData: FormData,
  ): Promise<ThemeFormState> => {
    return runUpdate(
      {
        success: ({ m }) => m.projectionThemes.actions.deleted,
        failure: ({ m }) => m.projectionThemes.actions.deleteFailed,
        notFound: NOT_FOUND,
      },
      () => deleteProjectionTheme(text(formData, "id")),
    );
  },
);

/** How many events and items use the theme, for the delete dialog. Null when it fails. */
export const themeUsesAction = withPolicy(
  "music.projection.themes.manage",
  musicProjectionChild("themes"),
  async (_scope: PolicyScope, id: string): Promise<ThemeUsesDTO | null> => {
    try {
      return await countProjectionThemeUses(id);
    } catch {
      return null;
    }
  },
);

export const setDefaultThemeAction = withPolicy(
  "music.projection.themes.setDefault",
  musicProjectionChild("themes"),
  async (_scope: PolicyScope, id: string): Promise<SaveResult> => {
    const result = await runSave(
      { failure: ({ m }) => m.projectionThemes.actions.defaultFailed, notFound: NOT_FOUND },
      () => setDefaultProjectionTheme(id),
    );
    if (result.status === "success") refresh();
    return result;
  },
);

/** The `id` and `image` fields: the browser made the image smaller first. */
export const setBackgroundAction = withPolicy(
  "music.projection.themes.manage",
  musicProjectionChild("themes"),
  async (_scope: PolicyScope, formData: FormData): Promise<SaveResult> => {
    const result = await runSave(
      { failure: ({ m }) => m.projectionThemes.editor.imageFailed, notFound: NOT_FOUND },
      () => setProjectionThemeBackground(text(formData, "id"), file(formData, "image")),
    );
    if (result.status === "success") refresh();
    return result;
  },
);

/**
 * Starts the upload of a background video of the type `type` (see
 * `PROJECTION_VIDEO_TYPES`): the browser puts the file to `uploadUrl`, then
 * calls `setVideoAction` with `path`.
 */
export const startVideoUploadAction = withPolicy(
  "music.projection.themes.manage",
  musicProjectionChild("themes"),
  async (
    _scope: PolicyScope,
    id: string,
    type: string,
  ): Promise<
    { status: "success"; path: string; uploadUrl: string } | { status: "error"; message: string }
  > => {
    try {
      const upload = await startProjectionVideoUpload(
        typeof id === "string" ? id : "",
        typeof type === "string" ? type : "",
      );
      if (upload) return { status: "success", ...upload };
      return { status: "error", message: NOT_FOUND(await getRequestI18n()) };
    } catch (error) {
      const state = await errorState(error, ({ m }) => m.projectionThemes.editor.videoFailed);
      return {
        status: "error",
        message: Object.values(state.fieldErrors).flat()[0] ?? state.message ?? "",
      };
    }
  },
);

/** The `id`, `path` and `poster` fields: the uploaded video and a still frame of it. */
export const setVideoAction = withPolicy(
  "music.projection.themes.manage",
  musicProjectionChild("themes"),
  async (_scope: PolicyScope, formData: FormData): Promise<SaveResult> => {
    const result = await runSave(
      { failure: ({ m }) => m.projectionThemes.editor.videoFailed, notFound: NOT_FOUND },
      () =>
        setProjectionThemeVideo(
          text(formData, "id"),
          text(formData, "path"),
          file(formData, "poster"),
        ),
    );
    if (result.status === "success") refresh();
    return result;
  },
);

export const removeBackgroundAction = withPolicy(
  "music.projection.themes.manage",
  musicProjectionChild("themes"),
  async (_scope: PolicyScope, id: string): Promise<SaveResult> => {
    const result = await runSave(
      { failure: ({ m }) => m.projectionThemes.editor.imageFailed, notFound: NOT_FOUND },
      () => removeProjectionThemeBackground(id),
    );
    if (result.status === "success") refresh();
    return result;
  },
);
