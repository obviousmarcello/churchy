"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { PlusIcon, TagsIcon, UsersRoundIcon } from "lucide-react";

import { DIALOG_FORM_CLASS, DialogBody, DialogFooter } from "@/components/music/dialog-parts";
import { FormFooter, submitWithoutReset } from "@/components/music/form-parts";
import { invalidating } from "@/components/music/page-cache";
import { PeoplePicker } from "@/components/music/people-picker";
import { Button, buttonVariants } from "@/components/music/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { Label } from "@/components/music/ui/label";
import { NativeSelect } from "@/components/music/ui/native-select";
import type { AvatarPerson } from "@/components/music/user-avatar";
import { useI18n } from "@/i18n/music/client";
import { rich } from "@/i18n/music/rich";
import { changedPages } from "@/lib/music/page-keys";
import { AREA_MEMBERS_MAX, type EventTeamsDTO } from "@/lib/music/volunteer-templates";
import type { TeamEditorDTO } from "@/server/music/models/event-teams";
import type { VolunteerDTO } from "@/server/music/models/events";
import { saveEventTeamsAction, type EventFormState } from "./actions-client";
import { FormDialog } from "./event-forms";
import { VolunteerList, type MyReplyTarget } from "./volunteer-list";

const initialState: EventFormState = { status: "idle", message: null, fieldErrors: {} };

/** The users of each area, by area id. */
type Members = Record<string, string[]>;

/**
 * The volunteers by team: a row for each service area with volunteers or a
 * text in their place (e.g. "Sign up at Gábor"), then the volunteers in no
 * team. Each volunteer shows once in each of their teams.
 */
export function VolunteerTeams({
  teams,
  volunteers,
  myReply,
}: {
  teams: EventTeamsDTO["teams"];
  volunteers: VolunteerDTO[];
  myReply?: MyReplyTarget | null;
}) {
  const { m } = useI18n();
  const byId = new Map(volunteers.map((person) => [person.id, person]));
  const inTeams = new Set(teams.flatMap((team) => team.userIds));
  const others = volunteers.filter((person) => !inTeams.has(person.id));
  const rows = [
    ...teams.map((team) => ({
      key: team.areaId,
      name: team.name,
      // A volunteer of an older copy of the page can be missing.
      people: team.userIds.flatMap((id) => byId.get(id) ?? []),
      // An older copy of the page has no text.
      note: team.note ?? null,
    })),
    ...(others.length > 0
      ? [{ key: "others", name: m.events.teams.noTeam, people: others, note: null }]
      : []),
  ].filter((row) => row.people.length > 0 || row.note);

  // A card for each team: two columns when the pane has room.
  return (
    <ul className="@container grid gap-3 @2xl:grid-cols-2">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-2 rounded-xl border p-4">
          <h3 className="min-w-0 text-sm font-semibold break-words">{row.name}</h3>
          {row.note && row.people.length === 0 && (
            <p className="text-sm break-words whitespace-pre-wrap">{row.note}</p>
          )}
          {row.people.length > 0 && (
            <VolunteerList volunteers={row.people} myReply={myReply} layout="rows" />
          )}
        </li>
      ))}
    </ul>
  );
}

/** The "Teams" button of the volunteers and its dialog: the template and the people of each team. */
export function EventTeamsDialog({
  eventId,
  teams,
  volunteers,
  editor,
}: {
  eventId: string;
  teams: EventTeamsDTO;
  volunteers: VolunteerDTO[];
  editor: TeamEditorDTO;
}) {
  const { m } = useI18n();

  return (
    <FormDialog
      trigger={
        <>
          <UsersRoundIcon />
          {m.events.teams.button}
        </>
      }
      title={m.events.teams.title}
      description={
        editor.editable === "all" ? m.events.teams.description : m.events.teams.leaderDescription
      }
    >
      <TeamsForm eventId={eventId} teams={teams} volunteers={volunteers} editor={editor} />
    </FormDialog>
  );
}

/**
 * The form of the dialog. An event admin picks the template and saves all
 * teams. A leader sees only the groups that they lead, and saves only the
 * teams that they changed.
 */
function TeamsForm({
  eventId,
  teams,
  volunteers,
  editor,
}: {
  eventId: string;
  teams: EventTeamsDTO;
  volunteers: VolunteerDTO[];
  editor: TeamEditorDTO;
}) {
  const { m, format, plural } = useI18n();
  const t = m.events.teams;
  const id = useId();
  const [state, formAction, pending] = useActionState(
    invalidating(changedPages.event(eventId), saveEventTeamsAction),
    initialState,
  );
  const isAdmin = editor.editable === "all";
  const editable = new Set(isAdmin ? editor.areas.map((area) => area.id) : editor.editable);
  // A template that was deleted meanwhile counts as none.
  const [templateId, setTemplateId] = useState(
    editor.templates.some((template) => template.id === teams.templateId) ? teams.templateId : null,
  );
  const saved = Object.fromEntries(teams.teams.map((team) => [team.areaId, team.userIds]));
  const [members, setMembers] = useState<Members>(saved);
  const notes = new Map(
    teams.teams.flatMap((team) => (team.note ? [[team.areaId, team.note] as const] : [])),
  );
  const [allAreas, setAllAreas] = useState(false);

  const template = editor.templates.find((other) => other.id === templateId) ?? null;
  const templateAreas = new Set(template?.areaIds);
  const editableAreas = editor.areas.filter((area) => editable.has(area.id));
  // The groups of the template and the groups that have people now. Without a template, or on request: all groups.
  const areas = editableAreas.filter(
    (area) =>
      !template ||
      allAreas ||
      templateAreas.has(area.id) ||
      (members[area.id]?.length ?? 0) > 0 ||
      notes.has(area.id),
  );
  const hiddenAreas = editableAreas.length - areas.length;
  const fields = {
    templateId,
    teams: isAdmin
      ? // All teams with people: the other groups lose theirs.
        editor.areas.flatMap((area) => {
          const userIds = members[area.id] ?? [];
          return userIds.length > 0 ? [{ areaId: area.id, userIds }] : [];
        })
      : // Only the changed teams of the groups of the leader.
        editableAreas.flatMap((area) => {
          const userIds = members[area.id] ?? [];
          return sameIds(userIds, saved[area.id] ?? []) ? [] : [{ areaId: area.id, userIds }];
        }),
  };

  // The users to add, and the members of the groups that the list leaves out (users without a display name).
  const userIds = new Set(editor.users.map((person) => person.id));
  const options: AvatarPerson[] = [
    ...editor.users,
    ...editor.people.filter((person) => !userIds.has(person.id)),
  ];
  const known = new Map<string, AvatarPerson>(
    [...volunteers, ...editor.people].map((person) => [person.id, person]),
  );

  if (editableAreas.length === 0) {
    return (
      <DialogBody>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TagsIcon />
            </EmptyMedia>
            <EmptyTitle>{t.noAreasTitle}</EmptyTitle>
            <EmptyDescription>{t.noAreasDescription}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              href="/munkater/esemenyek/csoportok"
              className={buttonVariants({ variant: "outline" })}
            >
              {t.openGroups}
            </Link>
          </EmptyContent>
        </Empty>
      </DialogBody>
    );
  }

  return (
    <div className={DIALOG_FORM_CLASS}>
      {/* The buttons are in the fixed footer, outside the form: they name it with `form`. */}
      <DialogBody>
        <form
          id={`${id}-form`}
          onSubmit={submitWithoutReset(formAction)}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="id" value={eventId} />
          <input type="hidden" name="teams" value={JSON.stringify(fields)} />

          {isAdmin ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-template`}>{t.template}</Label>
              <NativeSelect
                id={`${id}-template`}
                value={templateId ?? ""}
                onChange={(event) => setTemplateId(event.target.value || null)}
                aria-describedby={`${id}-template-hint`}
              >
                <option value="">{t.noTemplate}</option>
                {editor.templates.map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.name}
                  </option>
                ))}
              </NativeSelect>
              <p id={`${id}-template-hint`} className="text-sm text-muted">
                {editor.templates.length === 0
                  ? rich(t.noTemplates, {
                      link: (text) => (
                        <Link href="/volunteer-templates" className="underline underline-offset-4">
                          {text}
                        </Link>
                      ),
                    })
                  : template
                    ? t.templateHint
                    : t.allAreasHint}
              </p>
            </div>
          ) : (
            template && (
              <p className="text-sm text-muted">
                {format(t.leaderTemplate, { template: template.name })}
              </p>
            )
          )}

          {areas.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted">
              {t.templateEmpty}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {areas.map((area) => {
                const groupMembers = editor.groupMembers[area.id] ?? [];
                // A leader adds only the members of the group; the people of the saved team stay (the database checks it too).
                const allowed = new Set([...groupMembers, ...(saved[area.id] ?? [])]);
                return (
                  <li key={area.id} className="flex flex-col gap-2 px-3 py-3">
                    <span className="text-sm font-medium">{area.name}</span>
                    <PeoplePicker
                      options={
                        isAdmin ? options : options.filter((person) => allowed.has(person.id))
                      }
                      value={members[area.id] ?? []}
                      onChange={(ids) => setMembers((current) => ({ ...current, [area.id]: ids }))}
                      known={known}
                      label={format(t.peopleOf, { area: area.name })}
                      placeholder={t.placeholder}
                      removeLabel={(name) => format(t.removePerson, { name, area: area.name })}
                      max={AREA_MEMBERS_MAX}
                      suggested={
                        groupMembers.length > 0
                          ? {
                              ids: new Set(groupMembers),
                              label: t.fromGroup,
                              othersLabel: t.otherUsers,
                            }
                          : undefined
                      }
                    />
                    {notes.has(area.id) && (members[area.id]?.length ?? 0) === 0 && (
                      <p className="text-sm text-muted">
                        {format(t.noteHint, { note: notes.get(area.id) ?? "" })}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {hiddenAreas > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setAllAreas(true)}
            >
              <PlusIcon />
              {plural(t.showOtherAreas, hiddenAreas)}
            </Button>
          )}
          {editor.unnamedHidden && (
            <p className="text-sm text-muted">{m.events.forms.unnamedHidden}</p>
          )}
        </form>
      </DialogBody>

      <DialogFooter>
        <FormFooter state={state}>
          <Button type="submit" form={`${id}-form`} disabled={pending}>
            {pending ? t.saving : t.save}
          </Button>
        </FormFooter>

        {/* A volunteer who leaves the teams has an open projection: the same save can close it. */}
        {state.fieldErrors.endProjections && (
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-danger">
            <p role="alert">{state.fieldErrors.endProjections.join(" ")}</p>
            <Button
              type="submit"
              form={`${id}-form`}
              name="endProjections"
              value="on"
              variant="link"
              className="h-auto p-0"
              disabled={pending}
            >
              {t.saveAndEndProjection}
            </Button>
          </div>
        )}
      </DialogFooter>
    </div>
  );
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
