/**
 * Embed allow-list for page blocks (SDD §13, D-16). Only two providers are rendered, and only from
 * their own hosts: YouTube through `youtube-nocookie.com` and OpenStreetMap maps. The stored URL is
 * never put on the page as-is; the player URL is rebuilt from the parsed video id or map
 * coordinates, so query strings, paths or hosts smuggled into the URL cannot reach the frame.
 * Every other provider and every URL that does not parse is dropped.
 */

export type AllowedEmbedProvider = "youtube" | "openstreetmap";

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
const OSM_HOSTS = new Set(["openstreetmap.org", "www.openstreetmap.org"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

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

function coordinate(value: string | undefined, limit: number): number | null {
  if (value === undefined || !/^-?\d{1,3}(\.\d{1,8})?$/.test(value)) return null;
  const n = Number(value);
  return Math.abs(n) <= limit ? n : null;
}

/** Map frame URL from an OSM embed URL (`bbox` and optional `marker`) or a pin link (`mlat`/`mlon`). */
function osmSource(url: URL): string | null {
  if (!OSM_HOSTS.has(url.hostname)) return null;
  let bbox: number[] | null = null;
  let marker: number[] | null = null;
  const box = url.searchParams.get("bbox")?.split(",");
  if (url.pathname === "/export/embed.html" && box?.length === 4) {
    const parts = [
      coordinate(box[0], 180),
      coordinate(box[1], 90),
      coordinate(box[2], 180),
      coordinate(box[3], 90),
    ];
    if (parts.every((n): n is number => n !== null)) bbox = parts;
    const pin = url.searchParams.get("marker")?.split(",");
    if (pin?.length === 2) {
      const lat = coordinate(pin[0], 90);
      const lon = coordinate(pin[1], 180);
      if (lat !== null && lon !== null) marker = [lat, lon];
    }
  } else if (url.pathname === "/") {
    const lat = coordinate(url.searchParams.get("mlat") ?? undefined, 90);
    const lon = coordinate(url.searchParams.get("mlon") ?? undefined, 180);
    if (lat !== null && lon !== null) {
      marker = [lat, lon];
      bbox = [lon - 0.005, lat - 0.003, lon + 0.005, lat + 0.003];
    }
  }
  if (bbox === null) return null;
  const round = (n: number) => Number(n.toFixed(6));
  const query = new URLSearchParams({ bbox: bbox.map(round).join(","), layer: "mapnik" });
  if (marker !== null) query.set("marker", marker.map(round).join(","));
  return `https://www.openstreetmap.org/export/embed.html?${query.toString()}`;
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
  if (provider === "openstreetmap") {
    const src = osmSource(parsed);
    return src === null ? null : { provider, providerName: "OpenStreetMap", src };
  }
  return null;
}
