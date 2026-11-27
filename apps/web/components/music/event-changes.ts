"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";

import { eventAuthorsAction as eventAuthors } from "@/app/munkater/esemenyek/sync-actions";
import { realtimeClient } from "@/lib/music/realtime/browser";
import type { RealtimeChannel, RealtimeConnection } from "@/lib/music/realtime/client";
import { useI18n } from "@/i18n/music/client";
import type { ItemChanges, MergeConflict, MergeItem } from "@/lib/music/event-items-merge";
import { personName } from "@/lib/music/format";
import {
  parseProjectionState,
  parseScreenInfo,
  projectionTopic,
  SCREEN_TIMEOUT_MS,
} from "@/lib/music/projection/protocol";
import { toastInfo } from "@/lib/music/toast";

// The changes of an event from other users and other tabs: the database sends
// a message to the private Realtime topic `event:<event id>` after each change
// (see the `event_sync` migration). The message has no data, so the page
// loads the event again. A change comes with more messages, e.g. for the items
// and for their themes: they come together after `CHANGES_DELAY_MS`.
// Without a connection, the page loads the event again every `POLL_MS` while
// it is visible, and each time it becomes visible or connects again.

const CHANGES_DELAY_MS = 300;
const POLL_MS = 60_000;

/** What changed, e.g. "items" or "details" (see `private.notify_event()`). The other kinds are for a load without a message. */
export type EventChange = {
  kind:
    | "items"
    | "blocks"
    | "details"
    | "themes"
    | "volunteers"
    | "images"
    | "announcements"
    | "songs"
    | "live"
    | "deleted"
    | "load";
  /** The user who made the change, if the server knows it. */
  author: string | null;
};

/** What the browser needs to join the Realtime topics of an event. */
export type EventConnection = RealtimeConnection;

const changeSchema = z.object({
  kind: z.enum([
    "items",
    "blocks",
    "details",
    "themes",
    "volunteers",
    "images",
    "announcements",
    "songs",
    "live",
    "deleted",
  ]),
  author: z.uuid().nullable().catch(null),
});

/** The authors of the changes; none when the action is denied or fails. */
async function eventAuthorsAction(eventId: string, userIds: string[]) {
  const outcome = await eventAuthors(eventId, userIds);
  return outcome.ok ? outcome.value : [];
}

export function eventTopic(eventId: string): string {
  return `event:${eventId}`;
}

function connectionId(connection: EventConnection): string {
  return connection.mode === "local"
    ? `local ${connection.tenantId} ${connection.userId}`
    : `${connection.url} ${connection.tenantId} ${connection.userId}`;
}

// The leaves that run, by client and topic.
const leaving = new Map<string, Promise<unknown>>();

/**
 * Joins the private topic on the shared client of the user. `setup` adds the
 * listeners and subscribes. Returns the leave. A join waits for a leave of
 * the same topic that still runs, e.g. after a fast remount: until it ends,
 * `channel()` returns the channel that leaves, and a second `subscribe()` throws.
 */
function joinTopic(
  connection: EventConnection,
  topic: string,
  setup: (channel: RealtimeChannel) => void,
): () => void {
  const supabase = realtimeClient(connection);
  const key = `${connectionId(connection)} ${topic}`;
  let channel: RealtimeChannel | null = null;
  let left = false;
  void Promise.all([leaving.get(key), supabase.setAuth()]).then(() => {
    if (left) return;
    channel = supabase.channel(topic);
    setup(channel);
  });
  return () => {
    left = true;
    if (!channel) return;
    const leave: Promise<unknown> = supabase.removeChannel(channel).then(
      () => undefined,
      () => undefined,
    );
    leaving.set(key, leave);
    void leave.then(() => {
      if (leaving.get(key) === leave) leaving.delete(key);
    });
  };
}

/**
 * Calls `onChanges` with the changes of the event, after a short delay for
 * more of them. "online": the messages come. "offline": the connection
 * failed or was lost, not while it connects the first time. Without
 * `connection`, only the loads when the page becomes visible and the polls.
 */
export function useEventChanges(
  eventId: string,
  connection: EventConnection | null,
  onChanges: (changes: EventChange[]) => void,
): { online: boolean; offline: boolean } {
  const [status, setStatus] = useState<"connecting" | "online" | "offline">("connecting");
  const online = status === "online";
  const onChangesRef = useRef(onChanges);
  useLayoutEffect(() => {
    onChangesRef.current = onChanges;
  });

  // The changes that wait for the delay.
  const pending = useRef<{ changes: EventChange[]; timer: ReturnType<typeof setTimeout> | null }>({
    changes: [],
    timer: null,
  });
  const [queue] = useState(() => (change: EventChange) => {
    const state = pending.current;
    state.changes.push(change);
    state.timer ??= setTimeout(() => {
      const changes = state.changes;
      state.changes = [];
      state.timer = null;
      onChangesRef.current(changes);
    }, CHANGES_DELAY_MS);
  });
  useEffect(
    () => () => {
      const timer = pending.current.timer;
      if (timer) clearTimeout(timer);
    },
    [],
  );

  useEffect(() => {
    // Without Supabase (the demo) there are no messages: the page polls.
    if (connection?.mode !== "supabase") return;
    let joined = false;
    const leave = joinTopic(connection, eventTopic(eventId), (channel) => {
      channel.on("broadcast", { event: "changed" }, ({ payload }) => {
        const change = changeSchema.safeParse(payload);
        if (change.success) queue(change.data);
      });
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Again after a lost connection: the messages of the time without it are lost.
          if (joined) queue({ kind: "load", author: null });
          joined = true;
          setStatus("online");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          // Realtime joins again by itself when the connection comes back.
          setStatus("offline");
        }
      });
    });

    return () => {
      leave();
      setStatus("connecting");
    };
  }, [eventId, connection, queue]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") queue({ kind: "load", author: null });
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [queue]);

  useEffect(() => {
    if (online) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") queue({ kind: "load", author: null });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [online, queue]);

  return { online, offline: status === "offline" };
}

/**
 * The projection of the event, as the page of the event sees it: it only
 * receives (see the `event_sync` migration). "running": a screen is open, or
 * a controller sent a slide not long ago. `liveKey`: the item of the slide
 * on the screens. A screen tells it every few seconds, so a page that opens
 * knows it soon.
 */
export function useProjectionLive(
  eventId: string,
  connection: EventConnection | null,
): { running: boolean; liveKey: string | null } {
  const [live, setLive] = useState<{ key: string | null; seenAt: number } | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (connection?.mode !== "supabase") return;
    // The newest state wins: the same state can come from more devices.
    let seq = 0;
    const leave = joinTopic(connection, projectionTopic(eventId), (channel) => {
      channel.on("broadcast", { event: "state" }, ({ payload }) => {
        const state = parseProjectionState(payload);
        if (!state || state.seq < seq) return;
        seq = state.seq;
        const position = state.position;
        setLive({
          key: position && "itemKey" in position ? position.itemKey : null,
          seenAt: Date.now(),
        });
      });
      channel.on("broadcast", { event: "screen" }, ({ payload }) => {
        const info = parseScreenInfo(payload);
        // A screen of an older version does not tell its item.
        if (info?.liveItemKey !== undefined) setLive({ key: info.liveItemKey, seenAt: Date.now() });
        else if (info) setLive((current) => ({ key: current?.key ?? null, seenAt: Date.now() }));
      });
      channel.on("broadcast", { event: "screen-closed" }, () =>
        setLive((current) => current && { ...current, seenAt: 0 }),
      );
      channel.subscribe();
    });
    return () => {
      leave();
      setLive(null);
    };
  }, [eventId, connection]);

  // The projection stops when nothing comes for a while, e.g. after its screens closed.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, [live]);

  const running = live !== null && (now === 0 || now - live.seenAt <= SCREEN_TIMEOUT_MS);
  return { running, liveKey: running ? live.key : null };
}

/** What a notice of the changes of other users tells. */
export type ChangeNotice = {
  /** The users of the changes. Null: an unknown user. */
  authors: (string | null)[];
  /** The changes of the items, with the titles of the items. */
  items?: ItemChanges<MergeItem & { title: string }>;
  /** The changes of this page that did not go in as they were (see `mergeItems`). */
  conflicts?: MergeConflict<MergeItem & { title: string }>[];
  /** Other changes, e.g. "The details changed". */
  other?: string[];
  /** A button of the toast, e.g. to open the event from another page. */
  action?: { label: string; onClick: () => void };
};

/**
 * Shows a toast for the changes of other users, with their names. Nothing
 * when there is nothing to tell, or the user made all the changes here. The
 * function stays the same between renders, so an effect can depend on it.
 */
export function useChangeNotices(eventId: string, userId: string | null) {
  const i18n = useI18n();
  const latest = useRef({ i18n, eventId, userId });
  useLayoutEffect(() => {
    latest.current = { i18n, eventId, userId };
  });
  const names = useRef(new Map<string, string>());

  const [notify] = useState(
    () =>
      async function notify({ authors, items, conflicts = [], other = [], action }: ChangeNotice) {
        const { i18n, eventId, userId } = latest.current;
        const { m, format, list } = i18n;
        const t = m.components.eventChanges;
        const lines = [
          ...(items?.added.length
            ? [format(t.added, { titles: list(items.added.map((item) => item.title)) })]
            : []),
          ...(items?.removed.length
            ? [format(t.removed, { titles: list(items.removed.map((item) => item.title)) })]
            : []),
          ...(items?.changed.length
            ? [format(t.changed, { titles: list(items.changed.map((item) => item.title)) })]
            : []),
          ...(items?.moved ? [t.moved] : []),
          ...other,
          ...conflicts.map((conflict) =>
            format(conflict.kind === "removed" ? t.removedWhileChanged : t.overwritten, {
              title: conflict.item.title,
            }),
          ),
        ];
        if (lines.length === 0) return;

        const others = [...new Set(authors)].filter((author) => author !== userId);
        // Only my changes, e.g. in another tab: no notice, unless a change of mine did not go in.
        if (others.length === 0 && authors.length > 0 && conflicts.length === 0) return;
        const unknown = others.filter(
          (author): author is string => author !== null && !names.current.has(author),
        );
        if (unknown.length > 0) {
          for (const person of await eventAuthorsAction(eventId, unknown))
            names.current.set(person.id, personName(person, i18n));
        }
        const known = others.flatMap((author) =>
          author && names.current.has(author) ? [names.current.get(author)!] : [],
        );
        const title =
          known.length > 0 ? format(t.changedBy, { names: list(known) }) : t.changedByOther;
        toastInfo(title, { description: lines.join(" "), timeout: 8000, action });
      },
  );
  return notify;
}
