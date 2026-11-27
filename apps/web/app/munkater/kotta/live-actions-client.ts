import * as server from "./live-actions";

export type { LiveSessionChangeResult, LiveSessionResult } from "./live-actions";

// The server actions are wrapped by `withPolicy`; the sheet wants the result. A denied action reads
// as a failed one, without a message of its own.
const DENIED = { status: "error" as const, message: "" };

export const startEventLiveSessionAction = async (eventId: string) => {
  const outcome = await server.startEventLiveSessionAction(eventId);
  return outcome.ok ? outcome.value : DENIED;
};
export const startRehearsalLiveSessionAction = async (
  arrangementIds: string[],
  musicalKeys: (string | null)[],
) => {
  const outcome = await server.startRehearsalLiveSessionAction(arrangementIds, musicalKeys);
  return outcome.ok ? outcome.value : DENIED;
};
export const handOverLiveSessionAction = async (sessionId: string, userId: string) => {
  const outcome = await server.handOverLiveSessionAction(sessionId, userId);
  return outcome.ok ? outcome.value : DENIED;
};
export const takeLiveSessionLeadAction = async (sessionId: string) => {
  const outcome = await server.takeLiveSessionLeadAction(sessionId);
  return outcome.ok ? outcome.value : DENIED;
};
export const endLiveSessionAction = async (sessionId: string) => {
  const outcome = await server.endLiveSessionAction(sessionId);
  return outcome.ok ? outcome.value : DENIED;
};
