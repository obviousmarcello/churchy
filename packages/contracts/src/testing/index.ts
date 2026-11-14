/**
 * `@churchy/contracts/testing` — contract-test harness and one suite per repository.
 * Imported only from `*.contract.test.ts` files of adapter packages (it depends on Vitest).
 */
import type { DataModule } from "../registry";
import { DATA_MODULES } from "../registry";
import type { ContractAdapterFactory, ContractSuite, ContractSuiteOptions } from "./harness";
import { skipContractSuite } from "./harness";
import { absencesContract } from "./suites/absences";
import { announcementsContract } from "./suites/announcements";
import { assignmentsContract } from "./suites/assignments";
import { attachmentsContract } from "./suites/attachments";
import { billingContract } from "./suites/billing";
import { bookingsContract } from "./suites/bookings";
import { contactContract } from "./suites/contact";
import { eventsContract } from "./suites/events";
import { hrContract } from "./suites/hr";
import { locationsContract } from "./suites/locations";
import { mediaContract } from "./suites/media";
import { membersContract } from "./suites/members";
import { newsContract } from "./suites/news";
import { notificationsContract } from "./suites/notifications";
import { organizationsContract } from "./suites/organizations";
import { pagesContract } from "./suites/pages";
import { peopleContract } from "./suites/people";
import { requestsContract } from "./suites/requests";
import { roomsContract } from "./suites/rooms";
import { scheduleContract } from "./suites/schedule";
import { servicePlansContract } from "./suites/service-plans";
import { songsContract } from "./suites/songs";
import { teamsContract } from "./suites/teams";
import { tenantsContract } from "./suites/tenants";

export * from "./harness";
export {
  absencesContract,
  announcementsContract,
  assignmentsContract,
  attachmentsContract,
  billingContract,
  bookingsContract,
  contactContract,
  eventsContract,
  hrContract,
  locationsContract,
  mediaContract,
  membersContract,
  newsContract,
  notificationsContract,
  organizationsContract,
  pagesContract,
  peopleContract,
  requestsContract,
  roomsContract,
  scheduleContract,
  servicePlansContract,
  songsContract,
  teamsContract,
  tenantsContract,
};

/** Exactly one contract suite per data module (compile-time complete). */
export const CONTRACT_SUITES: { [M in DataModule]: ContractSuite<M> } = {
  tenants: tenantsContract,
  members: membersContract,
  billing: billingContract,
  organizations: organizationsContract,
  locations: locationsContract,
  schedule: scheduleContract,
  announcements: announcementsContract,
  news: newsContract,
  events: eventsContract,
  pages: pagesContract,
  media: mediaContract,
  people: peopleContract,
  teams: teamsContract,
  requests: requestsContract,
  rooms: roomsContract,
  bookings: bookingsContract,
  songs: songsContract,
  attachments: attachmentsContract,
  servicePlans: servicePlansContract,
  assignments: assignmentsContract,
  hr: hrContract,
  absences: absencesContract,
  notifications: notificationsContract,
  contact: contactContract,
};

/**
 * Registers every module's contract suite for one adapter. Modules not listed in `modules`
 * (default: all) are registered as skipped, so the report always shows the full coverage gap.
 *
 * Some suites create prerequisites through other modules (e.g. `bookings` needs `locations` and
 * `rooms`, `hr` needs `organizations` for the delegation test); the factory must provide those.
 */
export function runContractSuites(
  adapterName: string,
  factory: ContractAdapterFactory,
  options: { modules?: readonly DataModule[] } = {},
): void {
  const enabled = new Set(options.modules ?? DATA_MODULES);
  const suiteOptions: ContractSuiteOptions = { adapterName };
  for (const module of DATA_MODULES) {
    if (enabled.has(module)) {
      (CONTRACT_SUITES[module] as ContractSuite<DataModule>)(factory, suiteOptions);
    } else {
      skipContractSuite(module, suiteOptions);
    }
  }
}
