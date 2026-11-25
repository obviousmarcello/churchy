import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/music/page-header";
import { getI18n } from "@/i18n/music/server";
import { requireEventsPageUser } from "@/server/music/auth";
import { getEvent } from "@/server/music/models/events";
import { deleteEventAction, updateEventAction } from "../../actions";
import { EventForm } from "../../event-form";
import { DeleteEvent } from "./delete-event";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.events.edit.title, robots: { index: false, follow: false } };
}

/** Budapest wall-clock time as a `datetime-local` value. */
function localValue(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Budapest",
    dateStyle: "short",
    timeStyle: "short",
  })
    .format(new Date(iso))
    .replace(" ", "T");
}

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ alkalom?: string }>;
}) {
  const [{ id }, { alkalom }, user, { m }] = await Promise.all([
    params,
    searchParams,
    requireEventsPageUser(),
    getI18n(),
  ]);
  if (!user.canEditEvents) notFound();
  const event = await getEvent(id);
  if (event === null) notFound();
  // `?alkalom=<original start>` edits one occurrence of a series (a child event).
  const occurrence = event.rrule !== null && alkalom ? alkalom : null;
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title={m.events.edit.title}
        back={{ href: `/munkater/esemenyek/${event.id}`, label: event.title }}
      />
      <EventForm
        action={updateEventAction}
        submitLabel={m.events.edit.submit}
        pendingLabel={m.events.edit.pending}
        initial={{
          title: event.title,
          startsAt: localValue(occurrence ?? event.startsAt),
          durationMinutes: event.durationMinutes,
          youtubeUrl: event.youtubeUrl,
          isPrivate: event.isPrivate,
        }}
        hidden={{ id: event.id, ...(occurrence ? { recurrenceId: occurrence } : {}) }}
        showRecurrence={false}
        cancel={`/munkater/esemenyek/${event.id}`}
      />
      <DeleteEvent id={event.id} action={deleteEventAction} series={event.rrule !== null} />
    </main>
  );
}
