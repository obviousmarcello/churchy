"use client";

import { useEffect, useReducer, useState, type ComponentProps } from "react";
import { Popover } from "@base-ui/react/popover";
import { AppWindowIcon, CopyIcon, MonitorIcon, MonitorUpIcon, VideoIcon } from "lucide-react";

import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import type { OverlayBackground } from "@/lib/music/projection/overlay";
import { PROJECTION_WINDOW_NAME } from "@/lib/music/projection/screen-window";
import { toastError, toastInfo, toastSuccess } from "@/lib/music/toast";

// Opens the projection screen. Chrome and Edge list the screens of the
// computer (the Window Management API, after the user allows it) and put the
// window of the screen on the selected one. A window cannot open in full
// screen by itself, so the user clicks once in it. The desktop app does this
// click for the user. Every browser can open a
// window that the user moves to the projector, and copy the link for another
// device. For an event, it also copies the links of the stream overlay.

/** The part of the Window Management API that the picker uses. Not in the DOM types of TypeScript yet. */
type ScreenDetailed = {
  label: string;
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  width: number;
  height: number;
  isPrimary: boolean;
};
/** Live: `screens` changes when a screen is added or removed, and fires `screenschange`. */
type ScreenDetails = EventTarget & { screens: ScreenDetailed[] };
type WindowWithScreens = Window & { getScreenDetails?: () => Promise<ScreenDetails> };

// One window: the button opens the same screen again, not a second one. An
// open window with this name loads the page again, but ignores the position
// in `window.open()`, so the picker moves it. The name is `PROJECTION_WINDOW_NAME`.

// The time that the desktop app gets to load the moved window and show it in
// full screen. After it, a window that is not in full screen gets the hint.
const DESKTOP_FULL_SCREEN_WAIT_MS = 3000;

const OPTION_CLASS =
  "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-sunken focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

/**
 * `shareable`: another device can open the link (an event, not a rehearsal).
 * `overlayHref`: the link of the stream overlay, null without one.
 * `variant`: outline while a screen runs.
 */
export function ScreenPicker({
  href,
  shareable,
  overlayHref,
  variant = "default",
}: {
  href: string;
  shareable: boolean;
  overlayHref: ((background: OverlayBackground) => string) | null;
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  const { m, format } = useI18n();
  const t = m.project.controller;
  const [open, setOpen] = useState(false);
  // Null: not listed, e.g. in Safari and Firefox, or the user did not allow it.
  const [details, setDetails] = useState<ScreenDetails | null>(null);
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  const screens = details?.screens ?? null;

  // The list follows a screen that the user connects or removes while the menu shows.
  useEffect(() => {
    if (!details) return;
    details.addEventListener("screenschange", refresh);
    return () => details.removeEventListener("screenschange", refresh);
  }, [details]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    const getScreenDetails = (window as WindowWithScreens).getScreenDetails;
    // In the click: the browser asks for the permission only after a user action.
    if (next && getScreenDetails) {
      getScreenDetails.call(window).then(
        (result) => {
          setDetails(result);
          refresh();
        },
        () => setDetails(null),
      );
    }
  }

  /** `target` null, or a screen without a size: a window that the user moves. */
  function openWindow(target: ScreenDetailed | null) {
    setOpen(false);
    // Some browsers give a screen without its size and place, e.g. 0 × 0 at 0, 0: the window cannot go there.
    const screen = target && hasSize(target) ? target : null;
    const features = screen
      ? `popup,left=${screen.availLeft},top=${screen.availTop},width=${screen.availWidth},height=${screen.availHeight}`
      : "popup,width=960,height=540";
    const screenWindow = window.open(href, PROJECTION_WINDOW_NAME, features);
    if (!screenWindow) {
      toastError(t.popupBlocked);
      return;
    }
    if (!screen) {
      toastInfo(t.moveWindow, { id: "projection-move-window" });
      return;
    }
    try {
      // Also for a window that was open already. The permission of the Window Management API lets it go to another screen.
      screenWindow.moveTo(screen.availLeft, screen.availTop);
      screenWindow.resizeTo(screen.availWidth, screen.availHeight);
    } catch {
      // The browser does not let the page move the window: it stays where it opened.
    }
    // The desktop app shows the moved window in full screen by itself
    // (`electron/main.ts`). An older desktop app does not, and the full screen
    // can fail: so the desktop app gets the hint only after the wait, and only
    // for a window that is not in full screen.
    if (!navigator.userAgent.includes("Electron/")) {
      toastInfo(t.clickToFullScreen, { id: "projection-move-window" });
      return;
    }
    window.setTimeout(() => {
      if (needsClick(screenWindow))
        toastInfo(t.clickToFullScreen, { id: "projection-move-window" });
    }, DESKTOP_FULL_SCREEN_WAIT_MS);
  }

  async function copyLink(link: string) {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(new URL(link, window.location.origin).href);
      toastSuccess(t.linkCopied);
    } catch {
      toastError(t.copyFailed);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger render={<Button type="button" variant={variant} />}>
        <MonitorUpIcon />
        <span className="sr-only sm:not-sr-only">{t.openScreen}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" collisionPadding={8} className="z-50">
          <Popover.Popup className="flex max-h-[var(--available-height)] w-80 max-w-[calc(100vw-1rem)] origin-[var(--transform-origin)] flex-col gap-1 overflow-y-auto rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {screens && screens.length > 0 && (
              <>
                <p className="px-2 py-1 text-xs font-medium text-muted">{t.selectScreen}</p>
                {screens.map((screen, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => openWindow(screen)}
                    className={OPTION_CLASS}
                  >
                    <MonitorIcon className="size-4 shrink-0" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">
                        {screen.label || format(t.unnamedScreen, { number: index + 1 })}
                      </span>
                      <span className="text-xs text-muted">
                        {hasSize(screen)
                          ? format(screen.isPrimary ? t.screenSizePrimary : t.screenSize, {
                              width: screen.width,
                              height: screen.height,
                            })
                          : screen.isPrimary
                            ? t.screenSizeUnknownPrimary
                            : t.screenSizeUnknown}
                      </span>
                    </span>
                  </button>
                ))}
                <hr className="my-1" />
              </>
            )}
            <button type="button" onClick={() => openWindow(null)} className={OPTION_CLASS}>
              <AppWindowIcon className="size-4 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span>{t.newWindow}</span>
                <span className="text-xs text-muted">{t.newWindowHint}</span>
              </span>
            </button>
            {shareable && (
              <button type="button" onClick={() => void copyLink(href)} className={OPTION_CLASS}>
                <CopyIcon className="size-4 shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span>{t.copyScreenLink}</span>
                  <span className="text-xs text-muted">{t.copyScreenLinkHint}</span>
                </span>
              </button>
            )}
            {overlayHref && (
              <>
                <hr className="my-1" />
                <p className="px-2 py-1 text-xs font-medium text-muted">{t.streamOverlay}</p>
                <p className="px-2 pb-1 text-xs text-muted">{t.streamOverlayHint}</p>
                <button
                  type="button"
                  onClick={() => void copyLink(overlayHref("black"))}
                  className={OPTION_CLASS}
                >
                  <VideoIcon className="size-4 shrink-0" />
                  <span className="flex min-w-0 flex-col">
                    <span>{t.copyOverlayLink}</span>
                    <span className="text-xs text-muted">{t.copyOverlayLinkHint}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void copyLink(overlayHref("green"))}
                  className={OPTION_CLASS}
                >
                  <VideoIcon className="size-4 shrink-0 text-green-600" />
                  <span className="flex min-w-0 flex-col">
                    <span>{t.copyGreenOverlayLink}</span>
                    <span className="text-xs text-muted">{t.copyGreenOverlayLinkHint}</span>
                  </span>
                </button>
              </>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function hasSize(screen: ScreenDetailed) {
  return screen.availWidth > 0 && screen.availHeight > 0;
}

/** An open window that does not show its page in full screen. */
function needsClick(screenWindow: Window) {
  try {
    return !screenWindow.closed && !screenWindow.document.fullscreenElement;
  } catch {
    // A page of another origin, e.g. a sign-in page: the picker cannot read it.
    return !screenWindow.closed;
  }
}
