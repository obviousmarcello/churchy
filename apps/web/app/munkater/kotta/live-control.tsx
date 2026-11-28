"use client";

import { useState, useTransition } from "react";
import { Popover } from "@base-ui/react/popover";
import { CopyIcon, CrownIcon, RadioIcon, Share2Icon } from "lucide-react";

import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import { useBrowserValue } from "@/lib/music/browser";
import { liveSheetHref } from "@/lib/music/next-path";
import { cn } from "@/lib/music/utils";
import { Choice } from "./choice";
import {
  endLiveSessionAction,
  handOverLiveSessionAction,
  takeLiveSessionLeadAction,
  type LiveSessionChangeResult,
} from "./live-actions-client";
import type { LiveSession } from "./live-session";
import type { LiveSessionDTO } from "@/server/music/models/live-sessions";

/** Above this possible error, the clicks of two devices can sound apart. In ms. */
const GOOD_SYNC_MS = 10;

/**
 * The live session in the header of the sheet: a button with the state of
 * the connection and the number of participants. It opens the details: who
 * leads, who follows, how exact the shared metronome is, and the actions.
 */
export function LiveControl({
  live,
  session,
  title,
}: {
  live: LiveSession;
  session: LiveSessionDTO;
  /** The title of the sheet: the event, or the setlist. */
  title: string;
}) {
  const { m, format, plural } = useI18n();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { status, isLeader, leaderOnline, participants, clockEstimate, me } = live;
  const leader = participants.find((participant) => participant.userId === live.leaderId);
  // A user without a display name: the presence has no email (see `LivePresence`).
  const participantName = (participant: { name: string }) =>
    participant.name || m.sheet.live.unnamedParticipant;
  const canTakeLead = session.isSessionAdmin && !isLeader && !leaderOnline;
  const canEnd = isLeader || session.isSessionAdmin;
  const errorMs = clockEstimate ? Math.ceil(clockEstimate.error) : null;
  const inSync = errorMs !== null && errorMs <= GOOD_SYNC_MS;

  const statusText =
    status === "connecting"
      ? m.sheet.live.connecting
      : status === "ended"
        ? m.sheet.live.ended
        : status === "failed"
          ? m.sheet.live.failed
          : isLeader
            ? m.sheet.live.youLead
            : !leaderOnline
              ? m.sheet.live.leaderOffline
              : !live.state
                ? m.sheet.live.waiting
                : format(m.sheet.live.leader, { name: leader ? participantName(leader) : "" });
  const healthy = status === "live" && (isLeader || leaderOnline) && (errorMs === null || inSync);

  function run(action: () => Promise<LiveSessionChangeResult>, onSuccess: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.status === "success") onSuccess();
      else setError(result.message);
    });
  }

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 gap-1.5 px-2 pointer-coarse:h-9",
              (status === "ended" || status === "failed") && "text-danger",
            )}
            aria-label={`${m.sheet.live.badge}${participants.length > 0 ? ` ${participants.length}` : ""}${m.common.separator}${m.sheet.live.title}${m.common.separator}${statusText}`}
            title={statusText}
          />
        }
      >
        <span
          aria-hidden
          className={cn(
            "size-2 rounded-full",
            healthy
              ? "bg-success"
              : status === "ended" || status === "failed"
                ? "bg-danger"
                : "bg-warning",
            healthy && "animate-pulse",
          )}
        />
        <RadioIcon />
        {/* Tablets and small laptops: the header has more buttons, and no room for the text. */}
        <span className="hidden sm:max-md:inline xl:inline">{m.sheet.live.badge}</span>
        {participants.length > 0 && <span className="tabular-nums">{participants.length}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="z-50" sideOffset={8} align="end" collisionPadding={8}>
          <Popover.Popup className="flex max-h-[var(--available-height)] w-80 max-w-[calc(100vw-1rem)] origin-[var(--transform-origin)] flex-col gap-4 overflow-y-auto rounded-card border bg-surface-raised p-4 text-text shadow-lg outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <div className="flex flex-col gap-1">
              <Popover.Title className="text-sm font-semibold">{m.sheet.live.title}</Popover.Title>
              <p aria-live="polite" className="text-sm text-muted">
                {statusText}
              </p>
              <p className="text-xs text-muted">
                {errorMs === null
                  ? m.sheet.live.syncing
                  : format(inSync ? m.sheet.live.syncGood : m.sheet.live.syncPoor, { ms: errorMs })}
              </p>
            </div>

            {status === "live" && <ShareLink sessionId={session.id} title={title} />}

            {!isLeader && status === "live" && (
              <Choice
                label={m.sheet.live.follow}
                value={live.following}
                options={[
                  { value: true, label: m.sheet.settings.on },
                  { value: false, label: m.sheet.settings.off },
                ]}
                onChange={live.setFollowing}
              />
            )}

            {participants.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-muted">
                  {plural(m.sheet.live.participants, participants.length)}
                </p>
                <ul className="flex flex-col gap-1">
                  {participants.map((participant) => {
                    const isParticipantLeader = participant.userId === live.leaderId;
                    const isMe = participant.userId === me?.id;
                    return (
                      <li
                        key={participant.userId}
                        className="flex min-h-7 items-center gap-2 text-sm"
                      >
                        {isParticipantLeader ? (
                          <CrownIcon aria-hidden className="size-3.5 shrink-0 text-warning" />
                        ) : (
                          <span aria-hidden className="size-3.5 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {isMe
                            ? format(m.sheet.live.you, { name: participantName(participant) })
                            : participantName(participant)}
                          {!isParticipantLeader && !participant.following && (
                            <span className="text-muted">
                              {m.common.separator}
                              {m.sheet.live.notFollowingShort}
                            </span>
                          )}
                        </span>
                        {isLeader && !isMe && status === "live" && (
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={pending}
                            onClick={() =>
                              run(
                                () => handOverLiveSessionAction(session.id, participant.userId),
                                () => live.handOver(participant.userId),
                              )
                            }
                          >
                            {m.sheet.live.handOver}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            {status === "live" && (canTakeLead || canEnd) && (
              <div className="flex flex-wrap gap-2 border-t pt-4">
                {canTakeLead && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => takeLiveSessionLeadAction(session.id), live.takeLead)}
                  >
                    <CrownIcon />
                    {m.sheet.live.takeLead}
                  </Button>
                )}
                {canEnd && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => endLiveSessionAction(session.id), live.end)}
                  >
                    {m.sheet.live.end}
                  </Button>
                )}
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The link of the session: with the share sheet of the device, or to the clipboard. */
function ShareLink({ sessionId, title }: { sessionId: string; title: string }) {
  const { m, format } = useI18n();
  const [copied, setCopied] = useState(false);
  const canShare = useBrowserValue(() => typeof navigator.share === "function", false);

  function href() {
    return new URL(liveSheetHref(sessionId), window.location.origin).href;
  }

  function share() {
    // Cancelled by the user, or not allowed: nothing to do.
    navigator
      .share({ title: format(m.sheet.live.shareTitle, { title }), url: href() })
      .catch(() => {});
  }

  function copy() {
    navigator.clipboard.writeText(href()).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted">{m.sheet.live.shareHint}</p>
      <div className="flex flex-wrap gap-2">
        {canShare && (
          <Button variant="outline" size="sm" onClick={share}>
            <Share2Icon />
            {m.sheet.live.shareLink}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={copy}>
          <CopyIcon />
          {m.sheet.live.copyLink}
        </Button>
      </div>
      {copied && (
        <p role="status" className="text-xs text-success">
          {m.sheet.live.linkCopied}
        </p>
      )}
    </div>
  );
}
