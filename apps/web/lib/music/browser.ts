"use client";

import { useCallback, useSyncExternalStore } from "react";

// Values that only the browser knows. The server and the first render (the
// hydration) use a fixed value; the browser's value follows after hydration.

const subscribeToNothing = () => () => {};

/** A browser value that does not change while the page shows, e.g. whether the browser supports a feature. */
export function useBrowserValue<T>(getValue: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribeToNothing, getValue, () => serverValue);
}

/** True while the media query matches, e.g. "(min-width: 48rem)". False on the server. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

let rootFontPx: number | null = null;

/**
 * The font size of the page root in CSS pixels, i.e. of 1rem: 16, more if
 * the user chose a larger text in the browser. Read once. 16 on the server.
 */
export function useRootFontPx(): number {
  return useBrowserValue(readRootFontPx, 16);
}

function readRootFontPx() {
  rootFontPx ??= parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return rootFontPx;
}

/**
 * A string in `localStorage` under `key`, e.g. a choice that belongs to the
 * device. `useValue()` gives null when there is no value, and undefined on the
 * server and in the first render. When storage cannot keep a value, e.g. in
 * some private windows, the value stays in memory until the page reloads.
 * `storage: "session"` keeps it in `sessionStorage`: only for this tab, until it closes.
 */
export function createStoredString(key: string, storage: "local" | "session" = "local") {
  const listeners = new Set<() => void>();
  let unsaved: { value: string | null } | null = null;
  const store = () => (storage === "session" ? sessionStorage : localStorage);

  function get(): string | null {
    if (unsaved) return unsaved.value;
    try {
      return store().getItem(key);
    } catch {
      return null;
    }
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    window.addEventListener("storage", listener);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", listener);
    };
  }

  /** Null removes the value. */
  function set(value: string | null) {
    try {
      if (value === null) store().removeItem(key);
      else store().setItem(key, value);
      unsaved = null;
    } catch {
      unsaved = { value };
    }
    listeners.forEach((listener) => listener());
  }

  function useValue(): string | null | undefined {
    return useSyncExternalStore(subscribe, get, () => undefined);
  }

  return { get, set, useValue };
}
