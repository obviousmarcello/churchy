"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { useModule } from "@/components/music/app-config";
import { Button } from "@/components/music/ui/button";
import { NativeSelect } from "@/components/music/ui/native-select";
import { useI18n } from "@/i18n/music/client";
import { useBrowserValue } from "@/lib/music/browser";
import type { MetronomeEngine } from "@/lib/music/metronome/engine";
import { MidiClock, type MidiClockOptions, type MidiSend } from "@/lib/music/metronome/midi-clock";
import { Choice } from "./choice";
import { updateSheetSettings, useSheetSettings } from "./sheet-settings";

// The metronome sends its clock to a MIDI device through USB, with the Web
// MIDI API (see `src/lib/metronome/midi-clock.ts`). Chrome and Edge have it,
// also on Android; Safari does not. The browser asks the user once for the
// permission.

export type MidiOut = ReturnType<typeof useMidiOut>;

export function canSendMidi() {
  return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
}

/** Null when the browser has no Web MIDI, or the user blocks it. */
async function requestAccess(sysex: boolean) {
  if (!canSendMidi()) return null;
  try {
    return await navigator.requestMIDIAccess({ sysex });
  } catch {
    return null;
  }
}

const NO_OUTPUTS: MIDIOutput[] = [];
const outputLists = new WeakMap<MIDIAccess, { key: string; outputs: MIDIOutput[] }>();

/** The connected outputs. The same array while they stay the same, for `useSyncExternalStore`. */
function connectedOutputs(access: MIDIAccess | null) {
  if (!access) return NO_OUTPUTS;
  const outputs = [...access.outputs.values()].filter((output) => output.state === "connected");
  const key = outputs.map((output) => output.id).join("\n");
  const cached = outputLists.get(access);
  if (cached?.key === key) return cached.outputs;
  outputLists.set(access, { key, outputs });
  return outputs;
}

export type MidiPort = ReturnType<typeof useMidiPort>;

/**
 * The MIDI output `chosen` (from the settings), while it is connected, and the
 * list of the outputs. `sysex`: the permission also for SysEx messages, which
 * the browser asks for separately.
 */
export function useMidiPort(chosen: { id: string; name: string } | null, sysex = false) {
  const supported = useBrowserValue(canSendMidi, false);
  const [granted, setGranted] = useState<MIDIAccess | null>(null);
  // The request that the user blocked. A block without SysEx blocks SysEx too.
  const [deniedRequest, setDeniedRequest] = useState<{ sysex: boolean } | null>(null);
  // An access without SysEx does not count when the setup changes to SysEx: `send` would throw.
  const access = granted && (!sysex || granted.sysexEnabled) ? granted : null;
  const denied = deniedRequest !== null && (sysex || !deniedRequest.sysex);

  const connect = useCallback(async () => {
    const next = await requestAccess(sysex);
    setDeniedRequest(next === null ? { sysex } : null);
    if (next) setGranted(next);
    return connectedOutputs(next);
  }, [sysex]);

  // A device from an earlier visit: connect again. The browser asks only when it has no permission.
  const wanted = chosen !== null;
  useEffect(() => {
    if (!wanted || access || denied) return;
    let current = true;
    void requestAccess(sysex).then((next) => {
      if (!current) return;
      setDeniedRequest(next === null ? { sysex } : null);
      if (next) setGranted(next);
    });
    return () => {
      current = false;
    };
  }, [wanted, access, denied, sysex]);

  const subscribe = useCallback(
    (listener: () => void) => {
      access?.addEventListener("statechange", listener);
      return () => access?.removeEventListener("statechange", listener);
    },
    [access],
  );
  const outputs = useSyncExternalStore(
    subscribe,
    () => connectedOutputs(access),
    () => NO_OUTPUTS,
  );
  // The id of a device can change, e.g. on another USB port: then the name finds it.
  const output = chosen
    ? (outputs.find((port) => port.id === chosen.id) ??
      outputs.find((port) => port.name === chosen.name) ??
      null)
    : null;

  return {
    supported,
    /** The user blocked MIDI for the site. */
    denied,
    /** The browser gave the permission. */
    connected: access !== null,
    outputs,
    /** The chosen device, while it is connected. */
    output,
    /** Asks the browser for MIDI. Call it from a click. Returns the outputs. */
    connect,
  };
}

/**
 * Sends the clicks of `engine` to the MIDI output of the sheet settings.
 * `quarterNotesPerBeat` is the length of the metronome's beat (see `Meter`).
 */
export function useMidiOut(engine: MetronomeEngine, quarterNotesPerBeat: number) {
  const { midiOutput, midiClickNotes, metronomeLatencyMs } = useSheetSettings();
  // The module "sheet.midi-out" is off: no device, the choice of the user stays.
  const port = useMidiPort(useModule("sheet.midi-out") ? midiOutput : null);
  const { output } = port;

  // The latest settings, for the clock of the next output.
  const latest = useRef({
    options: { quarterNotesPerBeat, clickNotes: midiClickNotes },
    latencyMs: 0,
  });
  const clock = useRef<MidiClock | null>(null);
  useEffect(() => {
    const options: MidiClockOptions = { quarterNotesPerBeat, clickNotes: midiClickNotes };
    latest.current = { options, latencyMs: metronomeLatencyMs };
    clock.current?.setOptions(options);
  }, [quarterNotesPerBeat, midiClickNotes, metronomeLatencyMs]);

  useEffect(() => {
    if (!output) return;
    const send: MidiSend = (data, time) => {
      try {
        output.send(data, time);
      } catch {
        // The device was disconnected: `statechange` removes it.
      }
    };
    const current = new MidiClock(send, latest.current.options);
    clock.current = current;
    // The clicks come out of the speakers after the latency that the browser
    // does not report. In a live session, this is the time of the shared beat.
    const stopTicks = engine.onTick((tick) =>
      current.tick({ ...tick, time: tick.time + latest.current.latencyMs }),
    );
    const stopState = engine.subscribe(() => {
      if (!engine.getState().running) current.stop(performance.now());
    });
    return () => {
      stopTicks();
      stopState();
      current.stop(performance.now());
      if (clock.current === current) clock.current = null;
    };
  }, [engine, output]);

  return port;
}

/** The MIDI part of the metronome settings: the device and the click notes. */
export function MidiOutField({ midi }: { midi: MidiOut }) {
  const { midiOutput, midiClickNotes } = useSheetSettings();
  const { m } = useI18n();
  const messages = m.sheet.metronome.midi;

  return (
    <div className="flex flex-col gap-1.5">
      <MidiPortSelect
        midi={midi}
        label={messages.title}
        hint={messages.hint}
        chosen={midiOutput}
        onChoose={(midiOutput) => updateSheetSettings({ midiOutput })}
      />
      {midi.connected && midiOutput && (
        <Choice
          label={messages.clickNotes}
          value={midiClickNotes}
          options={[
            { value: true, label: m.sheet.settings.on },
            { value: false, label: m.sheet.settings.off },
          ]}
          onChange={(midiClickNotes) => updateSheetSettings({ midiClickNotes })}
        />
      )}
      {midi.connected && midiOutput && midiClickNotes && (
        <p className="text-xs text-muted">{messages.clickNotesHint}</p>
      )}
    </div>
  );
}

/**
 * The connect button, then the list of the outputs with the chosen one: for
 * the MIDI clock and for the mixing desk (`app/[lang]/(songs-and-projection)/mixer/mixer-sync.tsx`).
 * The first click chooses the first device, so one click is enough for most users.
 */
export function MidiPortSelect({
  midi,
  label,
  hint,
  chosen,
  onChoose,
}: {
  midi: MidiPort;
  label: string;
  hint?: string;
  chosen: { id: string; name: string } | null;
  onChoose: (port: { id: string; name: string } | null) => void;
}) {
  const { m, format } = useI18n();
  const id = useId();
  const [connecting, setConnecting] = useState(false);
  const { outputs, output } = midi;
  const messages = m.sheet.metronome.midi;

  function choose(port: MIDIOutput | undefined) {
    onChoose(port ? { id: port.id, name: port.name ?? port.id } : null);
  }

  async function connect() {
    setConnecting(true);
    const connected = await midi.connect();
    setConnecting(false);
    if (connected[0] && !chosen) choose(connected[0]);
  }

  const note = !midi.connected
    ? midi.denied
      ? messages.denied
      : hint
    : outputs.length === 0
      ? messages.noDevices
      : hint;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      {!midi.supported ? (
        <p className="text-xs text-muted">{messages.unsupported}</p>
      ) : !midi.connected ? (
        <Button id={id} variant="outline" size="sm" disabled={connecting} onClick={connect}>
          {connecting ? messages.connecting : messages.connect}
        </Button>
      ) : (
        <NativeSelect
          id={id}
          value={output?.id ?? chosen?.id ?? ""}
          onChange={(event) => choose(outputs.find((port) => port.id === event.target.value))}
        >
          <option value="">{messages.off}</option>
          {outputs.map((port) => (
            <option key={port.id} value={port.id}>
              {port.name ?? port.id}
            </option>
          ))}
          {chosen && !output && (
            <option value={chosen.id}>
              {format(messages.notConnected, { name: chosen.name })}
            </option>
          )}
        </NativeSelect>
      )}
      {midi.supported && note && (
        <p
          role={!midi.connected && midi.denied ? "alert" : undefined}
          className="text-xs text-muted"
        >
          {note}
        </p>
      )}
    </div>
  );
}
