"use client";

import { realtimeTokenAction } from "@/app/munkater/realtime-actions";
import {
  createRealtimeClient,
  type RealtimeClient,
  type RealtimeConnection,
  type RealtimeToken,
} from "./client";

// One client for each user on a page, so the topics of an event share one connection (the token
// then carries all their topics).

async function fetchToken(topics: string[]): Promise<RealtimeToken | null> {
  const outcome = await realtimeTokenAction(topics);
  return outcome.ok ? outcome.value : null;
}

const clients = new Map<string, RealtimeClient>();

export function realtimeClient(connection: RealtimeConnection): RealtimeClient {
  const id =
    connection.mode === "local"
      ? `local ${connection.tenantId} ${connection.userId}`
      : `${connection.url} ${connection.publishableKey} ${connection.tenantId} ${connection.userId}`;
  let client = clients.get(id);
  if (!client) {
    client = createRealtimeClient(connection, fetchToken);
    clients.set(id, client);
  }
  return client;
}
