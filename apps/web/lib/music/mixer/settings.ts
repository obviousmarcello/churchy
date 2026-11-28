import { z } from "zod";

import { isPrivateIpv4 } from "./desktop-bridge";
import { SQ_SOFT_KEYS } from "./sq";
import { SUBDIVISION_KEYS, X32_DELAY_EFFECT_KEYS, X32_FX_SLOTS } from "./x32";

// The mixer setup of the church: one for all (the table `mixer_settings`).
// Event admins, music leaders and superadmins set it on the Mixer page. A
// device that sends the tempo reads it; whether a device sends, and its MIDI
// output, belong to the device (see `sheet-settings.ts`).
//
// The desks: a Behringer X32 or Midas M32 gets the delay time of its effects
// (`x32.ts`), an Allen & Heath SQ gets taps on its tap tempo soft keys (`sq.ts`).

export const MIXER_KINDS = ["off", "x32-osc", "x32-midi", "sq-tcp", "sq-midi"] as const;
export type MixerKind = (typeof MIXER_KINDS)[number];

/** The desk sends over the network, from the desktop app. */
export function isNetworkKind(kind: MixerKind): boolean {
  return kind === "x32-osc" || kind === "sq-tcp";
}

/** The desk gets MIDI from this device: a USB cable, or a MIDI interface. */
export function isMidiKind(kind: MixerKind): boolean {
  return kind === "x32-midi" || kind === "sq-midi";
}

export function isSqKind(kind: MixerKind): boolean {
  return kind === "sq-tcp" || kind === "sq-midi";
}

const mixerSlotSchema = z.object({
  slot: z.number().int().min(1).max(X32_FX_SLOTS),
  /** Over MIDI, the desk does not tell the effect, so the setup names it. Over the network, the app asks the desk. */
  effect: z.enum(X32_DELAY_EFFECT_KEYS),
  subdivision: z.enum(SUBDIVISION_KEYS),
});

export type MixerSlot = z.output<typeof mixerSlotSchema>;

const unique = (values: number[]) => new Set(values).size === values.length;

export const mixerSettingsSchema = z
  .object({
    kind: z.enum(MIXER_KINDS),
    /**
     * The IPv4 address of the desk on the local network, for "x32-osc" and
     * "sq-tcp". Empty for an X32: each device finds the desk on its network.
     */
    host: z.union([z.literal(""), z.string().refine(isPrivateIpv4)]),
    /** X32: each effect slot once. */
    slots: z
      .array(mixerSlotSchema)
      .max(X32_FX_SLOTS)
      .refine((slots) => unique(slots.map(({ slot }) => slot))),
    /** SQ: the MIDI channel of the desk (Utility > General > MIDI). */
    midiChannel: z.number().int().min(1).max(16),
    /** SQ: the soft keys with the tap tempo of a delay effect. */
    tapKeys: z.array(z.number().int().min(1).max(SQ_SOFT_KEYS)).max(SQ_SOFT_KEYS).refine(unique),
  })
  // The SQ has no search: it needs its address.
  .refine((settings) => settings.kind !== "sq-tcp" || settings.host !== "", { path: ["host"] });

export type MixerSettings = z.output<typeof mixerSettingsSchema>;

export const DEFAULT_MIXER_SETTINGS: MixerSettings = {
  kind: "off",
  host: "",
  slots: [],
  midiChannel: 1,
  tapKeys: [],
};

/** The setup can send something: a desk and at least one effect. */
export function isMixerSetUp(settings: MixerSettings): boolean {
  if (settings.kind === "off") return false;
  return isSqKind(settings.kind) ? settings.tapKeys.length > 0 : settings.slots.length > 0;
}
