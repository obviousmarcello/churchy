import type { SaveResult } from "@/server/music/form-state";
import * as server from "./image-actions";

// The server action is wrapped by `withPolicy`; the dialog wants the `SaveResult`.
export async function updateEventImageAction(imageId: string, input: unknown): Promise<SaveResult> {
  const outcome = await server.updateEventImageAction(imageId, input);
  return outcome.ok ? outcome.value : { status: "error", message: "" };
}
