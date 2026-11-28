import type { FormState, SaveResult } from "@/server/music/form-state";
import type { ThemeUsesDTO } from "@/server/music/models/projection-themes";
import type { PolicyResult } from "@/server/policy";
import * as server from "./actions";

export type { CreateThemeResult, ThemeFormState } from "./actions";

// The server actions are wrapped by `withPolicy` and answer `{ ok, value }` (or a denial); the
// editor wants the value. A denied action reads as a failed save with no message of its own.

async function run<T, D>(call: Promise<PolicyResult<T>>, denied: D): Promise<T | D> {
  const outcome = await call;
  return outcome.ok ? outcome.value : denied;
}

const DENIED_RESULT = { status: "error" as const, message: "" };
const DENIED_FORM: FormState = { status: "error", message: "", fieldErrors: {} };
const DENIED_SAVE: SaveResult = DENIED_RESULT;

export const createThemeAction = (fields: unknown) =>
  run(server.createThemeAction(fields), DENIED_RESULT);
export const saveThemeAction = (previous: FormState, formData: FormData) =>
  run(server.saveThemeAction(previous, formData), DENIED_FORM);
export const duplicateThemeAction = (id: string) =>
  run(server.duplicateThemeAction(id), DENIED_RESULT);
export const deleteThemeAction = (previous: FormState, formData: FormData) =>
  run(server.deleteThemeAction(previous, formData), DENIED_FORM);
export const themeUsesAction = (id: string): Promise<ThemeUsesDTO | null> =>
  run(server.themeUsesAction(id), null);
export const setDefaultThemeAction = (id: string) =>
  run(server.setDefaultThemeAction(id), DENIED_SAVE);
export const setBackgroundAction = (formData: FormData) =>
  run(server.setBackgroundAction(formData), DENIED_SAVE);
export const startVideoUploadAction = (id: string, type: string) =>
  run(server.startVideoUploadAction(id, type), DENIED_RESULT);
export const setVideoAction = (formData: FormData) =>
  run(server.setVideoAction(formData), DENIED_SAVE);
export const removeBackgroundAction = (id: string) =>
  run(server.removeBackgroundAction(id), DENIED_SAVE);
