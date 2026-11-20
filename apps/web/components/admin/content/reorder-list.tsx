"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { ItemOutcome } from "@/server/content-save";
import type { PolicyResult } from "@/server/policy";

export interface ReorderItem {
  id: string;
  /** Plain name for the accessible labels of the move buttons. */
  name: string;
  /** The row's content (links, badges, delete button), rendered on the server. */
  content: ReactNode;
}

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/**
 * Ordered list with drag-and-drop (D-21 AC3) and, for keyboards and touch, move up / down
 * buttons. The new order is saved at once through the policy-wrapped `onReorder`.
 */
export function ReorderList({
  items,
  onReorder,
  disabled = false,
  caption,
  testId,
}: {
  items: readonly ReorderItem[];
  onReorder: (ids: string[]) => Promise<PolicyResult<ItemOutcome>>;
  /** Ordering is switched off while the list is filtered. */
  disabled?: boolean;
  caption: string;
  testId?: string;
}) {
  const t = useT("admin.content.reorder");
  const router = useRouter();
  const [order, setOrder] = useState(items.map((i) => i.id));
  const [dragging, setDragging] = useState<number | null>(null);
  const [status, setStatus] = useState<"saved" | "failed" | null>(null);
  const [source, setSource] = useState(items);
  // Follow the server's list after a refresh.
  if (source !== items) {
    setSource(items);
    setOrder(items.map((i) => i.id));
  }
  const byId = new Map(items.map((i) => [i.id, i]));

  async function apply(next: string[]) {
    setOrder(next);
    const result = await onReorder(next);
    setStatus(result.ok && result.value === "ok" ? "saved" : "failed");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <p className="text-muted">{disabled ? t("disabledHint") : t("hint")}</p>
      <ol aria-label={caption} className="flex flex-col gap-2">
        {order.map((id, index) => {
          const item = byId.get(id);
          if (!item) return null;
          return (
            <li
              key={id}
              draggable={!disabled}
              data-testid="reorder-item"
              data-id={id}
              data-dragging={dragging === index}
              onDragStart={() => setDragging(index)}
              onDragOver={(e) => {
                if (dragging !== null) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null && dragging !== index) {
                  void apply(move(order, dragging, index));
                }
                setDragging(null);
              }}
              onDragEnd={() => setDragging(null)}
              className="flex flex-wrap items-center gap-3 rounded-md border-2 border-border-strong bg-surface-raised p-3 data-[dragging=true]:opacity-50"
            >
              {disabled ? null : (
                <span aria-hidden="true" className="cursor-grab text-muted select-none">
                  ⠿
                </span>
              )}
              <div className="min-w-0 flex-1">{item.content}</div>
              {disabled ? null : (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={index === 0}
                    aria-label={t("up", { name: item.name })}
                    onClick={() => void apply(move(order, index, index - 1))}
                    data-testid="move-up"
                  >
                    <span aria-hidden="true">↑</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={index === order.length - 1}
                    aria-label={t("down", { name: item.name })}
                    onClick={() => void apply(move(order, index, index + 1))}
                    data-testid="move-down"
                  >
                    <span aria-hidden="true">↓</span>
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div role="status" aria-live="polite" className="text-fs-2">
        {status === "saved" ? (
          <span className="font-semibold text-success">{t("saved")}</span>
        ) : null}
        {status === "failed" ? (
          <span className="font-semibold text-danger">{t("failed")}</span>
        ) : null}
      </div>
    </div>
  );
}
