import { formatDateLong, formatTime } from "@churchy/hu";
import type { Ctx, Repositories } from "@churchy/contracts";
import { foldForSearch } from "@churchy/contracts";
import type { Action, ResourceByAction } from "@churchy/policy";
import { canServer } from "@/lib/permissions/server";
import { publishState, type PublishState } from "@/lib/admin/content";
import { canOpenAdminSection, getAdminCtx } from "@/server/admin";
import { getRequestNow } from "@/server/clock";
import { getRequestRepositories } from "@/server/repositories";
import { getRequestContext } from "@/server/session";

/** Shared server helpers of the content admin screens (D-20, D-21). */

export interface AdminData {
  ctx: Ctx;
  repos: Repositories;
  now: Date;
}

/** Repositories, the actor's ctx and the request's clock (the demo clock in demo mode). */
export async function adminData(): Promise<AdminData> {
  const [ctx, repos, now] = await Promise.all([
    getAdminCtx(),
    getRequestRepositories(),
    getRequestNow(),
  ]);
  return { ctx, repos, now };
}

/** Whether the actor may open the admin section (`can()` through the nav); gate before loading. */
export const mayOpen = canOpenAdminSection;

/** `can()` for a tenant-wide action in the request's church. */
export async function canInChurch<A extends Action>(action: A): Promise<boolean> {
  const context = await getRequestContext();
  if (context.tenantId === undefined) return false;
  return canServer(action, { tenantId: context.tenantId } as ResourceByAction[A]);
}

/** `2026. november 20., péntek, 18:00` in Europe/Budapest. */
export function whenText(iso: string): string {
  const date = new Date(iso);
  return `${formatDateLong(date)}, ${formatTime(date)}`;
}

export type StateFilter = "" | "draft" | "scheduled" | "published" | "cancelled";

/** Query-string filters of the list screens: free text and state. */
export function parseFilters(params: Record<string, string | string[] | undefined>): {
  q: string;
  state: StateFilter;
} {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const state = one(params["allapot"]);
  return {
    q: one(params["q"]).trim(),
    state:
      state === "draft" || state === "scheduled" || state === "published" || state === "cancelled"
        ? state
        : "",
  };
}

/** Accent- and case-insensitive match of any of the texts. */
export function matches(q: string, ...texts: (string | null | undefined)[]): boolean {
  if (q === "") return true;
  const needle = foldForSearch(q);
  return texts.some((t) => t != null && foldForSearch(t).includes(needle));
}

/** The list filter state: "published" includes expired items (they were published once). */
export function matchesState(
  filter: StateFilter,
  item: { status: string; publishedAt: string | null; expiresAt?: string | null },
  now: Date,
): boolean {
  if (filter === "") return true;
  const state: PublishState = publishState(item, now);
  return filter === "published" ? state === "published" || state === "expired" : state === filter;
}
