"use client";

import { useMemo } from "react";
import { FileMusicIcon } from "lucide-react";

import { PreviewEmpty, PreviewSection } from "@/components/music/preview-layout";
import { useI18n } from "@/i18n/music/client";
import { parseChordPro } from "@/lib/music/chordpro";
import { ChordSheet, sheetBlocks } from "../kotta/chord-sheet";
import { useSheetSettings } from "../kotta/sheet-settings";

/**
 * The chart of the song form as the chord sheet shows it: in the playing
 * order, on the paper of the user's sheet settings. A filled detail field
 * replaces the value of the chart, as on a save. The chords stay in the
 * note names of the chart.
 */
export function ChartPreview({
  chordpro,
  sectionOrder,
  title,
  artist,
  musicalKey,
  bpm,
  timeSignature,
}: {
  chordpro: string;
  sectionOrder: string[];
  title: string;
  artist: string;
  musicalKey: string;
  bpm: string;
  timeSignature: string;
}) {
  const { m, format } = useI18n();
  const t = m.songs.form;
  const settings = useSheetSettings();
  const chart = useMemo(() => parseChordPro(chordpro), [chordpro]);
  const blocks = sheetBlocks(chart, sectionOrder, "arrangement");

  const key = musicalKey.trim() || chart.meta.key;
  const tempo = bpm.trim() || chart.meta.tempo;
  const time = timeSignature.trim() || chart.meta.time;
  const details: string[] = [];
  if (key) details.push(format(m.sheet.details.key, { key }));
  if (tempo) details.push(format(m.sheet.details.bpm, { bpm: tempo }));
  if (time) details.push(time);

  return (
    <PreviewSection title={t.preview} hint={t.previewHint}>
      {chart.parts.length === 0 ? (
        <PreviewEmpty
          icon={<FileMusicIcon aria-hidden />}
          title={t.previewEmptyTitle}
          description={t.previewEmptyDescription}
        />
      ) : (
        <div
          // The colors of the paper are in `globals.css`, for the light and the dark theme.
          data-sheet-paper={settings.background}
          className="overflow-x-auto rounded-lg border bg-(--sheet-bg) p-4 text-[0.9375rem] text-(--sheet-fg)"
        >
          <ChordSheet
            title={title.trim() || chart.meta.title || "—"}
            subtitle={artist.trim() || chart.meta.subtitle || chart.meta.artist || null}
            details={details}
            blocks={blocks}
            options={{
              showChords: true,
              underlineSyllables: settings.underlineSyllables,
              repeats: settings.repeats,
            }}
          />
          {blocks.length === 0 && (
            <p className="text-sm text-(--sheet-muted)">{t.previewNoSection}</p>
          )}
        </div>
      )}
    </PreviewSection>
  );
}
