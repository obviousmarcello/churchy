import type { SaveResult } from "@/server/music/form-state";
import type { PolicyResult } from "@/server/policy";
import type { QuickItemInput } from "@/lib/music/projection/quick-items";
import * as server from "./actions";
import * as eventServer from "./event-actions";

export type {
  ItemsEditorPart,
  ItemsEditorPartsDTO,
  ReorderResult,
  StartBlockResult,
} from "./actions";
export type { ProjectionConnectionDTO } from "@/server/music/models/projections";

// The server actions of the projection are wrapped by `withPolicy` and answer `{ ok, value }` (or a
// denial). The controller wants the value: a denied action gives what a failed load gives.

async function run<T, D>(call: Promise<PolicyResult<T>>, denied: D): Promise<T | D> {
  const outcome = await call;
  return outcome.ok ? outcome.value : denied;
}

const DENIED: SaveResult = { status: "error", message: "" };

export const eventProjectionAction = (eventId: string) =>
  run(server.eventProjectionAction(eventId), undefined);
export const eventProjectionBlocksAction = (eventId: string) =>
  run(server.eventProjectionBlocksAction(eventId), undefined);
export const projectionControllerOpenAction = (eventId: string, controllerId: string) =>
  run(server.projectionControllerOpenAction(eventId, controllerId), false);
export const projectionControllerClosedAction = (eventId: string, controllerId: string) =>
  run(server.projectionControllerClosedAction(eventId, controllerId), undefined);
export const eventProjectionConnectionAction = (eventId: string) =>
  run(server.eventProjectionConnectionAction(eventId), undefined);
export const setEventThemeAction = (eventId: string, themeId: string | null) =>
  run(server.setEventThemeAction(eventId, themeId), DENIED);
export const setItemThemeAction = (eventId: string, itemKey: string, themeId: string | null) =>
  run(server.setItemThemeAction(eventId, itemKey, themeId), DENIED);
export const startEventBlockAction = (eventId: string, key: string, restart: boolean) =>
  run(server.startEventBlockAction(eventId, key, restart), {
    status: "error" as const,
    message: "",
  });
export const reorderEventItemsAction = (eventId: string, setlistId: string, keys: string[]) =>
  run(server.reorderEventItemsAction(eventId, setlistId, keys), {
    status: "error" as const,
    message: "",
  });
export const addQuickItemAction = (
  eventId: string,
  afterKey: string | null,
  key: string,
  item: QuickItemInput,
) => run(eventServer.addQuickItemAction(eventId, afterKey, key, item), DENIED);
export const removeQuickItemAction = (eventId: string, key: string) =>
  run(eventServer.removeQuickItemAction(eventId, key), DENIED);
export const eventLiveTopicAction = (eventId: string) =>
  run(eventServer.eventLiveTopicAction(eventId), undefined);
export const listRehearsalSongsAction = (arrangementIds: string[]) =>
  run(server.listRehearsalSongsAction(arrangementIds), {
    status: "error" as const,
    message: "",
  });
export const listQuickAddCatalogAction = () =>
  run(server.listQuickAddCatalogAction(), { status: "error" as const, message: "" });
export const eventItemsEditorAction = (eventId: string, parts: unknown) =>
  run(server.eventItemsEditorAction(eventId, parts), undefined);
