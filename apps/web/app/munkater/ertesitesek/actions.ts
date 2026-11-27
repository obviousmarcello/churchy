"use server";

import { errorState, type FormState } from "@/server/music/form-state";
import {
  removePushSubscription,
  savePushSubscription,
  setLivePushPreference,
} from "@/server/music/models/push-subscriptions";
import { musicSheet } from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";

// The live session push: this device (the subscription of the browser) and the preference. Every
// role that may join a live session has them; the models only touch the user's own rows.

async function liveOn(scope: PolicyScope, ...args: unknown[]) {
  const tenant = await musicSheet()(scope, ...args);
  return tenant !== null && (await isWorkspaceModuleOn("ws.music.sheet.live")) ? tenant : null;
}

export const savePushSubscriptionAction = withPolicy(
  "music.live.join",
  liveOn,
  async (_scope: PolicyScope, subscription: unknown): Promise<{ ok: boolean }> => {
    try {
      return { ok: await savePushSubscription(subscription) };
    } catch {
      return { ok: false };
    }
  },
);

export const removePushSubscriptionAction = withPolicy(
  "music.live.join",
  liveOn,
  async (_scope: PolicyScope, endpoint: string): Promise<{ ok: boolean }> => {
    try {
      await removePushSubscription(endpoint);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  },
);

export const setLivePushPreferenceAction = withPolicy(
  "music.live.join",
  liveOn,
  async (_scope: PolicyScope, enabled: boolean): Promise<FormState> => {
    try {
      await setLivePushPreference(enabled);
      return { status: "success", message: null, fieldErrors: {} };
    } catch (error) {
      return errorState(error, ({ m }) => m.notifications.settings.failed);
    }
  },
);
