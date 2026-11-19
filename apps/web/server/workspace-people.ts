import type { Person, Team, TeamMember, TeamPosition } from "@churchy/contracts";
import { can } from "@churchy/policy";
import { visibleContact, type VisibleContact } from "@/lib/workspace/contacts";
export { filterDirectory, type DirectoryFilter } from "@/lib/workspace/directory";
import type { WorkspaceEnv } from "@/server/workspace";

/**
 * The directory of the workspace (D-51): people the actor may see (`directory.viewPerson`:
 * volunteers only their own teams), their teams and positions, and the contact fields each
 * person's visibility setting lets this actor see. Lists are in Hungarian collation order (the
 * repository sorts them).
 */

export interface TeamMembership {
  team: Team;
  isLeader: boolean;
  positions: TeamPosition[];
}

export interface DirectoryEntry {
  person: Person;
  teams: TeamMembership[];
  contact: VisibleContact;
}

export interface DirectoryData {
  entries: DirectoryEntry[];
  teams: Team[];
  /** Distinct position names across all teams (filter options), collated. */
  positionNames: string[];
  skills: string[];
}

export async function loadDirectory(env: WorkspaceEnv): Promise<DirectoryData> {
  const { repos, ctx, actor, tenantId } = env;
  const [people, teams, members] = await Promise.all([
    repos.people.list(ctx, { active: true }),
    repos.teams.list(ctx),
    repos.teams.listMembers(ctx, {}),
  ]);
  const positionLists = await Promise.all(teams.map((t) => repos.teams.listPositions(ctx, t.id)));
  const positions = new Map<string, TeamPosition>(positionLists.flat().map((p) => [p.id, p]));
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const byPerson = new Map<string, TeamMember[]>();
  for (const m of members) byPerson.set(m.personId, [...(byPerson.get(m.personId) ?? []), m]);

  const entries: DirectoryEntry[] = [];
  for (const person of people) {
    const memberships = byPerson.get(person.id) ?? [];
    const teamIds = memberships.map((m) => m.teamId);
    if (!can(actor, "directory.viewPerson", { tenantId, personId: person.id, teamIds })) continue;
    entries.push({
      person,
      teams: memberships.flatMap((m) => {
        const team = teamById.get(m.teamId);
        if (!team) return [];
        return [
          {
            team,
            isLeader: m.isLeader,
            positions: m.positionIds.flatMap((id) => positions.get(id) ?? []),
          },
        ];
      }),
      contact: visibleContact({ actor, tenantId }, person, teamIds),
    });
  }
  const collator = new Intl.Collator("hu");
  const unique = (values: Iterable<string>) => [...new Set(values)].sort(collator.compare);
  return {
    entries,
    teams,
    positionNames: unique([...positions.values()].map((p) => p.name)),
    skills: unique(entries.flatMap((e) => e.person.skills)),
  };
}
