import { describe, expect, it } from "vitest";

import {
  parseYoutubeVideo,
  YOUTUBE_URL_MAX_LENGTH,
  toYoutubeUrl,
  youtubeEmbedUrl,
} from "./youtube";

// The same pattern as the check on `events.youtube_url`.
const DATABASE_PATTERN = /^https:\/\/(((www|m|music)\.)?youtube\.com|youtu\.be)\//;

describe("toYoutubeUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc", "https://www.youtube.com/watch?v=abc"],
    ["https://youtu.be/abc?t=30", "https://youtu.be/abc?t=30"],
    ["https://www.youtube.com/live/abc", "https://www.youtube.com/live/abc"],
    ["https://m.youtube.com/watch?v=abc", "https://m.youtube.com/watch?v=abc"],
    ["https://music.youtube.com/playlist?list=abc", "https://music.youtube.com/playlist?list=abc"],
    ["  youtube.com/@channel/streams ", "https://youtube.com/@channel/streams"],
    ["http://YouTube.com/watch?v=abc", "https://youtube.com/watch?v=abc"],
    ["https://youtu.be", "https://youtu.be/"],
  ])("accepts %s", (value, expected) => {
    const url = toYoutubeUrl(value);
    expect(url).toBe(expected);
    expect(url).toMatch(DATABASE_PATTERN);
  });

  it.each([
    "",
    "not a link",
    "javascript:alert(1)",
    "ftp://youtube.com/abc",
    "https://youtube.com.example.com/watch",
    "https://example.com/youtube.com/watch",
    "https://evil@youtube.com/watch",
    "https://youtube.com:8443/watch",
    "https://vimeo.com/123",
  ])("rejects %j", (value) => {
    expect(toYoutubeUrl(value)).toBeNull();
  });

  it("rejects a link that is too long", () => {
    const base = "https://youtu.be/";
    expect(toYoutubeUrl(base + "a".repeat(YOUTUBE_URL_MAX_LENGTH - base.length))).not.toBeNull();
    expect(toYoutubeUrl(base + "a".repeat(YOUTUBE_URL_MAX_LENGTH - base.length + 1))).toBeNull();
  });
});

describe("parseYoutubeVideo", () => {
  it("finds the video of the usual links", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "youtube.com/watch?v=dQw4w9WgXcQ&list=PL123",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
    ]) {
      expect(parseYoutubeVideo(link)).toEqual({ id: "dQw4w9WgXcQ", start: 0 });
    }
  });

  it("keeps the start time", () => {
    expect(parseYoutubeVideo("https://youtu.be/dQw4w9WgXcQ?t=90")?.start).toBe(90);
    expect(parseYoutubeVideo("https://youtu.be/dQw4w9WgXcQ?t=90s")?.start).toBe(90);
    expect(parseYoutubeVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s")?.start).toBe(
      3723,
    );
    expect(parseYoutubeVideo("https://www.youtube.com/embed/dQw4w9WgXcQ?start=42")?.start).toBe(42);
    expect(parseYoutubeVideo("https://youtu.be/dQw4w9WgXcQ?t=soon")?.start).toBe(0);
  });

  it("refuses links without a video and other sites", () => {
    for (const link of [
      "https://www.youtube.com/@channel",
      "https://www.youtube.com/playlist?list=PL123",
      "https://www.youtube.com/watch?v=short",
      "https://youtu.be/",
      "https://vimeo.com/123",
      "javascript:alert(1)",
    ]) {
      expect(parseYoutubeVideo(link)).toBeNull();
    }
  });
});

describe("youtubeEmbedUrl", () => {
  it("uses the privacy-enhanced mode and starts at once", () => {
    expect(youtubeEmbedUrl({ id: "dQw4w9WgXcQ", start: 0 })).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0",
    );
    expect(youtubeEmbedUrl({ id: "dQw4w9WgXcQ", start: 90 })).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&start=90",
    );
  });
});
