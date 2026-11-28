"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { GripVerticalIcon, MusicIcon, PlusIcon, SearchIcon } from "lucide-react";

import { ListPaneHeader } from "@/components/music/list-detail";
import { useNoteNames } from "@/components/music/note-names";
import { arrangementDetails, ITEM_ICON_CLASS } from "@/components/music/setlist-rows";
import { Button } from "@/components/music/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/music/ui/empty";
import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import { songMatchesSearch } from "@/lib/music/search-text";
import { cn } from "@/lib/music/utils";
import type { SongWithArrangementsDTO } from "@/server/music/models/songs";

/** The type of the drag data of a song: its id. The setlist accepts only this type. */
export const SONG_DRAG_TYPE = "application/x-msdb-song";

/**
 * The songs next to the rehearsal setlist (large screens, the list of
 * `ListDetail`): a search that stays at the top, and a row for each song in
 * a list that scrolls on its own, grows with its "Load more" button, and has
 * only the rows in view in the page (the catalog can have thousands of songs). A row drags into the
 * setlist; its "+" adds the song at the end, also from the keyboard. The
 * songs that the setlist has are marked. Small screens add with the field of
 * the setlist.
 */
export function SongCatalog({
  catalog,
  inSetlist,
  full,
  onAdd,
  onDragChange,
}: {
  catalog: SongWithArrangementsDTO[];
  /** The ids of the songs in the setlist. */
  inSetlist: ReadonlySet<string>;
  /** The setlist has the most items: no adding. */
  full: boolean;
  onAdd: (song: SongWithArrangementsDTO) => void;
  /** A drag of a song starts (true) or ends (false). */
  onDragChange: (dragging: boolean) => void;
}) {
  const { m, format } = useI18n();
  const t = m.rehearsal.catalog;
  const noteNames = useNoteNames();
  const [query, setQuery] = useState("");
  // Only the songs that can go in a setlist: with an arrangement.
  const songs = useMemo(() => catalog.filter((song) => song.arrangements.length > 0), [catalog]);
  const shown = useMemo(
    () => songs.filter((song) => songMatchesSearch(song, query.trim())),
    [songs, query],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const { start, end, loaded, onScroll, loadMore } = useVirtualRows(scrollRef, shown.length, query);
  const fullId = useId();

  return (
    // `data-list-detail-nav`: the list of the list-detail layout (see `src/components/list-detail.tsx`).
    // The title and the search stay; only the songs scroll.
    <div data-list-detail-nav className="flex min-h-0 flex-1 flex-col">
      <ListPaneHeader title={t.title} />
      <div className="relative shrink-0 pb-3 lg:px-1">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-[calc(50%-0.375rem)] left-4 size-4 -translate-y-1/2 text-muted"
        />
        <Input
          type="search"
          aria-label={t.search}
          placeholder={t.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="rounded-full border-transparent bg-surface-sunken/60 pl-9 dark:bg-surface-sunken/60"
        />
      </div>
      {/* The reason of the disabled "+" buttons and drags: visible, and the description of each button. */}
      {full && (
        <p id={fullId} className="shrink-0 px-1 pb-3 text-sm text-muted">
          {t.full}
        </p>
      )}
      {shown.length === 0 ? (
        <Empty className="p-4">
          <EmptyHeader>
            <EmptyTitle>{songs.length === 0 ? t.noSongs.title : t.noMatches.title}</EmptyTitle>
            <EmptyDescription>
              {songs.length === 0 ? t.noSongs.description : t.noMatches.description}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:px-1"
        >
          {/* Only the rows in view (and a few more) are in the page: the space of the others keeps the scroll bar right. */}
          <ul
            aria-label={t.title}
            style={{ paddingTop: start * ROW_PX, paddingBottom: (loaded - end) * ROW_PX }}
          >
            {shown.slice(start, end).map((song, offset) => {
              const index = start + offset;
              const details = [
                song.artist,
                ...arrangementDetails(song.arrangements[0]!, noteNames),
              ].filter(Boolean);
              const added = inSetlist.has(song.id);
              return (
                <li
                  key={song.id}
                  data-row={index}
                  tabIndex={-1}
                  draggable={!full}
                  title={full ? t.full : t.dragHint}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(SONG_DRAG_TYPE, song.id);
                    event.dataTransfer.effectAllowed = "copy";
                    onDragChange(true);
                  }}
                  onDragEnd={() => onDragChange(false)}
                  style={{ height: ROW_PX }}
                  className={cn(
                    "group/song flex items-center gap-2 rounded-xl pr-1.5 pl-1 transition-colors hover:bg-surface-sunken/60",
                    !full && "cursor-grab active:cursor-grabbing",
                  )}
                >
                  <GripVerticalIcon
                    aria-hidden
                    className="size-4 shrink-0 text-muted/60 group-hover/song:text-muted"
                  />
                  {/* Filled: the setlist has the song. It can go in again, e.g. at the end too. */}
                  <span
                    className={cn(ITEM_ICON_CLASS, added && "bg-primary text-primary-foreground")}
                    title={added ? t.inSetlist : undefined}
                  >
                    <MusicIcon aria-hidden />
                    {added && <span className="sr-only">{t.inSetlist}</span>}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">{song.title}</span>
                    {details.length > 0 && (
                      <span className="truncate text-xs text-muted">{details.join(" · ")}</span>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 rounded-full"
                    disabled={full}
                    aria-label={format(t.add, { title: song.title })}
                    aria-describedby={full ? fullId : undefined}
                    title={full ? t.full : format(t.add, { title: song.title })}
                    onClick={() => onAdd(song)}
                  >
                    <PlusIcon />
                  </Button>
                </li>
              );
            })}
          </ul>
          {loaded < shown.length && (
            <div className="flex justify-center py-2">
              <Button type="button" variant="ghost" size="sm" onClick={loadMore}>
                {t.loadMore}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The height of a song row, in CSS pixels: all rows are as high, so the place of each row is known without a measure. */
const ROW_PX = 52;
/** The rows above and below the view that are also in the page, so a fast scroll shows no gap. */
const OVERSCAN = 8;
/** The rows that the list adds at each "Load more". */
const PAGE = 60;

/**
 * The rows of a long list to render (`start` to `end`) and the loaded rows
 * (`loaded`): "Load more" (`loadMore`) adds `PAGE` rows and moves the focus
 * to the first new row. Only the rows in view are in the page. A new
 * `resetKey` (e.g. a new search) starts again at the top.
 */
function useVirtualRows(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  total: number,
  resetKey: string,
) {
  const [view, setView] = useState({ top: 0, height: 800 });
  const [pages, setPages] = useState(1);
  const [shownFor, setShownFor] = useState(resetKey);
  // The first new row after "Load more": it gets the focus.
  const focusRow = useRef<number | null>(null);
  if (resetKey !== shownFor) {
    setShownFor(resetKey);
    setPages(1);
    setView((current) => ({ ...current, top: 0 }));
  }
  const loaded = Math.min(total, pages * PAGE);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [resetKey, scrollRef]);

  // The height of the view follows the window.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setView((current) => ({ ...current, height: element.clientHeight })),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollRef, total]);

  useEffect(() => {
    if (focusRow.current === null) return;
    scrollRef.current?.querySelector<HTMLElement>(`[data-row="${focusRow.current}"]`)?.focus();
    focusRow.current = null;
  }, [loaded, scrollRef]);

  const lastInView = Math.ceil((view.top + view.height) / ROW_PX);
  const start = Math.max(0, Math.floor(view.top / ROW_PX) - OVERSCAN);
  const end = Math.min(loaded, lastInView + OVERSCAN);

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    const { scrollTop, clientHeight } = event.currentTarget;
    setView({ top: scrollTop, height: clientHeight });
  }

  function loadMore() {
    focusRow.current = loaded;
    setPages((current) => current + 1);
  }

  return { start, end, loaded, onScroll, loadMore };
}
