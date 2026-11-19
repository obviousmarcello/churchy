"use server";

import type { FormState } from "@/lib/admin/content-form";
import { saveModules } from "@/server/module-admin";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { getRequestContext } from "@/server/session";

/** Saving the module toggles (D-25): *Megjelenés, modulok, menü, kifejezések* — owner and admin. */
export const saveModulesAction = withPolicy(
  "site.modules.manage",
  async (_scope: PolicyScope, _previous: FormState, _form: FormData) => {
    const { tenantId } = await getRequestContext();
    return tenantId === undefined ? null : { tenantId };
  },
  (scope, _previous: FormState, form: FormData) => saveModules(scope, form),
);
