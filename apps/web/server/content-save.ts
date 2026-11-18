import { redirect } from "next/navigation";
import {
  AnnouncementInputSchema,
  EventInputSchema,
  LocationInputSchema,
  PageInputSchema,
  PersonInputSchema,
  PostInputSchema,
  type Ctx,
  type Repositories,
} from "@churchy/contracts";
import { isContractError } from "@churchy/contracts";
import { can } from "@churchy/policy";
import { getT } from "@/i18n/server";
import {
  formValues,
  repositoryErrors,
  validate,
  type ErrorMessages,
  type FormState,
  type FormValues,
} from "@/lib/admin/content-form";
import {
  blocksFromText,
  bodyFromText,
  docFromText,
  instantFromLocalInput,
  uniqueSlug,
} from "@/lib/admin/content";
import type { AuthorizedScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Saving of the content forms (D-21): form fields → contract input → repository, with Hungarian
 * field errors. Called from the policy-wrapped actions in `content-actions.ts` only, never from
 * a client. Success redirects to the item's edit screen (`?mentve=1`).
 */

/** The form fields of each content type (shared with the pages that render the forms). */
export const FIELDS = {
  news: ["title", "slug", "lead", "body", "categories", "expiresAt"],
  announcement: ["weekSunday", "body", "intent"],
  event: [
    "title",
    "slug",
    "calendarId",
    "visibility",
    "startsAt",
    "endsAt",
    "locationId",
    "category",
    "body",
  ],
  page: ["title", "slug", "parentId", "body", "seoTitle", "seoDescription"],
  staff: [
    "prefix",
    "familyName",
    "givenName",
    "suffix",
    "roleTitle",
    "staffGroup",
    "isPublic",
    "bio",
    "email",
    "phone",
    "emailVisibility",
    "phoneVisibility",
    "active",
  ],
  location: [
    "name",
    "slug",
    "kind",
    "postalCode",
    "city",
    "line1",
    "wheelchair",
    "accessibleToilet",
    "hearingLoop",
    "parking",
    "accessNote",
  ],
} as const;

type Scope = { ctx: Ctx };
type Env = {
  ctx: Ctx;
  repos: Repositories;
  messages: ErrorMessages;
  values: FormValues;
};

async function errorMessages(): Promise<ErrorMessages> {
  const t = await getT("admin.content.errors");
  return {
    required: t("required"),
    slugTaken: t("slugTaken"),
    slugFormat: t("slugFormat"),
    sunday: t("sunday"),
    weekTaken: t("weekTaken"),
    announcementEmpty: t("announcementEmpty"),
    endBeforeStart: t("endBeforeStart"),
    phone: t("phone"),
    postalCode: t("postalCode"),
    address: t("address"),
    notFound: t("notFound"),
    general: t("general"),
  };
}

async function env(scope: Scope, form: FormData, fields: readonly string[]): Promise<Env> {
  return {
    ctx: scope.ctx,
    repos: await getRequestRepositories(),
    messages: await errorMessages(),
    values: formValues(form, fields),
  };
}

const invalid = (errors: Record<string, string>, values: FormValues): FormState => ({
  status: "invalid",
  errors,
  values,
});

/** Required text fields the schemas would also catch, reported with the field's own message. */
function missing(values: FormValues, names: readonly string[], messages: ErrorMessages) {
  return Object.fromEntries(
    names.filter((n) => (values[n] ?? "").trim() === "").map((n) => [n, messages.required]),
  );
}

const nullable = (s: string): string | null => (s.trim() === "" ? null : s.trim());
const flag = (s: string | undefined): boolean => s === "on" || s === "true";

/**
 * Runs `write` and turns repository conflicts into field errors; redirects on success.
 * `write` returns the saved item's edit path.
 */
async function persist(e: Env, fields: readonly string[], write: () => Promise<string>) {
  let path: string;
  try {
    path = await write();
  } catch (error) {
    return invalid(repositoryErrors(error, fields, e.messages), e.values);
  }
  redirect(`${path}?mentve=1`);
}

// ---------------------------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------------------------

export async function saveNews(scope: Scope, id: string | null, form: FormData) {
  const e = await env(scope, form, FIELDS.news);
  const { values: v } = e;
  const existing = id === null ? null : await e.repos.news.get(e.ctx, id);
  if (id !== null && existing === null) return invalid({ _form: e.messages.notFound }, v);
  const errors = missing(v, ["title", "body"], e.messages);
  if (Object.keys(errors).length > 0) return invalid(errors, v);

  const taken = (await e.repos.news.list(e.ctx, { pageSize: 200 })).items
    .filter((p) => p.id !== id)
    .map((p) => p.slug);
  const parsed = validate(
    PostInputSchema,
    {
      id: id ?? undefined,
      slug: v["slug"]?.trim() || uniqueSlug(v["title"] ?? "", taken, "hir"),
      title: v["title"],
      lead: v["lead"],
      body: bodyFromText(existing?.body, v["body"] ?? "") ?? docFromText(""),
      coverMediaId: existing?.coverMediaId ?? null,
      categories: (v["categories"] ?? "")
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c !== ""),
      expiresAt: instantFromLocalInput(v["expiresAt"]),
    },
    FIELDS.news,
    e.messages,
  );
  if (!parsed.ok) return invalid(parsed.errors, v);
  return persist(e, FIELDS.news, async () => {
    const row = await e.repos.news.upsert(e.ctx, parsed.data);
    return `/admin/hirek/${row.id}`;
  });
}

// ---------------------------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------------------------

/** `intent = "publish"` also publishes now, when the actor may (`announcement.publish`). */
export async function saveAnnouncement(
  scope: AuthorizedScope<"announcement.create" | "announcement.edit">,
  id: string | null,
  form: FormData,
) {
  const e = await env(scope, form, FIELDS.announcement);
  const { values: v } = e;
  const existing = id === null ? null : await e.repos.announcements.get(e.ctx, id);
  if (id !== null && existing === null) return invalid({ _form: e.messages.notFound }, v);

  const parsed = validate(
    AnnouncementInputSchema,
    {
      id: id ?? undefined,
      weekSunday: v["weekSunday"],
      body: bodyFromText(existing?.body, v["body"] ?? ""),
      pdfMediaId: existing?.pdfMediaId ?? null,
    },
    FIELDS.announcement,
    e.messages,
  );
  if (!parsed.ok) return invalid(parsed.errors, v);
  const publishNow =
    v["intent"] === "publish" && can(scope.actor, "announcement.publish", scope.resource);
  return persist(e, FIELDS.announcement, async () => {
    const row = await e.repos.announcements.upsert(e.ctx, parsed.data);
    if (publishNow && row.status !== "published")
      await e.repos.announcements.publish(e.ctx, row.id);
    return `/admin/hirdetesek/${row.id}`;
  });
}

// ---------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------

const EVENT_WINDOW = { from: "2000-01-01T00:00:00Z", to: "2100-01-01T00:00:00Z" };

export async function saveEvent(scope: Scope, id: string | null, form: FormData) {
  const e = await env(scope, form, FIELDS.event);
  const { values: v } = e;
  const existing = id === null ? null : await e.repos.events.get(e.ctx, id);
  if (id !== null && existing === null) return invalid({ _form: e.messages.notFound }, v);
  const errors = missing(v, ["title", "startsAt", "calendarId"], e.messages);
  if (Object.keys(errors).length > 0) return invalid(errors, v);

  const taken = (await e.repos.events.list(e.ctx, EVENT_WINDOW))
    .filter((x) => x.id !== id)
    .map((x) => x.slug);
  const parsed = validate(
    EventInputSchema,
    {
      id: id ?? undefined,
      calendarId: v["calendarId"],
      visibility: v["visibility"],
      slug: v["slug"]?.trim() || uniqueSlug(v["title"] ?? "", taken, "esemeny"),
      title: v["title"],
      body: bodyFromText(existing?.body, v["body"] ?? ""),
      startsAt: instantFromLocalInput(v["startsAt"]) ?? "",
      endsAt: instantFromLocalInput(v["endsAt"]),
      allDay: existing?.allDay ?? false,
      rrule: existing?.rrule ?? null,
      exdates: existing?.exdates ?? [],
      parentEventId: existing?.parentEventId ?? null,
      recurrenceId: existing?.recurrenceId ?? null,
      locationId: nullable(v["locationId"] ?? ""),
      groupId: existing?.groupId ?? null,
      teamId: existing?.teamId ?? null,
      category: nullable(v["category"] ?? ""),
      coverMediaId: existing?.coverMediaId ?? null,
    },
    FIELDS.event,
    e.messages,
  );
  if (!parsed.ok) return invalid(parsed.errors, v);
  return persist(e, FIELDS.event, async () => {
    const row = await e.repos.events.upsert(e.ctx, parsed.data);
    return `/admin/esemenyek/${row.id}`;
  });
}

// ---------------------------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------------------------

export async function savePage(scope: Scope, id: string | null, form: FormData) {
  const e = await env(scope, form, FIELDS.page);
  const { values: v } = e;
  const pages = await e.repos.pages.list(e.ctx);
  const existing = id === null ? null : (pages.find((p) => p.id === id) ?? null);
  if (id !== null && existing === null) return invalid({ _form: e.messages.notFound }, v);
  const errors = missing(v, ["title"], e.messages);
  if (Object.keys(errors).length > 0) return invalid(errors, v);

  const parsed = validate(
    PageInputSchema,
    {
      id: id ?? undefined,
      slug:
        v["slug"]?.trim() ||
        uniqueSlug(
          v["title"] ?? "",
          pages.filter((p) => p.id !== id).map((p) => p.slug),
          "oldal",
        ),
      title: v["title"],
      blocks: blocksFromText(existing?.blocks ?? [], v["body"] ?? ""),
      parentId: nullable(v["parentId"] ?? ""),
      riteKey: existing?.riteKey ?? null,
      seo: {
        title: nullable(v["seoTitle"] ?? ""),
        description: nullable(v["seoDescription"] ?? ""),
        ogImageMediaId: existing?.seo.ogImageMediaId ?? null,
      },
      sort: existing?.sort ?? Math.max(-1, ...pages.map((p) => p.sort)) + 1,
    },
    FIELDS.page,
    e.messages,
  );
  if (!parsed.ok) return invalid(parsed.errors, v);
  return persist(e, FIELDS.page, async () => {
    const row = await e.repos.pages.upsert(e.ctx, parsed.data);
    return `/admin/oldalak/${row.id}`;
  });
}

// ---------------------------------------------------------------------------------------------
// Staff (people shown on the public staff page)
// ---------------------------------------------------------------------------------------------

export async function saveStaff(scope: Scope, id: string | null, form: FormData) {
  const e = await env(scope, form, FIELDS.staff);
  const { values: v } = e;
  const people = await e.repos.people.list(e.ctx);
  const existing = id === null ? null : (people.find((p) => p.id === id) ?? null);
  if (id !== null && existing === null) return invalid({ _form: e.messages.notFound }, v);
  const errors = missing(v, ["familyName", "givenName"], e.messages);
  if (Object.keys(errors).length > 0) return invalid(errors, v);

  const parsed = validate(
    PersonInputSchema,
    {
      id: id ?? undefined,
      userId: existing?.userId ?? null,
      prefix: nullable(v["prefix"] ?? ""),
      familyName: v["familyName"],
      givenName: v["givenName"],
      suffix: nullable(v["suffix"] ?? ""),
      roleTitle: nullable(v["roleTitle"] ?? ""),
      staffGroup: v["staffGroup"],
      isPublic: flag(v["isPublic"]),
      bio: nullable(v["bio"] ?? ""),
      email: nullable(v["email"] ?? ""),
      phone: nullable(v["phone"] ?? ""),
      contactVisibility: { email: v["emailVisibility"], phone: v["phoneVisibility"] },
      skills: existing?.skills ?? [],
      photoMediaId: existing?.photoMediaId ?? null,
      isMinor: existing?.isMinor ?? false,
      guardianEmail: existing?.guardianEmail ?? null,
      active: flag(v["active"]),
      sort: existing?.sort ?? Math.max(-1, ...people.map((p) => p.sort)) + 1,
    },
    FIELDS.staff,
    e.messages,
  );
  if (!parsed.ok) return invalid(parsed.errors, v);
  return persist(e, FIELDS.staff, async () => {
    const row = await e.repos.people.upsert(e.ctx, parsed.data);
    return `/admin/munkatarsak/${row.id}`;
  });
}

// ---------------------------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------------------------

export async function saveLocation(scope: Scope, id: string | null, form: FormData) {
  const e = await env(scope, form, FIELDS.location);
  const { values: v } = e;
  const locations = await e.repos.locations.list(e.ctx);
  const existing = id === null ? null : (locations.find((l) => l.id === id) ?? null);
  if (id !== null && existing === null) return invalid({ _form: e.messages.notFound }, v);
  const errors = missing(v, ["name"], e.messages);
  const addressParts = ["postalCode", "city", "line1"] as const;
  const anyAddress = addressParts.some((n) => (v[n] ?? "").trim() !== "");
  if (anyAddress) Object.assign(errors, missing(v, addressParts, e.messages));
  if (Object.keys(errors).length > 0) return invalid(errors, v);

  const parsed = validate(
    LocationInputSchema,
    {
      id: id ?? undefined,
      name: v["name"],
      slug:
        v["slug"]?.trim() ||
        uniqueSlug(
          v["name"] ?? "",
          locations.filter((l) => l.id !== id).map((l) => l.slug),
          "helyszin",
        ),
      kind: v["kind"],
      address: anyAddress
        ? {
            postalCode: v["postalCode"]?.trim(),
            city: v["city"],
            line1: v["line1"],
            line2: existing?.address?.line2 ?? null,
          }
        : null,
      geo: existing?.geo ?? null,
      openingHours: existing?.openingHours ?? { weekly: [], exceptions: [] },
      accessibility: {
        wheelchair: flag(v["wheelchair"]),
        accessibleToilet: flag(v["accessibleToilet"]),
        hearingLoop: flag(v["hearingLoop"]),
        parking: flag(v["parking"]),
        note: nullable(v["accessNote"] ?? ""),
      },
      photoMediaId: existing?.photoMediaId ?? null,
      sort: existing?.sort ?? Math.max(-1, ...locations.map((l) => l.sort)) + 1,
    },
    FIELDS.location,
    e.messages,
  );
  if (!parsed.ok) return invalid(parsed.errors, v);
  return persist(e, FIELDS.location, async () => {
    const row = await e.repos.locations.upsert(e.ctx, parsed.data);
    return `/admin/helyszinek/${row.id}`;
  });
}

// ---------------------------------------------------------------------------------------------
// Publishing and deleting (D-20)
// ---------------------------------------------------------------------------------------------

export type ItemOutcome = "ok" | "invalid" | "notFound";

interface Publishing {
  publish(ctx: Ctx, id: string, at?: string): Promise<void>;
  unpublish(ctx: Ctx, id: string): Promise<void>;
  delete(ctx: Ctx, id: string): Promise<void>;
}

async function guarded(run: () => Promise<void>): Promise<ItemOutcome> {
  try {
    await run();
    return "ok";
  } catch (error) {
    if (isContractError(error, "NOT_FOUND")) return "notFound";
    if (isContractError(error, "VALIDATION")) return "invalid";
    throw error;
  }
}

/** Publish now (`local` empty) or at a Budapest wall-clock `datetime-local` value (scheduling). */
export async function publishItem(
  repo: Publishing,
  ctx: Ctx,
  id: string,
  local: string | null,
): Promise<ItemOutcome> {
  const at = local === null || local === "" ? undefined : instantFromLocalInput(local);
  if (at === null) return "invalid";
  return guarded(() => repo.publish(ctx, id, at));
}

export const unpublishItem = (repo: Publishing, ctx: Ctx, id: string) =>
  guarded(() => repo.unpublish(ctx, id));

export const deleteItem = (
  repo: { delete(ctx: Ctx, id: string): Promise<void> },
  ctx: Ctx,
  id: string,
) => guarded(() => repo.delete(ctx, id));

export { guarded as runGuarded };
