"use client";

import { RowMenu, type RowMenuItem } from "@/components/music/row-menu";
import { useI18n } from "@/i18n/music/client";
import type { EventBlock } from "@/lib/music/event-blocks";

/**
 * The header of a block of the items of an event: its name, an optional
 * status (e.g. the countdown) and an optional menu. For the lists of the
 * event page and of the projection controller.
 */
export function BlockHeader({
  block,
  status,
  actions = [],
}: {
  block: EventBlock;
  status?: React.ReactNode;
  actions?: RowMenuItem[];
}) {
  const { m, format } = useI18n();
  const t = m.components.eventBlocks;

  return (
    <>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{block.name}</span>
      {status}
      {actions.length > 0 && (
        <RowMenu label={format(t.actionsOf, { name: block.name })} items={actions} />
      )}
    </>
  );
}
