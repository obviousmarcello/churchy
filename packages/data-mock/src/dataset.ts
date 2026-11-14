/**
 * Shape of the in-memory dataset shared by the demo seed (D-91 demo data, #16)
 * and the mock adapter (D-91 mock adapter, #14).
 *
 * One array per persisted entity type from `@churchy/contracts`. The demo seed
 * produces a `MockDataset`; the mock adapter deep-clones it per demo session and
 * serves all repositories from it. Every entity carries its own `tenantId` /
 * `organizationId` where the contract defines one — scoping is the adapter's job.
 *
 * Owned by the lead: change this file only through a reviewed PR, because both
 * the seed and the adapter depend on it.
 */
import type {
  Absence,
  Announcement,
  Arrangement,
  Assignment,
  Attachment,
  AvailabilityBlock,
  BillingAccount,
  Booking,
  BookingConflict,
  BookingSeries,
  Calendar,
  Deal,
  Domain,
  Event,
  FormDefinition,
  HrApproval,
  HrCategory,
  HrTicket,
  HrTicketMessage,
  Hymnal,
  Invoice,
  LeaveEntitlement,
  Location,
  Media,
  Membership,
  Notification,
  NotificationPref,
  OrgDelegation,
  OrgLink,
  OrgMembership,
  Organization,
  Page,
  PastoralRequest,
  Person,
  Plan,
  PlanComment,
  PlanItem,
  PlanTemplate,
  Post,
  Redirect,
  Room,
  SchedulePeriod,
  ServiceException,
  ServiceOccurrence,
  ServicePlan,
  ServiceRoomBlock,
  ServiceRule,
  Song,
  SongHymnalRef,
  StaffProfile,
  Subscription,
  Team,
  TeamMember,
  TeamPosition,
  Tenant,
  User,
  WorkdayCalendarEntry,
} from "@churchy/contracts";

export interface MockDataset {
  // Platform & tenancy
  tenants: Tenant[];
  domains: Domain[];
  redirects: Redirect[];
  users: User[];
  memberships: Membership[];
  plans: Plan[];
  billingAccounts: BillingAccount[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  organizations: Organization[];
  orgMemberships: OrgMembership[];
  orgLinks: OrgLink[];
  orgDelegations: OrgDelegation[];
  deals: Deal[];
  // Website content
  locations: Location[];
  schedulePeriods: SchedulePeriod[];
  serviceRules: ServiceRule[];
  serviceExceptions: ServiceException[];
  serviceOccurrences: ServiceOccurrence[];
  announcements: Announcement[];
  posts: Post[];
  calendars: Calendar[];
  events: Event[];
  pages: Page[];
  media: Media[];
  formDefinitions: FormDefinition[];
  pastoralRequests: PastoralRequest[];
  // People & workspace
  people: Person[];
  availabilityBlocks: AvailabilityBlock[];
  teams: Team[];
  teamPositions: TeamPosition[];
  teamMembers: TeamMember[];
  rooms: Room[];
  serviceRoomBlocks: ServiceRoomBlock[];
  bookings: Booking[];
  bookingSeries: BookingSeries[];
  bookingConflicts: BookingConflict[];
  hymnals: Hymnal[];
  songs: Song[];
  songHymnalRefs: SongHymnalRef[];
  arrangements: Arrangement[];
  attachments: Attachment[];
  planTemplates: PlanTemplate[];
  servicePlans: ServicePlan[];
  planItems: PlanItem[];
  planComments: PlanComment[];
  assignments: Assignment[];
  // HR
  hrCategories: HrCategory[];
  hrTickets: HrTicket[];
  hrTicketMessages: HrTicketMessage[];
  hrApprovals: HrApproval[];
  absences: Absence[];
  staffProfiles: StaffProfile[];
  leaveEntitlements: LeaveEntitlement[];
  workdayCalendar: WorkdayCalendarEntry[];
  // Notifications
  notifications: Notification[];
  notificationPrefs: NotificationPref[];
}

export type MockCollection = keyof MockDataset;

/** An empty dataset with every collection present. */
export function emptyDataset(): MockDataset {
  return {
    tenants: [],
    domains: [],
    redirects: [],
    users: [],
    memberships: [],
    plans: [],
    billingAccounts: [],
    subscriptions: [],
    invoices: [],
    organizations: [],
    orgMemberships: [],
    orgLinks: [],
    orgDelegations: [],
    deals: [],
    locations: [],
    schedulePeriods: [],
    serviceRules: [],
    serviceExceptions: [],
    serviceOccurrences: [],
    announcements: [],
    posts: [],
    calendars: [],
    events: [],
    pages: [],
    media: [],
    formDefinitions: [],
    pastoralRequests: [],
    people: [],
    availabilityBlocks: [],
    teams: [],
    teamPositions: [],
    teamMembers: [],
    rooms: [],
    serviceRoomBlocks: [],
    bookings: [],
    bookingSeries: [],
    bookingConflicts: [],
    hymnals: [],
    songs: [],
    songHymnalRefs: [],
    arrangements: [],
    attachments: [],
    planTemplates: [],
    servicePlans: [],
    planItems: [],
    planComments: [],
    assignments: [],
    hrCategories: [],
    hrTickets: [],
    hrTicketMessages: [],
    hrApprovals: [],
    absences: [],
    staffProfiles: [],
    leaveEntitlements: [],
    workdayCalendar: [],
    notifications: [],
    notificationPrefs: [],
  };
}
