"use server";

import type { Text } from "@/i18n/music/i18n";
import { getRequestI18n } from "@/i18n/music/server";
import { SafeError } from "@/server/music/errors";
import { errorState } from "@/server/music/form-state";
import {
  endLiveSession,
  handOverLiveSession,
  startEventLiveSession,
  startRehearsalLiveSession,
  takeLiveSessionLead,
  type LiveSessionDTO,
} from "@/server/music/models/live-sessions";
import { musicSheet } from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";

// The models check the access and validate the input. These actions only turn their results and
// errors into a state with a message in the user's language, behind `withPolicy` (the sheet
// unwraps them: `live-actions-client.ts`). Call them directly, not with `useActionState`: the
// sheet changes its live session after each result.

export type LiveSessionResult =
  { status: "success"; session: LiveSessionDTO } | { status: "error"; message: string };

export type LiveSessionChangeResult = { status: "success" } | { status: "error"; message: string };

const ENDED: Text = ({ m }) => m.server.liveSessions.ended;

/** The live sessions need the chord sheet and its child module on. */
async function liveOn(scope: PolicyScope, ...args: unknown[]) {
  const tenant = await musicSheet()(scope, ...args);
  return tenant !== null && (await isWorkspaceModuleOn("ws.music.sheet.live")) ? tenant : null;
}

/** Starts the live session of an event, or joins it when it runs already. */
export const startEventLiveSessionAction = withPolicy(
  "music.live.lead",
  liveOn,
  async (_scope: PolicyScope, eventId: string): Promise<LiveSessionResult> => {
    try {
      const session = await startEventLiveSession(eventId);
      if (session) return { status: "success", session };
      return error(({ m }) => m.sheet.notFound.eventTitle);
    } catch (cause) {
      return errorResult(cause, ({ m }) => m.server.liveSessions.startFailed);
    }
  },
);

/** Starts a live session for the songs of a rehearsal, in playing order, with the key of each song (null: the key of the chart). */
export const startRehearsalLiveSessionAction = withPolicy(
  "music.live.lead",
  liveOn,
  async (
    _scope: PolicyScope,
    arrangementIds: string[],
    musicalKeys: (string | null)[],
  ): Promise<LiveSessionResult> => {
    try {
      return {
        status: "success",
        session: await startRehearsalLiveSession({ arrangementIds, musicalKeys }),
      };
    } catch (cause) {
      return errorResult(cause, ({ m }) => m.server.liveSessions.startFailed);
    }
  },
);

export const handOverLiveSessionAction = withPolicy(
  "music.live.lead",
  liveOn,
  async (
    _scope: PolicyScope,
    sessionId: string,
    userId: string,
  ): Promise<LiveSessionChangeResult> => change(() => handOverLiveSession(sessionId, userId)),
);

export const takeLiveSessionLeadAction = withPolicy(
  "music.live.join",
  liveOn,
  async (_scope: PolicyScope, sessionId: string): Promise<LiveSessionChangeResult> =>
    change(() => takeLiveSessionLead(sessionId)),
);

export const endLiveSessionAction = withPolicy(
  "music.live.join",
  liveOn,
  async (_scope: PolicyScope, sessionId: string): Promise<LiveSessionChangeResult> =>
    change(() => endLiveSession(sessionId)),
);

async function change(run: () => Promise<boolean>): Promise<LiveSessionChangeResult> {
  try {
    return (await run()) ? { status: "success" } : error(ENDED);
  } catch (cause) {
    return errorResult(cause, ({ m }) => m.server.liveSessions.changeFailed);
  }
}

async function error(text: Text): Promise<{ status: "error"; message: string }> {
  return { status: "error", message: text(await getRequestI18n()) };
}

/** Safe messages show as they are; other errors are logged and show `failure`. */
async function errorResult(
  cause: unknown,
  failure: Text,
): Promise<{ status: "error"; message: string }> {
  if (!(cause instanceof SafeError)) console.error("[live] failed:", cause);
  const state = await errorState(cause, failure);
  const message =
    state.message ?? Object.values(state.fieldErrors).flat()[0] ?? failure(await getRequestI18n());
  return { status: "error", message };
}
