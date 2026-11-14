/**
 * Declarative description of one demo church. The three church specs (`specs/*.ts`) hold only
 * Hungarian content; `church.ts` turns a spec into contract entities. All dates are relative
 * to `now` (see `clock.ts`).
 */
import type {
  Address,
  Denomination,
  FormField,
  GeoPoint,
  HomeSection,
  LocationKind,
  ModuleKey,
  NavItem,
  PlanKey,
  StaffGroup,
  StaffProfile,
  WeeklyHours,
  WsTier,
} from "@churchy/contracts";
import type { LiturgicalFamily } from "@churchy/calendar";

/** The ten demo personas of D-92 (Látogató has no user). */
export type Persona =
  | "tulajdonos"
  | "szerkeszto"
  | "iroda"
  | "vezeto"
  | "onkentes"
  | "zenei"
  | "terem"
  | "hr"
  | "bizalmas";

/** Date relative to today: `in` days, or a weekday (1–7) of the current week shifted by `week`. */
export type When = { in: number } | { weekday: number; week?: number };

export interface LocationSpec {
  key: string;
  name: string;
  slug: string;
  kind: LocationKind;
  address: Address;
  geo: GeoPoint;
  hours: [weekday: number, from: string, to: string][];
  accessibility: {
    wheelchair: boolean;
    accessibleToilet: boolean;
    hearingLoop: boolean;
    parking: boolean;
    note: string | null;
  };
  sort: number;
}

export interface RuleSpec {
  key: string;
  period: "normal" | "summer";
  loc: string;
  weekday: number;
  time: string;
  durationMin: number;
  type: string;
  language?: string;
  title?: string;
  note?: string;
  nthWeek?: 1 | 2 | 3 | 4 | 5 | -1;
  livestream?: boolean;
  /** Occurrences of this rule are materialized (plans, assignments, room blocks). */
  materialize?: boolean;
  /** Summer rule that stands in for this (normal-period) rule key: plans and exceptions follow it. */
  replaces?: string;
}

export interface ExceptionSpec {
  /** `feast`: the n-th notable (solemnity/feast) day within the next ~200 days. */
  date: { feast: number } | { weekday: number; week: number };
  kind: "cancel" | "modify" | "add";
  rule?: string;
  loc?: string;
  time?: string;
  type?: string;
  note?: string;
  reason: string | ((feastName: string) => string);
}

export interface NewsSpec {
  slug: string;
  title: string;
  lead: string;
  paragraphs: string[];
  categories: string[];
  daysAgo: number;
  cover?: boolean;
  /** Not yet published (draft) — for the admin list. */
  draft?: boolean;
  /** Scheduled: published in `n` days. */
  inDays?: number;
  expiresInDays?: number;
}

export interface EventSpec {
  slug: string;
  title: string;
  calendar: "kozos" | "iroda" | "zene" | "ifjusag" | "tavol";
  visibility: "public" | "staff" | "team" | "private";
  when: When;
  time: string;
  durationMin: number;
  allDay?: boolean;
  loc?: string;
  category: string;
  description?: string;
  rrule?: string;
  /** Excluded occurrences, as `In`-style day offsets from today. */
  exdatesIn?: number[];
  team?: string;
  cover?: boolean;
  status?: "draft" | "published" | "cancelled";
  /** Moves one occurrence of a recurring event (child event + exdate on the master). */
  override?: { weeks: number; time: string; title?: string };
}

export interface AnnouncementWeek {
  /** Weeks after the coming Sunday (-2 … +1). */
  week: number;
  intro: string;
  items: string[];
  closing?: string;
  state: "published" | "draft" | "scheduled";
  pdf?: boolean;
}

export interface PositionSpec {
  name: string;
  min: number;
  max: number | null;
}

export interface TeamSpec {
  key: string;
  name: string;
  kind: "music" | "liturgy" | "tech" | "facility" | "youth" | "other";
  description: string;
  leader: string;
  positions: PositionSpec[];
  /** Volunteers (1-based index into the volunteer list) that belong to the team. */
  volunteers: [from: number, to: number];
  /** Included in the service rota (assignments are generated for service plans). */
  rota?: boolean;
  /** Team gets its own calendar. */
  calendar?: boolean;
}

export interface StaffEmployment {
  position: string;
  type: StaffProfile["employmentType"];
  employer?: "parish" | "org";
  startYearsAgo: number;
  manager?: string;
  hours: number;
  days: number[];
  leaveDays?: number;
  carriedOver?: number;
}

export interface PersonSpec {
  key: string;
  family: string;
  given: string;
  prefix?: string;
  suffix?: string;
  title?: string;
  group: StaffGroup;
  isPublic?: boolean;
  bio?: string;
  skills?: string[];
  persona?: Persona;
  employment?: StaffEmployment;
  teams?: { team: string; positions?: string[]; leader?: boolean }[];
  contactVisibility?: {
    email: "public" | "workspace" | "team" | "private";
    phone: "public" | "workspace" | "team" | "private";
  };
}

export interface SongSpec {
  title: string;
  first?: string;
  themes: string[];
  seasons: string[];
  key: string;
  bpm?: number;
  time?: string;
  refs: [hymnal: string, number: string][];
  licence: "public_domain" | "licensed" | "permission" | "own" | "unknown";
  authors?: string[];
  composers?: string[];
  lyrics?: string;
  /** Adds an arrangement (name, key, structure) — chord charts only for own works. */
  arrangements?: { name: string; key: string; structure: string; chordpro?: string }[];
}

export interface PlanItemSpec {
  type: "song" | "liturgy" | "reading" | "prayer" | "sermon" | "announcement" | "other";
  title: string;
  /** Index into the song list (type `song`). */
  song?: number;
  arr?: number;
  keyOverride?: string;
  verses?: string;
  durationS?: number;
  by?: string;
  notes?: string;
}

export interface PlanSpec {
  title: string;
  rule: string;
  /** Weeks relative to the current week. */
  week: number;
  status: "draft" | "in_review" | "approved" | "locked";
  leader: string;
  notes?: string;
  items: PlanItemSpec[];
  comments?: { by: string; body: string; item?: number; resolved?: boolean }[];
}

export interface RoomSpec {
  key: string;
  loc: string;
  name: string;
  kind: "room" | "resource";
  capacity: number | null;
  features: string[];
  managers: string[];
  autoApproveTeams?: string[];
  minNoticeHours?: number;
  maxDurationMin?: number;
  hours?: [number, string, string][];
  photo?: boolean;
  accessibility?: {
    wheelchair: boolean;
    accessibleToilet: boolean;
    hearingLoop: boolean;
    parking: boolean;
  };
}

export interface BookingSpec {
  room: string;
  title: string;
  when: When;
  from: string;
  to: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  by: string;
  team?: string;
  attendees?: number;
  purpose?: string;
  setupNotes?: string;
  bufferBefore?: number;
  bufferAfter?: number;
  /** Recurring series: RRULE and number of materialized weekly bookings (starting at `when`). */
  rrule?: string;
  weeks?: number;
  /** Overlaps a service block: stored as a booking conflict (SDD §23.4), nothing is cancelled. */
  conflictsWithService?: boolean;
}

export interface ServiceBlockSpec {
  loc: string;
  serviceType: string;
  rooms: string[];
  before: number;
  after: number;
}

export interface HrCategorySpec {
  key: string;
  name: string;
  fields: FormField[];
  whoCanSubmit: "employees" | "volunteers" | "all";
  handlers: string[];
  chain: ("manager" | "leader" | "hrHandler")[];
  slaHours: number | null;
  confidential?: boolean;
  allowAnonymous?: boolean;
  absenceType?: string;
  retentionDays?: number;
}

export interface HrTicketSpec {
  category: string;
  requester: string | null;
  subject: string;
  data: Record<string, string | boolean | string[] | null>;
  status: "uj" | "folyamatban" | "jovahagyasra_var" | "jovahagyva" | "elutasitva" | "lezart";
  daysAgo: number;
  assignee?: string;
  step?: number;
  messages?: { by: string | null; body: string; internal?: boolean; daysAgo: number }[];
  approvals?: {
    step: number;
    by: string;
    decision: "approved" | "rejected" | "delegated";
    comment?: string;
    daysAgo: number;
  }[];
  handover?: { recipient: string; daysAgo: number; summary: string };
  /** Creates/links an absence with these dates (relative to today). */
  absence?: {
    start: When;
    days: number;
    type: string;
    status: "requested" | "approved" | "rejected" | "cancelled";
  };
  anonymous?: boolean;
}

export interface AbsenceSpec {
  person: string;
  start: When;
  days: number;
  type: string;
  status: "requested" | "approved" | "rejected" | "cancelled";
  halfDayEnd?: boolean;
}

export interface FormSpec {
  key: string;
  title: string;
  prefix: string;
  fields: FormField[];
  confirmation: string;
  retentionDays: number;
}

export interface RequestSpec {
  form: string;
  status: "uj" | "folyamatban" | "lezart";
  daysAgo: number;
  data: Record<string, string | boolean | string[] | null>;
  notes?: { body: string; daysAgo: number }[];
  assignee?: string;
}

export interface PageSpec {
  slug: string;
  title: string;
  parent?: string;
  rite?: string;
  sort: number;
  description: string;
  blocks: PageBlockSpec[];
}

export type PageBlockSpec =
  | { type: "heading"; text: string; level?: 2 | 3 }
  | { type: "text"; paragraphs: string[]; bullets?: string[] }
  | { type: "image"; caption?: string }
  | { type: "quote"; text: string; source?: string }
  | { type: "cta"; label: string; href: string }
  | { type: "file"; label: string };

export interface ChurchSpec {
  key: string;
  family: LiturgicalFamily;
  tenant: {
    id: string;
    slug: string;
    name: string;
    shortName: string;
    tagline: string;
    denomination: Denomination;
    planKey: PlanKey;
    wsTier: WsTier;
    organizationId: string | null;
    dealId: string | null;
    launchedDaysAgo: number;
    themeId: "klasszikus" | "letisztult" | "kozossegi";
    colors: { primary: string; secondary: string; accent: string };
    fontPairing: "serif-classic" | "humanist" | "modern-sans";
    heroStyle: "image-full" | "image-split" | "text-only";
    modules: Partial<Record<ModuleKey, boolean>>;
    navigation: NavItem[];
    home: HomeSection[];
    contact: {
      email: string;
      phone: string;
      address: Address;
      officeHours: WeeklyHours;
      officeNote: string;
    };
    legal: {
      controllerName: string;
      representative: string;
      taxNumber: string;
      registrationNumber: string;
    };
    giving: { accountName: string; accountNumber: string; reference: string; szja1: string };
    domain: { hostname: string; verified: boolean } | null;
    footerLinks: { label: string; href: string }[];
    dioceseLink?: { label: string; url: string };
    integrations?: { youtube?: string; facebook?: string };
    billing: {
      name: string;
      taxNumber: string;
      address: Address;
      payment: "card" | "transfer";
      period: "monthly" | "yearly";
      status: "active" | "trialing" | "past_due";
    };
  };
  /** Base for generated mobile numbers: `+36 30 000 <base+n>`. */
  phoneBase: number;
  /** Offset into the shared name pools so churches get different names. */
  nameOffset: number;
  locations: LocationSpec[];
  /** Alt texts of the placeholder image records (all point at `demo/templom.svg`). */
  imageAlts: string[];
  periodNames: { normal: string; summer: string };
  summerFrom: string;
  summerTo: string;
  rules: RuleSpec[];
  exceptions: ExceptionSpec[];
  news: NewsSpec[];
  events: EventSpec[];
  announcements: AnnouncementWeek[];
  /** Named staff/clergy/council and key volunteers. */
  people: PersonSpec[];
  volunteerCount: number;
  /** 1-based volunteer indexes without a login (elderly, phone only). */
  volunteersNoLogin: number[];
  /** 1-based volunteer indexes that are minors (guardian email, no login). */
  volunteersMinor: number[];
  /** Volunteers (1-based) that get a login as the `onkentes` persona (first one is the persona). */
  teams: TeamSpec[];
  rooms: RoomSpec[];
  bookings: BookingSpec[];
  serviceBlocks: ServiceBlockSpec[];
  songs: SongSpec[];
  /** Hymnal abbreviations (platform catalog) this church uses; `own` is a tenant songbook. */
  ownHymnal?: { abbreviation: string; name: string };
  templates: { name: string; serviceType: string; items: PlanItemSpec[] }[];
  plans: PlanSpec[];
  hrCategories: HrCategorySpec[];
  hrTickets: HrTicketSpec[];
  absences: AbsenceSpec[];
  forms: FormSpec[];
  requests: RequestSpec[];
  pages: PageSpec[];
  /** Calendar names. */
  calendarNames: { kozos: string; iroda: string; zene: string; ifjusag: string; tavol: string };
}
