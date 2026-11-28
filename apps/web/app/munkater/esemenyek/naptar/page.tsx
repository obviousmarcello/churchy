import type { Metadata } from "next";

import { PageHeader } from "@/components/music/page-header";
import { getI18n } from "@/i18n/music/server";
import { requireEventsPageUser } from "@/server/music/auth";
import { hasMyCalendarFeed } from "@/server/music/models/calendar-feeds";
import { FeedPanel } from "./feed-panel";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.events.calendar.title, robots: { index: false, follow: false } };
}

export default async function CalendarFeedPage() {
  const [, { m }] = await Promise.all([requireEventsPageUser(), getI18n()]);
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title={m.events.calendar.title}
        back={{ href: "/munkater/esemenyek", label: m.events.title }}
      />
      <FeedPanel initiallyOn={await hasMyCalendarFeed()} />
    </main>
  );
}
