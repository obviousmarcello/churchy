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
import { getEventTeams, getMyReply, getTeamEditor } from "@/server/music/models/event-teams";
import { listPeople } from "@/server/music/models/profiles";
import { ItemsPanel } from "./items-panel";
import { TeamPanel } from "./team-panel";
import { PlanLink } from "./plan-link";
import { EventSync } from "./event-sync";
import { ThemeSelect } from "./theme-select";
import { readProjectionThemes } from "@/server/music/models/projection-themes";
import { getEventConnection } from "@/server/music/models/event-sync";
import { projectionHref } from "@/lib/music/next-path";
import { canProjectEvent } from "@/server/music/models/realtime-access";
import { MediaPanel } from "./media-panel";
import type { EventImageSetsDTO } from "@/lib/music/projection/images";
import { listEventAnnouncements } from "@/server/music/models/announcements";
import { listEventImageSetIds, listEventImageSets } from "@/server/music/models/event-images";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";
import { getMemberEnv } from "@/server/workspace";
import { canServer } from "@/lib/permissions/server";

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
  const canEdit = await user.canManageIn("event", event.areaIds);
  const q = (Array.isArray(query.q) ? query.q[0] : query.q)?.trim() ?? "";
  const results =
    canEdit && q !== ""
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

  const [teams, editor, myReply, people] = await Promise.all([
    getEventTeams(event.id),
    getTeamEditor(),
    getMyReply(event.id),
    listPeople(),
  ]);
  const planInfo = await planOf(event.id);
  const [canProject, eventConnection, themeControls] = await Promise.all([
    canProjectEvent(event.id),
    getEventConnection(event.id),
    themeControlsOf(event.id, canEdit),
  ]);
  const [imagesOn, announcementsOn] = await Promise.all([
    isWorkspaceModuleOn("ws.music.events.images"),
    isWorkspaceModuleOn("ws.music.events.announcements"),
  ]);
  const [setIds, imageSets, announcementData] = await Promise.all([
    canEdit && imagesOn ? listEventImageSetIds(event.id) : [],
    canEdit && imagesOn ? listEventImageSets(event.id) : ({} as EventImageSetsDTO),
    canEdit && announcementsOn
      ? listEventAnnouncements(event.id)
      : { announcements: {}, calendars: [], excludeWords: [] },
  ]);
  const editableAreaIds =
    editor === null
      ? []
      : editor.editable === "all"
        ? editor.areas.map((area) => area.id)
        : editor.editable;
  return (
    <main className="flex flex-1 flex-col">
      <EventSync eventId={event.id} connection={eventConnection} />
      <PageHeader
        title={event.title}
        back={{ href: "/munkater/esemenyek", label: m.events.title }}
        actions={
          canEdit ? (
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
        {canProject && (
          <Link
            href={projectionHref(event.id)}
            className={buttonVariants({ variant: "outline" }) + " self-start"}
          >
            {m.events.items.project}
          </Link>
        )}
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
          themes={
            themeControls && {
              ...themeControls,
              eventThemeId: event.projectionThemeId,
              itemThemeIds: Object.fromEntries(event.items.map((item) => [item.key, item.themeId])),
            }
          }
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
                  volunteerId: item.volunteerId,
                }
              : {
                  key: item.key,
                  kind: "text" as const,
                  title: item.title,
                  musicalKey: null,
                  arrangementId: null,
                  blockKey: item.blockKey,
                  volunteerId: null,
                },
          )}
          blocks={event.blocks.map((block) => ({ key: block.key, name: block.name }))}
          canEdit={canEdit}
          query={q}
          results={results}
          volunteers={people
            .filter((person) => teams.teams.some((team) => team.userIds.includes(person.id)))
            .map((person) => ({ id: person.id, name: person.name }))}
        />
        {themeControls && (
          <ThemeSelect
            eventId={event.id}
            themes={themeControls.list}
            value={event.projectionThemeId}
            inheritedName={themeControls.defaultName}
            label={m.events.theme.label}
          />
        )}
        {canEdit && (imagesOn || announcementsOn) && (
          <MediaPanel
            eventId={event.id}
            imagesOn={imagesOn}
            announcementsOn={announcementsOn}
            sets={setIds.map((id) => ({
              id,
              images: (imageSets[id] ?? []).map((image) => ({
                id: image.id,
                name: image.name,
                url: image.url,
              })),
            }))}
            announcements={Object.values(announcementData.announcements).map((announcement) => ({
              id: announcement.id,
              calendarIds: announcement.calendarIds,
              refreshedAt: announcement.refreshedAt,
              snapshot: announcement.snapshot.map((entry) => ({
                calendarId: entry.calendarId,
                uid: entry.uid,
                occurrence: entry.occurrence,
                title: entry.title,
              })),
              excluded: announcement.entries.flatMap((entry) =>
                entry.source === "calendar" && entry.excluded
                  ? [`${entry.calendarId}|${entry.uid}|${entry.occurrence}`]
                  : [],
              ),
              manual: announcement.entries.flatMap((entry) =>
                entry.source === "manual" ? [{ id: entry.id, title: entry.title }] : [],
              ),
            }))}
            calendars={announcementData.calendars}
          />
        )}
        <PlanLink eventId={event.id} planId={planInfo.planId} canCreate={planInfo.canCreate} />
        <TeamPanel
          eventId={event.id}
          teams={teams.teams}
          people={people.map((person) => ({ id: person.id, name: person.name }))}
          areas={editor?.areas ?? []}
          editableAreaIds={editableAreaIds}
          myReply={myReply}
        />
      </div>
    </main>
  );
}

/** The liturgy plan of the event, and whether the viewer may make one (the plan side is Churchy's). */
async function planOf(eventId: string): Promise<{ planId: string | null; canCreate: boolean }> {
  try {
    const { repos, ctx } = await getMemberEnv();
    const plans = await repos.servicePlans.list(ctx, { eventIds: [eventId] });
    const tenantId = ctx.tenantId;
    return {
      planId: plans[0]?.id ?? null,
      canCreate: tenantId !== undefined && (await canServer("servicePlan.edit", { tenantId })),
    };
  } catch {
    return { planId: null, canCreate: false };
  }
}

/** The themes to choose from, for those who may change the event's themes (the model checks again). */
async function themeControlsOf(eventId: string, canEdit: boolean) {
  if (!(await isWorkspaceModuleOn("ws.music.projection.themes"))) return null;
  if (!canEdit && !(await canProjectEvent(eventId))) return null;
  const list = await readProjectionThemes();
  return { list, defaultName: list.find((theme) => theme.isDefault)?.name ?? "" };
}
