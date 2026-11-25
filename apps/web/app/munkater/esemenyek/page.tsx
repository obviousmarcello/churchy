import type { Metadata } from "next";
import Link from "next/link";

import { LocalDateTime } from "@/components/music/local-date-time";
import { PageHeader } from "@/components/music/page-header";
import { buttonVariants } from "@/components/music/ui/button";
import { getI18n } from "@/i18n/music/server";
import { splitEventsByTime } from "@/lib/music/event-time";
import { requireEventsPageUser } from "@/server/music/auth";
import { listEvents, type EventDTO } from "@/server/music/models/events";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.events.title, robots: { index: false, follow: false } };
}

/** Series masters show once, at their first start; the page of the event shows the rule. */
async function loadEvents() {
  const events = (await listEvents()).filter((event) => event.parentEventId === null);
  return splitEventsByTime(events, Date.now());
}

const WHEN: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Budapest",
};

export default async function EventsPage() {
  const [user, { m }] = await Promise.all([requireEventsPageUser(), getI18n()]);
  const canAdd = user.canEditEvents || (await user.eventAreaIds()).length > 0;
  const { upcoming, past } = await loadEvents();
  const t = m.events;

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title={t.title}
        actions={
          canAdd ? (
            <Link href="/munkater/esemenyek/uj" className={buttonVariants()}>
              {t.add}
            </Link>
          ) : undefined
        }
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6 sm:px-6">
        <p className="text-sm text-muted">{t.lead}</p>
        <nav aria-label={t.title} className="flex flex-wrap gap-2">
          <Link
            href="/munkater/esemenyek/naptar"
            className={buttonVariants({ variant: "outline" })}
          >
            {t.calendar.title}
          </Link>
          {(user.canEditEvents || user.leadsGroups) && (
            <Link
              href="/munkater/esemenyek/csoportok"
              className={buttonVariants({ variant: "outline" })}
            >
              {t.groupsLink}
            </Link>
          )}
          {user.isSuperadmin && (
            <Link
              href="/munkater/esemenyek/hirdetesek"
              className={buttonVariants({ variant: "outline" })}
            >
              {t.media.sourcesLink}
            </Link>
          )}
        </nav>
        <EventList title={t.upcoming} empty={t.emptyUpcoming} events={upcoming} />
        <EventList title={t.past} empty={t.emptyPast} events={past.slice(0, 20)} />
      </div>
    </main>
  );
}

async function EventList({
  title,
  empty,
  events,
}: {
  title: string;
  empty: string;
  events: EventDTO[];
}) {
  const { m } = await getI18n();
  return (
    <section aria-labelledby={`${title}-h`} className="flex flex-col gap-3">
      <h2 id={`${title}-h`} className="text-lg font-semibold">
        {title}
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/munkater/esemenyek/${event.id}`}
                className="flex flex-col gap-1 rounded-lg border px-4 py-3 hover:bg-surface"
              >
                <span className="font-medium">{event.title}</span>
                <span className="text-sm text-muted">
                  <LocalDateTime date={event.startsAt} options={WHEN} />
                </span>
                <span className="flex gap-2 text-xs text-muted">
                  {event.rrule && <span>{m.events.seriesBadge}</span>}
                  {event.isPrivate && <span>{m.events.privateBadge}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
