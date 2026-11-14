/**
 * Demo-only cookies (D-92). They exist only when `DEMO_MODE=1`, on the demo domain, and carry no
 * personal data: a random demo session id (which in-memory mock store the visitor uses) and the
 * chosen persona + church. Both are `HttpOnly`, `SameSite=Lax` and end with the browser session.
 */
export const DEMO_SESSION_COOKIE = "churchy_demo_session";
export const DEMO_SELECTION_COOKIE = "churchy_demo";

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
