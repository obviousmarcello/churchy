import type { Metadata } from "next";

import { PageHeader } from "@/components/music/page-header";
import { getI18n } from "@/i18n/music/server";
import { requirePageUser } from "@/server/music/auth";
import { getMyNotificationPreferences } from "@/server/music/models/notification-preferences";
import { getLivePushSettings } from "@/server/music/models/push-subscriptions";
import { pushConfig } from "@/server/music/push";
import { requireWorkspaceModule } from "@/server/workspace-nav";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";
import { NotificationsForm } from "./preferences-form";
import { PushSettings } from "./push-settings";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.notifications.page.metadataTitle, robots: { index: false, follow: false } };
}

// The notifications of the music module: the kinds of notification (emails to the outbox and push), and
// this device for push (the live session toggle needs the module "sheet.live"; VAPID keys from the
// environment, none in the demo).
export default async function NotificationsPage() {
  await requireWorkspaceModule("ws.music.events");
  await requirePageUser();
  const [{ m }, settings, preferences, liveOn] = await Promise.all([
    getI18n(),
    getLivePushSettings(),
    getMyNotificationPreferences(),
    isWorkspaceModuleOn("ws.music.sheet.live"),
  ]);
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title={m.notifications.page.title} />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6">
        <p className="text-sm text-muted">{m.notifications.page.lead}</p>
        <NotificationsForm preferences={preferences} pushEnabled={pushConfig() !== null} />
        <PushSettings
          publicKey={pushConfig()?.publicKey ?? null}
          liveSession={settings.liveSession}
          devices={settings.devices}
          showLive={liveOn}
        />
      </div>
    </main>
  );
}
