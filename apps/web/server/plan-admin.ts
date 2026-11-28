import type { Ctx, Media, Plan, Repositories, Subscription } from "@churchy/contracts";
import { activeEditors, activeWorkspaceUsers } from "@/lib/admin/users";
import {
  isUpgrade,
  limitStatus,
  planChangeFor,
  type Entitlements,
  type LimitStatus,
} from "@/lib/plans/entitlements";
import { tierStatus, type TierStatus } from "@/lib/workspace/plan-tier";
import { adminData } from "@/server/content-admin";
import { entitlementsFor } from "@/server/plans";
import type { AuthorizedScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";

/** Data and mutation of the plan overview (D-87). Feature checks go through `entitlements()`. */

const GB = 1_000_000_000;

export interface PlanView {
  ent: Entitlements;
  /** The whole plan catalog, website plans first, then workspace add-ons, cheapest first. */
  plans: Plan[];
  current: { website: Plan | null; workspace: Plan | null };
  storage: LimitStatus;
  editors: LimitStatus;
  workspaceUsers: TierStatus;
  subscription: Subscription | null;
}

async function totalMediaBytes(repos: Repositories, ctx: Ctx): Promise<number> {
  let bytes = 0;
  for (let page = 1; ; page += 1) {
    const result = await repos.media.list(ctx, { page, pageSize: 200 });
    bytes += result.items.reduce((sum: number, m: Media) => sum + m.bytes, 0);
    if (page * result.pageSize >= result.total || result.items.length === 0) return bytes;
  }
}

export async function getPlanView(): Promise<PlanView> {
  const { ctx, repos } = await adminData();
  const [ent, catalog, members, bytes, subscriptions] = await Promise.all([
    entitlementsFor(ctx),
    repos.billing.listPlans(ctx),
    repos.members.list(ctx),
    totalMediaBytes(repos, ctx),
    repos.billing.listSubscriptions(ctx),
  ]);
  const plans = [...catalog].sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "website" ? -1 : 1) || a.priceMonthly - b.priceMonthly,
  );
  const byKey = (key: string | null) => plans.find((p) => p.key === key) ?? null;
  return {
    ent,
    plans,
    current: { website: byKey(ent.websitePlanKey), workspace: byKey(ent.workspacePlanKey) },
    storage: limitStatus(bytes / GB, ent.storageGb),
    editors: limitStatus(activeEditors(members), ent.maxEditors),
    workspaceUsers: tierStatus(ent.wsTier, activeWorkspaceUsers(members)),
    subscription: subscriptions.find((s) => s.status !== "cancelled") ?? null,
  };
}

/** Whether `plan` is an upgrade over the church's current plan of the same kind. */
export function upgradeOver(view: PlanView, plan: Plan): boolean {
  return isUpgrade(plan, plan.kind === "website" ? view.current.website : view.current.workspace);
}

export type PlanChangeOutcome = "ok" | "notFound" | "notAllowed" | "covered";

/**
 * Switches the church's plan (demo: at once, no payment; production: after the payment is
 * confirmed, within 60 s — D-87 AC4). Nothing is deleted: paid modules are hidden, the custom
 * domain redirects, uploads are blocked above the quota (D-87 AC3).
 */
export async function changePlan(
  scope: AuthorizedScope<"site.domain.manage">,
  planKey: string,
): Promise<PlanChangeOutcome> {
  const repos = await getRequestRepositories();
  const [ent, catalog] = await Promise.all([
    entitlementsFor(scope.ctx),
    repos.billing.listPlans(scope.ctx),
  ]);
  const plan = catalog.find((p) => p.key === planKey);
  if (plan === undefined) return "notFound";
  // A diocesan deal bills the parish through the organization: no self-service change.
  if (ent.coveredByDeal) return "covered";
  if (plan.kind === "workspace" && !ent.workspaceAllowed) return "notAllowed";

  const change = planChangeFor(plan);
  await repos.tenants.update(scope.ctx, change);

  // Keep the subscriptions the billing screen shows in line with the plan (same kind only).
  const kindOf = (key: string) => catalog.find((p) => p.key === key)?.kind;
  for (const sub of await repos.billing.listSubscriptions(scope.ctx)) {
    if (sub.status === "cancelled") continue;
    const kind = kindOf(sub.planKey);
    if (kind === plan.kind) {
      await repos.billing.updateSubscription(
        scope.ctx,
        sub.id,
        plan.priceMonthly === 0 ? { status: "cancelled" } : { planKey: plan.key, status: "active" },
      );
    } else if (kind === "workspace" && change.wsTier === "none") {
      await repos.billing.updateSubscription(scope.ctx, sub.id, { status: "cancelled" });
    }
  }
  console.info(
    JSON.stringify({ type: "audit.plan.changed", tenantId: scope.context.tenantId ?? null }),
  );
  return "ok";
}
