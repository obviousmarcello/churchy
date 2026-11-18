/**
 * Zod validation of the demo fixtures (D-02: "the seeded data passes the Zod schemas"). The same
 * contract schemas the mock adapter returns are applied to every row the seed writes.
 */
import {
  AbsenceSchema,
  AnnouncementSchema,
  ArrangementSchema,
  AssignmentSchema,
  AttachmentSchema,
  AvailabilityBlockSchema,
  BillingAccountSchema,
  BookingConflictSchema,
  BookingSchema,
  BookingSeriesSchema,
  CalendarSchema,
  DealSchema,
  DomainSchema,
  EventSchema,
  FormDefinitionSchema,
  HrApprovalSchema,
  HrCategorySchema,
  HrTicketMessageSchema,
  HrTicketSchema,
  HymnalSchema,
  InvoiceSchema,
  LeaveEntitlementSchema,
  LocationSchema,
  MediaSchema,
  MembershipSchema,
  NotificationPrefSchema,
  NotificationSchema,
  OrgDelegationSchema,
  OrgLinkSchema,
  OrgMembershipSchema,
  OrganizationSchema,
  PageSchema,
  PastoralRequestSchema,
  PersonSchema,
  PlanCommentSchema,
  PlanItemSchema,
  PlanSchema,
  PlanTemplateSchema,
  PostSchema,
  RedirectSchema,
  RoomSchema,
  SchedulePeriodSchema,
  ServiceExceptionSchema,
  ServiceOccurrenceSchema,
  ServicePlanSchema,
  ServiceRoomBlockSchema,
  ServiceRuleSchema,
  SongHymnalRefSchema,
  SongSchema,
  StaffProfileSchema,
  SubscriptionSchema,
  TeamMemberSchema,
  TeamPositionSchema,
  TeamSchema,
  TenantSchema,
  UserSchema,
  WorkdayCalendarEntrySchema,
} from "@churchy/contracts";
import type { MockDataset } from "@churchy/data-mock";

/** Structural subset of a Zod schema (keeps `zod` out of this package's dependencies). */
type Parser = {
  safeParse(
    value: unknown,
  ):
    | { success: true }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
};

/** One contract schema per dataset collection (compile error if a collection is added). */
export const COLLECTION_SCHEMAS: { [K in keyof MockDataset]: Parser } = {
  tenants: TenantSchema,
  domains: DomainSchema,
  redirects: RedirectSchema,
  users: UserSchema,
  memberships: MembershipSchema,
  plans: PlanSchema,
  billingAccounts: BillingAccountSchema,
  subscriptions: SubscriptionSchema,
  invoices: InvoiceSchema,
  organizations: OrganizationSchema,
  orgMemberships: OrgMembershipSchema,
  orgLinks: OrgLinkSchema,
  orgDelegations: OrgDelegationSchema,
  deals: DealSchema,
  locations: LocationSchema,
  schedulePeriods: SchedulePeriodSchema,
  serviceRules: ServiceRuleSchema,
  serviceExceptions: ServiceExceptionSchema,
  serviceOccurrences: ServiceOccurrenceSchema,
  announcements: AnnouncementSchema,
  posts: PostSchema,
  calendars: CalendarSchema,
  events: EventSchema,
  pages: PageSchema,
  media: MediaSchema,
  formDefinitions: FormDefinitionSchema,
  pastoralRequests: PastoralRequestSchema,
  people: PersonSchema,
  availabilityBlocks: AvailabilityBlockSchema,
  teams: TeamSchema,
  teamPositions: TeamPositionSchema,
  teamMembers: TeamMemberSchema,
  rooms: RoomSchema,
  serviceRoomBlocks: ServiceRoomBlockSchema,
  bookings: BookingSchema,
  bookingSeries: BookingSeriesSchema,
  bookingConflicts: BookingConflictSchema,
  hymnals: HymnalSchema,
  songs: SongSchema,
  songHymnalRefs: SongHymnalRefSchema,
  arrangements: ArrangementSchema,
  attachments: AttachmentSchema,
  planTemplates: PlanTemplateSchema,
  servicePlans: ServicePlanSchema,
  planItems: PlanItemSchema,
  planComments: PlanCommentSchema,
  assignments: AssignmentSchema,
  hrCategories: HrCategorySchema,
  hrTickets: HrTicketSchema,
  hrTicketMessages: HrTicketMessageSchema,
  hrApprovals: HrApprovalSchema,
  absences: AbsenceSchema,
  staffProfiles: StaffProfileSchema,
  leaveEntitlements: LeaveEntitlementSchema,
  workdayCalendar: WorkdayCalendarEntrySchema,
  notifications: NotificationSchema,
  notificationPrefs: NotificationPrefSchema,
};

export type ValidationIssue = { collection: string; index: number; message: string };

/** Validates every row of every collection; returns all issues (empty = valid). */
export function validateDataset(ds: MockDataset): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const key of Object.keys(COLLECTION_SCHEMAS) as (keyof MockDataset)[]) {
    const schema = COLLECTION_SCHEMAS[key];
    (ds[key] as unknown[]).forEach((row, index) => {
      const result = schema.safeParse(row);
      if (!result.success) {
        const first = result.error.issues[0];
        issues.push({
          collection: key,
          index,
          message: `${first?.path.map(String).join(".") ?? ""}: ${first?.message ?? "invalid"}`,
        });
      }
    });
  }
  return issues;
}
