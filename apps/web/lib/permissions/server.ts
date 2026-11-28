import { can } from "@churchy/policy";
import type { Action, ResourceByAction } from "@churchy/policy";
import { getActor } from "@/server/session";

export { can, explain } from "@churchy/policy";

/** `can()` for the current request's actor; usable in React Server Components. */
export async function canServer<A extends Action>(
  action: A,
  resource: ResourceByAction[A],
): Promise<boolean> {
  return can(await getActor(), action, resource);
}
