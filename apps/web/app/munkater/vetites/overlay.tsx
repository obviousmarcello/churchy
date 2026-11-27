"use client";

import { useEffect, useState } from "react";

import { useI18n } from "@/i18n/music/client";
import {
  OVERLAY_COLORS,
  overlayLook,
  overlaySlide,
  type OverlayBackground,
} from "@/lib/music/projection/overlay";
import {
  newWindowId,
  PROJECTION_OVERLAY_CLOSED_EVENT,
  PROJECTION_OVERLAY_EVENT,
  PROJECTION_SYNC_EVENT,
  type OverlayInfo,
} from "@/lib/music/projection/protocol";
import { transitionMs } from "@/lib/music/projection/themes";
import { useFullscreen, useWakeLock } from "@/lib/music/screen";
import { cn } from "@/lib/music/utils";
import { useProjectionChannel, type ProjectionChannelConfig } from "./channel";
import { Crossfade } from "./crossfade";
import { projectionFontVariables } from "./projection-fonts";
import { SlideText } from "./slide-view";
import { isFullscreenKey, useAnnounceOpen, useReceivedState } from "./viewer";

// A stream overlay: the text of the slides that the controllers send, at the
// bottom of the whole window, on black or green for the keyer of a video
// switcher (see `lib/projection/overlay.ts`). It only listens: it sends no
// commands, and it does not count as a screen. It tells the controllers that
// it is open, so they show the number of the overlays. A click goes to full
// screen, and the F key toggles it: the window must fill the output to the
// switcher.
//
// The stream must show only the text, so the page shows the state of the
// connection only for a short time after it opens, and the controllers show
// whether the overlay is open. The mouse cursor never shows.

/** The setup hint hides this time after the first connection. */
const HINT_MS = 5000;

export function ProjectionOverlay({
  channel: config,
  background,
}: {
  channel: ProjectionChannelConfig;
  background: OverlayBackground;
}) {
  const { m } = useI18n();
  const t = m.project.overlay;
  const { state, receive } = useReceivedState();
  const [id] = useState(newWindowId);
  const { isFullscreen, canFullscreen, toggleFullscreen } = useFullscreen();
  // "connecting" before the first join, "connected" for `HINT_MS` after it, then null.
  const [hint, setHint] = useState<"connecting" | "connected" | null>("connecting");
  useWakeLock(true);

  const channel = useProjectionChannel(config, {
    onMessage(event, payload) {
      if (event === "state" && receive(payload)) setHint(null);
    },
    // Also after a lost connection: the overlay did not get the slides of that time.
    onConnected: () => {
      channel.send(PROJECTION_OVERLAY_EVENT, overlayInfo(id));
      channel.send(PROJECTION_SYNC_EVENT, {});
      setHint((current) => (current === "connecting" ? "connected" : current));
    },
  });

  useEffect(() => {
    if (hint !== "connected") return;
    const timer = setTimeout(() => setHint(null), HINT_MS);
    return () => clearTimeout(timer);
  }, [hint]);

  // Tells the controllers that this overlay is open.
  useAnnounceOpen(channel.send, {
    id,
    info: overlayInfo,
    openEvent: PROJECTION_OVERLAY_EVENT,
    closedEvent: PROJECTION_OVERLAY_CLOSED_EVENT,
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isFullscreenKey(event)) toggleFullscreen();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleFullscreen]);

  const slide = state ? overlaySlide(state) : null;
  const look = state ? overlayLook(state.look) : null;

  return (
    <main
      // The key color gives its color to the status bar of the iPad (`globals.css`).
      data-fills-status-bar
      onClick={() => {
        if (canFullscreen && !isFullscreen) toggleFullscreen();
      }}
      style={{ backgroundColor: OVERLAY_COLORS[background] }}
      className={cn("fixed inset-0 cursor-none select-none", projectionFontVariables)}
    >
      {/* The text sizes are parts of the height of the window, as on a screen (see `overlayLook`). */}
      <div className="absolute inset-0 px-[5vw]">
        <div className="relative size-full">
          {state && look && (
            <Crossfade
              id={slide ? JSON.stringify([slide, look.font]) : "none"}
              ms={transitionMs(look)}
            >
              {slide && <SlideText slide={slide} look={look} />}
            </Crossfade>
          )}
        </div>
      </div>

      {hint && (
        <p
          role="status"
          className="absolute top-4 left-4 rounded-full bg-black/70 px-4 py-2 text-sm text-white"
        >
          {hint === "connecting" ? t.connecting : t.connected}
        </p>
      )}
    </main>
  );
}

function overlayInfo(id: string): OverlayInfo {
  return { id };
}
