import type { NavContext, PermissionNavItem } from "./permissions/nav";
import { termRoutePath, type TermSlugs } from "./term-routes";

/** Translator scoped to `common.nav` (labels come from messages/hu.json). */
export type NavTranslator = (key: NavKey) => string;

export type NavKey =
  | "public.serviceSchedule"
  | "public.events"
  | "contact"
  | "workspace"
  | "admin"
  | "organization"
  | "sections.directory"
  | "sections.calendar"
  | "sections.rooms"
  | "sections.songs"
  | "sections.absences"
  | "sections.hr"
  | "sections.news"
  | "sections.announcements"
  | "sections.schedule"
  | "sections.requests"
  | "sections.appearance"
  | "sections.users"
  | "sections.domain"
  | "sections.orgOverview"
  | "sections.orgLinks"
  | "sections.orgTemplates"
  | "sections.orgMembers";

/**
 * Public main navigation (SDD §6): always visible, labels and term-driven paths from the tenant's
 * terminology. Items carry their module (stub until D-25 supplies module settings).
 */
export function buildPublicNav(t: NavTranslator, terms: TermSlugs): readonly PermissionNavItem[] {
  return [
    {
      id: "publicSchedule",
      label: t("public.serviceSchedule"),
      href: termRoutePath(terms, "serviceSchedule"),
      module: "schedule",
    },
    { id: "events", label: t("public.events"), href: "/esemenyek", module: "events" },
    // *Kapcsolat* is part of the core module (SDD §6).
    { id: "contact", label: t("contact"), href: "/kapcsolat" },
  ];
}

/** The three app areas; their landing pages list the sections the actor may use. */
export type AppArea = "workspace" | "admin" | "organization";

/**
 * App-shell navigation. Every section declares the action it needs and `filterNav()` decides
 * visibility with `can()` (never role checks); an area is shown when at least one of its sections
 * is. The header shows the areas, each area's landing page its sections. Section pages arrive
 * with their modules; until then the landing pages list them as upcoming.
 *
 * Public items (always visible) arrive with the public site modules; until then anonymous visitors
 * see no navigation.
 */
export function buildAppNav(t: NavTranslator): readonly PermissionNavItem[] {
  return [
    {
      id: "workspace",
      label: t("workspace"),
      href: "/munkater",
      children: [
        {
          id: "directory",
          label: t("sections.directory"),
          href: "/munkater/nevjegyzek",
          requires: { action: "directory.open" },
        },
        {
          id: "calendar",
          label: t("sections.calendar"),
          href: "/munkater/naptar",
          // Every workspace role has a personal calendar (policy README).
          requires: {
            action: "calendarEvent.create",
            resource: (ctx) => ({ tenantId: tenantIdOf(ctx), visibility: "private" }),
          },
        },
        {
          id: "rooms",
          label: t("sections.rooms"),
          href: "/munkater/teremfoglalas",
          // A room with the default booking policy (all staff, SDD §23.2).
          requires: {
            action: "room.book",
            resource: (ctx) => ({
              tenantId: tenantIdOf(ctx),
              roomId: "",
              whoCanRequest: "all_staff",
            }),
          },
        },
        {
          id: "songs",
          label: t("sections.songs"),
          href: "/munkater/enektar",
          requires: { action: "song.edit" },
        },
        {
          id: "absences",
          label: t("sections.absences"),
          href: "/munkater/tavollet",
          requires: { action: "hr.absence.viewCalendar" },
        },
        {
          id: "hr",
          label: t("sections.hr"),
          href: "/munkater/hr",
          requires: { action: "hr.report.view" },
        },
      ],
    },
    {
      id: "admin",
      label: t("admin"),
      href: "/admin",
      children: [
        {
          id: "news",
          label: t("sections.news"),
          href: "/admin/hirek",
          requires: { action: "news.create" },
        },
        {
          id: "announcements",
          label: t("sections.announcements"),
          href: "/admin/hirdetesek",
          requires: { action: "announcement.create" },
        },
        {
          id: "schedule",
          label: t("sections.schedule"),
          href: "/admin/rend",
          requires: { action: "schedule.edit" },
        },
        {
          id: "requests",
          label: t("sections.requests"),
          href: "/admin/kerelmek",
          requires: { action: "pastoralRequest.read" },
        },
        {
          id: "appearance",
          label: t("sections.appearance"),
          href: "/admin/megjelenes",
          requires: { action: "site.appearance.edit" },
        },
        {
          id: "users",
          label: t("sections.users"),
          href: "/admin/felhasznalok",
          // Managing editors (admins may not manage owners, SDD §11.3).
          requires: {
            action: "site.users.manage",
            resource: (ctx) => ({ tenantId: tenantIdOf(ctx), targetRoles: ["editor"] }),
          },
        },
        {
          id: "domain",
          label: t("sections.domain"),
          href: "/admin/domain",
          requires: { action: "site.domain.manage" },
        },
      ],
    },
    {
      id: "organization",
      label: t("organization"),
      href: "/egyhazmegye",
      requires: { action: "org.portal.open", resource: (ctx) => ({ orgId: orgIdOf(ctx) }) },
      children: [
        {
          id: "orgOverview",
          label: t("sections.orgOverview"),
          href: "/egyhazmegye/ugyek",
          requires: { action: "org.portal.open", resource: (ctx) => ({ orgId: orgIdOf(ctx) }) },
        },
        {
          id: "orgLinks",
          label: t("sections.orgLinks"),
          href: "/egyhazmegye/plebaniak",
          requires: { action: "org.links.manage", resource: (ctx) => ({ orgId: orgIdOf(ctx) }) },
        },
        {
          id: "orgTemplates",
          label: t("sections.orgTemplates"),
          href: "/egyhazmegye/sablonok",
          requires: { action: "hr.template.manage", resource: (ctx) => ({ orgId: orgIdOf(ctx) }) },
        },
        {
          id: "orgMembers",
          label: t("sections.orgMembers"),
          href: "/egyhazmegye/munkatarsak",
          requires: { action: "org.members.manage", resource: (ctx) => ({ orgId: orgIdOf(ctx) }) },
        },
      ],
    },
  ];
}

function tenantIdOf(ctx: NavContext): string {
  return "tenantId" in ctx && typeof ctx.tenantId === "string" ? ctx.tenantId : "";
}

function orgIdOf(ctx: object): string {
  return "orgId" in ctx && typeof ctx.orgId === "string" ? ctx.orgId : "";
}
