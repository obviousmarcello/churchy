"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ChevronDownIcon, LibraryIcon, SearchIcon, XIcon } from "lucide-react";

import {
  DIALOG_BACKDROP_CLASS,
  DIALOG_POPUP_CLASS,
  DialogActions,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/music/dialog-parts";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { NativeSelect } from "@/components/music/ui/native-select";
import { Textarea } from "@/components/music/ui/textarea";
import { useI18n } from "@/i18n/music/client";
import { parseChordPro, type ChordProLine } from "@/lib/music/chordpro";
import { searchKey } from "@/lib/music/search-text";
import { cn } from "@/lib/music/utils";
import {
  SONGPRAISE_DEFAULT_LANGUAGE,
  songpraiseOrder,
  type SongpraiseLanguageDTO,
  type SongpraiseResultDTO,
  type SongpraiseSongDTO,
} from "@/lib/music/songpraise";

/** The search delay after the last key, so a fast typist does not start a search per key. */
const SEARCH_DELAY_MS = 250;

type Load<Data> = { status: "loading" } | { status: "failed" } | { status: "ready"; data: Data };

type Step =
  | { kind: "search"; error: string | null }
  | { kind: "loading"; id: string }
  /** `chartIsEmpty` and `titleIsEmpty`: the fields of the form were empty when the song loaded. */
  | {
      kind: "result";
      song: SongpraiseSongDTO;
      chart: string;
      chartIsEmpty: boolean;
      titleIsEmpty: boolean;
    };

/** The lyrics of a song in the list of results. `data` is null when SongPraise has no such song. */
type Preview = { id: string; load: Load<SongpraiseSongDTO | null> };

/** The languages of SongPraise, once per page: they change seldom. */
let languagesCache: SongpraiseLanguageDTO[] | null = null;
/** The request of the languages, shared by all dialogs of the page (e.g. of the song form and of the quick add). */
let languagesRequest: Promise<SongpraiseLanguageDTO[]> | null = null;

function loadLanguages(): Promise<SongpraiseLanguageDTO[]> {
  if (languagesCache) return Promise.resolve(languagesCache);
  if (!languagesRequest) {
    const request = getJson<SongpraiseLanguageDTO[]>("/api/songpraise/languages").then(
      (data) => {
        languagesCache = data;
        return data;
      },
      (error: unknown) => {
        // A next try loads them again.
        languagesRequest = null;
        throw error;
      },
    );
    languagesRequest = request;
  }
  return languagesRequest;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { accept: "application/json" } });
  // A signed-out user gets the sign-in page (a redirect of the proxy).
  if (!response.ok || response.redirected)
    throw new Error(`[songpraise] ${url} failed: ${response.status}`);
  return (await response.json()) as T;
}

/**
 * A button that searches the songs of SongPraise (songpraise.com) by title
 * and gives the lyrics of the chosen song, as a ChordPro chart, to
 * `onInsert`. `replace` is false when the chart goes after the chart that the
 * field has. Each search starts with the title of the form (`getTitle`).
 * With `open`, the dialog has no button: the caller opens it, e.g. from a menu.
 */
export function SongpraiseDialog({
  getTitle,
  isChartEmpty,
  onInsert,
  open: controlledOpen,
  onOpenChange,
  insertLabel,
}: {
  getTitle: () => string;
  isChartEmpty: () => boolean;
  onInsert: (song: SongpraiseSongDTO, replace: boolean) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The text of the button that puts the chart into an empty chart field. */
  insertLabel?: string;
}) {
  const { m, format, list } = useI18n();
  const t = m.songs.form.songpraise;
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const [step, setStep] = useState<Step>({ kind: "search", error: null });
  const [language, setLanguage] = useState(SONGPRAISE_DEFAULT_LANGUAGE);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  // The songs that loaded or load, so a song loads once for its lyrics and for the chart.
  const songs = useRef(new Map<string, Promise<SongpraiseSongDTO | null>>());
  // The dialog opens with the focus in the search field, so the user can type at once.
  const searchRef = useRef<HTMLInputElement>(null);
  const languages = useLanguages(open);
  const search = useSearch(open ? language : null, query);

  function loadSong(id: string): Promise<SongpraiseSongDTO | null> {
    let song = songs.current.get(id);
    if (!song) {
      song = getJson<SongpraiseSongDTO | null>(
        `/api/songpraise/song?${new URLSearchParams({ id })}`,
      );
      songs.current.set(id, song);
      // A next try loads it again.
      song.catch(() => songs.current.delete(id));
    }
    return song;
  }

  /** Shows the lyrics of a song under its title, or hides them. */
  function togglePreview(id: string, show = preview?.id !== id) {
    if (!show) {
      setPreview(null);
      return;
    }
    setPreview({ id, load: { status: "loading" } });
    loadSong(id).then(
      (data) =>
        setPreview((current) =>
          current?.id === id ? { id, load: { status: "ready", data } } : current,
        ),
      (error: unknown) => {
        console.warn(error);
        setPreview((current) =>
          current?.id === id ? { id, load: { status: "failed" } } : current,
        );
      },
    );
  }

  // Each opening starts a new search, also when the caller opens the dialog.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery(getTitle().trim());
    } else {
      setStep({ kind: "search", error: null });
      setPreview(null);
    }
  }

  function close(next: boolean) {
    if (onOpenChange) onOpenChange(next);
    else setOwnOpen(next);
  }

  async function choose(id: string) {
    setStep({ kind: "loading", id });
    try {
      const song = await loadSong(id);
      setStep((current) => {
        // The user went back or closed the dialog during the load.
        if (current.kind !== "loading" || current.id !== id) return current;
        if (!song) return { kind: "search", error: t.notFound };
        return {
          kind: "result",
          song,
          chart: song.chordpro,
          chartIsEmpty: isChartEmpty(),
          titleIsEmpty: getTitle().trim() === "",
        };
      });
    } catch (error) {
      console.warn(error);
      setStep((current) =>
        current.kind === "loading" && current.id === id
          ? { kind: "search", error: t.failed }
          : current,
      );
    }
  }

  // The playing order of SongPraise, while the edited chart still has its labels.
  const order = step.kind === "result" ? songpraiseOrder(step.chart, step.song.sectionOrder) : [];

  function insert(replace: boolean) {
    if (step.kind !== "result") return;
    onInsert({ ...step.song, chordpro: step.chart, sectionOrder: order }, replace);
    close(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      {controlledOpen === undefined && (
        <Dialog.Trigger render={<Button type="button" variant="outline" size="sm" />}>
          <LibraryIcon />
          {t.button}
        </Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup initialFocus={searchRef} className={cn(DIALOG_POPUP_CLASS, "w-lg")}>
          <DialogHeader className="gap-4">
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Dialog.Title className="font-heading text-lg font-semibold tracking-tight">
                  {t.title}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted">
                  {t.description}
                </Dialog.Description>
              </div>
              <Dialog.Close
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={m.common.actions.close}
                  />
                }
              >
                <XIcon />
              </Dialog.Close>
            </div>
            {/* The search stays above the results: only the results scroll. */}
            {step.kind === "search" && (
              <>
                <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="songpraise-language" className="text-sm font-medium">
                      {t.language}
                    </label>
                    <NativeSelect
                      id="songpraise-language"
                      value={language}
                      disabled={languages.status !== "ready"}
                      onChange={(event) => setLanguage(event.target.value)}
                    >
                      {languages.status === "ready" ? (
                        languages.data.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))
                      ) : (
                        // The search works with the default language while the list loads.
                        <option value={language}>…</option>
                      )}
                    </NativeSelect>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="songpraise-search" className="text-sm font-medium">
                      {t.search}
                    </label>
                    <div className="relative">
                      <SearchIcon
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted"
                      />
                      <Input
                        ref={searchRef}
                        id="songpraise-search"
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                          // Enter takes the first song.
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          const first = search.data?.[0];
                          if (first && !search.pending) void choose(first.id);
                        }}
                        placeholder={t.searchPlaceholder}
                        autoComplete="off"
                        className="pl-8"
                      />
                    </div>
                  </div>
                </div>

                {languages.status === "failed" && (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-danger">
                    {t.failed}
                    <Button type="button" variant="ghost" size="sm" onClick={languages.retry}>
                      {t.retry}
                    </Button>
                  </p>
                )}
              </>
            )}
          </DialogHeader>

          {step.kind === "result" ? (
            <>
              <DialogBody className="gap-3">
                <h3 className="font-medium">{step.song.title}</h3>
                <label htmlFor="songpraise-chart" className="text-sm font-medium">
                  {t.result}
                </label>
                <Textarea
                  id="songpraise-chart"
                  value={step.chart}
                  onChange={(event) => setStep({ ...step, chart: event.target.value })}
                  spellCheck={false}
                  aria-describedby="songpraise-chart-description"
                  className="min-h-64 font-mono"
                />
                <div
                  id="songpraise-chart-description"
                  className="flex flex-col gap-1 text-sm text-muted"
                >
                  {order.length > 0 && <p>{format(t.order, { order: list(order) })}</p>}
                  {step.song.author && <p>{format(t.author, { author: step.song.author })}</p>}
                  {step.song.songbook && (
                    <p>
                      {format(t.songbook, { songbook: step.song.songbook })} {t.songbookFilled}
                    </p>
                  )}
                  {step.titleIsEmpty && <p>{t.titleFilled}</p>}
                  <p>{t.resultHint}</p>
                </div>
              </DialogBody>
              <DialogFooter>
                <DialogActions>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep({ kind: "search", error: null })}
                  >
                    {t.back}
                  </Button>
                  {step.chartIsEmpty ? (
                    <Button type="button" onClick={() => insert(true)}>
                      {insertLabel ?? t.insert}
                    </Button>
                  ) : (
                    <>
                      <Button type="button" variant="outline" onClick={() => insert(false)}>
                        {t.append}
                      </Button>
                      <Button type="button" onClick={() => insert(true)}>
                        {t.replace}
                      </Button>
                    </>
                  )}
                </DialogActions>
              </DialogFooter>
            </>
          ) : step.kind === "loading" ? (
            <>
              <DialogBody>
                <p role="status" className="text-sm">
                  {t.loadingSong}
                </p>
              </DialogBody>
              <DialogFooter>
                <DialogActions>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep({ kind: "search", error: null })}
                  >
                    {t.back}
                  </Button>
                </DialogActions>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogBody>
                <SearchResults
                  search={search}
                  preview={preview}
                  onTogglePreview={togglePreview}
                  onChoose={(id) => void choose(id)}
                />
              </DialogBody>

              {step.error && (
                <DialogFooter>
                  <p role="alert" className="text-sm text-danger">
                    {step.error}
                  </p>
                </DialogFooter>
              )}
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SearchResults({
  search,
  preview,
  onTogglePreview,
  onChoose,
}: {
  search: ReturnType<typeof useSearch>;
  preview: Preview | null;
  onTogglePreview: (id: string, show?: boolean) => void;
  onChoose: (id: string) => void;
}) {
  const { m, format } = useI18n();
  const t = m.songs.form.songpraise;
  if (!search.searchable) return <p className="text-sm text-muted">{t.searchHint}</p>;
  if (search.failed) {
    return (
      <p role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-danger">
        {t.failed}
        <Button type="button" variant="ghost" size="sm" onClick={search.retry}>
          {t.retry}
        </Button>
      </p>
    );
  }
  if (!search.data) {
    return (
      <p role="status" className="text-sm text-muted">
        {t.searching}
      </p>
    );
  }
  if (search.data.length === 0 && !search.pending) {
    return (
      <p role="status" className="text-sm text-muted">
        {t.noResults}
      </p>
    );
  }
  return (
    <ul className="-mx-2 flex flex-col" aria-busy={search.pending || undefined}>
      {search.data.map((song) => {
        const shown = preview?.id === song.id ? preview : null;
        const panelId = `songpraise-lyrics-${song.id}`;
        return (
          <li key={song.id} className={cn("rounded-lg", shown && "bg-surface-sunken/50")}>
            <div className="flex items-start gap-1">
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-w-0 flex-1 justify-start px-2 py-1.5 text-left whitespace-normal"
                onClick={() => onChoose(song.id)}
              >
                <span className="flex flex-col">
                  {song.title}
                  {song.songbook && <span className="text-xs text-muted">{song.songbook}</span>}
                </span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-expanded={shown !== null}
                aria-controls={shown ? panelId : undefined}
                aria-label={format(shown ? t.hideLyrics : t.showLyrics, { title: song.title })}
                title={format(shown ? t.hideLyrics : t.showLyrics, { title: song.title })}
                onClick={() => onTogglePreview(song.id)}
              >
                <ChevronDownIcon className={cn("transition-transform", shown && "rotate-180")} />
              </Button>
            </div>
            {shown && (
              <div id={panelId} className="flex flex-col gap-2 px-2 pb-2">
                {shown.load.status === "loading" ? (
                  <p role="status" className="text-sm text-muted">
                    {t.loadingSong}
                  </p>
                ) : shown.load.status === "failed" ? (
                  <p
                    role="alert"
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-danger"
                  >
                    {t.failed}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onTogglePreview(song.id, true)}
                    >
                      {t.retry}
                    </Button>
                  </p>
                ) : shown.load.data === null ? (
                  <p className="text-sm text-muted">{t.notFound}</p>
                ) : (
                  <>
                    <Lyrics chordpro={shown.load.data.chordpro} />
                    {shown.load.data.songbook && (
                      <p className="text-sm text-muted">
                        {format(t.songbook, { songbook: shown.load.data.songbook })}
                      </p>
                    )}
                    <div className="flex justify-end">
                      <Button type="button" size="sm" onClick={() => onChoose(song.id)}>
                        {t.use}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The lyrics of a chart, with the labels of its sections, to read before the user chooses a song. */
function Lyrics({ chordpro }: { chordpro: string }) {
  const { m } = useI18n();
  const parts = parseChordPro(chordpro).parts.filter((part) =>
    part.lines.some((line) => lineText(line)),
  );
  if (parts.length === 0)
    return <p className="text-sm text-muted">{m.songs.form.songpraise.noLyrics}</p>;
  return (
    <div className="flex max-h-72 flex-col gap-3 overflow-y-auto overscroll-contain rounded-md border bg-surface p-3 text-sm">
      {parts.map((part, index) => (
        <section key={index} className="flex flex-col">
          {part.section && <h4 className="text-xs font-medium text-muted">{part.section.label}</h4>}
          <p>
            {part.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {lineText(line)}
              </Fragment>
            ))}
          </p>
        </section>
      ))}
    </div>
  );
}

/** The text of a line of the lyrics. SongPraise has no chords, so the segments are the line. */
function lineText(line: ChordProLine): string {
  if (line.kind === "lyrics") return line.segments.map((segment) => segment.text).join("");
  if (line.kind === "comment" || line.kind === "verbatim") return line.text;
  return "";
}

/** The languages of SongPraise while the dialog is open, with a retry. */
function useLanguages(open: boolean): Load<SongpraiseLanguageDTO[]> & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load<SongpraiseLanguageDTO[]>>(() =>
    languagesCache ? { status: "ready", data: languagesCache } : { status: "loading" },
  );

  useEffect(() => {
    if (!open) return;
    // Another dialog can load the languages at the same time: both wait for the same request.
    let active = true;
    loadLanguages().then(
      (data) => {
        if (active)
          setLoad((current) =>
            current.status === "ready" && current.data === data
              ? current
              : { status: "ready", data },
          );
      },
      (error: unknown) => {
        if (!active) return;
        console.warn(error);
        setLoad({ status: "failed" });
      },
    );
    return () => {
      active = false;
    };
  }, [open, attempt]);

  return {
    ...load,
    retry: () => {
      setLoad({ status: "loading" });
      setAttempt((value) => value + 1);
    },
  };
}

/**
 * The songs of SongPraise for the search text, in a language (null: no
 * search, e.g. while the dialog is closed). While a new search runs, `data`
 * keeps the last result, so the list does not jump.
 */
function useSearch(language: string | null, text: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; data: SongpraiseResultDTO[] | null } | null>(
    null,
  );
  const searchable = searchKey(text) !== "";
  const key = `${language}\n${text}\n${attempt}`;

  useEffect(() => {
    if (!language || !searchable) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      getJson<SongpraiseResultDTO[]>(
        `/api/songpraise/search?${new URLSearchParams({ language, q: text })}`,
        controller.signal,
      ).then(
        (data) => setResult({ key, data }),
        (error: unknown) => {
          if (controller.signal.aborted) return;
          console.warn(error);
          setResult({ key, data: null });
        },
      );
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [language, text, searchable, key]);

  const retry = () => setAttempt((value) => value + 1);
  const current = result?.key === key ? result : null;
  return {
    searchable,
    data: current ? current.data : (result?.data ?? null),
    pending: current === null,
    failed: current !== null && current.data === null,
    retry,
  };
}
