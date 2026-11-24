import type {
  EntitlementSources,
  ModuleKey,
  Plan,
  WorkspaceModuleKey,
  WsTier,
} from "@churchy/contracts";

/**
 * Plans & entitlements (D-87, SDD §19.1). `entitlements()` is the **only** place that reads what a
 * plan includes: the module registry, the domain settings, the media quota, user invitations and
 * the workspace tiers all ask it. Nothing else compares plan keys (`plans.test.ts` scans for it).
 */

export interface Entitlements {
  /** Identity of the active plans, to mark the current one in the catalog (not a feature check). */
  readonly websitePlanKey: string;
  readonly workspacePlanKey: string | null;
  /** Display names of the active plans (platform data, not UI text). */
  readonly websitePlanName: string;
  readonly workspacePlanName: string | null;
  readonly customDomain: boolean;
  readonly storageGb: number;
  /** `null`: unlimited. */
  readonly maxEditors: number | null;
  /** Free tier shows the small *Készült a Churchy-vel* credit in the footer. */
  readonly footerCredit: boolean;
  readonly modules: readonly ModuleKey[];
  readonly workspaceAllowed: boolean;
  readonly wsTier: WsTier;
  readonly wsModules: readonly WorkspaceModuleKey[];
  /** `null`: no workspace. */
  readonly maxWorkspaceUsers: number | null;
  /** AI song-rights researches per calendar month (music module); 0: none. */
  readonly musicResearchPerMonth: number;
  /** A diocesan bulk deal covers the church (billing runs through the organization). */
  readonly coveredByDeal: boolean;
}

/** Merges the church's website plan, workspace add-on and diocesan deal (SDD §19.1). */
export function entitlements(sources: EntitlementSources): Entitlements {
  const web = sources.websitePlan.entitlements;
  const ws = sources.workspacePlan?.entitlements ?? null;
  // The workspace is an add-on of the paid plan; without that right it stays off (downgrade).
  const workspace = web.workspaceAllowed ? ws : null;
  const dealKeys = sources.deal?.planKeys ?? [];
  return {
    websitePlanKey: sources.websitePlan.key,
    workspacePlanKey: workspace ? (sources.workspacePlan?.key ?? null) : null,
    websitePlanName: sources.websitePlan.name,
    workspacePlanName: workspace ? (sources.workspacePlan?.name ?? null) : null,
    customDomain: web.customDomain,
    storageGb: web.storageGb,
    maxEditors: web.maxEditors,
    footerCredit: web.footerCredit,
    modules: web.modules,
    workspaceAllowed: web.workspaceAllowed,
    wsTier: workspace?.wsTier ?? "none",
    wsModules: workspace?.wsModules ?? [],
    maxWorkspaceUsers: workspace?.maxWorkspaceUsers ?? null,
    musicResearchPerMonth: workspace?.musicResearchPerMonth ?? 0,
    coveredByDeal:
      sources.deal !== null &&
      (dealKeys.includes(sources.websitePlan.key) ||
        (workspace !== null &&
          sources.workspacePlan !== null &&
          dealKeys.includes(sources.workspacePlan.key))),
  };
}

/** Whether the plan includes the website module. */
export function includesModule(e: Entitlements, key: ModuleKey): boolean {
  return e.modules.includes(key);
}

/** Whether the plan includes the workspace module. */
export function includesWorkspaceModule(e: Entitlements, key: WorkspaceModuleKey): boolean {
  return e.wsModules.includes(key);
}

// ---------------------------------------------------------------------------------------------
// Limits (D-87 AC2): Hungarian warning from 90 %, block at 100 %
// ---------------------------------------------------------------------------------------------

export const LIMIT_WARNING_RATIO = 0.9;

export type LimitLevel = "ok" | "warning" | "full" | "unlimited";

export interface LimitStatus {
  readonly used: number;
  /** `null`: unlimited. */
  readonly cap: number | null;
  readonly level: LimitLevel;
  /** Whether one more unit (invitation, upload) may be added. */
  readonly allowsMore: boolean;
  /** Share of the cap used, 0–100 (0 when unlimited). */
  readonly percent: number;
}

export function limitStatus(used: number, cap: number | null): LimitStatus {
  if (cap === null) return { used, cap, level: "unlimited", allowsMore: true, percent: 0 };
  const level: LimitLevel =
    used >= cap ? "full" : used >= cap * LIMIT_WARNING_RATIO ? "warning" : "ok";
  return {
    used,
    cap,
    level,
    allowsMore: level !== "full",
    percent: cap === 0 ? 100 : Math.min(100, Math.round((used / cap) * 100)),
  };
}

// ---------------------------------------------------------------------------------------------
// Plan changes (data-driven: the chosen plan's `kind` and entitlements decide, never its key)
// ---------------------------------------------------------------------------------------------

export interface PlanChange {
  readonly planKey?: string;
  readonly wsTier?: WsTier;
}

/**
 * The tenant fields a plan choice changes. Choosing a website plan that does not allow the
 * workspace also switches the workspace off (downgrade: nothing is deleted, modules are hidden).
 */
export function planChangeFor(plan: Plan): PlanChange {
  if (plan.kind === "workspace") return { wsTier: plan.entitlements.wsTier };
  return plan.entitlements.workspaceAllowed
    ? { planKey: plan.key }
    : { planKey: plan.key, wsTier: "none" };
}

/** The plan is above `current` in price (an upgrade), judged by the monthly price. */
export function isUpgrade(plan: Plan, current: Plan | null): boolean {
  return current === null || plan.priceMonthly > current.priceMonthly;
}
