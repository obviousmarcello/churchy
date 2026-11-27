"use client";

import { useRef } from "react";
import { Menu } from "@base-ui/react/menu";
import { EllipsisVerticalIcon } from "lucide-react";

import { Button } from "@/components/music/ui/button";

/** An action of a `RowMenu`. */
export type RowMenuItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
};

/**
 * The ⋮ button with more actions of a row, e.g. of an item or of a block. An
 * action runs after the menu closes and gave the focus back to its button, so
 * the action can move the focus, e.g. into a picker.
 */
export function RowMenu({
  label,
  items,
  dataKey,
}: {
  /** The label of the button, e.g. "More actions for {title}". */
  label: string;
  items: RowMenuItem[];
  /** The key of the row on the button (`data-row-menu`), e.g. to give it the focus back. */
  dataKey?: string;
}) {
  const chosen = useRef<RowMenuItem | null>(null);

  return (
    <Menu.Root
      onOpenChangeComplete={(open) => {
        if (open) return;
        const item = chosen.current;
        chosen.current = null;
        item?.onSelect();
      }}
    >
      <Menu.Trigger
        data-row-menu={dataKey}
        render={
          <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} />
        }
      >
        <EllipsisVerticalIcon aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" collisionPadding={8} className="z-50">
          <Menu.Popup className="min-w-48 origin-[var(--transform-origin)] rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {items.map((item) => (
              <Menu.Item
                key={item.id}
                onClick={() => {
                  chosen.current = item;
                }}
                className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
