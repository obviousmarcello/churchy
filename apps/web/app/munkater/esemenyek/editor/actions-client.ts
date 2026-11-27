import type { FormState, SaveResult } from "@/server/music/form-state";
import type { PolicyResult } from "@/server/policy";
import * as server from "./actions";

export type { CreateBlockResult, EventFormState, ItemsSaveResult } from "./actions";

// The server actions are wrapped by `withPolicy` and answer `{ ok, value }` (or a denial); the
// copied forms want the value. A denied action reads as a failed one, without a message of its own.

function unwrap<Args extends unknown[], Value>(
  action: (...args: Args) => Promise<PolicyResult<Value>>,
  denied: Value,
) {
  return async (...args: Args): Promise<Value> => {
    const outcome = await action(...args);
    return outcome.ok ? outcome.value : denied;
  };
}

const DENIED_FORM: FormState = { status: "error", message: "", fieldErrors: {} };
const DENIED_SAVE: SaveResult = { status: "error", message: "" };
const DENIED_ERROR = { status: "error" as const, message: "" };

export const createEventAction = unwrap(server.createEventAction, DENIED_FORM);
export const copyEventAction = unwrap(server.copyEventAction, DENIED_FORM);
export const updateEventAction = unwrap(server.updateEventAction, DENIED_FORM);
export const deleteEventAction = unwrap(server.deleteEventAction, DENIED_FORM);
export const saveItemsAction = unwrap(server.saveItemsAction, DENIED_ERROR);
export const createEventBlockAction = unwrap(server.createEventBlockAction, DENIED_ERROR);
export const updateEventBlockAction = unwrap(server.updateEventBlockAction, DENIED_FORM);
export const deleteEventBlockAction = unwrap(server.deleteEventBlockAction, DENIED_SAVE);
export const addVolunteerAction = unwrap(server.addVolunteerAction, DENIED_FORM);
export const listEventsForVolunteerAction = unwrap(server.listEventsForVolunteerAction, null);
export const addVolunteerToEventAction = unwrap(server.addVolunteerToEventAction, DENIED_FORM);
export const removeVolunteerAction = unwrap(server.removeVolunteerAction, DENIED_FORM);
export const saveEventTeamsAction = unwrap(server.saveEventTeamsAction, DENIED_FORM);
export const setReplyAction = unwrap(server.setReplyAction, DENIED_FORM);
