import "server-only";

import { demoModeEnabled } from "@/lib/demo/flag";
import { appendMusicOutbox } from "@/server/data-adapters";
import { getDemoState } from "@/server/demo";

/**
 * The outbox of the music notifications. Churchy has no mail transport yet (SDD §4.4): everything
 * that would be sent is listed in the outbox (demo: the outbox viewer). A message carries only a
 * reference (the event id), the start time of the event and an app link: no name, no title, no
 * setlist content (CLAUDE.md, "no personal data in emails and push payloads").
 */
export type MusicOutboxMessage = {
  tenantId: string;
  /** The music profile id of the recipient. */
  profileId: string;
  channel: "email" | "push";
  template: "music.eventAdded" | "music.eventReminder" | "music.setlist";
  eventId: string;
  startsAt: string;
};

/** The app link of the event, as the outbox viewer and the real mails will use it. */
export function eventLink(eventId: string, template: MusicOutboxMessage["template"]): string {
  return template === "music.setlist"
    ? `/munkater/kotta?event=${eventId}`
    : `/munkater/esemenyek/${eventId}`;
}

/** The demo session of the request (its own outbox), or null. Resolve it inside the request: it reads the cookies. */
export async function outboxSessionId(): Promise<string | null> {
  return demoModeEnabled() ? ((await getDemoState())?.sessionId ?? null) : null;
}

/** `sessionId`: from `outboxSessionId()`; without it the request's session is resolved now. */
export async function enqueueMusicOutbox(
  message: MusicOutboxMessage,
  sessionId?: string | null,
): Promise<void> {
  appendMusicOutbox(sessionId === undefined ? await outboxSessionId() : sessionId, {
    tenantId: message.tenantId,
    profileId: message.profileId,
    channel: message.channel,
    template: message.template,
    params: {
      eventId: message.eventId,
      startsAt: message.startsAt,
      link: eventLink(message.eventId, message.template),
    },
  });
}
