"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const REVISION_URL = "/fejlesztes/kimeno-levelek/revizio";

/**
 * Keeps the outbox page live: polls the revision marker a few times per second and re-renders the
 * server component when it changes, so a new message shows up well within a second. Renders
 * nothing; the page announces the live behaviour in text.
 */
export function LiveRefresh({
  revision,
  intervalMs = 400,
}: {
  /** Revision the page was rendered with. */
  revision: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const known = useRef(revision);

  useEffect(() => {
    known.current = revision;
  }, [revision]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch(REVISION_URL, { cache: "no-store" });
          if (response.ok) {
            const body = (await response.json()) as { revision?: string };
            if (typeof body.revision === "string" && body.revision !== known.current) {
              known.current = body.revision;
              router.refresh();
            }
          }
        } catch {
          // Offline or the server is restarting: try again on the next tick.
        }
      }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };

    timer = setTimeout(tick, intervalMs);
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [router, intervalMs]);

  return null;
}
