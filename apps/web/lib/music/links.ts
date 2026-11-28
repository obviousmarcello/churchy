import { toYoutubeUrl } from "./youtube";

// The links of a song, e.g. a video on YouTube or a recording on a streaming
// site. The app never loads the linked page: the browser goes there only when
// the user opens the link.

/** Keep in sync with the check on `song_links.url` in the migrations. */
export const LINK_URL_MAX_LENGTH = 2000;

/**
 * The link as an http or https URL, e.g. "example.com/song" is
 * "https://example.com/song". A YouTube link becomes https. Null if it is not
 * a link to a web page, e.g. "javascript:…" or a name without a dot.
 */
export function toLinkUrl(value: string): string | null {
  const youtube = toYoutubeUrl(value);
  if (youtube) return youtube;

  const trimmed = value.trim();
  // "example.com:8080/song" has a port, not a scheme.
  const withScheme = /^[a-z][a-z0-9+.-]*:(?!\d+(?:[/?#]|$))/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // A user name can make a link look like a link to another site, e.g. "https://youtube.com@example.com".
  if (url.username || url.password) return null;
  // "https://lorem" is a typo more often than a page.
  if (!url.hostname.includes(".") || url.hostname.endsWith(".")) return null;

  return url.href.length <= LINK_URL_MAX_LENGTH ? url.href : null;
}

/** True for a link to YouTube. */
export function isYoutubeLink(url: string): boolean {
  return toYoutubeUrl(url) !== null;
}

/**
 * The name of a link without one: "YouTube" for a YouTube link, else the host
 * without "www.", e.g. "open.spotify.com".
 */
export function defaultLinkName(url: string): string {
  return isYoutubeLink(url) ? "YouTube" : linkHost(url);
}

/** The host of a link without "www.", e.g. "open.spotify.com". */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
