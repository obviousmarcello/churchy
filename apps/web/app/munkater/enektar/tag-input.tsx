"use client";

import { useId, useState } from "react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import { SONG_TAGS_MAX, normalizeTags, tagKey } from "@/lib/music/song-tags";

/**
 * The tags of a song as chips, and a field to add a tag. Enter or a comma
 * adds the typed tag, and Backspace in the empty field removes the last one.
 * The form gets each tag as a `tags` field, also the tag that is still in
 * the field. `options` are the suggestions, e.g. the tags of the other songs.
 */
export function TagInput({
  id,
  defaultTags,
  options,
  invalid,
}: {
  /** The id of the field, for its label. Its description is `${id}-description`. */
  id: string;
  defaultTags: string[];
  options: string[];
  invalid?: boolean;
}) {
  const { m, format } = useI18n();
  const t = m.songs.form;
  const listId = useId();
  const [tags, setTags] = useState(defaultTags);
  const [draft, setDraft] = useState("");
  const full = tags.length >= SONG_TAGS_MAX;
  const used = new Set(tags.map(tagKey));
  const suggestions = options.filter((option) => !used.has(tagKey(option)));

  function add(value: string) {
    setTags((current) => upToMax(normalizeTags([...current, ...value.split(",")])));
    setDraft("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // The Enter of an input method (e.g. Japanese) confirms its text, not the tag.
    if (event.nativeEvent.isComposing) return;
    if ((event.key === "Enter" || event.key === ",") && draft.trim()) {
      // Enter must not submit the form.
      event.preventDefault();
      add(draft);
    } else if (event.key === "Backspace" && !draft && tags.length > 0) {
      event.preventDefault();
      setTags((current) => current.slice(0, -1));
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { value } = event.target;
    // A choice from the suggestions replaces the text: add it at once.
    const native = event.nativeEvent as InputEvent;
    if (native.inputType === "insertReplacementText" || native.inputType === undefined) {
      if (suggestions.some((option) => option === value)) {
        add(value);
        return;
      }
    }
    // A paste of "Christmas, Easter, Advent": the parts before the last comma are tags.
    const last = value.lastIndexOf(",");
    if (last >= 0) {
      setTags((current) =>
        upToMax(normalizeTags([...current, ...value.slice(0, last).split(",")])),
      );
      setDraft(value.slice(last + 1).trimStart());
      return;
    }
    setDraft(value);
  }

  return (
    <div className="flex flex-col gap-2">
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li
              key={tagKey(tag)}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-surface-sunken pr-1 pl-2.5 text-[0.8rem] text-text"
            >
              {tag}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={format(t.removeTag, { tag })}
                onClick={() => setTags((current) => current.filter((other) => other !== tag))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {/* Without tags there is no "tags" field: this tells that the tags are in the form. */}
      <input type="hidden" name="tagsSent" value="true" />
      {upToMax(normalizeTags([...tags, ...draft.split(",")])).map((tag) => (
        <input key={tagKey(tag)} type="hidden" name="tags" value={tag} />
      ))}
      <Input
        id={id}
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={t.tagsPlaceholder}
        disabled={full}
        list={suggestions.length > 0 ? listId : undefined}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        aria-describedby={full ? `${id}-full ${id}-description` : `${id}-description`}
      />
      {/* Why the field is disabled. */}
      {full && (
        <p id={`${id}-full`} className="text-sm text-muted">
          {format(t.tagsFull, { max: SONG_TAGS_MAX })}
        </p>
      )}
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((option) => (
            <option key={tagKey(option)} value={option} />
          ))}
        </datalist>
      )}
    </div>
  );
}

/** The first tags, as many as a song can have. A paste of more tags keeps the first ones. */
function upToMax(tags: string[]): string[] {
  return tags.slice(0, SONG_TAGS_MAX);
}
