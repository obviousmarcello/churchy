import type { NavContext, PermissionNavItem } from "./permissions/nav";
import { termRoutePath, type TermSlugs } from "./term-routes";

/** Translator scoped to `common.nav` (labels come from messages/hu.json). */
export type NavTranslator = (key: NavKey) => string;

export type NavKey =
  | "public.serviceSchedule"
  | "public.announcements"
  | "public.events"
  | "public.news"
  | "public.rites"
  | "public.about"
  | "public.staff"
  | "contact"
  | "workspace"
  | "admin"
  | "organization"
  | "sections.today"
  | "sections.directory"
  | "sections.teams"
  | "sections.worship"
  | "sections.calendar"
  | "sections.rooms"
  | "sections.songs"
  | "sections.musicEvents"
  | "sections.absences"
  | "sections.hr"
  | "sections.news"
  | "sections.events"
  | "sections.pages"
  | "sections.staff"
  | "sections.locations"
  | "sections.adminRooms"
  | "sections.announcements"
  | "sections.schedule"
  | "sections.requests"
  | "sections.appearance"
  | "sections.users"
  | "sections.domain"
  | "sections.setup"
  | "sections.orgLink"
  | "sections.modules"
  | "sections.plan"
  | "sections.billing"
  | "sections.orgOverview"
  | "sections.orgRequests"
  | "sections.orgAbsences"
  | "sections.orgReports"
  | "sections.orgLinks"
  | "sections.orgTemplates"
  | "sections.orgMembers";

/** A static page listed in the *Rólunk* menu (D-16). */
export interface NavPage {
  readonly slug: string;
  readonly title: string;
}

/**
 * Public main navigation (SDD §6): always visible, labels and term-driven paths from the tenant's
 * terminology. Items carry their module (stub until D-25 supplies module settings). `aboutPages`
 * (the church's top-level static pages) and the staff page are grouped under *Rólunk ▾*.
 */
export function buildPublicNav(
  t: NavTranslator,
  terms: TermSlugs,
  aboutPages: readonly NavPage[] = [],
): readonly PermissionNavItem[] {
  const staff: PermissionNavItem = {
    id: "publicStaff",
    label: t("public.staff"),
    href: termRoutePath(terms, "staffSection"),
    module: "staff",
  };
  const about: PermissionNavItem[] = aboutPages.map((p) => ({
    id: `page-${p.slug}`,
    label: p.title,
    href: `/${p.slug}`,
  }));
  return [
    {
      id: "publicSchedule",
      label: t("public.serviceSchedule"),
      href: termRoutePath(terms, "serviceSchedule"),
      module: "schedule",
    },
    {
      id: "publicAnnouncements",
      label: t("public.announcements"),
      href: termRoutePath(terms, "announcementsSection"),
      module: "announcements",
    },
    { id: "events", label: t("public.events"), href: "/esemenyek", module: "events" },
    { id: "news", label: t("public.news"), href: "/hirek", module: "news" },
    {
      id: "publicRites",
      label: t("public.rites"),
      href: termRoutePath(terms, "ritesSection"),
      module: "rites",
    },
    // *Rólunk ▾* (D-16): the church's static pages and the staff page.
    {
      id: "publicAbout",
      label: t("public.about"),
      href: about[0]?.href ?? staff.href,
      children: [...about, staff],
    },
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
          id: "today",
          label: t("sections.today"),
          href: "/munkater",
          // *Ma* is the home of every workspace role (it only shows what the actor may see).
          requires: { action: "directory.open" },
        },
        {
          id: "calendar",
          label: t("sections.calendar"),
          href: "/munkater/naptar",
          module: "ws.calendar",
          // Every workspace role has a personal calendar (policy README).
          requires: {
            action: "calendarEvent.create",
            resource: (ctx) => ({ tenantId: tenantIdOf(ctx), visibility: "private" }),
          },
        },
        {
          id: "directory",
          label: t("sections.directory"),
          href: "/munkater/nevjegyzek",
          requires: { action: "directory.open" },
        },
        {
          id: "teams",
          label: t("sections.teams"),
          href: "/munkater/csapatok",
          requires: { action: "directory.open" },
        },
        {
          id: "rooms",
          label: t("sections.rooms"),
          // Built by the room booking deliverable (D-60); until then a placeholder page.
          href: "/munkater/foglalas",
          module: "ws.rooms",
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
          id: "worship",
          label: t("sections.worship"),
          // Built by the worship plan deliverable (D-66); until then a placeholder page. Every
          // workspace role may open it — the plans themselves are filtered with `servicePlan.view`.
          href: "/munkater/liturgia",
          module: "ws.worship",
          requires: { action: "directory.open" },
        },
        {
          id: "songs",
          label: t("sections.songs"),
          href: "/munkater/enektar",
          module: "ws.music.songs",
          requires: { action: "music.song.view" },
        },
        {
          id: "musicEvents",
          label: t("sections.musicEvents"),
          href: "/munkater/esemenyek",
          module: "ws.music.events",
          requires: { action: "music.event.view" },
        },
        {
          id: "absences",
          label: t("sections.absences"),
          href: "/munkater/tavollet",
          module: "ws.hr.leave",
          requires: { action: "hr.absence.viewCalendar" },
        },
        {
          id: "hr",
          label: t("sections.hr"),
          href: "/munkater/hr",
          module: "ws.hr",
          // Everyone who may submit HR requests (volunteers: categories enabled for them);
          // the page lists what the actor may see.
          requires: {
            action: "hr.ticket.create",
            resource: (ctx) => ({
              tenantId: tenantIdOf(ctx),
              category: { id: "", key: "", confidential: false, whoCanSubmit: "volunteers" },
            }),
          },
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
          id: "events",
          label: t("sections.events"),
          href: "/admin/esemenyek",
          // Group leaders (own group only) are checked per event; the section needs the general right.
          requires: { action: "event.create", resource: (ctx) => ({ tenantId: tenantIdOf(ctx) }) },
        },
        {
          id: "pages",
          label: t("sections.pages"),
          href: "/admin/oldalak",
          requires: { action: "page.create" },
        },
        {
          id: "staff",
          label: t("sections.staff"),
          href: "/admin/munkatarsak",
          // The staff page is page content (SDD §11.3 row "Pages, news, …").
          requires: { action: "page.edit" },
        },
        {
          id: "locations",
          label: t("sections.locations"),
          href: "/admin/helyszinek",
          requires: { action: "location.manage" },
        },
        {
          id: "adminRooms",
          label: t("sections.adminRooms"),
          href: "/admin/termek",
          requires: { action: "location.manage" },
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
          id: "setup",
          label: t("sections.setup"),
          href: "/admin/inditas",
          // First-setup wizard (D-34): the people who switch the site's modules on and off.
          requires: { action: "site.modules.manage" },
        },
        {
          id: "domain",
          label: t("sections.domain"),
          href: "/admin/domain",
          requires: { action: "site.domain.manage" },
        },
        {
          id: "orgLink",
          label: t("sections.orgLink"),
          href: "/admin/egyhazmegye",
          // The parish side of the diocesan link: approve, choose delegated HR categories, revoke.
          requires: { action: "site.orgLink.manage" },
        },
        {
          id: "modules",
          label: t("sections.modules"),
          href: "/admin/modulok",
          // Module toggles (D-25): owner and admin (SDD §11.3 "Appearance, modules, …").
          requires: { action: "site.modules.manage" },
        },
        {
          id: "plan",
          label: t("sections.plan"),
          href: "/admin/csomag",
          // Plan overview (D-87): read by those who switch modules; changing it is the owner's.
          requires: { action: "site.modules.manage" },
        },
        {
          id: "billing",
          label: t("sections.billing"),
          href: "/admin/szamlazas",
          // Billing (D-88): the owner, like the domain and the legal data. A dedicated policy
          // action (`site.billing.manage`) is proposed in the PR.
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
          href: "/egyhazmegye",
          requires: { action: "org.portal.open", resource: (ctx) => ({ orgId: orgIdOf(ctx) }) },
        },
        {
          id: "orgRequests",
          label: t("sections.orgRequests"),
          href: "/egyhazmegye/kerelmek",
          requires: { action: "org.portal.open", resource: (ctx) => ({ orgId: orgIdOf(ctx) }) },
        },
        {
          id: "orgAbsences",
          label: t("sections.orgAbsences"),
          href: "/egyhazmegye/tavollet",
          requires: { action: "org.portal.open", resource: (ctx) => ({ orgId: orgIdOf(ctx) }) },
        },
        {
          id: "orgReports",
          label: t("sections.orgReports"),
          href: "/egyhazmegye/jelentesek",
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
