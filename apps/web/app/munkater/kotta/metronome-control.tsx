"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Popover } from "@base-ui/react/popover";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MetronomeIcon,
  MinusIcon,
  PlayIcon,
  PlusIcon,
  SquareIcon,
} from "lucide-react";

import { ModuleGate } from "@/components/music/app-config";
import { MixerSyncField, useMixerSync } from "../keverpult/mixer-sync";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { NativeSelect } from "@/components/music/ui/native-select";
import { useI18n } from "@/i18n/music/client";
import { rich } from "@/i18n/music/rich";
import { useBrowserValue } from "@/lib/music/browser";
import {
  STOPPED_GRID,
  changeGrid,
  startGrid,
  stopGrid,
  type BeatGrid,
} from "@/lib/music/live/beat-grid";
import type { ServerClock } from "@/lib/music/live/clock-sync";
import {
  METRONOME_MAX_BEATS_PER_BAR,
  METRONOME_MAX_BPM,
  METRONOME_MAX_SUBDIVISION,
  METRONOME_MIN_BPM,
  clampBpm,
} from "@/lib/music/metronome/beat-clock";
import { MetronomeEngine, canPlayMetronome, type HeardTick } from "@/lib/music/metronome/engine";
import {
  CALIBRATION_TAPS,
  MAX_LATENCY_MS,
  estimateLatency,
  tapDelays,
  type LatencyEstimate,
} from "@/lib/music/metronome/latency-calibration";
import { canVibrate, vibrateOnBeats } from "@/lib/music/metronome/haptics";
import { meterOf } from "@/lib/music/metronome/meter";
import { INITIAL_SONG_TEMPO, followSong, tempoScale } from "@/lib/music/metronome/song-tempo";
import { TapTempo } from "@/lib/music/metronome/tap-tempo";
import { cn } from "@/lib/music/utils";
import { Choice } from "./choice";
import { MidiOutField, useMidiOut } from "./midi-out";
import { updateSheetSettings, useSheetSettings } from "./sheet-settings";
import type { SheetSong } from "./sheet-viewer";
import type { TempoResult } from "./capo-actions";

export type Metronome = ReturnType<typeof useMetronome>;

/** The shared metronome of a live session (see `src/lib/live/beat-grid.ts`). */
export type SharedMetronome = {
  /** Null until the leader sends one. */
  grid: BeatGrid | null;
  clock: ServerClock;
  isLeader: boolean;
  /** The leader sends a new grid to all. */
  setGrid: (grid: BeatGrid) => void;
};

/**
 * The metronome of the sheet. Its tempo and beats follow `song`, the song on
 * the screen. When the song changes while it plays, the new tempo starts at
 * the next beat, and the count of the bar continues.
 *
 * In a live session (`shared`), all devices play the grid of the leader. The
 * leader's tempo and beats go to the grid, and its start and stop too. The
 * other users only turn the sound on and off on their device: the first time
 * with a tap, because browsers only start audio after the user does something.
 */
export function useMetronome(song: SheetSong | undefined, shared?: SharedMetronome) {
  const settings = useSheetSettings();
  const tempoSong = song ? { id: song.id, bpm: song.bpm, timeSignature: song.timeSignature } : null;
  const [state, setState] = useState(() =>
    followSong(INITIAL_SONG_TEMPO, tempoSong, settings.compoundBeat),
  );
  const tempo = followSong(state, tempoSong, settings.compoundBeat);
  // Adjusts the state while rendering (not in an effect), so the old tempo never shows.
  if (tempo !== state) setState(tempo);

  const { bpm, beatsPerBar } = tempo;
  const { metronomeSubdivision: subdivision, metronomeAccent: accent } = settings;
  // The ear hears loudness on a log scale; the square of the slider is closer to it.
  const gain = settings.metronomeVolume ** 2;
  const [engine] = useState(
    () => new MetronomeEngine({ bpm, beatsPerBar, subdivision, accent }, gain),
  );
  const { running, error } = useSyncExternalStore(
    engine.subscribe,
    engine.getState,
    engine.getState,
  );

  useEffect(() => {
    engine.setConfig({ bpm, beatsPerBar, subdivision, accent });
  }, [engine, bpm, beatsPerBar, subdivision, accent]);
  useEffect(() => {
    engine.setGain(gain);
  }, [engine, gain]);
  useEffect(() => {
    engine.setLatency(settings.metronomeLatencyMs);
  }, [engine, settings.metronomeLatencyMs]);
  useEffect(() => () => engine.dispose(), [engine]);
  useEffect(() => {
    if (settings.metronomeVibrate && canVibrate()) return vibrateOnBeats(engine);
  }, [engine, settings.metronomeVibrate]);

  // In a live session: this device plays the shared grid.
  const [audioOn, setAudioOn] = useState(false);
  const isShared = shared !== undefined;
  const isLeader = shared?.isLeader ?? false;
  const sharedGrid = shared?.grid ?? null;
  const sharedClock = shared?.clock;
  const setSharedGrid = shared?.setGrid;
  const readOnly = isShared && !isLeader;
  const playedBeatsPerBar = readOnly && sharedGrid ? sharedGrid.beatsPerBar : beatsPerBar;

  // The MIDI clock counts quarter notes. The beat is a quarter note, unless the
  // time signature of the song says otherwise and the metronome plays its beats.
  const meter = meterOf(tempoSong?.timeSignature, settings.compoundBeat);
  const quarterNotesPerBeat =
    meter?.beatsPerBar === playedBeatsPerBar ? meter.quarterNotesPerBeat : 1;
  const midi = useMidiOut(engine, quarterNotesPerBeat);
  // In a live session, the desk gets the leader's tempo, also when the metronome does not play here.
  // Else a tempo of the song or of the user: a song without `{tempo}` keeps the last tempo of the
  // desk, as in the projection controller, not the default or the tempo of the previous song.
  const ownTempo = tempoSong?.bpm || tempo.edited ? bpm : null;
  const mixer = useMixerSync({
    bpm: isShared ? (sharedGrid?.bpm ?? null) : ownTempo,
    quarterNotesPerBeat,
    grid: sharedGrid,
    clock: sharedClock,
  });

  // The leader's tempo and beats (of the song on the screen, or its own) go to all.
  useEffect(() => {
    if (!isLeader || !sharedClock || !setSharedGrid) return;
    const now = sharedClock.now();
    const grid = sharedGrid ?? firstGrid(now);
    const next = changeGrid(grid, { bpm, beatsPerBar }, now);
    if (next !== grid) setSharedGrid(next);
  }, [isLeader, sharedGrid, sharedClock, setSharedGrid, bpm, beatsPerBar]);

  useEffect(() => {
    if (audioOn && sharedGrid && sharedClock) engine.follow(sharedGrid, sharedClock);
  }, [engine, audioOn, sharedGrid, sharedClock]);
  // Stops the shared grid when the user turns the sound off, or the session ends.
  useEffect(() => {
    if (!isShared || !audioOn) return;
    return () => engine.leave();
  }, [engine, isShared, audioOn]);

  function toggle() {
    if (!shared) {
      engine.toggle();
    } else if (shared.isLeader && shared.grid?.running && !audioOn) {
      // The metronome plays for all, without sound here: after a reload, or
      // when the lead came to this user. The tap turns the sound on, and does
      // not stop it for all: the settings have a stop button (see `stopForAll`).
      engine.follow(shared.grid, shared.clock);
      setAudioOn(true);
    } else if (shared.isLeader) {
      const now = shared.clock.now();
      const grid = changeGrid(shared.grid ?? firstGrid(now), { bpm, beatsPerBar }, now);
      const next = grid.running ? stopGrid(grid) : startGrid(grid, now);
      // During the click: the browser starts the audio only then.
      engine.follow(next, shared.clock);
      setAudioOn(true);
      shared.setGrid(next);
    } else if (audioOn) {
      setAudioOn(false);
    } else {
      engine.follow(shared.grid ?? STOPPED_GRID, shared.clock);
      setAudioOn(true);
    }
  }

  /** The leader stops the shared metronome for all, also when it plays without sound on this device. */
  function stopForAll() {
    if (shared?.isLeader && shared.grid?.running) shared.setGrid(stopGrid(shared.grid));
  }

  return {
    engine,
    running,
    error,
    toggle,
    stopForAll,
    mixer,
    bpm: readOnly && sharedGrid ? sharedGrid.bpm : bpm,
    beatsPerBar: playedBeatsPerBar,
    song: tempoSong,
    /** The user set the tempo for the song on the screen (see `SongTempo.edited`). */
    edited: tempo.edited ?? false,
    /** The length of a beat in quarter notes: 1 in 4/4, 1.5 in 6/8 with dotted beats. */
    quarterNotesPerBeat,
    /** The beats of this metronome in one beat of the song's tempo (`song.bpm`). */
    tempoScale: tempoScale(tempoSong?.timeSignature, settings.compoundBeat),
    midi,
    setBpm: (next: number) => {
      if (!readOnly) setState({ ...tempo, bpm: clampBpm(Math.round(next)), edited: true });
    },
    setBeatsPerBar: (next: number) => {
      if (!readOnly) setState({ ...tempo, beatsPerBar: next });
    },
    /** In a live session, and another user leads: the tempo and the beats come from the leader. */
    readOnly,
    /** In a live session: all devices play the leader's grid. */
    isShared,
    /** The sound is on, in a live session. */
    audioOn,
    /** The leader's metronome plays, also when the sound is off on this device. */
    sharedRunning: sharedGrid?.running ?? false,
  };
}

/** The first grid of a leader. Its epoch is the time, so it is newer than any grid of an earlier leader. */
function firstGrid(now: number): BeatGrid {
  return { ...STOPPED_GRID, epoch: Math.round(now) };
}

/**
 * Two toolbar buttons: one starts and stops the metronome with one tap, the
 * other opens its settings. The first one flashes on each beat while the
 * metronome plays.
 */
export function MetronomeControl({
  metronome,
  bar = "header",
  saveTempo,
}: {
  metronome: Metronome;
  /** The toolbar of the buttons. In the footer, at the bottom of a small screen, the settings open above. */
  bar?: "header" | "footer";
  /** For song admins: writes the tempo into the arrangement of the song on the screen. */
  saveTempo?: (bpm: number) => Promise<TempoResult>;
}) {
  const settings = useSheetSettings();
  const { m, format, number } = useI18n();
  const canPlay = useBrowserValue(canPlayMetronome, true);
  const canVibrateHere = useBrowserValue(canVibrate, false);
  const heard = useHeardBeat(metronome.engine);
  const { running, bpm, beatsPerBar, song, error, readOnly, isShared, audioOn, sharedRunning } =
    metronome;
  const meter = meterOf(song?.timeSignature, settings.compoundBeat);
  // A leader whose metronome plays for all, without sound on this device: the button turns the sound on.
  const silentLeader = isShared && !readOnly && sharedRunning && !audioOn;
  // A user who follows a live session: the button turns the sound on and off.
  const toggleLabel = readOnly
    ? audioOn
      ? m.sheet.live.mute
      : m.sheet.live.listen
    : silentLeader
      ? m.sheet.live.listen
      : format(running ? m.sheet.metronome.stopWithTempo : m.sheet.metronome.startWithTempo, {
          bpm,
        });
  const tapToHear = readOnly && sharedRunning && !audioOn;
  const beatsId = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const inFooter = bar === "footer";
  useHeaderPulse(
    groupRef,
    running && settings.metronomePulseHeader ? heard : null,
    settings.metronomeAccent,
  );

  return (
    <Popover.Root>
      <div ref={groupRef} className="flex items-center">
        {canPlay && (
          <Button
            variant={running ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={running}
            title={
              tapToHear
                ? m.sheet.live.tapToHear
                : readOnly || silentLeader
                  ? toggleLabel
                  : running
                    ? m.sheet.metronome.stopShortcut
                    : m.sheet.metronome.startShortcut
            }
            className={cn(
              "relative h-8 min-w-8 px-2 pointer-coarse:h-9 pointer-coarse:min-w-9",
              running && "text-primary",
              (tapToHear || silentLeader) && "animate-pulse",
            )}
            onClick={metronome.toggle}
          >
            {running ? <SquareIcon className="fill-current" /> : <MetronomeIcon />}
            <span className="sr-only">{toggleLabel}</span>
            <span aria-hidden className={cn("tabular-nums", !inFooter && "hidden sm:inline")}>
              {number(bpm)}
            </span>
            {running && heard && (
              <span
                key={heard.count}
                aria-hidden
                className={cn(
                  "absolute top-0.5 right-0.5 rounded-full bg-primary animate-out fade-out fill-mode-forwards duration-300",
                  heard.beat === 0 ? "size-2" : "size-1.5",
                )}
              />
            )}
          </Button>
        )}
        <Popover.Trigger
          render={
            <Button
              variant="ghost"
              size={canPlay ? "icon-sm" : "icon"}
              // On a touch screen as large as the toggle beside it.
              className={cn(canPlay && "pointer-coarse:size-9")}
              aria-label={m.sheet.metronome.settings}
              title={m.sheet.metronome.settings}
            />
          }
        >
          {!canPlay ? <MetronomeIcon /> : inFooter ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Positioner
          side={inFooter ? "top" : "bottom"}
          sideOffset={8}
          align={inFooter ? "start" : "end"}
          collisionPadding={8}
        >
          <Popover.Popup className="flex max-h-[var(--available-height)] w-72 max-w-[calc(100vw-1rem)] origin-[var(--transform-origin)] flex-col gap-4 overflow-y-auto rounded-card border bg-surface-raised p-4 text-text shadow-lg outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Popover.Title className="text-sm font-semibold">
              {m.sheet.metronome.title}
            </Popover.Title>

            {!canPlay ? (
              <p className="text-sm text-muted">{m.sheet.metronome.unsupportedBrowser}</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  {readOnly ? (
                    <Button onClick={metronome.toggle} variant={audioOn ? "secondary" : "default"}>
                      {audioOn ? <SquareIcon /> : <PlayIcon />}
                      {toggleLabel}
                    </Button>
                  ) : silentLeader ? (
                    // The button of the toolbar turns the sound on (see `silentLeaderHint`).
                    <Button onClick={metronome.stopForAll} className="w-24" variant="secondary">
                      <SquareIcon />
                      {m.sheet.metronome.stop}
                    </Button>
                  ) : (
                    <Button
                      onClick={metronome.toggle}
                      className="w-24"
                      variant={running ? "secondary" : "default"}
                    >
                      {running ? <SquareIcon /> : <PlayIcon />}
                      {running ? m.sheet.metronome.stop : m.sheet.metronome.start}
                    </Button>
                  )}
                  <BeatLights
                    beat={running ? (heard?.beat ?? null) : null}
                    beatsPerBar={beatsPerBar}
                  />
                </div>
                {error && (
                  <p role="alert" className="text-sm text-danger">
                    {m.sheet.metronome.errors[error]}
                  </p>
                )}
                {tapToHear && <p className="text-sm text-muted">{m.sheet.live.tapToHear}</p>}
                {silentLeader && (
                  <p className="text-sm text-muted">{m.sheet.live.silentLeaderHint}</p>
                )}
                {readOnly && <p className="text-xs text-muted">{m.sheet.live.tempoFromLeader}</p>}

                <TempoField metronome={metronome} saveTempo={saveTempo} />

                <div className="flex flex-col gap-1.5">
                  <label htmlFor={beatsId} className="text-xs font-medium text-muted">
                    {m.sheet.metronome.beatsPerBar}
                  </label>
                  <NativeSelect
                    id={beatsId}
                    value={beatsPerBar}
                    disabled={readOnly}
                    onChange={(event) => metronome.setBeatsPerBar(Number(event.target.value))}
                  >
                    {Array.from({ length: METRONOME_MAX_BEATS_PER_BAR }, (_, index) => (
                      <option key={index} value={index + 1}>
                        {number(index + 1)}
                      </option>
                    ))}
                  </NativeSelect>
                  <p className="text-xs text-muted">
                    {meter
                      ? format(
                          !meter.compound
                            ? m.sheet.metronome.fromTimeSignature
                            : settings.compoundBeat === "dotted"
                              ? m.sheet.metronome.fromTimeSignatureDotted
                              : m.sheet.metronome.fromTimeSignatureEighth,
                          { timeSignature: song?.timeSignature ?? "" },
                        )
                      : m.sheet.metronome.noTimeSignature}
                  </p>
                </div>

                <Choice
                  label={m.sheet.metronome.clicksPerBeat}
                  value={settings.metronomeSubdivision}
                  options={Array.from({ length: METRONOME_MAX_SUBDIVISION }, (_, index) => ({
                    value: index + 1,
                    label: number(index + 1),
                  }))}
                  onChange={(metronomeSubdivision) => updateSheetSettings({ metronomeSubdivision })}
                />
                <Choice
                  label={m.sheet.metronome.accent}
                  value={settings.metronomeAccent}
                  options={[
                    { value: true, label: m.sheet.settings.on },
                    { value: false, label: m.sheet.settings.off },
                  ]}
                  onChange={(metronomeAccent) => updateSheetSettings({ metronomeAccent })}
                />
                <Choice
                  label={m.sheet.metronome.pulseHeader}
                  value={settings.metronomePulseHeader}
                  options={[
                    { value: true, label: m.sheet.settings.on },
                    { value: false, label: m.sheet.settings.off },
                  ]}
                  onChange={(metronomePulseHeader) => updateSheetSettings({ metronomePulseHeader })}
                />
                {canVibrateHere && (
                  <Choice
                    label={m.sheet.metronome.vibrate}
                    value={settings.metronomeVibrate}
                    options={[
                      { value: true, label: m.sheet.settings.on },
                      { value: false, label: m.sheet.settings.off },
                    ]}
                    onChange={(metronomeVibrate) => updateSheetSettings({ metronomeVibrate })}
                  />
                )}
                <Choice
                  label={m.sheet.metronome.compoundBeat}
                  value={settings.compoundBeat}
                  options={[
                    { value: "dotted", label: m.sheet.metronome.compoundBeatDotted },
                    { value: "eighth", label: m.sheet.metronome.compoundBeatEighth },
                  ]}
                  onChange={(compoundBeat) => updateSheetSettings({ compoundBeat })}
                />
                <VolumeField volume={settings.metronomeVolume} />
                {metronome.isShared && (
                  <LatencyField
                    engine={metronome.engine}
                    latency={settings.metronomeLatencyMs}
                    running={running}
                  />
                )}
                <ModuleGate id="sheet.midi-out">
                  <MidiOutField midi={metronome.midi} />
                </ModuleGate>
                <ModuleGate id="mixer">
                  <MixerSyncField sync={metronome.mixer} />
                </ModuleGate>
              </>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function TempoField({
  metronome,
  saveTempo,
}: {
  metronome: Metronome;
  saveTempo?: (bpm: number) => Promise<TempoResult>;
}) {
  const { bpm, song, edited, tempoScale, setBpm, readOnly } = metronome;
  const { m, format } = useI18n();
  const [saving, startSaving] = useTransition();
  // Only for the tempo and the song that the user tried to save.
  const [saveError, setSaveError] = useState<{
    bpm: number;
    songId: string;
    message: string;
  } | null>(null);
  const shownSaveError =
    saveError?.bpm === bpm && saveError.songId === song?.id ? saveError.message : null;
  // In the beats of this metronome. The chart counts dotted beats in compound time (see `tempoScale()`).
  const songBpm = song?.bpm ? song.bpm * tempoScale : null;
  const chartBpm = Math.round(bpm / tempoScale);
  // Only a tempo that the user set for this song: a song without a tempo keeps the tempo of the song before it.
  const canSave =
    saveTempo !== undefined && !readOnly && song !== null && edited && song.bpm !== chartBpm;
  const [tapTempo] = useState(() => new TapTempo());
  const inputId = useId();
  // The text while you type. It can be empty or out of range for a moment.
  const [text, setText] = useState(String(bpm));
  const [shownBpm, setShownBpm] = useState(bpm);
  if (shownBpm !== bpm) {
    setShownBpm(bpm);
    setText(String(bpm));
  }

  function tap(time: number) {
    const tapped = tapTempo.tap(time);
    if (tapped !== null) setBpm(tapped);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-xs font-medium text-muted">
        {m.sheet.metronome.tempo}
      </label>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={m.sheet.metronome.slower}
          disabled={readOnly || bpm <= METRONOME_MIN_BPM}
          onClick={() => setBpm(bpm - 1)}
        >
          <MinusIcon />
        </Button>
        <Input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={METRONOME_MIN_BPM}
          max={METRONOME_MAX_BPM}
          value={text}
          disabled={readOnly}
          className="w-16 text-center tabular-nums"
          onChange={(event) => {
            setText(event.target.value);
            const value = Number(event.target.value);
            if (Number.isInteger(value) && value >= METRONOME_MIN_BPM && value <= METRONOME_MAX_BPM)
              setBpm(value);
          }}
          onBlur={() => setText(String(bpm))}
          aria-invalid={text !== String(bpm) || undefined}
        />
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={m.sheet.metronome.faster}
          disabled={readOnly || bpm >= METRONOME_MAX_BPM}
          onClick={() => setBpm(bpm + 1)}
        >
          <PlusIcon />
        </Button>
        {/* On press, not on release: the time of the press is the time of the beat. */}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={readOnly}
          title={m.sheet.metronome.tapTitle}
          onPointerDown={(event) => tap(event.timeStamp)}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
              event.preventDefault();
              tap(event.timeStamp);
            }
          }}
        >
          {m.sheet.metronome.tap}
        </Button>
      </div>
      {/* The leader's tempo can differ from the song on this screen: no hint about the song. */}
      <p className={cn("text-xs text-muted", readOnly && "hidden")}>
        {songBpm === null
          ? m.sheet.metronome.noTempo
          : songBpm === bpm
            ? m.sheet.metronome.songTempo
            : rich(format(m.sheet.metronome.otherSongTempo, { bpm: songBpm }), {
                button: (text) => (
                  <button
                    type="button"
                    className="font-medium text-text underline"
                    onClick={() => setBpm(songBpm)}
                  >
                    {text}
                  </button>
                ),
              })}
      </p>
      {(canSave || saving) && (
        <div className="flex flex-col items-start gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => {
              const songId = song!.id;
              setSaveError(null);
              startSaving(async () => {
                let message: string | null;
                try {
                  const result = await saveTempo!(chartBpm);
                  message = result.status === "error" ? result.message : null;
                } catch {
                  // For example, the device is offline.
                  message = m.sheet.metronome.saveTempoFailed;
                }
                if (message !== null) setSaveError({ bpm, songId, message });
              });
            }}
          >
            {saving
              ? m.common.actions.saving
              : format(m.sheet.metronome.saveTempo, { bpm: chartBpm * tempoScale })}
          </Button>
          <p className="text-xs text-muted">{m.sheet.metronome.saveTempoHint}</p>
        </div>
      )}
      {shownSaveError && (
        <p role="alert" className="text-xs text-danger">
          {shownSaveError}
        </p>
      )}
    </div>
  );
}

function VolumeField({ volume }: { volume: number }) {
  const id = useId();
  const { m, number } = useI18n();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs font-medium text-muted">
        <label htmlFor={id}>{m.sheet.metronome.volume}</label>
        <output htmlFor={id} className="tabular-nums">
          {number(volume, { style: "percent" })}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        className="accent-primary"
        onChange={(event) => updateSheetSettings({ metronomeVolume: Number(event.target.value) })}
      />
    </div>
  );
}

/**
 * The delay of the speakers that the browser does not report, e.g. of
 * Bluetooth speakers. Set it with the slider, or measure it: the user taps
 * with the clicks they hear (see `latency-calibration.ts`).
 */
function LatencyField({
  engine,
  latency,
  running,
}: {
  engine: MetronomeEngine;
  latency: number;
  running: boolean;
}) {
  const id = useId();
  const { m, format, number } = useI18n();
  const [measuring, setMeasuring] = useState(false);
  const [taps, setTaps] = useState<number[]>([]);
  // The taps with a click before them.
  const [counted, setCounted] = useState(0);
  const [result, setResult] = useState<LatencyEstimate | null>(null);
  // The times when the clicks should come out of the speakers, while the measurement runs.
  const clicks = useRef<number[]>([]);

  useEffect(() => {
    if (!measuring) return;
    clicks.current = [];
    return engine.onTick((tick) => {
      if (tick.sub === 0) clicks.current.push(tick.time);
    });
  }, [engine, measuring]);

  function toggleMeasure() {
    setTaps([]);
    setCounted(0);
    setResult(null);
    setMeasuring(!measuring);
  }

  function tap(time: number) {
    const next = [...taps, time];
    const estimate = estimateLatency(clicks.current, next);
    if (!estimate) {
      setTaps(next);
      setCounted(Math.min(tapDelays(clicks.current, next).length, CALIBRATION_TAPS));
      return;
    }
    setMeasuring(false);
    setTaps([]);
    setCounted(0);
    setResult(estimate);
    if (estimate.reliable) updateSheetSettings({ metronomeLatencyMs: estimate.latencyMs });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs font-medium text-muted">
        <label htmlFor={id}>{m.sheet.live.latency}</label>
        <output htmlFor={id} className="tabular-nums">
          {format(m.sheet.live.latencyValue, { ms: latency })}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={MAX_LATENCY_MS}
        step={5}
        value={latency}
        className="accent-primary"
        onChange={(event) =>
          updateSheetSettings({ metronomeLatencyMs: Number(event.target.value) })
        }
      />
      <p className="text-xs text-muted">{m.sheet.live.latencyHint}</p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!running && !measuring}
          onClick={toggleMeasure}
        >
          {measuring ? m.sheet.live.measureStop : m.sheet.live.measure}
        </Button>
        {measuring && (
          // On press, not on release: the time of the press is the time of the click.
          <Button
            size="sm"
            className="flex-1"
            onPointerDown={(event) => tap(event.timeStamp)}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
                event.preventDefault();
                tap(event.timeStamp);
              }
            }}
          >
            {m.sheet.live.measureTap}
          </Button>
        )}
      </div>
      <p aria-live="polite" className="text-xs text-muted">
        {measuring
          ? format(m.sheet.live.measureProgress, {
              count: number(counted),
              total: number(CALIBRATION_TAPS),
            })
          : result
            ? result.reliable
              ? format(m.sheet.live.measured, { ms: result.latencyMs })
              : m.sheet.live.measureUneven
            : running
              ? m.sheet.live.measureHint
              : m.sheet.live.measureNoClicks}
      </p>
    </div>
  );
}

/** One light per beat of the bar. The light of the beat you hear is on. */
function BeatLights({ beat, beatsPerBar }: { beat: number | null; beatsPerBar: number }) {
  return (
    <div aria-hidden className="flex flex-1 flex-wrap items-center gap-1.5">
      {Array.from({ length: beatsPerBar }, (_, index) => (
        <span
          key={index}
          className={cn(
            "rounded-full border border-primary/40 transition-colors duration-75",
            index === 0 ? "size-3.5" : "size-2.5",
            index === beat && "border-primary bg-primary",
          )}
        />
      ))}
    </div>
  );
}

/**
 * The header around `ref` pulses in the primary color on each beat: brighter
 * on beat 1 when the accent is on. An animation of the element, not a React
 * state, so the sheet does not render again on each beat.
 */
function useHeaderPulse(
  ref: React.RefObject<HTMLElement | null>,
  heard: { beat: number; count: number } | null,
  accent: boolean,
) {
  useEffect(() => {
    // The toolbar of the buttons: the header, or the footer on a small screen.
    const header = ref.current?.closest("header, footer");
    if (!heard || !header) return;
    const strength = heard.beat === 0 && accent ? 75 : 45;
    const color = `color-mix(in oklab, var(--c-primary) ${strength}%, var(--c-surface))`;
    // A sharp pulse: full color at once, held for a moment, then a fast fade.
    const animation = header.animate(
      [
        { backgroundColor: color, offset: 0 },
        { backgroundColor: color, offset: 0.35, easing: "cubic-bezier(0.5, 0, 1, 1)" },
        { backgroundColor: "var(--c-surface)", offset: 1 },
      ],
      { duration: 140 },
    );
    return () => animation.cancel();
  }, [ref, heard, accent]);
}

/**
 * The beat you hear now, and a count that changes on each beat. The worklet
 * reports a click when it makes it; the speakers play it a little later, so
 * the light waits for the time of the click.
 */
function useHeardBeat(engine: MetronomeEngine) {
  const [heard, setHeard] = useState<{ beat: number; count: number } | null>(null);

  useEffect(() => {
    const queue: HeardTick[] = [];
    let frame = 0;
    let count = 0;

    function draw(now: number) {
      frame = 0;
      let latest: HeardTick | undefined;
      while (queue.length > 0 && queue[0]!.time <= now) latest = queue.shift();
      if (latest) setHeard({ beat: latest.beat, count: ++count });
      if (queue.length > 0) frame = requestAnimationFrame(draw);
    }

    const stopTicks = engine.onTick((tick) => {
      if (tick.sub !== 0) return;
      queue.push(tick);
      frame ||= requestAnimationFrame(draw);
    });
    const stopState = engine.subscribe(() => {
      if (engine.getState().running) return;
      queue.length = 0;
      setHeard(null);
    });
    return () => {
      stopTicks();
      stopState();
      cancelAnimationFrame(frame);
    };
  }, [engine]);

  return heard;
}
