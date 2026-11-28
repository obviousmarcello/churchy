"use client";

import {
  createContext,
  use,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { createStoredString } from "@/lib/music/browser";
import { newWindowId, parseScreenInfo, SCREEN_TIMEOUT_MS } from "@/lib/music/projection/protocol";
import {
  parseLastController,
  parseRunningMessage,
  RUNNING_CHANNEL,
  RUNNING_HEARTBEAT_MS,
  RUNNING_TIMEOUT_MS,
  runningProjections,
  type LastController,
  type RunningMessage,
  type RunningProjection,
  type RunningWindow,
} from "@/lib/music/projection/running";
import type { ProjectionConnectionDTO } from "@/server/music/models/projections";
import { eventProjectionConnectionAction } from "./actions-client";
import { useProjectionChannel } from "./channel";

// The event projections that run on this device, for the main menu (see
// `src/lib/projection/running.ts`).

const lastControllerStore = createStoredString("projection-last-controller");

// A clock for the age of the last controller: the time, new each minute, and
// null on the server and in the hydration. Not `Date.now()` in the render:
// the prerender of a page would keep the time of the build.
const CLOCK_MS = 60_000;
let clockTime: number | null = null;
let clockTimer: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<() => void>();

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  // After a time without listeners, the clock is old: React reads it again after the subscription.
  clockTime = Date.now();
  clockTimer ??= setInterval(() => {
    clockTime = Date.now();
    clockListeners.forEach((each) => each());
  }, CLOCK_MS);
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size > 0) return;
    clearInterval(clockTimer);
    clockTimer = undefined;
  };
}

function useClock(): number | null {
  return useSyncExternalStore(
    subscribeClock,
    () => (clockTime ??= Date.now()),
    () => null,
  );
}

/** Deletes the last controller of this browser, e.g. at sign-out: it has the title of an event. */
export function forgetLastController() {
  lastControllerStore.set(null);
}

/** Deletes the last controller when it is older than `LAST_CONTROLLER_MS` or not valid. */
function forgetOldLastController(now: number) {
  const value = lastControllerStore.get();
  if (value && !parseLastController(value, now)) forgetLastController();
}

/**
 * Tells the other windows of this browser that a controller or a screen of
 * the event is open. Nothing for a rehearsal (`eventId` null). A controller
 * also keeps its event as the last controller of this browser, when it opens
 * and when it closes.
 */
export function useAnnounceRunning(
  eventId: string | null,
  controller: { title: string; screens: boolean } | null,
) {
  const [id] = useState(newWindowId);
  const title = controller?.title ?? null;
  const screensRef = useRef(false);
  useLayoutEffect(() => {
    screensRef.current = controller?.screens ?? false;
  });

  // The pages without the menu, e.g. a screen, also delete an old last controller.
  useEffect(() => forgetOldLastController(Date.now()), []);

  useEffect(() => {
    if (!eventId) return;
    const event = eventId;
    function remember() {
      if (title === null) return;
      const last: LastController = {
        eventId: event,
        title,
        seenAt: Date.now(),
        screens: screensRef.current,
      };
      lastControllerStore.set(JSON.stringify(last));
    }
    remember();
    if (!("BroadcastChannel" in window)) return remember;

    const channel = new BroadcastChannel(RUNNING_CHANNEL);
    const post = (message: RunningMessage) => channel.postMessage(message);
    const announce = () => post({ type: "open", window: { id, eventId, title } });
    channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (parseRunningMessage(data)?.type === "ask") announce();
    };
    const close = () => {
      post({ type: "closed", id });
      remember();
    };
    announce();
    const timer = setInterval(announce, RUNNING_HEARTBEAT_MS);
    window.addEventListener("pagehide", close);
    // After the back button: the page comes back from the cache.
    window.addEventListener("pageshow", announce);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", announce);
      close();
      channel.close();
    };
  }, [id, eventId, title]);
}

const RunningProjectionsContext = createContext<RunningProjection[]>([]);

/** The event projections that run on this device. See `RunningProjectionsProvider`. */
export function useRunningProjections(): RunningProjection[] {
  return use(RunningProjectionsContext);
}

/**
 * Knows the event projections that run on this device: a controller or a
 * screen in a window of this browser, or a screen anywhere of the event of
 * the last controller of this browser. One per menu: the last needs a
 * Realtime connection.
 */
export function RunningProjectionsProvider({ children }: { children: React.ReactNode }) {
  const windows = useRunningWindows();
  const stored = lastControllerStore.useValue();
  const now = useClock();
  const last = useMemo(
    () => (now === null ? null : parseLastController(stored, now)),
    [stored, now],
  );
  // An old or invalid value leaves the storage: it has the title of an event.
  useEffect(() => {
    if (now !== null) forgetOldLastController(now);
  }, [stored, now]);
  const local = useMemo(() => runningProjections(windows, last), [windows, last]);
  // The windows of this browser show the projection of the last controller at once.
  const watched = last && !local.some(({ eventId }) => eventId === last.eventId) ? last : null;
  const watchKey = watched && `${watched.eventId}:${watched.seenAt}`;
  const [remote, setRemote] = useState<{ key: string; running: boolean } | null>(null);
  const projections = useMemo(
    () =>
      watched && remote?.key === watchKey && remote.running
        ? [...local, { eventId: watched.eventId, title: watched.title }]
        : local,
    [local, watched, watchKey, remote],
  );

  return (
    <RunningProjectionsContext value={projections}>
      {children}
      {watched && watchKey && (
        <ScreenWatch
          key={watchKey}
          last={watched}
          onChange={(running) =>
            setRemote((current) =>
              current?.key === watchKey && current.running === running
                ? current
                : { key: watchKey, running },
            )
          }
        />
      )}
    </RunningProjectionsContext>
  );
}

/** The controllers and the screens of events in the windows of this browser. */
function useRunningWindows(): RunningWindow[] {
  const [windows, setWindows] = useState<
    ReadonlyMap<string, { window: RunningWindow; seenAt: number }>
  >(new Map());

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(RUNNING_CHANNEL);
    channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      const message = parseRunningMessage(data);
      if (message?.type === "open") {
        const { window } = message;
        setWindows((current) => new Map(current).set(window.id, { window, seenAt: Date.now() }));
      } else if (message?.type === "closed") {
        setWindows((current) => {
          if (!current.has(message.id)) return current;
          const next = new Map(current);
          next.delete(message.id);
          return next;
        });
      }
    };
    channel.postMessage({ type: "ask" } satisfies RunningMessage);
    // Forget the windows that closed without a message, e.g. after a crash.
    const timer = setInterval(() => {
      const now = Date.now();
      setWindows((current) =>
        [...current.values()].some(({ seenAt }) => now - seenAt > RUNNING_TIMEOUT_MS)
          ? new Map([...current].filter(([, { seenAt }]) => now - seenAt <= RUNNING_TIMEOUT_MS))
          : current,
      );
    }, RUNNING_HEARTBEAT_MS);
    return () => {
      clearInterval(timer);
      channel.close();
    };
  }, []);

  return useMemo(() => [...windows.values()].map(({ window }) => window), [windows]);
}

/**
 * Listens on the channel of the event of the last controller for the screens
 * (`PROJECTION_SCREEN_EVENT`). The screens that were open when the
 * controller closed count as open until they can tell it again. When no
 * screen is open, it forgets the last controller, so the Realtime
 * connection closes. It does not send anything, so the controllers and the
 * screens do not see it.
 */
function ScreenWatch({
  last,
  onChange,
}: {
  last: LastController;
  onChange: (running: boolean) => void;
}) {
  const { eventId } = last;
  const [connection, setConnection] = useState<ProjectionConnectionDTO | null>(null);
  const [assumedUntil] = useState(() => (last.screens ? last.seenAt + SCREEN_TIMEOUT_MS : 0));
  const screens = useRef(new Map<string, number>());
  // Counts the messages of the screens: each one checks at once.
  const [heard, setHeard] = useState(0);
  const liveSince = useRef<number | null>(null);

  const forget = useEffectEvent(() => {
    // Not a newer controller, e.g. in another tab.
    const now = parseLastController(lastControllerStore.get(), Date.now());
    if (now?.eventId === eventId && now.seenAt === last.seenAt) lastControllerStore.set(null);
  });

  const check = useEffectEvent(() => {
    const now = Date.now();
    for (const [id, seenAt] of screens.current)
      if (now - seenAt > SCREEN_TIMEOUT_MS) screens.current.delete(id);
    const running = screens.current.size > 0 || now < assumedUntil;
    onChange(running);
    if (!running && liveSince.current !== null && now - liveSince.current > SCREEN_TIMEOUT_MS)
      forget();
  });

  // Before the paint: the menu item does not go away for a moment.
  useLayoutEffect(() => check(), [heard]);

  useEffect(() => {
    let active = true;
    void eventProjectionConnectionAction(eventId).then((result) => {
      if (!active) return;
      // No access, e.g. another user signed in, or no such event.
      if (result === null) forget();
      else if (result) setConnection(result);
    });
    return () => {
      active = false;
    };
  }, [eventId]);

  const { status } = useProjectionChannel(
    { eventId, connection },
    {
      onMessage(event, payload) {
        if (event !== "screen" && event !== "screen-closed") return;
        const info = parseScreenInfo(payload);
        if (!info) return;
        if (event === "screen") screens.current.set(info.id, Date.now());
        else screens.current.delete(info.id);
        setHeard((count) => count + 1);
      },
    },
  );

  useEffect(() => {
    // A screen tells that it is open every `SCREEN_HEARTBEAT_MS` from the join.
    liveSince.current = status === "live" ? Date.now() : null;
  }, [status]);

  useEffect(() => {
    const timer = setInterval(() => check(), 2000);
    return () => clearInterval(timer);
  }, []);

  return null;
}
