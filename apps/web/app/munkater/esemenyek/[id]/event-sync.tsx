"use client";

import { useRouter } from "next/navigation";

import { useEventChanges } from "@/components/music/event-changes";
import type { EventConnectionDTO } from "@/server/music/models/event-sync";

/**
 * Keeps the event page in sync: after a change of the event from another user or tab (the database
 * sends a message, see `notify_event`) the page loads again. Without a connection (the demo) it polls.
 * Renders nothing.
 */
export function EventSync({
  eventId,
  connection,
}: {
  eventId: string;
  connection: EventConnectionDTO | null;
}) {
  const router = useRouter();
  useEventChanges(eventId, connection?.connection ?? null, (changes) => {
    // The live session changes do not change the page.
    if (changes.some((change) => change.kind !== "live")) router.refresh();
  });
  return null;
}
