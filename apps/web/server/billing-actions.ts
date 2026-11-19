"use server";

import type { FormState } from "@/lib/admin/content-form";
import { saveBillingDetails } from "@/server/billing-admin";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { getRequestContext } from "@/server/session";

/** Saving the billing details (D-88): the owner's call, like the plan. No payment code here. */
export const saveBillingDetailsAction = withPolicy(
  "site.domain.manage",
  async (_scope: PolicyScope, _previous: FormState, _form: FormData) => {
    const { tenantId } = await getRequestContext();
    return tenantId === undefined ? null : { tenantId };
  },
  (scope, _previous: FormState, form: FormData) => saveBillingDetails(scope, form),
);
