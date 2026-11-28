import { createClient } from "@supabase/supabase-js";

// The browser side of the music module's realtime transport (PLAN §19): one small interface that
// the projection, the live sessions and the event sync use, with two implementations.
//
// - "supabase": Supabase Realtime with a private channel per topic. The topics are namespaced per
//   tenant (`t:<tenant id>:<topic>`), and the access token is minted by the server
//   (`server/music/realtime.ts`) for exactly the topics this page uses; the policies on
//   `realtime.messages` only compare the topic with the token's claims.
// - "local": the demo (in-process database, no Supabase): `BroadcastChannel` between the tabs of
//   one browser, with the same interface, a presence list included.
//
// The interface is the part of the supabase-js channel API that the music app uses (`on`,
// `subscribe`, `send`, `httpSend`, `track`, `presenceState`), so the copied hooks stay close to
// their originals.

export type RealtimeConnection =
  | { mode: "supabase"; url: string; publishableKey: string; tenantId: string; userId: string }
  | { mode: "local"; tenantId: string; userId: string };

export type RealtimeToken = { token: string; expiresInMs: number; userId: string };
export type FetchRealtimeToken = (topics: string[]) => Promise<RealtimeToken | null>;

export type RealtimeChannelStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

export interface RealtimeChannel {
  readonly state: string;
  on(
    type: "broadcast",
    filter: { event: string },
    callback: (message: { payload: unknown }) => void,
  ): RealtimeChannel;
  on(
    type: "presence",
    filter: { event: "sync" | "join" | "leave" },
    callback: () => void,
  ): RealtimeChannel;
  subscribe(callback?: (status: RealtimeChannelStatus) => void): RealtimeChannel;
  send(message: { type: "broadcast"; event: string; payload: unknown }): Promise<unknown>;
  httpSend(event: string, payload: unknown): Promise<unknown>;
  track(payload: Record<string, unknown>): Promise<unknown>;
  presenceState(): Record<string, unknown[]>;
}

export interface RealtimeClient {
  /** A channel of the topic (without the tenant prefix; the client adds it). */
  channel(topic: string, options?: { presenceKey?: string }): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): Promise<unknown>;
  /** Fetches the first token; join channels after it (without one the policies refuse the join). */
  setAuth(): Promise<void>;
}

/** The full channel name: `t:<tenant id>:<topic>`. */
export function tenantTopic(tenantId: string, topic: string): string {
  return `t:${tenantId}:${topic}`;
}

// The token is renewed shortly before it expires. For one user only: after a sign-out and a
// sign-in as another user without a reload, the token of the first user must not be used.
const TOKEN_RENEW_BEFORE_MS = 60 * 1000;

function tokenSource(fetchToken: FetchRealtimeToken, userId: string) {
  const topics = new Set<string>();
  let current: { token: string; expiresAt: number; topics: string } | null = null;
  let pending: Promise<string> | null = null;
  return {
    add(topic: string) {
      topics.add(topic);
    },
    async get(): Promise<string> {
      const key = [...topics].sort().join(" ");
      if (
        current &&
        current.topics === key &&
        current.expiresAt - Date.now() > TOKEN_RENEW_BEFORE_MS
      ) {
        return current.token;
      }
      if (pending) return pending;
      const promise = fetchToken([...topics])
        .then((result) => {
          if (!result || result.userId !== userId)
            throw new Error("No verified session for Realtime");
          // From the time of the answer: the clock of the device can be wrong.
          current = {
            token: result.token,
            expiresAt: Date.now() + result.expiresInMs,
            topics: key,
          };
          return result.token;
        })
        .finally(() => {
          pending = null;
        });
      pending = promise;
      return promise;
    },
  };
}

export function createRealtimeClient(
  connection: RealtimeConnection,
  fetchToken: FetchRealtimeToken,
): RealtimeClient {
  if (connection.mode === "local") return createLocalClient(connection.tenantId);

  const source = tokenSource(fetchToken, connection.userId);
  const supabase = createClient(connection.url, connection.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    accessToken: () => source.get(),
  });
  return {
    channel(topic, options) {
      const full = tenantTopic(connection.tenantId, topic);
      source.add(full);
      return supabase.channel(full, {
        config: {
          private: true,
          ...(options?.presenceKey ? { presence: { key: options.presenceKey } } : {}),
        },
      }) as unknown as RealtimeChannel;
    },
    removeChannel: (channel) => supabase.removeChannel(channel as never),
    async setAuth() {
      await supabase.realtime.setAuth(await source.get());
    },
  };
}

// Local transport -----------------------------------------------------------------------------

const PRESENCE_PING_MS = 3_000;
const PRESENCE_TTL_MS = 9_000;

type Wire =
  | { t: "broadcast"; event: string; payload: unknown }
  | { t: "presence"; key: string; payload: Record<string, unknown> }
  | { t: "leave"; key: string };

class LocalChannel implements RealtimeChannel {
  state = "closed";
  private bc: BroadcastChannel | null = null;
  private readonly handlers = new Map<string, ((message: { payload: unknown }) => void)[]>();
  private readonly presenceHandlers = new Map<string, (() => void)[]>();
  private readonly remote = new Map<string, { payload: Record<string, unknown>; seen: number }>();
  private mine: Record<string, unknown> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly name: string,
    private readonly presenceKey: string | undefined,
  ) {}

  on(type: "broadcast" | "presence", filter: { event: string }, callback: never): RealtimeChannel {
    const map = type === "broadcast" ? this.handlers : this.presenceHandlers;
    const list = (map.get(filter.event) ?? []) as unknown[];
    list.push(callback);
    map.set(filter.event, list as never);
    return this;
  }

  subscribe(callback?: (status: RealtimeChannelStatus) => void): RealtimeChannel {
    if (typeof BroadcastChannel === "undefined") {
      callback?.("CHANNEL_ERROR");
      return this;
    }
    this.bc = new BroadcastChannel(`churchy-music:${this.name}`);
    this.bc.onmessage = ({ data }: MessageEvent<Wire>) => this.receive(data);
    this.state = "joined";
    this.timer = setInterval(() => this.ping(), PRESENCE_PING_MS);
    queueMicrotask(() => {
      callback?.("SUBSCRIBED");
      this.ping(true);
    });
    return this;
  }

  private emitPresence(event: "sync" | "join" | "leave") {
    for (const handler of this.presenceHandlers.get(event) ?? []) handler();
  }

  private receive(data: Wire) {
    if (typeof data !== "object" || data === null) return;
    if (data.t === "broadcast") {
      for (const handler of this.handlers.get(data.event) ?? []) handler({ payload: data.payload });
    } else if (data.t === "presence") {
      const fresh = !this.remote.has(data.key);
      this.remote.set(data.key, { payload: data.payload, seen: Date.now() });
      // A new participant gets this tab's presence at once.
      if (fresh) this.ping();
      if (fresh) this.emitPresence("join");
      this.emitPresence("sync");
    } else if (data.t === "leave") {
      if (this.remote.delete(data.key)) {
        this.emitPresence("leave");
        this.emitPresence("sync");
      }
    }
  }

  private ping(announce = false) {
    if (this.mine && this.presenceKey) {
      this.bc?.postMessage({
        t: "presence",
        key: this.presenceKey,
        payload: this.mine,
      } satisfies Wire);
    }
    const expired = [...this.remote].filter(
      ([, entry]) => Date.now() - entry.seen > PRESENCE_TTL_MS,
    );
    for (const [key] of expired) this.remote.delete(key);
    if (expired.length > 0) {
      this.emitPresence("leave");
      this.emitPresence("sync");
    }
    void announce;
  }

  async send(message: { type: "broadcast"; event: string; payload: unknown }): Promise<unknown> {
    this.bc?.postMessage({
      t: "broadcast",
      event: message.event,
      payload: message.payload,
    } satisfies Wire);
    return "ok";
  }

  httpSend(event: string, payload: unknown): Promise<unknown> {
    return this.send({ type: "broadcast", event, payload });
  }

  async track(payload: Record<string, unknown>): Promise<unknown> {
    this.mine = payload;
    this.ping();
    // The own entry shows in the list, as in Supabase presence.
    this.emitPresence("sync");
    return "ok";
  }

  presenceState(): Record<string, unknown[]> {
    const state: Record<string, unknown[]> = {};
    for (const [key, entry] of this.remote) state[key] = [entry.payload];
    if (this.mine && this.presenceKey) state[this.presenceKey] = [this.mine];
    return state;
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    if (this.presenceKey && this.mine) {
      this.bc?.postMessage({ t: "leave", key: this.presenceKey } satisfies Wire);
    }
    this.bc?.close();
    this.bc = null;
    this.state = "closed";
  }
}

function createLocalClient(tenantId: string): RealtimeClient {
  return {
    channel: (topic, options) =>
      new LocalChannel(tenantTopic(tenantId, topic), options?.presenceKey),
    removeChannel: async (channel) => (channel as LocalChannel).close(),
    setAuth: async () => {},
  };
}

/** The local transport, for tests. */
export const createLocalRealtimeClient = createLocalClient;
