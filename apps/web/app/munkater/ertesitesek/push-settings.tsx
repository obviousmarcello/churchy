"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
  setLivePushPreferenceAction,
} from "./actions";

const SW_URL = "/munkater/sw.js";
const SW_SCOPE = "/munkater/";

type DeviceState = "checking" | "unavailable" | "unsupported" | "denied" | "off" | "on";

function toKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded =
    base64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The live session push: this device (subscription of the browser) and the preference of the user. */
export function PushSettings({
  publicKey,
  liveSession: initialLiveSession,
  devices: initialDevices,
}: {
  /** The VAPID public key; null when push is not configured (the demo). */
  publicKey: string | null;
  liveSession: boolean;
  devices: number;
}) {
  const { m, format } = useI18n();
  const t = m.notifications.settings;
  const [state, setState] = useState<DeviceState>("checking");
  const [liveSession, setLiveSession] = useState(initialLiveSession);
  const [devices, setDevices] = useState(initialDevices);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let active = true;
    async function check() {
      if (publicKey === null) return "unavailable" as const;
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      )
        return "unsupported" as const;
      if (Notification.permission === "denied") return "denied" as const;
      const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE);
      const subscription = await registration?.pushManager.getSubscription();
      return subscription ? ("on" as const) : ("off" as const);
    }
    void check().then((next) => active && setState(next));
    return () => {
      active = false;
    };
  }, [publicKey]);

  function enable() {
    if (publicKey === null) return;
    setMessage(null);
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const registration = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
        await navigator.serviceWorker.ready;
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: toKey(publicKey),
          }));
        const json = subscription.toJSON();
        const outcome = await savePushSubscriptionAction({
          endpoint: json.endpoint,
          p256dh: json.keys?.["p256dh"],
          auth: json.keys?.["auth"],
        });
        if (!outcome.ok || !outcome.value.ok) throw new Error("not saved");
        setState("on");
        setDevices((count) => count + 1);
      } catch {
        setMessage(t.failed);
      }
    });
  }

  function disable() {
    setMessage(null);
    start(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE);
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await removePushSubscriptionAction(subscription.endpoint);
          await subscription.unsubscribe();
          setDevices((count) => Math.max(0, count - 1));
        }
        setState("off");
      } catch {
        setMessage(t.failed);
      }
    });
  }

  function changePreference(enabled: boolean) {
    setLiveSession(enabled);
    setMessage(null);
    start(async () => {
      const outcome = await setLivePushPreferenceAction(enabled);
      if (!outcome.ok || outcome.value.status === "error") {
        setLiveSession(!enabled);
        setMessage(t.failed);
      } else setMessage(t.saved);
    });
  }

  const notice: Partial<Record<DeviceState, string>> = {
    unavailable: t.unavailable,
    unsupported: t.unsupported,
    denied: t.denied,
    on: t.enabled,
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        {notice[state] && <p className="text-sm">{notice[state]}</p>}
        {state === "off" && (
          <Button className="self-start" disabled={pending} onClick={enable}>
            {t.enable}
          </Button>
        )}
        {state === "on" && (
          <Button variant="outline" className="self-start" disabled={pending} onClick={disable}>
            {t.disable}
          </Button>
        )}
        <p className="text-sm text-muted">{format(t.devices, { count: devices })}</p>
      </section>
      <section className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={liveSession}
            disabled={pending}
            onChange={(event) => changePreference(event.target.checked)}
          />
          {t.liveSession}
        </label>
        <p className="text-sm text-muted">{t.liveSessionHint}</p>
      </section>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
