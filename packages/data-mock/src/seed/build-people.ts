/** People, users, memberships, teams and availability (SDD §21). */
import type {
  Membership,
  Person,
  Team,
  TeamMember,
  TeamPosition,
  TenantRole,
  User,
  WorkspaceRole,
} from "@churchy/contracts";
import { formatPersonName, slugify } from "@churchy/hu";
import type { Build } from "./context";
import { phoneGen } from "./context";
import { pooledName } from "./names";
import type { Persona } from "./types";

const vkey = (i: number): string => `v${String(i).padStart(2, "0")}`;

function uniqueEmail(b: Build, family: string, given: string): string {
  const base = `${slugify(family)}.${slugify(given)}`;
  let email = `${base}@pelda.hu`;
  let n = 2;
  while (b.emails.has(email)) email = `${base}${n++}@pelda.hu`;
  b.emails.add(email);
  return email;
}

const PERSONA_ROLE: Record<Persona, TenantRole | null> = {
  tulajdonos: "owner",
  szerkeszto: "editor",
  iroda: "office",
  vezeto: "admin",
  onkentes: null,
  zenei: null,
  terem: null,
  hr: null,
  bizalmas: null,
};

const PERSONA_WS: Record<Persona, WorkspaceRole[]> = {
  tulajdonos: ["employee"],
  szerkeszto: ["employee"],
  iroda: ["employee"],
  vezeto: ["leader", "employee"],
  onkentes: ["volunteer"],
  zenei: ["musicLeader", "employee"],
  terem: ["roomManager", "employee"],
  hr: ["hrHandler", "employee"],
  bizalmas: ["confidentialHandler", "employee"],
};

export function buildPeople(b: Build): void {
  const { spec, c, ds, tid, k } = b;
  const nextPhone = phoneGen(spec.phoneBase);
  const taken = new Set<string>(spec.people.map((p) => `${p.family} ${p.given}`));
  const stamp = c.ago(120, "10:00");
  let sort = 0;

  const addPerson = (
    key: string,
    p: {
      family: string;
      given: string;
      prefix?: string;
      suffix?: string;
      title?: string | null;
      group: Person["staffGroup"];
      isPublic?: boolean;
      bio?: string | null;
      skills?: string[];
      withLogin: boolean;
      email?: boolean;
      phone?: boolean;
      minor?: boolean;
      cv?: Person["contactVisibility"];
    },
  ): Person => {
    const id = `p-${k}-${key}`;
    b.personId.set(key, id);
    const email = p.minor || p.email === false ? null : uniqueEmail(b, p.family, p.given);
    const person: Person = {
      id,
      tenantId: tid,
      userId: p.withLogin && email ? `u-${k}-${key}` : null,
      prefix: p.prefix ?? null,
      familyName: p.family,
      givenName: p.given,
      suffix: p.suffix ?? null,
      roleTitle: p.title ?? null,
      staffGroup: p.group,
      isPublic: p.isPublic ?? false,
      bio: p.bio ?? null,
      email,
      phone: p.minor || p.phone === false ? null : nextPhone(),
      contactVisibility:
        p.cv ??
        (p.isPublic
          ? { email: "public", phone: "workspace" }
          : { email: "workspace", phone: "workspace" }),
      skills: p.skills ?? [],
      photoMediaId: null,
      isMinor: p.minor ?? false,
      guardianEmail: p.minor ? `szulo.${slugify(p.family)}@pelda.hu` : null,
      active: true,
      sort: sort++,
      createdAt: stamp,
      updatedAt: stamp,
    };
    ds.people.push(person);
    return person;
  };

  const addUser = (
    key: string,
    person: Person,
    persona: Persona | null,
    loginDaysAgo: number,
  ): void => {
    if (!person.userId || !person.email) return;
    const name = formatPersonName({
      prefix: person.prefix ?? undefined,
      familyName: person.familyName,
      givenName: person.givenName,
      suffix: person.suffix ?? undefined,
    });
    const user: User = {
      id: person.userId,
      email: person.email,
      name,
      twoFactorEnabled:
        persona === "tulajdonos" ||
        persona === "vezeto" ||
        persona === "hr" ||
        persona === "bizalmas",
      lastLoginAt: c.ago(loginDaysAgo, "08:15"),
    };
    ds.users.push(user);
    b.userId.set(key, user.id);
    if (persona) {
      b.personaUser.set(persona, user.id);
      b.personaPerson.set(persona, person.id);
    }
  };

  // Named people (staff, clergy, council).
  const personaOf = new Map<string, Persona>();
  for (const s of spec.people) {
    const person = addPerson(s.key, {
      family: s.family,
      given: s.given,
      prefix: s.prefix,
      suffix: s.suffix,
      title: s.title,
      group: s.group,
      isPublic: s.isPublic,
      bio: s.bio,
      skills: s.skills,
      withLogin: true,
      cv: s.contactVisibility,
    });
    if (s.persona) personaOf.set(s.key, s.persona);
    addUser(s.key, person, s.persona ?? null, 1 + (sort % 7));
  }

  // Generated volunteers.
  const volunteerPersonaIdx = (() => {
    for (let i = 1; i <= spec.volunteerCount; i++) {
      if (!spec.volunteersNoLogin.includes(i) && !spec.volunteersMinor.includes(i) && i % 2 === 1)
        return i;
    }
    return 1;
  })();
  for (let i = 1; i <= spec.volunteerCount; i++) {
    const { family, given } = pooledName(i, spec.nameOffset, taken);
    const noLogin = spec.volunteersNoLogin.includes(i);
    const minor = spec.volunteersMinor.includes(i);
    const key = vkey(i);
    const person = addPerson(key, {
      family,
      given,
      group: "volunteer",
      withLogin: !noLogin && !minor,
      email: !noLogin,
      phone: !minor,
      minor,
      cv: { email: "team", phone: "team" },
    });
    if (i === volunteerPersonaIdx) personaOf.set(key, "onkentes");
    addUser(key, person, personaOf.get(key) ?? null, 2 + (i % 12));
  }

  // Teams, positions and members.
  const teamMembers = new Map<string, TeamMember>();
  const memberOf = (teamKey: string, personKey: string): TeamMember => {
    const mk = `${teamKey}|${personKey}`;
    let m = teamMembers.get(mk);
    if (!m) {
      m = {
        tenantId: tid,
        teamId: b.teamId.get(teamKey) as string,
        personId: b.personId.get(personKey) as string,
        isLeader: false,
        positionIds: [],
        maxAssignmentsPerMonth: null,
        notes: null,
      };
      teamMembers.set(mk, m);
    }
    return m;
  };

  for (const t of spec.teams) {
    const teamId = `team-${k}-${t.key}`;
    b.teamId.set(t.key, teamId);
    const team: Team = {
      id: teamId,
      tenantId: tid,
      name: t.name,
      kind: t.kind,
      description: t.description,
      calendarId: null,
    };
    ds.teams.push(team);
    t.positions.forEach((pos, n) => {
      const id = `pos-${k}-${t.key}-${n + 1}`;
      b.positionId.set(`${t.key}|${pos.name}`, id);
      const tp: TeamPosition = {
        id,
        tenantId: tid,
        teamId,
        name: pos.name,
        sort: n,
        minCount: pos.min,
        maxCount: pos.max,
      };
      ds.teamPositions.push(tp);
    });
  }

  for (const t of spec.teams) {
    // Volunteers of the team: cycle through the positions.
    const [from, to] = t.volunteers;
    let n = 0;
    for (let i = from; i <= to && i <= spec.volunteerCount; i++) {
      const m = memberOf(t.key, vkey(i));
      const pos = t.positions[n % t.positions.length];
      if (pos) {
        m.positionIds.push(b.positionId.get(`${t.key}|${pos.name}`) as string);
        const person = ds.people.find((x) => x.id === m.personId);
        if (person && !person.skills.includes(pos.name)) person.skills.push(pos.name);
      }
      n++;
    }
  }
  for (const s of spec.people) {
    for (const tm of s.teams ?? []) {
      const m = memberOf(tm.team, s.key);
      for (const name of tm.positions ?? []) {
        const id = b.positionId.get(`${tm.team}|${name}`);
        if (id) m.positionIds.push(id);
      }
      if (tm.leader) m.isLeader = true;
      m.maxAssignmentsPerMonth = s.group === "volunteer" ? 4 : null;
    }
  }
  for (const t of spec.teams) {
    const leader = memberOf(t.key, t.leader);
    leader.isLeader = true;
  }
  for (const m of teamMembers.values()) {
    // Volunteers serve at most four times a month — a realistic scheduling constraint.
    const person = ds.people.find((x) => x.id === m.personId);
    if (person?.staffGroup === "volunteer") m.maxAssignmentsPerMonth = 4;
    ds.teamMembers.push(m);
  }

  // Memberships.
  const teamIdsOf = (personId: string): string[] =>
    ds.teamMembers.filter((m) => m.personId === personId).map((m) => m.teamId);
  const leaderTeamIds = (personId: string): string[] =>
    ds.teamMembers.filter((m) => m.personId === personId && m.isLeader).map((m) => m.teamId);
  for (const person of ds.people) {
    if (!person.userId) continue;
    const key = [...b.personId.entries()].find(([, v]) => v === person.id)?.[0] as string;
    const persona = personaOf.get(key) ?? null;
    const ws: WorkspaceRole[] = persona
      ? [...PERSONA_WS[persona]]
      : person.staffGroup === "volunteer"
        ? ["volunteer"]
        : ["employee"];
    if (leaderTeamIds(person.id).length > 0 && !ws.includes("teamLeader")) ws.push("teamLeader");
    const membership: Membership = {
      tenantId: tid,
      userId: person.userId,
      role: persona ? PERSONA_ROLE[persona] : null,
      groupIds: [],
      wsRoles: ws,
      teamIds: teamIdsOf(person.id),
      roomIds: [],
      hrCategoryIds: [],
      active: true,
      invitedAt: c.ago(110, "09:00"),
      createdAt: c.ago(108, "09:00"),
    };
    ds.memberships.push(membership);
  }

  // Availability (self-declared "Nem érek rá").
  const wednesday = c.weekday(3) >= c.today ? c.weekday(3) : c.weekday(3, 1);
  const wedIn = Math.round(
    (Date.parse(`${wednesday}T12:00:00Z`) - Date.parse(`${c.today}T12:00:00Z`)) / 86_400_000,
  );
  const avail: [string, number, number, string | null, string][] = [
    [vkey(3), 4, 11, null, "Családi program"],
    [vkey(5), -3, 2, null, "Szabadság"],
    [vkey(8), 14, 28, null, "Külföldi út"],
    [vkey(11), wedIn, wedIn, "FREQ=WEEKLY;BYDAY=WE", "Szerdánként dolgozom"],
    [vkey(14), 21, 23, null, "Konferencia"],
    [vkey(20), 7, 7, null, "Családi ünnep"],
  ];
  avail.forEach(([pk, from, to, rrule, note], n) => {
    const pid = b.personId.get(pk);
    if (!pid) return;
    ds.availabilityBlocks.push({
      id: `avail-${k}-${n + 1}`,
      tenantId: tid,
      personId: pid,
      from: c.at(c.day(from), "00:00"),
      to: c.at(c.day(to + 1), "00:00"),
      rrule: rrule === null ? null : rrule,
      note,
    });
  });
}

export { vkey };
