import "server-only";

import webpush from "web-push";

// Web push of the music module (live sessions): the transport. Configuration comes from the
// environment, never from the code: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
// (a `mailto:` or `https:` contact for the push services). Without all three, push is off (the
// demo has none: `lib/demo/safety.ts` refuses to start with `VAPID_*` set). A payload carries a
// title, a fixed text, a link and a tag: never a name, a title of the event or any content.

export type PushConfig = { publicKey: string; privateKey: string; subject: string };

export type PushEnv = Readonly<Record<string, string | undefined>>;

export function pushConfig(env: PushEnv = process.env): PushConfig | null {
  const publicKey = env["VAPID_PUBLIC_KEY"]?.trim();
  const privateKey = env["VAPID_PRIVATE_KEY"]?.trim();
  const subject = env["VAPID_SUBJECT"]?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  if (!/^(mailto:|https:\/\/)/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

export function isPushEnabled(env: PushEnv = process.env): boolean {
  return pushConfig(env) !== null;
}

export type PushPayload = {
  title: string;
  body: string;
  /** An app-relative link under `/munkater/`. */
  url: string;
  /** A newer push with the same tag replaces the older one on the device. */
  tag: string;
};

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

type Sender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  body: string,
  options: webpush.RequestOptions,
) => Promise<unknown>;

/**
 * Sends the payload to the devices. Returns the endpoints that the push service says are gone
 * (404, 410): the caller removes them. Other failures are logged without the endpoint.
 */
export async function sendPush(
  targets: readonly PushTarget[],
  payload: PushPayload,
  options: { ttlSeconds: number; urgency: "low" | "normal" | "high" },
  env: PushEnv = process.env,
  send: Sender = (subscription, body, requestOptions) =>
    webpush.sendNotification(subscription, body, requestOptions),
): Promise<{ gone: string[] }> {
  const config = pushConfig(env);
  if (!config || !payload.url.startsWith("/munkater/")) return { gone: [] };
  const gone: string[] = [];
  const body = JSON.stringify(payload);
  await Promise.all(
    targets.map(async (target) => {
      try {
        await send(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          body,
          {
            TTL: options.ttlSeconds,
            urgency: options.urgency,
            vapidDetails: {
              subject: config.subject,
              publicKey: config.publicKey,
              privateKey: config.privateKey,
            },
          },
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(target.endpoint);
        else console.error("[push] send failed:", status ?? "no status");
      }
    }),
  );
  return { gone };
}
