import "server-only";

import { after } from "next/server";

import { getRequestI18n } from "@/i18n/music/server";
import { isPushEnabled, sendPush } from "@/server/music/push";
import { listLivePushTargets, removeGoneEndpoints } from "./push-subscriptions";

/** A live session is of no use some time after it started. */
export const LIVE_SESSION_PUSH_TTL_S = 30 * 60;

/**
 * Tells the volunteers of the event that its live session started: a push after the response. The
 * payload has a fixed text, the link and a tag: no name, no title of the event. A failure is logged
 * and never fails the start. Without VAPID configuration (the demo) nothing is sent.
 */
export async function notifyLiveSessionStarted(
  eventId: string,
  sessionId: string,
  leaderId: string,
): Promise<void> {
  if (!isPushEnabled()) return;
  try {
    const [targets, { m }] = await Promise.all([
      listLivePushTargets(eventId, leaderId),
      getRequestI18n(),
    ]);
    if (targets.length === 0) return;
    const payload = {
      title: m.notifications.push.liveSession.title,
      body: m.notifications.push.liveSession.body,
      url: `/munkater/kotta?session=${sessionId}`,
      tag: `live_session/${sessionId}`,
    };
    after(async () => {
      try {
        const { gone } = await sendPush(targets, payload, {
          ttlSeconds: LIVE_SESSION_PUSH_TTL_S,
          urgency: "high",
        });
        await removeGoneEndpoints(gone);
      } catch (error) {
        console.error(
          "[push] live session push failed:",
          error instanceof Error ? error.name : "error",
        );
      }
    });
  } catch (error) {
    console.error(
      "[push] could not prepare the live session push:",
      error instanceof Error ? error.name : "error",
    );
  }
}
