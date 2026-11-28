"use client";

import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, type LucideIcon } from "lucide-react";

import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import { matchesSearch } from "@/lib/music/search-text";
import { cn } from "@/lib/music/utils";

/** An option of an `AvatarPicker`. The id null is the "none" option, e.g. "No volunteer". */
export type PickerOption = { id: string | null; label: string };

export type AvatarSize = "sm" | "md";

/**
 * A round button with the avatar of the selected option, in place of a select,
 * e.g. the volunteer of an item. A click opens the options with a search field.
 * An unknown `value` (e.g. a volunteer who left the event) shows as the first option.
 */
export function AvatarPicker<Option extends PickerOption>({
  options,
  value,
  onChange,
  label,
  placeholder,
  avatar,
  defaultOpen = false,
  onOpenChange,
}: {
  /** The "none" option first. */
  options: Option[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** For example "Volunteer of Song": the label of the button and of the list. */
  label: string;
  /** The placeholder of the search field. */
  placeholder: string;
  avatar: (option: Option, size: AvatarSize) => React.ReactNode;
  /** True: the list is open when the picker shows, with the focus in its search field, e.g. after "Set theme…" of a menu. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { m, format } = useI18n();
  const t = m.components.avatarPicker;
  const selected = options.find((option) => option.id === value) ?? options[0];

  return (
    <Combobox.Root
      items={options}
      value={selected}
      onValueChange={(option) => onChange(option?.id ?? null)}
      itemToStringLabel={(option) => option.label}
      isItemEqualToValue={(a, b) => a.id === b.id}
      filter={(option, query) => matchesSearch(option.label, query)}
      autoHighlight
      defaultOpen={defaultOpen}
      onOpenChange={(open) => onOpenChange?.(open)}
    >
      <Combobox.Trigger
        aria-label={format(t.value, { label, value: selected!.label })}
        title={selected!.label}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-focus/50 data-popup-open:ring-3 data-popup-open:ring-focus/30"
      >
        {avatar(selected!, "md")}
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          className="z-50 outline-none"
          align="end"
          sideOffset={4}
          collisionPadding={8}
        >
          <Combobox.Popup
            aria-label={label}
            className="flex w-64 max-w-(--available-width) origin-(--transform-origin) flex-col gap-1 rounded-card border bg-surface-raised p-1 text-text shadow-md transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            <Combobox.Input placeholder={placeholder} render={<Input />} autoFocus={defaultOpen} />
            <Combobox.Empty>
              <p className="px-2 py-1.5 text-sm text-muted">{t.noMatches}</p>
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(16rem,var(--available-height))] overflow-y-auto overscroll-contain outline-none data-empty:hidden">
              {(option: Option) => (
                <Combobox.Item
                  key={option.id ?? ""}
                  value={option}
                  className="flex cursor-default items-center gap-2 rounded-control px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-surface-sunken"
                >
                  {avatar(option, "sm")}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <Combobox.ItemIndicator>
                    <CheckIcon className="size-4 text-muted" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

const EMPTY_SIZES: Record<AvatarSize, string> = {
  sm: "size-6 [&_svg]:size-3.5",
  md: "size-8 [&_svg]:size-4",
};

/** An empty avatar with a dashed border: the "none" option of an `AvatarPicker`. */
export function EmptyAvatar({ icon: Icon, size }: { icon: LucideIcon; size: AvatarSize }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong/50 text-muted",
        EMPTY_SIZES[size],
      )}
    >
      <Icon />
    </span>
  );
}
