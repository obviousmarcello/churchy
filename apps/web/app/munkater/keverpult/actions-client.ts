import type { SaveResult } from "@/server/music/form-state";
import type { MixerSettingsDTO } from "@/server/music/models/mixer-settings";
import * as server from "./actions";

// The server actions are wrapped by `withPolicy` and answer `{ ok, value }`; the callers want the value.
export async function saveMixerSettingsAction(input: unknown): Promise<SaveResult> {
  const outcome = await server.saveMixerSettingsAction(input);
  return outcome.ok ? outcome.value : { status: "error", message: "" };
}

export async function mixerSettingsAction(): Promise<MixerSettingsDTO | null> {
  const outcome = await server.mixerSettingsAction();
  return outcome.ok ? outcome.value : null;
}
