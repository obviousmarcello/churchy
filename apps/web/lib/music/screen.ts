"use client";

import { useEffect, useSyncExternalStore } from "react";

import { useBrowserValue } from "./browser";

// The full screen and the wake lock, for the pages that fill the screen: the
// chord sheet and the projection.

function subscribeToFullscreen(callback: () => void) {
  document.addEventListener("fullscreenchange", callback);
  return () => document.removeEventListener("fullscreenchange", callback);
}

/** The browser's full screen, which also hides its toolbars. Phones may not support it. */
export function useFullscreen() {
  const isFullscreen = useSyncExternalStore(
    subscribeToFullscreen,
    () => document.fullscreenElement !== null,
    () => false,
  );
  const canFullscreen = useBrowserValue(() => document.fullscreenEnabled, false);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    // Fails, for example, when the browser asks for a click first.
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  return { isFullscreen, canFullscreen, toggleFullscreen };
}

/** Stops the screen from turning off while the page shows, where the browser supports it. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;

    let lock: WakeLockSentinel | null = null;
    let active = true;
    async function request() {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (active) lock = next;
        else void next.release();
      } catch {
        // For example, when the battery is low. The screen then turns off as usual.
      }
    }
    // The browser releases the lock when the tab is hidden.
    function onVisibilityChange() {
      if (document.visibilityState === "visible") void request();
    }

    void request();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void lock?.release();
    };
  }, [enabled]);
}
