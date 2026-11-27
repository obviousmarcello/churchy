"use client";

import { useState } from "react";
import Link from "next/link";
import { Autocomplete } from "@base-ui/react/autocomplete";
import {
  BookOpenIcon,
  MessageSquarePlusIcon,
  MusicIcon,
  PlusIcon,
  PresentationIcon,
} from "lucide-react";

import { useModule, useScriptureTranslations } from "@/components/music/app-config";
import { isTextRow, type ItemRow } from "@/components/music/setlist-rows";
import { buttonVariants } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { Label } from "@/components/music/ui/label";
import { useI18n } from "@/i18n/music/client";
import { rich } from "@/i18n/music/rich";
import { EVENT_ITEM_TITLE_MAX_LENGTH, looksLikeScriptureReference } from "@/lib/music/event-items";
import { defaultTranslationFor } from "@/lib/music/scripture/translations";
import { matchingSongbook, songMatchesSearch } from "@/lib/music/search-text";
import type { SongWithArrangementsDTO } from "@/server/music/models/songs";

/**
 * A suggestion of the "Add an item" box: a song, or a text item with the
 * typed title. A scripture reading has the typed reference as its title. A
 * text slide has the typed title, and its text comes in its row.
 */
type AddOption =
  | { kind: "song"; song: SongWithArrangementsDTO }
  | { kind: "text"; title: string; scripture: boolean; textSlide: boolean };

function songLabel(song: SongWithArrangementsDTO) {
  return song.artist ? `${song.title} – ${song.artist}` : song.title;
}

/**
 * The "Add an item" box under a list of items: search for a song, or type the
 * title of a text item or the reference of a scripture reading. With
 * `textSlides`, also a text slide. A song can appear more than once: a song
 * that is in the list has a mark. A new row has no volunteer and uses the
 * default arrangement of its song.
 */
export function AddItemBox({
  catalog,
  rows,
  onAdd,
  canAddSongs = true,
  label,
  placeholder,
  autoFocus = false,
  note,
  inputAction,
  textSlides = false,
}: {
  /** Every song with its arrangements, by title. */
  catalog: SongWithArrangementsDTO[];
  /** The rows in the list now. Their songs have a mark in the suggestions. */
  rows: ItemRow[];
  onAdd: (row: ItemRow) => void;
  /** With an empty catalog: true shows a link to the "Add a song" page. */
  canAddSongs?: boolean;
  /** By default "Add an item". */
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** In place of the note about the catalog, e.g. while the catalog loads. */
  note?: React.ReactNode;
  /** A button next to the field, e.g. "New song". It gets the typed text. */
  inputAction?: (query: string) => React.ReactNode;
  /** True: the typed title can also become a text slide (the event page and the quick add of the projection). */
  textSlides?: boolean;
}) {
  const { m, format, locale } = useI18n();
  const scriptureOn = useModule("scripture");
  const textSlidesOn = useModule("projection.text-slides");
  const translations = useScriptureTranslations();
  const t = m.components.addItemBox;
  const [query, setQuery] = useState("");

  const inList = new Set(rows.flatMap((row) => (isTextRow(row) ? [] : [row.songId])));
  const addable = catalog.filter((song) => song.arrangements.length > 0);

  // The matching songs, then the typed text as a text item, as a scripture
  // reading and as a text slide. A text like "John 3:16" puts the scripture
  // reading first.
  const title = query.trim();
  // The kinds of the modules that are off are not offered.
  const textOptions: AddOption[] = title
    ? [
        { kind: "text", title, scripture: false, textSlide: false },
        ...(scriptureOn
          ? [{ kind: "text" as const, title, scripture: true, textSlide: false }]
          : []),
      ]
    : [];
  if (looksLikeScriptureReference(title)) textOptions.reverse();
  if (title && textSlides && textSlidesOn)
    textOptions.push({ kind: "text", title, scripture: false, textSlide: true });
  const options: AddOption[] = [
    ...addable
      .filter((song) => songMatchesSearch(song, title))
      .map((song) => ({ kind: "song" as const, song })),
    ...textOptions,
  ];

  function add(option: AddOption) {
    const key = crypto.randomUUID();
    // The default arrangement comes first.
    onAdd(
      option.kind === "song"
        ? {
            kind: "song",
            key,
            songId: option.song.id,
            arrangementId: option.song.arrangements[0]!.id,
            volunteerId: null,
          }
        : {
            kind: "text",
            key,
            title: option.title,
            notes: "",
            scripture: option.scripture,
            // A scripture reading starts with a translation in the language of the app.
            scriptureTranslation: option.scripture
              ? defaultTranslationFor(locale, translations)
              : null,
            ...(option.textSlide && { textSlide: true, description: "", highlight: "" }),
            volunteerId: null,
          },
    );
    setQuery("");
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="itemToAdd">{label ?? t.addLabel}</Label>
      <Autocomplete.Root
        items={options}
        filteredItems={options}
        value={query}
        onValueChange={(value, details) => setQuery(details.reason === "item-press" ? "" : value)}
        itemToStringValue={(option: AddOption) =>
          option.kind === "song" ? songLabel(option.song) : option.title
        }
        autoHighlight
        openOnInputClick
      >
        {/* A round field with a plus, and round buttons next to it, as the other actions of the items. */}
        <div className="flex gap-2 [&>button]:rounded-full [&>div>button]:rounded-full">
          <div className="relative min-w-0 flex-1">
            <PlusIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            />
            <Autocomplete.Input
              id="itemToAdd"
              placeholder={placeholder ?? t.addPlaceholder}
              maxLength={EVENT_ITEM_TITLE_MAX_LENGTH}
              autoFocus={autoFocus}
              render={
                <Input className="rounded-full border-transparent bg-surface-sunken pl-9 dark:bg-surface-sunken" />
              }
            />
          </div>
          {inputAction?.(title)}
        </div>
        <Autocomplete.Portal>
          {/* As wide as the field, and at least 32rem in the narrow quick add of the projection, for the long suggestions.
              A fixed width: the popup does not jump when the suggestions change. */}
          <Autocomplete.Positioner className="z-50 outline-none" sideOffset={4} align="start">
            <Autocomplete.Popup className="w-[max(var(--anchor-width),min(32rem,var(--available-width)))] max-w-(--available-width) rounded-lg border bg-surface-raised text-text shadow-md">
              <Autocomplete.Empty>
                <p className="px-3 py-2 text-sm text-muted">{t.noMatches}</p>
              </Autocomplete.Empty>
              <Autocomplete.List className="max-h-[min(20rem,var(--available-height))] overflow-y-auto overscroll-contain p-1 outline-none data-empty:p-0">
                {(option: AddOption) => (
                  <Autocomplete.Item
                    key={
                      option.kind === "song"
                        ? option.song.id
                        : option.scripture
                          ? "scripture"
                          : option.textSlide
                            ? "textSlide"
                            : "text"
                    }
                    value={option}
                    onClick={() => add(option)}
                    className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-surface-sunken [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted"
                  >
                    {option.kind === "song" ? (
                      <>
                        <MusicIcon />
                        <span className="min-w-0 truncate">
                          {option.song.title}
                          {option.song.artist && (
                            <span className="text-muted"> – {option.song.artist}</span>
                          )}
                          {/* Why the song matches. */}
                          {matchingSongbook(option.song, title) && (
                            <span className="text-muted">
                              {m.common.separator}
                              {option.song.songbook}
                            </span>
                          )}
                        </span>
                        {inList.has(option.song.id) && (
                          <span className="ml-auto shrink-0 rounded-md bg-surface-sunken px-1.5 py-0.5 text-xs text-muted">
                            {t.inList}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        {option.scripture ? (
                          <BookOpenIcon />
                        ) : option.textSlide ? (
                          <PresentationIcon />
                        ) : (
                          <MessageSquarePlusIcon />
                        )}
                        <span className="min-w-0 truncate">
                          {rich(
                            option.scripture
                              ? t.addScripture
                              : option.textSlide
                                ? t.addTextSlide
                                : t.addTextItem,
                            {
                              // The title goes in after the markup is read, so a title with "<…>" stays text.
                              strong: (chunk) => (
                                <strong className="font-medium">
                                  {format(chunk, { title: option.title })}
                                </strong>
                              ),
                            },
                          )}
                        </span>
                      </>
                    )}
                  </Autocomplete.Item>
                )}
              </Autocomplete.List>
            </Autocomplete.Popup>
          </Autocomplete.Positioner>
        </Autocomplete.Portal>
      </Autocomplete.Root>
      {note !== undefined ? (
        note
      ) : addable.length === 0 ? (
        <p className="text-sm text-muted">
          {canAddSongs
            ? rich(t.noSongs, {
                link: (chunk) => (
                  <Link
                    href="/munkater/enektar/uj"
                    className={buttonVariants({ variant: "link", className: "h-auto p-0" })}
                  >
                    {chunk}
                  </Link>
                ),
              })
            : t.noSongsCannotAdd}
        </p>
      ) : null}
    </div>
  );
}
