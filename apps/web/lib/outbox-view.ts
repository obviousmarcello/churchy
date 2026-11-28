import type { OutboxMessage, OutboxRecipientView } from "@/server/data-adapters";

export const OUTBOX_CHANNELS = ["email", "push"] as const;
export type OutboxChannelFilter = (typeof OUTBOX_CHANNELS)[number];

export const OUTBOX_PERSONAS = [
  "office",
  "requester",
  "hrHandlers",
  "roomManagers",
  "planApprovers",
  "team",
  "billingContact",
] as const;
export type OutboxPersonaKey = (typeof OUTBOX_PERSONAS)[number];

export function isPersonaKey(value: string): value is OutboxPersonaKey {
  return (OUTBOX_PERSONAS as readonly string[]).includes(value);
}

/** Stable identity of a recipient, used as the value of the recipient filter. */
export function recipientKey(recipient: OutboxRecipientView): string {
  return recipient.kind === "persona"
    ? `persona:${recipient.persona}`
    : `${recipient.kind}:${recipient.id}`;
}

/** Narrows an untrusted query value to a channel filter. */
export function parseChannel(value: string | undefined): OutboxChannelFilter | undefined {
  return OUTBOX_CHANNELS.find((c) => c === value);
}

export interface OutboxFilters {
  channel?: OutboxChannelFilter;
  /** A `recipientKey()`. */
  recipient?: string;
}

/** Applies the viewer's filters; the input order (newest first) is kept. */
export function filterOutbox(messages: OutboxMessage[], filters: OutboxFilters): OutboxMessage[] {
  return messages.filter(
    (m) =>
      (filters.channel === undefined || m.channel === filters.channel) &&
      (filters.recipient === undefined || recipientKey(m.recipient) === filters.recipient),
  );
}

/** Unique recipients of the given messages, in order of first appearance. */
export function distinctRecipients(
  messages: OutboxMessage[],
): Array<{ key: string; recipient: OutboxRecipientView }> {
  const seen = new Map<string, OutboxRecipientView>();
  for (const m of messages) {
    const key = recipientKey(m.recipient);
    if (!seen.has(key)) seen.set(key, m.recipient);
  }
  return [...seen].map(([key, recipient]) => ({ key, recipient }));
}

/**
 * Origin that links in the previews resolve against: the host the page is viewed on. Anything that
 * does not look like a plain host name falls back to the local dev origin.
 */
export function baseUrlFrom(headers: { get(name: string): string | null }): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto = headers.get("x-forwarded-proto") === "https" ? "https" : "http";
  return host !== null && /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)
    ? `${proto}://${host}`
    : "http://localhost:3000";
}
