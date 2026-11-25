import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LocalDateTime } from "@/components/music/local-date-time";
import { PageHeader } from "@/components/music/page-header";
import { buttonVariants } from "@/components/music/ui/button";
import { getI18n } from "@/i18n/music/server";
import { requireEventsPageUser } from "@/server/music/auth";
import { getEventDetail } from "@/server/music/models/events";
import { findSongs } from "@/server/music/models/songs";
import { ItemsPanel } from "./items-panel";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.events.title, robots: { index: false, follow: false } };
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

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const [{ id }, query, user, { m }] = await Promise.all([
    params,
    searchParams,
    requireEventsPageUser(),
    getI18n(),
  ]);
  const event = await getEventDetail(id);
  if (event === null) notFound();
  const q = (Array.isArray(query.q) ? query.q[0] : query.q)?.trim() ?? "";
  const results =
    user.canEditEvents && q !== ""
      ? (await findSongs({ query: q, sort: "title", page: 1 })).songs.map((song) => ({
          id: song.id,
          title: song.title,
          arrangements: song.arrangements.map((a) => ({
            id: a.id,
            name: a.name,
            key: a.key,
          })),
        }))
      : [];

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title={event.title}
        back={{ href: "/munkater/esemenyek", label: m.events.title }}
        actions={
          user.canEditEvents ? (
            <Link
              href={`/munkater/esemenyek/${event.id}/szerkesztes`}
              className={buttonVariants({ variant: "outline" })}
            >
              {m.events.edit.edit}
            </Link>
          ) : undefined
        }
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
        <p className="text-sm text-muted">
          <LocalDateTime date={event.startsAt} options={WHEN} />
          {event.rrule && ` · ${m.events.seriesBadge}`}
          {event.isPrivate && ` · ${m.events.privateBadge}`}
        </p>
        {event.items.some((item) => item.kind === "song") && (
          <Link
            href={`/munkater/kotta?event=${event.id}`}
            className={buttonVariants({ variant: "outline" }) + " self-start"}
          >
            {m.events.items.chart}
          </Link>
        )}
        {event.youtubeUrl && (
          <a href={event.youtubeUrl} className="text-sm underline" rel="noreferrer noopener">
            {event.youtubeUrl}
          </a>
        )}
        <ItemsPanel
          eventId={event.id}
          items={event.items.map((item) =>
            item.kind === "song"
              ? {
                  key: item.key,
                  kind: "song" as const,
                  title: item.song.title,
                  musicalKey: item.musicalKey,
                  arrangementId: item.arrangement.id,
                  blockKey: item.blockKey,
                }
              : {
                  key: item.key,
                  kind: "text" as const,
                  title: item.title,
                  musicalKey: null,
                  arrangementId: null,
                  blockKey: item.blockKey,
                },
          )}
          blocks={event.blocks.map((block) => ({ key: block.key, name: block.name }))}
          canEdit={user.canEditEvents}
          query={q}
          results={results}
        />
      </div>
    </main>
  );
}
