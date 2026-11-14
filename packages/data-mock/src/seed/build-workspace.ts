/** Workspace content: rooms & bookings (SDD §23), songs, plans & assignments (SDD §24). */
import type {
  Arrangement,
  Assignment,
  Attachment,
  Booking,
  BookingSeries,
  PlanItem,
  PlanTemplate,
  Room,
  ServicePlan,
  Song,
  ServiceRoomBlock,
} from "@churchy/contracts";
import { bookingsOverlap } from "@churchy/contracts";
import { liturgicalDay } from "@churchy/calendar";
import { addDays } from "@churchy/hu";
import type { Build } from "./context";
import { dateOf } from "./context";
import { HYMNAL_IDS } from "./hymnals";
import type { PlanItemSpec } from "./types";

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function buildRooms(b: Build): void {
  const { spec, c, ds, tid, k } = b;
  const christmasYear =
    Number(c.today.slice(0, 4)) + (c.today >= `${c.today.slice(0, 4)}-12-25` ? 1 : 0);
  spec.rooms.forEach((r, i) => {
    const id = `room-${k}-${r.key}`;
    b.roomId.set(r.key, id);
    const room: Room = {
      id,
      tenantId: tid,
      locationId: b.locationId.get(r.loc) as string,
      name: r.name,
      kind: r.kind,
      capacity: r.capacity,
      features: r.features,
      photoMediaIds: r.photo ? [b.imageIds[2 % b.imageIds.length] as string] : [],
      accessibility: {
        wheelchair: r.accessibility?.wheelchair ?? true,
        accessibleToilet: r.accessibility?.accessibleToilet ?? false,
        hearingLoop: r.accessibility?.hearingLoop ?? false,
        parking: r.accessibility?.parking ?? false,
        note: null,
      },
      managerPersonIds: r.managers.map((m) => b.personId.get(m) as string),
      approvalPolicy: {
        autoApprove: {
          roles: ["leader"],
          teamIds: (r.autoApproveTeams ?? []).map((t) => b.teamId.get(t) as string),
        },
        approvers: "room_managers",
        holdHours: 48,
      },
      rules: {
        ...(r.hours
          ? { bookableHours: r.hours.map(([weekday, from, to]) => ({ weekday, from, to })) }
          : {}),
        minNoticeHours: r.minNoticeHours ?? 24,
        ...(r.maxDurationMin ? { maxDurationMin: r.maxDurationMin } : {}),
        horizonDays: 180,
        ...(i === 0
          ? {
              blackout: [
                {
                  name: "Ünnepi zárás",
                  from: c.at(`${christmasYear}-12-24`, "00:00"),
                  to: c.at(`${christmasYear}-12-27`, "00:00"),
                },
              ],
            }
          : {}),
        whoCanRequest: "all_workspace",
      },
      active: true,
    };
    ds.rooms.push(room);
  });
  const roomIds = [...b.roomId.values()];
  const rm = b.personaUser.get("terem");
  const membership = ds.memberships.find((m) => m.tenantId === tid && m.userId === rm);
  if (membership) membership.roomIds = roomIds;

  spec.serviceBlocks.forEach((sb, i) => {
    const block: ServiceRoomBlock = {
      id: `sblock-${k}-${i + 1}`,
      tenantId: tid,
      locationId: b.locationId.get(sb.loc) as string,
      serviceType: sb.serviceType,
      roomIds: sb.rooms.map((r) => b.roomId.get(r) as string),
      bufferBeforeMin: sb.before,
      bufferAfterMin: sb.after,
    };
    ds.serviceRoomBlocks.push(block);
  });
}

export function buildBookings(b: Build): void {
  const { spec, c, ds, tid, k } = b;
  const user: Booking[] = [];
  let n = 0;
  spec.bookings.forEach((bk, bi) => {
    const roomId = b.roomId.get(bk.room) as string;
    const room = ds.rooms.find((r) => r.id === roomId) as Room;
    const date0 = dateOf(b, bk.when);
    const requester = b.personId.get(bk.by) ?? null;
    const approver = room.managerPersonIds[0] ?? null;
    const startMs = Date.parse(c.at(date0, bk.from));
    const endMs = Date.parse(c.at(date0, bk.to));
    const durationMin = Math.round((endMs - startMs) / 60_000);
    const seriesId = bk.rrule ? `bs-${k}-${bi + 1}` : null;
    if (seriesId && bk.rrule) {
      const series: BookingSeries = {
        id: seriesId,
        tenantId: tid,
        roomId,
        rrule: bk.rrule,
        dtstart: c.at(date0, bk.from),
        durationMin,
        title: bk.title,
        purpose: bk.purpose ?? null,
        teamId: bk.team ? (b.teamId.get(bk.team) ?? null) : null,
        requestedByPersonId: requester,
      };
      ds.bookingSeries.push(series);
    }
    const count = bk.rrule ? (bk.weeks ?? 8) : 1;
    for (let w = 0; w < count; w++) {
      const date = addDays(date0, 7 * w);
      const past = date < c.today;
      n++;
      const status = bk.status;
      const decided = status === "approved" || status === "rejected";
      const createdAt =
        status === "pending" ? c.ago(1 + (n % 2), "10:30") : c.at(addDays(date, -12), "09:00");
      const booking: Booking = {
        id: `bk-${k}-${n}`,
        tenantId: tid,
        roomId,
        startsAt: c.at(date, bk.from),
        endsAt: c.at(date, bk.to),
        bufferBeforeMin: bk.bufferBefore ?? 0,
        bufferAfterMin: bk.bufferAfter ?? 0,
        status,
        seriesId,
        eventId: null,
        serviceOccurrenceId: null,
        teamId: bk.team ? (b.teamId.get(bk.team) ?? null) : null,
        title: bk.title,
        purpose: bk.purpose ?? null,
        attendees: bk.attendees ?? null,
        setupNotes: bk.setupNotes ?? null,
        requestedByPersonId: requester,
        decidedByPersonId: decided ? approver : null,
        decidedAt: decided ? c.at(addDays(date, past ? -10 : -9), "15:00") : null,
        holdExpiresAt: status === "pending" ? c.ahead(1, "10:30") : null,
        source: "user",
        createdAt,
      };
      user.push(booking);
      ds.bookings.push(booking);
    }
  });

  // Services auto-block rooms (SDD §23.4). A clash with a user booking is recorded, never resolved
  // automatically: the user booking stays and the service block is skipped for that occurrence.
  const blocking = (x: Booking): boolean => x.status === "pending" || x.status === "approved";
  let s = 0;
  for (const block of ds.serviceRoomBlocks.filter((x) => x.tenantId === tid)) {
    for (const occ of ds.serviceOccurrences.filter(
      (o) =>
        o.tenantId === tid &&
        o.locationId === block.locationId &&
        o.serviceType === block.serviceType &&
        o.status === "scheduled" &&
        o.startsAt >= c.at(c.day(-7), "00:00") &&
        o.startsAt <= c.at(c.day(42), "23:59"),
    )) {
      const endsAt = b.occEnd.get(occ.id);
      if (!endsAt) continue;
      for (const roomId of block.roomIds) {
        const candidate = {
          startsAt: occ.startsAt,
          endsAt,
          bufferBeforeMin: block.bufferBeforeMin,
          bufferAfterMin: block.bufferAfterMin,
        };
        const clash = user.find(
          (u) => u.roomId === roomId && blocking(u) && bookingsOverlap(u, candidate),
        );
        if (clash) {
          ds.bookingConflicts.push({
            tenantId: tid,
            serviceOccurrenceId: occ.id,
            bookingId: clash.id,
            detectedAt: c.ago(1, "03:00"),
            resolvedAt: null,
          });
          continue;
        }
        s++;
        ds.bookings.push({
          id: `bk-${k}-svc-${s}`,
          tenantId: tid,
          roomId,
          startsAt: occ.startsAt,
          endsAt,
          bufferBeforeMin: block.bufferBeforeMin,
          bufferAfterMin: block.bufferAfterMin,
          status: "approved",
          seriesId: null,
          eventId: null,
          serviceOccurrenceId: occ.id,
          teamId: null,
          title: cap(occ.serviceType),
          purpose: null,
          attendees: null,
          setupNotes: null,
          requestedByPersonId: null,
          decidedByPersonId: null,
          decidedAt: null,
          holdExpiresAt: null,
          source: "service",
          createdAt: c.ago(30, "03:00"),
        });
      }
    }
  }
}

const itemDefaults = (it: PlanItemSpec, b: Build) => ({
  type: it.type,
  title: it.title,
  songId: it.song !== undefined ? (b.songId[it.song] ?? null) : null,
  arrangementId:
    it.song !== undefined && it.arr !== undefined
      ? (b.arrangementIds[it.song]?.[it.arr] ?? null)
      : null,
  keyOverride: it.keyOverride ?? null,
  verses: it.verses ?? null,
  durationS: it.durationS ?? null,
  responsiblePersonId: it.by ? (b.personId.get(it.by) ?? null) : null,
  notes: it.notes ?? null,
});

export function buildSongs(b: Build): void {
  const { spec, c, ds, tid, k } = b;
  const own = spec.ownHymnal ? `hym-${k}-own` : null;
  if (spec.ownHymnal && own) {
    ds.hymnals.push({
      id: own,
      tenantId: tid,
      abbreviation: spec.ownHymnal.abbreviation,
      name: spec.ownHymnal.name,
      denomination: spec.tenant.denomination,
    });
  }
  const hymnalId = (abbr: string): string =>
    abbr === spec.ownHymnal?.abbreviation && own ? own : (HYMNAL_IDS[abbr] as string);

  spec.songs.forEach((sg, i) => {
    const id = `song-${k}-${i + 1}`;
    b.songId.push(id);
    const stamp = c.ago(110 - (i % 40), "11:00");
    const song: Song = {
      id,
      tenantId: tid,
      title: sg.title,
      altTitles: [],
      firstLine: sg.first ?? null,
      lyrics: sg.lyrics ?? null,
      language: "hu",
      authors: sg.authors ?? [],
      composers: sg.composers ?? [],
      translators: [],
      copyrightHolder:
        sg.licence === "own"
          ? spec.tenant.name
          : sg.licence === "licensed" || sg.licence === "permission"
            ? "Példa Zenei Kiadó (kitalált)"
            : null,
      licence: sg.licence,
      licenceRef:
        sg.licence === "licensed" || sg.licence === "permission"
          ? `Demó-engedély ${c.today.slice(0, 4)}/${String(i + 1).padStart(3, "0")}`
          : null,
      themes: sg.themes,
      seasons: sg.seasons,
      defaultKey: sg.key,
      tempoBpm: sg.bpm ?? null,
      timeSignature: sg.time ?? null,
      notes: "Bemutató adat — az énekeskönyvi hivatkozás szándékosan nem hiteles.",
      hymnalRefs: sg.refs.map(([abbr, number]) => ({
        hymnalId: hymnalId(abbr),
        number,
        versesNote: null,
      })),
      createdAt: stamp,
      updatedAt: stamp,
    };
    ds.songs.push(song);
    b.arrangementIds[i] = [];
    (sg.arrangements ?? []).forEach((a, j) => {
      const aid = `arr-${k}-${i + 1}-${j + 1}`;
      b.arrangementIds[i]?.push(aid);
      const arr: Arrangement = {
        id: aid,
        tenantId: tid,
        songId: id,
        name: a.name,
        key: a.key,
        tempoBpm: sg.bpm ?? null,
        structure: a.structure,
        chordpro: a.chordpro ?? null,
        notes: null,
      };
      ds.arrangements.push(arr);
    });
  });

  // Attachments: records pointing at placeholder files (no binaries are part of the seed).
  const rightsBy = b.personaUser.get("zenei") ?? (b.personaUser.get("vezeto") as string);
  let a = 0;
  const addAtt = (
    partial: Partial<Attachment> & Pick<Attachment, "ownerType" | "ownerId" | "kind" | "label">,
  ): void => {
    a++;
    ds.attachments.push({
      id: `att-${k}-${a}`,
      tenantId: tid,
      mediaId: null,
      url: null,
      part: null,
      key: null,
      version: 1,
      supersedesId: null,
      rightsConfirmedBy: rightsBy,
      contentHash: `sha256:demo-${k}-${a}`,
      disabled: false,
      createdAt: c.ago(45 - (a % 30), "13:00"),
      ...partial,
    });
  };
  const withArr = ds.arrangements.filter((x) => x.tenantId === tid);
  withArr.slice(0, 6).forEach((arr, i) => {
    addAtt({
      ownerType: "arrangement",
      ownerId: arr.id,
      mediaId: `med-${k}-kotta-${(i % 2) + 1}`,
      kind: "sheet_music",
      label: `Kotta — ${arr.name}`,
      part: i % 2 === 0 ? "Orgona" : "Ének",
      key: arr.key,
    });
  });
  withArr.slice(6, 9).forEach((arr, i) => {
    addAtt({
      ownerType: "arrangement",
      ownerId: arr.id,
      mediaId: `med-${k}-kotta-3`,
      kind: "chord_chart",
      label: `Akkordtábla — ${arr.name}`,
      part: i % 2 === 0 ? "Gitár" : null,
      key: arr.key,
    });
  });
  ds.songs
    .filter((x) => x.tenantId === tid)
    .slice(2, 5)
    .forEach((song, i) => {
      addAtt({
        ownerType: "song",
        ownerId: song.id,
        url: `https://example.org/demo/felvetel-${i + 1}`,
        kind: "link",
        label: "Mintafelvétel (külső hivatkozás)",
      });
    });
  const first = ds.songs.find((x) => x.tenantId === tid);
  if (first) {
    addAtt({
      ownerType: "song",
      ownerId: first.id,
      mediaId: `med-${k}-kotta-2`,
      kind: "sheet_music",
      label: "Régi kottaváltozat (visszavonva)",
      disabled: true,
    });
  }
}

export function buildPlans(b: Build): void {
  const { spec, c, ds, tid, k } = b;
  const dayName = (_title: string, date: string): string => {
    const d = liturgicalDay(date, spec.family);
    return d.name ?? d.sundayName ?? d.seasonName;
  };
  // Plan templates (tenant-owned; the platform presets live in platform.ts).
  spec.templates.forEach((t, i) => {
    const tpl: PlanTemplate = {
      id: `tpl-${k}-${i + 1}`,
      tenantId: tid,
      denomination: spec.tenant.denomination,
      serviceType: t.serviceType,
      name: t.name,
      items: t.items.map((it) => itemDefaults({ ...it, song: undefined, arr: undefined }, b)),
    };
    b.templateId.push(tpl.id);
    ds.planTemplates.push(tpl);
  });

  const rotaTeams = spec.teams.filter((t) => t.rota);
  let asg = 0;
  spec.plans.forEach((pl, n) => {
    const rule = spec.rules.find((r) => r.key === pl.rule);
    if (!rule) return;
    const date = c.weekday(rule.weekday, pl.week);
    const svc = b.serviceByRuleDate.get(`${pl.rule}|${date}`);
    if (!svc) return;
    const planId = `plan-${k}-${n + 1}`;
    const leaderId = b.personId.get(pl.leader) as string;
    const approver = b.personaPerson.get("vezeto") as string;
    const items: PlanItem[] = pl.items.map((it, pos) => ({
      id: `pi-${k}-${n + 1}-${pos + 1}`,
      tenantId: tid,
      planId,
      position: pos,
      ...itemDefaults(it, b),
    }));
    const approved = pl.status === "approved" || pl.status === "locked";
    const plan: ServicePlan = {
      id: planId,
      tenantId: tid,
      occurrenceId: svc.occurrenceId,
      eventId: null,
      title: pl.title.replace("{nap}", dayName(pl.title, date)),
      status: pl.status,
      templateId:
        ds.planTemplates.find((t) => t.tenantId === tid && t.serviceType === rule.type)?.id ?? null,
      leaderPersonId: leaderId,
      approvedByPersonId: approved ? approver : null,
      approvedAt: approved ? c.at(addDays(date, -3), "16:00") : null,
      approvedSnapshot: approved ? items : null,
      lockedAt: pl.status === "locked" ? c.at(addDays(date, 0), "13:00") : null,
      notes: pl.notes ?? null,
      updatedAt: c.at(addDays(date, pl.week < 0 ? 0 : -2), "12:00"),
    };
    ds.servicePlans.push(plan);
    ds.planItems.push(...items);
    (pl.comments ?? []).forEach((cm, j) => {
      ds.planComments.push({
        id: `pc-${k}-${n + 1}-${j + 1}`,
        tenantId: tid,
        planId,
        itemId: cm.item !== undefined ? (items[cm.item]?.id ?? null) : null,
        authorPersonId: b.personId.get(cm.by) as string,
        body: cm.body,
        mentions: [],
        resolvedAt: cm.resolved ? c.at(addDays(date, -4), "18:00") : null,
        createdAt: c.at(addDays(date, -5), "09:30"),
      });
    });

    // Assignments for the rota teams (generic positions, one or more people each).
    const past = date < c.today;
    for (const team of rotaTeams) {
      const teamId = b.teamId.get(team.key) as string;
      for (const pos of team.positions) {
        const positionId = b.positionId.get(`${team.key}|${pos.name}`) as string;
        const candidates = ds.teamMembers.filter(
          (m) => m.teamId === teamId && m.positionIds.includes(positionId),
        );
        if (candidates.length === 0) continue;
        const count = Math.max(1, Math.min(pos.min, candidates.length));
        for (let j = 0; j < count; j++) {
          const m = candidates[(n + j) % candidates.length];
          if (!m) continue;
          asg++;
          const slot = (asg + n) % 7;
          const status: Assignment["status"] = past
            ? "accepted"
            : slot === 0
              ? "requested"
              : slot === 4
                ? "declined"
                : slot === 5
                  ? "swap_requested"
                  : "accepted";
          const teamLeader = ds.teamMembers.find((x) => x.teamId === teamId && x.isLeader);
          const swapWith = candidates[(n + j + 1) % candidates.length];
          ds.assignments.push({
            id: `asg-${k}-${asg}`,
            tenantId: tid,
            occurrenceId: svc.occurrenceId,
            eventId: null,
            planId,
            teamId,
            positionId,
            personId: m.personId,
            startsAt: svc.startsAt,
            endsAt: svc.endsAt,
            status,
            requestedByPersonId: teamLeader?.personId ?? leaderId,
            respondedAt:
              status === "requested" ? null : c.at(addDays(date, past ? -6 : -1), "19:00"),
            declineReason: status === "declined" ? "Családi okból sajnos nem tudok jönni." : null,
            swapWithPersonId:
              status === "swap_requested" && swapWith && swapWith.personId !== m.personId
                ? swapWith.personId
                : null,
            createdAt: c.at(addDays(date, -14), "10:00"),
          });
        }
      }
    }
  });
}
