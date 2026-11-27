import type { Metadata } from "next";

import { PageHeader } from "@/components/music/page-header";
import { getI18n } from "@/i18n/music/server";
import { requirePageUser } from "@/server/music/auth";
import { getLivePushSettings } from "@/server/music/models/push-subscriptions";
import { pushConfig } from "@/server/music/push";
import { requireWorkspaceModule } from "@/server/workspace-nav";
import { PushSettings } from "./push-settings";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.notifications.page.metadataTitle, robots: { index: false, follow: false } };
}

// The notifications of the music module: the push of a live session to this device (needs the
// module "sheet.live"; VAPID keys from the environment, none in the demo).
export default async function NotificationsPage() {
  await requireWorkspaceModule("ws.music.sheet.live");
  await requirePageUser();
  const [{ m }, settings] = await Promise.all([getI18n(), getLivePushSettings()]);
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title={m.notifications.page.title} />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6">
        <p className="text-sm text-muted">{m.notifications.page.lead}</p>
        <PushSettings
          publicKey={pushConfig()?.publicKey ?? null}
          liveSession={settings.liveSession}
          devices={settings.devices}
        />
      </div>
    </main>
  );
}
