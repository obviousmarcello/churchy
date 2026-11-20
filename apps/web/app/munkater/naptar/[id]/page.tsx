import { notFound } from "next/navigation";
import { budapestDate, describeRecurrence, richTextPlain } from "@churchy/events";
import { Badge, ButtonLink, FormattedDate, FormattedTime } from "@churchy/ui";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { EntityForm } from "@/components/admin/content/entity-form";
import { SavedNotice } from "@/components/admin/content/list-parts";
import { getT } from "@/i18n/server";
import { eventVisibleTo, mayEditEvent } from "@/lib/workspace/event-access";
import { deleteWorkspaceEvent, updateWorkspaceEvent } from "@/server/workspace-event-actions";
import { eventFormFields, eventFormValues } from "@/server/workspace-event-form";
import { getMemberEnv } from "@/server/workspace";
import { requireWorkspaceModule } from "@/server/workspace-nav";

type Params = Promise<{ id: string }>;

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.event"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** An event of the workspace calendar (D-57): details for everyone who may see it, a form for editors. */
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireWorkspaceModule("ws.calendar");
  const [{ id }, query, env, t, vis, form] = await Promise.all([
    params,
    searchParams,
    getMemberEnv(),
    getT("munkater.event"),
    getT("munkater.entry.visibility"),
    getT("admin.content.form"),
  ]);
  const { repos, ctx, actor } = env;
  const [event, calendars] = await Promise.all([
    repos.events.get(ctx, id),
    repos.events.listCalendars(ctx),
  ]);
  const calendar = event ? calendars.find((c) => c.id === event.calendarId) : undefined;
  // A hidden event looks exactly like a missing one.
  if (event === null || !eventVisibleTo(actor, event, calendar)) notFound();

  const location =
    event.locationId === null ? null : await repos.locations.get(ctx, event.locationId);
  const team = event.teamId === null ? null : await repos.teams.get(ctx, event.teamId);
  const recurrence =
    event.rrule === null
      ? null
      : describeRecurrence(event.rrule, { start: event.startsAt, allDay: event.allDay });
  const body = event.body === null ? "" : richTextPlain(event.body);
  const editable = mayEditEvent(actor, event, calendar);

  return (
    <div className="flex max-w-2xl flex-col gap-5" data-testid="workspace-event">
      <header className="flex flex-col gap-2">
        <ButtonLink href="/munkater/naptar" variant="secondary" size="sm" className="self-start">
          {t("back")}
        </ButtonLink>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {event.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{vis(event.visibility)}</Badge>
          {calendar ? <Badge tone="info">{calendar.name}</Badge> : null}
          {team ? <Badge>{team.name}</Badge> : null}
        </div>
      </header>
      <SavedNotice saved={query["mentve"] === "1"} />
      <dl className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <dt className="font-semibold">{t("when")}</dt>
        <dd>
          <FormattedDate value={budapestDate(event.startsAt)} />
          {event.allDay ? null : (
            <>
              {", "}
              <FormattedTime value={event.startsAt} end={event.endsAt ?? undefined} />
            </>
          )}
          {recurrence ? <p className="text-muted">{recurrence}</p> : null}
        </dd>
        {location ? (
          <>
            <dt className="font-semibold">{t("where")}</dt>
            <dd>{location.name}</dd>
          </>
        ) : null}
        {body === "" ? null : (
          <>
            <dt className="font-semibold">{t("about")}</dt>
            <dd className="whitespace-pre-line">{body}</dd>
          </>
        )}
      </dl>
      {editable ? (
        <section
          aria-labelledby="edit-heading"
          className="flex flex-col gap-4 border-t border-border pt-5"
        >
          <h2 id="edit-heading" className="font-heading text-fs-5 font-bold">
            {t("editTitle")}
          </h2>
          <EntityForm
            action={updateWorkspaceEvent.bind(null, id)}
            fields={await eventFormFields(env, event)}
            values={await eventFormValues(env, event, null)}
            submitLabel={form("save")}
            cancelHref="/munkater/naptar"
            testId="event-form"
          />
          <div>
            <DeleteButton
              name={event.title}
              onDelete={deleteWorkspaceEvent.bind(null, id)}
              redirectTo="/munkater/naptar"
              size="md"
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
