"use client";

import { useEffect, useState } from "react";
import { realtimeClient } from "@/lib/music/realtime/browser";
import type { RealtimeConnection } from "@/lib/music/realtime/client";

import {
  LIVE_END_EVENT,
  LIVE_STATE_EVENT,
  newerState,
  parseLiveState,
  type LiveState,
} from "@/lib/music/live/protocol";

/** The running live session of the event, which the controller watches. */
export type ProjectionLiveSession = {
  topic: string;
  connection: RealtimeConnection;
};

/**
 * The state of the leader of the event's live session: the place (the song,
 * which is the setlist item, and the section) and the shared metronome (the
 * grid). Null without a session, before the first state, or after the end.
 *
 * The controller only listens: it does not show itself with Presence, so the
 * participants of the session do not see it. The leader sends the state
 * every few seconds (`LIVE_HEARTBEAT_MS`), so it comes soon after the join.
 */
export function useLeaderState(session: ProjectionLiveSession | null): LiveState | null {
  // Of one session: a new session (a new topic) starts without a state.
  const [received, setReceived] = useState<{
    topic: string;
    state: LiveState | null;
    ended: boolean;
  } | null>(null);

  const topic = session?.topic;
  const connection = session?.connection;
  useEffect(() => {
    if (!topic || !connection) return;
    const supabase = realtimeClient(connection);
    const channel = supabase.channel(topic);
    channel
      .on("broadcast", { event: LIVE_STATE_EVENT }, ({ payload }) => {
        const incoming = parseLiveState(payload);
        if (!incoming) return;
        setReceived((current) => {
          const base = current?.topic === topic ? current : { topic, state: null, ended: false };
          const state = newerState(base.state, incoming);
          return base === current && state === base.state ? current : { ...base, state };
        });
      })
      .on("broadcast", { event: LIVE_END_EVENT }, () => {
        setReceived((current) => ({
          topic,
          state: current?.topic === topic ? current.state : null,
          ended: true,
        }));
      });

    let removed = false;
    void supabase.setAuth().then(() => {
      if (!removed) channel.subscribe();
    });
    return () => {
      removed = true;
      void supabase.removeChannel(channel);
    };
  }, [topic, connection]);

  if (!received || received.topic !== topic || received.ended) return null;
  return received.state;
}
