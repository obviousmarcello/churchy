"use server";

import { refresh } from "next/cache";

import { can } from "@churchy/policy";

import { runSave, type SaveResult } from "@/server/music/form-state";
import {
  readMixerSettings,
  saveMixerSettings,
  type MixerSettingsDTO,
} from "@/server/music/models/mixer-settings";
import { musicMixer } from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";

// The model validates the input; the policy checks who may read and who may change the setup.

export const saveMixerSettingsAction = withPolicy(
  "music.mixer.setup",
  musicMixer,
  async (scope: PolicyScope, input: unknown): Promise<SaveResult> => {
    const actor = scope.actor;
    const result = await runSave(
      { failure: ({ m }) => m.mixer.saveFailed, notFound: ({ m }) => m.mixer.saveFailed },
      () => saveMixerSettings(input, actor.kind === "tenant" ? (actor.userId ?? "") : ""),
    );
    if (result.status === "success") refresh();
    return result;
  },
);

/** For a device that sends the tempo: the chord sheet or the projection controller. Null when the read fails. */
export const mixerSettingsAction = withPolicy(
  "music.mixer.use",
  musicMixer,
  async (scope: PolicyScope): Promise<MixerSettingsDTO | null> => {
    try {
      return {
        settings: await readMixerSettings(),
        canEdit: can(scope.actor, "music.mixer.setup", { tenantId: scope.context.tenantId ?? "" }),
      };
    } catch (error) {
      console.error("[mixer] Failed to read the mixer settings:", error);
      return null;
    }
  },
);
