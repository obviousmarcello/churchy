import type { SaveResult } from "@/server/music/form-state";
import type { PolicyResult } from "@/server/policy";
import * as server from "./announcement-actions";

export type { AnnouncementSourcesResult, CreateAnnouncementResult } from "./announcement-actions";

// The server actions are wrapped by `withPolicy` and answer `{ ok, value }` (or a denial); the
// copied editor wants the value. A denied action reads as a failed one, without a message.
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

export const createAnnouncementAction = unwrap(server.createAnnouncementAction, DENIED);
export const updateAnnouncementAction = unwrap(server.updateAnnouncementAction, DENIED_SAVE);
export const refreshAnnouncementAction = unwrap(server.refreshAnnouncementAction, DENIED_SAVE);
export const saveEntrySettingsAction = unwrap(server.saveEntrySettingsAction, DENIED_SAVE);
export const saveManualEntryAction = unwrap(server.saveManualEntryAction, DENIED_SAVE);
export const removeEntryAction = unwrap(server.removeEntryAction, DENIED_SAVE);
export const setEntryAttachmentAction = unwrap(server.setEntryAttachmentAction, DENIED_SAVE);
export const listAnnouncementSourcesAction = unwrap(server.listAnnouncementSourcesAction, DENIED);
export const copyAnnouncementAction = unwrap(server.copyAnnouncementAction, DENIED_SAVE);
