import type { Calendar, Event, EventVisibility } from "@churchy/contracts";
import { huCollator } from "@churchy/contracts";
import type { FieldDef, FormValues } from "@/lib/admin/content-form";
import { localInputValue, textFromDoc } from "@/lib/admin/content";
import {
  creatableCalendars,
  creatableVisibilities,
  mayCreateEvent,
  VISIBILITIES,
} from "@/lib/workspace/event-access";
import { getT } from "@/i18n/server";
import type { WorkspaceEnv } from "@/server/workspace";

/**
 * Field descriptors and values of the workspace event form (D-57). The select options only offer
 * what `can()` allows this actor to create: their personal / team / shared calendars, the
 * visibilities of `calendarEvent.create` and the teams they may create team events for.
 */

export async function eventFormFields(env: WorkspaceEnv, event?: Event): Promise<FieldDef[]> {
  const { actor, tenantId, repos, ctx } = env;
  const [t, vis, calendars, teams, locations] = await Promise.all([
    getT("munkater.event.fields"),
    getT("munkater.entry.visibility"),
    repos.events.listCalendars(ctx),
    repos.teams.list(ctx),
    repos.locations.list(ctx),
  ]);
  const own = creatableCalendars(actor, calendars);
  // Editing an event in a calendar one may not add to (e.g. as the leader) keeps that calendar.
  const current = event ? calendars.find((c) => c.id === event.calendarId) : undefined;
  const choosable: Calendar[] = current && !own.includes(current) ? [...own, current] : own;

  const visibilities = VISIBILITIES.filter(
    (v) =>
      creatableVisibilities(actor, tenantId, null).includes(v) ||
      (v === "team" && teams.some((x) => mayCreateEvent(actor, tenantId, "team", x.id))),
  );
  const teamOptions = teams
    .filter((x) => mayCreateEvent(actor, tenantId, "team", x.id))
    .sort((a, b) => huCollator.compare(a.name, b.name));

  return [
    { kind: "text", name: "title", label: t("title"), required: true },
    {
      kind: "select",
      name: "calendarId",
      label: t("calendarId"),
      required: true,
      options: choosable.map((c) => ({ value: c.id, label: c.name })),
    },
    {
      kind: "select",
      name: "visibility",
      label: t("visibility"),
      help: t("visibilityHelp"),
      required: true,
      options: visibilities.map((v) => ({ value: v, label: vis(v) })),
    },
    {
      kind: "select",
      name: "teamId",
      label: t("teamId"),
      help: t("teamHelp"),
      placeholder: t("teamNone"),
      options: teamOptions.map((x) => ({ value: x.id, label: x.name })),
    },
    { kind: "datetime-local", name: "startsAt", label: t("startsAt"), required: true },
    { kind: "datetime-local", name: "endsAt", label: t("endsAt") },
    {
      kind: "select",
      name: "locationId",
      label: t("locationId"),
      placeholder: t("locationNone"),
      options: locations.map((l) => ({ value: l.id, label: l.name })),
    },
    { kind: "textarea", name: "body", label: t("body"), rows: 5 },
  ];
}

/** Values of the form: the event's, or sensible defaults for a new one. */
export async function eventFormValues(
  env: WorkspaceEnv,
  event: Event | undefined,
  startDate: string | null,
): Promise<FormValues> {
  if (event) {
    return {
      title: event.title,
      calendarId: event.calendarId,
      visibility: event.visibility,
      teamId: event.teamId ?? "",
      startsAt: localInputValue(event.startsAt),
      endsAt: localInputValue(event.endsAt),
      locationId: event.locationId ?? "",
      body: textFromDoc(event.body),
    };
  }
  const calendars = creatableCalendars(env.actor, await env.repos.events.listCalendars(env.ctx));
  // The personal calendar first: every workspace role has one.
  const calendar = calendars.find((c) => c.kind === "personal") ?? calendars[0];
  const allowed = creatableVisibilities(env.actor, env.tenantId, null);
  const wanted: EventVisibility | undefined = calendar?.defaultVisibility;
  const visibility = wanted && allowed.includes(wanted) ? wanted : (allowed[0] ?? "private");
  return {
    title: "",
    calendarId: calendar?.id ?? "",
    visibility,
    teamId: "",
    startsAt: `${startDate ?? env.today}T09:00`,
    endsAt: "",
    locationId: "",
    body: "",
  };
}
