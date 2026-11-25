import type { Metadata } from "next";

import { PageHeader } from "@/components/music/page-header";
import { getI18n } from "@/i18n/music/server";
import { requireEventsPageUser } from "@/server/music/auth";
import { notFound } from "next/navigation";
import { listServiceAreas } from "@/server/music/models/groups";
import { createEventAction } from "../actions";
import { EventForm } from "../event-form";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.events.new.title, robots: { index: false, follow: false } };
}

// This only hides the form: every action checks `music.event.manage` again.
export default async function NewEventPage() {
  const [user, { m }] = await Promise.all([requireEventsPageUser(), getI18n()]);
  // Area-role users create events in their areas only (the form posts `areaIds`).
  const areaIds = user.canEditEvents ? [] : await user.eventAreaIds();
  if (!user.canEditEvents && areaIds.length === 0) notFound();
  const areaOptions = user.canEditEvents
    ? undefined
    : (await listServiceAreas({ withRoot: true })).filter((area) => areaIds.includes(area.id));
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title={m.events.new.title}
        back={{ href: "/munkater/esemenyek", label: m.events.title }}
      />
      <EventForm
        action={createEventAction}
        submitLabel={m.events.new.submit}
        pendingLabel={m.events.new.pending}
        showRecurrence
        areaOptions={areaOptions}
        cancel="/munkater/esemenyek"
      />
    </main>
  );
}
