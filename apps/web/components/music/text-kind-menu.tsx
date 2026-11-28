"use client";

import { Menu } from "@base-ui/react/menu";
import { BookOpenIcon, CheckIcon, MessageSquareTextIcon, PresentationIcon } from "lucide-react";

import { useModule } from "@/components/music/app-config";
import { useI18n } from "@/i18n/music/client";

/** The kinds that a text item can change into: they all keep the title and the notes. */
export type TextKind = "text" | "textSlide" | "scripture";

const ICONS = { text: MessageSquareTextIcon, textSlide: PresentationIcon, scripture: BookOpenIcon };

/**
 * The icon of a text item as a button. It opens a list of the kinds of text
 * items, with a mark on the kind of now: a click changes the item into another kind.
 */
export function TextKindMenu({
  kind,
  onChange,
  title,
  textSlides,
}: {
  kind: TextKind;
  onChange: (kind: TextKind) => void;
  /** The title of the item, for the label of the button. */
  title: string;
  /** True: the list has the text slide (only on the event page). */
  textSlides: boolean;
}) {
  const { m, format } = useI18n();
  const t = m.components.textKindMenu;
  const Icon = ICONS[kind];
  const scriptureOn = useModule("scripture");
  const textSlidesOn = useModule("projection.text-slides");
  // The kinds of the modules that are off are not offered.
  const kinds = (["text", "textSlide", "scripture"] as TextKind[]).filter(
    (option) =>
      (option !== "textSlide" || (textSlides && textSlidesOn)) &&
      (option !== "scripture" || scriptureOn),
  );
  const labels = { text: t.text, textSlide: t.textSlide, scripture: t.scripture };

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={format(t.label, { title })}
        title={t.hint}
        // The round mark of an item, as `ITEM_ICON_CLASS` of `setlist-rows.tsx`.
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-text outline-none hover:bg-surface-sunken/70 focus-visible:ring-[3px] focus-visible:ring-focus/50 data-popup-open:ring-2 data-popup-open:ring-focus/40"
      >
        <Icon aria-hidden className="size-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="start" collisionPadding={8} className="z-50">
          <Menu.Popup className="min-w-48 origin-[var(--transform-origin)] rounded-card border bg-surface-raised p-1 text-text shadow-lg outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {/* Base UI also calls `onValueChange` for the kind of now: that is no change, e.g. no question for the live item. */}
            <Menu.RadioGroup
              value={kind}
              onValueChange={(value: TextKind) => value !== kind && onChange(value)}
            >
              {kinds.map((option) => {
                const OptionIcon = ICONS[option];
                return (
                  <Menu.RadioItem
                    key={option}
                    value={option}
                    closeOnClick
                    className="flex cursor-default items-center gap-2 rounded-control px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-surface-sunken [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted"
                  >
                    <OptionIcon />
                    <span className="flex-1">{labels[option]}</span>
                    <Menu.RadioItemIndicator>
                      <CheckIcon />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                );
              })}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
