import type { SaveSetlistState } from "./actions";
import * as server from "./actions";

export type { SaveSetlistState } from "./actions";

// The server action is wrapped by `withPolicy` and answers `{ ok, value }`; the builder wants the state.
export async function saveSetlistAction(formData: FormData): Promise<SaveSetlistState> {
  const outcome = await server.saveSetlistAction(formData);
  return outcome.ok
    ? outcome.value
    : { status: "error", message: "", fieldErrors: {}, eventId: null };
}
