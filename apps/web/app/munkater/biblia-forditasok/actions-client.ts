import type { SaveResult } from "@/server/music/form-state";
import type { PolicyResult } from "@/server/policy";
import * as server from "./actions";

// The server actions are wrapped by `withPolicy` and answer `{ ok, value }`; the page wants a result.
async function run(call: Promise<PolicyResult<SaveResult>>): Promise<SaveResult> {
  const outcome = await call;
  return outcome.ok ? outcome.value : { status: "error", message: "" };
}

export const saveTranslationAction = (fields: unknown) => run(server.saveTranslationAction(fields));
export const deleteTranslationAction = (id: string) => run(server.deleteTranslationAction(id));
export const setKaroliAction = (enabled: boolean) => run(server.setKaroliAction(enabled));
export const putBookAction = (translation: string, book: string, json: string) =>
  run(server.putBookAction(translation, book, json));
export const deleteBookAction = (translation: string, book: string) =>
  run(server.deleteBookAction(translation, book));
