"use server";

import { redirect } from "next/navigation";
import {
  EventInputSchema,
  EventVisibilitySchema,
  isContractError,
  type Event,
  type EventVisibility,
} from "@churchy/contracts";
import { validate, formValues, repositoryErrors, type FormState } from "@/lib/admin/content-form";
import { bodyFromText, instantFromLocalInput, uniqueSlug } from "@/lib/admin/content";
import { mayEditEvent } from "@/lib/workspace/event-access";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";
import { getRequestContext } from "@/server/session";
import { workspaceErrorMessages } from "@/server/workspace-form";

/**
 * Mutations of the workspace calendar (D-57). Creating and changing an event is checked against
 * `calendarEvent.create` with the **visibility the form asks for** (and the team for `team`
 * events): volunteers may only keep private events, team leaders create team events of their own
 * teams, only the leader publishes to the website. Editing / deleting additionally needs to be
 * the creator, the calendar's owner or editor, or the leader (`mayEditEvent`).
 *
 * Internal events are saved as `published` — that status only matters on the website, where
 * everything but `public` stays invisible whatever the status (SDD ADR-9).
 */

const EVENT_FIELDS = [
  "title",
  "calendarId",
  "visibility",
  "teamId",
  "startsAt",
  "endsAt",
  "locationId",
  "body",
] as const;

const WINDOW = { from: "2000-01-01T00:00:00Z", to: "2100-01-01T00:00:00Z" };

type Outcome = "ok" | "invalid" | "notFound";

/** The policy resource of a save: the visibility and team the form asks for. */
async function eventResource(_scope: PolicyScope, ...args: unknown[]) {
  const form = args.at(-1);
  if (!(form instanceof FormData)) return null;
  const { tenantId } = await getRequestContext();
  if (tenantId === undefined) return null;
  const visibility = EventVisibilitySchema.safeParse(form.get("visibility"));
  if (!visibility.success) return null;
  const team = form.get("teamId");
  return {
    tenantId,
    visibility: visibility.data,
    teamId: typeof team === "string" && team !== "" ? team : null,
  };
}

const forCreate = eventResource as (
  scope: PolicyScope,
  previous: FormState,
  form: FormData,
) => ReturnType<typeof eventResource>;
const forUpdate = eventResource as (
  scope: PolicyScope,
  id: string,
  previous: FormState,
  form: FormData,
) => ReturnType<typeof eventResource>;

async function save(
  scope: PolicyScope,
  id: string | null,
  form: FormData,
): Promise<FormState | undefined> {
  const repos = await getRequestRepositories();
  const { ctx, actor } = scope;
  const messages = await workspaceErrorMessages();
  const values = formValues(form, EVENT_FIELDS);
  const invalid = (errors: Record<string, string>): FormState => ({
    status: "invalid",
    errors,
    values,
  });

  const existing = id === null ? null : await repos.events.get(ctx, id);
  if (id !== null) {
    if (existing === null) return invalid({ _form: messages.notFound });
    const calendar = (await repos.events.listCalendars(ctx)).find(
      (c) => c.id === existing.calendarId,
    );
    if (!mayEditEvent(actor, existing, calendar)) return { status: "denied" };
  }

  const errors: Record<string, string> = {};
  for (const name of ["title", "calendarId", "startsAt"] as const) {
    if ((values[name] ?? "").trim() === "") errors[name] = messages.required;
  }
  if (values["visibility"] === "team" && (values["teamId"] ?? "") === "") {
    errors["teamId"] = messages.required;
  }
  if (Object.keys(errors).length > 0) return invalid(errors);

  const taken = (await repos.events.list(ctx, WINDOW))
    .filter((e) => e.id !== id)
    .map((e) => e.slug);
  const nullable = (s: string | undefined) =>
    s === undefined || s.trim() === "" ? null : s.trim();
  const parsed = validate(
    EventInputSchema,
    {
      id: id ?? undefined,
      calendarId: values["calendarId"],
      visibility: values["visibility"],
      slug: existing?.slug ?? uniqueSlug(values["title"] ?? "", taken, "esemeny"),
      title: values["title"],
      body: bodyFromText(existing?.body, values["body"] ?? ""),
      startsAt: instantFromLocalInput(values["startsAt"]) ?? "",
      endsAt: instantFromLocalInput(values["endsAt"]),
      allDay: existing?.allDay ?? false,
      rrule: existing?.rrule ?? null,
      exdates: existing?.exdates ?? [],
      parentEventId: existing?.parentEventId ?? null,
      recurrenceId: existing?.recurrenceId ?? null,
      locationId: nullable(values["locationId"]),
      groupId: existing?.groupId ?? null,
      teamId: values["visibility"] === "team" ? nullable(values["teamId"]) : null,
      category: existing?.category ?? null,
      coverMediaId: existing?.coverMediaId ?? null,
    },
    EVENT_FIELDS,
    messages,
  );
  if (!parsed.ok) return invalid(parsed.errors);

  let saved: Event;
  try {
    saved = await repos.events.upsert(ctx, parsed.data);
    if (saved.status !== "published") await repos.events.setStatus(ctx, saved.id, "published");
  } catch (error) {
    return invalid(repositoryErrors(error, EVENT_FIELDS, messages));
  }
  redirect(`/munkater/naptar/${saved.id}?mentve=1`);
}

export const createWorkspaceEvent = withPolicy(
  "calendarEvent.create",
  forCreate,
  (scope, _previous: FormState, form: FormData) => save(scope, null, form),
);

export const updateWorkspaceEvent = withPolicy(
  "calendarEvent.create",
  forUpdate,
  (scope, id: string, _previous: FormState, form: FormData) => save(scope, id, form),
);

/** Deleting: the same capability as editing, on the event's own visibility. */
async function deleteResource(scope: PolicyScope, id: string) {
  const { tenantId } = await getRequestContext();
  if (tenantId === undefined) return null;
  const repos = await getRequestRepositories();
  const event = await repos.events.get(scope.ctx, id);
  if (event === null) return null;
  return { tenantId, visibility: event.visibility as EventVisibility, teamId: event.teamId };
}

export const deleteWorkspaceEvent = withPolicy(
  "calendarEvent.create",
  deleteResource,
  async (scope, id: string): Promise<Outcome> => {
    const repos = await getRequestRepositories();
    const event = await repos.events.get(scope.ctx, id);
    if (event === null) return "notFound";
    const calendar = (await repos.events.listCalendars(scope.ctx)).find(
      (c) => c.id === event.calendarId,
    );
    if (!mayEditEvent(scope.actor, event, calendar)) return "invalid";
    try {
      await repos.events.delete(scope.ctx, id);
      return "ok";
    } catch (error) {
      if (isContractError(error, "NOT_FOUND")) return "notFound";
      throw error;
    }
  },
);
