/**
 * Demo-only cookies (D-92). They exist only when `DEMO_MODE=1`, on the demo domain, and carry no
 * personal data: a random demo session id (which in-memory mock store the visitor uses) and the
 * chosen persona + church. Both are `HttpOnly`, `SameSite=Lax` and end with the browser session.
 */
export const DEMO_SESSION_COOKIE = "churchy_demo_session";
export const DEMO_SELECTION_COOKIE = "churchy_demo";
/**
 * Demo time travel (D-13): an ISO instant that the visitor's demo session uses as "now", so
 * scheduled and expired content can be seen changing visibility (E2E tests set it). Read only in
 * demo mode, i.e. never with real data; nothing in the app sets it.
 */
export const DEMO_NOW_COOKIE = "churchy_demo_now";

/** How far the demo clock may be moved from the real time (about a year either way). */
const MAX_CLOCK_SHIFT_MS = 400 * 86_400_000;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** The demo clock override in a cookie value, or null when missing, invalid or too far off. */
export function parseDemoNow(
  value: string | undefined | null,
  real: Date = new Date(),
): Date | null {
  if (typeof value !== "string" || !ISO_INSTANT_RE.test(value)) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return Math.abs(at.getTime() - real.getTime()) <= MAX_CLOCK_SHIFT_MS ? at : null;
}

/** Same alphabet as the mock sessions accept; long enough to be unguessable. */
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;

export function isDemoSessionId(value: string | undefined | null): value is string {
  return typeof value === "string" && SESSION_ID_RE.test(value);
}

export function newDemoSessionId(): string {
  return crypto.randomUUID();
}

export function demoCookieOptions(secure: boolean) {
  return { httpOnly: true, sameSite: "lax", path: "/", secure } as const;
}
