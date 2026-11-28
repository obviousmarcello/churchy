"use client";

import { useEffect, useLayoutEffect, useOptimistic, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FileMusicIcon,
  FileTextIcon,
  ImageIcon,
  ListMusicIcon,
  PencilIcon,
  MousePointerClickIcon,
  ScaleIcon,
  SearchXIcon,
  TextQuoteIcon,
  XIcon,
} from "lucide-react";

import { ListDetail, ListPaneHeader } from "@/components/music/list-detail";
import { LocalDateTime } from "@/components/music/local-date-time";
import { useNoteNames } from "@/components/music/note-names";
import { arrangementDetails } from "@/lib/music/arrangement-details";
import { Button, buttonVariants } from "@/components/music/ui/button";
import { PageHeader } from "@/components/music/page-header";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { useAppPathname, useI18n } from "@/i18n/music/client";
import { rich } from "@/i18n/music/rich";
import { useMediaQuery } from "@/lib/music/browser";
import { fromEnglish } from "@/lib/music/chords/notation";
import { formatSongCount } from "@/lib/music/format";
import { matchingSongbook } from "@/lib/music/search-text";
import {
  PAGE_PARAM,
  SONG_FILTER_PARAMS,
  SONGS_PAGE_SIZE,
  hasSongFilters,
  parseSongFilters,
  parseSongSort,
  type SongFilters,
  type SongSort,
} from "@/lib/music/song-filters";
import { cn } from "@/lib/music/utils";
import type {
  SongFilterOptionsDTO,
  SongListItemDTO,
  SongPageDTO,
  SongSnippetDTO,
} from "@/server/music/models/songs";
import { useAttachmentDetails } from "@/components/music/attachment-details";
import { SongLinkAnchor, SoundFilePlayer } from "@/components/music/song-media";
import { imageHref, pdfHref, sheetHref } from "@/lib/music/next-path";
import type { SongFileModules } from "./data";
import { AddSongLink } from "./add-song-link";
import { DeleteSongButton } from "./delete-song-button";
import { SongFilterBar } from "./song-filter-bar";

const LARGE_QUERY = "(min-width: 64rem)"; // Tailwind `lg`: the list-detail layout shows both panes

export function SongBrowser({
  result,
  filters,
  sort,
  options,
  extraSong,
  canEditSongs,
  canEditEvents,
  rightsProposals,
  isLoading,
  // Their offline copy failed to refresh; Churchy renders on the server (always false).
  failed: _failed,
  files,
}: {
  /** The file modules that are on (`ws.music.songs.*`). */
  files: SongFileModules;
  /** One page of the songs that match the filters. */
  result: SongPageDTO;
  filters: SongFilters;
  sort: SongSort;
  options: SongFilterOptionsDTO;
  /** The selected song when it is not on this page. */
  extraSong: SongListItemDTO | null;
  /** Song admins and superadmins see the add and edit links. */
  canEditSongs: boolean;
  /** Event admins and superadmins see "Add to event". */
  canEditEvents: boolean;
  /** The rights proposals that wait for a review by a song admin, for the link to the review page. */
  rightsProposals: number;
  /** The songs are of the previous filters, while the new ones load. */
  isLoading: boolean;
  /** The fresh songs did not load: these are the browser copy. */
  failed: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = useAppPathname();
  const i18n = useI18n();
  const { m, plural } = i18n;
  const isLarge = useMediaQuery(LARGE_QUERY);
  // The scroll position of the list before a song opened on a small screen.
  const listScroll = useRef<number | null>(null);
  // The open song has its own history entry from `select`: closing it goes back
  // to the entry of the list, so the back button does not show the list twice.
  const songEntry = useRef(false);
  useEffect(() => {
    const onPopState = () => {
      songEntry.current = false;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  // Another list (a filter, a page): the entry before is not the list on the screen.
  const listQuery = withoutSong(searchParams).toString();
  useEffect(() => {
    songEntry.current = false;
  }, [listQuery]);
  const [isPending, startTransition] = useTransition();
  // The filter fields show a change at once, while the server filters.
  const [optimisticFilters, setOptimisticFilters] = useOptimistic(filters);
  const [optimisticSort, setOptimisticSort] = useOptimistic(sort);
  const { songs, total } = result;
  const filtered = hasSongFilters(filters);

  const selectedId = searchParams.get("song");
  const selected =
    songs.find((song) => song.id === selectedId) ??
    (extraSong?.id === selectedId ? extraSong : null);

  // Small screens: a song opens at the top; the list (also after the back
  // gesture) comes back at its place.
  const open = selected !== null;
  useLayoutEffect(() => {
    if (isLarge) return;
    if (open) window.scrollTo(0, 0);
    else if (listScroll.current !== null) {
      window.scrollTo(0, listScroll.current);
      listScroll.current = null;
    }
  }, [open, isLarge]);

  function urlWith(params: URLSearchParams | ReadonlyURLSearchParams) {
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  // The selection lives in the URL so it can be shared and the back button
  // closes the panel. Switching between songs replaces the history entry.
  // It changes only the URL: the song is already on the page.
  function select(id: string | null) {
    if (!id && songEntry.current) {
      songEntry.current = false;
      window.history.back();
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("song", id);
    else params.delete("song");
    // Small screens show the song alone: it starts at the top, and the list
    // comes back at its place (see the effect below).
    if (id && !selected && !isLarge) listScroll.current = window.scrollY;
    if (id && !selected) {
      window.history.pushState(null, "", urlWith(params));
      songEntry.current = true;
    } else window.history.replaceState(null, "", urlWith(params));
  }

  // The server filters the songs. A new filter starts again at page 1.
  function filterAction(changes: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [name, value] of Object.entries(changes)) {
      if (value) params.set(name, value);
      else params.delete(name);
    }
    params.delete(PAGE_PARAM);
    startTransition(() => {
      setOptimisticFilters(parseSongFilters(Object.fromEntries(params)));
      setOptimisticSort(parseSongSort(Object.fromEntries(params)));
      router.replace(urlWith(params), { scroll: false });
    });
  }

  function clearFilters() {
    filterAction(Object.fromEntries(Object.values(SONG_FILTER_PARAMS).map((name) => [name, ""])));
  }

  // Keeps the selected song open.
  function tagHref(tag: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(SONG_FILTER_PARAMS.tag, tag);
    params.delete(PAGE_PARAM);
    return urlWith(params);
  }

  function pageHref(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page > 1) params.set(PAGE_PARAM, String(page));
    else params.delete(PAGE_PARAM);
    return urlWith(params);
  }

  let content: React.ReactNode;
  if (songs.length > 0) {
    content = (
      <>
        <SongList
          songs={songs}
          snippets={result.snippets}
          query={filters.query}
          selectedId={selected?.id ?? null}
          onSelect={select}
          canEditSongs={canEditSongs}
        />
        <Pagination result={result} pageHref={pageHref} />
      </>
    );
  } else if (total > 0) {
    content = (
      <Empty data-list-empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListMusicIcon />
          </EmptyMedia>
          <EmptyTitle>{m.songs.browser.emptyPage.title}</EmptyTitle>
          <EmptyDescription>
            {plural(m.songs.browser.emptyPage.description, result.pageCount)}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href={pageHref(1)} className={buttonVariants({ variant: "outline" })}>
            {m.songs.browser.emptyPage.firstPage}
          </Link>
        </EmptyContent>
      </Empty>
    );
  } else if (filtered) {
    content = (
      <Empty data-list-empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>{m.songs.browser.noMatches.title}</EmptyTitle>
          <EmptyDescription>{m.songs.browser.noMatches.description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={clearFilters}>
            <XIcon />
            {m.songs.filters.clear}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <Empty data-list-empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListMusicIcon />
          </EmptyMedia>
          <EmptyTitle>{m.songs.browser.noSongs.title}</EmptyTitle>
          <EmptyDescription>{m.songs.browser.noSongs.description}</EmptyDescription>
        </EmptyHeader>
        {canEditSongs && (
          <EmptyContent>
            <AddSongLink variant="outline">{m.songs.page.addFirstSong}</AddSongLink>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  const listHref = urlWith(withoutSong(searchParams));

  // The list-detail layout: the list is the main part, the open song a card
  // next to it. Small screens show the song alone, with a back link.
  return (
    <ListDetail
      title={m.common.nav.songs}
      rootHref={listHref}
      open={selected !== null}
      size="primary"
      header={false}
      nav={
        // `data-list-detail-nav`: the list of the layout (see `src/components/list-detail.tsx`).
        <div data-list-detail-nav className="flex flex-col">
          <ListPaneHeader
            title={m.common.nav.songs}
            heading
            details={
              <span aria-live="polite">
                {filtered
                  ? plural(m.songs.browser.matchCount, total)
                  : formatSongCount(i18n, total)}
              </span>
            }
            actions={
              <>
                {canEditSongs && (
                  <Link
                    href="/munkater/enektar/jogi-javaslatok"
                    className={buttonVariants({ variant: "outline", className: "rounded-full" })}
                    aria-label={
                      rightsProposals > 0
                        ? plural(m.songRights.songsLink, rightsProposals)
                        : m.songRights.songsLinkNone
                    }
                  >
                    <ScaleIcon />
                    {/* Phones: the icon and the count only, so the header stays on one line. */}
                    <span className="max-sm:hidden">
                      {rightsProposals > 0
                        ? plural(m.songRights.songsLink, rightsProposals)
                        : m.songRights.songsLinkNone}
                    </span>
                    {rightsProposals > 0 && <span className="sm:hidden">{rightsProposals}</span>}
                  </Link>
                )}
                {canEditSongs && <AddSongLink>{m.songs.page.addSong}</AddSongLink>}
              </>
            }
          />
          {(filtered || total > 0) && (
            <SongFilterBar
              filters={optimisticFilters}
              sort={optimisticSort}
              options={options}
              filterAction={filterAction}
            />
          )}
          <div
            aria-busy={isPending || isLoading || undefined}
            className={cn(
              "flex flex-1 flex-col transition-opacity",
              (isPending || isLoading) && "opacity-50",
            )}
          >
            {content}
          </div>
        </div>
      }
    >
      {selected ? (
        <>
          <PageHeader
            title={selected.title}
            back={{
              href: listHref,
              label: m.common.nav.songs,
              // The song is on the page: only the URL changes (see `select`).
              onClick: (event) => {
                event.preventDefault();
                select(null);
              },
            }}
            actions={
              canEditSongs && (
                <EditSongLink songId={selected.id} iconOnly songTitle={selected.title} />
              )
            }
            className="lg:hidden"
          />
          <div className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="hidden justify-end gap-1 lg:flex">
              {canEditSongs && <EditSongLink songId={selected.id} />}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={m.songs.browser.closeDetails}
                title={m.songs.browser.closeDetails}
                onClick={() => select(null)}
              >
                <XIcon />
              </Button>
            </div>
            <SongDetails
              key={selected.id}
              song={selected}
              sheetFrom={urlWith(searchParams)}
              tagHref={tagHref}
              canAddToEvent={canEditEvents}
              onDelete={canEditSongs ? () => select(null) : undefined}
              files={files}
            />
          </div>
        </>
      ) : (
        // `data-list-detail-choose`: hidden next to an empty list (see `globals.css`).
        <Empty data-list-detail-choose>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MousePointerClickIcon />
            </EmptyMedia>
            <EmptyTitle>{m.songs.browser.noSelection.title}</EmptyTitle>
            <EmptyDescription>{m.songs.browser.noSelection.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </ListDetail>
  );
}

/** The query without the open song: the list. */
function withoutSong(params: URLSearchParams | ReadonlyURLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  next.delete("song");
  return next;
}

function Pagination({
  result,
  pageHref,
}: {
  result: SongPageDTO;
  pageHref: (page: number) => string;
}) {
  const { m, format } = useI18n();
  const { page, pageCount, total } = result;
  if (pageCount <= 1) return null;

  const first = (page - 1) * SONGS_PAGE_SIZE + 1;
  const last = Math.min(page * SONGS_PAGE_SIZE, total);

  return (
    <nav
      aria-label={m.songs.browser.pagination.label}
      className="flex items-center justify-between gap-4 border-t px-4 py-3 sm:px-6"
    >
      <p className="text-sm text-muted tabular-nums">
        {format(m.songs.browser.pagination.range, { first, last, total })}
      </p>
      <div className="flex items-center gap-2">
        <PageLink
          href={page > 1 ? pageHref(page - 1) : null}
          label={m.songs.browser.pagination.previous}
        >
          <ChevronLeftIcon />
        </PageLink>
        <span className="text-sm tabular-nums">
          {format(m.songs.browser.pagination.page, { page, pageCount })}
        </span>
        <PageLink
          href={page < pageCount ? pageHref(page + 1) : null}
          label={m.songs.browser.pagination.next}
        >
          <ChevronRightIcon />
        </PageLink>
      </div>
    </nav>
  );
}

/** A null `href` shows a disabled link, e.g. "Previous page" on page 1. */
function PageLink({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const className = buttonVariants({ variant: "outline", size: "icon-sm" });
  if (!href) {
    return (
      <span
        role="link"
        aria-disabled="true"
        aria-label={label}
        className={cn(className, "pointer-events-none opacity-50")}
      >
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={className}>
      {children}
    </Link>
  );
}

function SongList({
  songs,
  snippets,
  query,
  selectedId,
  onSelect,
  canEditSongs,
}: {
  songs: SongListItemDTO[];
  /** By song id: the lyrics that match the search. */
  snippets: Record<string, SongSnippetDTO>;
  /** The search text. A row shows the songbook when it matches. */
  query: string | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
  canEditSongs: boolean;
}) {
  const { m } = useI18n();
  const noteNames = useNoteNames();

  return (
    <ul className="divide-y">
      {songs.map((song) => {
        const isSelected = song.id === selectedId;
        // The default arrangement is first.
        const songbook = query ? matchingSongbook(song, query) : null;
        const details = [
          song.artist,
          songbook,
          ...(song.arrangements[0] ? arrangementDetails(song.arrangements[0], noteNames) : []),
        ]
          .filter(Boolean)
          .join(m.common.separator);
        return (
          <li
            key={song.id}
            className={cn(
              "flex items-center transition-colors select-none hover:bg-surface-sunken/60 pointer-coarse:active:bg-surface-sunken",
              isSelected && "bg-surface-sunken hover:bg-surface-sunken",
            )}
          >
            <button
              type="button"
              aria-current={isSelected ? "true" : undefined}
              onClick={() => onSelect(song.id)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left transition-colors outline-none focus-visible:bg-surface-sunken focus-visible:ring-3 focus-visible:ring-focus/50 focus-visible:ring-inset sm:px-6",
                canEditSongs && "pr-2 sm:pr-2",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate font-medium">{song.title}</p>
                  {song.tags.length > 0 && <RowTags tags={song.tags} />}
                </div>
                <p className="truncate text-sm text-muted">
                  {details || m.songs.browser.noArtistOrDetails}
                </p>
                {snippets[song.id] && <Snippet snippet={snippets[song.id]!} />}
              </div>
              <span className="shrink-0 text-xs text-muted">
                {song.plays.recentEvents[0]
                  ? rich(m.songs.browser.lastPlayed, {
                      date: () => (
                        <LocalDateTime
                          date={song.plays.recentEvents[0]!.startsAt}
                          options={{ dateStyle: "medium" }}
                        />
                      ),
                    })
                  : m.songs.browser.neverPlayed}
              </span>
            </button>
            {/* Next to the row button, not in it: a link in a button is not valid HTML. */}
            {canEditSongs && (
              <div className="shrink-0 pr-4 sm:pr-6">
                <EditSongLink songId={song.id} songTitle={song.title} iconOnly />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const ROW_TAGS_MAX = 2;

/** The first tags of a song in a row of the list, and the number of the others. */
function RowTags({ tags }: { tags: string[] }) {
  const { m, format } = useI18n();
  const more = tags.length - ROW_TAGS_MAX;

  return (
    <span className="flex min-w-0 shrink items-center gap-1">
      {tags.slice(0, ROW_TAGS_MAX).map((tag) => (
        <span
          key={tag}
          className="truncate rounded-control bg-surface-sunken px-1.5 py-0.5 text-xs text-text"
        >
          {tag}
        </span>
      ))}
      {more > 0 && (
        <span className="shrink-0 text-xs text-muted">
          {format(m.songs.browser.moreTags, { count: more })}
        </span>
      )}
    </span>
  );
}

/** The lyrics that match the search, with the search words highlighted. */
function Snippet({ snippet }: { snippet: SongSnippetDTO }) {
  const { m } = useI18n();

  return (
    <p className="mt-1 line-clamp-2 text-sm">
      <TextQuoteIcon aria-hidden className="mr-1.5 inline size-3.5 align-[-0.125rem] text-muted" />
      {snippet.arrangementName && (
        <span className="text-muted">
          {snippet.arrangementName}
          {m.common.separator}
        </span>
      )}
      {snippet.parts.map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-sm bg-warning-soft px-0.5 text-text">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  );
}

/** Only for song admins and superadmins. */
function EditSongLink({
  songId,
  songTitle,
  iconOnly,
}: {
  songId: string;
  songTitle?: string;
  iconOnly?: boolean;
}) {
  const { m, format } = useI18n();
  const href = `/munkater/enektar/${songId}/szerkesztes`;
  if (iconOnly) {
    return (
      <Link
        href={href}

        aria-label={
          songTitle
            ? format(m.songs.browser.editSongTitle, { title: songTitle })
            : m.songs.browser.editSong
        }
        title={m.songs.browser.editSong}
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
      >
        <PencilIcon />
      </Link>
    );
  }
  return (
    <Link href={href} className={buttonVariants({ variant: "outline", size: "sm" })}>
      <PencilIcon />
      {m.common.actions.edit}
    </Link>
  );
}

/**
 * `sheetFrom`: the page that the sheet's close button goes back to, with its
 * search and filters. With `onDelete` (only for song admins and superadmins)
 * it shows the delete button, and calls `onDelete` after the delete.
 */
function SongDetails({
  song,
  sheetFrom,
  tagHref,
  canAddToEvent: _canAddToEvent,
  onDelete,
  files,
}: {
  song: SongListItemDTO;
  sheetFrom: string;
  /** The song list with the tag filter. */
  tagHref: (tag: string) => string;
  /** Shows "Add to event" for each arrangement. */
  canAddToEvent: boolean;
  onDelete?: () => void;
  /** The file modules that are on (`ws.music.songs.*`). */
  files: SongFileModules;
}) {
  const { m, format, plural } = useI18n();
  const noteNames = useNoteNames();
  const attachmentDetails = useAttachmentDetails();
  // An image without pages (all its uploads failed) has nothing to show.
  const images = song.images.filter((image) => image.pages.length > 0);

  return (
    <article className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-semibold tracking-tight">{song.title}</h2>
        <p className="text-sm text-muted">{song.artist ?? m.songs.browser.details.noArtist}</p>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{m.songs.browser.details.tags}</h3>
        {song.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {song.tags.map((tag) => (
              <li key={tag}>
                <Link
                  href={tagHref(tag)}
                  title={format(m.songs.browser.details.filterByTag, { tag })}
                  className="inline-flex h-7 items-center rounded-control bg-surface-sunken px-2.5 text-[0.8rem] text-text transition-colors hover:bg-surface-sunken/70"
                >
                  {tag}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{m.songs.browser.details.noTags}</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{m.songs.browser.details.authors}</h3>
        {song.authors ? (
          <p className="text-sm">{song.authors}</p>
        ) : (
          <p className="text-sm text-muted">{m.songs.browser.details.noAuthors}</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{m.songs.browser.details.rights}</h3>
        <div className="flex flex-col gap-1">
          <p className="text-sm">{m.songs.rightsStatuses[song.rightsStatus]}</p>
          {song.originalTitle && (
            <p className="text-sm text-muted">
              {format(m.songs.browser.details.originalTitle, { title: song.originalTitle })}
            </p>
          )}
          {song.translator && (
            <p className="text-sm text-muted">
              {format(m.songs.browser.details.translator, { name: song.translator })}
            </p>
          )}
          {song.rightsNote ? (
            <p className="text-sm whitespace-pre-line">{song.rightsNote}</p>
          ) : (
            <p className="text-sm text-muted">{m.songs.browser.details.noRightsNote}</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{m.songs.browser.details.songbook}</h3>
        {song.songbook ? (
          <p className="text-sm">{song.songbook}</p>
        ) : (
          <p className="text-sm text-muted">{m.songs.browser.details.noSongbook}</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{m.songs.browser.details.copyright}</h3>
        {song.copyright ? (
          <p className="text-sm whitespace-pre-line">{song.copyright}</p>
        ) : (
          <p className="text-sm text-muted">{m.songs.browser.details.noCopyright}</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{m.songs.browser.details.arrangements}</h3>
        {song.arrangements.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-card border">
            {song.arrangements.map((arrangement) => {
              const details = arrangementDetails(arrangement, noteNames);
              // After the key.
              if (arrangement.otherKeys.length > 0) {
                const keys = arrangement.otherKeys
                  .map((key) => fromEnglish(key, noteNames))
                  .join(", ");
                details.splice(1, 0, format(m.songs.browser.details.otherKeys, { keys }));
              }
              return (
                <li key={arrangement.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {arrangement.name}
                      {arrangement.isDefault && (
                        <span className="rounded-control bg-surface-sunken px-1.5 py-0.5 text-xs font-normal text-text">
                          {m.songs.browser.details.default}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted">
                      {details.length > 0
                        ? details.join(m.common.separator)
                        : m.songs.browser.details.noDetails}
                    </p>
                  </div>
                  {files.sheet && (
                    <Link
                      href={sheetHref(arrangement.id, sheetFrom)}
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "shrink-0",
                      })}
                    >
                      <FileMusicIcon />
                      {m.songs.browser.details.sheet}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">{m.songs.browser.details.noArrangements}</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{m.songs.browser.details.history}</h3>
        {song.plays.recentEvents.length === 0 && song.plays.nextEvent === null ? (
          <p className="text-sm text-muted">{m.songs.browser.details.noPlays}</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              {song.plays.recentCount > 0
                ? plural(m.songs.browser.details.recentCount, song.plays.recentCount)
                : m.songs.browser.details.noRecentPlays}
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {song.plays.nextEvent && (
                <li>
                  <span className="text-muted">{m.songs.browser.details.planned}: </span>
                  <a className="underline" href={`/munkater/esemenyek/${song.plays.nextEvent.id}`}>
                    {song.plays.nextEvent.title}
                  </a>{" "}
                  <LocalDateTime
                    date={song.plays.nextEvent.startsAt}
                    options={{ dateStyle: "medium" }}
                  />
                </li>
              )}
              {song.plays.recentEvents.map((event) => (
                <li key={event.id}>
                  <a className="underline" href={`/munkater/esemenyek/${event.id}`}>
                    {event.title}
                  </a>{" "}
                  <LocalDateTime date={event.startsAt} options={{ dateStyle: "medium" }} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {files.scores && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{m.songs.browser.details.scores}</h3>
          {song.scores.length > 0 ? (
            // The sheet of an arrangement shows them.
            <ul className="flex flex-wrap gap-1.5">
              {song.scores.map((score) => (
                <li key={score.id} className="rounded-control border px-2 py-0.5 text-sm">
                  {score.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{m.songs.browser.details.noScores}</p>
          )}
        </section>
      )}

      {files.pdfs && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{m.songs.browser.details.pdfs}</h3>
          {song.pdfs.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-card border">
              {song.pdfs.map((pdf) => (
                <li key={pdf.id}>
                  <Link
                    href={pdfHref(pdf.id, sheetFrom)}

                    className="flex items-center gap-2 px-3 py-2 transition-colors select-none hover:bg-surface-sunken/50 pointer-coarse:active:bg-surface-sunken"
                  >
                    <FileTextIcon aria-hidden className="size-4 shrink-0 text-muted" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium">{pdf.name}</span>
                      <span className="truncate text-sm text-muted">
                        {attachmentDetails(pdf, song.arrangements)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{m.songs.browser.details.noPdfs}</p>
          )}
        </section>
      )}

      {files.images && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{m.songs.browser.details.images}</h3>
          {images.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-card border">
              {images.map((image) => (
                <li key={image.id}>
                  <Link
                    href={imageHref(image.id, sheetFrom)}

                    className="flex items-center gap-2 px-3 py-2 transition-colors select-none hover:bg-surface-sunken/50 pointer-coarse:active:bg-surface-sunken"
                  >
                    <ImageIcon aria-hidden className="size-4 shrink-0 text-muted" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium">{image.name}</span>
                      <span className="truncate text-sm text-muted">
                        {plural(m.songs.browser.details.imagePages, image.pages.length)}
                        {m.common.separator}
                        {attachmentDetails(image, song.arrangements)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{m.songs.browser.details.noImages}</p>
          )}
        </section>
      )}

      {files.soundFiles && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{m.songs.browser.details.soundFiles}</h3>
          {song.soundFiles.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-card border">
              {song.soundFiles.map((soundFile) => (
                <li key={soundFile.id} className="px-3 py-2">
                  <SoundFilePlayer
                    file={soundFile}
                    details={attachmentDetails(soundFile, song.arrangements)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{m.songs.browser.details.noSoundFiles}</p>
          )}
        </section>
      )}

      {files.links && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{m.songs.browser.details.links}</h3>
          {song.links.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-card border">
              {song.links.map((link) => (
                <li key={link.id}>
                  <SongLinkAnchor
                    link={link}
                    details={attachmentDetails(link, song.arrangements)}
                    className="px-3 py-2"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{m.songs.browser.details.noLinks}</p>
          )}
        </section>
      )}

      {onDelete && (
        <div className="border-t pt-4">
          {/* The key clears the error of another song. */}
          <DeleteSongButton
            key={song.id}
            songId={song.id}
            title={song.title}
            variant="ghost"
            onDeleted={onDelete}
          />
        </div>
      )}
    </article>
  );
}
