"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { PrinterIcon } from "lucide-react";

import { useNoteNames } from "@/components/music/note-names";
import { Button } from "@/components/music/ui/button";
import { useScriptureTranslations } from "@/components/music/app-config";
import { useI18n } from "@/i18n/music/client";
import { fromEnglish } from "@/lib/music/chords/notation";
import { resolveTranslation, scriptureTranslation } from "@/lib/music/scripture/translations";

/**
 * One item of a printed setlist. `details` is e.g. "Artist · Arrangement".
 * `key` is in English note names, or null for no key.
 */
export type PrintSetlistItem =
  | {
      kind: "song";
      title: string;
      details: string;
      key: string | null;
      bpm: number | null;
      timeSignature: string | null;
      volunteer: string | null;
    }
  /**
   * With `scripture`, a scripture reading: the title is the reference. Null
   * `scriptureTranslation`: the default one. A text slide also has the
   * `description` and the `highlight` that the projection shows.
   */
  | {
      kind: "text";
      title: string;
      notes: string | null;
      scripture: boolean;
      scriptureTranslation: string | null;
      description?: string | null;
      highlight?: string | null;
      volunteer: string | null;
    };

const DATE_TIME: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

// On paper, the sheet replaces the whole page. The rules are in the sheet, so
// they apply only on pages with the button. Not in `globals.css`: the build
// drops the `body:has(...)` selector that they need there.
const PRINT_CSS = `
[data-print-setlist] { display: none; }
@media print {
  @page { margin: 15mm; }
  body { background: white !important; }
  body > :not([data-print-setlist]) { display: none !important; }
  [data-print-setlist] { display: block; }
}`;

const subscribeNever = () => () => {};

/**
 * The "Print setlist" button. The page also gets the setlist as a print
 * sheet, a plain list that replaces the page on paper, also when the user
 * prints from the browser menu.
 */
export function PrintSetlistButton({
  title,
  date,
  summary,
  items,
  labelClassName = "sr-only sm:not-sr-only",
  variant = "outline",
  className,
}: {
  title: string;
  /** ISO 8601 timestamp of the event. Without it, the sheet shows today's date. */
  date?: string;
  /** For example "5 songs · 2 text items". */
  summary?: string;
  items: PrintSetlistItem[];
  /** Hides the text when there is no room for it. Screen readers still read it. */
  labelClassName?: string;
  variant?: "outline" | "secondary";
  className?: string;
}) {
  // The sheet is a portal at the end of <body>, so it renders only in the browser.
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const { m } = useI18n();

  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={className}
        disabled={items.length === 0}
        onClick={() => window.print()}
      >
        <PrinterIcon />
        {/* On phones, only the icon shows. Screen readers still read the text. */}
        <span className={labelClassName}>{m.components.printSetlist.print}</span>
      </Button>
      {mounted &&
        items.length > 0 &&
        createPortal(
          <PrintSheet title={title} date={date} summary={summary} items={items} />,
          document.body,
        )}
    </>
  );
}

function PrintSheet({
  title,
  date,
  summary,
  items,
}: {
  title: string;
  date?: string;
  summary?: string;
  items: PrintSetlistItem[];
}) {
  const { m, format, locale } = useI18n();
  const translations = useScriptureTranslations();
  const t = m.components.printSetlist;
  const noteNames = useNoteNames();
  const hasVolunteers = items.some((item) => item.volunteer);
  const dateText = date
    ? new Date(date).toLocaleString(locale, DATE_TIME)
    : new Date().toLocaleDateString(locale, { dateStyle: "full" });

  // Black on white in both themes: the theme colors are for the screen.
  return (
    <div data-print-setlist className="bg-white text-black">
      <style>{PRINT_CSS}</style>
      <header className="mb-6 border-b border-black pb-3">
        <h1 className="font-heading text-2xl font-semibold break-words">{title}</h1>
        <p className="text-sm">{[dateText, summary].filter(Boolean).join(m.common.separator)}</p>
      </header>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="w-8 py-1 pr-2 text-right font-medium">{t.number}</th>
            <th className="py-1 pr-4 font-medium">{t.item}</th>
            <th className="py-1 pr-4 font-medium">{t.key}</th>
            <th className="py-1 pr-4 font-medium">{t.tempo}</th>
            {hasVolunteers && <th className="py-1 font-medium">{t.volunteer}</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className="break-inside-avoid border-b border-neutral-300 align-top">
              <td className="py-2 pr-2 text-right tabular-nums">{index + 1}.</td>
              {item.kind === "song" ? (
                <>
                  <td className="py-2 pr-4">
                    <div className="font-semibold break-words">{item.title}</div>
                    {item.details && (
                      <div className="break-words text-neutral-600">{item.details}</div>
                    )}
                  </td>
                  <td className="py-2 pr-4 font-mono">
                    {item.key && fromEnglish(item.key, noteNames)}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap tabular-nums">
                    {[item.bpm && format(t.bpm, { bpm: item.bpm }), item.timeSignature]
                      .filter(Boolean)
                      .join(m.common.separator)}
                  </td>
                </>
              ) : (
                <td colSpan={3} className="py-2 pr-4">
                  <div className="font-semibold break-words italic">
                    {item.title ||
                      format(m.components.setlistRows.untitledItem, { number: index + 1 })}
                  </div>
                  {item.scripture && (
                    <div className="text-neutral-600">
                      {t.scripture}
                      {m.common.separator}
                      {
                        (
                          resolveTranslation(item.scriptureTranslation, translations) ??
                          scriptureTranslation(item.scriptureTranslation)
                        ).shortName
                      }
                    </div>
                  )}
                  {item.description && (
                    <div className="break-words whitespace-pre-line">{item.description}</div>
                  )}
                  {item.highlight && (
                    <div className="font-semibold break-words whitespace-pre-line">
                      {item.highlight}
                    </div>
                  )}
                  {item.notes && (
                    <div className="break-words whitespace-pre-line text-neutral-600">
                      {item.notes}
                    </div>
                  )}
                </td>
              )}
              {hasVolunteers && <td className="py-2">{item.volunteer}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
