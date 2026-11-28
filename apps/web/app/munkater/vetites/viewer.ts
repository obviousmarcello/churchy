"use client";

import { useEffect, useRef, useState } from "react";

import {
  newerProjectionState,
  parseProjectionState,
  SCREEN_HEARTBEAT_MS,
  type ProjectionState,
} from "@/lib/music/projection/protocol";
import type { ProjectionEvent } from "./channel";

// The parts of a window that shows the slides of the controllers: a screen
// and a stream overlay.

/**
 * The newest state that the controllers sent (see `newerProjectionState`).
 * `receive` takes the payload of a state message; it returns true when the
 * state changed. `stateRef` has the state at once, for the handlers.
 */
export function useReceivedState() {
  const [state, setState] = useState<ProjectionState | null>(null);
  const stateRef = useRef<ProjectionState | null>(null);

  function receive(payload: unknown): boolean {
    const incoming = parseProjectionState(payload);
    if (!incoming) return false;
    const next = newerProjectionState(stateRef.current, incoming);
    if (next === stateRef.current) return false;
    stateRef.current = next;
    setState(next);
    return true;
  }

  return { state, stateRef, receive };
}

/**
 * Tells the controllers that this window is open: at once, every
 * `SCREEN_HEARTBEAT_MS`, and with `onResize` also when its size changes. It
 * tells them that it closed on `pagehide` and when it unmounts. `info` makes
 * the payload from the id of the window: a function of the module, so it
 * stays the same.
 */
export function useAnnounceOpen<T>(
  send: (event: ProjectionEvent, payload: unknown) => void,
  {
    id,
    info,
    openEvent,
    closedEvent,
    onResize = false,
    enabled = true,
  }: {
    id: string;
    info: (id: string) => T;
    openEvent: ProjectionEvent;
    closedEvent: ProjectionEvent;
    onResize?: boolean;
    enabled?: boolean;
  },
) {
  useEffect(() => {
    if (!enabled) return;
    const announce = () => send(openEvent, info(id));
    const close = () => send(closedEvent, info(id));
    announce();
    const timer = setInterval(announce, SCREEN_HEARTBEAT_MS);
    if (onResize) window.addEventListener("resize", announce);
    window.addEventListener("pagehide", close);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", announce);
      window.removeEventListener("pagehide", close);
      close();
    };
  }, [send, id, info, openEvent, closedEvent, onResize, enabled]);
}

/** True for the F key without a modifier: it toggles the full screen. */
export function isFullscreenKey(event: KeyboardEvent): boolean {
  return (
    !event.altKey && !event.ctrlKey && !event.metaKey && (event.key === "f" || event.key === "F")
  );
}
