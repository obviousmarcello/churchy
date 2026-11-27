import type { FormState } from "@/server/music/form-state";
import * as server from "./annotation-actions";

// The server actions are wrapped by `withPolicy`; the notes panel wants the form state.
const DENIED: FormState = { status: "error", message: "", fieldErrors: {} };

export const createAnnotationAction = async (input: unknown) => {
  const outcome = await server.createAnnotationAction(input);
  return outcome.ok ? outcome.value : DENIED;
};
export const updateAnnotationAction = async (id: string, patch: unknown) => {
  const outcome = await server.updateAnnotationAction(id, patch);
  return outcome.ok ? outcome.value : DENIED;
};
export const deleteAnnotationAction = async (id: string) => {
  const outcome = await server.deleteAnnotationAction(id);
  return outcome.ok ? outcome.value : DENIED;
};
