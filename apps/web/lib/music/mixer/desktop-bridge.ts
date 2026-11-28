import type { OscMessage } from "./osc";
import { X32_FX_SLOTS } from "./x32";

// The bridge of the desktop app to the mixing desk on the network. A web page
// cannot send UDP or open a TCP connection, so the main process of the
// desktop app does it (`electron/x32.ts`, `electron/sq.ts`), and the preload
// script (`electron/preload.ts`) gives the page these functions. The bridge is narrow on purpose: the commands of
// the desk, only to a private IPv4 address, so a page cannot use the computer
// to send other packets.

export const X32_IPC = {
  setFxParam: "x32:set-fx-param",
  fxType: "x32:fx-type",
  discover: "x32:discover",
} as const;

export const SQ_IPC = { tap: "sq:tap" } as const;

export type X32SetFxParamRequest = { host: string; slot: number; param: number; value: number };
export type X32FxTypeRequest = { host: string; slot: number };

/** A desk that answered on the local network, with the name, the model and the firmware that it reports. */
export type X32Desk = { host: string; name: string; model: string; version: string };

export type DesktopX32 = {
  /** Sets parameter `param` of effect `slot` to `value` (0 to 1). */
  setFxParam(request: X32SetFxParamRequest): Promise<void>;
  /** The type number of the effect in `slot`. Null when the desk does not answer in time. */
  fxType(request: X32FxTypeRequest): Promise<number | null>;
  /** The desks on the local networks of the computer. Not in desktop apps older than this function. */
  discover?(): Promise<X32Desk[]>;
};

/** Taps the soft keys `keys` of the SQ at `host`, `intervalMs` apart, on MIDI channel `channel`. */
export type SqTapRequest = { host: string; channel: number; keys: number[]; intervalMs: number };

export type DesktopSq = {
  /** "noAnswer" when the desk does not take the connection in time. */
  tap(request: SqTapRequest): Promise<"sent" | "noAnswer">;
};

export type DesktopApp = { x32?: DesktopX32; sq?: DesktopSq };

declare global {
  interface Window {
    /** Only in the desktop app (`electron/preload.ts`), and only in a version with these functions. */
    desktopApp?: DesktopApp;
  }
}

/** The X32 bridge of the desktop app. Null in a browser and in an older desktop app. */
export function desktopX32(): DesktopX32 | null {
  return (typeof window !== "undefined" && window.desktopApp?.x32) || null;
}

/** The SQ bridge of the desktop app. Null in a browser and in an older desktop app. */
export function desktopSq(): DesktopSq | null {
  return (typeof window !== "undefined" && window.desktopApp?.sq) || null;
}

/**
 * A private IPv4 address (10/8, 172.16/12, 192.168/16) or a link-local one
 * (169.254/16): a desk on the local network. No host names and no public addresses.
 * No leading zeros: the socket can read "010.8.8.8" as octal, which is 8.8.8.8.
 */
export function isPrivateIpv4(host: string): boolean {
  const match = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/.exec(
    host,
  );
  if (!match) return false;
  const [a = 0, b = 0, c = 0, d = 0] = match.slice(1).map(Number);
  if ([a, b, c, d].some((part) => part > 255)) return false;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

export function isFxSlot(slot: unknown): slot is number {
  return Number.isInteger(slot) && (slot as number) >= 1 && (slot as number) <= X32_FX_SLOTS;
}

/** The X32 effects have up to 64 parameters. */
export function isFxParam(param: unknown): param is number {
  return Number.isInteger(param) && (param as number) >= 1 && (param as number) <= 64;
}

/** The broadcast address of a network, e.g. 192.168.1.255 for 192.168.1.20 with the mask 255.255.255.0. */
export function broadcastAddress(address: string, netmask: string): string {
  const mask = netmask.split(".").map(Number);
  return address
    .split(".")
    .map((part, index) => Number(part) | (~(mask[index] ?? 0) & 255))
    .join(".");
}

/** The longest name, model or firmware of a desk that the page gets. */
const DESK_TEXT_MAX = 40;

/**
 * The desk of an answer to `/xinfo` (",ssss": its address, name, model and
 * firmware) from `from`. The address of the answer counts, and it must be
 * on a private network. Null for another message.
 */
export function deskOfXinfo(message: OscMessage, from: string): X32Desk | null {
  if (message.address !== "/xinfo" || !isPrivateIpv4(from)) return null;
  const [, name = "", model = "", version = ""] = message.args.map((arg) =>
    arg.type === "s" ? arg.value.trim().slice(0, DESK_TEXT_MAX) : "",
  );
  return { host: from, name, model, version };
}
