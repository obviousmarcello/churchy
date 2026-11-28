import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/music/page-header";
import { getI18n } from "@/i18n/music/server";
import { requireEventsPageUser } from "@/server/music/auth";
import { getAnnouncementCalendars } from "@/server/music/models/announcement-calendars";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";
import { SourcesPanel } from "./sources-panel";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.events.media.sourcesTitle, robots: { index: false, follow: false } };
}

export default async function AnnouncementSourcesPage() {
  const [user, { m }] = await Promise.all([requireEventsPageUser(), getI18n()]);
  if (!user.canManageAnnouncements || !(await isWorkspaceModuleOn("ws.music.events.announcements")))
    notFound();
  const { calendars } = await getAnnouncementCalendars();
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title={m.events.media.sourcesTitle}
        back={{ href: "/munkater/esemenyek", label: m.events.title }}
      />
      <SourcesPanel
        calendars={calendars.map((c) => ({ id: c.id, name: c.name, urlHint: c.urlHint }))}
      />
    </main>
  );
}
