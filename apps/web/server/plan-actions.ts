"use server";

import { changePlan } from "@/server/plan-admin";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { getRequestContext } from "@/server/session";

/** Plan change (D-87): the owner's call, like the domain and the site's legal data. */
export const changePlanAction = withPolicy(
  "site.domain.manage",
  async (_scope: PolicyScope, _planKey: string) => {
    const { tenantId } = await getRequestContext();
    return tenantId === undefined ? null : { tenantId };
  },
  (scope, planKey: string) => changePlan(scope, planKey),
);
