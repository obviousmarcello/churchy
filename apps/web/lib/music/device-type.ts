"use client";

import { useBrowserValue } from "./browser";
import type { DeviceType } from "./sheet-view";

// The type of the device, for the settings of the chord sheet that the user
// sets for each song (see `sheet-view.ts`). It comes from the size of the
// screen, not of the window: a turn of the device or a smaller window keeps
// the type. A touch screen counts, not the main pointer: a tablet with a
// trackpad (e.g. an iPad with a Magic Keyboard) stays a tablet. So a computer
// with a touch screen is a tablet too.

/** The short side of a phone's screen is below this, in CSS pixels. */
const PHONE_MAX_SHORT_SIDE = 600;

function readDeviceType(): DeviceType {
  if (!window.matchMedia("(any-pointer: coarse)").matches) return "desktop";
  return Math.min(screen.width, screen.height) < PHONE_MAX_SHORT_SIDE ? "phone" : "tablet";
}

/** "desktop" on the server and in the hydration: the sheet page waits for the browser's value (`sheet-view.tsx`). */
export function useDeviceType(): DeviceType {
  return useBrowserValue(readDeviceType, "desktop");
}
