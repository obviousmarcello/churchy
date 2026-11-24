// The click sound of the metronome: a short sine tone with a fast attack and an
// exponential decay. It is a formula of the time since the start of the click,
// so the click can start between two samples: the sound is as accurate as the
// time of the beat, not only to the nearest sample.

export type ClickKind = "accent" | "beat" | "subdivision";

export const CLICK_SOUNDS: Record<ClickKind, { frequency: number; gain: number }> = {
  accent: { frequency: 1500, gain: 0.9 },
  beat: { frequency: 1000, gain: 0.6 },
  subdivision: { frequency: 800, gain: 0.35 },
};

/** The time from silence to full volume, in seconds. */
export const CLICK_ATTACK_S = 0.001;
/** The time constant of the decay, in seconds. */
export const CLICK_DECAY_S = 0.006;
/** After this time (10 time constants, below -80 dB) the click is silent. */
export const CLICK_LENGTH_S = 10 * CLICK_DECAY_S;

/** The value of a click `t` seconds after its start. Zero outside the click. */
export function clickSample(kind: ClickKind, t: number): number {
  if (t <= 0 || t >= CLICK_LENGTH_S) return 0;
  const { frequency, gain } = CLICK_SOUNDS[kind];
  // A raised-sine attack has no corner, so it does not crackle.
  const attack = t < CLICK_ATTACK_S ? Math.sin((Math.PI / 2) * (t / CLICK_ATTACK_S)) ** 2 : 1;
  return gain * attack * Math.exp(-t / CLICK_DECAY_S) * Math.sin(2 * Math.PI * frequency * t);
}
