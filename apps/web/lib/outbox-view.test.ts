import { describe, expect, it } from "vitest";
import type { OutboxMessage } from "@/server/data-adapters";
import {
  baseUrlFrom,
  distinctRecipients,
  filterOutbox,
  isPersonaKey,
  parseChannel,
  recipientKey,
} from "./outbox-view";

const message = (id: string, channel: "email" | "push", recipient: OutboxMessage["recipient"]) =>
  ({
    id,
    at: "2026-11-12T10:00:00Z",
    channel,
    template: "hr.ticketUpdated",
    recipient,
    tenant: null,
    params: {},
  }) satisfies OutboxMessage;

const office = { kind: "persona", persona: "office" } as const;
const bence = { kind: "person", id: "p-1", name: "Minta Bence" } as const;
const messages = [
  message("1", "email", office),
  message("2", "email", bence),
  message("3", "push", bence),
];

describe("outbox view helpers", () => {
  it("identifies recipients", () => {
    expect(recipientKey(office)).toBe("persona:office");
    expect(recipientKey(bence)).toBe("person:p-1");
    expect(recipientKey({ kind: "user", id: "u-1", name: null })).toBe("user:u-1");
  });

  it("filters by channel and recipient", () => {
    expect(filterOutbox(messages, {}).map((m) => m.id)).toEqual(["1", "2", "3"]);
    expect(filterOutbox(messages, { channel: "push" }).map((m) => m.id)).toEqual(["3"]);
    expect(filterOutbox(messages, { recipient: "person:p-1" }).map((m) => m.id)).toEqual([
      "2",
      "3",
    ]);
    expect(
      filterOutbox(messages, { channel: "email", recipient: "person:p-1" }).map((m) => m.id),
    ).toEqual(["2"]);
  });

  it("lists each recipient once", () => {
    expect(distinctRecipients(messages).map((d) => d.key)).toEqual([
      "persona:office",
      "person:p-1",
    ]);
  });

  it("narrows untrusted query values", () => {
    expect(parseChannel("push")).toBe("push");
    expect(parseChannel("sms")).toBeUndefined();
    expect(parseChannel(undefined)).toBeUndefined();
    expect(isPersonaKey("office")).toBe(true);
    expect(isPersonaKey("root")).toBe(false);
  });

  it("derives the preview origin from the host header, safely", () => {
    const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });
    expect(baseUrlFrom(headers({ host: "localhost:3100" }))).toBe("http://localhost:3100");
    expect(
      baseUrlFrom(headers({ "x-forwarded-host": "demo.churchy.hu", "x-forwarded-proto": "https" })),
    ).toBe("https://demo.churchy.hu");
    expect(baseUrlFrom(headers({ host: "evil.example/<script>" }))).toBe("http://localhost:3000");
    expect(baseUrlFrom(headers({}))).toBe("http://localhost:3000");
  });
});
