import { afterEach, describe, expect, it } from "vitest";
import type { AnnouncementRepo } from "./modules/announcements";
import type { Repositories } from "./registry";
import {
  AdapterRegistry,
  DATA_MODULES,
  adapterEnvVar,
  adapterRegistry,
  getRepositories,
  processEnv,
  registerAdapter,
  selectAdapter,
} from "./registry";

const fakeAnnouncements = (label: string) => ({ label }) as unknown as AnnouncementRepo;

describe("adapter selection", () => {
  it("derives one env var per module", () => {
    expect(adapterEnvVar("news")).toBe("DATA_ADAPTER_NEWS");
    expect(adapterEnvVar("hr")).toBe("DATA_ADAPTER_HR");
    expect(adapterEnvVar("servicePlans")).toBe("DATA_ADAPTER_SERVICE_PLANS");
    const vars = DATA_MODULES.map(adapterEnvVar);
    expect(new Set(vars).size).toBe(DATA_MODULES.length);
  });

  it("defaults to mock and accepts mock|db (case/space tolerant)", () => {
    expect(selectAdapter("news", {})).toBe("mock");
    expect(selectAdapter("news", { DATA_ADAPTER_NEWS: "" })).toBe("mock");
    expect(selectAdapter("news", { DATA_ADAPTER_NEWS: " DB " })).toBe("db");
    expect(selectAdapter("hr", { DATA_ADAPTER_NEWS: "db" })).toBe("mock");
  });

  it("rejects unknown adapter names", () => {
    expect(() => selectAdapter("news", { DATA_ADAPTER_NEWS: "postgres" })).toThrow(
      /DATA_ADAPTER_NEWS="postgres" is invalid/,
    );
  });

  it("reads process.env when available", () => {
    expect(processEnv()).toBe((globalThis as unknown as { process: { env: unknown } }).process.env);
  });
});

describe("AdapterRegistry", () => {
  it("resolves each module with the adapter configured for it", () => {
    const registry = new AdapterRegistry();
    registry.register("mock", { announcements: () => fakeAnnouncements("mock") });
    registry.register("db", { announcements: () => fakeAnnouncements("db") });
    expect(registry.resolve("announcements", {})).toEqual({ label: "mock" });
    expect(registry.resolve("announcements", { DATA_ADAPTER_ANNOUNCEMENTS: "db" })).toEqual({
      label: "db",
    });
    expect(registry.registeredModules("mock")).toEqual(["announcements"]);
    expect(registry.registeredModules("db")).toEqual(["announcements"]);
  });

  it("merges registrations of the same kind", () => {
    const registry = new AdapterRegistry();
    registry.register("mock", { announcements: () => fakeAnnouncements("a") });
    registry.register("mock", { locations: () => ({}) as Repositories["locations"] });
    expect(registry.registeredModules("mock")).toEqual(["locations", "announcements"]);
    registry.clear();
    expect(registry.registeredModules("mock")).toEqual([]);
  });

  it("fails clearly when the selected adapter has no factory", () => {
    const registry = new AdapterRegistry();
    registry.register("mock", { announcements: () => fakeAnnouncements("mock") });
    expect(() => registry.resolve("announcements", { DATA_ADAPTER_ANNOUNCEMENTS: "db" })).toThrow(
      /No "db" adapter registered for module "announcements"/,
    );
  });

  it("resolves repositories lazily and caches them per object", () => {
    const registry = new AdapterRegistry();
    let calls = 0;
    registry.register("mock", {
      announcements: () => {
        calls += 1;
        return fakeAnnouncements("lazy");
      },
    });
    const repos = registry.getRepositories({});
    expect(calls).toBe(0);
    expect(Object.keys(repos)).toEqual([...DATA_MODULES]);
    expect(repos.announcements).toBe(repos.announcements);
    expect(calls).toBe(1);
    expect(() => repos.hr).toThrow(/No "mock" adapter registered for module "hr"/);
  });
});

describe("process-wide registry", () => {
  afterEach(() => adapterRegistry.clear());

  it("registerAdapter + getRepositories use the shared registry", () => {
    registerAdapter("mock", { announcements: () => fakeAnnouncements("global") });
    expect(getRepositories({}).announcements).toEqual({ label: "global" });
  });
});
