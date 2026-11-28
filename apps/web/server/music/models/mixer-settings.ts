import "server-only";

import {
  DEFAULT_MIXER_SETTINGS,
  mixerSettingsSchema,
  type MixerSettings,
} from "@/lib/music/mixer/settings";
import { getMusicSupabase, musicUserId } from "@/server/music/db";
import { databaseError, parseInput } from "./shared";

// The mixer setup of the church (the table `mixer_settings`, one row per church). Callers check
// `music.mixer.use` (read: a device of any user can send the tempo to the desk) and
// `music.mixer.setup` (change); RLS keeps the tenant.

export type MixerSettingsDTO = { settings: MixerSettings; canEdit: boolean };

export async function readMixerSettings(): Promise<MixerSettings> {
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("mixer_settings")
    .select("kind, host, slots, midi_channel, tap_keys")
    .maybeSingle();
  if (error) throw databaseError("get mixer settings", error);
  if (!data) return DEFAULT_MIXER_SETTINGS;
  const { midi_channel: midiChannel, tap_keys: tapKeys, ...rest } = data;
  // A row that the model of an older or newer version wrote: the defaults, not an error on each page.
  const parsed = mixerSettingsSchema.safeParse({ ...rest, midiChannel, tapKeys });
  return parsed.success ? parsed.data : DEFAULT_MIXER_SETTINGS;
}

export async function saveMixerSettings(input: unknown, actorId: string): Promise<boolean> {
  const { kind, host, slots, midiChannel, tapKeys } = parseInput(mixerSettingsSchema, input);
  const { error } = await (await getMusicSupabase()).from("mixer_settings").upsert(
    {
      kind,
      host,
      slots,
      midi_channel: midiChannel,
      tap_keys: tapKeys,
      updated_by: musicUserId(actorId),
    },
    { onConflict: "tenant_id" },
  );
  if (error) throw databaseError("save mixer settings", error);
  return true;
}
