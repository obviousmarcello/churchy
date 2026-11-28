"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CalendarXIcon,
  CopyPlusIcon,
  ExternalLinkIcon,
  FileMusicIcon,
  LockIcon,
  PresentationIcon,
  RadioIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react";

import { useAppConfig } from "@/components/music/app-config";
import { EditSongDialog, type EditSongTarget } from "@/app/munkater/enektar/edit-song-dialog";
import { DateBadge } from "@/components/music/date-badge";
import {
  useChangeNotices,
  useEventChanges,
  useProjectionLive,
} from "@/components/music/event-changes";
import { FileDropArea } from "@/components/music/file-drop";
import { SectionHeading } from "@/components/music/form-field";
import { LocalDateTime } from "@/components/music/local-date-time";
import { PageHeader } from "@/components/music/page-header";
import { PrintSetlistButton, type PrintSetlistItem } from "@/components/music/print-setlist";
import { RowMenu } from "@/components/music/row-menu";
import { ReplyIcon } from "@/components/music/volunteer-reply";
import { buttonVariants } from "@/components/music/ui/button";
import { NAV_FORWARD } from "@/components/music/page-transition";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { useI18n } from "@/i18n/music/client";
import { itemChanges } from "@/lib/music/event-items-merge";
import { eventGroupLabels, sameEventAreas } from "@/lib/music/event-scopes";
import { formatEventItems, personName } from "@/lib/music/format";
import { eventSheetHref, liveSheetHref, projectionHref } from "@/lib/music/next-path";
import type { EventAnnouncementsDTO } from "@/lib/music/announcements/schema";
import type { EventImageSetsDTO } from "@/lib/music/projection/images";
import { FALLBACK_LOOK } from "@/lib/music/projection/themes";
import { hasPendingSaves, savePendingChanges } from "@/lib/music/pending-saves";
import { toastInfo } from "@/lib/music/toast";
import { countReplies } from "@/lib/music/volunteer-replies";
import type { EventTeamsDTO } from "@/lib/music/volunteer-templates";
import type { EventDetailDTO, VolunteerDTO } from "@/server/music/models/events";
import type { TeamEditorDTO } from "@/server/music/models/event-teams";
import type { PersonDTO } from "@/server/music/models/profiles";
import type { EventPageResult, EventPageTransient } from "./data";
import {
  CopyEventDialog,
  DeleteEventButton,
  EditDetailsDialog,
  ManageVolunteersDialog,
} from "./event-forms";
import { itemsOn } from "@/lib/music/modules/items";
import { EventItems } from "./event-items";
import { EventTeamsDialog, VolunteerTeams } from "./event-teams";
import { EventThemeSelect } from "./event-theme-select";
import { ItemsForm, toItemRows } from "./items-form";
import { ReplyForm } from "./reply-form";
import { VolunteerList, type MyReplyTarget } from "./volunteer-list";

const NO_IMAGE_SETS: EventImageSetsDTO = {};
const NO_ANNOUNCEMENTS: EventAnnouncementsDTO = {
  announcements: {},
  calendars: [],
  excludeWords: [],
};
const NO_TEAMS: EventTeamsDTO = { templateId: null, teams: [] };
const NO_GROUP_LABELS: Record<string, string> = {};

const DATE_TIME: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

export function EventView({ result }: { result: EventPageResult }) {
  return <EventDetails result={result} />;
}

/**
 * The top bar of small screens: the name of the event, and the back link to
 * the list (the detail pane adds it, see `ListDetail`). Without the event
 * (loading, not found): "Event". Large screens show the list next to the
 * event, and the name in `EventSummary`. A missing event has no summary: its
 * header shows on all sizes (`allSizes`), so the page keeps a heading.
 */
function EventHeader({ title, allSizes = false }: { title?: string; allSizes?: boolean }) {
  const { m } = useI18n();
  return (
    <PageHeader
      back={{ href: "/munkater/esemenyek", label: m.events.title }}
      title={title ?? m.events.detail.title}
      className={allSizes ? undefined : "lg:hidden"}
    />
  );
}

function EventDetails({ result }: { result: EventPageResult }) {
  const { id } = useParams<{ id: string }>();
  const i18n = useI18n();
  const { m } = i18n;
  // The server resolved the page: there is no stale browser copy (`failed` is always false).
  const page =
    "notFound" in result
      ? { data: null, transient: null, notFound: true as const }
      : { data: result.data, transient: result.transient, notFound: false as const };
  const { modules } = useAppConfig();
  // The copy can be days old: the reply form shows until the end of the event, by the time of the browser.
  const [now] = useState(() => Date.now());

  // The changes of other users and of the projection come at once (see `useEventChanges`): the page loads again.
  const router = useRouter();
  const connection = page.transient?.connection?.connection ?? null;
  const notify = useChangeNotices(id, connection?.userId ?? null);
  const authors = useRef<(string | null)[]>([]);
  const { offline } = useEventChanges(id, connection, (changes) => {
    authors.current.push(
      ...changes.filter((change) => change.kind !== "load").map((change) => change.author),
    );
    router.refresh();
  });
  // No projection status while the module "projection" is off: the page does not join its topic.
  const projectionOn = modules.includes("projection");
  const projection = useProjectionLive(id, projectionOn ? connection : null);
  // No links to the chord sheet while the module "sheet" is off, and no "Join live" while "sheet.live" is off.
  const sheetOn = modules.includes("sheet");
  const liveOn = modules.includes("sheet.live");
  // A link to a page with the items saves the changes of the items first: the page then loads with them (see `savePendingChanges`).
  // The link of the last click, until the save ends. Null after another navigation: the page unmounts.
  const linkAfterSave = useRef<string | null>(null);
  const savingBeforeLink = useRef(false);
  useEffect(
    () => () => {
      linkAfterSave.current = null;
    },
    [],
  );
  function saveFirst(navigation: { preventDefault: () => void }, href: string) {
    if (!hasPendingSaves()) return;
    navigation.preventDefault();
    linkAfterSave.current = href;
    if (savingBeforeLink.current) return;
    savingBeforeLink.current = true;
    void savePendingChanges().then((saved) => {
      savingBeforeLink.current = false;
      const target = linkAfterSave.current;
      linkAfterSave.current = null;
      if (!target) return;
      if (saved) {
        router.push(target, { transitionTypes: NAV_FORWARD });
        return;
      }
      // Without the save, the page stays: the items show the reason, e.g. a text item without a title or no connection.
      // Offline, the router waits for the network, so the button loads the page from the service worker (see `useOfflineLinks`).
      toastInfo(m.events.detail.itemsNotSaved, {
        id: "items-not-saved",
        action: {
          label: m.events.detail.openWithoutSaving,
          onClick: () =>
            navigator.onLine
              ? router.push(target, { transitionTypes: NAV_FORWARD })
              : window.location.assign(target),
        },
      });
    });
  }
  // The place of the save state of the items, below the time of the event (`ItemsForm` renders it there).
  const [saveStatusSlot, setSaveStatusSlot] = useState<HTMLElement | null>(null);
  // For song admins: the song of an item in the edit dialog.
  const [editingSong, setEditingSong] = useState<EditSongTarget | null>(null);
  // After a change of another user: a notice of what changed.
  const loaded = page.data?.event ?? null;
  const previous = useRef(loaded);
  useEffect(() => {
    const before = previous.current;
    previous.current = loaded;
    if (!before || !loaded || before === loaded || authors.current.length === 0) return;
    const users = authors.current;
    authors.current = [];
    const sameDetails =
      before.title === loaded.title &&
      before.startsAt === loaded.startsAt &&
      before.durationMinutes === loaded.durationMinutes &&
      before.youtubeUrl === loaded.youtubeUrl &&
      before.isPrivate === loaded.isPrivate &&
      // A copy of the page cache from before the groups has none.
      sameEventAreas(before.areaIds ?? [], loaded.areaIds ?? []);
    void notify({
      authors: users,
      items: itemChanges(noticeItems(before), noticeItems(loaded)),
      other: sameDetails ? [] : [m.components.eventChanges.detailsChanged],
    });
  }, [loaded, notify, m]);

  if (page.notFound) {
    return (
      <>
        <EventHeader allSizes />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarXIcon />
            </EmptyMedia>
            <EmptyTitle>{m.events.detail.notFoundTitle}</EmptyTitle>
            <EmptyDescription>{m.events.detail.notFoundDescription}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/munkater/esemenyek" className={buttonVariants({ variant: "outline" })}>
              {m.events.detail.backToEvents}
            </Link>
          </EmptyContent>
        </Empty>
      </>
    );
  }
  if (!page.data) return null;

  const { event, canProject } = page.data;
  const volunteers = page.transient?.volunteers ?? page.data.volunteers;
  const myReply = page.data.myReply;
  const admin = page.transient?.admin ?? null;
  const liveSessionId = page.transient?.liveSessionId ?? null;
  // Only with fresh data, as the edit controls of the event.
  const canEditSongs = page.transient?.canEditSongs ?? false;
  // A copy in the browser from an older version has no images.
  const imageSets = page.data.imageSets ?? NO_IMAGE_SETS;
  const look = page.data.look ?? FALLBACK_LOOK;
  // A copy in the browser from an older version has no announcements.
  const announcements = page.data.announcements ?? NO_ANNOUNCEMENTS;
  // A copy in the browser from an older version has no teams.
  const teams = page.data.teams ?? NO_TEAMS;

  // One column: the summary with the actions, the items, the volunteers.
  // The edit controls show only with fresh data: old values in a form could
  // overwrite newer data.
  const values = {
    title: event.title,
    startsAt: event.startsAt,
    durationMinutes: event.durationMinutes,
    youtubeUrl: event.youtubeUrl,
    isPrivate: event.isPrivate,
    areaIds: event.areaIds,
  };
  return (
    <EventFiles canEdit={admin !== null}>
      {/* The drop area is only a context, without an element: the header stays sticky. */}
      <EventHeader title={event.title} />
      <div className="@container flex w-full flex-col gap-6 px-4 py-6 sm:px-6">
        <EventSummary
          event={event}
          groupLabels={page.data.groupLabels ?? NO_GROUP_LABELS}
          actions={
            admin && (
              <div className="flex shrink-0 items-center gap-1">
                <EditDetailsDialog eventId={event.id} values={values} scope={admin.scope} />
                <EventMoreMenu
                  eventId={event.id}
                  values={values}
                  scope={admin.scope}
                  itemCount={event.items.length}
                  volunteerCount={volunteers.length}
                />
              </div>
            )
          }
        />
        {/* Another key than the items form: two siblings with the same key can show twice. */}
        {admin && modules.includes("projection.themes") && (
          <EventThemeSelect
            key={`theme-${event.id}`}
            eventId={event.id}
            themes={admin.themes}
            value={event.projectionThemeId}
          />
        )}
        {event.items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {/* A running live session shows to its volunteers, the music leaders and the superadmins. They start it on the sheet. */}
            {event.items.filter((item) => item.kind === "song").length > 0 &&
              liveOn &&
              liveSessionId && (
                <Link
                  href={liveSheetHref(liveSessionId, `/munkater/esemenyek/${event.id}`, {
                    eventId: event.id,
                  })}
                  transitionTypes={NAV_FORWARD}
                  onNavigate={(navigation) =>
                    saveFirst(
                      navigation,
                      liveSheetHref(liveSessionId, `/munkater/esemenyek/${event.id}`, {
                        eventId: event.id,
                      }),
                    )
                  }
                  className={buttonVariants({ variant: "default", className: "rounded-full" })}
                >
                  <RadioIcon />
                  {m.events.detail.joinLive}
                </Link>
              )}
            {event.items.filter((item) => item.kind === "song").length > 0 && sheetOn && (
              <Link
                href={eventSheetHref(event.id)}
                transitionTypes={NAV_FORWARD}
                onNavigate={(navigation) => saveFirst(navigation, eventSheetHref(event.id))}
                className={buttonVariants({ variant: "secondary", className: "rounded-full" })}
              >
                <FileMusicIcon />
                {m.events.detail.openSheet}
              </Link>
            )}
            {canProject && projectionOn && (
              <Link
                href={projectionHref(event.id)}
                transitionTypes={NAV_FORWARD}
                onNavigate={(navigation) => saveFirst(navigation, projectionHref(event.id))}
                className={buttonVariants({ variant: "secondary", className: "rounded-full" })}
              >
                <PresentationIcon />
                {m.events.detail.project}
                {projection.running && (
                  <span className="size-2 rounded-full bg-danger" aria-hidden />
                )}
              </Link>
            )}
            <EventPrintButton event={event} volunteers={volunteers} />
          </div>
        )}
        {(projection.running || offline) && (
          <p
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted"
          >
            {projection.running && (
              <span className="flex items-center gap-1.5">
                <RadioIcon aria-hidden className="size-4 text-danger" />
                {m.events.detail.projectionRunning}
              </span>
            )}
            {offline && <span>{m.components.eventChanges.offline}</span>}
          </p>
        )}

        <section aria-labelledby="event-items" className="flex flex-col gap-4 border-t pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="event-items" className="font-heading text-fs-5 font-bold tracking-tight">
              {m.events.detail.items}
            </h2>
            {event.items.length > 0 && (
              <p className="text-xs text-muted">
                {formatEventItems(
                  i18n,
                  event.items.filter((item) => item.kind === "song").length,
                  event.items.length,
                )}
              </p>
            )}
            {/* The save state of the items, next to their heading (see `ItemsForm`). */}
            {admin && <div ref={setSaveStatusSlot} className="basis-full empty:hidden" />}
          </div>
          {admin && <DeclinedVolunteers event={event} volunteers={volunteers} />}
          {admin ? (
            <ItemsForm
              key={`items-${event.id}`}
              eventId={event.id}
              // A copy in the browser from an older version has no setlist: the first save then merges with the items of now.
              setlistId={event.setlistId ?? null}
              selection={toItemRows(event.items)}
              liveKey={projection.liveKey}
              // A copy in the browser from an older version has no blocks.
              blocks={event.blocks ?? []}
              catalog={admin.catalog}
              volunteers={volunteers}
              themes={admin.themes}
              maxItems={admin.maxItems}
              imageSets={imageSets}
              look={look}
              announcements={announcements}
              eventStartsAt={event.startsAt}
              eventEndsAt={event.endsAt}
              eventDurationMinutes={event.durationMinutes}
              onEditSong={canEditSongs ? setEditingSong : undefined}
              statusSlot={saveStatusSlot}
            />
          ) : (
            <EventItems
              eventId={event.id}
              // The text items of the modules that are off do not show (see `src/lib/modules/items.ts`).
              items={itemsOn(event.items, modules)}
              blocks={event.blocks ?? []}
              startsAt={event.startsAt}
              durationMinutes={event.durationMinutes}
              onEditSong={canEditSongs ? setEditingSong : undefined}
              liveKey={projection.liveKey}
              volunteers={volunteers}
              imageSets={imageSets}
              look={look}
              announcements={{
                eventId: event.id,
                eventStartsAt: event.startsAt,
                eventEndsAt: event.endsAt,
                data: announcements,
                imageSets,
                look,
              }}
            />
          )}
        </section>

        <Volunteers
          event={event}
          volunteers={volunteers}
          teams={teams}
          admin={admin}
          teamEditor={page.transient?.teamEditor ?? null}
          // A volunteer can reply until the event ends. An older copy has no user id: then the question shows in the card.
          myReply={
            myReply && Date.parse(event.endsAt) > now
              ? { eventId: event.id, userId: myReply.userId ?? "", reply: myReply.reply }
              : null
          }
        />
      </div>
      {canEditSongs && <EditSongDialog target={editingSong} onClose={() => setEditingSong(null)} />}
    </EventFiles>
  );
}

/** The ⋮ menu next to "Edit details": copy and delete, each with its dialog. */
function EventMoreMenu({
  eventId,
  values,
  scope,
  itemCount,
  volunteerCount,
}: Omit<React.ComponentProps<typeof CopyEventDialog>, "open" | "onOpenChange">) {
  const { m } = useI18n();
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <RowMenu
        label={m.events.list.moreActions}
        items={[
          {
            id: "copy",
            label: m.events.forms.copyEvent,
            icon: <CopyPlusIcon />,
            onSelect: () => setCopying(true),
          },
          {
            id: "delete",
            label: m.events.forms.deleteEvent,
            icon: <Trash2Icon />,
            onSelect: () => setDeleting(true),
          },
        ]}
      />
      <CopyEventDialog
        eventId={eventId}
        values={values}
        scope={scope}
        itemCount={itemCount}
        volunteerCount={volunteerCount}
        open={copying}
        onOpenChange={setCopying}
      />
      <DeleteEventButton
        eventId={eventId}
        title={values.title}
        open={deleting}
        onOpenChange={setDeleting}
      />
    </>
  );
}

/** The items for a notice of the changes, with their titles. Without the ids: each change gives the items new ids. */
function noticeItems(event: EventDetailDTO) {
  return event.items.map((item) => ({
    ...item,
    id: undefined,
    title: item.kind === "song" ? item.song.title : item.title,
  }));
}

/**
 * For the event admins: files dropped anywhere on the page become image items
 * (see `event-image-upload.tsx`).
 */
function EventFiles({ canEdit, children }: { canEdit: boolean; children: React.ReactNode }) {
  return canEdit ? <FileDropArea>{children}</FileDropArea> : children;
}

const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/**
 * The top of the event: the date, the name, the time with the duration, and
 * the actions of the event admins. Below them the privacy, the groups and
 * the YouTube link, when the event has them.
 */
function EventSummary({
  event,
  groupLabels,
  actions,
}: {
  event: EventDetailDTO;
  groupLabels: Record<string, string>;
  actions?: React.ReactNode;
}) {
  const i18n = useI18n();
  const { m } = i18n;
  // A copy in the browser from an older version has no groups: an event of all users then.
  const groups = eventGroupLabels(event.areaIds, groupLabels);

  return (
    <section className="flex flex-col gap-3">
      {/* The actions go under the name when the pane has no room for both. */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-64 items-start gap-4">
          <DateBadge date={event.startsAt} featured />
          <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
            {/* Small screens: the top bar has the heading. */}
            <h1 className="hidden font-heading text-fs-6 font-bold tracking-tight break-words lg:block">
              {event.title}
            </h1>
            <p
              aria-hidden
              className="font-heading text-lg font-semibold tracking-tight break-words lg:hidden"
            >
              {event.title}
            </p>
            <p className="text-sm text-muted">
              <LocalDateTime date={event.startsAt} options={DATE_TIME} />
              {" – "}
              {/* On the same calendar day the end time is enough. */}
              <LocalDateTime
                date={event.endsAt}
                options={DATE_TIME}
                sameDayAs={event.startsAt}
                sameDayOptions={TIME}
              />{" "}
              ({i18n.duration(event.durationMinutes)})
            </p>
          </div>
        </div>
        {actions}
      </div>
      {/* A copy in the browser from an older version has no `isPrivate`: a public event then. */}
      {event.isPrivate && (
        <p className="flex items-start gap-2 rounded-card bg-surface-sunken p-3 text-sm text-muted">
          <LockIcon className="mt-0.5 size-4 shrink-0" />
          {m.events.detail.private}
        </p>
      )}
      {(groups.length > 0 || event.youtubeUrl) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {groups.length > 0 && (
            <p className="flex min-w-0 items-center gap-1.5 text-muted">
              <UsersIcon aria-hidden className="size-4 shrink-0" />
              <span className="sr-only">{m.events.detail.groups}: </span>
              <span className="min-w-0 break-words">{groups.join(", ")}</span>
            </p>
          )}
          {event.youtubeUrl && (
            // The model accepts only https links to YouTube, so the link is safe.
            <a
              href={event.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              {m.events.detail.openYoutube}
              <ExternalLinkIcon className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function Volunteers({
  event,
  volunteers,
  teams,
  admin,
  teamEditor,
  myReply,
}: {
  event: EventDetailDTO;
  volunteers: VolunteerDTO[];
  teams: EventTeamsDTO;
  admin: EventPageTransient["admin"];
  /** For the event admins and the leaders of groups. */
  teamEditor: TeamEditorDTO | null;
  /** The signed-in volunteer, while they can reply. */
  myReply: MyReplyTarget | null;
}) {
  const { m, format } = useI18n();
  const volunteerIds = new Set(volunteers.map((person) => person.id));

  return (
    <section className="flex flex-col gap-4 border-t pt-6">
      {/* The buttons go under the heading when the pane has no room for both. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-48">
          <SectionHeading
            title={
              volunteers.length > 0
                ? format(m.events.detail.volunteersWithCount, { count: volunteers.length })
                : m.events.detail.volunteers
            }
            description={m.events.detail.volunteersDescription}
          />
        </div>
        {(admin || teamEditor) && (
          <div className="flex flex-wrap gap-2">
            {teamEditor && (
              <EventTeamsDialog
                eventId={event.id}
                teams={teams}
                volunteers={volunteers}
                editor={teamEditor}
              />
            )}
            {admin && (
              <ManageVolunteersDialog
                eventId={event.id}
                volunteers={volunteers}
                others={admin.users.filter((person) => !volunteerIds.has(person.id))}
                unnamedHidden={admin.unnamedHidden}
              />
            )}
          </div>
        )}
      </div>
      {/* Until the volunteer replies. Then their chip has the reply, unless an older copy has no user id to find the chip. */}
      {myReply && (myReply.reply === null || !myReply.userId) && (
        <div className="rounded-card border bg-surface-sunken px-3 py-2">
          <ReplyForm eventId={event.id} reply={myReply.reply} />
        </div>
      )}
      {/* The note on the teams, from the team planner. */}
      {teams.note && (
        <div className="rounded-card border bg-surface-sunken px-3 py-2 text-sm">
          <span className="font-medium">{m.events.teams.note}: </span>
          <span className="break-words whitespace-pre-wrap">{teams.note}</span>
        </div>
      )}
      {volunteers.length > 0 ? (
        <>
          <ReplySummary volunteers={volunteers} />
          {teams.teams.length > 0 ? (
            <VolunteerTeams teams={teams.teams} volunteers={volunteers} myReply={myReply} />
          ) : (
            <VolunteerList volunteers={volunteers} myReply={myReply} layout="rows" />
          )}
        </>
      ) : (
        <>
          {/* No volunteers, but the texts of the teams, e.g. "Sign up at Gábor". */}
          {teams.teams.some((team) => team.note) && (
            <VolunteerTeams teams={teams.teams} volunteers={[]} />
          )}
          <p className="text-sm text-muted">
            {admin ? m.events.detail.noVolunteersAdmin : m.events.detail.noVolunteers}
          </p>
        </>
      )}
    </section>
  );
}

/** The number of volunteers with each reply, e.g. "3 can come, 1 maybe and 2 have not replied". */
function ReplySummary({ volunteers }: { volunteers: VolunteerDTO[] }) {
  const { m, plural, list } = useI18n();
  const counts = countReplies(volunteers);
  const parts = (["yes", "maybe", "no", "none"] as const)
    .filter((reply) => counts[reply] > 0)
    .map((reply) => plural(m.events.replies.counts[reply], counts[reply]));

  return (
    <p className="flex items-center gap-2 rounded-card bg-surface-sunken px-3 py-2 text-sm text-muted">
      <ReplyIcon
        reply={counts.none > 0 ? null : counts.no > 0 ? "no" : counts.maybe > 0 ? "maybe" : "yes"}
      />
      {list(parts)}
    </p>
  );
}

/**
 * For event admins: the volunteers who replied "no" but have items of the
 * event (the saved items). Nothing when there are none.
 */
function DeclinedVolunteers({
  event,
  volunteers,
}: {
  event: EventDetailDTO;
  volunteers: VolunteerDTO[];
}) {
  const i18n = useI18n();
  const { m, format, list } = i18n;

  const declined = volunteers.flatMap((person) => {
    if (person.reply !== "no") return [];
    const titles = event.items
      .filter((item) => item.volunteerId === person.id)
      .map((item) => (item.kind === "song" ? item.song.title : item.title));
    return titles.length > 0 ? [{ person, titles }] : [];
  });
  if (declined.length === 0) return null;

  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-card border border-warning/40 bg-warning-soft p-3 text-sm text-warning"
    >
      <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1">
        {declined.map(({ person, titles }) => (
          <p key={person.id} className="break-words">
            {format(m.events.replies.declinedItems, {
              name: personName(person, i18n),
              items: list(titles),
            })}
          </p>
        ))}
        <p>{m.events.replies.declinedHint}</p>
      </div>
    </div>
  );
}

// Prints the saved items, also while an event admin has unsaved changes in the form.
function EventPrintButton({
  event,
  volunteers,
}: {
  event: EventDetailDTO;
  volunteers: PersonDTO[];
}) {
  const i18n = useI18n();
  const { separator } = i18n.m.common;
  const { modules } = useAppConfig();
  const volunteersById = new Map(volunteers.map((person) => [person.id, person]));
  const volunteerName = (id: string | null) => {
    const person = id ? volunteersById.get(id) : undefined;
    return person ? personName(person, i18n) : null;
  };

  const items = itemsOn(event.items, modules).map((item): PrintSetlistItem =>
    item.kind === "song"
      ? {
          kind: "song",
          title: item.song.title,
          details: [item.song.artist, item.arrangement.name].filter(Boolean).join(separator),
          key: item.musicalKey ?? item.arrangement.key,
          bpm: item.arrangement.bpm,
          timeSignature: item.arrangement.timeSignature,
          volunteer: volunteerName(item.volunteerId),
        }
      : {
          kind: "text",
          title: item.title,
          notes: item.notes,
          scripture: item.scripture,
          scriptureTranslation: item.scriptureTranslation,
          description: item.description,
          highlight: item.highlight,
          volunteer: volunteerName(item.volunteerId),
        },
  );

  return (
    <PrintSetlistButton
      title={event.title}
      date={event.startsAt}
      summary={formatEventItems(
        i18n,
        event.items.filter((item) => item.kind === "song").length,
        event.items.length,
      )}
      items={items}
      labelClassName=""
      variant="secondary"
      className="rounded-full"
    />
  );
}
