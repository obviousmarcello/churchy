import type {
  Announcement,
  Ctx,
  Event,
  Location,
  Page,
  Person,
  Post,
  Repositories,
} from "@churchy/contracts";
import { huCollator } from "@churchy/contracts";
import { getT } from "@/i18n/server";
import type { FieldDef, FormValues } from "@/lib/admin/content-form";
import { localInputValue, docFromBlocks, docValue } from "@/lib/admin/content";

/**
 * Field descriptors (translated) and initial values of the content forms (D-21), shared by the
 * "new" and "edit" screens. The names match `FIELDS` in `server/content-save.ts`.
 */

const on = (flag: boolean) => (flag ? "on" : "");

// --- news --------------------------------------------------------------------------------------

export async function newsFields(): Promise<FieldDef[]> {
  const t = await getT("admin.content.news.fields");
  return [
    { kind: "text", name: "title", label: t("title"), required: true },
    { kind: "text", name: "slug", label: t("slug"), help: t("slugHelp") },
    { kind: "textarea", name: "lead", label: t("lead"), help: t("leadHelp"), rows: 3 },
    { kind: "content", name: "body", label: t("body"), help: t("bodyHelp"), required: true },
    { kind: "text", name: "categories", label: t("categories"), help: t("categoriesHelp") },
    {
      kind: "datetime-local",
      name: "expiresAt",
      label: t("expiresAt"),
      help: t("expiresHelp"),
    },
  ];
}

export function newsValues(post?: Post): FormValues {
  return {
    title: post?.title ?? "",
    slug: post?.slug ?? "",
    lead: post?.lead ?? "",
    body: docValue(post?.body),
    categories: post?.categories.join(", ") ?? "",
    expiresAt: localInputValue(post?.expiresAt),
  };
}

// --- announcements -----------------------------------------------------------------------------

export async function announcementFields(): Promise<FieldDef[]> {
  const t = await getT("admin.content.announcements.fields");
  return [
    {
      kind: "date",
      name: "weekSunday",
      label: t("weekSunday"),
      help: t("weekHelp"),
      required: true,
    },
    { kind: "content", name: "body", label: t("body"), help: t("bodyHelp"), required: true },
  ];
}

export function announcementValues(row: Announcement | undefined, sunday: string): FormValues {
  return { weekSunday: row?.weekSunday ?? sunday, body: docValue(row?.body) };
}

// --- events ------------------------------------------------------------------------------------

export async function eventFields(ctx: Ctx, repos: Repositories): Promise<FieldDef[]> {
  const [t, calendars, locations, visibility] = await Promise.all([
    getT("admin.content.events.fields"),
    repos.events.listCalendars(ctx),
    repos.locations.list(ctx),
    getT("admin.content.events.visibility"),
  ]);
  return [
    { kind: "text", name: "title", label: t("title"), required: true },
    { kind: "text", name: "slug", label: t("slug"), help: t("slugHelp") },
    {
      kind: "select",
      name: "calendarId",
      label: t("calendarId"),
      required: true,
      options: calendars.map((c) => ({ value: c.id, label: c.name })),
    },
    {
      kind: "select",
      name: "visibility",
      label: t("visibility"),
      help: t("visibilityHelp"),
      required: true,
      options: (["public", "staff", "team", "private"] as const).map((v) => ({
        value: v,
        label: visibility(v),
      })),
    },
    { kind: "datetime-local", name: "startsAt", label: t("startsAt"), required: true },
    { kind: "datetime-local", name: "endsAt", label: t("endsAt") },
    {
      kind: "select",
      name: "locationId",
      label: t("locationId"),
      placeholder: t("locationNone"),
      options: locations.map((l) => ({ value: l.id, label: l.name })),
    },
    { kind: "text", name: "category", label: t("category") },
    { kind: "content", name: "body", label: t("body"), help: t("bodyHelp"), rows: 8 },
  ];
}

export async function eventValues(
  ctx: Ctx,
  repos: Repositories,
  event?: Event,
): Promise<FormValues> {
  const calendars = await repos.events.listCalendars(ctx);
  // New events default to the first shared calendar (the church's own).
  const calendar = calendars.find((c) => c.kind === "shared") ?? calendars[0];
  return {
    title: event?.title ?? "",
    slug: event?.slug ?? "",
    calendarId: event?.calendarId ?? calendar?.id ?? "",
    visibility: event?.visibility ?? "public",
    startsAt: localInputValue(event?.startsAt),
    endsAt: localInputValue(event?.endsAt),
    locationId: event?.locationId ?? "",
    category: event?.category ?? "",
    body: docValue(event?.body),
  };
}

// --- pages -------------------------------------------------------------------------------------

export async function pageFields(pages: readonly Page[], selfId?: string): Promise<FieldDef[]> {
  const t = await getT("admin.content.pages.fields");
  const parents = pages
    .filter((p) => p.id !== selfId && p.parentId === null)
    .sort((a, b) => huCollator.compare(a.title, b.title));
  return [
    { kind: "text", name: "title", label: t("title"), required: true },
    { kind: "text", name: "slug", label: t("slug"), help: t("slugHelp") },
    {
      kind: "select",
      name: "parentId",
      label: t("parentId"),
      placeholder: t("parentNone"),
      options: parents.map((p) => ({ value: p.id, label: p.title })),
    },
    { kind: "content", name: "body", label: t("body"), help: t("bodyHelp"), rows: 14 },
    { kind: "heading", name: "_seo", label: t("seo") },
    { kind: "text", name: "seoTitle", label: t("seoTitle") },
    { kind: "textarea", name: "seoDescription", label: t("seoDescription"), rows: 3 },
  ];
}

export function pageValues(page?: Page): FormValues {
  return {
    title: page?.title ?? "",
    slug: page?.slug ?? "",
    parentId: page?.parentId ?? "",
    body: page ? docValue(docFromBlocks(page.blocks)) : "",
    seoTitle: page?.seo.title ?? "",
    seoDescription: page?.seo.description ?? "",
  };
}

// --- staff -------------------------------------------------------------------------------------

export async function staffFields(): Promise<FieldDef[]> {
  const [t, groups, visibility] = await Promise.all([
    getT("admin.content.staff.fields"),
    getT("admin.content.staff.groups"),
    getT("admin.content.staff.visibility"),
  ]);
  const visibilityOptions = (["public", "workspace", "team", "private"] as const).map((v) => ({
    value: v,
    label: visibility(v),
  }));
  return [
    { kind: "text", name: "prefix", label: t("prefix"), help: t("prefixHelp") },
    { kind: "text", name: "familyName", label: t("familyName"), required: true },
    { kind: "text", name: "givenName", label: t("givenName"), required: true },
    { kind: "text", name: "suffix", label: t("suffix") },
    { kind: "text", name: "roleTitle", label: t("roleTitle") },
    {
      kind: "select",
      name: "staffGroup",
      label: t("staffGroup"),
      required: true,
      options: (["clergy", "staff", "council", "volunteer"] as const).map((g) => ({
        value: g,
        label: groups(g),
      })),
    },
    { kind: "checkbox", name: "isPublic", label: t("isPublic") },
    { kind: "textarea", name: "bio", label: t("bio"), rows: 5 },
    { kind: "heading", name: "_contact", label: t("contact") },
    { kind: "email", name: "email", label: t("email") },
    {
      kind: "select",
      name: "emailVisibility",
      label: t("emailVisibility"),
      required: true,
      options: visibilityOptions,
    },
    { kind: "tel", name: "phone", label: t("phone") },
    {
      kind: "select",
      name: "phoneVisibility",
      label: t("phoneVisibility"),
      required: true,
      options: visibilityOptions,
    },
    { kind: "checkbox", name: "active", label: t("active") },
  ];
}

export function staffValues(person?: Person): FormValues {
  return {
    prefix: person?.prefix ?? "",
    familyName: person?.familyName ?? "",
    givenName: person?.givenName ?? "",
    suffix: person?.suffix ?? "",
    roleTitle: person?.roleTitle ?? "",
    staffGroup: person?.staffGroup ?? "staff",
    isPublic: on(person?.isPublic ?? true),
    bio: person?.bio ?? "",
    email: person?.email ?? "",
    emailVisibility: person?.contactVisibility.email ?? "public",
    phone: person?.phone ?? "",
    phoneVisibility: person?.contactVisibility.phone ?? "public",
    active: on(person?.active ?? true),
  };
}

// --- locations ---------------------------------------------------------------------------------

export async function locationFields(): Promise<FieldDef[]> {
  const [t, kinds] = await Promise.all([
    getT("admin.content.locations.fields"),
    getT("admin.content.locations.kinds"),
  ]);
  return [
    { kind: "text", name: "name", label: t("name"), required: true },
    { kind: "text", name: "slug", label: t("slug"), help: t("slugHelp") },
    {
      kind: "select",
      name: "kind",
      label: t("kind"),
      required: true,
      options: (["templom", "kapolna", "filia", "egyeb"] as const).map((k) => ({
        value: k,
        label: kinds(k),
      })),
    },
    { kind: "heading", name: "_address", label: t("address") },
    { kind: "text", name: "postalCode", label: t("postalCode") },
    { kind: "text", name: "city", label: t("city") },
    { kind: "text", name: "line1", label: t("line1") },
    { kind: "heading", name: "_access", label: t("accessibility") },
    { kind: "checkbox", name: "wheelchair", label: t("wheelchair") },
    { kind: "checkbox", name: "accessibleToilet", label: t("accessibleToilet") },
    { kind: "checkbox", name: "hearingLoop", label: t("hearingLoop") },
    { kind: "checkbox", name: "parking", label: t("parking") },
    { kind: "textarea", name: "accessNote", label: t("accessNote"), rows: 3 },
  ];
}

export function locationValues(location?: Location): FormValues {
  return {
    name: location?.name ?? "",
    slug: location?.slug ?? "",
    kind: location?.kind ?? "templom",
    postalCode: location?.address?.postalCode ?? "",
    city: location?.address?.city ?? "",
    line1: location?.address?.line1 ?? "",
    wheelchair: on(location?.accessibility.wheelchair ?? false),
    accessibleToilet: on(location?.accessibility.accessibleToilet ?? false),
    hearingLoop: on(location?.accessibility.hearingLoop ?? false),
    parking: on(location?.accessibility.parking ?? false),
    accessNote: location?.accessibility.note ?? "",
  };
}
