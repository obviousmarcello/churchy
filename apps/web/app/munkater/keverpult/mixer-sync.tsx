"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { useModule } from "@/components/music/app-config";
import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import { useBrowserValue } from "@/lib/music/browser";
import type { BeatGrid } from "@/lib/music/live/beat-grid";
import type { ServerClock } from "@/lib/music/live/clock-sync";
import {
  desktopSq,
  desktopX32,
  type DesktopSq,
  type DesktopX32,
  type X32Desk,
} from "@/lib/music/mixer/desktop-bridge";
import {
  isMidiKind,
  isMixerSetUp,
  isNetworkKind,
  isSqKind,
  type MixerKind,
  type MixerSettings,
  type MixerSlot,
} from "@/lib/music/mixer/settings";
import { sqTapMessages, tapIntervalMs } from "@/lib/music/mixer/sq";
import {
  X32_DELAY_EFFECTS,
  delayEffectOfType,
  delayMs,
  delaySysex,
  delayValue,
  type X32DelayEffect,
} from "@/lib/music/mixer/x32";
import type { MixerSettingsDTO } from "@/server/music/models/mixer-settings";
import { Choice } from "../kotta/choice";
import { MidiPortSelect, useMidiPort, type MidiPort } from "../kotta/midi-out";
import { updateSheetSettings, useSheetSettings } from "../kotta/sheet-settings";
import { mixerSettingsAction } from "./actions-client";

// This device sends the tempo to the delay effects of the mixing desk, with
// the setup of the Mixer page: the delay time to an X32 (`src/lib/mixer/x32.ts`),
// taps on the tap tempo soft keys of an SQ (`src/lib/mixer/sq.ts`). The chord
// sheet and the projection controller have the switch: the device at the desk
// turns it on, whichever page it shows.
//
// The app sends once for each change of the tempo: a new song, a new BPM or
// tap tempo, also in the middle of a song. In a live session, the device
// follows the leader, also without the sound of the metronome, and sends when
// the new tempo starts: on the bar line of the shared grid. A tempo that the
// desk got already does not go again, so a change on the desk stays until the
// next change of the tempo.

/** The last command of an effect slot, or the last taps. */
type SlotStatus =
  | { state: "sent"; effect: X32DelayEffect | null }
  | { state: "notDelay" }
  | { state: "noAnswer" }
  | { state: "failed" };

type Setup = { state: "loading" } | { state: "failed" } | ({ state: "loaded" } & MixerSettingsDTO);

type Command = MixerSlot & { ms: number };

/** The taps on the soft keys of an SQ. */
type Taps = { channel: number; keys: number[]; intervalMs: number };

type Plan = { desk: string; kind: MixerKind; host: string; commands: Command[]; taps: Taps | null };

/** The search for the desk on the network, for a setup without an IP address. */
type DeskSearch = "searching" | "failed" | "unsupported" | X32Desk[];

/** Tap tempo and the typing of a BPM give many changes in a short time: the last one goes. */
const SETTLE_MS = 200;

/** The lock of the sends of this device: a sheet tab and a projection controller tab can both send. */
const SEND_LOCK = "mixer-sync-send";

/**
 * One send after the other on this device, also from two tabs: the taps of
 * one tab must not mix with the taps of another (the SQ would measure half
 * the time). Without Web Locks, only the sends of one tab wait for each other (`queue`).
 */
async function withSendLock(send: () => Promise<void>): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.locks) return send();
  await navigator.locks.request(SEND_LOCK, send);
}

export type MixerSync = ReturnType<typeof useMixerSync>;

/**
 * `bpm` counts the beats of the metronome, of `quarterNotesPerBeat` quarter
 * notes each. Null: no tempo (a live session before the leader's grid, an
 * item that is not a song). `grid` and `clock`: in a live session, the shared
 * grid; without `clock`, the new tempo goes at once.
 */
export function useMixerSync({
  bpm,
  quarterNotesPerBeat,
  grid,
  clock,
}: {
  bpm: number | null;
  quarterNotesPerBeat: number;
  grid: BeatGrid | null;
  clock?: ServerClock;
}) {
  const { mixerSync, mixerMidiOutput } = useSheetSettings();
  // The module "mixer" is off: nothing goes to the desk, the choice of the user stays.
  const mixerOn = useModule("mixer");
  const enabled = mixerSync && mixerOn;
  const setup = useMixerSetup(enabled);
  const settings = setup.state === "loaded" ? setup.settings : null;
  const x32 = useBrowserValue(desktopX32, null);
  const sq = useBrowserValue(desktopSq, null);
  const midi = useMidiPort(
    enabled && settings && isMidiKind(settings.kind) ? mixerMidiOutput : null,
    settings?.kind === "x32-midi",
  );
  const { output } = midi;
  const [statuses, setStatuses] = useState<Record<number, SlotStatus>>({});
  const [tapStatus, setTapStatus] = useState<SlotStatus | null>(null);
  // The tempos that each desk got, by desk and slot or keys.
  const [sent] = useState(() => new Map<string, number>());
  // One send after the other: the taps of a new tempo must not mix with the taps of the last one.
  const [queue] = useState(() => ({ last: Promise.resolve() }));
  // "Send now" sends again what the desk got already, and searches the desk again.
  const [resend, setResend] = useState(0);

  // Without an IP address in the setup, this device finds the X32 on its network: only one desk, so the tempo does not go to another desk.
  const search = useDeskSearch(
    enabled && settings?.kind === "x32-osc" && settings.host === "" ? x32 : null,
    resend,
  );
  const host =
    settings?.host || (Array.isArray(search) && search.length === 1 ? search[0]!.host : "");
  const desk =
    !enabled || !settings || !isMixerSetUp(settings)
      ? null
      : deskKey(settings.kind, host, x32, sq, output);
  const commands: Command[] =
    bpm === null || !settings || isSqKind(settings.kind)
      ? []
      : settings.slots.map((slot) => ({
          ...slot,
          ms: delayMs(bpm, quarterNotesPerBeat, slot.subdivision),
        }));
  const taps: Taps | null =
    bpm !== null && settings && isSqKind(settings.kind)
      ? {
          channel: settings.midiChannel,
          keys: settings.tapKeys,
          intervalMs: tapIntervalMs(bpm, quarterNotesPerBeat),
        }
      : null;
  // One string for the effect, so it runs only when a command changes.
  const plan =
    desk && settings
      ? JSON.stringify({ desk, kind: settings.kind, host, commands, taps } satisfies Plan)
      : null;
  // The new tempo of a live session starts on a bar line, a short time in the future.
  const startTime = grid && clock ? grid.startTime : null;

  useEffect(() => {
    if (plan === null) return;
    const { desk, kind, host, commands, taps } = JSON.parse(plan) as Plan;
    if (commands.length === 0 && !taps) return;
    let current = true;
    const wait = Math.max(SETTLE_MS, startTime !== null && clock ? startTime - clock.now() : 0);
    const send = async () => {
      if (!current) return;
      if (taps) {
        const key = `${desk} taps ${taps.channel} ${taps.keys.join(",")}`;
        if (sent.get(key) === taps.intervalMs) return;
        const status =
          kind === "sq-tcp" && sq
            ? await sendTcpTaps(sq, host, taps)
            : await sendMidiTaps(output, taps);
        if (status.state === "sent") sent.set(key, taps.intervalMs);
        if (current) setTapStatus(status);
        return;
      }
      for (const command of commands) {
        const key = `${desk} ${command.slot} ${command.effect}`;
        if (sent.get(key) === command.ms) continue;
        const status =
          kind === "x32-osc" && x32 ? await sendOsc(x32, host, command) : sendMidi(output, command);
        if (!current) return;
        if (status.state === "sent") sent.set(key, command.ms);
        setStatuses((previous) => ({ ...previous, [command.slot]: status }));
      }
    };
    const timer = setTimeout(() => {
      queue.last = queue.last.then(() => withSendLock(send));
    }, wait);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [plan, startTime, clock, x32, sq, output, sent, queue, resend]);

  return {
    enabled,
    setup,
    /** The desktop app can send to the desk of the setup over the network. */
    canUseNetwork: settings?.kind === "sq-tcp" ? sq !== null : x32 !== null,
    /** The search for the desk, for a setup without an IP address. Null without a search. */
    search,
    midi,
    /** X32: the delay time of each slot of the setup. Empty while there is no tempo. */
    commands,
    statuses,
    /** SQ: the taps of the tempo. Null while there is no tempo. */
    taps,
    tapStatus,
    /** A desk to send to: the setup is complete, and this device can reach the desk. */
    ready: desk !== null,
    sendNow: () => {
      sent.clear();
      setResend((count) => count + 1);
      setup.reload();
    },
  };
}

/** The desk that this device sends to, as a key of the tempos that it got. Null when this device cannot reach it. */
function deskKey(
  kind: MixerKind,
  host: string,
  x32: DesktopX32 | null,
  sq: DesktopSq | null,
  output: MIDIOutput | null,
): string | null {
  switch (kind) {
    case "x32-osc":
      return x32 && host ? `osc ${host}` : null;
    case "sq-tcp":
      return sq && host ? `tcp ${host}` : null;
    case "x32-midi":
    case "sq-midi":
      return output ? `midi ${output.id}` : null;
    case "off":
      return null;
  }
}

/** The desks on the network of this computer, while `bridge` is set. `request` searches again. */
function useDeskSearch(bridge: DesktopX32 | null, request: number): DeskSearch | null {
  const [result, setResult] = useState<{ request: number; desks: X32Desk[] | null } | null>(null);

  useEffect(() => {
    if (!bridge?.discover) return;
    let current = true;
    bridge.discover().then(
      (desks) => current && setResult({ request, desks }),
      () => current && setResult({ request, desks: null }),
    );
    return () => {
      current = false;
    };
  }, [bridge, request]);

  if (!bridge) return null;
  // A desktop app older than the search.
  if (!bridge.discover) return "unsupported";
  return result?.request === request ? (result.desks ?? "failed") : "searching";
}

/** The setup of the Mixer page, while `enabled`. It loads again when the page shows again, e.g. after a change on another device. */
function useMixerSetup(enabled: boolean) {
  const [setup, setSetup] = useState<Setup>({ state: "loading" });
  const [request, setRequest] = useState(0);
  const reload = useCallback(() => setRequest((count) => count + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void mixerSettingsAction()
      .catch(() => null)
      .then((dto) => {
        if (current)
          setSetup((previous) =>
            dto
              ? { state: "loaded", ...dto }
              : previous.state === "loaded"
                ? previous
                : { state: "failed" },
          );
      });
    return () => {
      current = false;
    };
  }, [enabled, request]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, reload]);

  return { ...setup, reload };
}

/** Over the network, the app first asks the desk for the effect in the slot, so the time goes to the right parameter. */
async function sendOsc(bridge: DesktopX32, host: string, command: Command): Promise<SlotStatus> {
  try {
    const type = await bridge.fxType({ host, slot: command.slot });
    if (type === null) return { state: "noAnswer" };
    const effect = delayEffectOfType(type);
    if (effect === null) return { state: "notDelay" };
    const { param } = X32_DELAY_EFFECTS[effect];
    await bridge.setFxParam({ host, slot: command.slot, param, value: delayValue(command.ms) });
    return { state: "sent", effect };
  } catch {
    return { state: "failed" };
  }
}

/** Over MIDI, the desk does not answer: the effect comes from the setup. */
function sendMidi(output: MIDIOutput | null, command: Command): SlotStatus {
  if (!output) return { state: "failed" };
  try {
    output.send(delaySysex(command.slot, command.effect, command.ms));
    return { state: "sent", effect: null };
  } catch {
    // The device was disconnected: `statechange` removes it.
    return { state: "failed" };
  }
}

/** Over the network, the desktop app opens the connection for the taps. */
async function sendTcpTaps(sq: DesktopSq, host: string, taps: Taps): Promise<SlotStatus> {
  try {
    return (await sq.tap({ host, ...taps })) === "sent"
      ? { state: "sent", effect: null }
      : { state: "noAnswer" };
  } catch {
    return { state: "failed" };
  }
}

/** Over MIDI, the browser sends each message at its time. The promise ends after the last tap. */
async function sendMidiTaps(output: MIDIOutput | null, taps: Taps): Promise<SlotStatus> {
  if (!output) return { state: "failed" };
  const messages = sqTapMessages(taps.channel, taps.keys, taps.intervalMs);
  const start = performance.now() + 10;
  try {
    for (const { data, at } of messages) output.send(data, start + at);
  } catch {
    // The device was disconnected: `statechange` removes it.
    return { state: "failed" };
  }
  await new Promise((resolve) => setTimeout(resolve, (messages.at(-1)?.at ?? 0) + 50));
  return { state: "sent", effect: null };
}

/**
 * The state of the sync in one word, for a light: "off", "ok" (the desk got
 * the last tempo), "waiting" (for the setup, a tempo or a search) or "error"
 * (the tempo does not reach the desk: the details say why).
 */
export function mixerSyncHealth(sync: MixerSync): "off" | "ok" | "waiting" | "error" {
  if (!sync.enabled) return "off";
  const { setup } = sync;
  if (setup.state === "loading") return "waiting";
  if (setup.state === "failed" || !isMixerSetUp(setup.settings)) return "error";
  if (isNetworkKind(setup.settings.kind) && !sync.canUseNetwork) return "error";
  if (sync.search === "searching") return "waiting";
  if (!sync.ready) return "error";
  const statuses = isSqKind(setup.settings.kind)
    ? [sync.tapStatus]
    : setup.settings.slots.map((slot) => sync.statuses[slot.slot] ?? null);
  if (statuses.some((status) => status !== null && status.state !== "sent")) return "error";
  return statuses.some((status) => status?.state === "sent") ? "ok" : "waiting";
}

/** The switch of this device and the state of the sync: in the metronome settings and in the projection controller. */
export function MixerSyncField({ sync }: { sync: MixerSync }) {
  const { m, format } = useI18n();
  const messages = m.mixer.sync;
  const { setup } = sync;
  const settings: MixerSettings | null = setup.state === "loaded" ? setup.settings : null;
  const canEdit = setup.state === "loaded" && setup.canEdit;

  return (
    <div className="flex flex-col gap-1.5">
      <Choice
        label={messages.send}
        value={sync.enabled}
        options={[
          { value: true, label: messages.on },
          { value: false, label: messages.off },
        ]}
        onChange={(mixerSync) => updateSheetSettings({ mixerSync })}
      />
      <p className="text-xs text-muted">{messages.hint}</p>

      {sync.enabled &&
        (setup.state === "loading" ? (
          <p className="text-xs text-muted">{messages.loading}</p>
        ) : setup.state === "failed" ? (
          <div className="flex flex-col items-start gap-1">
            <p role="alert" className="text-xs text-danger">
              {messages.loadFailed}
            </p>
            <Button variant="outline" size="sm" onClick={setup.reload}>
              {messages.retry}
            </Button>
          </div>
        ) : !settings || !isMixerSetUp(settings) ? (
          <p className="text-xs text-muted">{canEdit ? messages.notSetUpOwn : messages.notSetUp}</p>
        ) : (
          <>
            {isNetworkKind(settings.kind) && !sync.canUseNetwork && (
              <p className="text-xs text-muted">{messages.desktopOnly}</p>
            )}
            {sync.search && <DeskSearchText search={sync.search} canEdit={canEdit} />}
            {isMidiKind(settings.kind) && <MixerMidiOutput midi={sync.midi} />}
            {isSqKind(settings.kind) && (
              <p aria-live="polite" className="text-xs text-muted">
                <span className="font-medium text-foreground tabular-nums">
                  {format(messages.tapLine, {
                    keys: settings.tapKeys.join(", "),
                    ms: sync.taps ? sync.taps.intervalMs : "–",
                  })}
                </span>{" "}
                {!sync.taps
                  ? messages.waiting
                  : sync.tapStatus && <SlotStatusText status={sync.tapStatus} />}
              </p>
            )}
            {!isSqKind(settings.kind) && (
              <ul className="flex flex-col gap-1">
                {settings.slots.map((slot, index) => {
                  const command = sync.commands[index];
                  const status = sync.statuses[slot.slot];
                  return (
                    <li key={slot.slot} aria-live="polite" className="text-xs text-muted">
                      {command ? (
                        <>
                          <span className="font-medium text-foreground tabular-nums">
                            {format(messages.slotLine, {
                              slot: slot.slot,
                              noteValue: m.mixer.subdivisions[slot.subdivision],
                              ms: command.ms,
                            })}
                          </span>
                          {status && (
                            <>
                              {" "}
                              <SlotStatusText status={status} />
                            </>
                          )}
                        </>
                      ) : (
                        format(messages.slotLine, {
                          slot: slot.slot,
                          noteValue: m.mixer.subdivisions[slot.subdivision],
                          ms: "–",
                        }) +
                        " " +
                        messages.waiting
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {((sync.ready && (sync.commands.length > 0 || sync.taps)) ||
              noDeskFound(sync.search)) && (
              <Button variant="outline" size="sm" className="self-start" onClick={sync.sendNow}>
                {messages.sendNow}
              </Button>
            )}
          </>
        ))}

      {sync.enabled && canEdit && (
        <Link href="/mixer" className="text-xs font-medium underline">
          {messages.setUp}
        </Link>
      )}
    </div>
  );
}

/** No desk answered: "Send now" searches again (`messages.noDeskFound` names it). */
function noDeskFound(search: DeskSearch | null): boolean {
  return search === "failed" || (Array.isArray(search) && search.length === 0);
}

/** The search for the desk on the network, for a setup without an IP address. */
function DeskSearchText({ search, canEdit }: { search: DeskSearch; canEdit: boolean }) {
  const { m, format } = useI18n();
  const messages = m.mixer.sync;
  if (search === "searching") return <p className="text-xs text-muted">{messages.searching}</p>;
  if (Array.isArray(search) && search.length === 1) {
    const [desk] = search;
    return (
      <p className="text-xs text-muted">
        {format(messages.found, { name: deskName(desk!), host: desk!.host })}
      </p>
    );
  }
  // A user who can set up the mixer gets the link to the setup below (`messages.setUp`), the other users the name of the page.
  const message =
    search === "unsupported"
      ? canEdit
        ? messages.searchUnsupportedOwn
        : messages.searchUnsupported
      : noDeskFound(search)
        ? messages.noDeskFound
        : canEdit
          ? messages.severalDesksOwn
          : messages.severalDesks;
  return (
    <p role="alert" className="text-xs text-danger">
      {message}
    </p>
  );
}

/** The name of a desk as the desk reports it, e.g. "X32 FOH", or its model alone. */
export function deskName(desk: X32Desk): string {
  return [desk.model, desk.name].filter(Boolean).join(" ") || desk.host;
}

function SlotStatusText({ status }: { status: SlotStatus }) {
  const { m, format } = useI18n();
  const messages = m.mixer.sync;
  switch (status.state) {
    case "sent":
      return status.effect
        ? format(messages.sentTo, { effect: X32_DELAY_EFFECTS[status.effect].name })
        : messages.sent;
    case "notDelay":
      return <span className="text-danger">{messages.notDelay}</span>;
    case "noAnswer":
      return <span className="text-danger">{messages.noAnswer}</span>;
    case "failed":
      return <span className="text-danger">{messages.failed}</span>;
  }
}

/** The MIDI output of this device to the desk. It can be the output of the MIDI clock too. */
function MixerMidiOutput({ midi }: { midi: MidiPort }) {
  const { m } = useI18n();
  const { mixerMidiOutput } = useSheetSettings();
  return (
    <MidiPortSelect
      midi={midi}
      label={m.mixer.sync.midiOutput}
      chosen={mixerMidiOutput}
      onChoose={(mixerMidiOutput) => updateSheetSettings({ mixerMidiOutput })}
    />
  );
}
