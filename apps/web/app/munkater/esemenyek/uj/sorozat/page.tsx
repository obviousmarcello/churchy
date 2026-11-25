import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/music/page-header";
import { getI18n } from "@/i18n/music/server";
import { requireEventsPageUser } from "@/server/music/auth";
import { SeriesForm } from "./series-form";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.events.series.title, robots: { index: false, follow: false } };
}

// Only for the tenant-wide event admins: the action checks `music.event.manage` again.
export default async function SeriesPage() {
  const [user, { m }] = await Promise.all([requireEventsPageUser(), getI18n()]);
  if (!user.canEditEvents) notFound();
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title={m.events.series.title}
        back={{ href: "/munkater/esemenyek/uj", label: m.events.new.title }}
      />
      <SeriesForm />
    </main>
  );
}
