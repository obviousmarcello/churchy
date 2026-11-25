import "server-only";

import type { MusicAreaGrant, MusicAreaRole } from "@churchy/policy";

import { getMusicSupabase } from "./db";

/**
 * The roles that the music areas give to a user (`service_area_roles` of the areas the user
 * belongs to, ancestors included: a member of a group counts as a member of the groups above it).
 * `can()` applies them to music actions checked with an `areaIds` context (docs/music-merge PLAN §18).
 */
export async function loadAreaGrants(userId: string): Promise<MusicAreaGrant[]> {
  const supabase = await getMusicSupabase();
  const areas = await supabase.rpc("member_area_ids", { p_user_id: userId });
  if (areas.error) throw new Error(`member_area_ids: ${areas.error.message}`);
  const rows = (areas.data ?? []) as (string | { id?: string; member_area_ids?: string })[];
  const ids = rows
    .map((row) => (typeof row === "string" ? row : (row.id ?? row.member_area_ids)))
    .filter((id): id is string => typeof id === "string");
  if (ids.length === 0) return [];
  const roles = await supabase
    .from("service_area_roles")
    .select("area_id, role")
    .in("area_id", ids);
  if (roles.error) throw new Error(`service_area_roles: ${roles.error.message}`);
  const byArea = new Map<string, MusicAreaRole[]>();
  for (const row of (roles.data ?? []) as { area_id: string; role: MusicAreaRole }[]) {
    byArea.set(row.area_id, [...(byArea.get(row.area_id) ?? []), row.role]);
  }
  return [...byArea].map(([areaId, list]) => ({ areaId, roles: list }));
}
