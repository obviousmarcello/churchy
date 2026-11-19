"use server";

import type { FormState } from "@/lib/admin/content-form";
import { deleteRoom, saveBlock, saveRoom } from "@/server/room-admin";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";
import { getRequestContext } from "@/server/session";

/**
 * Mutations of the room catalog admin (D-60/D-61). The catalog is church configuration like the
 * locations it hangs off, so it needs `location.manage`.
 */

async function tenant<Args extends unknown[]>(_scope: PolicyScope, ..._args: Args) {
  const { tenantId } = await getRequestContext();
  return tenantId === undefined ? null : { tenantId };
}
const forSave = tenant<[previous: FormState, form: FormData]>;
const forUpdate = tenant<[id: string, previous: FormState, form: FormData]>;
const forId = tenant<[id: string]>;

export const createRoom = withPolicy(
  "location.manage",
  forSave,
  (scope, _previous: FormState, form: FormData) => saveRoom(scope, null, form),
);
export const updateRoom = withPolicy(
  "location.manage",
  forUpdate,
  (scope, id: string, _previous: FormState, form: FormData) => saveRoom(scope, id, form),
);
export const deleteRoomAction = withPolicy("location.manage", forId, (scope, id: string) =>
  deleteRoom(scope, id),
);
export const createServiceBlock = withPolicy(
  "location.manage",
  forSave,
  (scope, _previous: FormState, form: FormData) => saveBlock(scope, null, form),
);
export const updateServiceBlock = withPolicy(
  "location.manage",
  forUpdate,
  (scope, id: string, _previous: FormState, form: FormData) => saveBlock(scope, id, form),
);
export const deleteServiceBlockAction = withPolicy(
  "location.manage",
  forId,
  async (scope, id: string): Promise<"ok" | "notFound"> => {
    try {
      await (await getRequestRepositories()).rooms.deleteServiceBlock(scope.ctx, id);
      return "ok";
    } catch {
      return "notFound";
    }
  },
);
