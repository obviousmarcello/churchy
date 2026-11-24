"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";

import { useNoteNames } from "@/components/music/note-names";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { Label } from "@/components/music/ui/label";
import { NativeSelect } from "@/components/music/ui/native-select";
import { useI18n } from "@/i18n/music/client";
import { fromEnglish } from "@/lib/music/chords/notation";
import {
  BPM_MAX,
  BPM_MIN,
  DEFAULT_SONG_SORT,
  SONG_FILTER_PARAMS,
  SONG_SORTS,
  SORT_PARAM,
  hasSongFilters,
  type SongFilters,
  type SongSort,
} from "@/lib/music/song-filters";
import { tagKey } from "@/lib/music/song-tags";
import { cn } from "@/lib/music/utils";
import type { SongFilterOptionsDTO } from "@/server/music/models/songs";

const TYPING_DELAY_MS = 300;

/** Changes URL params: a value sets the param, an empty string removes it. */
export type FilterChangeAction = (changes: Record<string, string>) => void;

export function SongFilterBar({
  filters,
  sort,
  options,
  filterAction,
}: {
  /** The filters of the current page, from the server. */
  filters: SongFilters;
  sort: SongSort;
  options: SongFilterOptionsDTO;
  filterAction: FilterChangeAction;
}) {
  const { m } = useI18n();
  const noteNames = useNoteNames();
  const [query, setQuery] = useTypedFilter(filters.query ?? "", normalizeText, (value) =>
    filterAction({ [SONG_FILTER_PARAMS.query]: value }),
  );
  const [bpmMin, setBpmMin] = useTypedFilter(String(filters.bpmMin ?? ""), normalizeBpm, (value) =>
    filterAction({ [SONG_FILTER_PARAMS.bpmMin]: value }),
  );
  const [bpmMax, setBpmMax] = useTypedFilter(String(filters.bpmMax ?? ""), normalizeBpm, (value) =>
    filterAction({ [SONG_FILTER_PARAMS.bpmMax]: value }),
  );

  // The tag filter matches in any case: the option with the same key.
  const urlTag = filters.tag;
  const tag = urlTag
    ? (options.tags.find((option) => tagKey(option) === tagKey(urlTag)) ?? urlTag)
    : "";
  const showTags = options.tags.length > 0 || tag !== "";

  function clearFilters() {
    filterAction(Object.fromEntries(Object.values(SONG_FILTER_PARAMS).map((name) => [name, ""])));
  }

  return (
    // The fields go in one row when the list has room, not when the window has: the details panel takes room too.
    <search className="@container flex flex-col gap-3 border-b px-4 py-3 sm:px-6">
      <div className="flex flex-col gap-3 @md:flex-row">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            aria-label={m.songs.filters.search}
            placeholder={m.songs.filters.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={100}
            className="pl-8"
          />
        </div>
        {/* The default sort is not in the URL. */}
        <NativeSelect
          aria-label={m.songs.filters.sort}
          className="@md:w-56"
          value={sort}
          onChange={(event) => {
            const value = event.target.value;
            filterAction({ [SORT_PARAM]: value === DEFAULT_SONG_SORT ? "" : value });
          }}
        >
          {SONG_SORTS.map((value) => (
            <option key={value} value={value}>
              {m.songs.filters.sorts[value]}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div
        className={cn("grid grid-cols-2 gap-3", showTags ? "@2xl:grid-cols-5" : "@2xl:grid-cols-4")}
      >
        {showTags && (
          <FilterField label={m.songs.filters.tag} htmlFor="filter-tag">
            <NativeSelect
              id="filter-tag"
              value={tag}
              onChange={(event) => filterAction({ [SONG_FILTER_PARAMS.tag]: event.target.value })}
            >
              <option value="">{m.songs.filters.anyTag}</option>
              {withCurrent(options.tags, tag).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </NativeSelect>
          </FilterField>
        )}
        <FilterField label={m.songs.filters.key} htmlFor="filter-key">
          <NativeSelect
            id="filter-key"
            value={filters.key ?? ""}
            onChange={(event) => filterAction({ [SONG_FILTER_PARAMS.key]: event.target.value })}
          >
            <option value="">{m.songs.filters.anyKey}</option>
            {/* The values are English note names, as in the URL. */}
            {withCurrent(options.keys, filters.key).map((key) => (
              <option key={key} value={key}>
                {fromEnglish(key, noteNames)}
              </option>
            ))}
          </NativeSelect>
        </FilterField>
        <FilterField label={m.songs.filters.timeSignature} htmlFor="filter-time">
          <NativeSelect
            id="filter-time"
            value={filters.timeSignature ?? ""}
            onChange={(event) =>
              filterAction({ [SONG_FILTER_PARAMS.timeSignature]: event.target.value })
            }
          >
            <option value="">{m.songs.filters.any}</option>
            {withCurrent(options.timeSignatures, filters.timeSignature).map((timeSignature) => (
              <option key={timeSignature} value={timeSignature}>
                {timeSignature}
              </option>
            ))}
          </NativeSelect>
        </FilterField>
        <FilterField label={m.songs.filters.minBpm} htmlFor="filter-bpm-min">
          <Input
            id="filter-bpm-min"
            type="number"
            inputMode="numeric"
            min={BPM_MIN}
            max={BPM_MAX}
            step={1}
            placeholder={m.songs.filters.any}
            value={bpmMin}
            onChange={(event) => setBpmMin(event.target.value)}
            aria-invalid={normalizeBpm(bpmMin) === null || undefined}
          />
        </FilterField>
        <FilterField label={m.songs.filters.maxBpm} htmlFor="filter-bpm-max">
          <Input
            id="filter-bpm-max"
            type="number"
            inputMode="numeric"
            min={BPM_MIN}
            max={BPM_MAX}
            step={1}
            placeholder={m.songs.filters.any}
            value={bpmMax}
            onChange={(event) => setBpmMax(event.target.value)}
            aria-invalid={normalizeBpm(bpmMax) === null || undefined}
          />
        </FilterField>
      </div>

      {hasSongFilters(filters) && (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            <XIcon />
            {m.songs.filters.clear}
          </Button>
        </div>
      )}
    </search>
  );
}

function FilterField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** A value from the URL that has no option yet, e.g. from an old shared link. */
function withCurrent(values: string[], current: string | undefined): string[] {
  return current && !values.includes(current) ? [...values, current] : values;
}

function normalizeText(value: string): string {
  return value.trim() ? value : "";
}

/** Empty gives "", an invalid tempo gives null (no change to the URL). */
function normalizeBpm(value: string): string | null {
  const text = value.trim();
  if (!text) return "";
  const bpm = Number(text);
  return Number.isInteger(bpm) && bpm >= BPM_MIN && bpm <= BPM_MAX ? String(bpm) : null;
}

/**
 * The value of a text field that changes the URL when the user stops typing.
 * A change to the URL from somewhere else (e.g. "Clear filters" or the back
 * button) replaces the value in the field.
 */
function useTypedFilter(
  urlValue: string,
  normalize: (value: string) => string | null,
  commit: (value: string) => void,
): [string, (value: string) => void] {
  const [value, setValue] = useState(urlValue);
  const [committed, setCommitted] = useState(urlValue);
  const [lastUrlValue, setLastUrlValue] = useState(urlValue);

  if (urlValue !== lastUrlValue) {
    setLastUrlValue(urlValue);
    if (urlValue !== committed) {
      setValue(urlValue);
      setCommitted(urlValue);
    }
  }

  const onCommit = useEffectEvent(commit);
  useEffect(() => {
    const next = normalize(value);
    if (next === null || next === committed) return;
    const timer = setTimeout(() => {
      setCommitted(next);
      onCommit(next);
    }, TYPING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value, committed, normalize]);

  return [value, setValue];
}
