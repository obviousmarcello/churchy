import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/music/page-header";
import { getI18n } from "@/i18n/music/server";
import { pathLabel, treeOrder } from "@/lib/music/groups";
import { requireEventsPageUser } from "@/server/music/auth";
import {
  listGroupMemberIds,
  listGroupRolesByGroup,
  listGroups,
} from "@/server/music/models/groups";
import { listPeople } from "@/server/music/models/profiles";
import { GroupsPanel } from "./groups-panel";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.groups.title, robots: { index: false, follow: false } };
}

export default async function GroupsPage() {
  const [user, { m }] = await Promise.all([requireEventsPageUser(), getI18n()]);
  if (!user.canEditEvents && !user.leadsGroups) notFound();
  const [groups, people, memberIds, roles] = await Promise.all([
    listGroups(),
    listPeople(),
    listGroupMemberIds(),
    listGroupRolesByGroup(),
  ]);
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title={m.groups.title}
        back={{ href: "/munkater/esemenyek", label: m.events.title }}
      />
      <GroupsPanel
        groups={treeOrder(groups).map((group) => ({
          id: group.id,
          label: pathLabel(group),
          isRoot: group.isRoot,
          memberIds: memberIds.get(group.id) ?? [],
          roles: roles.get(group.id) ?? [],
        }))}
        canEditRoles={user.canManageGroupRoles}
        people={people.map((person) => ({ id: person.id, name: person.name }))}
      />
    </main>
  );
}
