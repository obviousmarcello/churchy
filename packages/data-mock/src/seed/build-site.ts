/** Website content of one church: tenant, locations, schedule, announcements, news, events, pages, forms. */
import type {
  Calendar,
  Event,
  FormDefinition,
  Location,
  Media,
  Page,
  PageBlock,
  PastoralRequest,
  Post,
  ServiceException,
  ServiceOccurrence,
  ServiceRule,
  SiteConfigOverrides,
  WorkspaceModuleKey,
} from "@churchy/contracts";
import { easter, feastsInRange } from "@churchy/calendar";
import { addDays, slugify } from "@churchy/hu";
import { isPeriodActive, resolve, type ScheduleInput } from "@churchy/schedule";
import type { Build } from "./context";
import { PLACEHOLDER_IMAGE, PLACEHOLDER_PDF, dateOf, relData } from "./context";
import { localPlusMinutes } from "./clock";
import { doc, p, paragraphs, ul } from "./rich";
import type { PageBlockSpec } from "./types";

const WS_MODULES: Record<string, WorkspaceModuleKey[]> = {
  none: [],
  s50: ["ws.calendar", "ws.rooms", "ws.worship", "ws.rota", "ws.hr", "ws.hr.leave"],
  m150: [
    "ws.calendar",
    "ws.rooms",
    "ws.worship",
    "ws.rota",
    "ws.hr",
    "ws.hr.leave",
    "ws.hr.confidential",
    "ws.docs",
  ],
  l300: [
    "ws.calendar",
    "ws.rooms",
    "ws.worship",
    "ws.rota",
    "ws.hr",
    "ws.hr.leave",
    "ws.hr.confidential",
    "ws.docs",
    "ws.board",
  ],
};

export function buildTenant(b: Build): void {
  const { spec, c, ds, tid } = b;
  const t = spec.tenant;
  const stamp = c.ago(118, "09:00");
  // The office's Christmas break that is in progress or comes next (Dec 24 – Jan 1), so the
  // contact page always has a current or upcoming exception to show (D-12).
  const christmasYear =
    Number(c.today.slice(0, 4)) + (c.today > `${c.today.slice(0, 4)}-01-01` ? 1 : 0);
  const workspaceModules: Partial<Record<WorkspaceModuleKey, boolean>> = {};
  for (const m of WS_MODULES[t.wsTier] ?? []) workspaceModules[m] = true;

  const siteConfig: SiteConfigOverrides = {
    identity: {
      name: t.name,
      shortName: t.shortName,
      tagline: t.tagline,
      heroMediaIds: [b.imageIds[0] as string],
    },
    denomination: t.denomination,
    theme: {
      themeId: t.themeId,
      colors: t.colors,
      fontPairing: t.fontPairing,
      heroStyle: t.heroStyle,
      radius: "small",
    },
    modules: t.modules,
    workspaceModules,
    navigation: t.navigation,
    home: t.home,
    footer: {
      showMap: true,
      links: t.footerLinks.map((l) => ({ label: l.label, href: l.href, external: false })),
      ...(t.dioceseLink ? { dioceseLink: t.dioceseLink } : {}),
    },
    contact: {
      email: t.contact.email,
      phone: t.contact.phone,
      address: t.contact.address,
      officeHours: {
        weekly: t.contact.officeHours,
        exceptions: [
          {
            from: `${christmasYear - 1}-12-24`,
            to: `${christmasYear}-01-01`,
            closed: true,
            note: t.contact.officeNote,
          },
        ],
      },
    },
    legal: {
      controllerName: t.legal.controllerName,
      controllerAddress: t.contact.address,
      representative: t.legal.representative,
      taxNumber: t.legal.taxNumber,
      registrationNumber: t.legal.registrationNumber,
    },
    giving: {
      accountName: t.giving.accountName,
      accountNumber: t.giving.accountNumber,
      reference: t.giving.reference,
      szja1TechnicalNumber: t.giving.szja1,
      showQr: true,
    },
    integrations: {
      ...(t.integrations?.youtube ? { youtubeChannelUrl: t.integrations.youtube } : {}),
      ...(t.integrations?.facebook ? { facebookUrl: t.integrations.facebook } : {}),
    },
  };

  ds.tenants.push({
    id: tid,
    slug: t.slug,
    name: t.name,
    denomination: t.denomination,
    status: "active",
    siteConfig,
    planKey: t.planKey,
    wsTier: t.wsTier,
    organizationId: t.organizationId,
    launchedAt: c.ago(t.launchedDaysAgo, "10:00"),
    createdAt: stamp,
    updatedAt: c.ago(3, "16:20"),
  });

  if (t.domain) {
    ds.domains.push({
      id: `dom-${b.k}-1`,
      tenantId: tid,
      hostname: t.domain.hostname,
      isPrimary: true,
      verifiedAt: t.domain.verified ? c.ago(100, "11:00") : null,
      tlsStatus: t.domain.verified ? "issued" : "pending",
      createdAt: c.ago(101, "11:00"),
    });
  }

  // Old term slugs redirect (FR-102): e.g. /miserend ⇄ /istentiszteleti-rend after a rename.
  ds.redirects.push({ tenantId: tid, fromPath: "/programok", toPath: "/esemenyek", code: 301 });
}

export function buildMedia(b: Build): void {
  const { spec, c, ds, tid, k } = b;
  const uploader = b.personaUser.get("szerkeszto") ?? null;
  spec.imageAlts.forEach((alt, i) => {
    const id = `med-${k}-kep-${i + 1}`;
    b.imageIds.push(id);
    const m: Media = {
      id,
      tenantId: tid,
      kind: "image",
      filename: `demo-kep-${i + 1}.svg`,
      mimeType: "image/svg+xml",
      storageKey: PLACEHOLDER_IMAGE,
      variants: [],
      width: 1600,
      height: 900,
      bytes: 3623,
      alt,
      decorative: false,
      caption: null,
      peopleConsent: true,
      visibility: "public",
      uploadedBy: uploader,
      createdAt: c.ago(100 - i, "12:00"),
    };
    ds.media.push(m);
  });
  const pdf = (id: string, filename: string, visibility: "public" | "private"): Media => ({
    id,
    tenantId: tid,
    kind: "pdf",
    filename,
    mimeType: "application/pdf",
    storageKey: PLACEHOLDER_PDF,
    variants: [],
    width: null,
    height: null,
    bytes: 48_200,
    alt: null,
    decorative: false,
    caption: "Bemutató helyőrző dokumentum — nem valódi tartalom.",
    peopleConsent: false,
    visibility,
    uploadedBy: uploader,
    createdAt: c.ago(60, "12:00"),
  });
  ds.media.push(pdf(`med-${k}-pdf-1`, "szertartasrend-minta.pdf", "public"));
  ds.media.push(pdf(`med-${k}-hirdetes-pdf`, "heti-hirdetesek-minta.pdf", "public"));
  ds.media.push(pdf(`med-${k}-kotta-1`, "kotta-minta-1.pdf", "private"));
  ds.media.push(pdf(`med-${k}-kotta-2`, "kotta-minta-2.pdf", "private"));
  ds.media.push(pdf(`med-${k}-kotta-3`, "akkordtabla-minta.pdf", "private"));
}

export function buildLocations(b: Build): void {
  const { spec, c, ds, tid, k } = b;
  spec.locations.forEach((l, i) => {
    const id = `loc-${k}-${l.key}`;
    b.locationId.set(l.key, id);
    const loc: Location = {
      id,
      tenantId: tid,
      name: l.name,
      slug: l.slug,
      kind: l.kind,
      address: l.address,
      geo: l.geo,
      openingHours: {
        weekly: l.hours.map(([weekday, from, to]) => ({ weekday, from, to })),
        exceptions: [],
      },
      accessibility: l.accessibility,
      photoMediaId: b.imageIds[(i + 1) % b.imageIds.length] ?? null,
      sort: l.sort,
      createdAt: c.ago(118, "09:00"),
      updatedAt: c.ago(40, "09:00"),
    };
    ds.locations.push(loc);
  });
}

/** Periods, rules, exceptions and materialized occurrences. */
export function buildSchedule(b: Build): void {
  const { spec, c, ds, tid, k } = b;
  ds.schedulePeriods.push(
    {
      id: `per-${k}-rendes`,
      tenantId: tid,
      name: spec.periodNames.normal,
      validFrom: null,
      validTo: null,
      yearly: false,
      priority: 0,
    },
    {
      id: `per-${k}-nyari`,
      tenantId: tid,
      name: spec.periodNames.summer,
      validFrom: spec.summerFrom,
      validTo: spec.summerTo,
      yearly: true,
      priority: 10,
    },
  );

  for (const r of spec.rules) {
    const id = `rule-${k}-${r.key}`;
    b.ruleId.set(r.key, id);
    const rule: ServiceRule = {
      id,
      tenantId: tid,
      periodId: r.period === "normal" ? `per-${k}-rendes` : `per-${k}-nyari`,
      locationId: b.locationId.get(r.loc) as string,
      weekday: r.weekday,
      nthWeek: r.nthWeek ?? null,
      time: r.time,
      durationMin: r.durationMin,
      serviceType: r.type,
      language: r.language ?? "hu",
      title: r.title ?? null,
      note: r.note ?? null,
      livestream: r.livestream ?? false,
    };
    ds.serviceRules.push(rule);
  }

  // Feasts (non-Sunday solemnities/feasts) within the next ~200 days.
  const feasts = feastsInRange(c.day(1), c.day(200), spec.family).filter(
    (d) => (d.rank === "solemnity" || d.rank === "feast") && d.weekday !== 7,
  );
  spec.exceptions.forEach((e, i) => {
    const id = `exc-${k}-${i + 1}`;
    let date: string;
    let feastName = "";
    if ("feast" in e.date) {
      const f = feasts[e.date.feast] ?? feasts[feasts.length - 1];
      date = f?.date ?? c.day(30);
      feastName = f?.name ?? "";
    } else {
      date = c.weekday(e.date.weekday, e.date.week);
    }
    // In the summer period an exception follows the summer rule that replaces its rule.
    let ruleKey = e.rule;
    if (
      ruleKey &&
      isPeriodActive(
        {
          id: "s",
          name: "s",
          validFrom: spec.summerFrom,
          validTo: spec.summerTo,
          yearly: true,
          priority: 10,
        },
        date,
      )
    ) {
      ruleKey = spec.rules.find((r) => r.replaces === e.rule)?.key ?? ruleKey;
    }
    const ruleId = ruleKey ? (b.ruleId.get(ruleKey) ?? null) : null;
    const exc: ServiceException = {
      id,
      tenantId: tid,
      locationId: e.loc ? (b.locationId.get(e.loc) ?? null) : null,
      date,
      kind: e.kind,
      ruleId,
      time: e.time ?? null,
      serviceType: e.type ?? null,
      note: e.note ?? null,
      reason: typeof e.reason === "function" ? e.reason(feastName) : e.reason,
    };
    ds.serviceExceptions.push(exc);
  });

  // Lazily materialized occurrences for rules flagged `materialize` (SDD §24.1).
  const materialized = new Set(
    spec.rules
      .filter((r) => r.materialize || r.replaces !== undefined)
      .map((r) => b.ruleId.get(r.key)),
  );
  const replacesOf = new Map(
    spec.rules.filter((r) => r.replaces).map((r) => [r.key, r.replaces as string]),
  );
  const keyByRuleId = new Map(spec.rules.map((r) => [b.ruleId.get(r.key) as string, r.key]));
  const services = resolve(
    {
      locations: ds.locations.filter((l) => l.tenantId === tid),
      periods: ds.schedulePeriods.filter((x) => x.tenantId === tid),
      rules: ds.serviceRules.filter((x) => x.tenantId === tid) as ScheduleInput["rules"],
      exceptions: ds.serviceExceptions.filter((x) => x.tenantId === tid),
    },
    c.day(-28),
    c.day(56),
    { includeCancelled: true },
  );
  const seen = new Set<string>();
  for (const s of services) {
    const wanted = (s.ruleId !== null && materialized.has(s.ruleId)) || s.status === "added";
    if (!wanted) continue;
    const locKey = [...b.locationId.entries()].find(([, v]) => v === s.locationId)?.[0] ?? "x";
    const id = `occ-${k}-${s.date.replaceAll("-", "")}-${s.time.replace(":", "")}-${locKey}-${slugify(s.serviceType)}`;
    const unique = `${s.locationId}|${s.startsAt}|${s.serviceType}`;
    if (seen.has(unique)) continue;
    seen.add(unique);
    const occ: ServiceOccurrence = {
      id,
      tenantId: tid,
      locationId: s.locationId,
      startsAt: s.startsAt,
      serviceType: s.serviceType,
      ruleId: s.ruleId,
      exceptionId: s.exceptionId,
      status: s.status === "cancelled" ? "cancelled" : "scheduled",
      movedToId: null,
    };
    ds.serviceOccurrences.push(occ);
    b.occEnd.set(id, s.endsAt);
    const rk = s.ruleId ? keyByRuleId.get(s.ruleId) : undefined;
    if (rk) {
      const entry = {
        occurrenceId: id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        status: occ.status,
      };
      b.serviceByRuleDate.set(`${rk}|${s.date}`, entry);
      const alias = replacesOf.get(rk);
      if (alias && !b.serviceByRuleDate.has(`${alias}|${s.date}`))
        b.serviceByRuleDate.set(`${alias}|${s.date}`, entry);
    }
  }
}

export function buildAnnouncements(b: Build): void {
  const { spec, c, ds, tid, k } = b;
  const oldest = c.sundayPlus(
    Math.min(...spec.announcements.filter((w) => !w.feast).map((w) => w.week)),
  );
  for (const w of spec.announcements) {
    const weekSunday = w.feast === "easter" ? easterBefore(oldest) : c.sundayPlus(w.week);
    const content = [p(w.intro), ul(w.items)];
    if (w.closing) content.push(p(w.closing));
    const published = w.state === "published";
    const publishedAt =
      w.state === "draft"
        ? null
        : published
          ? c.at(addDays(weekSunday, -7), "18:00")
          : c.at(addDays(weekSunday, -4), "09:00");
    ds.announcements.push({
      id: `ann-${k}-${weekSunday}`,
      tenantId: tid,
      weekSunday,
      body: doc(...content),
      pdfMediaId: w.pdf ? `med-${k}-hirdetes-pdf` : null,
      status: w.state === "draft" ? "draft" : "published",
      publishedAt,
      createdAt: c.at(addDays(weekSunday, -8), "19:00"),
      updatedAt: c.at(addDays(weekSunday, -5), "10:30"),
    });
  }
}

/** The latest Easter Sunday strictly before `date`. */
function easterBefore(date: string): string {
  const year = Number(date.slice(0, 4));
  const thisYear = easter(year);
  return thisYear < date ? thisYear : easter(year - 1);
}

export function buildNews(b: Build): void {
  const { spec, c, ds, tid, k } = b;
  spec.news.forEach((n, i) => {
    const status = n.draft ? "draft" : "published";
    const publishedAt = n.draft
      ? null
      : n.inDays !== undefined
        ? c.ahead(n.inDays, "08:00")
        : c.ago(n.daysAgo, "08:30");
    const post: Post = {
      id: `post-${k}-${i + 1}`,
      tenantId: tid,
      slug: n.slug,
      title: n.title,
      lead: n.lead,
      body: paragraphs(n.paragraphs),
      coverMediaId:
        n.cover === false ? null : (b.imageIds[(i % (b.imageIds.length - 1)) + 1] ?? null),
      categories: n.categories,
      expiresAt: n.expiresInDays !== undefined ? c.ahead(n.expiresInDays, "23:59") : null,
      status,
      publishedAt,
      createdAt: c.ago(n.daysAgo + 1, "17:00"),
      updatedAt: c.ago(n.daysAgo, "08:00"),
    };
    ds.posts.push(post);
  });
}

export function buildCalendarsAndEvents(b: Build): void {
  const { spec, c, ds, tid, k } = b;
  const teamOfKind = (kind: string): string | null =>
    spec.teams.find((t) => t.kind === kind)
      ? (b.teamId.get(spec.teams.find((t) => t.kind === kind)!.key) ?? null)
      : null;
  const cals: [
    keyof typeof spec.calendarNames,
    Calendar["kind"],
    string,
    Calendar["defaultVisibility"],
    string | null,
  ][] = [
    ["kozos", "shared", "#7a2e3b", "public", null],
    ["iroda", "shared", "#3d5a80", "staff", null],
    ["zene", "team", "#6b8e23", "team", teamOfKind("music")],
    ["ifjusag", "team", "#d98324", "team", teamOfKind("youth")],
    ["tavol", "absence", "#8a8a8a", "staff", null],
  ];
  const adminRoles: Calendar["editors"]["roles"] = ["owner", "admin", "editor", "office", "leader"];
  for (const [key, kind, color, vis, teamId] of cals) {
    const id = `cal-${k}-${key}`;
    b.calendarId.set(key, id);
    ds.calendars.push({
      id,
      tenantId: tid,
      name: spec.calendarNames[key],
      color,
      kind,
      ownerPersonId: null,
      teamId,
      defaultVisibility: vis,
      editors: {
        roles: key === "tavol" ? ["hrHandler", "leader"] : adminRoles,
        teamIds: teamId ? [teamId] : [],
      },
    });
    if (teamId) {
      const team = ds.teams.find((t) => t.id === teamId);
      if (team) team.calendarId = id;
    }
  }

  const creator = b.personaUser.get("szerkeszto") ?? b.personaUser.get("iroda") ?? null;
  spec.events.forEach((e, i) => {
    const id = `ev-${k}-${i + 1}`;
    const date = dateOf(b, e.when);
    const startsAt = e.allDay ? c.at(date, "00:00") : c.at(date, e.time);
    const endsAt = e.allDay
      ? c.at(addDays(date, 1), "00:00")
      : localPlusMinutes(date, e.time, e.durationMin);
    const stamp = c.ago(30 + i, "10:00");
    const event: Event = {
      id,
      tenantId: tid,
      calendarId: b.calendarId.get(e.calendar) as string,
      visibility: e.visibility,
      slug: e.slug,
      title: e.title,
      body: e.description ? paragraphs([e.description]) : null,
      startsAt,
      endsAt,
      allDay: e.allDay ?? false,
      rrule: e.rrule ?? null,
      exdates: (e.exdatesIn ?? []).map((n) => c.day(n)),
      parentEventId: null,
      recurrenceId: null,
      locationId: e.loc ? (b.locationId.get(e.loc) ?? null) : null,
      groupId: null,
      teamId: e.team ? (b.teamId.get(e.team) ?? null) : null,
      category: e.category,
      coverMediaId: e.cover ? (b.imageIds[(i % (b.imageIds.length - 1)) + 1] ?? null) : null,
      status: e.status ?? "published",
      createdBy: creator,
      externalRef: null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    ds.events.push(event);
    if (e.override && e.rrule) {
      // Move a single occurrence: child event + exdate on the master (SDD §10).
      const base = date;
      const occDate = addDays(base, 7 * e.override.weeks);
      const occStart = c.at(occDate, e.time);
      event.exdates = [...event.exdates, occDate];
      ds.events.push({
        ...event,
        id: `${id}-m`,
        slug: `${e.slug}-${occDate}`,
        title: e.override.title ?? e.title,
        startsAt: c.at(occDate, e.override.time),
        endsAt: localPlusMinutes(occDate, e.override.time, e.durationMin),
        rrule: null,
        exdates: [],
        parentEventId: id,
        recurrenceId: occStart,
      });
    }
  });
}

function block(b: Build, pb: PageBlockSpec): PageBlock {
  switch (pb.type) {
    case "heading":
      return { type: "heading", text: pb.text, level: pb.level ?? 2 };
    case "text":
      return {
        type: "text",
        content: doc(...pb.paragraphs.map(p), ...(pb.bullets ? [ul(pb.bullets)] : [])),
      };
    case "image":
      return { type: "image", mediaId: b.imageIds[0] as string, caption: pb.caption ?? null };
    case "quote":
      return { type: "quote", text: pb.text, source: pb.source ?? null };
    case "cta":
      return { type: "cta", label: pb.label, href: pb.href };
    case "file":
      return { type: "file", mediaId: `med-${b.k}-pdf-1`, label: pb.label };
  }
}

export function buildPages(b: Build): void {
  const { spec, c, ds, tid, k } = b;
  for (const pg of spec.pages) {
    const page: Page = {
      id: `page-${k}-${pg.slug}`,
      tenantId: tid,
      slug: pg.slug,
      title: pg.title,
      blocks: pg.blocks.map((x) => block(b, x)),
      parentId: pg.parent ? `page-${k}-${pg.parent}` : null,
      riteKey: pg.rite ?? null,
      seo: {
        title: pg.title.slice(0, 70),
        description: pg.description.slice(0, 170),
        ogImageMediaId: null,
      },
      sort: pg.sort,
      status: "published",
      publishedAt: c.ago(90, "10:00"),
      createdAt: c.ago(95, "10:00"),
      updatedAt: c.ago(20, "10:00"),
    };
    ds.pages.push(page);
  }
}

export function buildForms(b: Build): void {
  const { spec, c, ds, tid, k } = b;
  const year = c.today.slice(0, 4);
  const officeEmail = spec.tenant.contact.email;
  for (const f of spec.forms) {
    const id = `form-${k}-${f.key}`;
    b.formId.set(f.key, id);
    const def: FormDefinition = {
      id,
      tenantId: tid,
      key: f.key,
      title: f.title,
      fields: f.fields,
      notifyEmails: [officeEmail],
      confirmationText: f.confirmation,
      retentionDays: f.retentionDays,
      referencePrefix: f.prefix,
      active: true,
      createdAt: c.ago(100, "10:00"),
      updatedAt: c.ago(50, "10:00"),
    };
    ds.formDefinitions.push(def);
  }
  const counters = new Map<string, number>();
  spec.requests.forEach((r, i) => {
    const form = spec.forms.find((x) => x.key === r.form);
    if (!form) return;
    const n = (counters.get(form.prefix) ?? 0) + 1;
    counters.set(form.prefix, n);
    const createdAt = c.ago(r.daysAgo, "11:20");
    const closed = r.status === "lezart";
    const closedAt = closed ? c.ago(Math.max(0, r.daysAgo - 3), "15:00") : null;
    const req: PastoralRequest = {
      id: `req-${k}-${i + 1}`,
      tenantId: tid,
      formId: b.formId.get(r.form) as string,
      formKey: r.form,
      reference: `${form.prefix}-${year}-${String(n).padStart(4, "0")}`,
      data: relData(b, r.data),
      status: r.status,
      assigneeUserId: r.assignee ? (b.userId.get(r.assignee) ?? null) : null,
      notes: (r.notes ?? []).map((note, j) => ({
        id: `req-${k}-${i + 1}-n${j + 1}`,
        authorUserId: b.personaUser.get("iroda") ?? null,
        body: note.body,
        createdAt: c.ago(note.daysAgo, "14:00"),
      })),
      consentAt: createdAt,
      consentTextHash: "demohash-adatkezeles-v1",
      createdAt,
      closedAt,
      purgeAfter: closedAt ? c.at(addDays(c.dateOf(closedAt), form.retentionDays), "03:00") : null,
    };
    ds.pastoralRequests.push(req);
  });
}
