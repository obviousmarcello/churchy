/**
 * Hungarian demo dataset (D-91 [UI], issue #16): 3 churches + 1 diocese, entirely fictitious.
 *
 * Every date is relative to the injected `now` in Europe/Budapest, so the demo always looks
 * current. Real logic is used where it exists: `@churchy/schedule` resolves the occurrences,
 * `@churchy/calendar` supplies the feasts and public holidays, `@churchy/hu` formats names.
 */
import { emptyDataset, type MockDataset } from "../dataset";
import { buildChurch } from "./church";
import { createClock } from "./clock";
import { buildPlatformAndDiocese } from "./platform";
import { baptSpec } from "./specs/bapt";
import { refSpec } from "./specs/ref";
import { rkSpec } from "./specs/rk";

export type { Persona } from "./types";

/** Tenant ids of the demo (stable). */
export const DEMO_TENANT_IDS = {
  catholic: rkSpec.tenant.id,
  reformed: refSpec.tenant.id,
  baptist: baptSpec.tenant.id,
  placeholderParishes: ["t-alsoliget", "t-felsoliget"],
} as const;

/** Organization id of the demo diocese. */
export const DEMO_ORG_ID = "org-dunavolgyi";

export interface DemoPersonas {
  /** tenant id → persona → user id (Látogató has no user). */
  tenants: Record<string, Record<string, string>>;
  /** Diocesan users: `egyhazmegyeiHr` is the D-92 persona. */
  org: Record<string, string>;
}

const ARRAY_KEYS = Object.keys(emptyDataset()) as (keyof MockDataset)[];

function mergeInto(target: MockDataset, source: MockDataset): void {
  for (const key of ARRAY_KEYS) {
    (target[key] as unknown[]).push(...(source[key] as unknown[]));
  }
}

/** The dataset plus the persona → user mapping for the demo role switcher (D-92). */
export function createDemoDatasetWithPersonas(now: Date): {
  dataset: MockDataset;
  personas: DemoPersonas;
} {
  const c = createClock(now);
  const emails = new Set<string>();
  const dataset = emptyDataset();
  const tenants: DemoPersonas["tenants"] = {};

  const rk = buildChurch(rkSpec, c, emails);
  const ref = buildChurch(refSpec, c, emails);
  const bapt = buildChurch(baptSpec, c, emails);
  tenants[rkSpec.tenant.id] = rk.personas;
  tenants[refSpec.tenant.id] = ref.personas;
  tenants[baptSpec.tenant.id] = bapt.personas;

  const platform = buildPlatformAndDiocese(
    c,
    {
      tenantId: rkSpec.tenant.id,
      tulajdonosUserId: rk.personas["tulajdonos"] as string,
      vezetoUserId: rk.personas["vezeto"] as string,
      delegatedCategoryKeys: ["munkaugyi-kerdes", "bizalmas-bejelentes"],
    },
    emails,
  );

  for (const part of [platform.ds, rk.ds, ref.ds, bapt.ds]) mergeInto(dataset, part);
  return { dataset, personas: { tenants, org: platform.personas } };
}

/** Builds the full demo dataset relative to `now` (Europe/Budapest). */
export function createDemoDataset(now: Date): MockDataset {
  return createDemoDatasetWithPersonas(now).dataset;
}
