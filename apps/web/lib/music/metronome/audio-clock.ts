/**
 * The time of the audio clock, in seconds, that comes out of the speakers at
 * the `performance.now()` time `time`. The metronome and the notes of a score
 * use it, so the notes stay on the clicks.
 */
export function contextTimeAt(context: AudioContext, time: number): number {
  const stamp = context.getOutputTimestamp?.();
  if (stamp?.contextTime !== undefined && stamp.performanceTime) {
    return stamp.contextTime + (time - stamp.performanceTime) / 1000;
  }
  const latency = context.baseLatency + (context.outputLatency || 0);
  return context.currentTime - latency + (time - performance.now()) / 1000;
}
