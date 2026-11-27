"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MaximizeIcon, WifiOffIcon } from "lucide-react";

import { useI18n } from "@/i18n/music/client";
import { useBrowserValue } from "@/lib/music/browser";
import { projectionHref } from "@/lib/music/next-path";
import {
  newWindowId,
  PROJECTION_COMMAND_EVENT,
  PROJECTION_KEYS,
  PROJECTION_SCREEN_CLOSED_EVENT,
  PROJECTION_SCREEN_EVENT,
  PROJECTION_STATE_EVENT,
  PROJECTION_SYNC_EVENT,
  screenAspectRatio,
  type ProjectionCommand,
  type ProjectionCommandMessage,
  type ProjectionState,
  type ScreenInfo,
} from "@/lib/music/projection/protocol";
import { transitionMs, type ProjectionLook } from "@/lib/music/projection/themes";
import { useFullscreen, useWakeLock } from "@/lib/music/screen";
import { cn } from "@/lib/music/utils";
import { useProjectionChannel, type ProjectionChannelConfig } from "./channel";
import { Crossfade } from "./crossfade";
import { projectionFontVariables } from "./projection-fonts";
import { QrCode } from "./qr-code";
import { useAnnounceRunning } from "./running";
import { SlideBackground, SlideText } from "./slide-view";
import { isFullscreenKey, useAnnounceOpen, useReceivedState } from "./viewer";

// A projection screen: the slides that the controllers send, on the whole
// screen. It keeps the last state for the controllers that open later, and
// tells them that it is open, with its aspect ratio. Before the first slide
// it shows how to open the controller. The mouse cursor and the buttons hide
// after a short time without a move. A click anywhere goes to full screen,
// and the F key toggles it. A controller in the same browser can close it.
// In full screen, a click on the right half goes to the next slide, and on
// the left half to the previous one. A swipe and the keys of the controller
// work too. The open controllers do these commands: without one, nothing
// changes.
//
// The transition comes from the projection theme of the new slide. The
// background and the text change on their own: when the background stays the
// same, only the text changes.

const CURSOR_HIDE_MS = 2000;
/** The shortest swipe, in pixels. */
const SWIPE_PX = 50;

export function ProjectionScreen({ channel: config }: { channel: ProjectionChannelConfig }) {
  const { m } = useI18n();
  const t = m.project.screen;
  const { state, stateRef, receive } = useReceivedState();
  const [id] = useState(newWindowId);
  const { isFullscreen, canFullscreen, toggleFullscreen } = useFullscreen();
  const pointerActive = usePointerActivity();
  // A controller closed the screen, but the browser kept the window open.
  const [closed, setClosed] = useState(false);
  useWakeLock(!closed);
  // For the menu item back to the controller in the other windows of this browser.
  useAnnounceRunning(closed ? null : config.eventId, null);

  const channel = useProjectionChannel(config, {
    onMessage(event, payload, { local }) {
      if (closed) return;
      if (event === "close" && local) {
        // The browser closes only a window that a page opened, e.g. the screen picker of the controller.
        window.close();
        setClosed(true);
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      } else if (event === "state") {
        receive(payload);
      } else if (event === "sync" && stateRef.current) {
        channel.send(PROJECTION_STATE_EVENT, stateRef.current);
      }
    },
    // Also after a lost connection: the controllers know this screen and do not send their state again.
    onConnected: () => {
      channel.send(PROJECTION_SCREEN_EVENT, screenInfo(id, stateRef.current));
      channel.send(PROJECTION_SYNC_EVENT, {});
    },
  });

  // Tells the controllers that this screen is open, and its shape, which changes with the full screen.
  const info = useCallback(
    (windowId: string) => screenInfo(windowId, stateRef.current),
    [stateRef],
  );
  useAnnounceOpen(channel.send, {
    id,
    info,
    openEvent: PROJECTION_SCREEN_EVENT,
    closedEvent: PROJECTION_SCREEN_CLOSED_EVENT,
    onResize: true,
    enabled: !closed,
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isFullscreenKey(event)) toggleFullscreen();
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const command = PROJECTION_KEYS[event.key];
      if (!command) return;
      event.preventDefault();
      sendCommand(command);
    }
    // A focused button clicks on the release of Space: it must not go to full screen too.
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === " ") event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  function sendCommand(command: ProjectionCommand) {
    if (closed) return;
    const message: ProjectionCommandMessage = { command, baseSeq: stateRef.current?.seq ?? null };
    channel.send(PROJECTION_COMMAND_EVENT, message);
  }

  // A swipe to the left goes to the next slide, as a page that turns.
  const swipe = useRef<{ x: number; y: number; done: boolean }>({ x: 0, y: 0, done: false });
  function onPointerDown(event: React.PointerEvent) {
    swipe.current = { x: event.clientX, y: event.clientY, done: false };
  }
  function onPointerUp(event: React.PointerEvent) {
    const dx = event.clientX - swipe.current.x;
    const dy = event.clientY - swipe.current.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    // Not also a click.
    swipe.current.done = true;
    sendCommand(dx < 0 ? "next" : "previous");
  }

  const disconnected = channel.status === "failed";

  // The browser loads the background or the image of the next slide before it shows.
  const preload = state?.preload ?? null;
  const preloadImage = state?.preloadImage ?? null;
  useEffect(() => {
    if (preload) new Image().src = preload;
  }, [preload]);
  useEffect(() => {
    if (preloadImage) new Image().src = preloadImage;
  }, [preloadImage]);

  if (closed) {
    return (
      <main
        data-fills-status-bar
        className="fixed inset-0 flex items-center justify-center bg-black p-[6vh] text-center text-white"
      >
        <p className="text-[2.5vh] text-white/60">{t.closed}</p>
      </main>
    );
  }

  return (
    <main
      // The black page gives its color to the status bar of the iPad (`globals.css`).
      data-fills-status-bar
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={(event) => {
        if (swipe.current.done) return;
        // One click anywhere goes to full screen first: the window is on the projector, where the button is hard to find.
        if (canFullscreen && !isFullscreen) return toggleFullscreen();
        const { left, width } = event.currentTarget.getBoundingClientRect();
        sendCommand(event.clientX < left + width / 2 ? "previous" : "next");
      }}
      // `touch-none`: the browser does not take a swipe for a scroll or a zoom.
      className={cn(
        "fixed inset-0 touch-none bg-black text-white select-none",
        projectionFontVariables,
        !pointerActive && "cursor-none",
      )}
    >
      {state ? (
        <>
          <Crossfade id={backgroundKey(state.look, state.mode)} ms={transitionMs(state.look)}>
            <SlideBackground look={state.look} mode={state.mode} playVideo />
          </Crossfade>
          <Crossfade id={textKey(state)} ms={transitionMs(state.look)}>
            <SlideText slide={state.slide} look={state.look} mode={state.mode} />
          </Crossfade>
        </>
      ) : (
        <Idle eventId={config.eventId} />
      )}

      {disconnected && (
        <span role="status" title={t.disconnected} className="absolute top-3 right-3 text-white/40">
          <WifiOffIcon aria-hidden className="size-5" />
          <span className="sr-only">{t.disconnected}</span>
        </span>
      )}
      {canFullscreen && !isFullscreen && (
        <button
          type="button"
          onClick={(event) => {
            // Not again in the click of `main`.
            event.stopPropagation();
            toggleFullscreen();
          }}
          aria-keyshortcuts="F"
          className={cn(
            "absolute right-4 bottom-4 flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm text-white transition-opacity hover:bg-white/25 focus-visible:ring-3 focus-visible:ring-white/50 focus-visible:outline-none",
            !pointerActive && "pointer-events-none opacity-0",
          )}
        >
          <MaximizeIcon className="size-4" />
          {t.fullScreen}
        </button>
      )}
    </main>
  );
}

/** Before the first slide: how to open the controller. Not on a real slide: the room should not see it later. */
function Idle({ eventId }: { eventId: string | null }) {
  const { m } = useI18n();
  const t = m.project.screen;
  const controllerUrl = useBrowserValue(
    () => new URL(projectionHref(eventId), window.location.origin).href,
    null,
  );

  return (
    <div className="flex size-full flex-col items-center justify-center gap-[4vh] p-[6vh] text-center">
      {/* Only for an event: the controller of a rehearsal must be in this browser. */}
      {eventId && controllerUrl && (
        <>
          <QrCode text={controllerUrl} label={t.scanToControl} className="size-[30vh] rounded-lg" />
          <p className="text-[3vh] text-white/80">{t.scanToControl}</p>
        </>
      )}
      <p className="text-[2.5vh] text-white/50">{t.waiting}</p>
    </div>
  );
}

/** The background of the screen: it changes only when this changes. */
function backgroundKey(look: ProjectionLook, mode: ProjectionState["mode"]): string {
  return mode === "black" ? "black" : JSON.stringify(look.background);
}

/**
 * The text of the screen and its style: it changes only when this changes.
 * All fields of the look but the background and the transition, also a new one.
 * The verses of a roll in the same item keep the text: the roll moves them
 * (see `scripture-roll.tsx`).
 */
function textKey({ mode, slide, look, position }: ProjectionState): string {
  // The same check as `SlideText`: with a bad roll, the page view.
  const roll =
    slide.kind === "scripture" && slide.roll && slide.roll.ids.length === slide.verses.length;
  const text = roll ? ["roll", position && "itemKey" in position ? position.itemKey : null] : slide;
  return JSON.stringify([mode, text, { ...look, background: null, transition: null }]);
}

function screenInfo(id: string, state: ProjectionState | null): ScreenInfo {
  const position = state?.position;
  return {
    id,
    aspectRatio: screenAspectRatio(window.innerWidth, window.innerHeight),
    liveItemKey: position && "itemKey" in position ? position.itemKey : null,
  };
}

/** False after a short time without a move of the mouse, so the cursor and the button can hide. */
function usePointerActivity() {
  const [active, setActive] = useState(true);
  useEffect(() => {
    let timer = setTimeout(() => setActive(false), CURSOR_HIDE_MS);
    function onMove() {
      setActive(true);
      clearTimeout(timer);
      timer = setTimeout(() => setActive(false), CURSOR_HIDE_MS);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onMove);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
    };
  }, []);
  return active;
}
