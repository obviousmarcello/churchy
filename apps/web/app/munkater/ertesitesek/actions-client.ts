import type { FormState } from "@/server/music/form-state";
import * as server from "./actions";

// The server action is wrapped by `withPolicy`; the form wants the `FormState`.
export async function updatePreferencesAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const outcome = await server.updatePreferencesAction(formData);
  return outcome.ok ? outcome.value : { status: "error", message: null, fieldErrors: {} };
}
