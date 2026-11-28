"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  ListPlusIcon,
  LoaderCircleIcon,
  PanelRightCloseIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { z } from "zod";

import { ScriptureTranslationSelect } from "@/components/music/scripture-translation-select";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import { createStoredString, useMediaQuery, useRootFontPx } from "@/lib/music/browser";
import { quickItemKey, type QuickItemInput } from "@/lib/music/projection/quick-items";
import {
  bibleItemKey,
  type ProjectionItem,
  type ProjectionSource,
  type ProjectionTile,
} from "@/lib/music/projection/slides";
import { bookName } from "@/lib/music/scripture/book-names";
import { BOOK_IDS, bookAbbreviation, DEUTEROCANONICAL_BOOKS } from "@/lib/music/scripture/books";
import { resolvePassage } from "@/lib/music/scripture/passage";
import {
  formatVerses,
  parseScriptureReference,
  type ScriptureReference,
} from "@/lib/music/scripture/reference";
import {
  matchBooks,
  searchSegments,
  searchVerses,
  searchWords,
  type SearchVerse,
} from "@/lib/music/scripture/search";
import { cn } from "@/lib/music/utils";
import { loadFullBook, useBibleSearch, type Bible } from "./bible";
import { ResizeHandle } from "./resize-handle";

// The Bible panel of the controller (see `bible.ts`). Wide: docked on the
// right, with a handle to resize it, and a button to minimize it to a strip.
// Its width and whether it is open stay on the device. Narrow: it opens over
// the controller from the right.
//
// The search box takes a reference ("Jn 3,16–18": Enter shows the verses at
// once), the start of a book name ("kor"), or words of the text. The first
// search in the text loads all books of the translation.

const storedLayout = createStoredString("projection-bible-panel");

const layoutSchema = z.object({ open: z.boolean(), width: z.number().positive() });

const DEFAULT_LAYOUT = { open: true, width: 384 };

/** In rem. */
const MIN_WIDTH = 18;

/** The largest part of the window for the panel. */
const MAX_SHARE = 0.6;

/** The widest panel now: a part of the window. */
function maxWidth(): number {
  return window.innerWidth * MAX_SHARE;
}

/** The same as `lg` of Tailwind: the setlist is a column on the left from here. */
const WIDE_QUERY = "(min-width: 64rem)";

/** The most verses that a search shows. */
const MAX_RESULTS = 100;

/** The fewest letters of a search in the text, without the spaces. */
const MIN_TEXT_QUERY = 3;

/** The open state and the width of the panel, and its dialog on a narrow window. */
export function useBiblePanelLayout() {
  const layout = parseLayout(storedLayout.useValue());
  const wide = useMediaQuery(WIDE_QUERY);
  const [drawerOpen, setDrawerOpen] = useState(false);
  return {
    ...layout,
    wide,
    drawerOpen: !wide && drawerOpen,
    setDrawerOpen,
    setOpen: (open: boolean) => storedLayout.set(JSON.stringify({ ...layout, open })),
    setWidth: (width: number) => storedLayout.set(JSON.stringify({ ...layout, width })),
  };
}

type BiblePanelLayout = ReturnType<typeof useBiblePanelLayout>;

function parseLayout(json: string | null | undefined): { open: boolean; width: number } {
  if (!json) return DEFAULT_LAYOUT;
  try {
    const result = layoutSchema.safeParse(JSON.parse(json));
    return result.success ? result.data : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/**
 * The button of the controller header that opens the panel, or minimizes it.
 * `available`: false without a translation with its full text; the button then says why.
 */
export function BiblePanelButton({
  layout,
  available,
}: {
  layout: BiblePanelLayout;
  available: boolean;
}) {
  const { m } = useI18n();
  const t = m.project.biblePanel;
  const reasonId = useId();
  if (!available) {
    return (
      <Button
        type="button"
        variant="outline"
        aria-disabled="true"
        aria-label={t.open}
        aria-describedby={reasonId}
        title={t.unavailable}
        className="opacity-50"
      >
        <BookOpenIcon />
        <span className="sr-only sm:not-sr-only">{t.title}</span>
        <span id={reasonId} className="sr-only">
          {t.unavailable}
        </span>
      </Button>
    );
  }
  const open = layout.wide ? layout.open : layout.drawerOpen;
  const label = open ? t.minimize : t.open;
  return (
    <Button
      type="button"
      variant={open ? "secondary" : "outline"}
      aria-expanded={open}
      aria-label={label}
      title={label}
      onClick={() => (layout.wide ? layout.setOpen(!layout.open) : layout.setDrawerOpen(true))}
    >
      <BookOpenIcon />
      <span className="sr-only sm:not-sr-only">{t.title}</span>
    </Button>
  );
}

type BibleBrowserProps = {
  bible: Bible;
  /** The item of the verses on the screens and their tile ids, when it is a book of the panel. */
  live: { itemKey: string; tileIds: ReadonlySet<string> } | null;
  /** A click on a verse of the open book: as a click on a verse tile of the controller. */
  onClickVerse: (tile: ProjectionTile, click: { range: boolean; toggle: boolean }) => void;
  /** Shows the verses of a book together, e.g. of a typed reference. */
  onShowVerses: (item: ProjectionItem, tiles: ProjectionTile[]) => void;
  /** Adds a scripture reading to the setlist, as the quick add. */
  onAdd: (source: ProjectionSource, item: QuickItemInput) => void | Promise<void>;
};

export function BiblePanel({ layout, ...props }: BibleBrowserProps & { layout: BiblePanelLayout }) {
  const { m } = useI18n();
  const t = m.project.biblePanel;

  if (!layout.wide) {
    return (
      <Dialog.Root open={layout.drawerOpen} onOpenChange={layout.setDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 min-h-dvh bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
          {/* The keys of the slides also work here, as in the docked panel. */}
          <Dialog.Popup
            data-projection-keys=""
            className="fixed inset-y-0 right-0 flex w-[min(28rem,100vw)] flex-col border-l bg-surface-raised pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-text shadow-lg transition-transform duration-200 ease-out outline-none data-ending-style:translate-x-full data-starting-style:translate-x-full"
          >
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Dialog.Title className="min-w-0 flex-1 font-heading text-fs-5 font-bold">
                {t.title}
              </Dialog.Title>
              <Dialog.Close
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.close}
                    title={t.close}
                  />
                }
              >
                <XIcon />
              </Dialog.Close>
            </div>
            <BibleBrowser {...props} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  if (!layout.open) {
    return (
      <aside
        aria-label={t.title}
        className="flex w-11 shrink-0 flex-col items-center border-l bg-surface-sunken py-2"
      >
        <button
          type="button"
          aria-expanded={false}
          aria-label={t.open}
          title={t.open}
          onClick={() => layout.setOpen(true)}
          className="flex flex-col items-center gap-2 rounded-control px-1.5 py-2 text-sm font-medium text-muted transition-colors outline-none hover:bg-surface-sunken hover:text-text focus-visible:ring-3 focus-visible:ring-focus/50"
        >
          <BookOpenIcon aria-hidden className="size-4" />
          <span className="[writing-mode:vertical-rl]">{t.title}</span>
        </button>
      </aside>
    );
  }

  return <DockedPanel layout={layout} {...props} />;
}

function DockedPanel({ layout, ...props }: BibleBrowserProps & { layout: BiblePanelLayout }) {
  const { m } = useI18n();
  const t = m.project.biblePanel;
  const rootFontPx = useRootFontPx();
  const asideRef = useRef<HTMLElement>(null);
  // The width during a drag: it is saved at the end.
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  return (
    <aside
      ref={asideRef}
      aria-label={t.title}
      style={{ width: dragWidth ?? layout.width }}
      className="relative flex min-h-0 max-w-[60vw] min-w-72 shrink-0 flex-col border-l bg-surface-sunken"
    >
      <ResizeHandle
        panelRef={asideRef}
        edge="left"
        label={t.resize}
        minWidth={MIN_WIDTH * rootFontPx}
        maxWidth={maxWidth}
        onPreview={setDragWidth}
        onChange={layout.setWidth}
        onReset={() => layout.setWidth(DEFAULT_LAYOUT.width)}
      />
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <h2 className="min-w-0 flex-1 font-heading text-fs-5 font-bold">{t.title}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t.minimize}
          title={t.minimize}
          aria-expanded
          onClick={() => layout.setOpen(false)}
        >
          <PanelRightCloseIcon />
        </Button>
      </div>
      <BibleBrowser {...props} />
    </aside>
  );
}

function BibleBrowser({ bible, live, onClickVerse, onShowVerses, onAdd }: BibleBrowserProps) {
  const { m, format, plural, locale } = useI18n();
  const t = m.project.biblePanel;
  const { place, setPlace, translation, openItem, openBook } = bible;
  const [query, setQuery] = useState("");
  const search = useBibleSearch(translation);
  // The verse to scroll to, after its chapter opened and it went on the screens.
  const scrollTo = useRef<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const bookIds = BOOK_IDS.filter(
    (book) => translation.deuterocanon || !DEUTEROCANONICAL_BOOKS.has(book),
  );
  const trimmed = query.trim();
  const reference = trimmed ? parseScriptureReference(trimmed) : null;
  const matchedBooks = trimmed && !reference ? matchBooks(trimmed, bookIds) : bookIds;
  const words = reference ? "" : searchWords(trimmed).join(" ");
  const longEnough = words.replace(/\s/g, "").length >= MIN_TEXT_QUERY;
  const wordQuery = useDeferredValue(longEnough ? trimmed : "");
  const searchStatus = search.status;
  const results = useMemo(
    () =>
      searchStatus.status === "ready" && wordQuery
        ? searchVerses(searchStatus.index, wordQuery, MAX_RESULTS)
        : null,
    [searchStatus, wordQuery],
  );

  const openKey = openItem?.key ?? null;
  const liveIds = live && live.itemKey === openKey ? live.tileIds : null;
  const chapterTiles = useMemo(
    () =>
      openItem && place.chapter !== null
        ? openItem.tiles.filter((tile) => tile.verse?.chapter === place.chapter)
        : [],
    [openItem, place.chapter],
  );
  const liveChapters = new Set([...(liveIds ?? [])].map((id) => Number(id.split(":")[0])));
  const lastLive = [...(liveIds ?? [])].at(-1) ?? null;

  // The verse of a reference or of a search result, and the live verse when it changes, e.g. after "Next".
  useEffect(() => {
    const target = scrollTo.current;
    const id = target ?? lastLive;
    if (!id) return;
    const element = listRef.current?.querySelector(`[data-verse="${CSS.escape(id)}"]`);
    if (!element) return;
    element.scrollIntoView({ block: target ? "center" : "nearest" });
    scrollTo.current = null;
  }, [lastLive, chapterTiles]);

  function open(book: string | null, chapter: number | null = null) {
    setPlace({ translation: translation.id, book, chapter });
  }

  /** Opens the chapter of the reference, and shows its verses, unless it names only chapters. */
  async function goToReference(target: ScriptureReference) {
    if (!bookIds.includes(target.book)) return;
    setQuery("");
    open(target.book, target.ranges[0]!.from.chapter);
    if (target.ranges.every(({ from, to }) => from.verse === null && to.verse === null)) return;
    try {
      const { item, text } = await bible.loadItem(target.book);
      const ids = new Set(
        resolvePassage(target, text).verses.map(({ chapter, verse }) => `${chapter}:${verse}`),
      );
      const tiles = item.tiles.filter((tile) => ids.has(tile.id));
      if (tiles.length === 0) return;
      scrollTo.current = tiles[0]!.id;
      onShowVerses(item, tiles);
    } catch {
      // The panel shows the status of the book.
    }
  }

  /** Shows the verse of a search result, and opens its chapter for when the search clears. */
  async function showResult(verse: SearchVerse) {
    open(verse.book, verse.chapter);
    try {
      const { item } = await bible.loadItem(verse.book);
      const tile = item.tiles.find(
        (candidate) => candidate.id === `${verse.chapter}:${verse.verse}`,
      );
      if (!tile) return;
      scrollTo.current = tile.id;
      onShowVerses(item, [tile]);
    } catch {
      // The panel shows the status of the book.
    }
  }

  async function goToChapter(offset: 1 | -1) {
    if (!place.book || place.chapter === null || !openBook) return;
    const chapter = place.chapter + offset;
    if (chapter >= 1 && chapter <= openBook.chapters.length) return open(place.book, chapter);
    const index = bookIds.indexOf(place.book) + offset;
    const book = bookIds[index];
    if (!book) return;
    if (offset === 1) return open(book, 1);
    // The last chapter of the book before.
    try {
      open(book, (await loadFullBook(translation, book)).chapters.length);
    } catch {
      open(book);
    }
  }

  /** The reference that "Add to the setlist" adds: the verses on the screens, else the open chapter. */
  const addTitle = (() => {
    const style = openItem?.scriptureFormat;
    if (!style || place.chapter === null) return null;
    const verses = openItem.tiles.flatMap((tile) =>
      tile.verse && liveIds?.has(tile.id) ? [tile.verse] : [],
    );
    return verses.length > 0 ? formatVerses(style, verses) : `${style.book} ${place.chapter}`;
  })();

  function addToSetlist() {
    if (!addTitle) return;
    void onAdd(
      {
        kind: "text",
        key: quickItemKey(),
        title: addTitle,
        scripture: true,
        translation: translation.id,
      },
      { kind: "text", title: addTitle, scripture: true, scriptureTranslation: translation.id },
    );
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (reference) void goToReference(reference);
      else if (trimmed && matchedBooks.length === 1) {
        setQuery("");
        open(matchedBooks[0]!);
      } else if (longEnough && (searchStatus.status === "idle" || searchStatus.status === "failed"))
        search.start();
    }
  }

  const english = locale !== "hu";
  const groups = [
    { label: t.oldTestament, books: matchedBooks.filter((book) => BOOK_IDS.indexOf(book) < 39) },
    {
      label: t.newTestament,
      books: matchedBooks.filter(
        (book) => BOOK_IDS.indexOf(book) >= 39 && !DEUTEROCANONICAL_BOOKS.has(book),
      ),
    },
    {
      label: t.deuterocanon,
      books: matchedBooks.filter((book) => DEUTEROCANONICAL_BOOKS.has(book)),
    },
  ].filter((group) => group.books.length > 0);

  const bookList = (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <section key={group.label} className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-muted">{group.label}</h3>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] gap-1">
            {group.books.map((book) => (
              <li key={book}>
                <button
                  type="button"
                  title={bookName(book, locale)}
                  // The name starts with the visible abbreviation (WCAG 2.5.3, label in name).
                  aria-label={`${bookAbbreviation(book, english)}, ${bookName(book, locale)}`}
                  onClick={() => {
                    setQuery("");
                    open(book);
                  }}
                  className={cn(
                    "w-full truncate rounded-control border px-1 py-1.5 text-sm transition-colors outline-none hover:bg-surface-sunken focus-visible:ring-3 focus-visible:ring-focus/50",
                    book === place.book && "border-primary bg-primary/10",
                  )}
                >
                  {bookAbbreviation(book, english)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b p-3">
        <ScriptureTranslationSelect
          value={translation.id}
          onChange={(id) => setPlace({ ...place, translation: id })}
          title={t.title}
          pasted={false}
        />
        <div className="relative">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
            aria-label={t.search}
            placeholder={t.searchPlaceholder}
            autoComplete="off"
            spellCheck={false}
            className="pl-8"
          />
        </div>
        {!trimmed && <p className="text-xs text-muted">{t.searchHint}</p>}
        {reference && (
          <ReferenceAction
            reference={reference}
            available={bookIds.includes(reference.book)}
            label={trimmed}
            translation={translation.shortName}
            onGo={() => void goToReference(reference)}
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {trimmed && !reference ? (
          <div className="flex flex-col gap-4">
            {groups.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">{t.books}</h3>
                {bookList}
              </section>
            ) : (
              !words && (
                <p className="text-sm text-muted">{format(t.noBooks, { query: trimmed })}</p>
              )
            )}
            {words && (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">{t.inText}</h3>
                {!longEnough ? (
                  <p className="text-sm text-muted">
                    {format(t.searchTextShort, { count: MIN_TEXT_QUERY })}
                  </p>
                ) : searchStatus.status === "idle" ? (
                  <div className="flex flex-col gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={search.start}
                      className="justify-start"
                    >
                      <SearchIcon />
                      <span className="truncate">{format(t.searchText, { query: trimmed })}</span>
                    </Button>
                    <p className="text-xs text-muted">{t.searchTextHint}</p>
                  </div>
                ) : searchStatus.status === "loading" ? (
                  <Note loading>
                    {format(t.searchLoading, {
                      loaded: searchStatus.loaded,
                      total: searchStatus.total,
                    })}
                  </Note>
                ) : searchStatus.status === "failed" || searchStatus.status === "notInstalled" ? (
                  <Note action={{ label: t.retry, onClick: search.start }}>
                    {searchStatus.status === "failed"
                      ? t.searchFailed
                      : format(t.searchNotInstalled, { translation: translation.shortName })}
                  </Note>
                ) : !results ? null : results.total === 0 ? (
                  <p className="text-sm text-muted">{t.noResults}</p>
                ) : (
                  <>
                    <p role="status" className="text-xs text-muted">
                      {results.total > results.verses.length
                        ? format(t.moreResults, {
                            shown: results.verses.length,
                            count: results.total,
                          })
                        : plural(t.results, results.total)}
                    </p>
                    <ul className="flex flex-col gap-1">
                      {results.verses.map((verse) => {
                        const id = `${verse.chapter}:${verse.verse}`;
                        const isLive =
                          live?.itemKey === bibleItemKey(translation.id, verse.book) &&
                          live.tileIds.has(id);
                        return (
                          <li key={`${verse.book}.${id}`}>
                            <button
                              type="button"
                              aria-pressed={isLive}
                              onClick={() => void showResult(verse)}
                              className={cn(
                                "flex w-full flex-col gap-0.5 rounded-control border px-2 py-1.5 text-left text-sm transition-colors outline-none hover:bg-surface-sunken focus-visible:ring-3 focus-visible:ring-focus/50",
                                isLive && "border-primary bg-primary/10",
                              )}
                            >
                              <span className="text-xs font-medium text-muted">
                                {bookAbbreviation(verse.book, english)} {verse.chapter}
                                {english ? ":" : ","}
                                {verse.verse}
                              </span>
                              <span>
                                {searchSegments(verse.text, wordQuery).map((segment, index) =>
                                  segment.match ? (
                                    <mark
                                      key={index}
                                      className="rounded-sm bg-primary/20 text-text"
                                    >
                                      {segment.text}
                                    </mark>
                                  ) : (
                                    segment.text
                                  ),
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </section>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <nav aria-label={t.books} className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
              <BreadcrumbButton current={place.book === null} onClick={() => open(null)}>
                {t.books}
              </BreadcrumbButton>
              {place.book && (
                <>
                  <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 text-muted" />
                  <BreadcrumbButton
                    current={place.chapter === null}
                    onClick={() => open(place.book)}
                  >
                    {bookName(place.book, locale)}
                  </BreadcrumbButton>
                </>
              )}
              {place.book && place.chapter !== null && (
                <>
                  <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 text-muted" />
                  <BreadcrumbButton current>
                    {format(t.chapter, { chapter: place.chapter })}
                  </BreadcrumbButton>
                </>
              )}
            </nav>

            {place.book === null ? (
              bookList
            ) : bible.status !== "ready" || !openBook || !openItem ? (
              <BookStatusNote bible={bible} />
            ) : place.chapter === null ? (
              <section className="flex flex-col gap-1.5">
                <h3 className="text-xs font-medium text-muted">{t.chapters}</h3>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1">
                  {openBook.chapters.map((_, index) => (
                    <li key={index}>
                      <button
                        type="button"
                        aria-label={format(t.chapter, { chapter: index + 1 })}
                        onClick={() => open(place.book, index + 1)}
                        className={cn(
                          "w-full rounded-control border py-1.5 text-sm tabular-nums transition-colors outline-none hover:bg-surface-sunken focus-visible:ring-3 focus-visible:ring-focus/50",
                          liveChapters.has(index + 1) && "border-primary bg-primary/10",
                        )}
                      >
                        {index + 1}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <ChapterButtons onMove={(offset) => void goToChapter(offset)} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    title={addTitle ? format(t.addToSetlistOf, { reference: addTitle }) : undefined}
                    onClick={addToSetlist}
                    className="ml-auto min-w-0"
                  >
                    <ListPlusIcon />
                    <span className="truncate">{t.addToSetlist}</span>
                  </Button>
                </div>
                {chapterTiles.length === 0 ? (
                  <p className="text-sm text-muted">{t.noVerses}</p>
                ) : (
                  <ol ref={listRef} className="flex flex-col gap-0.5">
                    {chapterTiles.map((tile) => {
                      const isLive = liveIds?.has(tile.id) ?? false;
                      return (
                        <li key={tile.id}>
                          <button
                            type="button"
                            data-verse={tile.id}
                            aria-pressed={isLive}
                            // No text selection with Shift.
                            onMouseDown={(event) => event.shiftKey && event.preventDefault()}
                            onClick={(event) =>
                              onClickVerse(tile, {
                                range: event.shiftKey,
                                toggle: event.metaKey || event.ctrlKey,
                              })
                            }
                            className={cn(
                              "flex w-full gap-2 rounded-control px-1.5 py-1 text-left text-sm transition-colors outline-none hover:bg-surface-sunken focus-visible:ring-3 focus-visible:ring-focus/50",
                              isLive && "bg-primary/10 ring-2 ring-primary",
                            )}
                          >
                            <span className="w-6 shrink-0 pt-0.5 text-right text-xs font-medium text-muted tabular-nums">
                              {tile.verse?.verse}
                            </span>
                            <span className="min-w-0 flex-1">{tile.verse?.text}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <div className="flex items-center gap-1">
                  <ChapterButtons onMove={(offset) => void goToChapter(offset)} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The action of a typed reference: show its verses, or open its chapter. */
function ReferenceAction({
  reference,
  available,
  label,
  translation,
  onGo,
}: {
  reference: ScriptureReference;
  /** The translation has the book. */
  available: boolean;
  label: string;
  /** The short name of the translation. */
  translation: string;
  onGo: () => void;
}) {
  const { m, format } = useI18n();
  const t = m.project.biblePanel;
  if (!available)
    return <p className="text-xs text-muted">{format(t.referenceUnavailable, { translation })}</p>;
  const chaptersOnly = reference.ranges.every(
    ({ from, to }) => from.verse === null && to.verse === null,
  );
  return (
    <Button
      type="button"
      size="sm"
      onClick={onGo}
      aria-keyshortcuts="Enter"
      className="justify-start"
    >
      <BookOpenIcon />
      <span className="truncate">
        {format(chaptersOnly ? t.openReference : t.showReference, { reference: label })}
      </span>
    </Button>
  );
}

function BreadcrumbButton({
  current,
  onClick,
  children,
}: {
  current: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  if (current) {
    return (
      <span aria-current="page" className="min-w-0 truncate px-1 font-medium">
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 truncate rounded-sm px-1 text-muted underline-offset-2 outline-none hover:text-text hover:underline focus-visible:ring-3 focus-visible:ring-focus/50"
    >
      {children}
    </button>
  );
}

function ChapterButtons({ onMove }: { onMove: (offset: 1 | -1) => void }) {
  const { m } = useI18n();
  const t = m.project.biblePanel;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t.previousChapter}
        title={t.previousChapter}
        onClick={() => onMove(-1)}
      >
        <ChevronLeftIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t.nextChapter}
        title={t.nextChapter}
        onClick={() => onMove(1)}
      >
        <ChevronRightIcon />
      </Button>
    </>
  );
}

/** Why the open book does not show. */
function BookStatusNote({ bible }: { bible: Bible }) {
  const { m, format } = useI18n();
  const t = m.project.biblePanel;
  const translation = bible.translation.shortName;
  if (bible.status === "loading" || bible.status === "ready")
    return <Note loading>{t.bookLoading}</Note>;
  if (bible.status === "unavailable")
    return <Note>{format(t.bookUnavailable, { translation })}</Note>;
  return (
    <Note action={{ label: t.retry, onClick: bible.retry }}>
      {bible.status === "failed" ? t.bookFailed : format(t.bookNotInstalled, { translation })}
    </Note>
  );
}

function Note({
  loading = false,
  action,
  children,
}: {
  loading?: boolean;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-muted">
      {loading ? (
        <LoaderCircleIcon aria-hidden className="size-4 shrink-0 animate-spin" />
      ) : (
        <CircleAlertIcon aria-hidden className="size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1">{children}</span>
      {action && (
        <Button type="button" size="sm" variant="outline" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </p>
  );
}
