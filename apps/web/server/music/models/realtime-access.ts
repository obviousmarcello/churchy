import "server-only";

import { cache } from "react";
import { z } from "zod";

import { isWorkspaceModuleOn } from "@/server/workspace-nav";
import { requireUser } from "@/server/music/auth";
import { getMusicSupabase } from "@/server/music/db";
import { getRealtimeConnection, type RealtimeGrants } from "@/server/music/realtime";
import type { RealtimeConnection } from "@/lib/music/realtime/client";
import { canSeeEvent } from "./event-access";
import { databaseError, isId } from "./shared";

// Who may use which realtime topic (the channels are described in `lib/music/realtime/client.ts`):
// - `projection:event:<id>`: the controllers and screens of an event's projection: the volunteers
//   of the event and the event admins who can see it (`can_project_event`), while the module
//   "projection" is on. Everyone who may use it may send.
// - `event:<id>`: the change notices of an event (sent by the database): who can see the event.
// - `live:<session id>`: see `live-sessions.ts` (the leader sends, the participants receive).
// A rehearsal projection runs in one browser (BroadcastChannel), so it needs no topic.

/** The user can control and show the projection of the event. Checked once per request. */
export const canProjectEvent = cache(async (eventId: string): Promise<boolean> => {
  if (!isId(eventId)) return false;
  const user = await requireUser();
  if (!(await isWorkspaceModuleOn("ws.music.projection"))) return false;
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("can_project_event", {
    p_event_id: eventId,
    p_user_id: user.id,
    p_is_admin: user.canEditEvents,
  });
  if (error) throw databaseError("check projection access", error);
  return z.boolean().parse(data);
});

export const projectionTopic = (eventId: string) => `projection:event:${eventId}`;
export const eventTopic = (eventId: string) => `event:${eventId}`;

const PROJECTION_TOPIC = /^projection:event:([0-9a-f-]{36})$/;
const EVENT_TOPIC = /^event:([0-9a-f-]{36})$/;
const LIVE_TOPIC = /^live:([0-9a-f-]{36})$/;

/** The topics of `topics` that the signed-in user may use, and the ones they may send on. */
export async function authorizeRealtimeTopics(
  topics: readonly string[],
  liveAccess: (sessionId: string) => Promise<"lead" | "join" | null> = async () => null,
): Promise<RealtimeGrants> {
  const user = await requireUser();
  const receive: string[] = [];
  const send: string[] = [];
  for (const topic of [...new Set(topics)].slice(0, 20)) {
    const projection = PROJECTION_TOPIC.exec(topic)?.[1];
    const event = EVENT_TOPIC.exec(topic)?.[1];
    const live = LIVE_TOPIC.exec(topic)?.[1];
    if (projection !== undefined) {
      if (await canProjectEvent(projection)) {
        receive.push(topic);
        send.push(topic);
      }
    } else if (event !== undefined) {
      if (isId(event) && (await canSeeEvent(user.id, event, user.canEditEvents)))
        receive.push(topic);
    } else if (live !== undefined) {
      const access = await liveAccess(live);
      if (access !== null) receive.push(topic);
      if (access === "lead") send.push(topic);
    }
  }
  return { receive, send };
}

/** What the browser needs to connect to the realtime transport. */
export async function getConnection(): Promise<RealtimeConnection> {
  return getRealtimeConnection(await requireUser());
}
