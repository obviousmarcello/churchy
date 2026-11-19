import { can } from "@churchy/policy";
import { demoModeEnabled } from "@/lib/demo/flag";
import { getActor, getRequestContext } from "@/server/session";

/**
 * Who may run the first-setup wizard's import (D-34). The public entry `/uj-egyhaz` exists only in
 * demo mode (a prospective church has no account yet); outside it the wizard lives in the admin
 * (`/admin/inditas`) and the actor needs the right to manage the site's modules — decided by
 * `can()`, as everywhere else. The import is read-only (it creates nothing), so it is not a
 * mutation and needs no policy wrapper.
 */
export async function canRunSetupImport(): Promise<boolean> {
  if (demoModeEnabled()) return true;
  const [actor, context] = await Promise.all([getActor(), getRequestContext()]);
  return context.tenantId !== undefined && can(actor, "site.modules.manage", context);
}
