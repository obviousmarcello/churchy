"use client";

import { useMemo } from "react";
import { Popover } from "@base-ui/react/popover";
import { ChevronDownIcon, SlidersVerticalIcon } from "lucide-react";

import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import type { LiveState } from "@/lib/music/live/protocol";
import { chartTempo, mixerTempoOf } from "@/lib/music/mixer/chart-tempo";
import type { ProjectionSource } from "@/lib/music/projection/slides";
import { cn } from "@/lib/music/utils";
import { MixerSyncField, mixerSyncHealth, useMixerSync } from "../keverpult/mixer-sync";
import { updateSheetSettings } from "../kotta/sheet-settings";

const LIGHT_CLASS = {
  off: "bg-surface-sunken-foreground/40",
  ok: "bg-green-500",
  waiting: "bg-amber-500 animate-pulse",
  error: "bg-destructive",
} as const;

/**
 * The tempo to the mixer from the projection controller, e.g. when the
 * computer at the desk runs the projection. In a live session, the tempo of
 * the leader's metronome; else the tempo of the chart of the song on the
 * screens. Another item (a text, an image) keeps the last tempo.
 *
 * One click turns it on or off. The light shows whether the desk gets the
 * tempo; the arrow opens the details.
 */
export function MixerSyncButton({
  sources,
  liveKey,
  leader,
}: {
  sources: ProjectionSource[];
  /** The item on the screens. */
  liveKey: string | null;
  leader: LiveState | null;
}) {
  const { m, format } = useI18n();
  const t = m.mixer.sync;
  const grid = leader?.grid ?? null;
  // The song of the leader's tempo, for its time signature.
  const songKey = (grid && leader?.position?.songId) || liveKey;
  const source = sources.find(
    (candidate) => candidate.kind === "song" && candidate.key === songKey,
  );
  const chordpro = source?.kind === "song" ? source.chordpro : null;
  const chart = useMemo(() => (chordpro === null ? null : chartTempo(chordpro)), [chordpro]);
  const tempo = mixerTempoOf(chart, grid);
  const sync = useMixerSync({ ...tempo, grid });
  const health = mixerSyncHealth(sync);
  const status = {
    off: t.statusOff,
    ok: t.statusOk,
    waiting: t.statusWaiting,
    error: t.statusError,
  }[health];

  return (
    <Popover.Root>
      <div className="flex items-center">
        <Button
          type="button"
          variant={sync.enabled ? "secondary" : "outline"}
          aria-pressed={sync.enabled}
          aria-label={`${sync.enabled ? t.turnOff : t.turnOn}. ${status}`}
          title={`${sync.enabled ? t.turnOff : t.turnOn}. ${status}`}
          className={cn("rounded-r-none", sync.enabled && "text-primary")}
          onClick={() => updateSheetSettings({ mixerSync: !sync.enabled })}
        >
          <span className="relative">
            <SlidersVerticalIcon />
            <span
              aria-hidden
              className={cn(
                "absolute -top-1 -right-1 size-2.5 rounded-full ring-2 ring-background",
                LIGHT_CLASS[health],
              )}
            />
          </span>
          <span className="sr-only sm:not-sr-only">{t.short}</span>
          {sync.enabled && tempo.bpm !== null && (
            <span className="hidden tabular-nums md:inline">
              {format(t.bpm, { bpm: Math.round(tempo.bpm) })}
            </span>
          )}
        </Button>
        <Popover.Trigger
          render={
            <Button
              type="button"
              variant={sync.enabled ? "secondary" : "outline"}
              size="icon"
              aria-label={t.details}
              title={t.details}
              className="-ml-px rounded-l-none"
            />
          }
        >
          <ChevronDownIcon />
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" collisionPadding={8} className="z-50">
          <Popover.Popup className="flex max-h-[var(--available-height)] w-80 max-w-[calc(100vw-1rem)] origin-[var(--transform-origin)] flex-col gap-3 overflow-y-auto rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Popover.Title className="text-sm font-semibold">{t.title}</Popover.Title>
            <MixerSyncField sync={sync} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
