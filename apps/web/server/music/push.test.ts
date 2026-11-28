import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { pushConfig, sendPush } from "./push";

const ENV = {
  VAPID_PUBLIC_KEY: "pub",
  VAPID_PRIVATE_KEY: "priv",
  VAPID_SUBJECT: "mailto:iroda@example.org",
};
const payload = {
  title: "Közös alkalom indult",
  body: "Csatlakozz.",
  url: "/munkater/kotta?session=1",
  tag: "live/1",
};
const target = (n: number) => ({
  endpoint: `https://push.example.org/${n}`,
  p256dh: "p",
  auth: "a",
});

describe("web push", () => {
  it("is off without all three VAPID variables or with a bad subject", () => {
    expect(pushConfig({})).toBeNull();
    expect(pushConfig({ ...ENV, VAPID_PRIVATE_KEY: "" })).toBeNull();
    expect(pushConfig({ ...ENV, VAPID_SUBJECT: "http://x" })).toBeNull();
    expect(pushConfig(ENV)).toEqual({
      publicKey: "pub",
      privateKey: "priv",
      subject: ENV.VAPID_SUBJECT,
    });
  });

  it("sends the payload to every device and reports the gone endpoints", async () => {
    const send = vi.fn(async (subscription: { endpoint: string }, _body: string) => {
      if (subscription.endpoint.endsWith("/2"))
        throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (subscription.endpoint.endsWith("/3"))
        throw Object.assign(new Error("boom"), { statusCode: 500 });
    });
    const result = await sendPush(
      [target(1), target(2), target(3)],
      payload,
      { ttlSeconds: 60, urgency: "high" },
      ENV,
      send,
    );
    expect(result.gone).toEqual(["https://push.example.org/2"]);
    expect(send).toHaveBeenCalledTimes(3);
    expect(JSON.parse(send.mock.calls[0]![1] as unknown as string)).toEqual(payload);
  });

  it("sends nothing when push is off or the link leaves the workspace", async () => {
    const send = vi.fn();
    expect(
      await sendPush([target(1)], payload, { ttlSeconds: 1, urgency: "low" }, {}, send),
    ).toEqual({ gone: [], sent: 0, failed: 0 });
    expect(
      await sendPush(
        [target(1)],
        { ...payload, url: "https://evil.example" },
        { ttlSeconds: 1, urgency: "low" },
        ENV,
        send,
      ),
    ).toEqual({ gone: [], sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});
