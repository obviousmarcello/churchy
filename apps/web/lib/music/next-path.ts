/** Their `lib/projection/overlay` (projection: phase 5). */
type OverlayBackground = "black" | "green";

export const HOME_PATH = "/";

// Pages under this prefix are the sign-in and two-step verification pages.
export const PUBLIC_PATH_PREFIX = "/account";

/** The privacy notice. Open without a session: the login email links to it. */
export const PRIVACY_PATH = "/privacy";

/** The sign-in pages. A signed-in user does not go back to them. */
export function isAccountPath(pathname: string): boolean {
  return pathname === PUBLIC_PATH_PREFIX || pathname.startsWith(`${PUBLIC_PATH_PREFIX}/`);
}

/**
 * Pages that are open without a session: sign-in, two-step verification and
 * the privacy notice. All other pages need a fully verified session. The
 * layout does not show the main menu on these pages; the privacy notice
 * shows it to signed-in users itself.
 */
export function isPublicPath(pathname: string): boolean {
  return isAccountPath(pathname) || pathname === PRIVACY_PATH;
}

// The chord sheet uses the whole screen, without the main menu. It takes its
// song from the query, not from a dynamic segment: `usePathname()` in the
// menu then knows the path when the page is prerendered, so the menu does
// not show for a moment before it hides.
export const SHEET_PATH = "/sheet";

// The projection: the controller, the screen and the stream overlay, also
// full-screen pages. They take the event from the query for the same reason.
export const PROJECT_PATH = "/project";
export const PROJECT_SCREEN_PATH = "/project/screen";
export const PROJECT_OVERLAY_PATH = "/project/overlay";

export function isFullScreenPath(pathname: string): boolean {
  return (
    pathname === SHEET_PATH ||
    pathname === PROJECT_PATH ||
    pathname === PROJECT_SCREEN_PATH ||
    pathname === PROJECT_OVERLAY_PATH
  );
}

/** The projection controller of an event, or of the rehearsal in this browser (`eventId` null). */
export function projectionHref(eventId: string | null): string {
  return eventId
    ? `${PROJECT_PATH}?${new URLSearchParams({ event: eventId })}`
    : `${PROJECT_PATH}?rehearsal`;
}

/** The projection screen of an event, or of the rehearsal in this browser (`eventId` null). */
export function projectionScreenHref(eventId: string | null): string {
  return eventId
    ? `${PROJECT_SCREEN_PATH}?${new URLSearchParams({ event: eventId })}`
    : `${PROJECT_SCREEN_PATH}?rehearsal`;
}

/** The stream overlay of an event's projection. The default background (black) is not in the query. */
export function projectionOverlayHref(eventId: string, background: OverlayBackground): string {
  const params = new URLSearchParams({ event: eventId });
  if (background !== "black") params.set("background", background);
  return `${PROJECT_OVERLAY_PATH}?${params}`;
}

/**
 * Whether a menu item or tab is the current page: its own page or a page
 * below it, e.g. "Events" on `/events/123`. Home matches only itself.
 */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === HOME_PATH) return pathname === HOME_PATH;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The chord sheet of all the songs of an event, or of one setlist slot of it,
 * with the signed-in user's capo. Its close button goes back to the event.
 */
export function eventSheetHref(eventId: string, itemId?: string): string {
  const params = new URLSearchParams({ event: eventId });
  if (itemId) params.set("item", itemId);
  return `${SHEET_PATH}?${params}`;
}

/**
 * The chord sheet of a live session: the users follow the leader. Its close
 * button goes back to `from`. With `event`, the sheet opens at the setlist
 * slot `itemId`, and when the session has ended, it shows the event's sheet
 * (see `eventSheetHref`) in its place.
 */
export function liveSheetHref(
  sessionId: string,
  from?: string,
  event?: { eventId: string; itemId?: string },
): string {
  const params = new URLSearchParams({ session: sessionId });
  if (event) params.set("event", event.eventId);
  if (event?.itemId) params.set("item", event.itemId);
  if (from) params.set("from", from);
  return `${SHEET_PATH}?${params}`;
}

/**
 * The chord sheet of an arrangement, or of several in playing order (e.g. a
 * rehearsal setlist). Its close button goes back to `from`. `musicalKeys`
 * has the key to play each arrangement in (English note names; null for the
 * key of the chart).
 */
export function sheetHref(
  arrangementIds: string | string[],
  from?: string,
  musicalKeys?: (string | null | undefined)[],
): string {
  const params = new URLSearchParams();
  const ids = [arrangementIds].flat();
  for (const id of ids) params.append("arrangement", id);
  // One `key` for each arrangement, or none when all play in the key of the chart.
  if (musicalKeys?.some(Boolean))
    ids.forEach((_, index) => params.append("key", musicalKeys[index] ?? ""));
  if (from) params.set("from", from);
  return `${SHEET_PATH}?${params}`;
}

// The pages that add a song, an event or a user. The search palette fills
// in the title or the email that the user typed.

/** The parameter with the title of a new song or event. */
export const NEW_TITLE_PARAM = "title";

export function newSongHref(title?: string): string {
  return title
    ? `/munkater/enektar/uj?${new URLSearchParams({ [NEW_TITLE_PARAM]: title })}`
    : "/munkater/enektar/uj";
}

export function newEventHref(title?: string): string {
  return title ? `/events/new?${new URLSearchParams({ [NEW_TITLE_PARAM]: title })}` : "/events/new";
}

/** The page that shows a PDF file of a song. Its back link goes to `from`, or to the song. */
export function pdfHref(pdfId: string, from?: string): string {
  return from
    ? `/munkater/enektar/pdf/${pdfId}?${new URLSearchParams({ from })}`
    : `/munkater/enektar/pdf/${pdfId}`;
}

/** The page that shows an image of a song. Its back link goes to `from`, or to the song. */
export function imageHref(imageId: string, from?: string): string {
  return from
    ? `/munkater/enektar/kep/${imageId}?${new URLSearchParams({ from })}`
    : `/munkater/enektar/kep/${imageId}`;
}

/**
 * The page to open after sign-in, from the `next` parameter. Accepts only a
 * path on this site, so a link cannot send the user to another site.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//"))
    return HOME_PATH;

  const base = "http://localhost";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return HOME_PATH;
  }
  // Catches tricks like `/\evil.example`, which browsers read as `//`.
  if (url.origin !== base) return HOME_PATH;
  // Do not send the user back to the sign-in pages.
  if (isAccountPath(url.pathname)) return HOME_PATH;

  const path = `${url.pathname}${url.search}${url.hash}`;
  // Dot segments can collapse into `//`: `/.//evil.example` gives the path
  // `//evil.example`, which browsers read as another site. Check the result too.
  if (path.startsWith("//") || new URL(path, base).origin !== base) return HOME_PATH;

  return path;
}
