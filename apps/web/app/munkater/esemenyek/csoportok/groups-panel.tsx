"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { Label } from "@/components/music/ui/label";
import { NativeSelect } from "@/components/music/ui/native-select";
import { useI18n } from "@/i18n/music/client";
import type { FormState } from "@/server/music/form-state";
import {
  createGroupAction,
  deleteGroupAction,
  setGroupMembersAction,
  setGroupRolesAction,
} from "./actions";

type Group = { id: string; label: string; isRoot: boolean; memberIds: string[]; roles: string[] };
const ROLES = ["song_admin", "event_admin", "music_leader", "course_admin"] as const;
type Result =
  | { readonly ok: true; readonly value: FormState }
  | { readonly ok: false; readonly status: 403 | 404 };

export function GroupsPanel({
  groups,
  people,
  canEditRoles,
}: {
  canEditRoles: boolean;
  groups: Group[];
  people: { id: string; name: string }[];
}) {
  const { m } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const t = m.groups;

  const send = (action: (formData: FormData) => Promise<Result>, data: FormData) =>
    start(async () => {
      const result = await action(data);
      const failed = !result.ok || result.value.status === "error";
      setError(failed ? (result.ok ? result.value.message : null) || t.failed : null);
      router.refresh();
    });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <p className="text-sm text-muted">{t.lead}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {groups.length === 0 ? (
        <p className="text-sm text-muted">{t.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((group) => (
            <li key={group.id} className="flex flex-col gap-2 rounded-lg border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{group.label}</span>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-expanded={open === group.id}
                    onClick={() => setOpen(open === group.id ? null : group.id)}
                  >
                    {t.members} ({group.memberIds.length})
                  </Button>
                  {!group.isRoot && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(t.deleteConfirm)) return;
                        const data = new FormData();
                        data.set("id", group.id);
                        send(deleteGroupAction, data);
                      }}
                    >
                      {t.delete}
                    </Button>
                  )}
                </span>
              </div>
              {open === group.id && (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    data.set("id", group.id);
                    send(setGroupMembersAction, data);
                  }}
                >
                  {people.map((person) => (
                    <span key={person.id} className="flex items-center gap-3 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="userId"
                          value={person.id}
                          defaultChecked={group.memberIds.includes(person.id)}
                        />
                        {person.name}
                      </label>
                      <label className="flex items-center gap-1 text-muted">
                        <input type="checkbox" name={`leader-${person.id}`} />
                        {t.leader}
                      </label>
                    </span>
                  ))}
                  <Button type="submit" disabled={pending} className="self-start">
                    {t.saveMembers}
                  </Button>
                </form>
              )}
              {open === group.id && canEditRoles && (
                <form
                  className="flex flex-col gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    data.set("id", group.id);
                    send(setGroupRolesAction, data);
                  }}
                >
                  <span className="text-sm font-medium">{t.rolesTitle}</span>
                  {ROLES.map((role) => (
                    <label key={role} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="role"
                        value={role}
                        defaultChecked={group.roles.includes(role)}
                      />
                      {t.roles[role]}
                    </label>
                  ))}
                  <Button type="submit" disabled={pending} className="self-start">
                    {t.saveRoles}
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send(createGroupAction, new FormData(event.currentTarget));
          event.currentTarget.reset();
        }}
      >
        <Label htmlFor="group-name">{t.add}</Label>
        <Input id="group-name" name="name" required maxLength={60} placeholder={t.name} />
        <Label htmlFor="group-parent">{t.parent}</Label>
        <NativeSelect id="group-parent" name="parentId">
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.label}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline" disabled={pending} className="self-start">
          {t.create}
        </Button>
      </form>
    </div>
  );
}
