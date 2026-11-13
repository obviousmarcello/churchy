import type { WebsiteRole, WorkspaceRole } from "./roles";

// ---------------------------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------------------------

/** Anything that belongs to one church. Actions on another tenant's resource are always denied. */
export interface TenantResource {
  readonly tenantId: string;
}

/** Anything that belongs to one diocesan organization (portal administration). */
export interface OrgResource {
  readonly orgId: string;
}

/** Target of user & role management: the website roles the target user has or is being given. */
export interface UserManagementResource extends TenantResource {
  readonly targetRoles: readonly WebsiteRole[];
}

/** Events and group pages may belong to a group (Közösség); `groupLeader` is scoped by it. */
export interface GroupContentResource extends TenantResource {
  readonly groupId?: string | null;
}

/** A person record in the workspace directory. */
export interface DirectoryPersonResource extends TenantResource {
  readonly personId: string;
  /** Teams the viewed person belongs to. */
  readonly teamIds: readonly string[];
}

/** Event visibility levels (SDD §22.1, FR-602). */
export type EventVisibility = "private" | "team" | "staff" | "public";

/** An internal calendar event being created. */
export interface CalendarEventResource extends TenantResource {
  readonly visibility: EventVisibility;
  /** Required for `team` visibility. */
  readonly teamId?: string | null;
}

/** `BookingRules.whoCanRequest` (SDD §23.2). Defaults to `"all_staff"` (volunteers excluded). */
export type WhoCanRequest = readonly WorkspaceRole[] | "all_staff" | "all_workspace";

export interface RoomResource extends TenantResource {
  readonly roomId: string;
  readonly whoCanRequest?: WhoCanRequest;
}

/** A service plan (or its attachments, rota); `teamId` is the owning team. */
export interface ServicePlanResource extends TenantResource {
  readonly teamId?: string | null;
  /** People assigned to the occurrence/plan (for "assigned" access). */
  readonly assignedPersonIds?: readonly string[];
  /** Tenant setting: music leaders may approve plans (SDD §21.2 "if configured"). */
  readonly musicLeaderMayApprove?: boolean;
}

/** Positions/assignments always belong to a team. */
export interface TeamResource extends TenantResource {
  readonly teamId: string;
}

/** An HR category (`hr_categories`). `key` is used for diocesan delegation, `id` for scopes. */
export interface HrCategoryRef {
  readonly id: string;
  readonly key: string;
  readonly confidential: boolean;
}

/** An HR category a request is being submitted to. */
export interface HrSubmitResource extends TenantResource {
  readonly category: HrCategoryRef & {
    readonly whoCanSubmit: "employees" | "volunteers" | "all";
  };
}

/** An HR ticket (`hr_tickets`). */
export interface HrTicketResource extends TenantResource {
  readonly category: HrCategoryRef;
  /** `null` for anonymous complaints (SDD §25.4). */
  readonly requesterPersonId: string | null;
  /** After *Átadás* (handover) the ticket is read-only (SDD §25.4). */
  readonly handedOver?: boolean;
}

/** HR data about one person (staff record, leave balance). */
export interface HrPersonResource extends TenantResource {
  readonly personId: string;
}

/** HR data that belongs to a category (e.g. absence type/reason). */
export interface HrCategoryResource extends TenantResource {
  readonly category: HrCategoryRef;
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

/** Content verbs shared by all website content types. */
export const CONTENT_VERBS = ["create", "edit", "publish", "delete"] as const;
export type ContentVerb = (typeof CONTENT_VERBS)[number];

/** Website content without group scope (SDD §11.3 rows "Pages, news, …" and "Announcements"). */
export const CONTENT_KINDS = [
  "page",
  "news",
  "gallery",
  "sermon",
  "document",
  "announcement",
] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/** Website content that may belong to a group (rows "Events" and "Group page"). */
export const GROUP_CONTENT_KINDS = ["event", "groupPage"] as const;
export type GroupContentKind = (typeof GROUP_CONTENT_KINDS)[number];

export type ContentAction = `${ContentKind}.${ContentVerb}`;
export type GroupContentAction = `${GroupContentKind}.${ContentVerb}`;

/** Website/admin actions that take only a `TenantResource`. */
export const WEBSITE_TENANT_ACTIONS = [
  "site.domain.manage",
  "site.legal.edit",
  "site.delete",
  "site.appearance.edit",
  "site.modules.manage",
  "site.navigation.edit",
  "site.terminology.edit",
  "schedule.edit",
  "location.manage",
  "officeHours.edit",
  "pastoralRequest.read",
  "pastoralRequest.handle",
  "auditLog.read",
] as const;
export type WebsiteTenantAction = (typeof WEBSITE_TENANT_ACTIONS)[number];

/** Workspace actions that take only a `TenantResource`. */
export const WORKSPACE_TENANT_ACTIONS = [
  "directory.open",
  "calendarEvent.publish",
  "song.edit",
] as const;
export type WorkspaceTenantAction = (typeof WORKSPACE_TENANT_ACTIONS)[number];

/** HR actions that take only a `TenantResource`. */
export const HR_TENANT_ACTIONS = [
  "hr.payroll.export",
  "hr.report.view",
  "hr.absence.viewCalendar",
] as const;
export type HrTenantAction = (typeof HR_TENANT_ACTIONS)[number];

/** Diocesan portal administration actions (organization resources). */
export const ORG_ACTIONS = [
  "org.portal.open",
  "org.members.manage",
  "org.links.manage",
  "hr.template.manage",
] as const;
export type OrgAction = (typeof ORG_ACTIONS)[number];

/** Maps every action to the resource it is checked against. */
export type ResourceByAction = Record<ContentAction, TenantResource> &
  Record<GroupContentAction, GroupContentResource> &
  Record<WebsiteTenantAction | WorkspaceTenantAction | HrTenantAction, TenantResource> &
  Record<OrgAction, OrgResource> & {
    "site.users.manage": UserManagementResource;
    "directory.viewPerson": DirectoryPersonResource;
    "calendarEvent.create": CalendarEventResource;
    "room.book": RoomResource;
    "booking.approve": RoomResource;
    "servicePlan.edit": ServicePlanResource;
    "servicePlan.approve": ServicePlanResource;
    "servicePlan.view": ServicePlanResource;
    "attachment.view": ServicePlanResource;
    "assignment.manage": TeamResource;
    "hr.ticket.create": HrSubmitResource;
    "hr.ticket.read": HrTicketResource;
    "hr.ticket.reply": HrTicketResource;
    "hr.ticket.handle": HrTicketResource;
    "hr.ticket.approveAsManager": HrTicketResource;
    "hr.staffRecord.view": HrPersonResource;
    "hr.staffRecord.edit": HrPersonResource;
    "hr.leaveBalance.view": HrPersonResource;
    "hr.leaveBalance.manage": HrPersonResource;
    "hr.absence.viewDetails": HrCategoryResource;
  };

/** Every action of the policy vocabulary. */
export type Action = keyof ResourceByAction;

/** The resource type of any action. */
export type Resource = ResourceByAction[Action];

const contentActions = <K extends string>(kinds: readonly K[]) =>
  kinds.flatMap((kind) => CONTENT_VERBS.map((verb) => `${kind}.${verb}` as const));

/** Website (SDD §11.3) actions. */
export const WEBSITE_ACTIONS = [
  "site.users.manage",
  ...WEBSITE_TENANT_ACTIONS,
  ...contentActions(CONTENT_KINDS),
  ...contentActions(GROUP_CONTENT_KINDS),
] as const satisfies readonly Action[];

/** Workspace (SDD §21.2) actions other than HR. */
export const WORKSPACE_ACTIONS = [
  ...WORKSPACE_TENANT_ACTIONS,
  "directory.viewPerson",
  "calendarEvent.create",
  "room.book",
  "booking.approve",
  "servicePlan.edit",
  "servicePlan.approve",
  "servicePlan.view",
  "attachment.view",
  "assignment.manage",
] as const satisfies readonly Action[];

/** HR actions (SDD §21.2, §25, §25.7) — every action whose name starts with `hr.`. */
export const HR_ACTIONS = [
  ...HR_TENANT_ACTIONS,
  "hr.ticket.create",
  "hr.ticket.read",
  "hr.ticket.reply",
  "hr.ticket.handle",
  "hr.ticket.approveAsManager",
  "hr.staffRecord.view",
  "hr.staffRecord.edit",
  "hr.leaveBalance.view",
  "hr.leaveBalance.manage",
  "hr.absence.viewDetails",
  "hr.template.manage",
] as const satisfies readonly Action[];

const ALL_ACTIONS = [
  ...WEBSITE_ACTIONS,
  ...WORKSPACE_ACTIONS,
  ...HR_ACTIONS,
  ...ORG_ACTIONS,
] as const;

// Compile-time check: every key of `ResourceByAction` is listed in one of the families above.
type UnlistedAction = Exclude<Action, (typeof ALL_ACTIONS)[number]>;
const _exhaustive: [UnlistedAction] extends [never] ? true : UnlistedAction = true;

/** The complete vocabulary (useful for dev tooling and exhaustive tests). */
export const ACTIONS: readonly Action[] = [...new Set<Action>(ALL_ACTIONS)];

/** HR actions are hard-excluded for platform/support access (SDD §28 "ws.hr*"). */
export function isHrAction(action: string): boolean {
  return action.startsWith("hr.");
}
