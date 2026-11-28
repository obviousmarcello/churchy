"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { useI18n } from "@/i18n/music/client";
import { createStoredString } from "@/lib/music/browser";
import {
  localDay,
  msToNextDay,
  psalmExcerpt,
  psalmOfDay,
  type PsalmVerses,
} from "@/lib/music/daily-psalm";
import { loadBibleBook } from "@/lib/music/scripture/load";

// The psalm of the day (Károli 1908, public domain: the static files of the platform catalog), one
// to three verses, a different psalm each day. Shown on the workspace home when the module
// `ws.music.scripture.daily-psalm` is on. The day is the viewer's, so the server renders the
// loading text.

// Renders again at the next local midnight, and when the tab shows again (a timer can stop while
// the device sleeps).
function subscribe(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => {
        onChange();
        schedule();
      },
      msToNextDay(new Date()) + 1000,
    );
  };
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    onChange();
    schedule();
  };
  schedule();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

const getToday = () => localDay(new Date());

// The day on which the user collapsed the psalm. On the next day it shows expanded again. It
// belongs to the device, so it lives in `localStorage`.
const collapsedDay = createStoredString("daily-psalm-collapsed");

type Loaded =
  { status: "loading" } | { status: "failed" } | { status: "ready"; verses: PsalmVerses };

/** One to three verses from a different psalm each day. */
export function DailyPsalm() {
  const today = useSyncExternalStore(subscribe, getToday, () => null);
  const psalm = today === null ? null : psalmOfDay(new Date(`${today}T00:00`));
  const collapsedOn = collapsedDay.useValue();
  const collapsed = today !== null && collapsedOn === today;
  const { m, format } = useI18n();
  const t = m.components.dailyPsalm;
  const [loaded, setLoaded] = useState<{ psalm: number; result: Loaded } | null>(null);

  useEffect(() => {
    if (psalm === null) return;
    let active = true;
    loadBibleBook("karoli1908", "Ps", "files").then(
      (book) => {
        const verses = psalmExcerpt(book.chapters[psalm - 1] ?? []);
        if (active)
          setLoaded({ psalm, result: verses ? { status: "ready", verses } : { status: "failed" } });
      },
      () => active && setLoaded({ psalm, result: { status: "failed" } }),
    );
    return () => {
      active = false;
    };
  }, [psalm]);

  const result = loaded?.psalm === psalm ? loaded.result : null;
  const range = (verses: PsalmVerses) =>
    verses.first === verses.last ? `${verses.first}` : `${verses.first}–${verses.last}`;

  return (
    <section
      aria-labelledby="daily-psalm-title"
      data-testid="daily-psalm"
      className="rounded-control border border-border bg-surface-raised p-4"
    >
      <h2 id="daily-psalm-title" className="font-heading text-fs-5 font-bold">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls="daily-psalm-content"
          onClick={() => collapsedDay.set(collapsed ? null : today)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          {t.title}
        </button>
      </h2>
      <div id="daily-psalm-content" hidden={collapsed} className="mt-2">
        {psalm === null || result === null || result.status === "loading" ? (
          <p className="text-sm text-muted">{t.loading}</p>
        ) : result.status === "failed" ? (
          <p className="text-sm text-muted">{t.failed}</p>
        ) : (
          <figure className="flex flex-col gap-1.5">
            <blockquote className="text-sm leading-relaxed text-pretty italic">
              {result.verses.text}
            </blockquote>
            <figcaption className="text-xs text-muted">
              {format(t.reference, { psalm, verses: range(result.verses) })}
            </figcaption>
          </figure>
        )}
      </div>
    </section>
  );
}
