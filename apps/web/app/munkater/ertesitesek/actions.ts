"use server";

import { errorState, runUpdate, text, type FormState } from "@/server/music/form-state";
import { updateMyNotificationPreferences } from "@/server/music/models/notification-preferences";
import {
  removePushSubscription,
  savePushSubscription,
  setLivePushPreference,
} from "@/server/music/models/push-subscriptions";
import { musicEvents, musicSheet } from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";

// The notifications: this device (the subscription of the browser), the live session preference and the
// kinds. Every role that may see events has them; the models only touch the user's own rows.

async function liveOn(scope: PolicyScope, ...args: unknown[]) {
  const tenant = await musicSheet()(scope, ...args);
  return tenant !== null && (await isWorkspaceModuleOn("ws.music.sheet.live")) ? tenant : null;
}

export const savePushSubscriptionAction = withPolicy(
  "music.event.view",
  musicEvents,
  async (_scope: PolicyScope, subscription: unknown): Promise<{ ok: boolean }> => {
    try {
      return { ok: await savePushSubscription(subscription) };
    } catch {
      return { ok: false };
    }
  },
);

export const removePushSubscriptionAction = withPolicy(
  "music.event.view",
  musicEvents,
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

/** The kinds of notification and the emails: the form of the page (field errors `reminderDays`, `setlistHours`). */
export const updatePreferencesAction = withPolicy(
  "music.event.view",
  musicEvents,
  async (_scope: PolicyScope, formData: FormData): Promise<FormState> =>
    runUpdate(
      {
        success: ({ m }) => m.notifications.form.saved,
        failure: ({ m }) => m.notifications.form.notSaved,
        // The update always succeeds or throws: each signed-in user can have preferences.
        notFound: () => "",
      },
      async () => {
        // An empty field is no number: the model requires it only for a kind that is on.
        const number = (name: string, on: boolean) => {
          const value = on ? text(formData, name) : "";
          return value === "" ? undefined : Number(value);
        };
        const eventReminder = formData.get("eventReminder") === "on";
        const setlist = formData.get("setlist") === "on";
        await updateMyNotificationPreferences({
          email: formData.get("email") === "on",
          eventAdded: formData.get("eventAdded") === "on",
          eventReminder,
          reminderDays: number("reminderDays", eventReminder),
          setlist,
          setlistHours: number("setlistHours", setlist),
        });
        return true;
      },
    ),
);
