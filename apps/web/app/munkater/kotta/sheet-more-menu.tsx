"use client";

import { useRef } from "react";
import { Menu } from "@base-ui/react/menu";
import { EllipsisIcon } from "lucide-react";

import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";

// On phones and tablets the header has no room for all its buttons. The "more"
// menu has the ones that are not needed while you play. A popover that the
// menu opens shows at the menu's button, because its own button is hidden.

/**
 * The control of a header popover, for the "more" menu: the viewer opens it.
 * `anchor`: the element that the popover shows at, in place of its own
 * hidden button. Undefined: its own button.
 */
export type PopoverControl = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: HTMLElement | null | undefined;
};

/** The popover gives the focus back to its anchor when it closes. */
export function finalFocusOf(control: PopoverControl | undefined) {
  const anchor = control?.anchor;
  return anchor ? () => anchor : undefined;
}

export type MoreMenuItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  /** A short second line, e.g. the current choice. */
  detail?: string;
  /**
   * True: `onSelect` opens a popover. It runs when the menu is fully closed,
   * so the menu does not take the focus back from the popover.
   */
  opensPopover?: boolean;
  onSelect: () => void;
};

/** The "more" button and its menu. Phones and tablets only (`lg:hidden`). */
export function SheetMoreMenu({
  items,
  buttonRef,
}: {
  items: MoreMenuItem[];
  buttonRef: React.Ref<HTMLButtonElement>;
}) {
  const { m } = useI18n();
  const afterClose = useRef<(() => void) | null>(null);

  return (
    <Menu.Root
      onOpenChangeComplete={(open) => {
        if (open) return;
        afterClose.current?.();
        afterClose.current = null;
      }}
    >
      <Menu.Trigger
        ref={buttonRef}
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.sheet.viewer.more}
            title={m.sheet.viewer.more}
            className="lg:hidden"
          />
        }
      >
        <EllipsisIcon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" collisionPadding={8} className="z-50">
          <Menu.Popup className="max-h-[var(--available-height)] max-w-[calc(100vw-1rem)] min-w-56 origin-[var(--transform-origin)] overflow-y-auto rounded-card border bg-surface-raised p-1 text-text shadow-lg outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {items.map((item) => (
              <Menu.Item
                key={item.key}
                onClick={() => {
                  if (item.opensPopover) afterClose.current = item.onSelect;
                  else item.onSelect();
                }}
                className="flex cursor-default items-center gap-3 rounded-control px-2 py-2.5 text-sm outline-none select-none data-highlighted:bg-surface-sunken [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted"
              >
                {item.icon}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{item.label}</span>
                  {item.detail && (
                    <span className="truncate text-xs text-muted">{item.detail}</span>
                  )}
                </span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
