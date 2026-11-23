/**
 * Postgres enums, generated from the Zod contracts (`@churchy/contracts`) so the database and the
 * data contract can never drift apart: a value added to a contract enum shows up as a schema diff
 * in `drizzle-kit generate` and needs a migration.
 */
import {
  AbsenceStatusSchema,
  AssignmentStatusSchema,
  AttachmentKindSchema,
  AttachmentOwnerTypeSchema,
  BillingAccountSchema,
  BookingSchema,
  BookingStatusSchema,
  CalendarSchema,
  ContactVisibilitySchema,
  DenominationSchema,
  DomainSchema,
  EmploymentTypeSchema,
  EventStatusSchema,
  EventVisibilitySchema,
  HrApprovalSchema,
  HrCategorySchema,
  HrTicketStatusSchema,
  InvoiceSchema,
  LocationKindSchema,
  MediaKindSchema,
  MediaSchema,
  NotificationChannelSchema,
  NotificationKindSchema,
  OrgLinkSchema,
  OrgRoleSchema,
  OrganizationSchema,
  PlanItemTypeSchema,
  PlanKeySchema,
  PlanSchema,
  PlanStatusSchema,
  PublishStatusSchema,
  RequestStatusSchema,
  RoomSchema,
  ServiceExceptionKindSchema,
  ServiceOccurrenceSchema,
  StaffGroupSchema,
  StaffProfileSchema,
  SubscriptionSchema,
  TeamKindSchema,
  TenantRoleSchema,
  TenantStatusSchema,
  WorkdayCalendarEntrySchema,
  WorkspaceRoleSchema,
  WsTierSchema,
} from "@churchy/contracts";
import { pgEnum } from "drizzle-orm/pg-core";

type Values = readonly [string, ...string[]];
const values = (options: readonly string[]) => options as unknown as Values;

// Platform & tenancy
export const denomination = pgEnum("denomination", values(DenominationSchema.options));
export const tenantStatus = pgEnum("tenant_status", values(TenantStatusSchema.options));
export const wsTier = pgEnum("ws_tier", values(WsTierSchema.options));
export const tlsStatus = pgEnum("tls_status", values(DomainSchema.shape.tlsStatus.options));
export const tenantRole = pgEnum("tenant_role", values(TenantRoleSchema.options));
export const workspaceRole = pgEnum("workspace_role", values(WorkspaceRoleSchema.options));
export const orgRole = pgEnum("org_role", values(OrgRoleSchema.options));
export const planKey = pgEnum("plan_key", values(PlanKeySchema.options));
export const planKind = pgEnum("plan_kind", values(PlanSchema.shape.kind.options));
export const billingOwnerType = pgEnum(
  "billing_owner_type",
  values(BillingAccountSchema.shape.ownerType.options),
);
export const paymentMethod = pgEnum(
  "payment_method",
  values(BillingAccountSchema.shape.paymentMethod.options),
);
export const subscriptionPeriod = pgEnum(
  "subscription_period",
  values(SubscriptionSchema.shape.period.options),
);
export const subscriptionStatus = pgEnum(
  "subscription_status",
  values(SubscriptionSchema.shape.status.options),
);
export const invoiceStatus = pgEnum("invoice_status", values(InvoiceSchema.shape.status.options));
export const organizationKind = pgEnum(
  "organization_kind",
  values(OrganizationSchema.shape.kind.options),
);
export const orgLinkStatus = pgEnum("org_link_status", values(OrgLinkSchema.shape.status.options));

// Website
export const publishStatus = pgEnum("publish_status", values(PublishStatusSchema.options));
export const locationKind = pgEnum("location_kind", values(LocationKindSchema.options));
export const serviceExceptionKind = pgEnum(
  "service_exception_kind",
  values(ServiceExceptionKindSchema.options),
);
export const occurrenceStatus = pgEnum(
  "occurrence_status",
  values(ServiceOccurrenceSchema.shape.status.options),
);
export const eventVisibility = pgEnum("event_visibility", values(EventVisibilitySchema.options));
export const eventStatus = pgEnum("event_status", values(EventStatusSchema.options));
export const calendarKind = pgEnum("calendar_kind", values(CalendarSchema.shape.kind.options));
export const mediaKind = pgEnum("media_kind", values(MediaKindSchema.options));
export const mediaVisibility = pgEnum(
  "media_visibility",
  values(MediaSchema.shape.visibility.options),
);
export const requestStatus = pgEnum("request_status", values(RequestStatusSchema.options));

// People & workspace
export const staffGroup = pgEnum("staff_group", values(StaffGroupSchema.options));
export const contactVisibility = pgEnum(
  "contact_visibility",
  values(ContactVisibilitySchema.options),
);
export const teamKind = pgEnum("team_kind", values(TeamKindSchema.options));
export const roomKind = pgEnum("room_kind", values(RoomSchema.shape.kind.options));
export const bookingStatus = pgEnum("booking_status", values(BookingStatusSchema.options));
export const bookingSource = pgEnum("booking_source", values(BookingSchema.shape.source.options));
export const attachmentOwnerType = pgEnum(
  "attachment_owner_type",
  values(AttachmentOwnerTypeSchema.options),
);
export const attachmentKind = pgEnum("attachment_kind", values(AttachmentKindSchema.options));
export const planStatus = pgEnum("plan_status", values(PlanStatusSchema.options));
export const planItemType = pgEnum("plan_item_type", values(PlanItemTypeSchema.options));
export const assignmentStatus = pgEnum("assignment_status", values(AssignmentStatusSchema.options));

// HR
export const hrWhoCanSubmit = pgEnum(
  "hr_who_can_submit",
  values(HrCategorySchema.shape.whoCanSubmit.options),
);
export const hrTicketStatus = pgEnum("hr_ticket_status", values(HrTicketStatusSchema.options));
export const hrDecision = pgEnum("hr_decision", values(HrApprovalSchema.shape.decision.options));
export const absenceStatus = pgEnum("absence_status", values(AbsenceStatusSchema.options));
export const employmentType = pgEnum("employment_type", values(EmploymentTypeSchema.options));
export const employer = pgEnum("employer", values(StaffProfileSchema.shape.employer.options));
export const workdayKind = pgEnum(
  "workday_kind",
  values(WorkdayCalendarEntrySchema.shape.kind.options),
);

// Notifications
export const notificationKind = pgEnum("notification_kind", values(NotificationKindSchema.options));
export const notificationChannel = pgEnum(
  "notification_channel",
  values(NotificationChannelSchema.options),
);
