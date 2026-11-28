"use client";

import { useI18n } from "@/i18n/music/client";

/** What `withPolicy()` returns (apps/web/server/policy.ts); repeated here for client code. */
type PolicyResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly status: 403 | 404 };

/**
 * The music app's form actions return their form state; Churchy wraps every server action with
 * `withPolicy()` (D-05), which returns `{ ok, value }` or a denial. This gives the copied forms
 * their old signature back: the value, or an error state with the "forbidden" text on a denial.
 */
export function usePolicyAction<S, Args extends unknown[]>(
  action: (...args: Args) => Promise<PolicyResult<S>>,
): (...args: Args) => Promise<S> {
  const { m } = useI18n();
  return async (...args) => {
    const result = await action(...args);
    if (result.ok) return result.value;
    return { status: "error", message: m.common.errors.forbidden, fieldErrors: {} } as S;
  };
}

/** For a non-hook call site: unwraps a policy result, or throws on a denial. */
export async function unwrapPolicy<T>(result: Promise<PolicyResult<T>>): Promise<T> {
  const value = await result;
  if (!value.ok) throw new Error(`music: denied (${value.status})`);
  return value.value;
}
