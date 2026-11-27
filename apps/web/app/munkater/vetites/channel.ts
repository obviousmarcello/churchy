"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  PROJECTION_CLOSE_EVENT,
  PROJECTION_COMMAND_EVENT,
  PROJECTION_IMAGES_EVENT,
  PROJECTION_MODULE_OFF_EVENT,
  PROJECTION_OVERLAY_CLOSED_EVENT,
  PROJECTION_OVERLAY_EVENT,
  PROJECTION_SCREEN_CLOSED_EVENT,
  PROJECTION_SCREEN_EVENT,
  PROJECTION_STATE_EVENT,
  PROJECTION_SYNC_EVENT,
  PROJECTION_THEMES_EVENT,
  projectionChannelName,
} from "@/lib/music/projection/protocol";
import { realtimeClient } from "@/lib/music/realtime/browser";
import type { RealtimeChannel } from "@/lib/music/realtime/client";
import type { ProjectionConnectionDTO } from "@/server/music/models/projections";

type Channel = RealtimeChannel;

const EVENTS = [
  PROJECTION_STATE_EVENT,
  PROJECTION_SYNC_EVENT,
  PROJECTION_SCREEN_EVENT,
  PROJECTION_SCREEN_CLOSED_EVENT,
  PROJECTION_CLOSE_EVENT,
  PROJECTION_COMMAND_EVENT,
  PROJECTION_THEMES_EVENT,
  PROJECTION_IMAGES_EVENT,
  PROJECTION_OVERLAY_EVENT,
  PROJECTION_OVERLAY_CLOSED_EVENT,
];

export type ProjectionEvent = (typeof EVENTS)[number];

/**
 * "local": only the windows of this browser (a rehearsal). "connecting" and
 * "failed": the windows of this browser work, but not the other devices.
 */
export type ProjectionChannelStatus = "local" | "connecting" | "live" | "failed";

/** The channel of an event's projection, or of the rehearsal of this browser (`eventId` null). */
export type ProjectionChannelConfig = {
  eventId: string | null;
  /** Null for a rehearsal: it runs in one browser only. */
  connection: ProjectionConnectionDTO | null;
};

/**
 * The channel between the controllers and the screens: a `BroadcastChannel`
 * for the windows of this browser, and for an event also the Realtime
 * channel for the other devices. `send` sends on both, so a window of this
 * browser can get a message twice (see `newerProjectionState`); `sendLocal`
 * sends to the windows of this browser only. `onMessage` gets the payloads
 * unchecked, and `local` is true for a message from a window of this
 * browser. `onConnected` runs when Realtime joins the channel, also again
 * after a lost connection.
 */
export function useProjectionChannel(
  { eventId, connection }: ProjectionChannelConfig,
  handlers: {
    onMessage: (event: ProjectionEvent, payload: unknown, from: { local: boolean }) => void;
    onConnected?: () => void;
  },
) {
  const [status, setStatus] = useState<ProjectionChannelStatus>(
    connection?.connection.mode === "supabase" ? "connecting" : "local",
  );
  const handlersRef = useRef(handlers);
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });
  const local = useRef<BroadcastChannel | null>(null);
  const remote = useRef<{ channel: Channel; joined: boolean } | null>(null);

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(projectionChannelName(eventId));
    channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (typeof data !== "object" || data === null || !("event" in data)) return;
      const { event, payload } = data as { event: unknown; payload?: unknown };
      if (EVENTS.includes(event as ProjectionEvent)) {
        handlersRef.current.onMessage(event as ProjectionEvent, payload, { local: true });
      }
    };
    local.current = channel;
    return () => {
      local.current = null;
      channel.close();
    };
  }, [eventId]);

  const realtime = connection?.connection;
  const topic = connection?.topic;
  useEffect(() => {
    // Without a Supabase project (the demo), the windows of this browser are all there is: the
    // `BroadcastChannel` above reaches them already.
    if (realtime?.mode !== "supabase" || !topic) return;
    // The session cookies are `httpOnly`, so the client asks the server for the access token.
    const supabase = realtimeClient(realtime);
    const channel = supabase.channel(topic);
    const state = { channel, joined: false };
    remote.current = state;
    for (const event of EVENTS) {
      // Not "close": it is for the windows of one browser.
      if (event === PROJECTION_CLOSE_EVENT) continue;
      channel.on("broadcast", { event }, ({ payload }) =>
        handlersRef.current.onMessage(event, payload, { local: false }),
      );
    }
    // The module "projection" is off now: the page loads again and says so (see `saveModules()`).
    channel.on("broadcast", { event: PROJECTION_MODULE_OFF_EVENT }, () => window.location.reload());

    // Join after the first token is ready: without one, the policies refuse the private channel.
    let removed = false;
    void supabase.setAuth().then(() => {
      if (removed) return;
      channel.subscribe((channelStatus) => {
        state.joined = channelStatus === "SUBSCRIBED";
        if (channelStatus === "SUBSCRIBED") {
          setStatus("live");
          handlersRef.current.onConnected?.();
        } else if (
          channelStatus === "CHANNEL_ERROR" ||
          channelStatus === "TIMED_OUT" ||
          channelStatus === "CLOSED"
        ) {
          // Realtime joins again by itself when the connection comes back.
          setStatus("failed");
        }
      });
    });

    return () => {
      removed = true;
      remote.current = null;
      void supabase.removeChannel(channel);
    };
  }, [realtime, topic]);

  // Stable: they read the channels from the refs.
  const [senders] = useState(() => ({
    send(event: ProjectionEvent, payload: unknown) {
      local.current?.postMessage({ event, payload });
      const channel = remote.current;
      // Not before the join: the client would send the message over HTTP instead.
      if (channel?.joined)
        void channel.channel.send({ type: "broadcast", event, payload }).catch(() => {});
    },
    sendLocal(event: ProjectionEvent, payload: unknown) {
      local.current?.postMessage({ event, payload });
    },
  }));

  return { status, ...senders };
}
