"use client";

import { Popover } from "@base-ui/react/popover";

import { Button } from "@/components/music/ui/button";
import { NativeSelect } from "@/components/music/ui/native-select";
import { useI18n } from "@/i18n/music/client";
import { rich } from "@/i18n/music/rich";
import { keysLike, sameKey } from "@/lib/music/chords/key";
import { fromEnglish, type Notation } from "@/lib/music/chords/notation";
import { cn } from "@/lib/music/utils";

// The key to play a song in, on the sheet. All keys are in English note names
// here; the user reads them in `notation`.

/** The keys of a song on the sheet, and where the shown key comes from. */
export type SongKeys = {
  /** The key of the chart. */
  written: string;
  /** The other keys of the chart. */
  others: string[];
  /** The key of the event slot or the rehearsal. */
  slot: string | null;
  /** The user's own key. */
  own: string | null;
  /** The leader's key in a live session. */
  live: string | null;
  /** The key of the chords on the sheet: `live`, `own`, `slot` or `written`. */
  shown: string;
};

/** Where `SongKeys.slot` comes from. */
export type SlotKind = "event" | "rehearsal";

/**
 * The key to play the song in. Without a live session, it is the user's own
 * key. The leader of a live session sets the key for everyone instead; the
 * other participants see it, and cannot change it.
 */
export function KeySetting({
  title,
  keys,
  slotKind,
  isLeader,
  notation,
  error,
  onChange,
}: {
  title: string;
  keys: SongKeys;
  slotKind: SlotKind;
  /** The user leads a live session: a change goes to everyone. */
  isLeader: boolean;
  notation: Notation;
  error: string | null;
  /** Null removes the user's own key, or the leader's key. */
  onChange: (key: string | null) => void;
}) {
  const { m, format } = useI18n();
  const name = (key: string) => fromEnglish(key, notation);
  const resetButton = (text: string) => (
    <button
      type="button"
      className="font-medium text-text underline"
      onClick={() => onChange(null)}
    >
      {text}
    </button>
  );

  const songKeys = [keys.written, ...keys.others];
  const allKeys = keysLike(keys.written).filter(
    (key) => !songKeys.some((songKey) => sameKey(songKey, key)),
  );
  // The option of the shown key, also when it has another name, e.g. F# for Gb.
  const value = [...songKeys, ...allKeys].find((key) => sameKey(key, keys.shown)) ?? keys.written;
  const locked = keys.live !== null && !isLeader;

  let note: React.ReactNode;
  if (keys.live !== null && !isLeader) {
    note = format(m.sheet.key.leaderPlaysIn, { key: name(keys.live) });
  } else if (isLeader) {
    note = keys.live
      ? rich(format(m.sheet.key.leaderKey, { key: name(keys.live) }), { button: resetButton })
      : m.sheet.key.leaderHint;
  } else if (keys.own !== null && keys.slot !== null && !sameKey(keys.own, keys.slot)) {
    const message = slotKind === "event" ? m.sheet.key.eventPlaysIn : m.sheet.key.rehearsalPlaysIn;
    note = rich(format(message, { key: name(keys.slot) }), { button: resetButton });
  } else if (keys.own !== null && keys.slot === null && !sameKey(keys.own, keys.written)) {
    note = rich(format(m.sheet.key.otherChartKey, { key: name(keys.written) }), {
      button: resetButton,
    });
  } else {
    note =
      keys.slot === null
        ? m.sheet.key.fromChart
        : slotKind === "event"
          ? m.sheet.key.fromEvent
          : m.sheet.key.fromRehearsal;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="truncate text-xs font-medium text-muted">{title}</p>
      <NativeSelect
        aria-label={m.sheet.key.select}
        value={value}
        disabled={locked}
        // The key of the event or the chart removes the own key, so a later change of them shows.
        onChange={(event) => {
          const key = event.target.value;
          onChange(!isLeader && sameKey(key, keys.slot ?? keys.written) ? null : key);
        }}
      >
        <optgroup label={m.sheet.key.songKeys}>
          {songKeys.map((key, index) => (
            <option key={key} value={key}>
              {index === 0 ? format(m.sheet.key.chartKey, { key: name(key) }) : name(key)}
            </option>
          ))}
        </optgroup>
        <optgroup label={m.sheet.key.allKeys}>
          {allKeys.map((key) => (
            <option key={key} value={key}>
              {name(key)}
            </option>
          ))}
        </optgroup>
      </NativeSelect>
      <p className="text-xs text-muted">
        {note}
        {!locked && !isLeader && <> {m.sheet.key.hint}</>}
      </p>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A button with the shown key of a song. It opens the key setting. A dot
 * marks a key that is not the key of the event, the rehearsal or the chart.
 */
export function KeyButton({
  keys,
  notation,
  label,
  className,
  children,
}: {
  keys: SongKeys;
  notation: Notation;
  /** The accessible name of the button. */
  label: string;
  className?: string;
  /** The key setting. */
  children: React.ReactNode;
}) {
  const changed = !sameKey(keys.shown, keys.slot ?? keys.written);
  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={label}
            title={label}
            className={cn(
              "relative h-8 min-w-8 px-2 pointer-coarse:h-9 pointer-coarse:min-w-9 font-mono",
              className,
            )}
          />
        }
      >
        {fromEnglish(keys.shown, notation)}
        {changed && (
          <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" collisionPadding={8} className="z-50">
          <Popover.Popup className="max-h-[var(--available-height)] w-72 max-w-[calc(100vw-1rem)] origin-[var(--transform-origin)] overflow-y-auto rounded-lg border bg-surface-raised p-4 text-text shadow-lg outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
