"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@base-ui/react/drawer";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GuitarIcon,
  PlayIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";

import { useModule } from "@/components/music/app-config";
import { SongLinkAnchor, SoundFilePlayer } from "@/components/music/song-media";
import { Button } from "@/components/music/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { useI18n } from "@/i18n/music/client";
import { parseChordName, transposeChordName } from "@/lib/music/chords/chord-name";
import { GUITAR_POSITIONS, GUITAR_TUNINGS, guitarVoicings } from "@/lib/music/chords/guitar";
import { keysVoicings } from "@/lib/music/chords/keys";
import { fromEnglish, type Notation } from "@/lib/music/chords/notation";
import { cn } from "@/lib/music/utils";
import { Choice } from "./choice";
import { GuitarDiagram } from "./guitar-diagram";
import { KeysDiagram } from "./keys-diagram";
import { SCORE_SPEEDS, scoreVoices, type PlayableNote, type ScoreSpeed } from "./score-player";
import { updateSheetSettings, type SheetSettings } from "./sheet-settings";

/** A song on the screen, with the chords it plays. */
export type RehearsalSong = {
  id: string;
  title: string;
  /** In English note names. */
  chords: string[];
  /** The capo of the song, or null. */
  capo: number | null;
  /** The song has scores, to show instead of the chords. */
  hasScores: boolean;
  /** The score that shows instead of the chords. `notes` is null while it loads. */
  score: { name: string; notes: PlayableNote[] | null } | null;
  /** The sound files of the arrangement, by name. */
  soundFiles: { id: string; name: string; url: string }[];
  /** The links of the arrangement, by name. */
  links: { id: string; name: string; url: string; isYoutube: boolean }[];
};

/** The playback of the scores' notes. */
export type ScorePlayback = {
  /** The song that plays, or null. */
  playing: string | null;
  /** The playback waits for its first beat of the metronome. */
  waiting: boolean;
  /** The metronome plays: a new playback follows its tempo and beats, not `speed`. */
  withMetronome: boolean;
  speed: ScoreSpeed;
  /** The voices to play, by song (see `PlayableNote.voice`). A song without an entry plays all. */
  voices: Record<string, string[]>;
  onPlay: (songId: string) => void;
  onStop: () => void;
  onVoices: (songId: string, voices: string[]) => void;
};

type Options = Pick<SheetSettings, "rehearsalInstrument" | "guitarTuning" | "guitarPosition">;

/**
 * Rehearsal mode: how to play each chord of the songs on the screen, on guitar
 * or keys. The chart's chords are the shapes to play with the capo on, so the
 * guitar shows them as written and the keys play them higher by the capo. For
 * a song that shows a score, it also plays the notes. It also has the sound
 * files and the links of the songs, e.g. to play along with a recording.
 */
export function RehearsalPanel({
  songs,
  options,
  notation,
  playback,
  onClose,
  inDrawer,
}: {
  songs: RehearsalSong[];
  options: Options;
  /** The note names to show. */
  notation: Notation;
  playback: ScorePlayback;
  onClose: () => void;
  inDrawer?: boolean;
}) {
  const Title = inDrawer ? Drawer.Title : "h2";
  const { m, number } = useI18n();
  const guitar = options.rehearsalInstrument === "guitar";
  const withChords = songs.filter((song) => song.chords.length > 0);
  // The chord diagrams are the module "sheet.chord-diagrams": while it is off, the panel has only the scores, the sound files and the links.
  const diagramsOn = useModule("sheet.chord-diagrams");

  return (
    <section aria-label={m.sheet.rehearsal.title} className="flex flex-col gap-4 p-3">
      <div className="flex items-center gap-1">
        <Title className="flex-1 text-sm font-semibold">{m.sheet.rehearsal.title}</Title>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={m.sheet.rehearsal.close}
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>

      {songs.some((song) => song.hasScores) && (
        <ScorePlayer songs={songs} playback={playback} showTitles={songs.length > 1} />
      )}

      {songs.some((song) => song.soundFiles.length > 0 || song.links.length > 0) && (
        <SongMedia songs={songs} showTitles={songs.length > 1} />
      )}

      {diagramsOn && (
        <>
          <Choice
            label={m.sheet.rehearsal.instrument}
            value={options.rehearsalInstrument}
            options={[
              { value: "guitar", label: m.sheet.rehearsal.guitar },
              { value: "keys", label: m.sheet.rehearsal.keys },
            ]}
            onChange={(rehearsalInstrument) => updateSheetSettings({ rehearsalInstrument })}
          />
          {guitar && (
            <>
              <Choice
                label={m.sheet.rehearsal.tuning}
                value={options.guitarTuning}
                options={[
                  { value: "standard", label: m.sheet.rehearsal.tuningStandard },
                  { value: "openD", label: m.sheet.rehearsal.tuningOpenD },
                  { value: "openG", label: m.sheet.rehearsal.tuningOpenG },
                ]}
                onChange={(guitarTuning) => updateSheetSettings({ guitarTuning })}
              />
              <Choice
                label={m.sheet.rehearsal.position}
                value={options.guitarPosition}
                options={GUITAR_POSITIONS.map((position) => ({
                  value: position,
                  label: position === 0 ? m.sheet.rehearsal.positionOpen : number(position),
                }))}
                onChange={(guitarPosition) => updateSheetSettings({ guitarPosition })}
              />
            </>
          )}

          {withChords.length === 0 ? (
            <Empty className="p-4 md:p-4">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <GuitarIcon />
                </EmptyMedia>
                <EmptyTitle className="text-base">{m.sheet.rehearsal.noChordsTitle}</EmptyTitle>
                <EmptyDescription>{m.sheet.rehearsal.noChordsDescription}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            withChords.map((song) => (
              <SongChords
                key={song.id}
                song={song}
                options={options}
                notation={notation}
                showTitle={withChords.length > 1}
              />
            ))
          )}
        </>
      )}
    </section>
  );
}

/** The players of the sound files and the links of the songs on the screen. */
function SongMedia({ songs, showTitles }: { songs: RehearsalSong[]; showTitles: boolean }) {
  const { m } = useI18n();
  const withMedia = songs.filter((song) => song.soundFiles.length > 0 || song.links.length > 0);

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border p-3">
      <h3 className="text-xs font-medium text-text/60">{m.sheet.rehearsal.media}</h3>
      {withMedia.map((song) => (
        <div key={song.id} className="flex flex-col gap-3">
          {showTitles && <p className="truncate text-xs font-medium">{song.title}</p>}
          {song.soundFiles.map((soundFile) => (
            <SoundFilePlayer key={soundFile.id} file={soundFile} />
          ))}
          {song.links.length > 0 && (
            <ul className="-mx-1 flex flex-col">
              {song.links.map((link) => (
                <li key={link.id}>
                  <SongLinkAnchor link={link} className="rounded-control px-1 py-1.5" />
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

/** Play and stop for each score on the screen, the speed, and the voices to play. */
function ScorePlayer({
  songs,
  playback,
  showTitles,
}: {
  songs: RehearsalSong[];
  playback: ScorePlayback;
  showTitles: boolean;
}) {
  const { m, number } = useI18n();
  const withScore = songs.filter((song) => song.score);

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border p-3">
      <h3 className="text-xs font-medium text-text/60">{m.sheet.play.title}</h3>
      {withScore.length === 0 ? (
        <p className="text-xs text-text/70">{m.sheet.play.chooseScore}</p>
      ) : (
        <>
          {withScore.map((song) => (
            <SongScorePlayer key={song.id} song={song} playback={playback} showTitle={showTitles} />
          ))}
          {playback.withMetronome ? (
            <p className="text-xs text-text/70">{m.sheet.play.withMetronome}</p>
          ) : (
            <Choice
              label={m.sheet.play.speed}
              value={playback.speed}
              options={SCORE_SPEEDS.map((speed) => ({
                value: speed,
                label: number(speed, { style: "percent" }),
              }))}
              onChange={(scoreSpeed) => updateSheetSettings({ scoreSpeed })}
            />
          )}
          <p className="text-xs text-text/70">{m.sheet.play.hint}</p>
        </>
      )}
    </section>
  );
}

function SongScorePlayer({
  song,
  playback,
  showTitle,
}: {
  song: RehearsalSong;
  playback: ScorePlayback;
  showTitle: boolean;
}) {
  const { m, format } = useI18n();
  const notes = song.score?.notes ?? null;
  const voices = useMemo(() => (notes ? scoreVoices(notes) : []), [notes]);
  const chosen = playback.voices[song.id]?.filter((voice) => voices.includes(voice)) ?? voices;
  const staves = new Set(voices.map((voice) => voice.split(".")[0])).size;
  const playing = playback.playing === song.id;

  function voiceLabel(voice: string) {
    const [staff, layer] = voice.split(".");
    if (staves === 1) return format(m.sheet.play.voice, { voice: layer! });
    return voices.filter((other) => other.startsWith(`${staff}.`)).length === 1
      ? format(m.sheet.play.staff, { staff: staff! })
      : format(m.sheet.play.staffVoice, { staff: staff!, voice: layer! });
  }

  return (
    <div className="flex flex-col gap-2">
      {showTitle && <p className="truncate text-xs font-medium">{song.title}</p>}
      {notes === null ? (
        <p className="text-xs text-text/70 italic">{m.sheet.play.loading}</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-text/70">{m.sheet.play.noNotes}</p>
      ) : (
        <>
          <Button
            variant={playing ? "secondary" : "default"}
            size="sm"
            className="w-fit"
            disabled={!playing && chosen.length === 0}
            title={playing ? m.sheet.play.stopShortcut : m.sheet.play.playShortcut}
            onClick={() => (playing ? playback.onStop() : playback.onPlay(song.id))}
          >
            {playing ? <SquareIcon /> : <PlayIcon />}
            {playing
              ? m.sheet.play.stop
              : format(m.sheet.play.playScore, { score: song.score!.name })}
          </Button>
          {playing && playback.waiting && (
            <p aria-live="polite" className="text-xs text-text/70 italic">
              {m.sheet.play.waiting}
            </p>
          )}
          {voices.length > 1 && (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-xs text-text/60">{m.sheet.play.voices}</legend>
              {voices.map((voice) => (
                <label key={voice} className="flex items-center gap-2 text-sm pointer-coarse:py-1">
                  <input
                    type="checkbox"
                    className="size-4 accent-(--color-primary)"
                    checked={chosen.includes(voice)}
                    onChange={(event) =>
                      playback.onVoices(
                        song.id,
                        event.target.checked
                          ? [...chosen, voice]
                          : chosen.filter((other) => other !== voice),
                      )
                    }
                  />
                  {voiceLabel(voice)}
                </label>
              ))}
              {chosen.length === 0 && (
                <p className="text-xs text-text/70">{m.sheet.play.noVoices}</p>
              )}
            </fieldset>
          )}
        </>
      )}
    </div>
  );
}

function SongChords({
  song,
  options,
  notation,
  showTitle,
}: {
  song: RehearsalSong;
  options: Options;
  notation: Notation;
  showTitle: boolean;
}) {
  const { m, format } = useI18n();
  const guitar = options.rehearsalInstrument === "guitar";

  return (
    <div className="flex flex-col gap-2">
      {showTitle && <h3 className="truncate text-xs font-medium text-text/60">{song.title}</h3>}
      {song.capo ? (
        <p className="text-xs text-text/70">
          {format(guitar ? m.sheet.rehearsal.capoShapes : m.sheet.rehearsal.capoSounding, {
            capo: song.capo,
          })}
        </p>
      ) : null}
      {/* Keyboards need the whole width. */}
      <ul className={cn("grid gap-2", guitar ? "grid-cols-2" : "grid-cols-1")}>
        {song.chords.map((chord) => (
          <li key={chord}>
            <ChordCard
              // A new instrument, tuning or position starts again from the first shape.
              key={`${options.rehearsalInstrument}-${options.guitarTuning}-${options.guitarPosition}`}
              symbol={chord}
              capo={song.capo ?? 0}
              options={options}
              notation={notation}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChordCard({
  symbol,
  capo,
  options,
  notation,
}: {
  symbol: string;
  capo: number;
  options: Options;
  notation: Notation;
}) {
  const { m, format } = useI18n();
  const guitar = options.rehearsalInstrument === "guitar";
  const tuning = GUITAR_TUNINGS[options.guitarTuning];
  // The keys play the sounding chord.
  const name = guitar ? symbol : transposeChordName(symbol, capo);
  const chord = useMemo(() => parseChordName(name), [name]);
  const shapes = useMemo(() => {
    if (!chord) return null;
    return guitar
      ? { kind: "guitar" as const, voicings: guitarVoicings(chord, tuning, options.guitarPosition) }
      : { kind: "keys" as const, voicings: keysVoicings(chord) };
  }, [chord, guitar, tuning, options.guitarPosition]);
  const count = shapes?.voicings.length ?? 0;
  // The names in the user's note names. The shapes come from the English ones.
  const label = fromEnglish(name, notation);
  const [index, setIndex] = useState(0);
  const shown = Math.min(index, Math.max(count - 1, 0));

  return (
    <div className="flex h-full flex-col items-center gap-1 rounded-card border border-border bg-surface/40 p-2">
      <p className="text-center">
        <span className="font-bold text-primary">{label}</span>
        {name !== symbol && (
          <span className="block text-xs text-text/60">
            {format(m.sheet.rehearsal.onSheet, { chord: fromEnglish(symbol, notation) })}
          </span>
        )}
      </p>

      {!shapes ? (
        <p className="my-auto text-center text-xs text-text/60 italic">
          {m.sheet.rehearsal.unknownChord}
        </p>
      ) : count === 0 ? (
        <p className="my-auto text-center text-xs text-text/60 italic">
          {m.sheet.rehearsal.noShape}
        </p>
      ) : shapes.kind === "guitar" ? (
        <GuitarDiagram
          chord={label}
          voicing={shapes.voicings[shown]!}
          tuning={tuning}
          notation={notation}
        />
      ) : (
        <KeysDiagram chord={name} voicing={shapes.voicings[shown]!} notation={notation} />
      )}

      {count > 1 && (
        <div className="mt-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={format(m.sheet.rehearsal.previousShape, { chord: label })}
            disabled={shown === 0}
            onClick={() => setIndex(shown - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <span aria-live="polite" className="text-xs text-text/70 tabular-nums">
            {format(m.sheet.rehearsal.shapeOf, { index: shown + 1, count })}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={format(m.sheet.rehearsal.nextShape, { chord: label })}
            disabled={shown === count - 1}
            onClick={() => setIndex(shown + 1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      )}
    </div>
  );
}
