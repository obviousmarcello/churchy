import type { SaveResult } from "@/server/music/form-state";
import type { PolicyResult } from "@/server/policy";
import * as server from "./image-actions";

export type { AddEventImageResult, CreateImageSetResult } from "./image-actions";

function unwrap<Args extends unknown[], Value>(
  action: (...args: Args) => Promise<PolicyResult<Value>>,
  denied: Value,
) {
  return async (...args: Args): Promise<Value> => {
    const outcome = await action(...args);
    return outcome.ok ? outcome.value : denied;
  };
}

const DENIED_SAVE: SaveResult = { status: "error", message: "" };
const DENIED = { status: "error" as const, message: "" };

export const createImageSetAction = unwrap(server.createImageSetAction, DENIED);
export const addEventImageAction = unwrap(server.addEventImageAction, DENIED);
export const updateEventImageAction = unwrap(server.updateEventImageAction, DENIED_SAVE);
export const moveEventImagesAction = unwrap(server.moveEventImagesAction, DENIED_SAVE);
export const removeEventImageAction = unwrap(server.removeEventImageAction, DENIED_SAVE);
