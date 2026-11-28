"use client";

import { useRef, useState } from "react";
import { CirclePlayIcon, DownloadIcon, ExternalLinkIcon, LinkIcon } from "lucide-react";

import { useI18n } from "@/i18n/music/client";
import { linkHost } from "@/lib/music/links";
import { cn } from "@/lib/music/utils";

// The sound files and the links of a song: on the song, on the edit page and
// in the rehearsal mode of the sheet.

type SoundFile = { name: string; url: string };

/**
 * The shortest time between two new starts of a file after an error. A new
 * start is for a signed URL that ended (`PLAY_URL_SECONDS`); a file that fails
 * again soon has another problem.
 */
const RESTART_GAP_MS = 10_000;
type Link = { name: string; url: string; isYoutube: boolean };

/**
 * The player of the browser for a sound file, with a download button. It
 * gets nothing before the user starts it: each file is a request for a signed
 * URL. The signed URL works for a short time only: when it ends during a
 * rehearsal, the player gets a new one and goes on at the same time.
 * `details` shows under the name, e.g. the arrangements.
 */
export function SoundFilePlayer({
  file,
  details,
  className,
}: {
  file: SoundFile;
  details?: string;
  className?: string;
}) {
  const { m, format } = useI18n();
  const t = m.components.songMedia;
  const [failed, setFailed] = useState(false);
  // True after the first playback: an error before it is not an ended URL.
  const played = useRef(false);
  const playing = useRef(false);
  const lastRestart = useRef(0);
  // The place and the state to go back to after a new start.
  const resume = useRef<{ time: number; play: boolean } | null>(null);

  function onError(audio: HTMLAudioElement) {
    const now = Date.now();
    if (!played.current || now - lastRestart.current < RESTART_GAP_MS) {
      setFailed(true);
      return;
    }
    lastRestart.current = now;
    resume.current = { time: audio.currentTime, play: playing.current };
    // The route sends the player to a new signed URL (the redirect is not cached).
    audio.src = file.url;
    audio.load();
  }

  function onLoadedMetadata(audio: HTMLAudioElement) {
    const place = resume.current;
    resume.current = null;
    if (!place) return;
    audio.currentTime = place.time;
    if (place.play) audio.play().catch(() => setFailed(true));
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{file.name}</span>
          {details && <span className="truncate text-sm text-muted">{details}</span>}
        </span>
        <a
          href={`${file.url}?download=1`}
          aria-label={format(t.download, { name: file.name })}
          title={format(t.download, { name: file.name })}
          className="flex size-8 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:ring-3 focus-visible:ring-focus/50 focus-visible:outline-none pointer-coarse:size-9"
        >
          <DownloadIcon className="size-4" />
        </a>
      </div>
      <audio
        controls
        preload="none"
        src={file.url}
        aria-label={format(t.player, { name: file.name })}
        onError={(event) => onError(event.currentTarget)}
        onLoadedMetadata={(event) => onLoadedMetadata(event.currentTarget)}
        onPlay={() => {
          playing.current = true;
        }}
        onPause={() => {
          playing.current = false;
        }}
        onPlaying={() => {
          played.current = true;
          setFailed(false);
        }}
        className="h-10 w-full"
      />
      {failed && (
        <p role="alert" className="text-xs text-danger">
          {t.playFailed}
        </p>
      )}
    </div>
  );
}

/**
 * A link of a song. It opens in a new tab, without the address of the app
 * (`noreferrer`). A YouTube link has its own icon. `details` shows under the
 * name, e.g. the arrangements.
 */
export function SongLinkAnchor({
  link,
  details,
  className,
}: {
  link: Link;
  details?: string;
  className?: string;
}) {
  const { m } = useI18n();
  const t = m.components.songMedia;
  const Icon = link.isYoutube ? CirclePlayIcon : LinkIcon;

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex min-w-0 items-center gap-2 transition-colors select-none hover:bg-surface-sunken/50 pointer-coarse:active:bg-surface-sunken",
        className,
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0 text-muted" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{link.name}</span>
        <span className="truncate text-sm text-muted">
          {link.isYoutube ? t.youtube : linkHost(link.url)}
          {details && (
            <>
              {m.common.separator}
              {details}
            </>
          )}
        </span>
      </span>
      <ExternalLinkIcon aria-hidden className="size-4 shrink-0 text-muted" />
      <span className="sr-only">{t.newTab}</span>
    </a>
  );
}
