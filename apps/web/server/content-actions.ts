"use server";

import type { EventStatus } from "@churchy/contracts";
import type { FormState } from "@/lib/admin/content-form";
import {
  deleteItem,
  publishItem,
  runGuarded,
  saveAnnouncement,
  saveEvent,
  saveLocation,
  saveNews,
  savePage,
  saveStaff,
  unpublishItem,
} from "@/server/content-save";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";
import { getRequestContext } from "@/server/session";

/**
 * Mutations of the content admin (D-20, D-21). Each one goes through `withPolicy()`: the actor
 * needs the content kind's action (`news.create`, `event.publish`, `location.manage` …) in the
 * request's church. Saves return the form state (field errors) or redirect to the item's screen;
 * publish / unpublish / delete return `"ok" | "invalid" | "notFound"`.
 *
 * The staff page is page content (SDD §11.3), so staff uses the `page.*` actions.
 */

/**
 * The request's church as the policy resource (`null` in an organization context: 404). The
 * instantiations below give each action's resolver its argument types.
 */
async function tenant<Args extends unknown[]>(_scope: PolicyScope, ..._args: Args) {
  const { tenantId } = await getRequestContext();
  return tenantId === undefined ? null : { tenantId };
}
const forSave = tenant<[previous: FormState, form: FormData]>;
const forUpdate = tenant<[id: string, previous: FormState, form: FormData]>;
const forId = tenant<[id: string]>;
const forPublish = tenant<[id: string, local: string | null]>;
const forStatus = tenant<[id: string, status: EventStatus]>;
const forIds = tenant<[ids: string[]]>;

// --- news ------------------------------------------------------------------------------------

export const createNews = withPolicy(
  "news.create",
  forSave,
  (scope, _previous: FormState, form: FormData) => saveNews(scope, null, form),
);
export const updateNews = withPolicy(
  "news.edit",
  forUpdate,
  (scope, id: string, _previous: FormState, form: FormData) => saveNews(scope, id, form),
);
export const publishNews = withPolicy(
  "news.publish",
  forPublish,
  async (scope, id: string, local: string | null) =>
    publishItem((await getRequestRepositories()).news, scope.ctx, id, local),
);
export const unpublishNews = withPolicy("news.publish", forId, async (scope, id: string) =>
  unpublishItem((await getRequestRepositories()).news, scope.ctx, id),
);
export const deleteNews = withPolicy("news.delete", forId, async (scope, id: string) =>
  deleteItem((await getRequestRepositories()).news, scope.ctx, id),
);

// --- announcements -----------------------------------------------------------------------------

export const createAnnouncement = withPolicy(
  "announcement.create",
  forSave,
  (scope, _previous: FormState, form: FormData) => saveAnnouncement(scope, null, form),
);
export const updateAnnouncement = withPolicy(
  "announcement.edit",
  forUpdate,
  (scope, id: string, _previous: FormState, form: FormData) => saveAnnouncement(scope, id, form),
);
export const publishAnnouncement = withPolicy(
  "announcement.publish",
  forPublish,
  async (scope, id: string, local: string | null) =>
    publishItem((await getRequestRepositories()).announcements, scope.ctx, id, local),
);
export const unpublishAnnouncement = withPolicy(
  "announcement.publish",
  forId,
  async (scope, id: string) =>
    unpublishItem((await getRequestRepositories()).announcements, scope.ctx, id),
);
export const deleteAnnouncement = withPolicy(
  "announcement.delete",
  forId,
  async (scope, id: string) =>
    deleteItem((await getRequestRepositories()).announcements, scope.ctx, id),
);

// --- events ------------------------------------------------------------------------------------

export const createEvent = withPolicy(
  "event.create",
  forSave,
  (scope, _previous: FormState, form: FormData) => saveEvent(scope, null, form),
);
export const updateEvent = withPolicy(
  "event.edit",
  forUpdate,
  (scope, id: string, _previous: FormState, form: FormData) => saveEvent(scope, id, form),
);
/** Events have no schedule date: they are drafts, published or cancelled (SDD §22.1). */
export const setEventStatus = withPolicy(
  "event.publish",
  forStatus,
  async (scope, id: string, status: EventStatus) =>
    runGuarded(async () =>
      (await getRequestRepositories()).events.setStatus(scope.ctx, id, status),
    ),
);
export const deleteEvent = withPolicy("event.delete", forId, async (scope, id: string) =>
  deleteItem((await getRequestRepositories()).events, scope.ctx, id),
);

// --- pages -------------------------------------------------------------------------------------

export const createPage = withPolicy(
  "page.create",
  forSave,
  (scope, _previous: FormState, form: FormData) => savePage(scope, null, form),
);
export const updatePage = withPolicy(
  "page.edit",
  forUpdate,
  (scope, id: string, _previous: FormState, form: FormData) => savePage(scope, id, form),
);
export const publishPage = withPolicy(
  "page.publish",
  forPublish,
  async (scope, id: string, local: string | null) =>
    publishItem((await getRequestRepositories()).pages, scope.ctx, id, local),
);
export const unpublishPage = withPolicy("page.publish", forId, async (scope, id: string) =>
  unpublishItem((await getRequestRepositories()).pages, scope.ctx, id),
);
export const deletePage = withPolicy("page.delete", forId, async (scope, id: string) =>
  deleteItem((await getRequestRepositories()).pages, scope.ctx, id),
);

// --- staff -------------------------------------------------------------------------------------

export const createStaff = withPolicy(
  "page.edit",
  forSave,
  (scope, _previous: FormState, form: FormData) => saveStaff(scope, null, form),
);
export const updateStaff = withPolicy(
  "page.edit",
  forUpdate,
  (scope, id: string, _previous: FormState, form: FormData) => saveStaff(scope, id, form),
);
export const deleteStaff = withPolicy("page.delete", forId, async (scope, id: string) =>
  deleteItem((await getRequestRepositories()).people, scope.ctx, id),
);
export const reorderStaff = withPolicy("page.edit", forIds, async (scope, ids: string[]) =>
  runGuarded(async () => (await getRequestRepositories()).people.reorder(scope.ctx, ids)),
);

// --- locations ---------------------------------------------------------------------------------

export const createLocation = withPolicy(
  "location.manage",
  forSave,
  (scope, _previous: FormState, form: FormData) => saveLocation(scope, null, form),
);
export const updateLocation = withPolicy(
  "location.manage",
  forUpdate,
  (scope, id: string, _previous: FormState, form: FormData) => saveLocation(scope, id, form),
);
export const deleteLocation = withPolicy("location.manage", forId, async (scope, id: string) =>
  deleteItem((await getRequestRepositories()).locations, scope.ctx, id),
);
export const reorderLocations = withPolicy(
  "location.manage",
  forIds,
  async (scope, ids: string[]) =>
    runGuarded(async () => (await getRequestRepositories()).locations.reorder(scope.ctx, ids)),
);
