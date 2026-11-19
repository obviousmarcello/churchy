import type { Person, Team, TeamPosition } from "@churchy/contracts";

/** What the directory filter reads of an entry (the full entry is built by `server/workspace-people.ts`). */
export interface FilterableEntry {
  person: Pick<Person, "familyName" | "givenName" | "roleTitle" | "skills">;
  teams: readonly { team: Pick<Team, "id">; positions: readonly Pick<TeamPosition, "name">[] }[];
}

export interface DirectoryFilter {
  q: string;
  teamId: string;
  position: string;
  skill: string;
}

/** Accent- and case-insensitive form of a text, for searching. */
export const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Search (accent-insensitive on name and role title) and filter by team / position / skill. */
export function filterDirectory<E extends FilterableEntry>(
  entries: readonly E[],
  f: DirectoryFilter,
): E[] {
  const needle = fold(f.q.trim());
  return entries.filter(({ person, teams }) => {
    if (needle !== "") {
      const hay = fold([person.familyName, person.givenName, person.roleTitle ?? ""].join(" "));
      if (!hay.includes(needle)) return false;
    }
    if (f.teamId !== "" && !teams.some((t) => t.team.id === f.teamId)) return false;
    if (f.position !== "" && !teams.some((t) => t.positions.some((p) => p.name === f.position))) {
      return false;
    }
    if (f.skill !== "" && !person.skills.includes(f.skill)) return false;
    return true;
  });
}
