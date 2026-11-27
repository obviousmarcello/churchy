"use client";

import { useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, TextIcon, XIcon } from "lucide-react";

import { UserAvatar, type AvatarPerson } from "@/components/music/user-avatar";
import { useI18n } from "@/i18n/music/client";
import { personName } from "@/lib/music/format";
import { matchesSearch } from "@/lib/music/search-text";

type PersonGroup = { label: string; items: AvatarPerson[] };

/** The id of the item of the list that adds the typed text (see `freeText`). Not a user id. */
const TEXT_ITEM_ID = "free-text";

/**
 * A field with the selected people as chips, and a search list to add more:
 * type a part of a name (or of an email, for superadmins), then pick a
 * person with a click or Enter. A selected person in the list has a check: a
 * second pick removes them, as the ✕ of the chip and Backspace in the empty
 * field. The order of the chips is the order of the picks. With
 * `suggested`, the list shows these people first, in a group of their own.
 * With `freeText`, the list also offers the typed text, e.g. "Sign up at
 * Gábor", in place of the people: the field has people or a text, not both.
 */
export function PeoplePicker({
  options,
  value,
  onChange,
  known,
  label,
  placeholder,
  removeLabel,
  max,
  suggested,
  freeText,
}: {
  /** The people to pick, by name. */
  options: AvatarPerson[];
  /** The ids of the selected people. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** The selected people that are not in `options`, e.g. users without a display name. */
  known: ReadonlyMap<string, AvatarPerson>;
  /** The label of the field and of the list. */
  label: string;
  placeholder: string;
  /** The label of the ✕ of a chip, e.g. "Remove Anna from Music". */
  removeLabel: (name: string) => string;
  /** The most people. Then the list adds no more. */
  max: number;
  /** E.g. the people of the area in a template: `label` above them, `othersLabel` above the others. */
  suggested?: { ids: ReadonlySet<string>; label: string; othersLabel: string };
  /** A text in place of the people (null: none). A pick of a person removes it, and a text removes the people. */
  freeText?: { value: string | null; onChange: (text: string | null) => void; maxLength: number };
}) {
  const i18n = useI18n();
  const t = i18n.m.components.peoplePicker;
  const chips = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const typed = query.trim();
  const byId = new Map([...known, ...options.map((person) => [person.id, person] as const)]);
  const selected = value.map(
    (id) => byId.get(id) ?? { id, displayName: null, email: null, avatarUrl: null },
  );
  const full = value.length >= max;
  const text = (person: AvatarPerson) => personName(person, i18n);
  const groups: PersonGroup[] | null = suggested
    ? [
        { label: suggested.label, items: options.filter((person) => suggested.ids.has(person.id)) },
        {
          label: suggested.othersLabel,
          items: options.filter((person) => !suggested.ids.has(person.id)),
        },
      ].filter((group) => group.items.length > 0)
    : null;
  // The typed text, after the people: Enter picks a matching person first.
  const textItem: AvatarPerson | null =
    freeText && typed
      ? {
          id: TEXT_ITEM_ID,
          displayName: typed.slice(0, freeText.maxLength),
          email: null,
          avatarUrl: null,
        }
      : null;
  const items = groups
    ? [...groups, ...(textItem ? [{ label: t.textGroup, items: [textItem] }] : [])]
    : [...options, ...(textItem ? [textItem] : [])];

  const pick = (people: AvatarPerson[]) => {
    const textPick = people.find((person) => person.id === TEXT_ITEM_ID);
    if (textPick && freeText) {
      freeText.onChange(textPick.displayName);
      onChange([]);
      setQuery("");
      return;
    }
    if (freeText?.value != null && people.length > 0) freeText.onChange(null);
    onChange(people.map((person) => person.id).slice(0, max));
  };

  const item = (person: AvatarPerson) =>
    person.id === TEXT_ITEM_ID ? (
      <Combobox.Item
        key={TEXT_ITEM_ID}
        value={person}
        className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-surface-sunken"
      >
        <TextIcon className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 break-words">
          {i18n.format(t.useText, { text: person.displayName ?? "" })}
        </span>
      </Combobox.Item>
    ) : (
      <Combobox.Item
        key={person.id}
        value={person}
        disabled={full && !value.includes(person.id)}
        className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-disabled:opacity-50 data-highlighted:bg-surface-sunken"
      >
        <UserAvatar person={person} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{text(person)}</span>
          {person.displayName && person.email && (
            <span className="truncate text-xs text-muted">{person.email}</span>
          )}
        </span>
        <Combobox.ItemIndicator>
          <CheckIcon className="size-4 text-muted" />
        </Combobox.ItemIndicator>
      </Combobox.Item>
    );

  return (
    <Combobox.Root
      multiple
      items={items}
      value={selected}
      onValueChange={pick}
      inputValue={query}
      onInputValueChange={setQuery}
      itemToStringLabel={text}
      isItemEqualToValue={(a, b) => a.id === b.id}
      filter={(person: AvatarPerson, search: string) =>
        person.id === TEXT_ITEM_ID || matchesSearch(`${text(person)} ${person.email ?? ""}`, search)
      }
      autoHighlight
    >
      <Combobox.Chips
        ref={chips}
        className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-input-background p-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
      >
        <Combobox.Value>
          {(people: AvatarPerson[]) => (
            <>
              {freeText?.value != null && (
                <span className="flex max-w-full min-w-0 items-center gap-1.5 rounded-full border bg-surface py-0.5 pr-0.5 pl-2 text-sm">
                  <TextIcon className="size-3.5 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 break-words italic">{freeText.value}</span>
                  <button
                    type="button"
                    aria-label={t.removeText}
                    onClick={() => freeText.onChange(null)}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-sunken hover:text-text [&_svg]:size-3.5"
                  >
                    <XIcon />
                  </button>
                </span>
              )}
              {people.map((person) => (
                <Combobox.Chip
                  key={person.id}
                  aria-label={text(person)}
                  title={person.displayName && person.email ? person.email : undefined}
                  className="flex max-w-56 items-center gap-1.5 rounded-full border bg-surface py-0.5 pr-0.5 pl-0.5 text-sm outline-none data-highlighted:bg-surface-sunken focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <UserAvatar person={person} size="sm" />
                  <span className="truncate">{text(person)}</span>
                  <Combobox.ChipRemove
                    aria-label={removeLabel(text(person))}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-sunken hover:text-text [&_svg]:size-3.5"
                  >
                    <XIcon />
                  </Combobox.ChipRemove>
                </Combobox.Chip>
              ))}
              <Combobox.Input
                aria-label={label}
                placeholder={
                  people.length === 0 && freeText?.value == null ? placeholder : t.addMore
                }
                maxLength={freeText?.maxLength}
                className="h-7 min-w-28 flex-1 bg-transparent px-1.5 text-base outline-none placeholder:text-muted/70 placeholder:italic md:text-sm"
              />
            </>
          )}
        </Combobox.Value>
      </Combobox.Chips>

      <Combobox.Portal>
        <Combobox.Positioner
          anchor={chips}
          className="z-50 outline-none"
          sideOffset={4}
          collisionPadding={8}
        >
          <Combobox.Popup
            aria-label={label}
            className="w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) rounded-lg border bg-surface-raised p-1 text-text shadow-md transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            <Combobox.Empty>
              <p className="px-2 py-1.5 text-sm text-muted">
                {options.length === 0 ? t.noPeople : t.noMatches}
              </p>
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(18rem,var(--available-height))] overflow-y-auto overscroll-contain outline-none data-empty:hidden">
              {groups
                ? (group: PersonGroup) => (
                    <Combobox.Group
                      key={group.label}
                      items={group.items}
                      className="not-first:mt-1"
                    >
                      <Combobox.GroupLabel className="px-2 py-1 text-xs font-medium text-muted">
                        {group.label}
                      </Combobox.GroupLabel>
                      <Combobox.Collection>{item}</Combobox.Collection>
                    </Combobox.Group>
                  )
                : item}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
