/**
 * `createMockRepositories(store)` — every repository interface of `@churchy/contracts` on top of
 * one `MockStore`. Each method is instrumented: the store's simulation switches run first
 * (offline rejection, latency), and arguments and results are deep-copied so callers can never
 * mutate the store behind the repository's back (the DB adapter has the same property).
 */
import type { DataModule, Repositories } from "@churchy/contracts";
import { DATA_MODULES } from "@churchy/contracts";
import type { MockStore } from "./store";
import type { RepoDeps } from "./repos/helpers";
import {
  mockLocations,
  mockSchedule,
  mockAnnouncements,
  mockNews,
  mockPages,
  mockEvents,
  mockMedia,
} from "./repos/website";
import { mockBilling, mockMembers, mockOrganizations, mockTenants } from "./repos/platform";
import { mockPeople, mockRequests, mockTeams } from "./repos/community";
import { mockBookings, mockRooms } from "./repos/rooms";
import { mockAssignments, mockAttachments, mockServicePlans, mockSongs } from "./repos/worship";
import { mockAbsences, mockHr, mockNotifications } from "./repos/hr";

type Builders = { [M in DataModule]: (deps: RepoDeps) => Repositories[M] };

const BUILDERS: Builders = {
  tenants: mockTenants,
  members: mockMembers,
  billing: mockBilling,
  organizations: mockOrganizations,
  locations: mockLocations,
  schedule: mockSchedule,
  announcements: mockAnnouncements,
  news: mockNews,
  events: mockEvents,
  pages: mockPages,
  media: mockMedia,
  people: mockPeople,
  teams: mockTeams,
  requests: mockRequests,
  rooms: mockRooms,
  bookings: mockBookings,
  songs: mockSongs,
  attachments: mockAttachments,
  servicePlans: mockServicePlans,
  assignments: mockAssignments,
  hr: mockHr,
  absences: mockAbsences,
  notifications: mockNotifications,
};

/** Wraps every method: simulation switches first, then deep copies in and out. */
function instrument<T extends object>(store: MockStore, repo: T): T {
  const wrapped: Record<string, unknown> = {};
  for (const [name, method] of Object.entries(repo)) {
    if (typeof method !== "function") continue;
    wrapped[name] = async (...args: unknown[]) => {
      await store.beforeCall();
      const result: unknown = await (method as (...a: unknown[]) => unknown)(
        ...structuredClone(args),
      );
      return result === undefined ? undefined : structuredClone(result);
    };
  }
  return wrapped as T;
}

/** The mock repository of one module, bound to `store`. */
export function createMockRepository<M extends DataModule>(
  store: MockStore,
  module: M,
): Repositories[M] {
  const build = BUILDERS[module] as (deps: RepoDeps) => Repositories[M];
  return instrument(store, build({ store }));
}

/** All 23 repositories bound to `store`. */
export function createMockRepositories(store: MockStore): Repositories {
  const repos = {} as Record<DataModule, unknown>;
  for (const module of DATA_MODULES) repos[module] = createMockRepository(store, module);
  return repos as Repositories;
}
