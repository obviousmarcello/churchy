/**
 * Embed allow-list for page blocks (SDD §13, D-16). Only providers with a privacy-friendly player
 * are rendered, and only from their own hosts: YouTube through `youtube-nocookie.com`, Vimeo with
 * `dnt=1`. The stored URL is never put on the page as-is; the player URL is rebuilt from the
 * parsed video id, so query strings, paths or hosts smuggled into the URL cannot reach the frame.
 * Every other provider (also ones the contract stores, e.g. Facebook) and every URL that does not
 * parse is dropped.
 */

export type AllowedEmbedProvider = "youtube" | "vimeo";

export interface EmbedSource {
  provider: AllowedEmbedProvider;
  /** Display name of the provider (a brand name, not translated). */
  providerName: string;
  /** The privacy-friendly player URL for the frame. */
  src: string;
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;

function parseHttps(url: unknown): URL | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === ""
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function youtubeId(url: URL): string | null {
  if (!YOUTUBE_HOSTS.has(url.hostname)) return null;
  const segments = url.pathname.split("/").filter((s) => s !== "");
  let id: string | null | undefined;
  if (url.hostname === "youtu.be") id = segments[0];
  else if (segments[0] === "watch") id = url.searchParams.get("v");
  else if (segments[0] === "embed" || segments[0] === "shorts" || segments[0] === "live") {
    id = segments[1];
  }
  return typeof id === "string" && YOUTUBE_ID.test(id) ? id : null;
}

function vimeoId(url: URL): string | null {
  if (!VIMEO_HOSTS.has(url.hostname)) return null;
  const segments = url.pathname.split("/").filter((s) => s !== "");
  const id =
    url.hostname === "player.vimeo.com" && segments[0] === "video" ? segments[1] : segments[0];
  return typeof id === "string" && VIMEO_ID.test(id) ? id : null;
}

/** The player of an allow-listed embed, or null when the provider or the URL is not allowed. */
export function embedSource(provider: unknown, url: unknown): EmbedSource | null {
  const parsed = parseHttps(url);
  if (parsed === null) return null;
  if (provider === "youtube") {
    const id = youtubeId(parsed);
    return id === null
      ? null
      : {
          provider,
          providerName: "YouTube",
          src: `https://www.youtube-nocookie.com/embed/${id}`,
        };
  }
  if (provider === "vimeo") {
    const id = vimeoId(parsed);
    return id === null
      ? null
      : { provider, providerName: "Vimeo", src: `https://player.vimeo.com/video/${id}?dnt=1` };
  }
  return null;
}
