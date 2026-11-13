import type { AbsenceRepo } from "./modules/absences";
import type { AnnouncementRepo } from "./modules/announcements";
import type { AssignmentRepo } from "./modules/assignments";
import type { AttachmentRepo } from "./modules/attachments";
import type { BillingRepo } from "./modules/billing";
import type { BookingRepo } from "./modules/bookings";
import type { EventRepo } from "./modules/events";
import type { HrRepo } from "./modules/hr";
import type { LocationRepo } from "./modules/locations";
import type { MediaRepo } from "./modules/media";
import type { MembershipRepo } from "./modules/members";
import type { PostRepo } from "./modules/news";
import type { NotificationRepo } from "./modules/notifications";
import type { OrganizationRepo } from "./modules/organizations";
import type { PageRepo } from "./modules/pages";
import type { PersonRepo } from "./modules/people";
import type { RequestRepo } from "./modules/requests";
import type { RoomRepo } from "./modules/rooms";
import type { ScheduleRepo } from "./modules/schedule";
import type { ServicePlanRepo } from "./modules/service-plans";
import type { SongRepo } from "./modules/songs";
import type { TeamRepo } from "./modules/teams";
import type { TenantRepo } from "./modules/tenants";

/** Data module → repository interface. One interface per module. */
export interface Repositories {
  tenants: TenantRepo;
  members: MembershipRepo;
  billing: BillingRepo;
  organizations: OrganizationRepo;
  locations: LocationRepo;
  schedule: ScheduleRepo;
  announcements: AnnouncementRepo;
  news: PostRepo;
  events: EventRepo;
  pages: PageRepo;
  media: MediaRepo;
  people: PersonRepo;
  teams: TeamRepo;
  requests: RequestRepo;
  rooms: RoomRepo;
  bookings: BookingRepo;
  songs: SongRepo;
  attachments: AttachmentRepo;
  servicePlans: ServicePlanRepo;
  assignments: AssignmentRepo;
  hr: HrRepo;
  absences: AbsenceRepo;
  notifications: NotificationRepo;
}

export type DataModule = keyof Repositories;

export const DATA_MODULES = [
  "tenants",
  "members",
  "billing",
  "organizations",
  "locations",
  "schedule",
  "announcements",
  "news",
  "events",
  "pages",
  "media",
  "people",
  "teams",
  "requests",
  "rooms",
  "bookings",
  "songs",
  "attachments",
  "servicePlans",
  "assignments",
  "hr",
  "absences",
  "notifications",
] as const satisfies readonly DataModule[];

// Compile-time check that DATA_MODULES lists every key of Repositories.
type _MissingModules = Exclude<DataModule, (typeof DATA_MODULES)[number]>;
const _allModulesListed: [_MissingModules] extends [never] ? true : false = true;
void _allModulesListed;

export const ADAPTER_KINDS = ["mock", "db"] as const;
export type AdapterKind = (typeof ADAPTER_KINDS)[number];
export const DEFAULT_ADAPTER: AdapterKind = "mock";

export type Env = Readonly<Record<string, string | undefined>>;

/** `servicePlans` → `DATA_ADAPTER_SERVICE_PLANS`. */
export function adapterEnvVar(module: DataModule): string {
  return `DATA_ADAPTER_${module.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}`;
}

/** Reads `process.env` when it exists (server), else an empty env (browser, edge). */
export function processEnv(): Env {
  const proc = (globalThis as { process?: { env?: Env } }).process;
  return proc?.env ?? {};
}

/**
 * The adapter configured for a module: `DATA_ADAPTER_<MODULE>=mock|db`, default `mock`.
 * Any other value is a configuration error (thrown, never silently ignored).
 */
export function selectAdapter(module: DataModule, env: Env = processEnv()): AdapterKind {
  const name = adapterEnvVar(module);
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return DEFAULT_ADAPTER;
  if ((ADAPTER_KINDS as readonly string[]).includes(raw)) return raw as AdapterKind;
  throw new Error(`${name}="${env[name]}" is invalid; expected one of ${ADAPTER_KINDS.join(", ")}`);
}

export type RepositoryFactory<M extends DataModule> = () => Repositories[M];
export type RepositoryFactories = { [M in DataModule]?: RepositoryFactory<M> };

/**
 * Per-module adapter registry (SDD §4.4). Adapter packages register their factories; the app
 * resolves repositories through `getRepositories()` and never imports an adapter directly.
 *
 * ```ts
 * // packages/data-mock/src/register.ts
 * registerAdapter("mock", { announcements: () => mockAnnouncements(store), … });
 * // apps/web/server/data-adapters.ts — the one composition root allowed to import adapters
 * import "@churchy/data-mock/register";
 * // anywhere on the server
 * const repos = getRepositories();
 * await repos.announcements.latest(ctx);
 * ```
 */
export class AdapterRegistry {
  private readonly factories = new Map<AdapterKind, RepositoryFactories>();

  /** Register (or replace) factories of one adapter kind; modules not listed are kept. */
  register(kind: AdapterKind, factories: RepositoryFactories): void {
    this.factories.set(kind, { ...this.factories.get(kind), ...factories });
  }

  /** Modules for which `kind` has a registered factory. */
  registeredModules(kind: AdapterKind): DataModule[] {
    const forKind = this.factories.get(kind) ?? {};
    return DATA_MODULES.filter((m) => forKind[m] !== undefined);
  }

  /** Builds the repository of one module with the adapter selected by `env`. */
  resolve<M extends DataModule>(module: M, env: Env = processEnv()): Repositories[M] {
    const kind = selectAdapter(module, env);
    const factory = this.factories.get(kind)?.[module] as RepositoryFactory<M> | undefined;
    if (!factory) {
      throw new Error(
        `No "${kind}" adapter registered for module "${module}" (${adapterEnvVar(module)}). ` +
          `Import the adapter's registration entry in the server composition root.`,
      );
    }
    return factory();
  }

  /**
   * A `Repositories` object whose modules are resolved lazily on first access (so an
   * unregistered module only fails when it is actually used) and cached per object.
   */
  getRepositories(env: Env = processEnv()): Repositories {
    const cache = new Map<DataModule, unknown>();
    const repos = {} as Repositories;
    for (const module of DATA_MODULES) {
      Object.defineProperty(repos, module, {
        enumerable: true,
        get: () => {
          if (!cache.has(module)) cache.set(module, this.resolve(module, env));
          return cache.get(module);
        },
      });
    }
    return repos;
  }

  /** Removes all registrations (tests). */
  clear(): void {
    this.factories.clear();
  }
}

/** The process-wide registry used by the app. */
export const adapterRegistry = new AdapterRegistry();

/** Register factories with the process-wide registry. */
export function registerAdapter(kind: AdapterKind, factories: RepositoryFactories): void {
  adapterRegistry.register(kind, factories);
}

/** Repositories from the process-wide registry, adapters selected per module by `env`. */
export function getRepositories(env: Env = processEnv()): Repositories {
  return adapterRegistry.getRepositories(env);
}
