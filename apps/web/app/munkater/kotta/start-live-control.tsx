"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { RadioIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import { liveSheetHref } from "@/lib/music/next-path";
import { cn } from "@/lib/music/utils";
import {
  startEventLiveSessionAction,
  startRehearsalLiveSessionAction,
} from "./live-actions-client";
import { finalFocusOf, type PopoverControl } from "./sheet-more-menu";

/**
 * How a sheet that is not live can become a live session:
 * - `join`: the event has a running session,
 * - `event`: a volunteer starts the session of the event,
 * - `rehearsal`: the user starts a session for the songs of the sheet, with
 *   the key of each song (null: the key of the chart).
 * `itemId`: the sheet has one setlist slot of the event. The live sheet has
 * all of them, and opens at this one.
 */
export type StartLive =
  | { kind: "join"; sessionId: string; eventId: string; itemId?: string }
  | { kind: "event"; eventId: string; itemId?: string }
  | { kind: "rehearsal"; arrangementIds: string[]; musicalKeys: (string | null)[] };

/**
 * The live session button in the header of a sheet that is not live. It
 * opens a short explanation and the button that starts or joins the session.
 * The live sheet replaces this one; its close button goes back to `backHref`.
 * `control`: the "more" menu opens it.
 */
export function StartLiveControl({
  start,
  backHref,
  control,
  className,
}: {
  start: StartLive;
  backHref: string;
  control?: PopoverControl;
  /** Of the header button. */
  className?: string;
}) {
  const { m } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    if (start.kind === "join") return;
    setError(null);
    startTransition(async () => {
      const result =
        start.kind === "event"
          ? await startEventLiveSessionAction(start.eventId)
          : await startRehearsalLiveSessionAction(start.arrangementIds, start.musicalKeys);
      if (result.status === "success") {
        router.replace(
          liveSheetHref(result.session.id, backHref, start.kind === "event" ? start : undefined),
        );
      } else setError(result.message);
    });
  }

  return (
    <Popover.Root open={control?.open} onOpenChange={control?.onOpenChange}>
      <Popover.Trigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 gap-1.5 px-2 pointer-coarse:h-9", className)}
            aria-label={`${m.sheet.live.badge}: ${m.sheet.live.title}`}
          />
        }
      >
        <RadioIcon />
        {/* The header has room for the text only on large screens. */}
        <span className="hidden xl:inline">{m.sheet.live.badge}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className="z-50"
          anchor={control?.anchor}
          sideOffset={8}
          align="end"
          collisionPadding={8}
        >
          <Popover.Popup
            finalFocus={finalFocusOf(control)}
            className="flex max-h-[var(--available-height)] w-80 max-w-[calc(100vw-1rem)] origin-[var(--transform-origin)] flex-col gap-4 overflow-y-auto rounded-card border bg-surface-raised p-4 text-text shadow-lg outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            <div className="flex flex-col gap-1">
              <Popover.Title className="text-sm font-semibold">{m.sheet.live.title}</Popover.Title>
              <Popover.Description className="text-sm text-muted">
                {start.kind === "join"
                  ? m.sheet.live.joinHint
                  : start.kind === "event"
                    ? m.sheet.live.startEventHint
                    : m.sheet.live.startRehearsalHint}
              </Popover.Description>
            </div>

            {start.kind === "join" ? (
              <Link
                href={liveSheetHref(start.sessionId, backHref, start)}
                replace
                className={buttonVariants({ variant: "default", size: "sm" })}
              >
                <RadioIcon />
                {m.sheet.live.join}
              </Link>
            ) : (
              <Button size="sm" disabled={pending} onClick={run}>
                <RadioIcon />
                {m.sheet.live.start}
              </Button>
            )}

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
