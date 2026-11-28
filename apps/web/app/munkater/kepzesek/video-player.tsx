"use client";

import { useLayoutEffect, useState } from "react";
import { CirclePlayIcon, ExternalLinkIcon } from "lucide-react";

import { useI18n } from "@/i18n/music/client";
import { parseYoutubeVideo, youtubeEmbedUrl } from "@/lib/music/youtube";

/**
 * The YouTube video of a lesson. First a dark box with a play button: the
 * browser sends nothing to YouTube. A click loads the player of
 * youtube-nocookie.com, which starts the video (see the privacy notice).
 */
export function VideoPlayer({ url, title }: { url: string; title: string }) {
  const { m, format } = useI18n();
  const t = m.courses.video;
  const [playing, setPlaying] = useState(false);
  const video = parseYoutubeVideo(url);

  // Next.js keeps the last pages hidden (React Activity, `display: none`),
  // and a hidden player can still play, or start again. When the page
  // hides, the player goes: the dark box shows again on the return.
  useLayoutEffect(() => () => setPlaying(false), []);

  if (!video) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4"
      >
        <ExternalLinkIcon className="size-4" />
        {t.openOnYoutube}
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-950">
        {playing ? (
          <iframe
            src={youtubeEmbedUrl(video)}
            title={format(t.playerTitle, { title })}
            className="absolute inset-0 size-full"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-neutral-100 outline-none hover:bg-neutral-900 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            <CirclePlayIcon className="size-14" aria-hidden />
            <span className="max-w-md text-base font-medium">{title}</span>
            <span className="max-w-md text-xs text-neutral-400">{t.consent}</span>
          </button>
        )}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 self-start text-sm text-muted hover:text-foreground"
      >
        <ExternalLinkIcon className="size-4" />
        {t.openOnYoutube}
      </a>
    </div>
  );
}
