// YouTube links, e.g. the live stream of an event.

/** Keep in sync with the check on `events.youtube_url` in the migrations. */
export const YOUTUBE_URL_MAX_LENGTH = 500;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

/**
 * The link as an https URL, e.g. "youtu.be/abc" is "https://youtu.be/abc".
 * Null if it is not a link to YouTube. An http link becomes https.
 */
export function toYoutubeUrl(value: string): string | null {
  const trimmed = value.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // A port or a user name would put text between the host and the path.
  if (url.port || url.username || url.password) return null;
  if (!YOUTUBE_HOSTS.has(url.hostname)) return null;

  url.protocol = "https:";
  return url.href.length <= YOUTUBE_URL_MAX_LENGTH ? url.href : null;
}

/** A video on YouTube: its id and the second where it starts. */
export type YoutubeVideo = { id: string; start: number };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * The video of a YouTube link, e.g. "https://youtu.be/abc?t=90" or
 * "https://www.youtube.com/watch?v=abc&t=1m30s". Also "shorts", "embed" and
 * "live" links. Null for a link to a channel, a playlist or a search.
 */
export function parseYoutubeVideo(value: string): YoutubeVideo | null {
  const href = toYoutubeUrl(value);
  if (!href) return null;
  const url = new URL(href);

  let id: string | null;
  if (url.hostname === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v");
  } else {
    const [, kind, path] = url.pathname.split("/");
    id =
      kind === "shorts" || kind === "embed" || kind === "live" || kind === "v"
        ? (path ?? null)
        : null;
  }
  if (!id || !VIDEO_ID.test(id)) return null;

  return { id, start: parseStart(url.searchParams.get("t") ?? url.searchParams.get("start")) };
}

/** "90", "90s" or "1h2m30s" in seconds. 0 for no time or an unknown form. */
function parseStart(value: string | null): number {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match || value === "") return 0;
  const [, hours = "0", minutes = "0", seconds = "0"] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/**
 * The address of the player of the video, in the privacy-enhanced mode of
 * YouTube. The page loads it only after a click on the video, so it starts
 * at once. Keep the host in sync with `frame-src` in `next.config.ts`.
 */
export function youtubeEmbedUrl(video: YoutubeVideo): string {
  const params = new URLSearchParams({ autoplay: "1", rel: "0" });
  if (video.start > 0) params.set("start", String(video.start));
  return `https://www.youtube-nocookie.com/embed/${video.id}?${params}`;
}
