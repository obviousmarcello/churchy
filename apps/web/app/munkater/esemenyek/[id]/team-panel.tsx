"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/music/ui/button";
import { Label } from "@/components/music/ui/label";
import { NativeSelect } from "@/components/music/ui/native-select";
import { useI18n } from "@/i18n/music/client";
import { setAreaTeamAction, setMyReplyAction } from "../actions";

type Team = { areaId: string; name: string; userIds: string[]; note: string | null };
type Person = { id: string; name: string };
type Outcome =
  | { readonly ok: true; readonly value: { ok: boolean } }
  | { readonly ok: false; readonly status: 403 | 404 };

/** The team of an event by area, the signed-in volunteer's reply, and the editor for those who may. */
export function TeamPanel({
  eventId,
  teams,
  people,
  areas,
  editableAreaIds,
  myReply,
}: {
  eventId: string;
  teams: Team[];
  people: Person[];
  areas: { id: string; name: string }[];
  /** The areas the user may change; empty: read-only. */
  editableAreaIds: string[];
  myReply: { volunteer: boolean; reply: string | null };
}) {
  const { m } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const [areaId, setAreaId] = useState(editableAreaIds[0] ?? "");
  const t = m.events.team;
  const nameOf = (id: string) => people.find((person) => person.id === id)?.name ?? "?";
  const current = teams.find((team) => team.areaId === areaId)?.userIds ?? [];

  const send = (action: (data: FormData) => Promise<Outcome>, data: FormData) => {
    data.set("id", eventId);
    start(async () => {
      const result = await action(data);
      setError(!result.ok || !result.value.ok);
      router.refresh();
    });
  };

  const options = areas.filter((area) => editableAreaIds.includes(area.id));

  return (
    <section className="flex flex-col gap-3" aria-labelledby="team-h">
      <h2 id="team-h" className="text-lg font-semibold">
        {t.title}
      </h2>
      {teams.length === 0 ? (
        <p className="text-sm text-muted">{t.empty}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {teams.map((team) => (
            <li key={team.areaId}>
              <span className="font-medium">{team.name}: </span>
              {team.userIds.length > 0 ? team.userIds.map(nameOf).join(", ") : team.note}
            </li>
          ))}
        </ul>
      )}
      {myReply.volunteer && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{t.myReply}</span>
          {(["yes", "maybe", "no"] as const).map((reply) => (
            <Button
              key={reply}
              size="sm"
              variant={myReply.reply === reply ? "default" : "outline"}
              disabled={pending}
              onClick={() => {
                const data = new FormData();
                data.set("reply", reply);
                send(setMyReplyAction, data);
              }}
            >
              {t[reply]}
            </Button>
          ))}
        </div>
      )}
      {options.length > 0 && (
        <form
          className="flex flex-col gap-2"
          key={areaId}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            data.set("areaId", areaId);
            send(setAreaTeamAction, data);
          }}
        >
          <Label htmlFor="team-area">{t.area}</Label>
          <NativeSelect
            id="team-area"
            value={areaId}
            onChange={(event) => setAreaId(event.target.value)}
          >
            {options.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </NativeSelect>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm">{t.people}</legend>
            {people.length === 0 && <p className="text-sm text-muted">{t.noPeople}</p>}
            {people.map((person) => (
              <label key={person.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="userId"
                  value={person.id}
                  defaultChecked={current.includes(person.id)}
                />
                {person.name}
              </label>
            ))}
          </fieldset>
          <Button type="submit" disabled={pending} className="self-start">
            {t.save}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {t.failed}
        </p>
      )}
    </section>
  );
}
