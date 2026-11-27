"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { realtimeClient } from "@/lib/music/realtime/browser";
import type { RealtimeChannel, RealtimeConnection } from "@/lib/music/realtime/client";

import { STOPPED_GRID, type BeatGrid } from "@/lib/music/live/beat-grid";
import { ServerClock } from "@/lib/music/live/clock-sync";
import {
  LIVE_END_EVENT,
  LIVE_HEARTBEAT_MS,
  LIVE_STATE_EVENT,
  newerState,
  parseLivePresence,
  parseLiveState,
  restoredLiveState,
  storedLiveState,
  type LivePosition,
  type LivePresence,
  type LiveState,
} from "@/lib/music/live/protocol";
import { createStoredString } from "@/lib/music/browser";
import type { LiveSessionDTO } from "@/server/music/models/live-sessions";

type Channel = RealtimeChannel;

// The latest state of the session in this tab: after a reload, the leader
// goes on from it (see `restoredLiveState`). Only for a reload: the hook
// removes it when the sheet closes, or the session ends.
const stateStore = createStoredString("live-state", "session");

/** What the sheet page gives the viewer for a live session. */
export type LiveSessionProps = {
  session: LiveSessionDTO;
  /** `name`: the display name, or empty. Never the email: the other participants see it. */
  me: { id: string; name: string };
  connection: RealtimeConnection;
};

export type LiveStatus = "connecting" | "live" | "ended" | "failed";

export type LiveSession = ReturnType<typeof useLiveSession>;

/**
 * The live session of the sheet: the Realtime channel, the participants, the
 * shared clock, and the state of the leader. Without `props`, it does nothing.
 *
 * Realtime checks the access when the browser joins the channel, and keeps
 * the result. So the browser joins again when this user becomes the leader,
 * or stops being the leader: only then can it send, or not.
 */
export function useLiveSession(props: LiveSessionProps | null) {
  const topic = props?.session.topic ?? null;
  const sessionId = props?.session.id ?? null;
  const sessionLeaderId = props?.session.leaderId ?? null;
  const me = props?.me ?? null;
  const [clock] = useState(() => new ServerClock());
  const clockEstimate = useSyncExternalStore(clock.subscribe, clock.getEstimate, () => null);
  const [state, setState] = useState<LiveState | null>(null);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [participants, setParticipants] = useState<LivePresence[]>([]);
  const [following, setFollowing] = useState(true);

  // After a reload: the state that this tab kept. Without it, the leader's
  // first change (e.g. its place on the sheet or its metronome) would send
  // the first song and no keys to all. The session can come after the first
  // render, with the fresh data. Only in the browser: the sheet viewer mounts there only.
  const [restoredSession, setRestoredSession] = useState<string | null>(null);
  if (sessionId && sessionId !== restoredSession) {
    setRestoredSession(sessionId);
    const restored =
      !state && sessionLeaderId
        ? restoredLiveState(stateStore.get(), sessionId, sessionLeaderId)
        : null;
    if (restored) setState(restored);
  }
  // Another leader can change the state while this tab is not on the sheet:
  // a kept state would undo the changes. React does not unmount the sheet when the page unloads.
  useEffect(() => {
    if (sessionId) return () => stateStore.set(null);
  }, [sessionId]);

  const leaderId = state?.leaderId ?? props?.session.leaderId ?? null;
  const isLeader = me !== null && leaderId === me.id;
  const leaderOnline = participants.some((participant) => participant.userId === leaderId);

  // The latest values, for the callbacks of the channel.
  const stateRef = useRef<LiveState | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const sendRef = useRef<((event: string, payload: object) => void) | null>(null);
  const isLeaderRef = useRef(isLeader);
  const presenceRef = useRef<LivePresence | null>(null);
  const clockErrorMs = clockEstimate ? Math.ceil(clockEstimate.error) : null;
  const presence: LivePresence | null = me && {
    userId: me.id,
    name: me.name,
    following,
    clockErrorMs,
  };
  const sessionIdRef = useRef(sessionId);
  useLayoutEffect(() => {
    isLeaderRef.current = isLeader;
    presenceRef.current = presence;
    sessionIdRef.current = sessionId;
  });

  // The restored state, before the effects, which can send.
  useLayoutEffect(() => {
    if (state && !stateRef.current) stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!topic) return;
    return clock.start();
  }, [clock, topic]);

  const connection = props?.connection;
  const myId = me?.id;
  useEffect(() => {
    if (!topic || !connection || !myId) return;
    // The session cookies are `httpOnly`, so the client asks the server for the access token.
    const supabase = realtimeClient(connection);
    const channel = supabase.channel(topic, { presenceKey: myId });
    channelRef.current = channel;

    // Over the joined channel, else over REST, e.g. on a network that blocks
    // WebSockets (`send()` would do it too, with a warning). Before the first
    // token, the policies refuse it: the join sends the latest state then (see `sendState`).
    let authReady = false;
    function send(event: string, payload: object) {
      if (channel.state === "joined") {
        void channel.send({ type: "broadcast", event, payload });
      } else if (authReady) {
        // The next change or heartbeat sends the state again.
        channel
          .httpSend(event, payload)
          .catch((error: unknown) => console.warn("[live] Failed to send over REST:", error));
      }
    }
    sendRef.current = send;

    function sendState() {
      const current = stateRef.current;
      if (isLeaderRef.current && current) send(LIVE_STATE_EVENT, current);
    }

    channel
      .on("broadcast", { event: LIVE_STATE_EVENT }, ({ payload }) => {
        const incoming = parseLiveState(payload);
        if (!incoming) return;
        const next = newerState(stateRef.current, incoming);
        if (next === stateRef.current) return;
        stateRef.current = next;
        setState(next);
        // A participant who gets the lead later goes on from it after a reload too.
        if (sessionIdRef.current) stateStore.set(storedLiveState(sessionIdRef.current, next));
      })
      .on("broadcast", { event: LIVE_END_EVENT }, () => {
        setStatus("ended");
        stateStore.set(null);
      })
      .on("presence", { event: "sync" }, () => {
        setParticipants(parseLivePresence(Object.values(channel.presenceState()).flat()));
      })
      // A new participant gets the state at once, not after the next heartbeat.
      .on("presence", { event: "join" }, sendState);

    // The join message has the token that Realtime has at that time. Without
    // a token, the policies refuse the private channel. So join after the
    // first token is ready.
    let removed = false;
    void supabase.setAuth().then(() => {
      if (removed) return;
      authReady = true;
      channel.subscribe((channelStatus) => {
        if (channelStatus === "SUBSCRIBED") {
          setStatus("live");
          if (presenceRef.current) void channel.track(presenceRef.current);
          sendState();
        } else if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT") {
          // Also when the session has ended: the policies refuse the channel.
          setStatus((current) => (current === "ended" ? current : "failed"));
        }
      });
    });

    const heartbeat = isLeader ? setInterval(sendState, LIVE_HEARTBEAT_MS) : undefined;
    return () => {
      removed = true;
      clearInterval(heartbeat);
      channelRef.current = null;
      sendRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [topic, connection, myId, isLeader]);

  // The participants see who follows the leader, and how exact the clock of each device is.
  // The channel sends it again when it joins.
  const name = me?.name;
  useEffect(() => {
    if (status !== "live" || !myId || name === undefined) return;
    void channelRef.current?.track({
      userId: myId,
      name,
      following,
      clockErrorMs,
    } satisfies LivePresence);
  }, [status, myId, name, following, clockErrorMs]);

  // Stable functions: they read the latest values from the refs.
  const meRef = useRef(me);
  useLayoutEffect(() => {
    meRef.current = me;
  });
  const [actions] = useState(() => {
    /** Changes the state of the leader, and sends it while this user leads. */
    function publish(update: (state: LiveState, myId: string) => LiveState) {
      const myId = meRef.current?.id;
      if (!myId) return;
      // The numbers start at the shared time: after a reload, the leader's new
      // state and grid are newer than the ones that the others have.
      const now = Math.round(clock.now());
      const base = stateRef.current ?? {
        seq: now,
        leaderId: myId,
        grid: { ...STOPPED_GRID, epoch: now },
        position: null,
        keys: {},
      };
      const next = { ...update(base, myId), seq: Math.max(base.seq + 1, now) };
      stateRef.current = next;
      setState(next);
      if (sessionIdRef.current) stateStore.set(storedLiveState(sessionIdRef.current, next));
      // Also for a change of the leader: until this browser joins the channel again, it can still send.
      if (isLeaderRef.current) sendRef.current?.(LIVE_STATE_EVENT, next);
    }

    return {
      /** The leader's place in the sheet. */
      setPosition(position: LivePosition | null) {
        if (!isLeaderRef.current || samePosition(stateRef.current?.position ?? null, position))
          return;
        publish((state, myId) => ({ ...state, leaderId: myId, position }));
      },
      /** The leader's key for a song of the sheet, in English note names. Null removes it. */
      setKey(songId: string, key: string | null) {
        if (!isLeaderRef.current) return;
        publish((state, myId) => {
          const keys = { ...state.keys };
          if (key === null) delete keys[songId];
          else keys[songId] = key;
          return { ...state, leaderId: myId, keys };
        });
      },
      /** The leader's metronome. */
      setGrid(grid: BeatGrid) {
        if (!isLeaderRef.current) return;
        publish((state, myId) => ({ ...state, leaderId: myId, grid }));
      },
      /** After the server gave the lead to `userId`. */
      handOver(userId: string) {
        publish((state) => ({ ...state, leaderId: userId }));
      },
      /** After the server gave the lead to this user. */
      takeLead() {
        publish((state, myId) => ({ ...state, leaderId: myId }));
      },
      /** After the server ended the session. */
      end() {
        // Only over the joined channel: Realtime checked the access when it
        // joined. Over REST, the policies refuse it, because the session has ended.
        const channel = channelRef.current;
        if (channel?.state === "joined")
          void channel.send({ type: "broadcast", event: LIVE_END_EVENT, payload: {} });
        setStatus("ended");
        stateStore.set(null);
      },
    };
  });

  return {
    active: props !== null,
    status,
    clock,
    clockEstimate,
    me,
    leaderId,
    isLeader,
    leaderOnline,
    participants,
    state,
    following: following && !isLeader,
    setFollowing,
    ...actions,
  };
}

function samePosition(a: LivePosition | null, b: LivePosition | null) {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.songId === b.songId &&
      a.section === b.section &&
      !!a.written === !!b.written)
  );
}
